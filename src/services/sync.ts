import { getDocumentBlob, putDocumentBlob } from "@/lib/document-store";
import { migrateSnapshot } from "@/lib/migrations";
import { decryptSecret, encryptSecret } from "@/lib/secure";
import {
  applyItinerary,
  applyTravel,
  decideItinerary,
  documentPath,
  emptyExpensesDoc,
  emptyTravelDoc,
  extractExpenses,
  extractTravel,
  isExpensesDoc,
  isItineraryDoc,
  isTravelDoc,
  itinerarySignature,
  mergeExpenses,
  mergeTravel,
  stripTravel,
  tripPaths,
  type ExpensesDoc,
  type ItineraryDoc,
  type TravelDoc,
} from "@/lib/sync-model";
import { validateTripConfig } from "@/lib/trip-config";
import type { Booking, TripConfig } from "@/lib/types";
import { GitHubError, getFile, getJson, putFile, putJson, type RepoRef } from "@/services/github-repo";
import { currentAuthor } from "@/store/profile-store";
import { ensureSyncHydrated, isSyncConfigured, useSyncStore, type SyncSettings } from "@/store/sync-store";
import { currentSnapshot, useTripStore } from "@/store/trip-store";

/**
 * Moteur de synchronisation : lit les trois fichiers du voyage dans le dépôt privé, fusionne avec
 * l'état local (`src/lib/sync-model.ts`), applique le résultat au store, renvoie ce qui a changé.
 * Un 409 (autre appareil passé entre-temps) relance toute la passe : elle est idempotente.
 *
 * Hors ligne, rien ne part : l'état local (IndexedDB) porte les modifications, `pending` reste levé
 * et la passe repart sur `online`, au retour au premier plan et toutes les dix minutes.
 */
export type SyncOutcome = { ok: true; report: string } | { ok: false; reason: "not-configured" | "offline" | "busy" | "error"; message?: string };

const MAX_ATTEMPTS = 3;
let running: Promise<SyncOutcome> | null = null;
let applying = false;

export function repoRef(settings: SyncSettings): RepoRef {
  return { owner: settings.owner.trim(), repo: settings.repo.trim(), branch: settings.branch.trim() || undefined, token: settings.token.trim() };
}

export type RemoteTripEntry = { id: string; name: string; regionId?: string; start?: string; end?: string };

/** `trips/index.json` du dépôt privé. */
export async function listRemoteTrips(settings: SyncSettings): Promise<RemoteTripEntry[]> {
  const index = await getJson<{ trips?: unknown }>(repoRef(settings), "trips/index.json");
  if (!index || !Array.isArray(index.data.trips)) return [];
  return index.data.trips.flatMap((raw): RemoteTripEntry[] => {
    const t = raw as Partial<RemoteTripEntry> | null;
    return t && typeof t.id === "string" && typeof t.name === "string" ? [{ id: t.id, name: t.name, regionId: t.regionId, start: t.start, end: t.end }] : [];
  });
}

export function syncNow(reason: string): Promise<SyncOutcome> {
  if (running) return running;
  running = run(reason).finally(() => {
    running = null;
  });
  return running;
}

async function run(reason: string): Promise<SyncOutcome> {
  await ensureSyncHydrated();
  const sync = useSyncStore.getState();
  if (!isSyncConfigured(sync.settings)) return { ok: false, reason: "not-configured" };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    sync.fail("", true);
    return { ok: false, reason: "offline" };
  }
  sync.begin();
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const report = await pass(reason);
      return { ok: true, report };
    } catch (error) {
      lastError = error;
      if (error instanceof GitHubError && error.isConflict && attempt < MAX_ATTEMPTS) continue;
      break;
    }
  }
  const message = lastError instanceof Error ? lastError.message : "Synchronisation impossible";
  const offline = lastError instanceof GitHubError && lastError.status === 0 && typeof navigator !== "undefined" && !navigator.onLine;
  useSyncStore.getState().fail(message, offline);
  return { ok: false, reason: offline ? "offline" : "error", message };
}

