import nzPois from "@/data/catalog/nz-south/pois.json";
import nzTowns from "@/data/catalog/nz-south/towns.json";
import type { PlaceOption } from "@/lib/place-search";
import { regionsContaining } from "@/lib/regions";
import { catalogKindLabel } from "@/lib/trip-plan";
import type { CatalogPlace, PlaceInput, PlaceKind, TripConfig } from "@/lib/types";

export type CatalogEntry = CatalogPlace & { kind: PlaceKind };

/** Catalogues publics des régions traversées + hébergements privés du voyage courant. */
export type Catalog = {
  regionIds: string[];
  towns: CatalogPlace[];
  pois: CatalogPlace[];
  stays: CatalogPlace[];
};

const PUBLIC_CATALOG: Record<string, { towns: CatalogPlace[]; pois: CatalogPlace[] }> = {
  "nz-south": { towns: nzTowns as CatalogPlace[], pois: nzPois as CatalogPlace[] },
};

/** Points connus d'un voyage sans ses étapes : repères positionnés et hébergements. */
function configPoints(config: TripConfig): Array<{ lng: number; lat: number }> {
  const milestones = [config.start, config.end, config.arrival].flatMap((m) =>
    m && typeof m.lng === "number" && typeof m.lat === "number" ? [{ lng: m.lng, lat: m.lat }] : [],
  );
  return [...milestones, ...config.stays];
}

/**
 * Régions dont le catalogue public s'applique : celles que touche le voyage. Sans voyage, aucune : l'écran
 * de création cherche dans tous les catalogues (`searchPublicCatalogs`) et sur OSM (lot 3).
 */
export function catalogRegionIds(config: TripConfig | null | undefined): string[] {
  if (!config) return [];
  return regionsContaining(configPoints(config)).filter((id) => PUBLIC_CATALOG[id]);
}

export function buildCatalog(config: TripConfig | null | undefined): Catalog {
  const regionIds = catalogRegionIds(config);
  const pubs = regionIds.map((id) => PUBLIC_CATALOG[id]);
  return {
    regionIds,
    towns: pubs.flatMap((pub) => pub.towns),
    pois: pubs.flatMap((pub) => pub.pois),
    stays: config?.stays ?? [],
  };
}

/** Lieu d'un catalogue public : dans une région donnée (repère d'un voyage v1), sinon dans toutes. */
export function findPublicPlace(placeId: string, regionId?: string): CatalogPlace | null {
  const pubs = regionId ? [PUBLIC_CATALOG[regionId]].filter(Boolean) : Object.values(PUBLIC_CATALOG);
  for (const pub of pubs) {
    const place = pub.towns.find((p) => p.id === placeId) ?? pub.pois.find((p) => p.id === placeId);
    if (place) return place;
  }
  return null;
}

export function allCatalogPlaces(catalog: Catalog): CatalogEntry[] {
  return [
    ...catalog.towns.map((t) => ({ ...t, kind: "town" as const })),
    ...catalog.stays.map((s) => ({ ...s, kind: "camp" as const })),
    ...catalog.pois.map((p) => ({ ...p, kind: "poi" as const })),
  ];
}

export function findCatalogPlace(catalog: Catalog, id: string): CatalogEntry | null {
  return allCatalogPlaces(catalog).find((p) => p.id === id) ?? null;
}

export function searchCatalog(catalog: Catalog, query: string): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  const all = allCatalogPlaces(catalog);
  if (!q) return all;
  return all.filter((p) => {
    const hay = `${p.name} ${p.area ?? ""} ${p.region} ${p.category ?? ""} ${p.notes ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
}

/** Villes et lieux de tous les catalogues publics, quel que soit le voyage (écran de création, hors ligne). */
export function searchPublicCatalogs(query: string): CatalogEntry[] {
  const all: Catalog = {
    regionIds: Object.keys(PUBLIC_CATALOG),
    towns: Object.values(PUBLIC_CATALOG).flatMap((pub) => pub.towns),
    pois: Object.values(PUBLIC_CATALOG).flatMap((pub) => pub.pois),
    stays: [],
  };
  return query.trim() ? searchCatalog(all, query) : [];
}

export function catalogOption(place: CatalogEntry): PlaceOption {
  const label = catalogKindLabel(place.kind, place.category);
  return {
    key: `catalogue:${place.kind}:${place.id}`,
    name: place.name,
    caption: place.kind === "camp" && place.area ? `${label} · ${place.area}` : `${label} · ${place.region}`,
    source: "catalogue",
    input: placeToInput(place),
  };
}

export function placeToInput(place: CatalogEntry): PlaceInput {
  return {
    placeId: place.id,
    name: place.name,
    lng: place.lng,
    lat: place.lat,
    kind: place.kind,
    area: place.area,
    notes: place.notes,
    warning: place.warning,
  };
}
