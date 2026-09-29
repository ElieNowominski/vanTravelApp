#!/usr/bin/env node
/**
 * Télécharge les jeux de données publics d'une région et les écrit en GeoJSON statique
 * dans public/data/generated/. Lancé en local (npm run data) et par GitHub Actions avant le build.
 *
 * Sources : DOC (ArcGIS Hub), OpenStreetMap (Overpass). Aucune clé.
 * Tolérant : un jeu qui échoue est signalé, les autres sont écrits ; --strict rend l'échec fatal.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = process.argv.slice(2);
const strict = args.includes("--strict");
const regionId = args.find((a) => !a.startsWith("--")) ?? "nz-south";
const outDir = path.join(root, "public", "data", "generated");

const DOC_CAMPSITES = [
  "https://services1.arcgis.com/3JjYDyG3oajxU6HO/arcgis/rest/services/DOC_Campsites/FeatureServer/0",
  "https://mapserver.doc.govt.nz/arcgis/rest/services/DOCMaps/DOCMaps/MapServer/1",
];
const DOC_FREEDOM = [
  "https://services1.arcgis.com/3JjYDyG3oajxU6HO/arcgis/rest/services/DOCFreedomCamping/FeatureServer/0",
  "https://mapserver.doc.govt.nz/arcgis/rest/services/DOCMaps/DOCMaps/MapServer/2",
];
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const CAMPSITE_FIELDS =
  "name,place,region,campsiteCategory,bookable,free,facilities,access,staticLink,introduction,numberOfUnpoweredSites,numberOfPoweredSites,dogsAllowed";
const FREEDOM_FIELDS =
  "Name,Site_Category_Type,Site_Category_Code,Condition_1,Condition_2,Status,Location,Operations_District";
const USER_AGENT = "vantravel-app/0.2 (+https://github.com/ElieNowominski/vanTravelApp)";

async function main() {
  const region = JSON.parse(await fs.readFile(path.join(root, "src", "data", "regions", `${regionId}.json`), "utf8"));
  await fs.mkdir(outDir, { recursive: true });
  console.log(`Région ${region.id} · bbox ${JSON.stringify(region.bbox)}`);

  const jobs = [
    ["doc-campsites", () => fetchFirstAvailable(DOC_CAMPSITES, CAMPSITE_FIELDS, region.bbox)],
    ["osm-camps", () => fetchOsmCamps(region.bbox)],
    ["doc-freedom", () => fetchFirstAvailable(DOC_FREEDOM, FREEDOM_FIELDS, region.bbox)],
  ];

  const manifest = { regionId: region.id, generatedAt: new Date().toISOString(), datasets: {} };
  let failed = 0;
  for (const [name, run] of jobs) {
    const started = Date.now();
    try {
      const fc = await run();
      await fs.writeFile(path.join(outDir, `${name}.geojson`), JSON.stringify(fc));
      manifest.datasets[name] = { count: fc.features.length, ok: true };
      console.log(`✓ ${name}: ${fc.features.length} entités (${Math.round((Date.now() - started) / 1000)} s)`);
    } catch (error) {
      failed++;
      manifest.datasets[name] = { ok: false, error: String(error?.message ?? error) };
      console.error(`✗ ${name}: ${error?.message ?? error}`);
    }
  }
  await fs.writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  if (failed && strict) process.exit(1);
}

async function fetchArcGisLayer(layerUrl, outFields, bbox) {
  const features = [];
  let offset = 0;
  const pageSize = 2000;
  for (let i = 0; i < 8; i++) {
    const params = new URLSearchParams({
      where: "1=1",
      outFields,
      outSR: "4326",
      inSR: "4326",
      geometryType: "esriGeometryEnvelope",
      spatialRel: "esriSpatialRelIntersects",
      geometry: JSON.stringify({ ...bbox, spatialReference: { wkid: 4326 } }),
      f: "geojson",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
    });
    const res = await fetch(`${layerUrl}/query?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`ArcGIS ${res.status} ${layerUrl}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message ?? "ArcGIS error");
    const page = data.features ?? [];
    features.push(...page);
    const exceeded = Boolean(data.exceededTransferLimit || data.properties?.exceededTransferLimit);
    if (!exceeded && page.length < pageSize) break;
    offset += page.length;
    if (page.length === 0) break;
  }
  return { type: "FeatureCollection", features };
}

async function fetchFirstAvailable(urls, outFields, bbox) {
  const errors = [];
  for (const url of urls) {
    try {
      return await fetchArcGisLayer(url, outFields, bbox);
    } catch (error) {
      errors.push(`${url}: ${error?.message ?? error}`);
    }
  }
  throw new Error(errors.join(" | "));
}

async function fetchOsmCamps(bbox) {
  const { ymin, xmin, ymax, xmax } = bbox;
  const query = `
    [out:json][timeout:75];
    (
      nwr["tourism"="camp_site"](${ymin},${xmin},${ymax},${xmax});
      nwr["tourism"="caravan_site"](${ymin},${xmin},${ymax},${xmax});
      node["amenity"="sanitary_dump_station"](${ymin},${xmin},${ymax},${xmax});
    );
    out center tags;
  `;
  const data = await fetchOverpass(query);
  const features = [];
  for (const el of data.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const tags = el.tags ?? {};
    const isDump = tags.amenity === "sanitary_dump_station";
    const name =
      tags.name ||
      tags.operator ||
      (isDump ? "Dump station" : tags.tourism === "caravan_site" ? "Holiday park" : "Camping");
    features.push({
      type: "Feature",
      id: `osm-${el.type}-${el.id}`,
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        id: `osm-${el.type}-${el.id}`,
        name,
        source: "OSM",
        tourism: tags.tourism ?? "",
        amenity: tags.amenity ?? "",
        operator: tags.operator ?? "",
        website: tags.website ?? tags.url ?? "",
        fee: tags.fee ?? "",
        drinking_water: tags.drinking_water ?? "",
        electricity: tags.electricity ?? tags.power_supply ?? "",
        toilets: tags.toilets ?? "",
        shower: tags.shower ?? "",
        sanitary_dump_station: tags.sanitary_dump_station ?? "",
        kind: isDump ? "dump" : "camp",
        notes: tags.description ?? "",
      },
    });
  }
  return {
    type: "FeatureCollection",
    features,
    properties: { source: "OpenStreetMap", count: features.length },
  };
}

async function fetchOverpass(query) {
  const errors = [];
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) throw new Error(`${url} ${res.status}`);
      return await res.json();
    } catch (error) {
      errors.push(error?.message ?? String(error));
    }
  }
  throw new Error(errors.join(" | "));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
