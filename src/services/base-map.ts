import type { StyleSpecification } from "maplibre-gl";
import { BASE_SOURCE, BASE_STYLE_URL, localizeBaseStyle } from "@/lib/base-map";
import { buildMapStyle } from "@/lib/constants";

const TIMEOUT_MS = 6000;

export type BaseStyle = { style: StyleSpecification; vector: boolean };

/**
 * Style du fond : Liberty d'OpenFreeMap, noms en français, ou les tuiles raster OSM si le style ne vient pas
 * (serveur indisponible, réponse inattendue). Hors ligne, le service worker resert le style déjà vu.
 */
export async function loadBaseStyle(): Promise<BaseStyle> {
  try {
    const res = await fetch(BASE_STYLE_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`style ${res.status}`);
    const style = (await res.json()) as StyleSpecification;
    if (style?.version !== 8 || !Array.isArray(style.layers) || !style.sources?.[BASE_SOURCE]) throw new Error("style inattendu");
    return { style: localizeBaseStyle(style), vector: true };
  } catch (error) {
    console.warn("Fond vectoriel indisponible, repli sur les tuiles raster OSM :", error);
    return { style: buildMapStyle(), vector: false };
  }
}
