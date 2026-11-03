import { describe, expect, it } from "vitest";
import { configFromSnapshot, planFromSnapshot, validateTripConfig } from "@/lib/trip-config";
import type { TripSnapshot } from "@/lib/types";

const snapshot: TripSnapshot = {
  currentDayIndex: 0,
  customPins: [],
  legs: [],
  days: [
    {
      date: "2027-02-07",
      label: "7 févr.",
      weekday: "Dim",
      locked: true,
      overnightStopId: "s2",
      stopIds: ["s1", "s2"],
      expenses: [],
    },
    { date: "2027-02-08", label: "8 févr.", weekday: "Lun", locked: false, overnightStopId: null, stopIds: ["s3"], expenses: [] },
  ],
  stops: {
    s1: {
      id: "s1",
      placeId: "christchurch",
      name: "Christchurch",
      lng: 172.6,
      lat: -43.5,
      kind: "town",
      isOvernight: false,
      activities: [],
      bookings: [],
      documents: [],
      checklist: [],
    },
    s2: {
      id: "s2",
      placeId: "camp-du-lac",
      name: "Camping du Lac",
      lng: 170.46,
      lat: -44.0,
      kind: "camp",
      area: "Tekapo",
      isOvernight: true,
      activities: [{ id: "a1", text: "Étoiles" }],
      bookings: [],
      documents: [],
      checklist: [],
    },
    s3: {
      id: "s3",
      placeId: "lake-pukaki",
      name: "Lake Pukaki",
      lng: 170.2,
      lat: -44.1,
      kind: "poi",
      isOvernight: false,
      activities: [],
      bookings: [],
      documents: [],
      checklist: [],
    },
  },
};

describe("planFromSnapshot", () => {
  it("reconstruit l'ordre des étapes, les nuits et les activités", () => {
    const plan = planFromSnapshot(snapshot);
    expect(plan.days).toHaveLength(2);
    expect(plan.days[0].stops).toEqual([
      { placeId: "christchurch" },
      { placeId: "camp-du-lac", overnight: true, activities: ["Étoiles"] },
    ]);
    expect(plan.days[1].stops).toEqual([{ placeId: "lake-pukaki" }]);
  });
});

describe("configFromSnapshot", () => {
  it("dérive dates, départ et hébergements d'un circuit sans voyage", () => {
    const config = configFromSnapshot(snapshot, { name: "Final trip" });
    expect(config).not.toBeNull();
    expect(config?.start).toMatchObject({ placeId: "christchurch", date: "2027-02-07" });
    expect(config?.end.date).toBe("2027-02-08");
    expect(config?.stays.map((s) => s.id)).toEqual(["camp-du-lac"]);
    expect(config?.schemaVersion).toBe(2);
    expect(config?.start).toMatchObject({ name: "Christchurch", lng: 172.6, lat: -43.5 });
  });

  it("renvoie null sans jour", () => {
    expect(configFromSnapshot({ ...snapshot, days: [] })).toBeNull();
  });
});

describe("validateTripConfig", () => {
  it("accepte un trip.json minimal et complète les défauts", () => {
    const config = validateTripConfig({
      id: "t",
      name: "Test",
      start: { placeId: "christchurch", date: "2027-02-07" },
      end: { placeId: "christchurch", date: "2027-02-19" },
    });
    expect(config.profile.timeFactor).toBe(1.3);
    expect(config.stays).toEqual([]);
    expect(config.plan.days).toEqual([]);
  });

  it("refuse une fin avant le début", () => {
    expect(() =>
      validateTripConfig({
        id: "t",
        name: "Test",
        start: { placeId: "a", date: "2027-02-19" },
        end: { placeId: "a", date: "2027-02-07" },
      }),
    ).toThrow(/précède/);
  });

  it("refuse une date mal formée", () => {
    expect(() =>
      validateTripConfig({
        id: "t",
        name: "Test",
        start: { placeId: "a", date: "07/02/2027" },
        end: { placeId: "a", date: "2027-02-19" },
      }),
    ).toThrow(/AAAA-MM-JJ/);
  });
});

describe("voyage v1 vers v2", () => {
  const v1Config = {
    id: "trip-v1",
    schemaVersion: 1,
    name: "Voyage v1",
    regionId: "nz-south",
    start: { placeId: "christchurch", date: "2027-02-07" },
    end: { placeId: "christchurch", date: "2027-02-19" },
    vehicle: { name: "Van", selfContained: true, timeFactor: 1.3, windingFactor: 1.15, maxComfortableDriveHours: 4 },
    stays: [],
    plan: { days: [] },
  };

  it("retire la région, positionne les repères depuis le catalogue et fait du véhicule un profil van", () => {
    const config = validateTripConfig(v1Config);
    expect(config.schemaVersion).toBe(2);
    expect("regionId" in config).toBe(false);
    expect("vehicle" in config).toBe(false);
    expect(config.defaultMode).toBe("van");
    expect(config.profile).toMatchObject({ presetId: "van", mode: "van", name: "Van", timeFactor: 1.3 });
    expect(config.start).toEqual({ placeId: "christchurch", date: "2027-02-07", name: "Christchurch", lng: 172.6362, lat: -43.5321 });
  });

  it("est idempotente et garde un repère hors catalogue positionné", () => {
    const once = validateTripConfig(v1Config);
    expect(validateTripConfig(once)).toEqual(once);
    const anywhere = validateTripConfig({
      ...once,
      start: { placeId: "brest", name: "Brest", lng: -4.49, lat: 48.39, date: "2027-07-01" },
      end: { placeId: "brest", name: "Brest", lng: -4.49, lat: 48.39, date: "2027-07-10" },
      defaultMode: "velo",
    });
    expect(anywhere.start).toMatchObject({ name: "Brest", lng: -4.49, lat: 48.39 });
    expect(anywhere.defaultMode).toBe("velo");
  });

  it("un repère v2 inconnu du catalogue reste sans position plutôt que d'être placé en Nouvelle-Zélande", () => {
    const config = validateTripConfig({ ...v1Config, schemaVersion: 2, start: { placeId: "christchurch", date: "2027-02-07" } });
    expect(config.start.lng).toBeUndefined();
  });
});
