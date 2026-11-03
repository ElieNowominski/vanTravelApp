import { describe, expect, it } from "vitest";
import { fallbackRoute, profileDurationSec } from "@/lib/travel-time";

const profile = { timeFactor: 1.3, windingFactor: 1.15 };

describe("profileDurationSec", () => {
  it("applique le facteur du profil sur une route rapide", () => {
    const result = profileDurationSec(3600, 90, profile);
    expect(result.winding).toBe(false);
    expect(result.durationSec).toBe(Math.round(3600 * 1.3));
  });

  it("majore davantage une route lente", () => {
    const result = profileDurationSec(3600, 40, profile);
    expect(result.winding).toBe(true);
    expect(result.durationSec).toBe(Math.round(3600 * 1.3 * 1.15));
  });

  it("majore légèrement entre 48 et 58 km/h", () => {
    const result = profileDurationSec(3600, 55, profile);
    expect(result.winding).toBe(false);
    expect(result.durationSec).toBe(Math.round(3600 * 1.3 * 1.08));
  });
});

describe("fallbackRoute", () => {
  it("estime une distance routière supérieure au vol d'oiseau", () => {
    const result = fallbackRoute(100, profile);
    expect(result.distanceKm).toBeCloseTo(145);
    expect(result.durationSec).toBeGreaterThan(result.durationRawSec);
  });
});
