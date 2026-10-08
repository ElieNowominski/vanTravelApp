import { deleteDocumentBlob, getDocumentBlob, putDocumentBlob } from "@/lib/document-store";
import { migrateSnapshot } from "@/lib/migrations";
import { decryptSecret, encryptSecret } from "@/lib/secure";
import {
  applyItinerary,
  applyTravel,
  decideItinerary,
  extractExpenses,
  extractTravel,
  hasItinerary,
  itinerarySignature,
  mergeExpenses,
  mergeTravel,
  resolveItineraryDecision,
  stripTravel,
  type ItineraryDoc,
  type ItineraryForce,
  type TravelDoc,
} from "@/lib/sync-model";
import {
  expensesToRows,
  newerDeletions,
  newerRows,
  rowsToExpensesDoc,
  rowsToTombstones,
  rowsToTravelDoc,
  storageObjectPath,
  tombstonesToRows,
  travelDocToRows,
} from "@/lib/sync-rows";
import { describeItinerarySync } from "@/lib/sync-status";
import type { Booking, TripConfig } from "@/lib/types";
import { SyncError } from "@/services/supabase";
import {
  downloadDocument,
  fetchDeletions,
  fetchExpenseRows,
  fetchItinerary,
  fetchItineraryMeta,
  fetchTravelRows,
  fetchTrip,
  pushDeletions,
  pushExpenseRows,
  pushTravelRows,
  putItinerary,
  removeDocument,
  uploadDocument,
} from "@/services/supabase-sync";
import { ensureAccountHydrated, isSyncConfigured, useAccountStore } from "@/store/account-store";
import { currentAuthor } from "@/store/profile-store";
import { currentSnapshot, useTripStore } from "@/store/trip-store";

/**
 * Moteur de synchronisation : lit le voyage, l'itinéraire, les entités, les dépenses et les suppressions
 * sur Supabase, fusionne avec l'état local (`src/lib/sync-model.ts`), applique le résultat au store, puis
 * n'envoie que ce qui est plus récent que le serveur (`src/lib/sync-rows.ts`). Un conflit sur l'itinéraire
 * (autre appareil passé entre-temps) relance toute la passe : elle est idempotente.
 *
 * Hors ligne, rien ne part : l'état local (IndexedDB) porte les modifications, `pending` reste levé
 * et la passe repart sur `online`, au retour au premier plan et toutes les dix minutes.
 */
export type SyncOutcome = { ok: true; report: string } | { ok: false; reason: "not-configured" | "offline" | "busy" | "error"; message?: string };
/** `itinerary` : choix explicite de la personne (« Recevoir », « Envoyer ») ; la règle automatique sinon. */
export type SyncOptions = { itinerary?: ItineraryForce };

const MAX_ATTEMPTS = 3;
let running: Promise<SyncOutcome> | null = null;
let applying = false;

export function syncNow(reason: string, options: SyncOptions = {}): Promise<SyncOutcome> {
  if (running) return running;
  running = run(reason, options).finally(() => {
    running = null;
  });
  return running;
}

async function run(reason: string, options: SyncOptions): Promise<SyncOutcome> {
  await ensureAccountHydrated();
  const account = useAccountStore.getState();
  if (!isSyncConfigured(account)) return { ok: false, reason: "not-configured" };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    account.fail("", true);
    return { ok: false, reason: "offline" };
  }
  account.begin();
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const report = await pass(reason, options);
      return { ok: true, report };
    } catch (error) {
      lastError = error;
      if (error instanceof SyncError && error.isConflict && attempt < MAX_ATTEMPTS) continue;
      break;
    }
  }
  const message = lastError instanceof Error ? lastError.message : "Synchronisation impossible";
  const offline = lastError instanceof SyncError && lastError.kind === "network" && typeof navigator !== "undefined" && !navigator.onLine;
  useAccountStore.getState().fail(message, offline);
  return { ok: false, reason: offline ? "offline" : "error", message };
}

