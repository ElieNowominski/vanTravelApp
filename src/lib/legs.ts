import type { Leg, RouteOption } from "@/lib/types";

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
