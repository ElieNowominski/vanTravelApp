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

describe("v4 : portée des documents, étape des dépenses, documents de voyage", () => {
  const base = { id: "d", updatedAt: "2026-10-01T00:00:00.000Z", updatedBy: "A", kind: "pdf", path: "", size: 1, mimeType: "application/pdf" };

  it("pose « nuit » sur les documents d'une étape de nuit, « activite » ailleurs, et garde une portée explicite", () => {
    const out = migrateSnapshot({
      ...v1,
      stops: {
        s1: { ...v1.stops.s1, documents: [{ ...base, id: "d1" }] },
        s2: { ...v1.stops.s2, documents: [{ ...base, id: "d2" }, { ...base, id: "d3", scope: "activite" }, { ...base, id: "d4", scope: "nimporte" }] },
      },
    } as unknown as Partial<TripSnapshot>);
    expect(out.stops.s1.documents.map((d) => d.scope)).toEqual(["activite"]);
    expect(out.stops.s2.documents.map((d) => d.scope)).toEqual(["nuit", "activite", "nuit"]);
  });

  it("garde le stopId d'une dépense et crée tripDocuments vide, sans portée sur un document de voyage", () => {
    const out = migrateSnapshot(v1 as unknown as Partial<TripSnapshot>);
    expect(out.tripDocuments).toEqual([]);
    const withDocs = migrateSnapshot({
      ...v1,
      tripDocuments: [{ ...base, id: "t1" }, { nope: true }],
      days: [{ ...v1.days[0], expenses: [{ id: "e1", amount: 5, stopId: "s2" }, { id: "e2", amount: 6, stopId: "" }] }],
    } as unknown as Partial<TripSnapshot>);
    expect(withDocs.tripDocuments?.map((d) => [d.id, d.scope])).toEqual([["t1", undefined]]);
    expect(withDocs.days[0].expenses.map((e) => e.stopId)).toEqual(["s2", undefined]);
    expect(normalizeExpenses([{ amount: 1, stopId: "x" }])[0].stopId).toBe("x");
  });
});

describe("v5 : modes de déplacement et tronçons", () => {
  const geometry = { type: "LineString" as const, coordinates: [[172.6, -43.5], [170.4, -44]] };
  /** Tronçon tel qu'enregistré par la v1 (schéma 4) : durées voiture et van, pas de mode. */
  const v4Leg = {
    id: "l1",
    fromStopId: "s1",
    toStopId: "s2",
    dayIndex: 0,
    options: [{ geometry, distanceKm: 250, durationCarSec: 10_000, durationVanSec: 13_000, winding: true, label: "Recommandée" }],
    selectedIndex: 0,
    estimated: false,
  };

  it("passe un tronçon v4 en « van » calculé, durées renommées", () => {
    const migrated = migrateSnapshot({ ...v1, legs: [v4Leg] } as unknown as Partial<TripSnapshot>);
    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.legs).toEqual([
      {
        id: "l1",
        fromStopId: "s1",
        toStopId: "s2",
        dayIndex: 0,
        mode: "van",
        track: "calcule",
        options: [{ geometry, distanceKm: 250, durationRawSec: 10_000, durationSec: 13_000, winding: true, label: "Recommandée" }],
        selectedIndex: 0,
        estimated: false,
      },
    ]);
  });

  it("est idempotente sur un tronçon v5 et garde un tronçon manuel sans tracé", () => {
    const ferry = {
      id: "l2",
      fromStopId: "s2",
      toStopId: "s3",
      dayIndex: 1,
      mode: "ferry",
      track: "aucun",
      options: [],
      selectedIndex: 0,
      estimated: false,
      manual: { durationSec: 11_700, operator: "Traversée de démonstration", departAt: "08 h 00", extra: "ignoré" },
    };
    const once = migrateSnapshot({ ...v1, legs: [v4Leg, ferry] } as unknown as Partial<TripSnapshot>);
    const twice = migrateSnapshot(once);
    expect(twice.legs).toEqual(once.legs);
    expect(once.legs[1]).toMatchObject({ mode: "ferry", track: "aucun", options: [] });
    expect(once.legs[1].manual).toEqual({ durationSec: 11_700, operator: "Traversée de démonstration", departAt: "08 h 00" });
  });

  it("écarte un tronçon sans étapes, ramène un mode inconnu au van et un index hors limites à 0", () => {
    const migrated = migrateSnapshot({
      ...v1,
      legs: [
        { id: "x", fromStopId: "s1" },
        { ...v4Leg, id: "l3", mode: "trottinette", selectedIndex: 4 },
        "n'importe quoi",
      ],
    } as unknown as Partial<TripSnapshot>);
    expect(migrated.legs.map((l) => [l.id, l.mode, l.selectedIndex])).toEqual([["l3", "van", 0]]);
  });

  it("déduit « aucun » d'un tronçon manuel sans tracé ni type", () => {
    const migrated = migrateSnapshot({
      ...v1,
      legs: [{ id: "l4", fromStopId: "s1", toStopId: "s2", dayIndex: 0, mode: "train", options: [], manual: { durationSec: 3600 } }],
    } as unknown as Partial<TripSnapshot>);
    expect(migrated.legs[0]).toMatchObject({ mode: "train", track: "aucun", manual: { durationSec: 3600 } });
  });

  it("garde le prix d'un tronçon manuel s'il est complet, l'écarte sinon", () => {
    const leg = { id: "l5", fromStopId: "s1", toStopId: "s2", dayIndex: 0, mode: "train", track: "aucun", options: [] };
    const migrated = migrateSnapshot({
      ...v1,
      legs: [
        { ...leg, manual: { durationSec: 3600, price: { amount: 42.5, currency: "NOK" } } },
        { ...leg, id: "l6", manual: { durationSec: 3600, price: { amount: "42" } } },
      ],
    } as unknown as Partial<TripSnapshot>);
    expect(migrated.legs[0].manual?.price).toEqual({ amount: 42.5, currency: "NOK" });
    expect(migrated.legs[1].manual).toEqual({ durationSec: 3600 });
  });
});
