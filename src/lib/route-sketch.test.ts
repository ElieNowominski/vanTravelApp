import { describe, expect, it } from "vitest";
import { sketchDay } from "@/lib/route-sketch";
import type { Stop, TripSnapshot } from "@/lib/types";

function stop(id: string, name: string, lng: number, lat: number): Stop {
  return { id, placeId: id, name, lng, lat, kind: "town", isOvernight: false, activities: [], bookings: [], documents: [], checklist: [] };
}

const snapshot: TripSnapshot = {
  currentDayIndex: 0,
  customPins: [],
  days: [
    { date: "2027-02-07", label: "", weekday: "", locked: true, overnightStopId: "s2", stopIds: ["s1", "s2"], expenses: [] },
    { date: "2027-02-08", label: "", weekday: "", locked: true, overnightStopId: "s3", stopIds: ["s3"], expenses: [] },
    { date: "2027-02-09", label: "", weekday: "", locked: false, overnightStopId: null, stopIds: [], expenses: [] },
  ],
  stops: { s1: stop("s1", "A", 172.6, -43.5), s2: stop("s2", "B", 170.5, -44.0), s3: stop("s3", "C", 169.1, -44.7) },
  legs: [
    {
      id: "l1", fromStopId: "s1", toStopId: "s2", dayIndex: 0, selectedIndex: 0, estimated: false,
      options: [{ label: "", distanceKm: 1, durationCarSec: 1, durationVanSec: 1, winding: false, geometry: { type: "LineString", coordinates: [[172.6, -43.5], [171.5, -43.8], [170.5, -44.0]] } }],
    },
    {
      id: "l2", fromStopId: "s2", toStopId: "s3", dayIndex: 1, selectedIndex: 0, estimated: true,
      options: [{ label: "", distanceKm: 1, durationCarSec: 1, durationVanSec: 1, winding: false, geometry: { type: "LineString", coordinates: [[170.5, -44.0], [169.1, -44.7]] } }],
    },
  ],
};

describe("sketchDay", () => {
  it("projette tracé et étapes dans le cadre avec marge", () => {
    const sketch = sketchDay(snapshot, 0, { width: 300, height: 200, padding: 20 })!;
    expect(sketch.paths).toHaveLength(1);
    expect(sketch.paths[0].d.startsWith("M")).toBe(true);
    expect(sketch.points.map((p) => p.label)).toEqual(["A", "B"]);
    for (const p of sketch.points) {
      expect(p.x).toBeGreaterThanOrEqual(20);
      expect(p.x).toBeLessThanOrEqual(280);
      expect(p.y).toBeGreaterThanOrEqual(20);
      expect(p.y).toBeLessThanOrEqual(180);
    }
    // A est à l'est (droite) et au nord (haut) de B.
    const [a, b] = sketch.points;
    expect(a.x).toBeGreaterThan(b.x);
    expect(a.y).toBeLessThan(b.y);
    expect(b.overnight).toBe(true);
    expect(sketch.spanKm).toBeGreaterThan(100);
  });

  it("inclut le départ hérité de la veille avec un ordre 0", () => {
    const sketch = sketchDay(snapshot, 1)!;
    expect(sketch.points.map((p) => [p.label, p.order])).toEqual([["B", 0], ["C", 1]]);
    expect(sketch.paths[0].estimated).toBe(true);
  });

  it("rend null sans rien à dessiner", () => {
    expect(sketchDay(snapshot, 2)).toBeNull();
    expect(sketchDay(snapshot, 7)).toBeNull();
  });
});
