import { describe, expect, it } from "vitest";
import { buildNewTripConfig } from "@/lib/new-trip";
import { buildTripEntries, dayProgress, groupTrips, monthLabel, startsInLabel, type ActiveTrip } from "@/lib/trip-list";
import type { PlaceInput, SavedTrip, TripConfig } from "@/lib/types";

const place = (name: string): PlaceInput => ({ placeId: `p:${name}`, name, lng: 10, lat: 50, kind: "town" });

function config(name: string, startDate: string, endDate: string): TripConfig {
  return buildNewTripConfig({ name, startDate, endDate, start: place(`${name} A`), end: place(`${name} B`), roundTrip: false, choice: "van" });
}

function saved(id: string, cfg: TripConfig | null, savedAt = "2026-11-01T10:00:00.000Z", patch: Partial<SavedTrip> = {}): SavedTrip {
  return {
    id,
    name: cfg?.name ?? id,
    savedAt,
    km: 100,
    nights: 3,
    marks: [],
    config: cfg,
    days: [],
    stops: {},
    legs: [],
    customPins: [],
    currentDayIndex: 0,
    ...patch,
  };
}

const today = "2026-11-04";
const scandinavie = config("Scandinavie", "2027-06-01", "2027-06-10");
const alentejo = config("Alentejo", "2026-11-01", "2026-11-12");
const pyrenees = config("Pyrénées", "2026-09-05", "2026-09-12");

describe("buildTripEntries", () => {
  it("fusionne un voyage du compte avec sa copie locale la plus récente", () => {
    const entries = buildTripEntries({
      saved: [saved("s1", scandinavie, "2026-10-01T00:00:00.000Z", { km: 10 }), saved("s2", scandinavie, "2026-11-01T00:00:00.000Z", { km: 2223 })],
      account: [{ id: scandinavie.id, name: "Scandinavie", role: "owner", config: scandinavie }],
      active: null,
      today,
    });
    expect(entries.map((e) => e.key)).toEqual([`account:${scandinavie.id}`, "saved:s1"]);
    expect(entries[0]).toMatchObject({ km: 2223, saved: { id: "s2" }, account: { role: "owner" }, from: "Scandinavie A", to: "Scandinavie B", phase: "before" });
    expect(entries[1].account).toBeNull();
  });

  it("sans liste du compte (hors ligne, pas connecté), garde toute la bibliothèque", () => {
    const entries = buildTripEntries({ saved: [saved("s1", scandinavie), saved("s2", pyrenees)], account: null, active: null, today });
    expect(entries.map((e) => e.key)).toEqual(["saved:s1", "saved:s2"]);
  });

  it("date un ancien circuit sans voyage par ses jours", () => {
    const old = saved("old", null, undefined, {
      name: "Ancien",
      days: [
        { date: "2025-02-07", weekday: "Ven", label: "7 févr.", locked: false, overnightStopId: null, stopIds: [], expenses: [] },
        { date: "2025-02-09", weekday: "Dim", label: "9 févr.", locked: false, overnightStopId: null, stopIds: [], expenses: [] },
      ],
    });
    const [entry] = buildTripEntries({ saved: [old], account: null, active: null, today });
    expect(entry).toMatchObject({ name: "Ancien", startDate: "2025-02-07", endDate: "2025-02-09", phase: "after", config: null });
  });

  it("marque le voyage ouvert et prend ses chiffres, sa phase dans le fuseau de l'étape", () => {
    const active: ActiveTrip = { config: alentejo, savedId: "s1", accountTripId: null, km: 420, today: "2026-11-05" };
    const entries = buildTripEntries({ saved: [saved("s1", { ...alentejo, name: "Ancien nom" })], account: null, active, today });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ key: "saved:s1", name: "Alentejo", km: 420, nights: 11, active: true, phase: "during" });
  });

  it("retrouve le voyage ouvert par son lien au compte", () => {
    const active: ActiveTrip = { config: scandinavie, savedId: null, accountTripId: scandinavie.id, km: 5, today };
    const entries = buildTripEntries({ saved: [], account: [{ id: scandinavie.id, name: "Scandinavie", role: "viewer", config: scandinavie }], active, today });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ active: true, account: { role: "viewer" }, km: 5 });
  });

  it("ajoute le voyage ouvert quand il n'est ni sur le compte ni dans la bibliothèque", () => {
    const active: ActiveTrip = { config: alentejo, savedId: null, accountTripId: null, km: 0, today };
    const entries = buildTripEntries({ saved: [saved("s1", pyrenees)], account: [], active, today });
    expect(entries.map((e) => e.key)).toEqual(["saved:s1", "active"]);
  });

  it("ne confond pas une copie locale d'un voyage du compte avec le voyage ouvert depuis le compte", () => {
    const active: ActiveTrip = { config: scandinavie, savedId: "copie", accountTripId: null, km: 1, today };
    const entries = buildTripEntries({
      saved: [saved("copie", scandinavie, "2026-01-01T00:00:00.000Z"), saved("recent", scandinavie, "2026-11-01T00:00:00.000Z")],
      account: [{ id: scandinavie.id, name: "Scandinavie", role: "owner", config: scandinavie }],
      active,
      today,
    });
    const activeEntry = entries.find((e) => e.active);
    expect(activeEntry?.key).toBe("saved:copie");
    expect(entries.find((e) => e.account)?.active).toBe(false);
  });
});

describe("groupTrips", () => {
  it("range en cours, à venir (le plus proche d'abord), passés (le plus récent d'abord)", () => {
    const older = config("Alsace", "2026-05-01", "2026-05-05");
    const later = config("Highlands", "2027-08-12", "2027-08-26");
    const entries = buildTripEntries({
      saved: [saved("a", later), saved("b", older), saved("c", scandinavie), saved("d", pyrenees), saved("e", alentejo)],
      account: null,
      active: null,
      today,
    });
    const groups = groupTrips(entries);
    expect(groups.during.map((e) => e.name)).toEqual(["Alentejo"]);
    expect(groups.upcoming.map((e) => e.name)).toEqual(["Scandinavie", "Highlands"]);
    expect(groups.past.map((e) => e.name)).toEqual(["Pyrénées", "Alsace"]);
  });
});

describe("libellés", () => {
  it("dit quand le voyage commence", () => {
    expect(startsInLabel(today, "2026-11-05")).toBe("demain");
    expect(startsInLabel(today, "2026-11-09")).toBe("dans 5 jours");
    expect(startsInLabel(today, "2026-12-02")).toBe("dans 4 semaines");
    expect(startsInLabel(today, "2027-06-01")).toBe("dans 7 mois");
    expect(startsInLabel(today, "2028-11-04")).toBe("dans 2 ans");
  });

  it("donne le mois d'un voyage passé", () => {
    expect(monthLabel("2026-09-12")).toBe("sept. 2026");
  });

  it("situe le jour du voyage, borné au voyage", () => {
    expect(dayProgress("2026-11-01", "2026-11-12", "2026-11-04")).toEqual({ day: 4, total: 12 });
    expect(dayProgress("2026-11-01", "2026-11-12", "2026-12-01")).toEqual({ day: 12, total: 12 });
  });
});
