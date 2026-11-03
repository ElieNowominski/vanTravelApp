import {
  normalizeQuery,
  parsePhotonResults,
  photonReverseUrl,
  photonSearchUrl,
  waitBeforeRequest,
  type PlaceResult,
  type SearchOptions,
} from "@/lib/place-search";
import { quotaRefusalMessage } from "@/lib/quota";
import { consumeQuota } from "@/services/quota";
import { isSupabaseConfigured } from "@/services/supabase";
import { useAccountStore } from "@/store/account-store";

export type PlaceSearchOutcome =
  | { status: "ok"; results: PlaceResult[] }
  | { status: "offline" }
  | { status: "quota"; message: string }
  | { status: "error"; message: string };

const TIMEOUT_MS = 10_000;
const CACHE_SIZE = 60;

const cache = new Map<string, PlaceResult[]>();
let lastRequestAt: number | null = null;

function remember(key: string, results: PlaceResult[]): void {
  cache.delete(key);
  cache.set(key, results);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ms <= 0) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/**
 * Plafond d'usage (migration 0004) : une unité par requête réellement envoyée, pour un compte connecté.
 * Sans compte, ou si le compteur ne répond pas, la recherche part quand même : le plafond est un garde-fou
 * de courtoisie (ADR 0006), la protection de fond reste ici (fin de frappe, cache, une requête par seconde).
 */
async function quotaRefusal(): Promise<string | null> {
  if (!isSupabaseConfigured() || !useAccountStore.getState().user) return null;
  try {
    const result = await consumeQuota("geocode");
    return result.allowed ? null : quotaRefusalMessage("geocode", result);
  } catch {
    return null;
  }
}

async function fetchPhoton(url: string, signal?: AbortSignal): Promise<PlaceSearchOutcome> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { status: "offline" };
  await sleep(waitBeforeRequest(lastRequestAt, Date.now()), signal);
  const refusal = await quotaRefusal();
  if (refusal) return { status: "quota", message: refusal };
  signal?.throwIfAborted();
  lastRequestAt = Date.now();
  // Pas d'`AbortSignal.any` : absent des Safari d'iOS antérieurs à 17.4.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const forward = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", forward, { once: true });
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { status: "error", message: `Recherche de lieux indisponible (${res.status}).` };
    return { status: "ok", results: parsePhotonResults(await res.json()) };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return { status: "offline" };
    return { status: "error", message: "Recherche de lieux indisponible (réseau ou serveur)." };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forward);
  }
}

/**
 * Recherche de lieux sur OSM (Photon). Lève l'erreur d'annulation quand `signal` est annulé (frappe suivante) :
 * l'appelant l'ignore. Un résultat déjà vu ne repart pas vers Photon et ne compte pas dans le plafond.
 */
export async function searchPlaces(query: string, options: SearchOptions & { signal?: AbortSignal } = {}): Promise<PlaceSearchOutcome> {
  const bias = options.bias ? `${options.bias.lng.toFixed(1)},${options.bias.lat.toFixed(1)}` : "";
  const key = `${normalizeQuery(query)}|${bias}`;
  const hit = cache.get(key);
  if (hit) return { status: "ok", results: hit };
  const outcome = await fetchPhoton(photonSearchUrl(query, options), options.signal);
  if (outcome.status === "ok") remember(key, outcome.results);
  return outcome;
}

/** Lieu le plus proche d'un point (appui long sur la carte), pour proposer un nom. */
export async function reversePlace(point: { lng: number; lat: number }, signal?: AbortSignal): Promise<PlaceSearchOutcome> {
  const key = `reverse|${point.lng.toFixed(4)},${point.lat.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit) return { status: "ok", results: hit };
  const outcome = await fetchPhoton(photonReverseUrl(point), signal);
  if (outcome.status === "ok") remember(key, outcome.results);
  return outcome;
}
