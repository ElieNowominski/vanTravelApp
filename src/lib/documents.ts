import type { DocumentScope, Stop, TripDay, TripDocument, TripSnapshot } from "@/lib/types";

export const DOCUMENT_SCOPES: Array<{ id: DocumentScope; label: string }> = [
  { id: "nuit", label: "Nuit · camping" },
  { id: "activite", label: "Activités" },
];

export function scopeLabel(scope: DocumentScope | undefined): string {
  return DOCUMENT_SCOPES.find((s) => s.id === scope)?.label ?? "Voyage";
}

/** Portée d'un document d'étape : la sienne, sinon celle que la migration lui donnerait. */
export function documentScope(doc: Pick<TripDocument, "scope">, stop: Pick<Stop, "isOvernight">): DocumentScope {
  return doc.scope ?? (stop.isOvernight ? "nuit" : "activite");
}

export type OrderedStop = { stop: Stop; dayIndex: number; isNight: boolean };

/** Les étapes dans l'ordre de l'itinéraire, chacune une fois, avec le jour où elle apparaît d'abord. */
export function orderedStops(snapshot: { days: Pick<TripDay, "stopIds" | "overnightStopId">[]; stops: Record<string, Stop> }): OrderedStop[] {
  const out: OrderedStop[] = [];
  const seen = new Set<string>();
  snapshot.days.forEach((day, dayIndex) => {
    for (const id of day.stopIds) {
      const stop = snapshot.stops[id];
      if (!stop || seen.has(id)) continue;
      seen.add(id);
      out.push({ stop, dayIndex, isNight: day.overnightStopId === id || stop.isOvernight });
    }
  });
  return out;
}

export type DocumentGroup = {
  /** `trip` pour les documents de voyage, sinon l'identifiant de l'étape. */
  key: string;
  label: string;
  dayIndex: number | null;
  stop: Stop | null;
  documents: Array<TripDocument & { scope?: DocumentScope }>;
};

export type DocumentFilter = "all" | "trip" | DocumentScope;

/** Documents du voyage puis de chaque étape, dans l'ordre de l'itinéraire ; les groupes vides sont omis. */
export function groupDocuments(
  snapshot: Pick<TripSnapshot, "days" | "stops" | "tripDocuments">,
  options: { filter?: DocumentFilter; query?: string } = {},
): DocumentGroup[] {
  const filter = options.filter ?? "all";
  const query = (options.query ?? "").trim().toLowerCase();
  const groups: DocumentGroup[] = [];
  const matches = (doc: TripDocument, context: string) =>
    !query || (doc.caption ?? "").toLowerCase().includes(query) || context.toLowerCase().includes(query);

  if (filter === "all" || filter === "trip") {
    const docs = (snapshot.tripDocuments ?? []).filter((doc) => matches(doc, "voyage"));
    if (docs.length > 0) groups.push({ key: "trip", label: "Voyage", dayIndex: null, stop: null, documents: docs });
  }
  if (filter === "trip") return groups;

  for (const { stop, dayIndex } of orderedStops(snapshot)) {
    const docs = stop.documents
      .map((doc) => ({ ...doc, scope: documentScope(doc, stop) }))
      .filter((doc) => (filter === "all" || doc.scope === filter) && matches(doc, `${stop.name} ${stop.area ?? ""}`));
    if (docs.length > 0) groups.push({ key: stop.id, label: stop.name, dayIndex, stop, documents: docs });
  }
  return groups;
}

export function countDocuments(snapshot: Pick<TripSnapshot, "stops" | "tripDocuments">): { count: number; bytes: number } {
  const all = [...Object.values(snapshot.stops).flatMap((stop) => stop.documents), ...(snapshot.tripDocuments ?? [])];
  return { count: all.length, bytes: all.reduce((sum, doc) => sum + (doc.size ?? 0), 0) };
}
