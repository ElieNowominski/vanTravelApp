import { haversineKm, straightLine } from "@/lib/geo";
import { estimateManualLeg } from "@/lib/legs";
import { isRoadMode } from "@/lib/profiles";
import type { Leg, RouteOption, TravelMode, TravelProfile } from "@/lib/types";
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
const MIN_INTERVAL_MS = 1_000;

/** Ce que le routage décide d'un tronçon : tout le tronçon sauf ses identifiants et son jour. */
export type LegRoute = Pick<Leg, "mode" | "track" | "options" | "selectedIndex" | "estimated" | "manual">;

export type LegRouting = { leg: LegRoute; warning?: string };

/**
 * Interface de routage (lot 4) : calcule un tronçon pour un mode donné.
 * Van, voiture, moto : OSRM, durée ajustée par le profil du voyage. Train, ferry, vélo, marche : pas de
 * tracé, durée et distance estimées à partir du vol d'oiseau, que la personne remplace par l'horaire.
 * Un autre fournisseur (OpenRouteService, GraphHopper via une Edge Function) se branchera ici.
 */
export async function routeLeg(from: Point, to: Point, mode: TravelMode, profile: TravelProfile): Promise<LegRouting> {
  if (!isRoadMode(mode)) {
    return { leg: { mode, track: "aucun", options: [], selectedIndex: 0, estimated: true, manual: estimateManualLeg(mode, from, to) } };
  }
  const result = await routeBetween(from, to, profile);
  return {
    leg: { mode, track: "calcule", options: result.options, selectedIndex: 0, estimated: result.estimated },
    warning: result.warning,
  };
}

let nextSlot = 0;

/** Une requête par seconde au plus vers le serveur de démonstration, même quand plusieurs tronçons partent ensemble. */
async function osrmTurn(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

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
  await osrmTurn();
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
