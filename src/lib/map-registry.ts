import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * L'instance MapLibre principale, pour les fonctions hors React (capture PDF).
 * Remplace l'ancien global `window.__tripMap`.
 */
let activeMap: MapLibreMap | null = null;

export function setActiveMap(map: MapLibreMap | null): void {
  activeMap = map;
}

export function getActiveMap(): MapLibreMap | null {
  return activeMap;
}
