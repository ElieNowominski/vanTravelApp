import { describe, expect, it } from "vitest";
import { fallbackRoute, vanDurationSec } from "@/lib/van-time";

const vehicle = { timeFactor: 1.3, windingFactor: 1.15 };

describe("vanDurationSec", () => {
  it("applique le facteur van sur une route rapide", () => {
    const result = vanDurationSec(3600, 90, vehicle);
    expect(result.winding).toBe(false);
    expect(result.durationVanSec).toBe(Math.round(3600 * 1.3));
  });

  it("majore davantage une route lente", () => {
    const result = vanDurationSec(3600, 40, vehicle);
    expect(result.winding).toBe(true);
    expect(result.durationVanSec).toBe(Math.round(3600 * 1.3 * 1.15));
  });

  it("majore légèrement entre 48 et 58 km/h", () => {
    const result = vanDurationSec(3600, 55, vehicle);
    expect(result.winding).toBe(false);
    expect(result.durationVanSec).toBe(Math.round(3600 * 1.3 * 1.08));
  });
});

describe("fallbackRoute", () => {
  it("estime une distance routière supérieure au vol d'oiseau", () => {
    const result = fallbackRoute(100, vehicle);
    expect(result.distanceKm).toBeCloseTo(145);
    expect(result.durationVanSec).toBeGreaterThan(result.durationCarSec);
  });
});
