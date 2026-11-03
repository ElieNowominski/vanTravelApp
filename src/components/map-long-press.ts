import type { LngLat, Map as MapLibreMap, MapMouseEvent, MapTouchEvent } from "maplibre-gl";

const PRESS_MS = 550;
const MOVE_TOLERANCE_PX = 10;
/** Après un appui long, le clic qui suit éventuellement (Android) ne doit pas ouvrir une fiche. */
const SWALLOW_CLICK_MS = 800;

/**
 * Appui long sur la carte (ADR 0004 : ajouter une étape n'importe où). MapLibre n'a pas de geste « appui long » :
 * minuterie sur un doigt immobile pour iOS, `contextmenu` pour le clic droit et l'appui long d'Android.
 * Renvoie une fonction qui dit si un clic vient juste après un appui long.
 */
export function attachLongPress(map: MapLibreMap, onPress: (lngLat: LngLat) => void): () => boolean {
  let timer: number | null = null;
  let origin: { x: number; y: number } | null = null;
  let firedAt = 0;

  const cancel = () => {
    if (timer != null) window.clearTimeout(timer);
    timer = null;
    origin = null;
  };
  const fire = (lngLat: LngLat) => {
    cancel();
    firedAt = Date.now();
    onPress(lngLat);
  };

  map.on("touchstart", (event: MapTouchEvent) => {
    cancel();
    if (event.originalEvent.touches.length !== 1) return;
    origin = { x: event.point.x, y: event.point.y };
    const lngLat = event.lngLat;
    timer = window.setTimeout(() => fire(lngLat), PRESS_MS);
  });
  map.on("touchmove", (event: MapTouchEvent) => {
    if (!origin) return;
    if (event.originalEvent.touches.length !== 1) return cancel();
    if (Math.hypot(event.point.x - origin.x, event.point.y - origin.y) > MOVE_TOLERANCE_PX) cancel();
  });
  map.on("touchend", cancel);
  map.on("touchcancel", cancel);
  map.on("movestart", cancel);
  map.on("contextmenu", (event: MapMouseEvent) => {
    event.preventDefault();
    // Android déclenche aussi `contextmenu` après la minuterie : un seul dialogue.
    if (Date.now() - firedAt < SWALLOW_CLICK_MS) return;
    fire(event.lngLat);
  });

  return () => Date.now() - firedAt < SWALLOW_CLICK_MS;
}
