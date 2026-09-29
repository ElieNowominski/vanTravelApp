import { haversineKm, straightLine } from "@/lib/geo";
import type { RouteOption, Vehicle } from "@/lib/types";
import { fallbackRoute, vanDurationSec, type TimeFactors } from "@/lib/van-time";

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
export async function routeBetween(from: Point, to: Point, vehicle: Vehicle): Promise<RoutingResult> {
  try {
    const options = await routeOsrm(from, to, vehicle);
    if (options.length === 0) return { options: [estimate(from, to, vehicle)], estimated: true };
    return { options, estimated: false };
  } catch (error) {
    return {
      options: [estimate(from, to, vehicle)],
      estimated: true,
      warning: error instanceof Error ? error.message : "Routage indisponible",
    };
  }
}

export function estimate(from: Point, to: Point, vehicle: TimeFactors): RouteOption {
  const km = haversineKm(from, to);
  const fallback = fallbackRoute(km, vehicle);
  return {
    geometry: straightLine(from, to),
    distanceKm: fallback.distanceKm,
    durationCarSec: fallback.durationCarSec,
    durationVanSec: fallback.durationVanSec,
    winding: fallback.winding,
    label: "Estimation (hors réseau routier)",
  };
}

async function routeOsrm(from: Point, to: Point, vehicle: TimeFactors): Promise<RouteOption[]> {
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
  return data.routes.slice(0, 3).map((route, index) => toOption(route, index, vehicle));
}

function toOption(
  route: { distance: number; duration: number; geometry: GeoJSON.LineString },
  index: number,
  vehicle: TimeFactors,
): RouteOption {
  const distanceKm = route.distance / 1000;
  const van = vanDurationSec(route.duration, distanceKm, vehicle);
  return {
    geometry: route.geometry,
    distanceKm,
    durationCarSec: route.duration,
    durationVanSec: van.durationVanSec,
    winding: van.winding,
    label: index === 0 ? "Recommandée" : `Alternative ${index}`,
  };
}
