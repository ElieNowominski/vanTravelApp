import { formatDuration, formatKm } from "@/lib/format";
import { haversineKm } from "@/lib/geo";
import { isRoadMode, TRAVEL_MODE_LABELS } from "@/lib/profiles";
import type { Leg, ManualLeg, Money, RouteOption, TravelMode } from "@/lib/types";

type Point = { lng: number; lat: number };

export function selectedOption(leg: Leg): RouteOption | null {
  return leg.options[leg.selectedIndex] ?? leg.options[0] ?? null;
}

/** Durée retenue d'un tronçon : saisie à la main sans tracé, sinon option de route choisie. */
export function legDurationSec(leg: Leg): number {
  if (leg.track === "aucun") return leg.manual?.durationSec ?? 0;
  return selectedOption(leg)?.durationSec ?? 0;
}

export function legDistanceKm(leg: Leg): number {
  if (leg.track === "aucun") return leg.manual?.distanceKm ?? 0;
  return selectedOption(leg)?.distanceKm ?? 0;
}

/** Temps au volant : seuls les tronçons routiers comptent (un ferry de trois heures n'est pas de la conduite). */
export function roadDurationSec(legs: Leg[]): number {
  return legs.reduce((sum, leg) => sum + (isRoadMode(leg.mode) ? legDurationSec(leg) : 0), 0);
}

/**
 * Vitesse moyenne et détour par rapport au vol d'oiseau des modes saisis à la main, pour une première
 * estimation que la personne corrige avec l'horaire réel. Ordres de grandeur, pas des mesures.
 */
const MANUAL_ESTIMATE: Record<Exclude<TravelMode, "van" | "voiture" | "moto">, { kmh: number; detour: number }> = {
  train: { kmh: 80, detour: 1.25 },
  ferry: { kmh: 30, detour: 1.1 },
  velo: { kmh: 15, detour: 1.3 },
  marche: { kmh: 4.5, detour: 1.3 },
};

/** Durée et distance proposées pour un tronçon sans tracé, à partir des deux étapes. */
export function estimateManualLeg(mode: TravelMode, from: Point, to: Point): Pick<ManualLeg, "durationSec" | "distanceKm"> {
  const factors = isRoadMode(mode) ? MANUAL_ESTIMATE.train : MANUAL_ESTIMATE[mode as keyof typeof MANUAL_ESTIMATE];
  const distanceKm = Math.round(haversineKm(from, to) * factors.detour);
  const durationSec = Math.round(((distanceKm / factors.kmh) * 3600) / 300) * 300;
  return { distanceKm, durationSec: Math.max(300, durationSec) };
}

