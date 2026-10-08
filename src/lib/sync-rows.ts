import { normalizeBookings, normalizeChecklist, normalizeDocuments, normalizeExpenses } from "@/lib/migrations";
import { emptyExpensesDoc, emptyTravelDoc, type ExpensesDoc, type TravelDoc } from "@/lib/sync-model";
import type { TripDocument } from "@/lib/types";

/**
 * Passage entre les documents de fusion (`TravelDoc`, `ExpensesDoc`, forme héritée des fichiers de la
 * phase 5) et les lignes des tables Supabase (`travel_items`, `expenses`, `deletions`). Tout est pur :
 * le moteur (`src/services/sync.ts`) fusionne avec `sync-model.ts`, puis n'envoie que les lignes plus
 * récentes que ce que le serveur a (`newerRows`), le serveur refusant de toute façon une ligne plus
 * ancienne (`upsert_*` en SQL).
 *
 * Chaque entité garde son `updatedAt` JavaScript dans `payload` ; la colonne `updated_at` (timestamptz)
 * sert au serveur et aux comparaisons, après `toIso` car Postgres renvoie `.12+00:00` là où JavaScript
 * écrit `.120Z`.
 */
export type TravelItemKind = "booking" | "document" | "checklist" | "stop_notes" | "day_notes" | "day_weather";

export type TravelItemRow = {
  id: string;
  trip_id: string;
  kind: TravelItemKind;
  /** Identifiant d'étape, ou date AAAA-MM-JJ. */
  scope: string;
  payload: unknown;
  updated_at: string;
  updated_by: string;
};

export type ExpenseRow = { id: string; trip_id: string; payload: unknown; updated_at: string; updated_by: string };

export type DeletionRow = { trip_id: string; entity_id: string; deleted_at: string };

/** Note ou météo : la valeur et son horodatage, tels que le modèle les porte. */
type StampedPayload = { value?: string; at: string };

const EPOCH = new Date(0).toISOString();

/** Horodatage renvoyé par Postgres ramené au format ISO de JavaScript (millisecondes, `Z`). */
export function toIso(value: string | null | undefined): string {
  if (!value) return EPOCH;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? value : new Date(time).toISOString();
}

export function travelDocToRows(tripId: string, doc: TravelDoc): TravelItemRow[] {
  const rows: TravelItemRow[] = [];
  const stamped = (id: string, kind: TravelItemKind, scope: string, value: string | undefined, at: string) =>
    rows.push({ id, trip_id: tripId, kind, scope, payload: { value, at } satisfies StampedPayload, updated_at: at, updated_by: "" });
  for (const [stopId, stop] of Object.entries(doc.stops)) {
    for (const b of stop.bookings) rows.push({ id: b.id, trip_id: tripId, kind: "booking", scope: stopId, payload: b, updated_at: b.updatedAt, updated_by: b.updatedBy });
    for (const d of stop.documents) rows.push({ id: d.id, trip_id: tripId, kind: "document", scope: stopId, payload: d, updated_at: d.updatedAt, updated_by: d.updatedBy });
    for (const c of stop.checklist) rows.push({ id: c.id, trip_id: tripId, kind: "checklist", scope: stopId, payload: c, updated_at: c.updatedAt, updated_by: c.updatedBy });
    if (stop.notesAt) stamped(`${stopId}:notes`, "stop_notes", stopId, stop.notes, stop.notesAt);
  }
  for (const [date, day] of Object.entries(doc.days)) {
    if (day.notesAt) stamped(`${date}:notes`, "day_notes", date, day.notes, day.notesAt);
    if (day.weatherAt) stamped(`${date}:weather`, "day_weather", date, day.weather, day.weatherAt);
  }
  return rows;
}

function stampedOf(row: TravelItemRow): StampedPayload {
  const p = row.payload as Partial<StampedPayload> | null;
  return {
    value: typeof p?.value === "string" ? p.value : undefined,
    at: typeof p?.at === "string" ? p.at : toIso(row.updated_at),
  };
}

