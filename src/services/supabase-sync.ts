import { SYNC_FORMAT, type ItineraryDoc } from "@/lib/sync-model";
import { toIso, type DeletionRow, type ExpenseRow, type TravelItemRow } from "@/lib/sync-rows";
import { validateTripConfig } from "@/lib/trip-config";
import type { TripConfig, TripMark, TripSnapshot } from "@/lib/types";
import { requireSupabase, SyncError, toSyncError } from "@/services/supabase";

/**
 * Adaptateur entre le moteur de synchro (`src/services/sync.ts`) et Supabase : Postgres via PostgREST
 * pour les lignes, RPC pour les upserts « si plus récent », Storage pour les documents. Aucune logique
 * de fusion ici ; aucune clé secrète : tout passe sous la session de la personne et les règles RLS.
 */
const TIMEOUT_MS = 20_000;
const PAGE = 1000;
const CHUNK = 200;
const BUCKET = "documents";

function signal(): AbortSignal {
  return AbortSignal.timeout(TIMEOUT_MS);
}

export type MemberTrip = { id: string; name: string; ownerId: string; role: "owner" | "editor"; config: unknown };

/** Les voyages dont la personne est membre, avec son rôle. */
export async function listMemberTrips(): Promise<MemberTrip[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("members").select("role, trips(id, name, owner_id, config)").abortSignal(signal());
  if (error) throw toSyncError(error, "Liste des voyages");
  type Row = { role: string; trips: { id: string; name: string; owner_id: string; config: unknown } | null };
  return ((data ?? []) as unknown as Row[])
    .flatMap((row) => (row.trips ? [{ id: row.trips.id, name: row.trips.name, ownerId: row.trips.owner_id, role: row.role === "owner" ? ("owner" as const) : ("editor" as const), config: row.trips.config }] : []))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchTrip(tripId: string): Promise<{ config: TripConfig; name: string; ownerId: string } | null> {
  const client = requireSupabase();
  const { data, error } = await client.from("trips").select("id, name, owner_id, config").eq("id", tripId).abortSignal(signal()).maybeSingle();
  if (error) throw toSyncError(error, "Voyage");
  if (!data) return null;
  const row = data as { name: string; owner_id: string; config: unknown };
  return { config: validateTripConfig(row.config), name: row.name, ownerId: row.owner_id };
}

/** Crée le voyage et son membre propriétaire (fonction SQL `create_trip`). Renvoie l'identifiant. */
export async function createTrip(config: TripConfig): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("create_trip", { p_config: config }).abortSignal(signal());
  if (error) throw toSyncError(error, "Création du voyage");
  return typeof data === "string" ? data : config.id;
}

export async function addMemberByEmail(tripId: string, email: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("add_member_by_email", { p_trip: tripId, p_email: email.trim() }).abortSignal(signal());
  if (error) throw toSyncError(error, "Ajout d’un membre");
}

export type Member = { userId: string; role: "owner" | "editor"; displayName: string };

export async function listMembers(tripId: string): Promise<Member[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("members").select("user_id, role").eq("trip_id", tripId).abortSignal(signal());
  if (error) throw toSyncError(error, "Membres");
  const rows = (data ?? []) as unknown as Array<{ user_id: string; role: string }>;
  if (rows.length === 0) return [];
  const { data: profiles, error: profilesError } = await client
    .from("profiles")
    .select("id, display_name")
    .in(
      "id",
      rows.map((r) => r.user_id),
    )
    .abortSignal(signal());
  if (profilesError) throw toSyncError(profilesError, "Profils");
  const names = new Map(((profiles ?? []) as unknown as Array<{ id: string; display_name: string }>).map((p) => [p.id, p.display_name]));
  return rows
    .map((r) => ({ userId: r.user_id, role: r.role === "owner" ? ("owner" as const) : ("editor" as const), displayName: names.get(r.user_id) || "(sans nom)" }))
    .sort((a, b) => (a.role === b.role ? a.displayName.localeCompare(b.displayName) : a.role === "owner" ? -1 : 1));
}

export async function removeMember(tripId: string, userId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("members").delete().eq("trip_id", tripId).eq("user_id", userId).abortSignal(signal());
  if (error) throw toSyncError(error, "Retrait d’un membre");
}

/** `updatedAt` : la valeur brute de la colonne, à renvoyer telle quelle comme verrou optimiste. */
export type RemoteItinerary = { doc: ItineraryDoc; updatedAt: string };

const ITINERARY_COLUMNS = "trip_id, format, snapshot, marks, updated_at, updated_by";

export async function fetchItinerary(tripId: string): Promise<RemoteItinerary | null> {
  const client = requireSupabase();
  const { data, error } = await client.from("itineraries").select(ITINERARY_COLUMNS).eq("trip_id", tripId).abortSignal(signal()).maybeSingle();
  if (error) throw toSyncError(error, "Itinéraire");
  if (!data) return null;
  const row = data as unknown as { format: number; snapshot: unknown; marks: unknown; updated_at: string; updated_by: string };
  if (!row.snapshot || typeof row.snapshot !== "object") return null;
  return {
    updatedAt: row.updated_at,
    doc: {
      format: SYNC_FORMAT,
      updatedAt: toIso(row.updated_at),
      updatedBy: row.updated_by ?? "",
      snapshot: row.snapshot as TripSnapshot,
      marks: Array.isArray(row.marks) ? (row.marks as TripMark[]) : [],
    },
  };
}

