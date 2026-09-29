import nzPois from "@/data/catalog/nz-south/pois.json";
import nzTowns from "@/data/catalog/nz-south/towns.json";
import { DEFAULT_REGION_ID } from "@/lib/regions";
import type { CatalogPlace, PlaceInput, PlaceKind, TripConfig } from "@/lib/types";

export type CatalogEntry = CatalogPlace & { kind: PlaceKind };

/** Catalogue public d'une région + hébergements privés du voyage courant. */
export type Catalog = {
  regionId: string;
  towns: CatalogPlace[];
  pois: CatalogPlace[];
  stays: CatalogPlace[];
};

const PUBLIC_CATALOG: Record<string, { towns: CatalogPlace[]; pois: CatalogPlace[] }> = {
  "nz-south": { towns: nzTowns as CatalogPlace[], pois: nzPois as CatalogPlace[] },
};

export function buildCatalog(config: TripConfig | null | undefined): Catalog {
  const regionId = config?.regionId ?? DEFAULT_REGION_ID;
  const pub = PUBLIC_CATALOG[regionId] ?? { towns: [], pois: [] };
  return { regionId, towns: pub.towns, pois: pub.pois, stays: config?.stays ?? [] };
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