async function pass(reason: string): Promise<string> {
  const sync = useSyncStore.getState();
  const settings = sync.settings;
  const ref = repoRef(settings);
  const tripId = settings.tripId as string;
  const paths = tripPaths(tripId);
  const shas: Record<string, string> = { ...sync.shas };
  const changes: string[] = [];

  // 1. Le voyage lui-même (dates, véhicule, hébergements), écrit à la main dans le dépôt privé.
  const trip = useTripStore.getState();
  let config: TripConfig | null = trip.config;
  if (!config || config.id !== tripId) {
    const remoteTrip = await getJson<unknown>(ref, paths.trip);
    if (!remoteTrip) throw new GitHubError(`Aucun ${paths.trip} dans le dépôt`, 404, paths.trip);
    config = validateTripConfig(remoteTrip.data);
    shas[paths.trip] = remoteTrip.sha;
    withoutMarking(() => useTripStore.getState().setTripConfig(config as TripConfig, { reset: trip.config?.id !== tripId && trip.days.length > 0 }));
    changes.push("voyage chargé");
  }

  // 2. Les trois fichiers, en parallèle.
  const [remoteItin, remoteTravel, remoteExpenses] = await Promise.all([
    getJson<unknown>(ref, paths.itinerary),
    getJson<unknown>(ref, paths.travel),
    getJson<unknown>(ref, paths.expenses),
  ]);

  // 3. Itinéraire : fichier entier, dernière écriture gagne.
  const state = useTripStore.getState();
  let snapshot = currentSnapshot(state);
  let marks = state.marks;
  const hasLocal = state.days.some((d) => d.stopIds.length > 0) || state.legs.length > 0;
  const remoteItinDoc = remoteItin && isItineraryDoc(remoteItin.data) ? (remoteItin.data as ItineraryDoc) : null;
  const decision = decideItinerary({
    localChangedAt: sync.itineraryChangedAt,
    remoteChanged: !!remoteItin && remoteItin.sha !== sync.shas[paths.itinerary],
    remoteUpdatedAt: remoteItinDoc?.updatedAt ?? null,
    hasRemote: !!remoteItinDoc,
    hasLocal,
  });
  if (decision === "take-remote" && remoteItinDoc) {
    snapshot = applyItinerary(snapshot, migrateSnapshot(remoteItinDoc.snapshot));
    marks = Array.isArray(remoteItinDoc.marks) ? remoteItinDoc.marks : marks;
    changes.push(`itinéraire reçu (${remoteItinDoc.updatedBy || "autre appareil"})`);
  }
  if (remoteItin) shas[paths.itinerary] = remoteItin.sha;

  // 4. Données de voyage et dépenses : fusion par entité.
  const now = new Date().toISOString();
  const remoteTravelDoc = remoteTravel && isTravelDoc(remoteTravel.data) ? await unlockTravel(remoteTravel.data as TravelDoc, settings.passphrase) : emptyTravelDoc();
  const remoteExpensesDoc = remoteExpenses && isExpensesDoc(remoteExpenses.data) ? (remoteExpenses.data as ExpensesDoc) : emptyExpensesDoc();
  const mergedTravel = mergeTravel(extractTravel(snapshot, now), remoteTravelDoc);
  const mergedExpenses = mergeExpenses(extractExpenses(snapshot, now), remoteExpensesDoc);
  snapshot = applyTravel(snapshot, mergedTravel, mergedExpenses);

  // 5. Application locale, en une écriture, sans relever `pending`.
  withoutMarking(() =>
    useTripStore.getState().applySync({
      days: snapshot.days,
      stops: snapshot.stops,
      legs: snapshot.legs,
      customPins: snapshot.customPins,
      currentDayIndex: snapshot.currentDayIndex,
      frozenAt: snapshot.frozenAt ?? null,
      marks,
      tombstones: snapshot.tombstones ?? {},
      ...(decision === "take-remote" && config ? { activeSavedName: config.name } : {}),
    }),
  );

  // 6. Envois : seulement ce qui diffère du dépôt.
  const author = currentAuthor();
  if (decision === "push-local") {
    const doc: ItineraryDoc = { format: 1, updatedAt: now, updatedBy: author, snapshot: stripTravel(snapshot), marks };
    const put = await putJson(ref, paths.itinerary, doc, `Itinéraire (${author})`, remoteItin?.sha ?? null);
    shas[paths.itinerary] = put.sha;
    changes.push("itinéraire envoyé");
  }
  const sealedTravel = await sealTravel(mergedTravel, remoteTravelDoc, settings.passphrase);
  if (!remoteTravel || !sameDoc(sealedTravel, remoteTravel.data)) {
    const put = await putJson(ref, paths.travel, { ...sealedTravel, updatedAt: now }, `Réservations et notes (${author})`, remoteTravel?.sha ?? null);
    shas[paths.travel] = put.sha;
    changes.push("réservations envoyées");
  } else {
    shas[paths.travel] = remoteTravel.sha;
  }
  if (!remoteExpenses || !sameDoc(mergedExpenses, remoteExpenses.data)) {
    const put = await putJson(ref, paths.expenses, { ...mergedExpenses, updatedAt: now }, `Dépenses (${author})`, remoteExpenses?.sha ?? null);
    shas[paths.expenses] = put.sha;
    changes.push("dépenses envoyées");
  } else {
    shas[paths.expenses] = remoteExpenses.sha;
  }

  // 7. Documents : contenu manquant d'un côté ou de l'autre. Jamais bloquant.
  const docs = await syncDocuments(ref, tripId, mergedTravel, shas);
  if (docs.uploaded) changes.push(`${docs.uploaded} document${docs.uploaded > 1 ? "s" : ""} envoyé${docs.uploaded > 1 ? "s" : ""}`);
  if (docs.downloaded) changes.push(`${docs.downloaded} document${docs.downloaded > 1 ? "s" : ""} reçu${docs.downloaded > 1 ? "s" : ""}`);
  if (docs.failed) changes.push(`${docs.failed} document${docs.failed > 1 ? "s" : ""} en attente`);

  const report = changes.length > 0 ? changes.join(", ") : "à jour";
  useSyncStore.getState().finish(`${report} (${reason})`, shas);
  return report;
}

