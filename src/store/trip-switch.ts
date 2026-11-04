import { newId } from "@/lib/geo";
import { buildSavedTrip, putSavedTrip } from "@/lib/trip-library";
import type { TripEntry } from "@/lib/trip-list";
import type { TripConfig } from "@/lib/types";
import { syncNow } from "@/services/sync";
import { isSyncConfigured, useAccountStore } from "@/store/account-store";
import { currentSnapshot, useTripStore } from "@/store/trip-store";

/**
 * Changer de voyage depuis l'accueil (lot 6). L'app ne tient qu'un voyage à la fois (le brouillon) :
 * avant d'en ouvrir un autre, le voyage ouvert part dans la bibliothèque de l'appareil, pour que rien ne
 * se perde, et sa synchro en attente part si le réseau le permet.
 *
 * Ordre imposé par la synchro : le brouillon change d'abord (la modification est notée pour l'ancien
 * voyage), puis `tripId` change, ce qui efface ces notes. Dans l'autre ordre, le voyage ouvert compterait
 * comme une modification locale du nouveau et écraserait l'itinéraire du compte.
 */
export async function stashActiveTrip(): Promise<void> {
  const account = useAccountStore.getState();
  if (isSyncConfigured(account) && account.pending && (typeof navigator === "undefined" || navigator.onLine)) {
    await syncNow("avant de changer de voyage");
  }
  const state = useTripStore.getState();
  if (!state.config) return;
  const id = state.activeSavedId ?? newId("trip");
  const trip = buildSavedTrip(state.activeSavedName ?? state.config.name, currentSnapshot(state), id, state.marks, state.config);
  await putSavedTrip(trip);
  state.setActiveSaved(id, trip.name);
}

function sameCalendar(a: TripConfig | null | undefined, b: TripConfig | null | undefined): boolean {
  return !!a && !!b && a.start.date === b.start.date && a.end.date === b.end.date;
}

/** Ouvre un voyage de la liste : copie locale si elle existe, sinon le voyage du compte, puis la synchro. */
export async function openTripEntry(entry: TripEntry): Promise<void> {
  if (entry.active) return;
  await stashActiveTrip();
  const store = useTripStore.getState();
  const remote = entry.account?.config ?? null;
  if (entry.saved && (!remote || sameCalendar(remote, entry.config))) {
    store.loadSavedTrip(entry.saved);
    // Nom ou profil changés sur le compte : même calendrier, les étapes restent.
    if (remote) useTripStore.getState().setTripConfig(remote);
  } else if (remote ?? entry.config) {
    store.setTripConfig((remote ?? entry.config) as TripConfig, { reset: true });
    const next = useTripStore.getState();
    next.setMarks([]);
    next.setActiveSaved(entry.saved?.id ?? null, entry.saved?.name ?? null);
  } else {
    throw new Error("Ce voyage n’a plus de dates lisibles.");
  }
  useTripStore.getState().setUiMode(null);
  useAccountStore.getState().setSettings({ tripId: entry.account ? entry.account.id : null });
  if (entry.account && isSyncConfigured(useAccountStore.getState())) void syncNow("voyage ouvert depuis l’accueil");
}

/** Crée un voyage neuf, local, aussitôt rangé dans la bibliothèque ; le mettre sur le compte reste un choix. */
export async function startNewTrip(config: TripConfig): Promise<void> {
  await stashActiveTrip();
  const store = useTripStore.getState();
  store.setTripConfig(config, { reset: true });
  const next = useTripStore.getState();
  next.setMarks([]);
  next.setUiMode(null);
  const id = newId("trip");
  await putSavedTrip(buildSavedTrip(config.name, currentSnapshot(useTripStore.getState()), id, [], config));
  useTripStore.getState().setActiveSaved(id, config.name);
  useAccountStore.getState().setSettings({ tripId: null });
}
