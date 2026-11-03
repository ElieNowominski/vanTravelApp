import type { BBox, Stop, TripConfig, TripMilestone, TripSnapshot } from "@/lib/types";
import { todayInZone } from "@/lib/voyager";

/**
 * Zone d'un voyage (ADR 0003) : emprise, pays et fuseaux déduits des étapes, jamais choisis.
 * Le fuseau et le pays d'un point viennent d'un `ZoneLookup` (bibliothèques embarquées, chargées à la demande :
 * `src/lib/place-zone.ts`) ; tout ici reste pur et marche sans lui, avec le fuseau de l'appareil.
 */

export type PlaceZone = { timeZone?: string; countryCode?: string };
export type ZoneLookup = (lng: number, lat: number) => PlaceZone;

type Point = { lng: number; lat: number };

export type TripZone = {
  bbox: BBox | null;
  /** Codes ISO 3166-1 alpha-2, dans l'ordre du voyage. */
  countries: string[];
};

function hasPosition(m: TripMilestone | undefined): m is TripMilestone & Point {
  return !!m && typeof m.lng === "number" && typeof m.lat === "number";
}

/** Points du voyage dans l'ordre : départ, étapes jour par jour, arrivée. */
export function tripPoints(
  config: Pick<TripConfig, "start" | "end" | "arrival"> | null | undefined,
  snapshot?: Pick<TripSnapshot, "days" | "stops"> | null,
): Point[] {
  const points: Point[] = [];
  if (hasPosition(config?.start)) points.push(config.start);
  for (const day of snapshot?.days ?? []) {
    for (const id of day.stopIds) {
      const stop = snapshot?.stops[id];
      if (stop) points.push(stop);
    }
  }
  if (hasPosition(config?.arrival)) points.push(config.arrival);
  if (hasPosition(config?.end)) points.push(config.end);
  return points;
}

export function bboxOf(points: Point[]): BBox | null {
  if (points.length === 0) return null;
  return points.reduce<BBox>(
    (box, p) => ({
      xmin: Math.min(box.xmin, p.lng),
      ymin: Math.min(box.ymin, p.lat),
      xmax: Math.max(box.xmax, p.lng),
      ymax: Math.max(box.ymax, p.lat),
    }),
    { xmin: points[0].lng, ymin: points[0].lat, xmax: points[0].lng, ymax: points[0].lat },
  );
}

export function computeZone(points: Point[], lookup?: ZoneLookup | null): TripZone {
  const countries: string[] = [];
  if (lookup) {
    for (const p of points) {
      const code = lookup(p.lng, p.lat).countryCode;
      if (code && !countries.includes(code)) countries.push(code);
    }
  }
  return { bbox: bboxOf(points), countries };
}

/** « Norvège, Suède » ; au-delà de trois pays, « Danemark, Norvège, Suède et 2 autres ». */
export function zoneLabel(countries: string[], locale = "fr"): string {
  if (countries.length === 0) return "";
  let names: string[];
  try {
    const display = new Intl.DisplayNames([locale], { type: "region" });
    names = countries.map((code) => display.of(code) ?? code);
  } catch {
    names = countries;
  }
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} et ${names.length - 3} autres`;
}

/** Cadre de la carte : l'emprise élargie, pour qu'un voyage d'un seul point ne s'affiche pas au zoom maximal. */
export function mapBounds(bbox: BBox | null, minSpanDeg = 0.5): [[number, number], [number, number]] | null {
  if (!bbox) return null;
  const padX = Math.max((minSpanDeg - (bbox.xmax - bbox.xmin)) / 2, (bbox.xmax - bbox.xmin) * 0.1);
  const padY = Math.max((minSpanDeg - (bbox.ymax - bbox.ymin)) / 2, (bbox.ymax - bbox.ymin) * 0.1);
  return [
    [Math.max(-180, bbox.xmin - padX), Math.max(-85, bbox.ymin - padY)],
    [Math.min(180, bbox.xmax + padX), Math.min(85, bbox.ymax + padY)],
  ];
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Fuseau d'un jour : celui de sa nuit, sinon de sa dernière étape connue, sinon du départ du voyage. */
export function dayTimeZone(
  snapshot: Pick<TripSnapshot, "days" | "stops">,
  dayIndex: number,
  lookup: ZoneLookup | null | undefined,
  fallback: string,
): string {
  if (!lookup) return fallback;
  const day = snapshot.days[dayIndex];
  if (!day) return fallback;
  const candidates = [
    day.overnightStopId ? snapshot.stops[day.overnightStopId] : undefined,
    ...[...day.stopIds].reverse().map((id) => snapshot.stops[id]),
  ].filter((s): s is Stop => Boolean(s));
  for (const stop of candidates) {
    const tz = lookup(stop.lng, stop.lat).timeZone;
    if (tz) return tz;
  }
  return fallback;
}

/**
 * Date du jour en voyage : le premier jour du voyage dont la date est « aujourd'hui » dans son propre fuseau
 * (un voyage multi-pays traverse plusieurs fuseaux). Hors des dates du voyage : aujourd'hui dans le fuseau
 * du départ, à défaut celui de l'appareil.
 */
export function currentTravelDate(
  snapshot: Pick<TripSnapshot, "days" | "stops">,
  config: Pick<TripConfig, "start"> | null | undefined,
  lookup: ZoneLookup | null | undefined,
  now = new Date(),
): string {
  const device = deviceTimeZone();
  const startTz = lookup && hasPosition(config?.start) ? lookup(config.start.lng, config.start.lat).timeZone : undefined;
  const fallback = startTz ?? device;
  for (const [index, day] of snapshot.days.entries()) {
    if (todayInZone(dayTimeZone(snapshot, index, lookup, fallback), now) === day.date) return day.date;
  }
  return todayInZone(fallback, now);
}

/** Vue initiale d'une carte : cadrée sur le voyage, sinon l'Europe (rien encore de positionné). */
export function initialMapView(
  points: Point[],
): { bounds: [[number, number], [number, number]] } | { center: [number, number]; zoom: number } {
  const bounds = mapBounds(bboxOf(points));
  return bounds ? { bounds } : { center: [10, 50], zoom: 3 };
}
