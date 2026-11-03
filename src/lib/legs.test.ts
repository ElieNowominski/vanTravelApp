import { describe, expect, it } from "vitest";
import { legDistanceKm, legDurationSec, selectedOption } from "@/lib/legs";
import type { Leg, RouteOption } from "@/lib/types";

const option = (durationSec: number, distanceKm: number): RouteOption => ({
  geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
  distanceKm,
  durationRawSec: durationSec,
  durationSec,
  winding: false,
  label: "",
});

const road: Leg = {
  id: "l1",
  fromStopId: "a",
  toStopId: "b",
  dayIndex: 0,
  mode: "van",
  track: "calcule",
  options: [option(3600, 80), option(4000, 70)],
  selectedIndex: 1,
  estimated: false,
};

describe("durée et distance d'un tronçon", () => {
  it("suit l'option choisie d'un tronçon calculé", () => {
    expect(selectedOption(road)?.durationSec).toBe(4000);
    expect(legDurationSec(road)).toBe(4000);
    expect(legDistanceKm(road)).toBe(70);
  });

  it("lit la saisie manuelle d'un tronçon sans tracé, zéro si elle manque", () => {
    const ferry: Leg = { ...road, mode: "ferry", track: "aucun", options: [], manual: { durationSec: 11_700, distanceKm: 140 } };
    expect(legDurationSec(ferry)).toBe(11_700);
    expect(legDistanceKm(ferry)).toBe(140);
    expect(legDurationSec({ ...ferry, manual: undefined })).toBe(0);
  });
});
