import { describe, expect, it } from "vitest";
import { emptyExpensesDoc, emptyTravelDoc, type TravelDoc } from "@/lib/sync-model";
import {
  documentExtension,
  expensesToRows,
  newerDeletions,
  newerRows,
  rowsToExpensesDoc,
  rowsToTombstones,
  rowsToTravelDoc,
  storageObjectPath,
  toIso,
  tombstonesToRows,
  travelDocToRows,
} from "@/lib/sync-rows";
import type { Booking, Expense } from "@/lib/types";

const T0 = "2026-10-08T10:00:00.000Z";
const T1 = "2026-10-08T11:00:00.000Z";
const T2 = "2026-10-08T12:00:00.120Z";

function booking(id: string, updatedAt = T0): Booking {
  return { id, updatedAt, updatedBy: "elie", provider: `Camping ${id}`, reference: "ABC", accessCode: "1234" };
}

function expense(id: string, updatedAt = T0): Expense {
  return { id, updatedAt, updatedBy: "elie", date: "2027-02-08", amount: 12.5, currency: "NZD", category: "courses", paidBy: "elie" };
}

function travelDoc(): TravelDoc {
  const doc = emptyTravelDoc(T1);
  doc.stops["s1"] = {
    bookings: [booking("b1")],
    documents: [{ id: "doc-1", updatedAt: T0, updatedBy: "elie", kind: "image", path: "", size: 10, mimeType: "image/jpeg", caption: "Reçu" }],
    checklist: [{ id: "c1", updatedAt: T1, updatedBy: "elie", text: "Gaz", done: true }],
    notes: "Arrivée tardive",
    notesAt: T1,
  };
  doc.days["2027-02-08"] = { notes: "Grand soleil", notesAt: T0, weather: "25 °C", weatherAt: T1 };
  doc.tombstones = { "b-old": T0 };
  return doc;
}

describe("toIso", () => {
  it("ramène le format Postgres au format JavaScript", () => {
    expect(toIso("2026-10-08T12:00:00.12+00:00")).toBe(T2);
    expect(toIso("2026-10-08 12:00:00.12+00")).toBe(T2);
    expect(toIso(T2)).toBe(T2);
  });
  it("laisse une valeur illisible telle quelle et remplace l'absence par l'époque", () => {
    expect(toIso("pas une date")).toBe("pas une date");
    expect(toIso(null)).toBe("1970-01-01T00:00:00.000Z");
  });
});

describe("travel_items", () => {
  it("fait l'aller-retour document -> lignes -> document", () => {
    const doc = travelDoc();
    const rows = travelDocToRows("nz", doc);
    expect(rows.map((r) => r.kind).sort()).toEqual(["booking", "checklist", "day_notes", "day_weather", "document", "stop_notes"]);
    expect(rows.find((r) => r.kind === "stop_notes")).toMatchObject({ id: "s1:notes", scope: "s1", updated_at: T1, payload: { value: "Arrivée tardive", at: T1 } });
    expect(rows.find((r) => r.kind === "day_weather")).toMatchObject({ id: "2027-02-08:weather", scope: "2027-02-08", updated_at: T1 });
    expect(rows.every((r) => r.trip_id === "nz")).toBe(true);

    const back = rowsToTravelDoc(rows, doc.tombstones);
    expect(back.stops).toEqual(doc.stops);
    expect(back.days).toEqual(doc.days);
    expect(back.tombstones).toEqual(doc.tombstones);
    expect(back.updatedAt).toBe(T1);
  });

  it("ignore une ligne illisible et accepte les horodatages Postgres", () => {
    const rows = travelDocToRows("nz", travelDoc()).map((r) => ({ ...r, updated_at: r.updated_at.replace("Z", "+00:00") }));
    rows.push({ id: "x", trip_id: "nz", kind: "booking", scope: "s9", payload: { pas: "une réservation" }, updated_at: T2, updated_by: "" });
    const doc = rowsToTravelDoc(rows);
    expect(doc.stops["s1"].bookings).toHaveLength(1);
    expect(doc.stops["s9"].bookings).toHaveLength(0);
    expect(doc.updatedAt).toBe(T2);
  });

  it("une note effacée garde son horodatage", () => {
    const doc = emptyTravelDoc();
    doc.stops["s1"] = { bookings: [], documents: [], checklist: [], notes: undefined, notesAt: T1 };
    const back = rowsToTravelDoc(travelDocToRows("nz", doc));
    expect(back.stops["s1"].notes).toBeUndefined();
    expect(back.stops["s1"].notesAt).toBe(T1);
  });
});

describe("expenses et deletions", () => {
  it("font l'aller-retour", () => {
    const doc = emptyExpensesDoc(T1);
    doc.expenses = [expense("e1"), expense("e2", T1)];
    doc.tombstones = { "e-old": T0 };
    const rows = expensesToRows("nz", doc);
    expect(rows).toHaveLength(2);
    const back = rowsToExpensesDoc(rows, doc.tombstones);
    expect(back.expenses).toEqual(doc.expenses);
    expect(back.updatedAt).toBe(T1);
    expect(back.tombstones).toEqual(doc.tombstones);

    const deletions = tombstonesToRows("nz", doc.tombstones);
    expect(deletions).toEqual([{ trip_id: "nz", entity_id: "e-old", deleted_at: T0 }]);
    expect(rowsToTombstones([...deletions, { trip_id: "nz", entity_id: "e-old", deleted_at: "2026-10-08T11:00:00+00:00" }])).toEqual({ "e-old": T1 });
  });
});

describe("newerRows", () => {
  it("ne garde que les lignes absentes ou plus récentes que le serveur", () => {
    const local = [
      { id: "a", updated_at: T0 },
      { id: "b", updated_at: T1 },
      { id: "c", updated_at: T2 },
    ];
    const remote = [
      { id: "a", updated_at: "2026-10-08T10:00:00+00:00" },
      { id: "b", updated_at: "2026-10-08T10:00:00+00:00" },
    ];
    expect(newerRows(local, remote).map((r) => r.id)).toEqual(["b", "c"]);
    expect(newerDeletions([{ trip_id: "nz", entity_id: "x", deleted_at: T1 }], [{ trip_id: "nz", entity_id: "x", deleted_at: "2026-10-08T11:00:00.000+00:00" }])).toEqual([]);
  });
});

describe("storageObjectPath", () => {
  it("dérive l'extension du chemin hérité, sinon du type", () => {
    const doc = { id: "doc-1", kind: "image" as const, mimeType: "image/jpeg", path: "" };
    expect(storageObjectPath("nz", doc)).toBe("nz/doc-1.jpg");
    expect(storageObjectPath("nz", { ...doc, path: "trips/nz/docs/doc-1.png" })).toBe("nz/doc-1.png");
    expect(documentExtension({ kind: "pdf", mimeType: "application/pdf", path: "" })).toBe("pdf");
    expect(documentExtension({ kind: "image", mimeType: "image/png", path: "" })).toBe("png");
  });
});
