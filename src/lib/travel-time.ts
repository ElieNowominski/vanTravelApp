import type { TravelProfile } from "@/lib/types";

export type TimeFactors = Pick<TravelProfile, "timeFactor" | "windingFactor">;

/** Temps selon le profil à partir du temps routier brut : majoration globale, plus forte sur les routes lentes. */
export function profileDurationSec(
  rawSec: number,
  distanceKm: number,
  profile: TimeFactors,
): { durationSec: number; winding: boolean } {
  const hours = rawSec / 3600;
  const avgKmh = hours > 0 ? distanceKm / hours : 80;
  const winding = avgKmh < 48;
  let factor = profile.timeFactor;
  if (winding) factor *= profile.windingFactor;
  else if (avgKmh < 58) factor *= 1.08;
  return {
    durationSec: Math.round(rawSec * factor),
    winding,
  };
}

/** Estimation quand le réseau routier est indisponible : distance à vol d'oiseau majorée. */
export function fallbackRoute(
  distanceStraightKm: number,
  profile: TimeFactors,
): { durationRawSec: number; durationSec: number; winding: boolean; distanceKm: number } {
  const distanceKm = distanceStraightKm * 1.45;
  const durationRawSec = (distanceKm / 62) * 3600;
  const adjusted = profileDurationSec(durationRawSec, distanceKm, profile);
  return {
    distanceKm,
    durationRawSec,
    ...adjusted,
  };
}
