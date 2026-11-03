import {
  POI_BACKOFF_MS,
  cellsCoveredBy,
  cellsForBounds,
  groupRequest,
  isCellFresh,
  mergePois,
  overpassBboxQuery,
  parseOverpass,
  planCorridor,
  planViewport,
  poiWait,
  splitByCell,
  withinCorridor,
  type Bounds,
  type Poi,
} from "@/lib/poi";
import { quotaRefusalMessage } from "@/lib/quota";
import type { Leg } from "@/lib/types";
import { getCells, getCorridor, putCells, putCorridor, type CachedCorridor } from "@/services/poi-cache";
import { consumeQuota } from "@/services/quota";
import { isSupabaseConfigured } from "@/services/supabase";
import { useAccountStore } from "@/store/account-store";

/**
 * Points d'intérêt OSM par Overpass (lot 5), depuis le navigateur. Une requête à la fois, deux secondes
 * d'écart au moins, pause de 30 s après un 429 ou un 406 (politique d'usage), une unité du plafond `poi`
 * par requête envoyée pour un compte connecté. Le navigateur ne laisse pas fixer le `User-Agent` : l'app se
 * reconnaît à l'en-tête `Origin` ou `Referer` qu'il envoie, ce que la politique accepte.
 * Le serveur principal sature souvent (502 « at capacity ») : on tente alors un second serveur public.
 */
const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const TIMEOUT_MS = 40_000;

export type PoiOutcome =
  | { status: "ok" }
  | { status: "offline" }
  | { status: "quota"; message: string }
  | { status: "busy"; message: string }
  | { status: "error"; message: string };

let lastRequestAt: number | null = null;
let pausedUntil: number | null = null;
let queue: Promise<unknown> = Promise.resolve();

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

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** Plafond `poi` (migration 0004) : même garde-fou que la recherche de lieux, muet sans compte ni réponse. */
async function quotaRefusal(): Promise<string | null> {
  if (!isSupabaseConfigured() || !useAccountStore.getState().user) return null;
  try {
    const result = await consumeQuota("poi");
    return result.allowed ? null : quotaRefusalMessage("poi", result);
  } catch {
    return null;
  }
}

async function post(url: string, query: string, signal?: AbortSignal): Promise<Response> {
  // Pas d'`AbortSignal.any` : absent des Safari d'iOS antérieurs à 17.4.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const forward = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", forward, { once: true });
  try {
    // Corps `application/x-www-form-urlencoded` : requête simple, sans prévol CORS.
    return await fetch(url, { method: "POST", body: new URLSearchParams({ data: query }), signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forward);
  }
}

type FetchResult = { status: "ok"; pois: Poi[] } | Exclude<PoiOutcome, { status: "ok" }>;

async function runQuery(query: string, signal?: AbortSignal): Promise<FetchResult> {
  if (isOffline()) return { status: "offline" };
  await sleep(poiWait(lastRequestAt, pausedUntil, Date.now()), signal);
  const refusal = await quotaRefusal();
  if (refusal) return { status: "quota", message: refusal };
  signal?.throwIfAborted();
  // Saturation (5xx, délai dépassé côté serveur) ou échec réseau, pour choisir le message.
  let busy = false;
  for (const url of ENDPOINTS) {
    lastRequestAt = Date.now();
    try {
      const res = await post(url, query, signal);
      if (res.status === 429 || res.status === 406) {
        pausedUntil = Date.now() + POI_BACKOFF_MS;
        return { status: "busy", message: "Overpass demande de ralentir : nouvel essai possible dans 30 s." };
      }
      if (res.ok) {
        const json = (await res.json()) as { remark?: string };
        // Délai ou mémoire dépassés côté serveur : réponse 200 avec une remarque et des éléments partiels.
        if (typeof json.remark === "string" && /error/i.test(json.remark)) {
          busy = true;
          continue;
        }
        return { status: "ok", pois: parseOverpass(json) };
      }
      busy = true;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (isOffline()) return { status: "offline" };
    }
  }
  return busy
    ? { status: "busy", message: "Serveurs Overpass saturés : points d'intérêt indisponibles pour l'instant." }
    : { status: "error", message: "Points d'intérêt indisponibles (réseau ou serveur)." };
}

/** File d'attente : une requête Overpass à la fois, dans l'ordre d'arrivée. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

export type ViewportPois = PoiOutcome & {
  /** `zoom` : sous le zoom minimal ; `too-wide` : trop de cases pour une requête. */
  scope: "zoom" | "too-wide" | "area";
  pois: Poi[];
};

