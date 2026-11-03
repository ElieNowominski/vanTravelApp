import { describe, expect, it } from "vitest";
import reference from "../../fixtures/reference-scandinavie.json";
import {
  POI_BACKOFF_MS,
  POI_CELL_TTL_MS,
  POI_MAX_CELLS,
  POI_MIN_ZOOM,
  boundsOfCells,
  cellBounds,
  cellOf,
  cellsForBounds,
  cellsAlongLine,
  dayTrackLine,
  groupCells,
  groupRequest,
  isCellFresh,
  locateOnLine,
  mergePois,
  overpassBboxQuery,
  parseOverpass,
  planCorridor,
  planViewport,
  poiCategory,
  poiWait,
  poisAlongLine,
  poisToGeoJSON,
  simplifyLine,
  routeCaption,
  splitByCell,
  viewportStatusText,
  withinCorridor,
  type Poi,
} from "@/lib/poi";
import type { Leg } from "@/lib/types";

// Forme réelle d'une réponse du serveur public (Bergen, 3 nov. 2026), réduite.
const bergenResponse = {
  version: 0.6,
  elements: [
    { type: "node", id: 1759614150, lat: 60.3975884, lon: 5.3330296, tags: { amenity: "drinking_water", name: "Hesten" } },
    {
      type: "way",
      id: 26341201,
      center: { lat: 60.3707, lon: 5.4381 },
      tags: { tourism: "caravan_site", name: "Bergen Bobilsenter", fee: "yes", sanitary_dump_station: "yes", wheelchair: "no" },
    },
    { type: "node", id: 42, lat: 60.31, lon: 5.25, tags: { amenity: "sanitary_dump_station" } },
    { type: "relation", id: 7, center: { lat: 60.4, lon: 5.3 }, tags: { tourism: "camp_site", operator: "Statskog" } },
    { type: "node", id: 8, lat: 60.4, lon: 5.3, tags: { amenity: "bench" } },
    { type: "way", id: 9, tags: { tourism: "camp_site" } },
  ],
};

const poi = (id: string, lng: number, lat: number, category: Poi["category"] = "eau"): Poi => ({ id, name: id, category, lng, lat, tags: {} });

describe("requêtes Overpass", () => {
  it("interroge un rectangle avec les quatre catégories et un plafond d'éléments", () => {
    const q = overpassBboxQuery({ west: 5.2, south: 60.3, east: 5.45, north: 60.45 });
    expect(q).toContain("[out:json]");
    expect(q).toContain("[bbox:60.3,5.2,60.45,5.45]");
    expect(q).toContain('nwr["tourism"~"^(camp_site|caravan_site)$"];');
    expect(q).toContain('nwr["amenity"~"^(sanitary_dump_station|water_point|drinking_water)$"];');
    expect(q).toMatch(/out center tags \d+;$/);
  });

});

describe("lecture des réponses", () => {
  it("classe, nomme et identifie les éléments, centre compris pour les chemins et relations", () => {
    const pois = parseOverpass(bergenResponse);
    expect(pois.map((p) => [p.id, p.category, p.name])).toEqual([
      ["osm:n1759614150", "eau", "Hesten"],
      ["osm:w26341201", "aire", "Bergen Bobilsenter"],
      ["osm:n42", "vidange", "Vidange"],
      ["osm:r7", "camping", "Statskog"],
    ]);
    expect(pois[1]).toMatchObject({ lng: 5.4381, lat: 60.3707 });
  });

  it("ne garde que les étiquettes utiles", () => {
    const aire = parseOverpass(bergenResponse)[1];
    expect(aire.tags).toEqual({ tourism: "caravan_site", name: "Bergen Bobilsenter", fee: "yes", sanitary_dump_station: "yes" });
  });

  it("rend une liste vide pour une réponse illisible", () => {
    expect(parseOverpass(null)).toEqual([]);
    expect(parseOverpass({ remark: "runtime error" })).toEqual([]);
  });

  it("reconnaît les catégories", () => {
    expect(poiCategory({ amenity: "water_point" })).toBe("eau");
    expect(poiCategory({ tourism: "hotel" })).toBeNull();
  });

  it("fusionne sans doublon et produit un GeoJSON cliquable", () => {
    const merged = mergePois([poi("a", 1, 1), poi("b", 2, 2)], [{ ...poi("a", 1, 1), name: "A2" }]);
    expect(merged.map((p) => p.name)).toEqual(["A2", "b"]);
    const fc = poisToGeoJSON(parseOverpass(bergenResponse));
    expect(fc.features[1].properties).toMatchObject({ id: "osm:w26341201", poiCategory: "aire", source: "OSM", fee: "yes" });
  });
});

