import nzSouth from "@/data/regions/nz-south.json";
import type { BBox, RegionPreset } from "@/lib/types";

/**
 * Région de la v1, aujourd'hui seulement source propre à un pays (ADR 0003) : catalogue de lieux et calques DOC
 * de la Nouvelle-Zélande, activés quand le voyage y passe. Sert aussi à migrer les voyages v1.
 */
export const DEFAULT_REGION_ID = "nz-south";

export const REGIONS: Record<string, RegionPreset> = {
  [nzSouth.id]: nzSouth as RegionPreset,
};

export function getRegion(id?: string | null): RegionPreset {
  return REGIONS[id ?? ""] ?? REGIONS[DEFAULT_REGION_ID];
}

export function listRegions(): RegionPreset[] {
  return Object.values(REGIONS);
}

type Point = { lng: number; lat: number };

export function inBBox(point: Point, bbox: BBox): boolean {
  return point.lng >= bbox.xmin && point.lng <= bbox.xmax && point.lat >= bbox.ymin && point.lat <= bbox.ymax;
}

/** Régions dont le cadre contient au moins un des points. */
export function regionsContaining(points: Point[]): string[] {
  return listRegions()
    .filter((region) => points.some((point) => inBBox(point, region.bbox)))
    .map((region) => region.id);
}
