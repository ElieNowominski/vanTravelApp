import nzSouth from "@/data/regions/nz-south.json";
import type { RegionPreset } from "@/lib/types";

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