describe("textes", () => {
  it("dit pourquoi la carte ne montre rien", () => {
    expect(viewportStatusText({ scope: "zoom", status: "ok", count: 0 })).toMatch(/Zoomer/);
    expect(viewportStatusText({ scope: "too-wide", status: "ok", count: 0 })).toMatch(/trop grande/);
    expect(viewportStatusText({ scope: "area", status: "offline", count: 3 })).toBe("Hors ligne : 3 points en cache sur cette zone.");
    expect(viewportStatusText({ scope: "area", status: "quota", message: "Plafond du jour atteint", count: 0 })).toBe("Plafond du jour atteint");
    expect(viewportStatusText({ scope: "area", status: "ok", count: 12 })).toBeNull();
  });

  it("situe un point sur la route du jour", () => {
    expect(routeCaption({ offKm: 1.24, alongKm: 33.6 })).toBe("km 34 · à 1,2 km du tracé");
    expect(routeCaption({ offKm: 0.05, alongKm: 0.2 })).toBe("km 0 · au bord de la route");
  });
});

describe("grille du cache", () => {
  it("retrouve la case d'un point et ses bords", () => {
    const key = cellOf(5.33, 60.39);
    const b = cellBounds(key);
    expect(b.west).toBeLessThanOrEqual(5.33);
    expect(b.east).toBeGreaterThan(5.33);
    expect(b.south).toBeLessThanOrEqual(60.39);
    expect(b.north).toBeGreaterThan(60.39);
  });

  it("couvre une zone par ses cases et reforme leur rectangle", () => {
    const cells = cellsForBounds({ west: 5.25, south: 60.25, east: 5.55, north: 60.45 });
    expect(cells).toHaveLength(4);
    const b = boundsOfCells(cells);
    expect(b.west).toBeCloseTo(5.2, 6);
    expect(b.north).toBeCloseTo(60.6, 6);
  });

  it("ne charge rien sous le zoom minimal ni sur une zone trop grande", () => {
    const bounds = { west: 5.25, south: 60.25, east: 5.55, north: 60.45 };
    expect(planViewport(bounds, POI_MIN_ZOOM - 0.5, () => false)).toEqual({ status: "zoom" });
    const wide = planViewport({ west: 0, south: 50, east: 3, north: 53 }, POI_MIN_ZOOM, () => false);
    expect(wide.status).toBe("too-wide");
    expect(POI_MAX_CELLS).toBeLessThan(15 * 15);
  });

  it("lit le cache quand tout est frais, sinon une requête sur les seules cases manquantes", () => {
    const bounds = { west: 5.25, south: 60.25, east: 5.55, north: 60.45 };
    const cells = cellsForBounds(bounds);
    expect(planViewport(bounds, 12, () => true)).toEqual({ status: "cached", cells });
    const plan = planViewport(bounds, 12, (key) => key !== cells[3]);
    expect(plan).toMatchObject({ status: "fetch", missing: [cells[3]], bounds: cellBounds(cells[3]) });
  });

  it("répartit une réponse par case, cases vides comprises", () => {
    const pois = parseOverpass(bergenResponse);
    const cells = [...new Set(pois.map((p) => cellOf(p.lng, p.lat))), "0:0"];
    const split = splitByCell(pois, cells);
    expect([...split.values()].flat()).toHaveLength(pois.length);
    expect(split.get("0:0")).toEqual([]);
  });

  it("garde une case un mois", () => {
    expect(isCellFresh(undefined, 1000)).toBe(false);
    expect(isCellFresh(0, POI_CELL_TTL_MS - 1)).toBe(true);
    expect(isCellFresh(0, POI_CELL_TTL_MS)).toBe(false);
  });

  it("attend l'écart minimal ou la fin de la pause du serveur", () => {
    expect(poiWait(null, null, 1000)).toBe(0);
    expect(poiWait(1000, null, 1500)).toBe(1500);
    expect(poiWait(1000, 1000 + POI_BACKOFF_MS, 1500)).toBe(POI_BACKOFF_MS - 500);
  });
});