async function pass(reason: string, options: SyncOptions): Promise<string> {
  const account = useAccountStore.getState();
  const tripId = account.settings.tripId as string;
  const passphrase = account.settings.passphrase;
  const seen: Record<string, string> = { ...account.seen };
  const changes: string[] = [];

  // 1. Le voyage lui-même (dates, véhicule, hébergements) : la ligne `trips`.
  const trip = useTripStore.getState();
  let config: TripConfig | null = trip.config;
  let tripReset = false;
  if (!config || config.id !== tripId) {
    const remote = await fetchTrip(tripId);
    if (!remote) throw new SyncError("Voyage introuvable sur le compte (supprimé, ou accès retiré)", "not-found");
    config = remote.config;
    // Le circuit local (sauvegarde importée, circuit rouvert depuis la bibliothèque) porte souvent un autre
    // identifiant que le voyage du compte : `setTripConfig` le garde s'il couvre les mêmes dates et
    // `decideItinerary` tranche ensuite entre lui et le serveur. Un calendrier différent repart d'un brouillon vierge.
    withoutMarking(() => useTripStore.getState().setTripConfig(config as TripConfig));
    tripReset = useTripStore.getState().days !== trip.days;
    changes.push("voyage chargé");
  }

  // 2. Tout le reste, en parallèle.
  const [remoteItin, travelRows, expenseRows, deletionRows] = await Promise.all([
    fetchItinerary(tripId),
    fetchTravelRows(tripId),
    fetchExpenseRows(tripId),
    fetchDeletions(tripId),
  ]);

  // 3. Itinéraire : document entier, dernière écriture gagne.
  const state = useTripStore.getState();
  let snapshot = currentSnapshot(state);
  let marks = state.marks;
  // Le départ posé automatiquement ne compte pas comme itinéraire, d'un côté comme de l'autre : un brouillon
  // vide ne l'emporte jamais sur un serveur qui a un itinéraire, même avec une modification en attente.
  const hasLocal = hasItinerary(snapshot);
  const remoteSnapshot = remoteItin ? migrateSnapshot(remoteItin.doc.snapshot) : null;
  const hasRemote = !!remoteSnapshot && hasItinerary(remoteSnapshot);
  const auto = decideItinerary({
    localChangedAt: tripReset ? null : account.itineraryChangedAt,
    remoteChanged: !!remoteItin && remoteItin.updatedAt !== account.seen.itinerary,
    remoteUpdatedAt: remoteItin?.doc.updatedAt ?? null,
    hasRemote,
    hasLocal,
  });
  const decision = resolveItineraryDecision(auto, options.itinerary ?? "auto", { hasLocal, hasRemote });
  if (decision === "take-remote" && remoteItin && remoteSnapshot) {
    snapshot = applyItinerary(snapshot, remoteSnapshot);
    marks = Array.isArray(remoteItin.doc.marks) ? remoteItin.doc.marks : marks;
    changes.push(`itinéraire reçu (${remoteItin.doc.updatedBy || "autre appareil"})`);
  }
  if (remoteItin) seen.itinerary = remoteItin.updatedAt;

  // 4. Données de voyage et dépenses : fusion par entité.
  const now = new Date().toISOString();
  const remoteTombstones = rowsToTombstones(deletionRows);
  const remoteTravelDoc = await unlockTravel(rowsToTravelDoc(travelRows, remoteTombstones), passphrase);
  const remoteExpensesDoc = rowsToExpensesDoc(expenseRows, remoteTombstones);
  const mergedTravel = mergeTravel(extractTravel(snapshot, now), remoteTravelDoc);
  const mergedExpenses = mergeExpenses(extractExpenses(snapshot, now), remoteExpensesDoc);
  snapshot = applyTravel(snapshot, mergedTravel, mergedExpenses);
  const tombstones = snapshot.tombstones ?? {};

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
      tombstones,
      ...(decision === "take-remote" && config ? { activeSavedName: config.name } : {}),
    }),
  );

  // 6. Envois : seulement ce qui est plus récent que le serveur (qui le revérifie de son côté).
  const author = currentAuthor();
  if (decision === "push-local") {
    const doc: ItineraryDoc = { format: 1, updatedAt: now, updatedBy: author, snapshot: stripTravel(snapshot), marks };
    seen.itinerary = await putItinerary(tripId, doc, remoteItin?.updatedAt ?? null);
    changes.push("itinéraire envoyé");
  }
  const sealedTravel = await sealTravel(mergedTravel, remoteTravelDoc, passphrase, now);
  const travelToPush = newerRows(travelDocToRows(tripId, sealedTravel), travelRows);
  if (travelToPush.length > 0) {
    await pushTravelRows(travelToPush);
    changes.push(plural(travelToPush.length, "entrée envoyée", "entrées envoyées"));
  }
  const expensesToPush = newerRows(expensesToRows(tripId, mergedExpenses), expenseRows);
  if (expensesToPush.length > 0) {
    await pushExpenseRows(expensesToPush);
    changes.push(plural(expensesToPush.length, "dépense envoyée", "dépenses envoyées"));
  }
  const deletionsToPush = newerDeletions(tombstonesToRows(tripId, tombstones), deletionRows);
  if (deletionsToPush.length > 0) await pushDeletions(deletionsToPush);

  // 7. Documents : contenu manquant d'un côté ou de l'autre. Jamais bloquant.
  const docs = await syncDocuments(tripId, mergedTravel, tombstones, seen);
  if (docs.uploaded) changes.push(plural(docs.uploaded, "document envoyé", "documents envoyés"));
  if (docs.downloaded) changes.push(plural(docs.downloaded, "document reçu", "documents reçus"));
  if (docs.failed) changes.push(plural(docs.failed, "document en attente", "documents en attente"));

  // 8. Rien d'aucun côté : le plan du voyage sert de point de départ. Les routes se calculent en
  // arrière-plan ; le planificateur enverra l'itinéraire obtenu à la passe suivante.
  const seedPlan = decision === "none" && !hasLocal && config.plan.days.length > 0;
  if (seedPlan) changes.push("plan du voyage chargé");

  const report = changes.length > 0 ? changes.join(", ") : "à jour";
  useAccountStore.getState().finish(`${report} (${reason})`, seen);
  if (seedPlan) void useTripStore.getState().loadCatalogPlan();
  return report;
}

