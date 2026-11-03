import { describe, expect, it } from "vitest";
import { formatDuration } from "@/lib/format";
import {
  applyManualInput,
  dayModesLabel,
  durationFromClocks,
  estimateManualLeg,
  legCoordinates,
  legDistanceKm,
  legDurationSec,
  legSummary,
  parseClock,
  parseDurationInput,
  roadDurationSec,
  selectedOption,
  type ManualLegInput,
} from "@/lib/legs";
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

describe("tronçons saisis à la main", () => {
  const copenhague = { lng: 12.5683, lat: 55.6761 };
  const aarhus = { lng: 10.2039, lat: 56.1629 };
  const blank: ManualLegInput = { departAt: "", arriveAt: "", duration: "", distanceKm: "", operator: "", price: null, notes: "" };
  const ferry: Leg = { ...road, mode: "ferry", track: "aucun", options: [], estimated: true, manual: { durationSec: 18_000, distanceKm: 150 } };

  it("estime durée et distance selon le mode, au pas de cinq minutes", () => {
    const train = estimateManualLeg("train", copenhague, aarhus);
    const walk = estimateManualLeg("marche", copenhague, aarhus);
    expect(train.distanceKm).toBeGreaterThan(190);
    expect(train.distanceKm).toBeLessThan(200);
    expect(train.durationSec! % 300).toBe(0);
    expect(walk.durationSec!).toBeGreaterThan(train.durationSec! * 15);
    expect(estimateManualLeg("ferry", copenhague, copenhague).durationSec).toBe(300);
  });

  it("lit les heures et les durées telles qu'on les tape", () => {
    expect(parseClock("8 h 05")).toBe(485);
    expect(parseClock("08:30")).toBe(510);
    expect(parseClock("21h")).toBe(1260);
    expect(parseClock("25 h")).toBeNull();
    expect(parseClock("vers midi")).toBeNull();
    expect(durationFromClocks("8 h 00", "11 h 15")).toBe(11_700);
    expect(durationFromClocks("22 h 30", "6 h 10")).toBe(27_600);
    expect(durationFromClocks("8 h", "")).toBeNull();
    expect(parseDurationInput("3 h 15")).toBe(11_700);
    expect(parseDurationInput("3h15")).toBe(11_700);
    expect(parseDurationInput("3:15")).toBe(11_700);
    expect(parseDurationInput("45 min")).toBe(2700);
    expect(parseDurationInput("2")).toBe(7200);
    expect(parseDurationInput("1,5")).toBe(5400);
    expect(parseDurationInput("0")).toBeNull();
    expect(parseDurationInput("3 h 75")).toBeNull();
    expect(parseDurationInput("")).toBeNull();
  });

  it("relit ce qu'affiche formatDuration", () => {
    for (const sec of [300, 3600, 11_700, 45_000]) expect(parseDurationInput(formatDuration(sec))).toBe(sec);
  });

  it("prend la durée saisie, sinon celle des heures, sinon garde l'estimation", () => {
    const typed = applyManualInput(ferry, { ...blank, duration: "3 h 15", departAt: "8 h", arriveAt: "12 h" });
    expect(typed.manual).toMatchObject({ durationSec: 11_700, departAt: "8 h", arriveAt: "12 h" });
    expect(typed.estimated).toBe(false);
    const clocks = applyManualInput(ferry, { ...blank, departAt: "8 h 00", arriveAt: "11 h 15", operator: " Fjord Line " });
    expect(clocks.manual).toEqual({ durationSec: 11_700, distanceKm: 150, departAt: "8 h 00", arriveAt: "11 h 15", operator: "Fjord Line" });
    const untouched = applyManualInput(ferry, { ...blank, operator: "Fjord Line" });
    expect(untouched.manual?.durationSec).toBe(18_000);
    expect(untouched.estimated).toBe(true);
  });

  it("lit la distance et le prix, ignore une distance illisible", () => {
    const leg = applyManualInput(ferry, { ...blank, distanceKm: "140,5", price: { amount: 89, currency: "NOK" } });
    expect(leg.manual).toMatchObject({ distanceKm: 140.5, price: { amount: 89, currency: "NOK" } });
    expect(applyManualInput(ferry, { ...blank, distanceKm: "loin" }).manual?.distanceKm).toBe(150);
  });

  it("trace la route retenue, ou la ligne droite entre les étapes", () => {
    const stops = { a: copenhague, b: aarhus };
    expect(legCoordinates(road, stops)).toEqual([[0, 0], [1, 1]]);
    expect(legCoordinates(ferry, stops)).toEqual([[12.5683, 55.6761], [10.2039, 56.1629]]);
    expect(legCoordinates(ferry, { a: copenhague })).toEqual([]);
  });

  it("résume un tronçon et les modes du jour", () => {
    const timed = applyManualInput(ferry, { ...blank, departAt: "8 h 00", arriveAt: "11 h 15", distanceKm: "140" });
    expect(legSummary(timed)).toBe("Ferry · 8 h 00 → 11 h 15 · 3 h 15 · 140 km");
    expect(legSummary(ferry)).toBe("Ferry · 5 h · 150 km · estimé");
    expect(legSummary(road)).toBe("Van · 1 h 07 · 70 km");
    expect(dayModesLabel([road, road])).toBe("en van");
    expect(dayModesLabel([road, ferry, { ...road, mode: "marche" }])).toBe("en van, ferry et marche");
    expect(dayModesLabel([])).toBe("");
  });

  it("ne compte que les tronçons routiers dans le temps au volant", () => {
    expect(roadDurationSec([road, ferry])).toBe(4000);
  });
});