describe("couloir le long du tracé", () => {
  const trip = reference.savedTrips[0] as unknown as { legs: Leg[]; days: unknown[] };

  it("simplifie une ligne sans perdre ses extrémités", () => {
    const straight = Array.from({ length: 50 }, (_, k) => [5 + k * 0.01, 60]);
    expect(simplifyLine(straight, 0.05)).toEqual([straight[0], straight[49]]);
    const zigzag = Array.from({ length: 50 }, (_, k) => [5 + k * 0.01, 60 + (k % 2) * 0.05]);
    expect(simplifyLine(zigzag, 0.05)).toHaveLength(50);
  });

  it("ne prend que les tronçons avec tracé : pas de couloir sur un ferry", () => {
    const day1 = trip.legs.filter((l) => l.dayIndex === 1);
    expect(day1.map((l) => l.mode)).toEqual(["van", "ferry"]);
    const line = dayTrackLine(trip.legs, 1);
    expect(line).toEqual(day1[0].options[0].geometry.coordinates);
  });

  it("suit le tracé par les cases de la grille, à 3 km près", () => {
    const line = [
      [10.1, 60.1],
      [10.5, 60.1],
    ];
    const cells = cellsAlongLine(line, 3);
    expect(cells[0]).toBe(cellOf(10.1, 60.1));
    expect(cells).toContain(cellOf(10.5, 60.1));
    // 60,1 est au milieu d'une case (60,0 à 60,2) : à 3 km près, la rangée du dessous n'y est pas.
    expect(cells).not.toContain(cellOf(10.2, 59.9));
    expect(cellsAlongLine([[10, 60.01], [10.1, 60.01]], 3)).toContain(cellOf(10, 59.99));
  });

  it("regroupe les cases en rectangles de quatre cases de côté au plus", () => {
    const row = Array.from({ length: 10 }, (_, k) => `${100 + k}:500`);
    expect(groupCells(row, 4).map((g) => g.length)).toEqual([4, 4, 2]);
    const { bounds, cells } = groupRequest(["100:500", "101:501"]);
    expect(cells).toHaveLength(4);
    expect(bounds).toEqual(boundsOfCells(["100:500", "101:501"]));
  });

  it("couvre le voyage de référence en peu de requêtes, et sa signature suit les tracés", () => {
    const plan = planCorridor(trip.legs, trip.days.length);
    expect(plan.lines).toHaveLength(10);
    const requests = plan.groups.length;
    // 2 223 km : de l'ordre de deux ou trois requêtes par jour, loin des 100 par jour de la politique d'Overpass.
    expect(requests).toBeGreaterThan(10);
    expect(requests).toBeLessThan(40);
    expect(planCorridor(trip.legs, trip.days.length).signature).toBe(plan.signature);
    const shorter = trip.legs.filter((l) => l.dayIndex !== 9);
    expect(planCorridor(shorter, trip.days.length).signature).not.toBe(plan.signature);
  });

  it("ne garde dans le couloir que les points proches d'un tracé", () => {
    const lines = [
      [
        [10, 60],
        [10.5, 60],
      ],
    ];
    expect(withinCorridor([poi("près", 10.2, 60.01), poi("loin", 10.2, 60.2)], lines).map((p) => p.id)).toEqual(["près"]);
  });

  it("mesure la distance au tracé et la position le long", () => {
    const line = [
      [10, 60],
      [10.2, 60],
    ];
    const where = locateOnLine({ lng: 10.1, lat: 60.01 }, line)!;
    expect(where.offKm).toBeCloseTo(1.1, 1);
    expect(where.alongKm).toBeCloseTo(5.57, 1);
    expect(locateOnLine({ lng: 10, lat: 60 }, [[10, 60]])).toBeNull();
  });

  it("liste les points du jour dans l'ordre de la route, quelques-uns par catégorie", () => {
    const line = [
      [10, 60],
      [10.5, 60],
    ];
    const pois = [
      poi("loin", 10.2, 60.2),
      poi("eau-3", 10.3, 60.001),
      poi("eau-1", 10.1, 60.001),
      poi("eau-2", 10.2, 60.001),
      poi("eau-4", 10.4, 60.001),
      poi("camp", 10.45, 60.01, "camping"),
    ];
    expect(poisAlongLine(pois, line).map((p) => p.poi.id)).toEqual(["eau-1", "eau-2", "eau-3", "camp"]);
  });
});