/** Annonce, sans rien écrire, ce que la prochaine synchro ferait de l'itinéraire (`updated_at` seul côté serveur). */
export async function previewItinerarySync(): Promise<string> {
  await ensureAccountHydrated();
  const account = useAccountStore.getState();
  if (!isSyncConfigured(account)) return "";
  const meta = await fetchItineraryMeta(account.settings.tripId as string);
  return describeItinerarySync({
    hasLocal: hasItinerary(currentSnapshot(useTripStore.getState())),
    localChangedAt: account.itineraryChangedAt,
    hasRemote: meta !== null,
    remoteChanged: meta !== null && meta !== account.seen.itinerary,
  });
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
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
 * Prépare ce qui part : avec une phrase, les codes en clair sont chiffrés. L'enveloppe est réutilisée si le
 * code n'a pas changé (rien à renvoyer) ; un code que le serveur détient en clair est redaté de `now` pour
 * que le serveur, qui n'accepte qu'une ligne plus récente, remplace le clair par l'enveloppe. Sans phrase, rien ne bouge.
 */
async function sealTravel(doc: TravelDoc, remote: TravelDoc, passphrase: string, now: string): Promise<TravelDoc> {
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
      const plainOnServer = !!previous && !previous.accessCodeSecure && previous.updatedAt === booking.updatedAt;
      const { accessCode: _plain, ...rest } = booking;
      void _plain;
      bookings.push({
        ...rest,
        ...(plainOnServer ? { updatedAt: now } : {}),
        accessCodeSecure: reuse ?? (await encryptSecret(booking.accessCode, passphrase)),
      });
    }
    stops[id] = { ...stop, bookings };
  }
  return { ...doc, stops };
}

async function syncDocuments(tripId: string, travel: TravelDoc, tombstones: Record<string, string>, seen: Record<string, string>) {
  let uploaded = 0;
  let downloaded = 0;
  let failed = 0;
  for (const stop of Object.values(travel.stops)) {
    for (const doc of stop.documents) {
      const path = storageObjectPath(tripId, doc);
      const key = `doc:${doc.id}`;
      try {
        const local = await getDocumentBlob(doc.id);
        if (local && !seen[key]) {
          if ((await uploadDocument(path, local, doc.mimeType)) === "uploaded") uploaded++;
          seen[key] = path;
        } else if (!local) {
          const remote = await downloadDocument(path);
          if (remote) {
            await putDocumentBlob(doc.id, new Blob([remote], { type: doc.mimeType }));
            seen[key] = path;
            downloaded++;
          }
        }
      } catch {
        failed++;
      }
    }
  }
  // Documents supprimés : le fichier quitte le bucket et cet appareil, une fois.
  for (const [id, at] of Object.entries(tombstones)) {
    if (!id.startsWith("doc-") || seen[`gone:${id}`]) continue;
    try {
      await removeDocument(tripId, id);
      await deleteDocumentBlob(id);
      seen[`gone:${id}`] = at;
    } catch {
      /* retenté à la prochaine passe */
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
    const account = useAccountStore.getState();
    if (!account.settings.autoSync || !isSyncConfigured(account)) return;
    if (debounce) window.clearTimeout(debounce);
    debounce = window.setTimeout(() => void syncNow(reason), DEBOUNCE_MS);
  };

  const unsubscribe = useTripStore.subscribe((next, prev) => {
    // La réhydratation du brouillon (IndexedDB) passe aussi par ici : ce n'est pas une modification. Sans ce
    // garde, chaque ouverture de l'app datait l'itinéraire local de « maintenant » et il gagnait toujours.
    if (applying || !useTripStore.persist.hasHydrated()) return;
    const structural =
      next.days !== prev.days || next.stops !== prev.stops || next.legs !== prev.legs || next.customPins !== prev.customPins || next.frozenAt !== prev.frozenAt;
    const travel = structural || next.marks !== prev.marks || next.tombstones !== prev.tombstones;
    if (!travel) return;
    const itineraryChanged = structural && itinerarySignature(currentSnapshot(next)) !== itinerarySignature(currentSnapshot(prev));
    useAccountStore.getState().markPending(itineraryChanged);
    kick("modification");
  });

  const onOnline = () => kick("retour du réseau");
  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    const account = useAccountStore.getState();
    const stale = !account.lastSyncAt || Date.now() - new Date(account.lastSyncAt).getTime() > STALE_MS;
    if (account.pending || stale) kick("premier plan");
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  const interval = window.setInterval(() => kick("vérification périodique"), INTERVAL_MS);

  void ensureAccountHydrated().then(() => {
    const account = useAccountStore.getState();
    if (isSyncConfigured(account) && account.settings.autoSync) void syncNow("ouverture");
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
