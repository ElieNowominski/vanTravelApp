import { describe, expect, it } from "vitest";
import {
  applyItinerary,
  applyTravel,
  decideItinerary,
  hasItinerary,
  documentPath,
  emptyExpensesDoc,
  emptyTravelDoc,
  extractExpenses,
  extractTravel,
  itinerarySignature,
  mergeEntities,
  mergeExpenses,
  mergeTravel,
  stripTravel,
} from "@/lib/sync-model";
import type { Booking, Expense, Stop, TripSnapshot } from "@/lib/types";

const T0 = "2027-02-07T08:00:00.000Z";
const T1 = "2027-02-07T09:00:00.000Z";
const T2 = "2027-02-07T10:00:00.000Z";

function booking(id: string, updatedAt: string, provider = "Camp", by = "Élie"): Booking {
  return { id, updatedAt, updatedBy: by, provider };
}

function expense(id: string, updatedAt: string, amount: number, date = "2027-02-07"): Expense {
  return { id, updatedAt, updatedBy: "Élie", date, amount, currency: "NZD", category: "camping", paidBy: "Élie" };
}

function stop(id: string, extra: Partial<Stop> = {}): Stop {
  return {
    id,
    placeId: `place-${id}`,
    name: id,
    lng: 170,
    lat: -44,
    kind: "camp",
    isOvernight: false,
    activities: [],
    bookings: [],
    documents: [],
    checklist: [],
    ...extra,
  };
}

function snapshot(): TripSnapshot {
  return {
    schemaVersion: 3,
    days: [
      { date: "2027-02-07", label: "7", weekday: "Dim", locked: true, overnightStopId: "s2", stopIds: ["s1", "s2"], expenses: [expense("e1", T0, 10)] },
      { date: "2027-02-08", label: "8", weekday: "Lun", locked: false, overnightStopId: null, stopIds: [], expenses: [] },
    ],
    stops: {
      s1: stop("s1", { notes: "Note de planification" }),
      s2: stop("s2", { isOvernight: true, bookings: [booking("b1", T0)], checklist: [{ id: "c1", updatedAt: T0, updatedBy: "Élie", text: "Plein", done: false }] }),
    },
    legs: [{ id: "l1", fromStopId: "s1", toStopId: "s2", dayIndex: 0, options: [], selectedIndex: 0, estimated: true }],
    customPins: [],
    currentDayIndex: 0,
    frozenAt: null,
    tombstones: {},
  };
}

describe("mergeEntities", () => {
  it("garde la version la plus récente de chaque entité", () => {
    const out = mergeEntities([booking("b1", T0, "Ancien"), booking("b2", T0)], [booking("b1", T1, "Nouveau")], {});
    expect(out.map((b) => [b.id, b.provider])).toEqual([["b1", "Nouveau"], ["b2", "Camp"]]);
  });

  it("une suppression plus récente efface l'entité, une réécriture plus récente la ressuscite", () => {
    expect(mergeEntities([booking("b1", T0)], [], { b1: T1 })).toEqual([]);
    expect(mergeEntities([booking("b1", T2)], [], { b1: T1 })).toHaveLength(1);
  });
});

describe("mergeTravel et mergeExpenses", () => {
  it("fusionne réservations, checklist et notes par horodatage, dépenses par fichier séparé", () => {
    const local = extractTravel(snapshot(), T0);
    const remote = emptyTravelDoc(T1);
    remote.stops.s2 = { bookings: [booking("b1", T1, "Modifié par Léa", "Léa"), booking("b9", T1, "Ajout Léa", "Léa")], documents: [], checklist: [], notes: "Portail au fond", notesAt: T1 };
    remote.stops.s7 = { bookings: [booking("b7", T1)], documents: [], checklist: [] };
    remote.days["2027-02-07"] = { weather: "Pluie", weatherAt: T1 };

    const merged = mergeTravel(local, remote);
    expect(merged.stops.s2.bookings.map((b) => b.provider).sort()).toEqual(["Ajout Léa", "Modifié par Léa"]);
    expect(merged.stops.s2.checklist).toHaveLength(1);
    expect(merged.stops.s2.notes).toBe("Portail au fond");
    // Étape inconnue localement : conservée dans le fichier.
    expect(merged.stops.s7.bookings).toHaveLength(1);
    expect(merged.days["2027-02-07"].weather).toBe("Pluie");

    const localExp = extractExpenses(snapshot(), T0);
    const remoteExp = emptyExpensesDoc(T1);
    remoteExp.expenses = [expense("e2", T1, 25)];
    remoteExp.tombstones = { e1: T1 };
    const exp = mergeExpenses(localExp, remoteExp);
    expect(exp.expenses.map((e) => e.id)).toEqual(["e2"]);
    expect(exp.tombstones.e1).toBe(T1);
  });

  it("applyTravel réinjecte dans le snapshot sans toucher aux notes de planification", () => {
    const snap = snapshot();
    const travel = mergeTravel(extractTravel(snap, T0), (() => {
      const r = emptyTravelDoc(T1);
      r.stops.s2 = { bookings: [booking("b1", T1, "Léa")], documents: [], checklist: [], notes: "Portail", notesAt: T1 };
      r.days["2027-02-08"] = { notes: "Repos", notesAt: T1 };
      return r;
    })());
    const expenses = mergeExpenses(extractExpenses(snap, T0), { ...emptyExpensesDoc(T1), expenses: [expense("e2", T1, 25, "2027-02-08")] });
    const out = applyTravel(snap, travel, expenses);
    expect(out.stops.s1.notes).toBe("Note de planification");
    expect(out.stops.s2.bookings[0].provider).toBe("Léa");
    expect(out.stops.s2.notes).toBe("Portail");
    expect(out.days[0].expenses.map((e) => e.id)).toEqual(["e1"]);
    expect(out.days[1].expenses.map((e) => e.id)).toEqual(["e2"]);
    expect(out.days[1].notes).toBe("Repos");
  });

  it("une suppression venue d'ailleurs retire l'entité locale", () => {
    const snap = snapshot();
    const remote = emptyTravelDoc(T1);
    remote.tombstones = { b1: T1 };
    const out = applyTravel(snap, mergeTravel(extractTravel(snap, T0), remote), extractExpenses(snap, T0));
    expect(out.stops.s2.bookings).toEqual([]);
    expect(out.tombstones?.b1).toBe(T1);
  });
});

