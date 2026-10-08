import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase, un seul par page. La clé publiable est faite pour le navigateur : la protection
 * vient des règles par ligne (RLS) du schéma (`supabase/schema.sql`). Sans variables de build,
 * l'app tourne en « local seulement » : rien ne casse, la synchro est simplement indisponible.
 */
const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

let client: SupabaseClient | null | undefined;

export function isSupabaseConfigured(): boolean {
  return !!URL?.trim() && !!KEY?.trim();
}

/** `null` quand les variables manquent. */
export function getSupabase(): SupabaseClient | null {
  if (client === undefined) {
    client = isSupabaseConfigured() ? createClient(URL as string, KEY as string, { auth: { flowType: "pkce" } }) : null;
  }
  return client;
}

export type SyncErrorKind = "config" | "auth" | "conflict" | "network" | "not-found" | "server";

export class SyncError extends Error {
  constructor(
    message: string,
    public readonly kind: SyncErrorKind,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "SyncError";
  }
  /** Quelqu'un a écrit entre la lecture et l'écriture : relire, fusionner, réessayer. */
  get isConflict(): boolean {
    return this.kind === "conflict";
  }
}

export function requireSupabase(): SupabaseClient {
  const c = getSupabase();
  if (!c) throw new SyncError("Synchro indisponible : variables VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY absentes du build.", "config");
  return c;
}

type ApiError = { message?: string; code?: string; details?: string; status?: number; statusCode?: string | number };

/** Traduit une erreur PostgREST, Auth ou Storage en `SyncError` lisible à l'écran. */
export function toSyncError(error: unknown, context?: string): SyncError {
  if (error instanceof SyncError) return error;
  const e = (error ?? {}) as ApiError;
  const message = typeof e.message === "string" ? e.message : String(error);
  // Storage met le vrai code dans `statusCode` (corps) et un 400 générique dans `status` (HTTP).
  const status = Number(e.statusCode) || (typeof e.status === "number" ? e.status : undefined);
  const code = typeof e.code === "string" ? e.code : undefined;
  const prefix = context ? `${context} : ` : "";
  if (/failed to fetch|networkerror|load failed|fetch failed|aborted|network request failed/i.test(message) || status === 0) {
    return new SyncError(`${prefix}réseau indisponible`, "network", code);
  }
  if (code === "23505" || status === 409 || /already exists|duplicate key/i.test(message)) {
    return new SyncError(`${prefix}${message}`, "conflict", code);
  }
  if (status === 401 || code === "PGRST301" || /jwt|not authenticated|invalid claim/i.test(message)) {
    return new SyncError(`${prefix}session expirée, reconnecte-toi`, "auth", code);
  }
  if (status === 404 || code === "PGRST116" || code === "PGRST202" || /not found/i.test(message)) {
    return new SyncError(`${prefix}${message}`, "not-found", code);
  }
  if (status === 403 || code === "42501" || /row-level security|permission denied|not owner|unknown user/i.test(message)) {
    const label = /unknown user/.test(message) ? "aucun compte avec cet e-mail" : /not owner/.test(message) ? "réservé au propriétaire du voyage" : "accès refusé";
    return new SyncError(`${prefix}${label}`, "server", code);
  }
  return new SyncError(`${prefix}${message}`, "server", code);
}
