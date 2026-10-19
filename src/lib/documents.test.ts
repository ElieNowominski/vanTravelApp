import { describe, expect, it } from "vitest";
import { countDocuments, documentScope, groupDocuments, orderedStops } from "@/lib/documents";
import type { Stop, TripDocument } from "@/lib/types";

function doc(id: string, caption: string, scope?: TripDocument["scope"]): TripDocument {
  return { id, updatedAt: "2027-02-07T08:00:00.000Z", updatedBy: "A", kind: "pdf", caption, path: "", size: 100, mimeType: "application/pdf", scope };
}

function stop(id: string, extra: Partial<Stop> = {}): Stop {
  return { id, placeId: id, name: id, lng: 170, lat: -44, kind: "camp", isOvernight: false, activities: [], bookings: [], documents: [], checklist: [], ...extra };
}

const snapshot = {
  days: [
    { date: "2027-02-07", label: "7", weekday: "Dim", locked: true, overnightStopId: "camp", stopIds: ["ville", "camp"], expenses: [] },
    { date: "2027-02-08", label: "8", weekday: "Lun", locked: true, overnightStopId: null, stopIds: ["camp", "lac"], expenses: [] },
  ],
  stops: {
    ville: stop("ville", { documents: [doc("d1", "Bon de retrait", "activite")] }),
    camp: stop("camp", { isOvernight: true, documents: [doc("d2", "Confirmation"), doc("d3", "Billets kayak", "activite")] }),
    lac: stop("lac", { area: "Tekapo" }),
  },
  tripDocuments: [doc("t1", "Assurance")],
};

describe("documents", () => {
  it("orderedStops suit l'itinéraire sans répéter une étape", () => {
    expect(orderedStops(snapshot).map((s) => [s.stop.id, s.dayIndex, s.isNight])).toEqual([
      ["ville", 0, false],
      ["camp", 0, true],
      ["lac", 1, false],
    ]);
  });

  it("documentScope déduit la nuit d'une étape de nuit", () => {
    expect(documentScope({}, { isOvernight: true })).toBe("nuit");
    expect(documentScope({ scope: "activite" }, { isOvernight: true })).toBe("activite");
    expect(documentScope({}, { isOvernight: false })).toBe("activite");
  });

  it("groupDocuments : voyage d'abord, puis les étapes dans l'ordre, portée déduite", () => {
    const groups = groupDocuments(snapshot);
    expect(groups.map((g) => [g.key, g.documents.map((d) => `${d.id}:${d.scope ?? "-"}`)])).toEqual([
      ["trip", ["t1:-"]],
      ["ville", ["d1:activite"]],
      ["camp", ["d2:nuit", "d3:activite"]],
    ]);
  });

  it("groupDocuments filtre par portée et par texte (légende ou étape)", () => {
    expect(groupDocuments(snapshot, { filter: "nuit" }).map((g) => g.key)).toEqual(["camp"]);
    expect(groupDocuments(snapshot, { filter: "trip" }).map((g) => g.key)).toEqual(["trip"]);
    expect(groupDocuments(snapshot, { query: "kayak" }).map((g) => [g.key, g.documents.length])).toEqual([["camp", 1]]);
    expect(groupDocuments(snapshot, { query: "VILLE" }).map((g) => g.key)).toEqual(["ville"]);
  });

  it("countDocuments compte tout, documents de voyage compris", () => {
    expect(countDocuments(snapshot)).toEqual({ count: 4, bytes: 400 });
  });
});