/** Les écritures venues de la synchro ne doivent pas relever `pending`. */
function withoutMarking(fn: () => void): void {
  applying = true;
  try {
    fn();
  } finally {
    applying = false;
  }
}

/** Même contenu, à `updatedAt` près (qui change à chaque passe). */
function sameDoc(a: unknown, b: unknown): boolean {
  const strip = (v: unknown) => JSON.stringify(v, (key, value: unknown) => (key === "updatedAt" && typeof value === "string" && value === (v as { updatedAt?: string }).updatedAt ? undefined : value));
  return strip(a) === strip(b);
}

/** Déchiffre les codes reçus quand la phrase est connue ; sinon ils restent sous enveloppe. */
async function unlockTravel(doc: TravelDoc, passphrase: string): Promise<TravelDoc> {
  if (!passphrase) return doc;
  const stops: TravelDoc["stops"] = {};
  for (const [id, stop] of Object.entries(doc.stops)) {
    const bookings: Booking[] = [];
    for (const booking of stop.bookings) {
      if (booking.accessCodeSecure && !booking.accessCode) {
        const plain = await decryptSecret(booking.accessCodeSecure, passphrase);
        bookings.push(plain != null ? { ...booking, accessCode: plain } : booking);
      } else {
        bookings.push(booking);
      }
    }
    stops[id] = { ...stop, bookings };
  }
  return { ...doc, stops };
}

/**
 * Prépare le fichier à envoyer : avec une phrase, les codes en clair sont chiffrés (enveloppe conservée
 * si le code n'a pas changé, pour ne pas réécrire le fichier à chaque passe) ; sans phrase, rien ne bouge.
 */
