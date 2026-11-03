import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { profileFromPreset } from "@/lib/profiles";

const fetchMock = vi.fn();
const bergen = { lng: 5.3259, lat: 60.3943 };
const flam = { lng: 7.1137, lat: 60.8628 };

const osrm = {
  code: "Ok",
  routes: [
    { distance: 166_000, duration: 9000, geometry: { type: "LineString", coordinates: [[5.3259, 60.3943], [7.1137, 60.8628]] } },
    { distance: 190_000, duration: 9600, geometry: { type: "LineString", coordinates: [[5.3259, 60.3943], [7.1137, 60.8628]] } },
  ],
};

/** Module neuf à chaque test : la cadence d'OSRM repart de zéro. */
async function load() {
  vi.resetModules();
  return import("@/services/routing");
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("routage par tronçon", () => {
  it("ne contacte aucun serveur pour un train ou un ferry : tronçon sans tracé, estimé", async () => {
    const { routeLeg } = await load();
    const { leg } = await routeLeg(bergen, flam, "ferry", profileFromPreset("van"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(leg).toMatchObject({ mode: "ferry", track: "aucun", options: [], estimated: true });
    expect(leg.manual?.durationSec).toBeGreaterThan(0);
    expect(leg.manual?.distanceKm).toBeGreaterThan(100);
  });

  it("calcule un tronçon routier par OSRM, durée ajustée par le profil", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(osrm)));
    const { routeLeg } = await load();
    const { leg: van } = await routeLeg(bergen, flam, "van", profileFromPreset("van"));
    expect(fetchMock.mock.calls[0][0]).toContain("router.project-osrm.org/route/v1/driving/5.3259,60.3943;7.1137,60.8628");
    expect(van).toMatchObject({ mode: "van", track: "calcule", estimated: false, selectedIndex: 0 });
    expect(van.options).toHaveLength(2);
    expect(van.options[0].durationRawSec).toBe(9000);
    expect(van.options[0].durationSec).toBeGreaterThan(9000);
    const { leg: car } = await routeLeg(bergen, flam, "voiture", profileFromPreset("voiture"));
    expect(car.options[0].durationSec).toBeLessThan(van.options[0].durationSec);
  });

  it("espace les requêtes OSRM d'une seconde", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(osrm)));
    const { routeLeg } = await load();
    const first = routeLeg(bergen, flam, "van", profileFromPreset("van"));
    const second = routeLeg(flam, bergen, "van", profileFromPreset("van"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await Promise.all([first, second]);
  });

  it("se replie sur une ligne droite estimée quand OSRM échoue", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 503 }));
    const { routeLeg } = await load();
    const { leg, warning } = await routeLeg(bergen, flam, "moto", profileFromPreset("moto"));
    expect(leg).toMatchObject({ mode: "moto", track: "calcule", estimated: true });
    expect(warning).toBe("OSRM 503");
    expect(leg.options[0].geometry.coordinates).toHaveLength(2);
  });
});
