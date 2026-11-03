import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import reference from "../../fixtures/reference-scandinavie.json";
import { POI_MIN_ZOOM, cellOf, planCorridor, type Poi } from "@/lib/poi";
import type { Leg } from "@/lib/types";
import type { CachedCell, CachedCorridor } from "@/services/poi-cache";

const fetchMock = vi.fn();
const cells = new Map<string, CachedCell>();
const corridors = new Map<string, CachedCorridor>();
const quota = { connected: false, allowed: true };

vi.mock("@/services/poi-cache", () => ({
  getCells: async (keys: string[]) => new Map(keys.filter((k) => cells.has(k)).map((k) => [k, cells.get(k)!])),
  putCells: async (map: Map<string, Poi[]>, at: number) => {
    for (const [key, pois] of map) cells.set(key, { at, pois });
  },
  getCorridor: async (id: string) => corridors.get(id) ?? null,
  putCorridor: async (id: string, value: CachedCorridor) => {
    corridors.set(id, structuredClone(value));
  },
}));
vi.mock("@/services/supabase", () => ({ isSupabaseConfigured: () => quota.connected }));
vi.mock("@/store/account-store", () => ({ useAccountStore: { getState: () => ({ user: quota.connected ? { id: "u" } : null }) } }));
vi.mock("@/services/quota", () => ({
  consumeQuota: vi.fn(async () =>
    quota.allowed ? { allowed: true, used: 1, limit: 50, remaining: 49 } : { allowed: false, scope: "user", used: 50, limit: 50, resetAt: null },
  ),
}));

const bergen = { west: 5.25, south: 60.33, east: 5.39, north: 60.45 };
const answer = (elements: unknown[]) => new Response(JSON.stringify({ version: 0.6, elements }));
const fountain = { type: "node", id: 1, lat: 60.3975884, lon: 5.3330296, tags: { amenity: "drinking_water", name: "Hesten" } };

/** Module neuf à chaque test : la cadence et la pause repartent de zéro. */
async function load() {
  vi.resetModules();
  return import("@/services/overpass");
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  cells.clear();
  corridors.clear();
  quota.connected = false;
  quota.allowed = true;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("points d'intérêt de la zone affichée", () => {
  it("n'interroge rien sous le zoom minimal", async () => {
    const { loadViewportPois } = await load();
    const result = await loadViewportPois(bergen, POI_MIN_ZOOM - 1);
    expect(result).toMatchObject({ status: "ok", scope: "zoom", pois: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("interroge une fois en POST, puis sert le cache", async () => {
    fetchMock.mockResolvedValue(answer([fountain]));
    const { loadViewportPois } = await load();
    const first = await loadViewportPois(bergen, 12);
    expect(first.pois.map((p) => p.id)).toEqual(["osm:n1"]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://overpass-api.de/api/interpreter");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("data=");
    const again = await loadViewportPois(bergen, 12);
    expect(again.pois.map((p) => p.id)).toEqual(["osm:n1"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Les cases sans résultat sont aussi en cache : pas de nouvelle requête pour elles.
    expect([...cells.keys()]).toContain(cellOf(5.38, 60.44));
  });

  it("passe au second serveur quand le premier sature", async () => {
    fetchMock.mockResolvedValueOnce(new Response("# 502 Gateway Timeout", { status: 502 })).mockResolvedValueOnce(answer([fountain]));
    const { loadViewportPois } = await load();
    const result = await loadViewportPois(bergen, 12);
    expect(result.status).toBe("ok");
    expect(fetchMock.mock.calls[1][0]).toBe("https://overpass.private.coffee/api/interpreter");
  });

  it("rend le cache et le dit quand les deux serveurs saturent", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 504 }));
    const { loadViewportPois } = await load();
    const result = await loadViewportPois(bergen, 12);
    expect(result).toMatchObject({ status: "busy", pois: [] });
  });

  it("ne repart pas avant 30 s après un 429", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(new Response("", { status: 429 })).mockResolvedValue(answer([fountain]));
    const { loadViewportPois } = await load();
    expect((await loadViewportPois(bergen, 12)).status).toBe("busy");
    const pending = loadViewportPois(bergen, 12);
    await vi.advanceTimersByTimeAsync(29_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await pending).status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("respecte le plafond d'un compte connecté sans appeler Overpass", async () => {
    quota.connected = true;
    quota.allowed = false;
    const { loadViewportPois } = await load();
    const result = await loadViewportPois(bergen, 12);
    expect(result.status).toBe("quota");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("couloir du tracé figé", () => {
  const trip = reference.savedTrips[0] as unknown as { legs: Leg[]; days: unknown[] };
  const day0 = trip.legs.filter((l) => l.dayIndex === 0);

  /** Deux secondes entre deux requêtes : le temps passe en accéléré. */
  async function run<T>(promise: Promise<T>): Promise<T> {
    await vi.runAllTimersAsync();
    return promise;
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("interroge chaque groupe, garde l'avancement, et reprend où il s'était arrêté", async () => {
    const { cacheCorridor, readCorridor } = await load();
    const total = planCorridor(day0, 1).groups.length;
    expect(total).toBeGreaterThan(1);
    // Premier groupe servi, puis réseau coupé (les deux serveurs échouent).
    fetchMock.mockResolvedValueOnce(answer([])).mockRejectedValue(new TypeError("Failed to fetch"));
    const cut = await run(cacheCorridor("trip-1", day0, 1));
    expect(cut).toMatchObject({ status: "error", done: 1, total, upToDate: false });
    expect(corridors.get("trip-1")?.groups).toEqual([0]);

    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => answer([]));
    const progress: number[] = [];
    const done = await run(cacheCorridor("trip-1", day0, 1, (p) => progress.push(p.done)));
    expect(done).toMatchObject({ status: "ok", done: total, upToDate: true });
    expect(fetchMock).toHaveBeenCalledTimes(total - 1);
    expect(progress[0]).toBe(1);
    expect((await readCorridor("trip-1", day0, 1)).upToDate).toBe(true);
    expect((await readCorridor("trip-1", trip.legs, trip.days.length)).upToDate).toBe(false);
  });

  it("réutilise les cases déjà vues sur la carte", async () => {
    fetchMock.mockImplementation(async () => answer([]));
    const { cacheCorridor } = await load();
    await run(cacheCorridor("trip-1", day0, 1));
    const calls = fetchMock.mock.calls.length;
    corridors.clear();
    await run(cacheCorridor("trip-2", day0, 1));
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