/** Lignes d'un voyage vers le document de fusion. Les lignes illisibles sont ignorées, jamais fatales. */
export function rowsToTravelDoc(rows: TravelItemRow[], tombstones: Record<string, string> = {}): TravelDoc {
  const doc = emptyTravelDoc();
  doc.tombstones = { ...tombstones };
  let latest = EPOCH;
  const stop = (id: string) => (doc.stops[id] ??= { bookings: [], documents: [], checklist: [] });
  const day = (date: string) => (doc.days[date] ??= {});
  for (const row of rows) {
    const at = toIso(row.updated_at);
    if (at > latest) latest = at;
    switch (row.kind) {
      case "booking":
        stop(row.scope).bookings.push(...normalizeBookings([row.payload]));
        break;
      case "document":
        stop(row.scope).documents.push(...normalizeDocuments([row.payload]));
        break;
      case "checklist":
        stop(row.scope).checklist.push(...normalizeChecklist([row.payload]));
        break;
      case "stop_notes": {
        const s = stop(row.scope);
        const p = stampedOf(row);
        s.notes = p.value;
        s.notesAt = p.at;
        break;
      }
      case "day_notes": {
        const d = day(row.scope);
        const p = stampedOf(row);
        d.notes = p.value;
        d.notesAt = p.at;
        break;
      }
      case "day_weather": {
        const d = day(row.scope);
        const p = stampedOf(row);
        d.weather = p.value;
        d.weatherAt = p.at;
        break;
      }
    }
  }
  doc.updatedAt = latest;
  return doc;
}

export function expensesToRows(tripId: string, doc: ExpensesDoc): ExpenseRow[] {
  return doc.expenses.map((e) => ({ id: e.id, trip_id: tripId, payload: e, updated_at: e.updatedAt, updated_by: e.updatedBy }));
}

export function rowsToExpensesDoc(rows: ExpenseRow[], tombstones: Record<string, string> = {}): ExpensesDoc {
  const doc = emptyExpensesDoc();
  doc.tombstones = { ...tombstones };
  let latest = EPOCH;
  for (const row of rows) {
    const at = toIso(row.updated_at);
    if (at > latest) latest = at;
    doc.expenses.push(...normalizeExpenses([row.payload]));
  }
  doc.updatedAt = latest;
  return doc;
}

export function tombstonesToRows(tripId: string, tombstones: Record<string, string>): DeletionRow[] {
  return Object.entries(tombstones).map(([entity_id, deleted_at]) => ({ trip_id: tripId, entity_id, deleted_at }));
}

export function rowsToTombstones(rows: DeletionRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const at = toIso(row.deleted_at);
    if (!out[row.entity_id] || at > out[row.entity_id]) out[row.entity_id] = at;
  }
  return out;
}

/** Lignes locales absentes du serveur ou plus récentes que lui : le seul envoi utile. */
export function newerRows<T extends { id: string; updated_at: string }>(local: T[], remote: T[]): T[] {
  const known = new Map(remote.map((row) => [row.id, toIso(row.updated_at)]));
  return local.filter((row) => {
    const at = known.get(row.id);
    return !at || toIso(row.updated_at) > at;
  });
}

export function newerDeletions(local: DeletionRow[], remote: DeletionRow[]): DeletionRow[] {
  const known = new Map(remote.map((row) => [row.entity_id, toIso(row.deleted_at)]));
  return local.filter((row) => {
    const at = known.get(row.entity_id);
    return !at || toIso(row.deleted_at) > at;
  });
}

/** Chemin de l'objet dans le bucket `documents` : `<voyage>/<docId>.<ext>`, stable quel que soit l'appareil. */
export function storageObjectPath(tripId: string, doc: Pick<TripDocument, "id" | "kind" | "mimeType" | "path">): string {
  return `${tripId}/${doc.id}.${documentExtension(doc)}`;
}

export function documentExtension(doc: Pick<TripDocument, "kind" | "mimeType" | "path">): string {
  const fromPath = /\.([a-z0-9]{2,5})$/i.exec(doc.path ?? "")?.[1]?.toLowerCase();
  if (fromPath) return fromPath;
  if (doc.kind === "pdf") return "pdf";
  if (doc.mimeType === "image/png") return "png";
  if (doc.mimeType === "image/webp") return "webp";
  return "jpg";
}
