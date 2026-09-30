import { describe, expect, it } from "vitest";
import type { TripSnapshot } from "@/lib/types";
import {
  SNAPSHOT_SCHEMA_VERSION,
  migrateSnapshot,
  normalizeBookings,
  normalizeChecklist,
  normalizeExpenses,
  normalizeTombstones,
} from "@/lib/migrations";

/** Circuit tel qu'enregistré par la version 1 (aucun champ Voyager). */
const v1 = {
  id: "trip-1",
  name: "Ancien circuit",
  savedAt: "2026-09-01T00:00:00.000Z",
  km: 120,
  nights: 1,
  marks: [],
  days: [
    { date: "2027-02-07", label: "7 févr.", weekday: "Dim", locked: true, overnightStopId: "s2", stopIds: ["s1", "s2"] },
    { date: "2027-02-08", label: "8 févr.", weekday: "Lun", locked: false, overnightStopId: null, stopIds: [] },
  ],
  stops: {
    s1: { id: "s1", placeId: "christchurch", name: "Christchurch", lng: 172.6, lat: -43.5, kind: "town", isOvernight: false },
    s2: {
      id: "s2",
      placeId: "camp",
      name: "Camping",
      lng: 170.4,
      lat: -44,
      kind: "camp",
      isOvernight: true,
      activities: [{ id: "a1", text: "Étoiles" }, { text: "" }],
    },
  },
  legs: [],
  customPins: [],
  currentDayIndex: 0,
};

describe("migrateSnapshot", () => {
  it("passe un circuit v1 en v2 avec des tableaux vides", () => {
    const out = migrateSnapshot(v1 as unknown as Partial<TripSnapshot>);
    expect(out.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(out.stops.s1.bookings).toEqual([]);
    expect(out.stops.s1.documents).toEqual([]);
    expect(out.stops.s1.checklist).toEqual([]);
    expect(out.stops.s1.activities).toEqual([]);
    expect(out.stops.s2.activities).toEqual([{ id: "a1", text: "Étoiles" }]);
    expect(out.days[0].expenses).toEqual([]);
    expect(out.days[0].notes).toBeUndefined();
    expect(out.frozenAt).toBeNull();
    // Les champs hors snapshot (nom, km) restent intacts.
    expect((out as unknown as typeof v1).name).toBe("Ancien circuit");
    expect((out as unknown as typeof v1).km).toBe(120);
  });

  it("est idempotente et garde les entités v2", () => {
    const once = migrateSnapshot(v1 as unknown as Partial<TripSnapshot>);
    once.stops.s2.bookings.push({
      id: "b1",
      updatedAt: "2026-09-29T10:00:00.000Z",
      updatedBy: "Élie",
      provider: "Lakes Edge",
      reference: "ABC123",
      accessCode: "4521",
    });
    once.days[0].expenses.push({
      id: "e1",
      updatedAt: "2026-09-29T10:00:00.000Z",
      updatedBy: "Élie",
      date: "2027-02-07",
      amount: 42.5,
      currency: "NZD",
      category: "camping",
      paidBy: "Élie",
    });
    const twice = migrateSnapshot(once);
    expect(twice).toEqual(once);
  });

  it("v3 : pierres tombales et horodatages des notes, absents avant", () => {
    const out = migrateSnapshot(v1 as unknown as Partial<TripSnapshot>);
    expect(out.tombstones).toEqual({});
    expect(out.stops.s1.notesAt).toBeUndefined();
    expect(out.days[0].notesAt).toBeUndefined();
    expect(out.days[0].weatherAt).toBeUndefined();

    const withV3 = migrateSnapshot({
      ...v1,
      tombstones: { "booking-1": "2026-09-30T08:00:00.000Z", bad: 12, "": "x" },
      days: [{ ...v1.days[0], notes: "Vent", notesAt: "2026-09-30T07:00:00.000Z" }],
    } as unknown as Partial<TripSnapshot>);
    expect(withV3.tombstones).toEqual({ "booking-1": "2026-09-30T08:00:00.000Z" });
    expect(withV3.days[0].notesAt).toBe("2026-09-30T07:00:00.000Z");
    expect(normalizeTombstones("nope")).toEqual({});
  });

  it("tolère des jours et étapes incomplets", () => {
    const out = migrateSnapshot({ days: [{ date: "2027-02-07" }], stops: { x: null } } as unknown as Partial<TripSnapshot>);
    expect(out.days[0].stopIds).toEqual([]);
    expect(out.days[0].expenses).toEqual([]);
    expect(out.stops).toEqual({});
    expect(out.legs).toEqual([]);
  });
});

describe("normalisation des entités", () => {
  it("écarte les réservations sans fournisseur et complète les métadonnées", () => {
    const out = normalizeBookings([{ provider: "DOC" }, { reference: "sans nom" }, "texte"]);
    expect(out).toHaveLength(1);
    expect(out[0].provider).toBe("DOC");
    expect(out[0].id).toMatch(/^booking-/);
    expect(out[0].updatedBy).toBe("");
    expect(out[0].price).toBeUndefined();
  });

  it("ne garde un prix que s'il est complet", () => {
    const [ok] = normalizeBookings([{ provider: "A", price: { amount: 30, currency: "NZD" } }]);
    const [ko] = normalizeBookings([{ provider: "B", price: { amount: "30" } }]);
    expect(ok.price).toEqual({ amount: 30, currency: "NZD" });
    expect(ko.price).toBeUndefined();
  });

  it("ramène une catégorie inconnue à « autre » et date les dépenses du jour", () => {
    const out = normalizeExpenses([{ amount: 12, category: "pizza" }, { amount: "x" }], "2027-02-07");
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("autre");
    expect(out[0].date).toBe("2027-02-07");
    expect(out[0].currency).toBe("EUR");
  });

  it("nettoie la checklist", () => {
    const out = normalizeChecklist([{ text: " Plein ", done: true }, { text: "  " }, { done: false }]);
    expect(out).toEqual([expect.objectContaining({ text: "Plein", done: true })]);
  });
});
