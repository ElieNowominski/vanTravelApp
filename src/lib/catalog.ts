import nzPois from "@/data/catalog/nz-south/pois.json";
import nzTowns from "@/data/catalog/nz-south/towns.json";
import { DEFAULT_REGION_ID, regionsContaining } from "@/lib/regions";
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
 * Régions dont le catalogue public s'applique : celles que touche le voyage. Sans voyage (écran de création),
 * la région par défaut, seule à avoir un catalogue tant que la recherche de lieux n'existe pas (lot 3).
 */
export function catalogRegionIds(config: TripConfig | null | undefined): string[] {
  if (!config) return [DEFAULT_REGION_ID];
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
