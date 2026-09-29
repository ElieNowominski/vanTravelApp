import { describe, expect, it } from "vitest";
import { parseBackup } from "@/lib/backup";

const day = {
  date: "2027-02-07",
  label: "7 févr.",
  weekday: "Dim",
  locked: false,
  overnightStopId: null,
  stopIds: ["s1"],
};
const stop = {
  id: "s1",
  placeId: "christchurch",
  name: "Christchurch",
  lng: 172.6,
  lat: -43.5,
  kind: "town",
  isOvernight: false,
  activities: [],
};

describe("parseBackup", () => {
  it("lit le format du snippet console (brouillon zustand + bibliothèque)", () => {
    const raw = JSON.stringify({
      exportedAt: "2026-09-29T10:00:00.000Z",
      draft: {
        state: { days: [day], stops: { s1: stop }, legs: [], customPins: [], currentDayIndex: 0, marks: [] },
        version: 0,
      },
      savedTrips: [
        {
          id: "trip-1",
          name: "Final trip",
          savedAt: "2026-09-01T00:00:00.000Z",
          km: 0,
          nights: 0,
          marks: [],
          days: [day],
          stops: { s1: stop },
          legs: [],
          customPins: [],
          currentDayIndex: 0,
        },
      ],
    });
    const backup = parseBackup(raw);
    expect(backup.draft?.days).toHaveLength(1);
    expect(backup.draft?.config).toBeNull();
    expect(backup.savedTrips.map((t) => t.name)).toEqual(["Final trip"]);
  });

  it("lit le format applicatif v2 avec voyage", () => {
    const config = {
      id: "nz",
      schemaVersion: 1,
      name: "NZ",
      regionId: "nz-south",
      start: { placeId: "christchurch", date: "2027-02-07" },
      end: { placeId: "christchurch", date: "2027-02-19" },
      vehicle: { name: "Van", selfContained: true, timeFactor: 1.3, windingFactor: 1.15, maxComfortableDriveHours: 4 },
      stays: [],
      plan: { days: [] },
    };
    const backup = parseBackup(
      JSON.stringify({
        app: "vantravel",
        version: 2,
        exportedAt: "2026-09-29T10:00:00.000Z",
        draft: { days: [day], stops: { s1: stop }, legs: [], customPins: [], currentDayIndex: 0, marks: [], config },
        savedTrips: [],
      }),
    );
    expect(backup.draft?.config?.id).toBe("nz");
  });

  it("refuse un fichier sans circuit", () => {
    expect(() => parseBackup(JSON.stringify({ hello: "world" }))).toThrow(/Aucun circuit/);
    expect(() => parseBackup("{ pas du json")).toThrow(/JSON/);
  });
});

describe("documents dans la sauvegarde (v3)", () => {
  it("ne garde que des data URL et tolère l'absence du champ", () => {
    const base = {
      app: "vantravel",
      version: 3,
      exportedAt: "2026-09-29T10:00:00.000Z",
      draft: { days: [day], stops: { s1: stop }, legs: [], customPins: [], currentDayIndex: 0, marks: [] },
      savedTrips: [],
    };
    expect(parseBackup(JSON.stringify(base)).documents).toEqual({});
    const withDocs = parseBackup(
      JSON.stringify({ ...base, documents: { "doc-1": "data:image/jpeg;base64,AAAA", "doc-2": "http://ailleurs", "doc-3": 12 } }),
    );
    expect(withDocs.documents).toEqual({ "doc-1": "data:image/jpeg;base64,AAAA" });
  });

  it("migre les étapes d'une sauvegarde v1 vers la forme Voyager", () => {
    const backup = parseBackup(
      JSON.stringify({
        savedTrips: [{ id: "t", name: "T", savedAt: "2026-01-01T00:00:00.000Z", days: [day], stops: { s1: stop }, legs: [] }],
      }),
    );
    expect(backup.savedTrips[0].stops.s1.bookings).toEqual([]);
    expect(backup.savedTrips[0].days[0].expenses).toEqual([]);
    expect(backup.savedTrips[0].schemaVersion).toBe(2);
    expect(backup.draft).toBeNull();
  });
});