async function sealTravel(doc: TravelDoc, remote: TravelDoc, passphrase: string): Promise<TravelDoc> {
  if (!passphrase) return doc;
  const remoteBookings = new Map<string, Booking>();
  for (const stop of Object.values(remote.stops)) for (const b of stop.bookings) remoteBookings.set(b.id, b);
  const stops: TravelDoc["stops"] = {};
  for (const [id, stop] of Object.entries(doc.stops)) {
    const bookings: Booking[] = [];
    for (const booking of stop.bookings) {
      if (!booking.accessCode) {
        bookings.push(booking);
        continue;
      }
      const previous = remoteBookings.get(booking.id);
      const reuse = previous?.accessCodeSecure && previous.updatedAt === booking.updatedAt && previous.accessCode === booking.accessCode ? previous.accessCodeSecure : null;
      const { accessCode: _plain, ...rest } = booking;
      void _plain;
      bookings.push({ ...rest, accessCodeSecure: reuse ?? (await encryptSecret(booking.accessCode, passphrase)) });
    }
    stops[id] = { ...stop, bookings };
  }
  return { ...doc, stops };
}

async function syncDocuments(ref: RepoRef, tripId: string, travel: TravelDoc, shas: Record<string, string>) {
  let uploaded = 0;
  let downloaded = 0;
  let failed = 0;
  for (const stop of Object.values(travel.stops)) {
    for (const doc of stop.documents) {
      const path = documentPath(tripId, doc);
      try {
        const local = await getDocumentBlob(doc.id);
        if (local && !shas[path]) {
          try {
            const put = await putFile(ref, path, new Uint8Array(await local.arrayBuffer()), `Document ${doc.id}`, null);
            shas[path] = put.sha;
            uploaded++;
          } catch (error) {
            // Déjà présent (envoyé par l'autre appareil) : on note son sha sans le réécrire.
            if (!(error instanceof GitHubError && error.isConflict)) throw error;
            const existing = await getFile(ref, path);
            if (existing) shas[path] = existing.sha;
          }
        } else if (!local) {
          const remote = await getFile(ref, path);
          if (remote) {
            await putDocumentBlob(doc.id, new Blob([remote.bytes as BlobPart], { type: doc.mimeType }));
            shas[path] = remote.sha;
            downloaded++;
          }
        }
      } catch {
        failed++;
      }
    }
  }
  return { uploaded, downloaded, failed };
}

let scheduler: { stop: () => void } | null = null;
const DEBOUNCE_MS = 4_000;
const INTERVAL_MS = 10 * 60_000;
const STALE_MS = 5 * 60_000;

/**
 * Planificateur : relève `pending` à chaque changement du brouillon, envoie après un court délai,
 * retente au retour du réseau et au premier plan, vérifie toutes les dix minutes.
 */
export function startSyncScheduler(): () => void {
  if (scheduler) return scheduler.stop;
  let debounce: number | null = null;
  const kick = (reason: string) => {
    const sync = useSyncStore.getState();
    if (!sync.settings.autoSync || !isSyncConfigured(sync.settings)) return;
    if (debounce) window.clearTimeout(debounce);
    debounce = window.setTimeout(() => void syncNow(reason), DEBOUNCE_MS);
  };

  const unsubscribe = useTripStore.subscribe((next, prev) => {
    if (applying) return;
    const structural =
      next.days !== prev.days || next.stops !== prev.stops || next.legs !== prev.legs || next.customPins !== prev.customPins || next.frozenAt !== prev.frozenAt;
    const travel = structural || next.marks !== prev.marks || next.tombstones !== prev.tombstones;
    if (!travel) return;
    const itineraryChanged = structural && itinerarySignature(currentSnapshot(next)) !== itinerarySignature(currentSnapshot(prev));
    useSyncStore.getState().markPending(itineraryChanged);
    kick("modification");
  });

  const onOnline = () => kick("retour du réseau");
  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    const sync = useSyncStore.getState();
    const stale = !sync.lastSyncAt || Date.now() - new Date(sync.lastSyncAt).getTime() > STALE_MS;
    if (sync.pending || stale) kick("premier plan");
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  const interval = window.setInterval(() => kick("vérification périodique"), INTERVAL_MS);

  void ensureSyncHydrated().then(() => {
    const sync = useSyncStore.getState();
    if (isSyncConfigured(sync.settings) && sync.settings.autoSync) void syncNow("ouverture");
  });

  scheduler = {
    stop: () => {
      unsubscribe();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
      if (debounce) window.clearTimeout(debounce);
      scheduler = null;
    },
  };
  return scheduler.stop;
}
