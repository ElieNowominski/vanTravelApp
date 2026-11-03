import { describe, expect, it } from "vitest";
import { placeZone } from "@/lib/place-zone";
import { bboxOf, computeZone, currentTravelDate, dayTimeZone, initialMapView, mapBounds, tripPoints, zoneLabel } from "@/lib/zone";
import type { Stop, TripDay } from "@/lib/types";

const stop = (id: string, lng: number, lat: number): Stop => ({
  id,
  placeId: id,
  name: id,
  lng,
  lat,
  kind: "town",
  isOvernight: false,
  activities: [],
  bookings: [],
  documents: [],
  checklist: [],
});

const day = (date: string, stopIds: string[], overnightStopId: string | null = null): TripDay => ({
  date,
  label: "",
  weekday: "",
  locked: false,
  overnightStopId,
  stopIds,
  expenses: [],
});

const stops = {
  cph: stop("cph", 12.57, 55.68),
  osl: stop("osl", 10.75, 59.91),
  sto: stop("sto", 18.07, 59.33),
  akl: stop("akl", 174.76, -36.85),
};

describe("placeZone (bibliothèques embarquées, sans réseau)", () => {
  it("donne fuseau et pays de villes connues", () => {
    expect(placeZone(10.75, 59.91)).toEqual({ timeZone: "Europe/Oslo", countryCode: "NO" });
    expect(placeZone(18.07, 59.33)).toEqual({ timeZone: "Europe/Stockholm", countryCode: "SE" });
    expect(placeZone(168.66, -45.03)).toEqual({ timeZone: "Pacific/Auckland", countryCode: "NZ" });
    expect(placeZone(-4.49, 48.39)).toEqual({ timeZone: "Europe/Paris", countryCode: "FR" });
  });

  it("en mer : un fuseau, pas de pays", () => {
    expect(placeZone(3, 57).countryCode).toBeUndefined();
  });
});

describe("zone du voyage", () => {
  const config = {
    start: { placeId: "cph", date: "2027-06-01", lng: 12.57, lat: 55.68 },
    end: { placeId: "sto", date: "2027-06-03", lng: 18.07, lat: 59.33 },
  };
  const snapshot = { days: [day("2027-06-01", ["cph"]), day("2027-06-02", ["osl"], "osl"), day("2027-06-03", ["sto"])], stops };

  it("tripPoints suit l'ordre : départ, étapes jour par jour, arrivée", () => {
    expect(tripPoints(config, snapshot).map((p) => p.lng)).toEqual([12.57, 12.57, 10.75, 18.07, 18.07]);
  });

  it("pays dans l'ordre du voyage, sans doublon, et emprise", () => {
    const zone = computeZone(tripPoints(config, snapshot), placeZone);
    expect(zone.countries).toEqual(["DK", "NO", "SE"]);
    expect(zone.bbox).toEqual({ xmin: 10.75, ymin: 55.68, xmax: 18.07, ymax: 59.91 });
  });

  it("sans bibliothèque chargée : l'emprise seule", () => {
    expect(computeZone(tripPoints(config, snapshot), null).countries).toEqual([]);
  });

  it("libellé en français, au-delà de trois pays résumé", () => {
    expect(zoneLabel(["NO", "SE"])).toBe("Norvège, Suède");
    expect(zoneLabel(["DK", "NO", "SE", "FI", "EE"])).toBe("Danemark, Norvège, Suède et 2 autres");
    expect(zoneLabel([])).toBe("");
  });

  it("cadre de carte : un voyage d'un seul point reste lisible, rien de positionné donne l'Europe", () => {
    const bounds = mapBounds(bboxOf([{ lng: 10, lat: 60 }]));
    expect(bounds).not.toBeNull();
    if (bounds) expect(bounds[1][0] - bounds[0][0]).toBeCloseTo(0.5);
    expect(initialMapView([])).toEqual({ center: [10, 50], zoom: 3 });
  });
});

describe("fuseau du jour et date en voyage", () => {
  it("fuseau d'un jour : sa nuit, sinon sa dernière étape, sinon le repli", () => {
    const snapshot = { days: [day("2027-06-01", ["cph", "osl"]), day("2027-06-02", ["osl", "sto"], "osl"), day("2027-06-03", [])], stops };
    expect(dayTimeZone(snapshot, 0, placeZone, "UTC")).toBe("Europe/Oslo");
    expect(dayTimeZone(snapshot, 1, placeZone, "UTC")).toBe("Europe/Oslo");
    expect(dayTimeZone(snapshot, 2, placeZone, "UTC")).toBe("UTC");
    expect(dayTimeZone(snapshot, 0, null, "UTC")).toBe("UTC");
  });

  it("un voyage en Nouvelle-Zélande vit à l'heure d'Auckland, pas de l'appareil", () => {
    // 1er février 2027, 20 h UTC : déjà le 2 février à Auckland (UTC+13).
    const now = new Date("2027-02-01T20:00:00Z");
    const snapshot = { days: [day("2027-02-01", ["akl"]), day("2027-02-02", ["akl"], "akl")], stops };
    const config = { start: { placeId: "akl", date: "2027-02-01", lng: 174.76, lat: -36.85 } };
    expect(currentTravelDate(snapshot, config, placeZone, now)).toBe("2027-02-02");
  });

  it("hors des dates du voyage : aujourd'hui dans le fuseau du départ", () => {
    const now = new Date("2027-01-10T23:30:00Z");
    const snapshot = { days: [day("2027-02-01", ["akl"])], stops };
    const config = { start: { placeId: "akl", date: "2027-02-01", lng: 174.76, lat: -36.85 } };
    expect(currentTravelDate(snapshot, config, placeZone, now)).toBe("2027-01-11");
  });
});
