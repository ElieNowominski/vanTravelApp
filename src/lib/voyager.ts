import { isIosUserAgent } from "@/lib/pwa";
import type { Booking, Leg, RouteOption, Stop, TripConfig, TripDay, TripSnapshot } from "@/lib/types";

export type AppMode = "plan" | "travel";

/** Date calendaire AAAA-MM-JJ « aujourd'hui » dans le fuseau de la région (pas celui du téléphone). */
export function todayInZone(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export type TripPhase = "before" | "during" | "after";

export function tripPhase(config: Pick<TripConfig, "start" | "end">, today: string): TripPhase {
  if (today < config.start.date) return "before";
  if (today > config.end.date) return "after";
  return "during";
}

/** Nombre de jours calendaires entre deux dates ISO (positif si `to` est après `from`). */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/**
 * Mode par défaut : Voyager pendant le voyage ou dès que l'itinéraire est figé ;
 * Planifier sinon. Un choix explicite de l'utilisateur prend le dessus (store).
 */
export function defaultMode(
  config: Pick<TripConfig, "start" | "end"> | null | undefined,
  frozenAt: string | null | undefined,
  today: string,
): AppMode {
  if (!config) return "plan";
  if (frozenAt) return "travel";
  return tripPhase(config, today) === "during" ? "travel" : "plan";
}

/** Index du jour courant : le jour daté d'aujourd'hui, sinon le premier avant le voyage, le dernier après. */
export function dayIndexForDate(days: Pick<TripDay, "date">[], today: string): number {
  if (days.length === 0) return -1;
  const exact = days.findIndex((day) => day.date === today);
  if (exact >= 0) return exact;
  if (today < days[0].date) return 0;
  return days.length - 1;
}

function selected(leg: Leg): RouteOption | null {
  return leg.options[leg.selectedIndex] ?? leg.options[0] ?? null;
}

function lastStopOfDay(snapshot: Pick<TripSnapshot, "days" | "stops">, dayIndex: number): Stop | null {
  const ids = snapshot.days[dayIndex]?.stopIds ?? [];
  const lastId = ids[ids.length - 1];
  return lastId ? (snapshot.stops[lastId] ?? null) : null;
}

/** D'où l'on part ce jour-là : la nuit précédente, ou la dernière étape d'un jour antérieur. */
export function departureOf(snapshot: Pick<TripSnapshot, "days" | "stops">, dayIndex: number): Stop | null {
  for (let i = dayIndex - 1; i >= 0; i--) {
    const overnightId = snapshot.days[i]?.overnightStopId;
    if (overnightId && snapshot.stops[overnightId]) return snapshot.stops[overnightId];
    const last = lastStopOfDay(snapshot, i);
    if (last) return last;
  }
  // Jour 1 : la première étape est le point de départ posé par le voyage.
  const firstId = snapshot.days[dayIndex]?.stopIds[0];
  return dayIndex === 0 && firstId ? (snapshot.stops[firstId] ?? null) : null;
}

export type DaySummary = {
  dayIndex: number;
  day: TripDay;
  /** Étapes du jour, dans l'ordre (le départ du jour 1 inclus). */
  stops: Stop[];
  departure: Stop | null;
  /** Première étape à rejoindre (hors point de départ). */
  nextStop: Stop | null;
  overnight: Stop | null;
  /** Réservation à afficher pour la nuit : la première de l'étape de nuit. */
  tonightBooking: Booking | null;
  driveSec: number;
  km: number;
  estimated: boolean;
};

export function summarizeDay(snapshot: Pick<TripSnapshot, "days" | "stops" | "legs">, dayIndex: number): DaySummary | null {
  const day = snapshot.days[dayIndex];
  if (!day) return null;
  const stops = day.stopIds.map((id) => snapshot.stops[id]).filter((s): s is Stop => Boolean(s));
  const departure = departureOf(snapshot, dayIndex);
  const nextStop = stops.find((stop) => stop.id !== departure?.id) ?? null;
  const overnight = day.overnightStopId ? (snapshot.stops[day.overnightStopId] ?? null) : null;
  const dayLegs = snapshot.legs.filter((leg) => leg.dayIndex === dayIndex);
  const driveSec = dayLegs.reduce((sum, leg) => sum + (selected(leg)?.durationVanSec ?? 0), 0);
  const km = dayLegs.reduce((sum, leg) => sum + (selected(leg)?.distanceKm ?? 0), 0);
  return {
    dayIndex,
    day,
    stops,
    departure,
    nextStop,
    overnight,
    tonightBooking: overnight?.bookings[0] ?? null,
    driveSec,
    km,
    estimated: dayLegs.some((leg) => leg.estimated),
  };
}

/** Itinéraire Google Maps vers un point (ouvre l'app sur mobile). */
export function mapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** Apple Plans, pour iPhone. */
export function appleMapsUrl(lat: number, lng: number): string {
  return `https://maps.apple.com/?daddr=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export type DirectionsLink = { label: "Plans" | "Google Maps"; href: string };

/**
 * Liens de guidage vers un point. Sur iPhone, Plans en premier : l'app s'ouvre directement,
 * là où le lien Google Maps passe par Safari. Google Maps reste proposé partout.
 */
export function directionsLinks(lat: number, lng: number, userAgent: string): DirectionsLink[] {
  const google: DirectionsLink = { label: "Google Maps", href: mapsDirectionsUrl(lat, lng) };
  if (isIosUserAgent(userAgent)) return [{ label: "Plans", href: appleMapsUrl(lat, lng) }, google];
  return [google];
}

/** `tel:` propre : chiffres et « + » seulement. */
export function telHref(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  return `tel:${cleaned}`;
}

/** Masque un code : même longueur en points, plafonnée pour ne pas trahir la longueur exacte. */
export function maskSecret(value: string): string {
  const n = Math.min(Math.max(value.length, 4), 8);
  return "•".repeat(n);
}

/** Les étapes qui ont une réservation, une checklist non finie ou un document : à surveiller. */
export function stopsNeedingAttention(snapshot: Pick<TripSnapshot, "stops">): Stop[] {
  return Object.values(snapshot.stops).filter(
    (stop) => stop.bookings.length > 0 || stop.checklist.some((item) => !item.done),
  );
}
