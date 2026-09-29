import type { LngLatBounds, Map as MapLibreMap } from "maplibre-gl";
import { selectedOption, type TripState } from "@/store/trip-store";

const CLUTTER_LAYERS = [
  "towns-circle",
  "towns-label",
  "pois-circle",
  "pois-label",
  "camps-circle",
  "camps-cluster",
  "camps-cluster-count",
  "osm-camps-circle",
  "osm-camps-cluster",
  "osm-camps-cluster-count",
  "freedom-fill",
  "freedom-line",
  "custom-circle",
];

export async function captureTripMapImage(
  map: MapLibreMap,
  state: Pick<TripState, "days" | "stops" | "legs">,
): Promise<string | null> {
  const camera = {
    center: map.getCenter(),
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
  const previous = CLUTTER_LAYERS.map((id) => ({
    id,
    visibility: map.getLayer(id) ? map.getLayoutProperty(id, "visibility") : null,
  }));

  try {
    for (const { id } of previous) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
    }
    // Import dynamique : MapLibre reste dans son propre chunk, chargé avec la carte.
    const { LngLatBounds: Bounds } = await import("maplibre-gl");
    const idle = waitIdle(map);
    const bounds = tripBounds(state, Bounds);
    if (bounds) {
      map.fitBounds(bounds, { padding: 56, maxZoom: 9.5, duration: 0 });
    }
    map.triggerRepaint();
    await idle;
    const canvas = map.getCanvas();
    if (!canvas.width || !canvas.height) return null;
    return canvas.toDataURL("image/jpeg", 0.84);
  } catch {
    return null;
  } finally {
    for (const { id, visibility } of previous) {
      if (!map.getLayer(id) || visibility == null) continue;
      map.setLayoutProperty(id, "visibility", visibility);
    }
    map.jumpTo(camera);
  }
}

function tripBounds(
  state: Pick<TripState, "stops" | "legs">,
  Bounds: typeof LngLatBounds,
): LngLatBounds | null {
  const bounds = new Bounds();
  let any = false;
  for (const stop of Object.values(state.stops)) {
    bounds.extend([stop.lng, stop.lat]);
    any = true;
  }
  for (const leg of state.legs) {
    const opt = selectedOption(leg);
    if (!opt) continue;
    for (const coord of opt.geometry.coordinates) {
      bounds.extend([coord[0], coord[1]]);
      any = true;
    }
  }
  return any ? bounds : null;
}

function waitIdle(map: MapLibreMap, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, timeoutMs);
    map.once("idle", done);
  });
}