/** `updated_at` brut seul, pour annoncer ce qu'une synchro ferait sans télécharger l'itinéraire. */
export async function fetchItineraryMeta(tripId: string): Promise<string | null> {
  const client = requireSupabase();
  const { data, error } = await client.from("itineraries").select("updated_at").eq("trip_id", tripId).abortSignal(signal()).maybeSingle();
  if (error) throw toSyncError(error, "Itinéraire");
  return (data as { updated_at: string } | null)?.updated_at ?? null;
}

/**
 * Crée ou remplace l'itinéraire. `expected` : le `updated_at` lu à cette passe (`null` : aucun) ;
 * s'il a changé entre-temps, zéro ligne modifiée et `SyncError.isConflict` : relire, fusionner, réessayer.
 */
export async function putItinerary(tripId: string, doc: ItineraryDoc, expected: string | null): Promise<string> {
  const client = requireSupabase();
  const row = { trip_id: tripId, format: doc.format, snapshot: doc.snapshot, marks: doc.marks, updated_at: doc.updatedAt, updated_by: doc.updatedBy };
  if (expected === null) {
    const { data, error } = await client.from("itineraries").insert(row).select("updated_at").abortSignal(signal()).single();
    if (error) throw toSyncError(error, "Itinéraire");
    return (data as { updated_at: string }).updated_at;
  }
  const { data, error } = await client.from("itineraries").update(row).eq("trip_id", tripId).eq("updated_at", expected).select("updated_at").abortSignal(signal());
  if (error) throw toSyncError(error, "Itinéraire");
  const rows = (data ?? []) as Array<{ updated_at: string }>;
  if (rows.length === 0) throw new SyncError("L’itinéraire a été modifié par un autre appareil entre-temps", "conflict");
  return rows[0].updated_at;
}

async function fetchAll<T>(table: string, columns: string, tripId: string, context: string): Promise<T[]> {
  const client = requireSupabase();
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .eq("trip_id", tripId)
      .order("updated_at", { ascending: true })
      .range(from, from + PAGE - 1)
      .abortSignal(signal());
    if (error) throw toSyncError(error, context);
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export function fetchTravelRows(tripId: string): Promise<TravelItemRow[]> {
  return fetchAll<TravelItemRow>("travel_items", "id, trip_id, kind, scope, payload, updated_at, updated_by", tripId, "Réservations et notes");
}

export function fetchExpenseRows(tripId: string): Promise<ExpenseRow[]> {
  return fetchAll<ExpenseRow>("expenses", "id, trip_id, payload, updated_at, updated_by", tripId, "Dépenses");
}

export async function fetchDeletions(tripId: string): Promise<DeletionRow[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("deletions").select("trip_id, entity_id, deleted_at").eq("trip_id", tripId).abortSignal(signal());
  if (error) throw toSyncError(error, "Suppressions");
  return (data ?? []) as unknown as DeletionRow[];
}

async function rpcInChunks(fn: string, rows: unknown[], context: string): Promise<void> {
  const client = requireSupabase();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await client.rpc(fn, { items: rows.slice(i, i + CHUNK) }).abortSignal(signal());
    if (error) throw toSyncError(error, context);
  }
}

export function pushTravelRows(rows: TravelItemRow[]): Promise<void> {
  return rpcInChunks("upsert_travel_items", rows, "Envoi des réservations et notes");
}

export function pushExpenseRows(rows: ExpenseRow[]): Promise<void> {
  return rpcInChunks("upsert_expenses", rows, "Envoi des dépenses");
}

export function pushDeletions(rows: DeletionRow[]): Promise<void> {
  return rpcInChunks("upsert_deletions", rows, "Envoi des suppressions");
}

/** `exists` : l'autre appareil l'a déjà envoyé, rien à faire. */
export async function uploadDocument(path: string, blob: Blob, contentType: string): Promise<"uploaded" | "exists"> {
  const client = requireSupabase();
  const { error } = await client.storage.from(BUCKET).upload(path, blob, { upsert: false, contentType });
  if (!error) return "uploaded";
  const err = toSyncError(error, "Document");
  if (err.isConflict) return "exists";
  throw err;
}

/** `null` quand le fichier n'est pas (encore) dans le bucket. */
export async function downloadDocument(path: string): Promise<Blob | null> {
  const client = requireSupabase();
  const { data, error } = await client.storage.from(BUCKET).download(path);
  if (error) {
    const err = toSyncError(error, "Document");
    if (err.kind === "not-found") return null;
    throw err;
  }
  return data;
}

/** Retire du bucket le fichier d'un document supprimé, quelle que soit son extension. */
export async function removeDocument(tripId: string, docId: string): Promise<void> {
  const client = requireSupabase();
  const { data, error } = await client.storage.from(BUCKET).list(tripId, { search: docId });
  if (error) throw toSyncError(error, "Document");
  const names = (data ?? []).filter((o) => o.name.startsWith(`${docId}.`)).map((o) => `${tripId}/${o.name}`);
  if (names.length === 0) return;
  const { error: removeError } = await client.storage.from(BUCKET).remove(names);
  if (removeError) throw toSyncError(removeError, "Document");
}