/**
 * Points d'intérêt de la zone affichée : cache d'abord (cases fraîches), puis une requête sur le rectangle
 * des cases manquantes. Hors ligne ou en cas d'échec, rend ce que le cache a, avec le statut.
 */
export async function loadViewportPois(bounds: Bounds, zoom: number, signal?: AbortSignal): Promise<ViewportPois> {
  const keys = cellsForBounds(bounds);
  const now = Date.now();
  const plan = planViewport(bounds, zoom, () => true);
  if (plan.status === "zoom") return { status: "ok", scope: "zoom", pois: [] };
  if (plan.status === "too-wide") return { status: "ok", scope: "too-wide", pois: [] };
  const cached = await getCells(keys);
  const fresh = planViewport(bounds, zoom, (key) => isCellFresh(cached.get(key)?.at, now));
  const fromCache = () => mergePois(...keys.map((key) => cached.get(key)?.pois ?? []));
  if (fresh.status !== "fetch") return { status: "ok", scope: "area", pois: fromCache() };
  const result = await enqueue(() => runQuery(overpassBboxQuery(fresh.bounds), signal));
  if (result.status !== "ok") return { ...result, scope: "area", pois: fromCache() };
  const split = splitByCell(result.pois, cellsCoveredBy(fresh.bounds));
  await putCells(split, Date.now());
  for (const [key, pois] of split) cached.set(key, { at: Date.now(), pois });
  return { status: "ok", scope: "area", pois: fromCache() };
}

export type CorridorProgress = { done: number; total: number };

export type CorridorState = PoiOutcome & CorridorProgress & { pois: Poi[]; upToDate: boolean };

/** Couloir en cache pour ce voyage, et s'il correspond encore aux tracés. */
export async function readCorridor(tripId: string, legs: Leg[], dayCount: number): Promise<{ corridor: CachedCorridor | null; upToDate: boolean; total: number }> {
  const plan = planCorridor(legs, dayCount);
  const corridor = await getCorridor(tripId);
  const upToDate = corridor != null && corridor.signature === plan.signature && corridor.groups.length >= plan.groups.length;
  return { corridor, upToDate, total: plan.groups.length };
}

/**
 * Met en cache les points d'intérêt le long des tracés figés : une requête par groupe de cases, sauf si la
 * carte les a déjà en cache. Chaque groupe fait est enregistré aussitôt (`groups`),
 * pour qu'une coupure de réseau ou le plafond n'oblige pas à tout refaire. S'arrête au premier échec.
 */
export async function cacheCorridor(
  tripId: string,
  legs: Leg[],
  dayCount: number,
  onProgress?: (progress: CorridorProgress) => void,
): Promise<CorridorState> {
  const plan = planCorridor(legs, dayCount);
  const previous = await getCorridor(tripId);
  const sameRoute = previous?.signature === plan.signature;
  const doneGroups = new Set(sameRoute ? previous.groups : []);
  let pois = sameRoute ? previous.pois : [];
  const total = plan.groups.length;
  const save = () => putCorridor(tripId, { signature: plan.signature, at: Date.now(), groups: [...doneGroups], pois });
  onProgress?.({ done: doneGroups.size, total });

  for (let index = 0; index < total; index++) {
    if (doneGroups.has(index)) continue;
    const { bounds, cells } = groupRequest(plan.groups[index]);
    const cached = await getCells(cells);
    const now = Date.now();
    let found: Poi[];
    if (cells.every((key) => isCellFresh(cached.get(key)?.at, now))) {
      found = cells.flatMap((key) => cached.get(key)?.pois ?? []);
    } else {
      const result = await enqueue(() => runQuery(overpassBboxQuery(bounds)));
      if (result.status !== "ok") {
        await save();
        return { ...result, done: doneGroups.size, total, pois, upToDate: false };
      }
      found = result.pois;
      await putCells(splitByCell(found, cells), Date.now());
    }
    pois = mergePois(pois, withinCorridor(found, plan.lines));
    doneGroups.add(index);
    await save();
    onProgress?.({ done: doneGroups.size, total });
  }
  return { status: "ok", done: total, total, pois, upToDate: true };
}
