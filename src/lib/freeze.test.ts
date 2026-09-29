import { describe, expect, it } from "vitest";
import { countDroppedOptions, formatBytes, freezeSnapshot, isFrozen, jsonBytes, unfreezeSnapshot } from "@/lib/freeze";
import type { Leg, RouteOption, TripSnapshot } from "@/lib/types";

function option(label: string, points: number): RouteOption {
  return {
    label,
    distanceKm: 100,
    durationCarSec: 3600,
    durationVanSec: 4680,
    winding: false,
    geometry: {
      type: "LineString",
      coordinates: Array.from({ length: points }, (_, i) => [170 + i / 1000, -44 + i / 1000]),
    },
  };
}

const leg: Leg = {
  id: "leg-1",
  fromStopId: "s1",
  toStopId: "s2",
  dayIndex: 0,
  options: [option("A", 400), option("B", 500), option("C", 300)],
  selectedIndex: 1,
  estimated: false,
};

const snapshot: TripSnapshot = {
  days: [{ date: "2027-02-07", label: "7 févr.", weekday: "Dim", locked: true, overnightStopId: "s2", stopIds: ["s1", "s2"] }],
  stops: {},
  legs: [leg, { ...leg, id: "leg-2", options: [option("D", 200)], selectedIndex: 0 }],
  customPins: [],
  currentDayIndex: 0,
};

describe("freezeSnapshot", () => {
  it("ne garde que la géométrie choisie par tronçon", () => {
    const frozen = freezeSnapshot(snapshot, new Date("2026-09-29T10:00:00Z"));
    expect(frozen.legs[0].options).toHaveLength(1);
    expect(frozen.legs[0].options[0].label).toBe("B");
    expect(frozen.legs[0].selectedIndex).toBe(0);
    expect(frozen.legs[1].options[0].label).toBe("D");
    expect(frozen.frozenAt).toBe("2026-09-29T10:00:00.000Z");
    expect(isFrozen(frozen)).toBe(true);
  });

  it("allège le stockage et ne touche pas au snapshot d'origine", () => {
    const before = jsonBytes(snapshot);
    const frozen = freezeSnapshot(snapshot);
    expect(jsonBytes(frozen)).toBeLessThan(before);
    expect(snapshot.legs[0].options).toHaveLength(3);
    expect(isFrozen(snapshot)).toBe(false);
  });

  it("se défige sans restaurer les alternatives", () => {
    const back = unfreezeSnapshot(freezeSnapshot(snapshot));
    expect(back.frozenAt).toBeNull();
    expect(back.legs[0].options).toHaveLength(1);
  });

  it("compte les alternatives retirées", () => {
    expect(countDroppedOptions(snapshot.legs)).toBe(2);
    expect(countDroppedOptions(freezeSnapshot(snapshot).legs)).toBe(0);
  });

  it("formate des tailles lisibles", () => {
    expect(formatBytes(512)).toBe("512 o");
    expect(formatBytes(20 * 1024)).toBe("20 Ko");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2,5 Mo");
  });
});
