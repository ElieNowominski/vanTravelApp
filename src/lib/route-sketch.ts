import type { Leg, RouteOption, Stop, TripSnapshot } from "@/lib/types";

/**
 * Croquis d'itinéraire d'un jour en SVG, sans fond de carte : tracés stockés et étapes projetés
 * dans un cadre. Sert au roadbook imprimable, fonctionne hors ligne et respecte la politique
 * OSM (aucune tuile capturée en masse).
 */
export type SketchPoint = { x: number; y: number; label: string; overnight: boolean; order: number };

export type RouteSketch = {
  width: number;
  height: number;
  /** Un chemin SVG (`d`) par tronçon, dans l'ordre du jour. */
  paths: Array<{ d: string; estimated: boolean }>;
  points: SketchPoint[];
  /** Étendue réelle en kilomètres, pour une échelle approximative. */
  spanKm: number;
};

function selected(leg: Leg): RouteOption | null {
  return leg.options[leg.selectedIndex] ?? leg.options[0] ?? null;
}

export function sketchDay(
  snapshot: Pick<TripSnapshot, "days" | "stops" | "legs">,
  dayIndex: number,
  options: { width?: number; height?: number; padding?: number } = {},
): RouteSketch | null {
  const width = options.width ?? 320;
  const height = options.height ?? 200;
  const padding = options.padding ?? 18;
  const day = snapshot.days[dayIndex];
  if (!day) return null;

  const legs = snapshot.legs.filter((leg) => leg.dayIndex === dayIndex);
  const stops = day.stopIds.map((id) => snapshot.stops[id]).filter((s): s is Stop => Boolean(s));
  const lines = legs.map((leg) => ({ coords: selected(leg)?.geometry.coordinates ?? [], estimated: leg.estimated }));
  // Le point de départ du premier tronçon (nuit précédente) fait partie du dessin.
  const fromIds = legs.map((leg) => leg.fromStopId);
  const extraStops = fromIds
    .map((id) => snapshot.stops[id])
    .filter((s): s is Stop => Boolean(s) && !stops.some((stop) => stop.id === s.id));
  const allStops = [...extraStops, ...stops];

  const all: Array<[number, number]> = [
    ...lines.flatMap((line) => line.coords.map((c) => [c[0], c[1]] as [number, number])),
    ...allStops.map((stop) => [stop.lng, stop.lat] as [number, number]),
  ];
  if (all.length === 0) return null;

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of all) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const midLat = (minLat + maxLat) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180); // équirectangulaire corrigé en longitude
  const spanX = Math.max((maxLng - minLng) * kx, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const drawW = spanX * scale;
  const drawH = spanY * scale;
  const offsetX = (width - drawW) / 2;
  const offsetY = (height - drawH) / 2;

  const project = (lng: number, lat: number): [number, number] => [
    round1(offsetX + (lng - minLng) * kx * scale),
    round1(offsetY + (maxLat - lat) * scale),
  ];

  const paths = lines
    .filter((line) => line.coords.length >= 2)
    .map((line) => ({
      estimated: line.estimated,
      d: line.coords
        .map((c, i) => {
          const [x, y] = project(c[0], c[1]);
          return `${i === 0 ? "M" : "L"}${x} ${y}`;
        })
        .join(""),
    }));

  const points: SketchPoint[] = allStops.map((stop, index) => {
    const [x, y] = project(stop.lng, stop.lat);
    return { x, y, label: stop.name, overnight: stop.id === day.overnightStopId, order: index - extraStops.length + 1 };
  });

  const spanKm = Math.max(spanX, spanY) * 111.32;
  return { width, height, paths, points, spanKm: Math.round(spanKm) };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
