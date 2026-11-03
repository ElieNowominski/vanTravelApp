import { haversineKm, straightLine } from "@/lib/geo";
import type { RouteOption, TravelProfile } from "@/lib/types";
import { fallbackRoute, profileDurationSec, type TimeFactors } from "@/lib/travel-time";

type Point = { lng: number; lat: number };

export type RoutingResult = {
  options: RouteOption[];
  estimated: boolean;
  warning?: string;
};

/**
 * Serveur de démo OSRM : usage non commercial, au plus une requête par seconde.
 * https://github.com/Project-OSRM/osrm-backend/wiki/API-Usage-Policy
 */
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
const TIMEOUT_MS = 15_000;

/** Itinéraire routier depuis le navigateur ; estimation à vol d'oiseau si le réseau manque. */
export async function routeBetween(from: Point, to: Point, profile: TravelProfile): Promise<RoutingResult> {
  try {
    const options = await routeOsrm(from, to, profile);
    if (options.length === 0) return { options: [estimate(from, to, profile)], estimated: true };
    return { options, estimated: false };
  } catch (error) {
    return {
      options: [estimate(from, to, profile)],
      estimated: true,
      warning: error instanceof Error ? error.message : "Routage indisponible",
    };
  }
}

export function estimate(from: Point, to: Point, profile: TimeFactors): RouteOption {
  const km = haversineKm(from, to);
  const fallback = fallbackRoute(km, profile);
  return {
    geometry: straightLine(from, to),
    distanceKm: fallback.distanceKm,
    durationRawSec: fallback.durationRawSec,
    durationSec: fallback.durationSec,
    winding: fallback.winding,
    label: "Estimation (hors réseau routier)",
  };
}

async function routeOsrm(from: Point, to: Point, profile: TimeFactors): Promise<RouteOption[]> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("Hors ligne");
  }
  const url =
    `${OSRM_URL}/${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?overview=full&geometries=geojson&alternatives=true&steps=false`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = (await res.json()) as {
    code: string;
    routes?: Array<{ distance: number; duration: number; geometry: GeoJSON.LineString }>;
  };
  if (data.code !== "Ok" || !data.routes?.length) throw new Error("OSRM sans itinéraire");
  return data.routes.slice(0, 3).map((route, index) => toOption(route, index, profile));
}

function toOption(
  route: { distance: number; duration: number; geometry: GeoJSON.LineString },
  index: number,
  profile: TimeFactors,
): RouteOption {
  const distanceKm = route.distance / 1000;
  const adjusted = profileDurationSec(route.duration, distanceKm, profile);
  return {
    geometry: route.geometry,
    distanceKm,
    durationRawSec: route.duration,
    durationSec: adjusted.durationSec,
    winding: adjusted.winding,
    label: index === 0 ? "Recommandée" : `Alternative ${index}`,
  };
}