describe("itinéraire", () => {
  it("stripTravel retire les données de voyage et la signature ignore les réservations", () => {
    const snap = snapshot();
    const stripped = stripTravel(snap);
    expect(stripped.stops.s2.bookings).toEqual([]);
    expect(stripped.days[0].expenses).toEqual([]);
    expect(stripped.stops.s1.notes).toBe("Note de planification");

    const sig = itinerarySignature(snap);
    const withBooking = snapshot();
    withBooking.stops.s2.bookings.push(booking("b3", T2));
    expect(itinerarySignature(withBooking)).toBe(sig);
    const moved = snapshot();
    moved.days[1].stopIds = ["s3"];
    expect(itinerarySignature(moved)).not.toBe(sig);
  });

  it("applyItinerary garde les réservations locales des étapes connues", () => {
    const local = snapshot();
    const remote = stripTravel(snapshot());
    remote.stops.s3 = stop("s3");
    remote.days[1].stopIds = ["s3"];
    remote.frozenAt = T2;
    const out = applyItinerary(local, remote);
    expect(out.stops.s2.bookings).toHaveLength(1);
    expect(out.stops.s3.bookings).toEqual([]);
    expect(out.frozenAt).toBe(T2);
    expect(out.days[0].expenses).toHaveLength(1);
  });

  it("decideItinerary : premier envoi, première récupération, conflit tranché par la date", () => {
    expect(decideItinerary({ localChangedAt: null, remoteChanged: false, remoteUpdatedAt: null, hasRemote: false, hasLocal: true })).toBe("push-local");
    expect(decideItinerary({ localChangedAt: null, remoteChanged: true, remoteUpdatedAt: T1, hasRemote: true, hasLocal: false })).toBe("take-remote");
    expect(decideItinerary({ localChangedAt: T0, remoteChanged: true, remoteUpdatedAt: T1, hasRemote: true, hasLocal: true })).toBe("take-remote");
    expect(decideItinerary({ localChangedAt: T2, remoteChanged: true, remoteUpdatedAt: T1, hasRemote: true, hasLocal: true })).toBe("push-local");
    expect(decideItinerary({ localChangedAt: null, remoteChanged: false, remoteUpdatedAt: T1, hasRemote: true, hasLocal: true })).toBe("none");
  });

  it("hasItinerary : le départ automatique seul ne compte pas", () => {
    const seedOnly = { days: [{ ...snapshot().days[0], stopIds: ["stop-start"] }], stops: { "stop-start": stop("stop-start") }, legs: [], customPins: [] };
    expect(hasItinerary(seedOnly)).toBe(false);
    expect(hasItinerary({ ...seedOnly, days: [], stops: {} })).toBe(false);
    expect(hasItinerary({ ...seedOnly, stops: { ...seedOnly.stops, s1: stop("s1") } })).toBe(true);
    expect(hasItinerary({ ...seedOnly, legs: snapshot().legs })).toBe(true);
    expect(hasItinerary({ ...seedOnly, customPins: [{ placeId: "p", name: "Pin", lng: 0, lat: 0, kind: "poi" }] })).toBe(true);
    expect(hasItinerary(snapshot())).toBe(true);
  });

  it("documentPath respecte le chemin existant et en déduit un sinon", () => {
    const doc = { id: "doc-1", updatedAt: T0, updatedBy: "x", kind: "image" as const, path: "", size: 1, mimeType: "image/jpeg" };
    expect(documentPath("nz", doc)).toBe("trips/nz/docs/doc-1.jpg");
    expect(documentPath("nz", { ...doc, path: "trips/nz/docs/custom.jpg" })).toBe("trips/nz/docs/custom.jpg");
  });
});
