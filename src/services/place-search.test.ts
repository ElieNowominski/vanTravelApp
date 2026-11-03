import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consumeQuota = vi.fn();
let user: { id: string } | null = null;

vi.mock("@/services/quota", () => ({ consumeQuota: (...args: unknown[]) => consumeQuota(...args) }));
vi.mock("@/services/supabase", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/store/account-store", () => ({ useAccountStore: { getState: () => ({ user }) } }));

const photon = {
  features: [
    {
      type: "Feature",
      properties: { osm_type: "R", osm_id: 404159, osm_key: "place", osm_value: "municipality", name: "Bergen", country: "Norvège" },
      geometry: { type: "Point", coordinates: [5.3259, 60.3943] },
    },
  ],
};

const fetchMock = vi.fn();

/** Module neuf à chaque test : cache et horodatage de la dernière requête repartent de zéro. */
async function load() {
  vi.resetModules();
  return import("@/services/place-search");
}

beforeEach(() => {
  user = null;
  consumeQuota.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => photon });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchPlaces", () => {
  it("interroge Photon sans compte, sans consulter le plafond, puis sert le cache", async () => {
    const { searchPlaces } = await load();
    const first = await searchPlaces("Bergen");
    expect(first).toMatchObject({ status: "ok", results: [{ placeId: "osm:R404159", name: "Bergen" }] });
    expect(String(fetchMock.mock.calls[0][0])).toContain("photon.komoot.io/api/?q=Bergen");
    expect(consumeQuota).not.toHaveBeenCalled();

    await searchPlaces("  bergen ");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("compte une unité par requête envoyée pour un compte connecté", async () => {
    user = { id: "u1" };
    consumeQuota.mockResolvedValue({ allowed: true, used: 1, limit: 500, remaining: 499 });
    const { searchPlaces } = await load();
    await searchPlaces("Bergen");
    expect(consumeQuota).toHaveBeenCalledWith("geocode");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("n'appelle pas Photon au plafond et le dit", async () => {
    user = { id: "u1" };
    consumeQuota.mockResolvedValue({ allowed: false, scope: "user", used: 500, limit: 500, resetAt: null });
    const { searchPlaces } = await load();
    const outcome = await searchPlaces("Bergen");
    expect(outcome.status).toBe("quota");
    expect(outcome.status === "quota" && outcome.message).toContain("Plafond du jour atteint pour ton compte");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cherche quand même si le compteur ne répond pas (garde-fou, pas barrière)", async () => {
    user = { id: "u1" };
    consumeQuota.mockRejectedValue(new Error("réseau"));
    const { searchPlaces } = await load();
    expect((await searchPlaces("Bergen")).status).toBe("ok");
  });

  it("signale une erreur du serveur sans lever", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    const { searchPlaces } = await load();
    expect(await searchPlaces("Bergen")).toEqual({ status: "error", message: "Recherche de lieux indisponible (429)." });
  });

  it("espace deux requêtes d'au moins une seconde", async () => {
    vi.useFakeTimers();
    try {
      const { searchPlaces } = await load();
      await searchPlaces("Bergen");
      const second = searchPlaces("Oslo");
      await vi.advanceTimersByTimeAsync(900);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(200);
      await second;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