/** Heure libre (« 8 h », « 8 h 05 », « 08:30 », « 8h30 ») en minutes depuis minuit ; `null` si illisible. */
export function parseClock(text: string | undefined): number | null {
  const match = text?.trim().toLowerCase().match(/^(\d{1,2})\s*(?:h|:)\s*(\d{2})?$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = match[2] ? Number(match[2]) : 0;
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Durée entre deux heures du même trajet ; un passage de minuit compte un jour de plus. */
export function durationFromClocks(departAt: string | undefined, arriveAt: string | undefined): number | null {
  const depart = parseClock(departAt);
  const arrive = parseClock(arriveAt);
  if (depart === null || arrive === null) return null;
  const minutes = arrive - depart;
  return (minutes > 0 ? minutes : minutes + 24 * 60) * 60;
}

/**
 * Durée saisie : « 3 h 15 », « 3h15 », « 3:15 », « 45 min », ou un nombre d'heures (« 2 », « 1,5 »).
 * Accepte ce qu'affiche `formatDuration`. `null` si illisible ou nulle.
 */
export function parseDurationInput(text: string): number | null {
  const value = text.trim().toLowerCase().replace(",", ".");
  if (!value) return null;
  let minutes: number | null = null;
  const hm = value.match(/^(\d{1,3})\s*(?:h|:)\s*(\d{1,2})?\s*(?:min)?$/);
  const onlyMin = value.match(/^(\d{1,4})\s*(?:min|mn)$/);
  const hours = value.match(/^(\d{1,3}(?:\.\d+)?)$/);
  if (hm) {
    const m = hm[2] ? Number(hm[2]) : 0;
    if (m > 59) return null;
    minutes = Number(hm[1]) * 60 + m;
  } else if (onlyMin) {
    minutes = Number(onlyMin[1]);
  } else if (hours) {
    minutes = Math.round(Number(hours[1]) * 60);
  }
  return minutes && minutes > 0 ? minutes * 60 : null;
}

/** Ce que la personne a saisi dans l'éditeur de tronçon, champs encore en texte. */
export type ManualLegInput = {
  departAt: string;
  arriveAt: string;
  duration: string;
  distanceKm: string;
  operator: string;
  price: Money | null;
  notes: string;
};

/**
 * Saisie -> tronçon manuel. La durée vient du champ « Durée » s'il est lisible, sinon des deux heures.
 * Sans durée ni heures, l'estimation précédente reste, et le tronçon reste « estimé ».
 */
export function applyManualInput(leg: Leg, input: ManualLegInput): Leg {
  const previous = leg.manual ?? {};
  const typed = parseDurationInput(input.duration);
  const fromClocks = durationFromClocks(input.departAt, input.arriveAt);
  const durationSec = typed ?? fromClocks ?? previous.durationSec;
  const km = Number(input.distanceKm.trim().replace(",", "."));
  const distanceKm = input.distanceKm.trim() && Number.isFinite(km) && km >= 0 ? km : previous.distanceKm;
  const clean = (text: string) => text.trim() || undefined;
  const manual: ManualLeg = {
    durationSec,
    distanceKm,
    departAt: clean(input.departAt),
    arriveAt: clean(input.arriveAt),
    operator: clean(input.operator),
    price: input.price ?? undefined,
    notes: clean(input.notes),
  };
  const durationGiven = typed !== null || fromClocks !== null;
  return {
    ...leg,
    manual: Object.fromEntries(Object.entries(manual).filter(([, v]) => v !== undefined)) as ManualLeg,
    estimated: durationGiven ? false : leg.estimated,
  };
}

/** Points du trait d'un tronçon : la route retenue, ou la ligne droite entre les étapes s'il n'a pas de tracé. */
export function legCoordinates(leg: Leg, stops: Record<string, Point | undefined>): GeoJSON.Position[] {
  const option = selectedOption(leg);
  if (option) return option.geometry.coordinates;
  const from = stops[leg.fromStopId];
  const to = stops[leg.toStopId];
  return from && to ? [[from.lng, from.lat], [to.lng, to.lat]] : [];
}

/** Ligne courte d'un tronçon : « Ferry · 8 h 00 → 11 h 15 · 3 h 15 · 140 km ». */
export function legSummary(leg: Leg): string {
  const parts: string[] = [TRAVEL_MODE_LABELS[leg.mode]];
  const manual = leg.track === "aucun" ? leg.manual : undefined;
  if (manual?.departAt || manual?.arriveAt) parts.push(`${manual.departAt ?? "?"} → ${manual.arriveAt ?? "?"}`);
  parts.push(formatDuration(legDurationSec(leg)));
  if (selectedOption(leg)?.winding && leg.track !== "aucun") parts.push("route lente");
  parts.push(formatKm(legDistanceKm(leg)));
  if (leg.estimated) parts.push("estimé");
  return parts.join(" · ");
}

/** Modes du jour, sans doublon, pour « en van », « en van et ferry ». */
export function dayModesLabel(legs: Leg[]): string {
  const labels = [...new Set(legs.map((leg) => TRAVEL_MODE_LABELS[leg.mode].toLowerCase()))];
  if (labels.length === 0) return "";
  if (labels.length === 1) return `en ${labels[0]}`;
  return `en ${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;
}
