import type { Vehicle } from "@/lib/types";

export type TimeFactors = Pick<Vehicle, "timeFactor" | "windingFactor">;

/** Temps van à partir du temps voiture : majoration globale, plus forte sur les routes lentes. */
export function vanDurationSec(
  carSec: number,
  distanceKm: number,
  vehicle: TimeFactors,
): { durationVanSec: number; winding: boolean } {
  const hours = carSec / 3600;
  const avgKmh = hours > 0 ? distanceKm / hours : 80;
  const winding = avgKmh < 48;
  let factor = vehicle.timeFactor;
  if (winding) factor *= vehicle.windingFactor;
  else if (avgKmh < 58) factor *= 1.08;
  return {
    durationVanSec: Math.round(carSec * factor),
    winding,
  };
}

/** Estimation quand le réseau routier est indisponible : distance à vol d'oiseau majorée. */
export function fallbackRoute(
  distanceStraightKm: number,
  vehicle: TimeFactors,
): { durationCarSec: number; durationVanSec: number; winding: boolean; distanceKm: number } {
  const distanceKm = distanceStraightKm * 1.45;
  const durationCarSec = (distanceKm / 62) * 3600;
  const van = vanDurationSec(durationCarSec, distanceKm, vehicle);
  return {
    distanceKm,
    durationCarSec,
    ...van,
  };
}
