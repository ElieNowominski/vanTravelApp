import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";

export const SYNC_STORAGE_KEY = "vantravel-sync-v1";

/** Réglages saisis une fois par appareil. Le token vit ici (IndexedDB), jamais dans le code ni le bundle. */
export type SyncSettings = {
  owner: string;
  repo: string;
  /** Vide : branche par défaut du dépôt. */
  branch: string;
  token: string;
  tripId: string | null;
  autoSync: boolean;
  /** Phrase partagée qui chiffre les codes d'accès dans le dépôt ; vide : codes en clair dans le dépôt privé. */
  passphrase: string;
};

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

export type SyncState = {
  settings: SyncSettings;
  hydrated: boolean;
  status: SyncStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  lastReport: string | null;
  /** Des modifications locales attendent d'être envoyées. */
  pending: boolean;
  /** Dernière modification structurelle de l'itinéraire depuis la dernière synchro réussie. */
  itineraryChangedAt: string | null;
  /** `sha` connu de chaque fichier distant à la dernière synchro (chemin -> sha). */
  shas: Record<string, string>;
  setSettings: (patch: Partial<SyncSettings>) => void;
  markPending: (itineraryChanged: boolean) => void;
  begin: () => void;
  finish: (report: string, shas: Record<string, string>) => void;
  fail: (message: string, offline?: boolean) => void;
  forget: () => void;
};

export function defaultSyncSettings(): SyncSettings {
  return { owner: "", repo: "vanTravel", branch: "", token: "", tripId: null, autoSync: true, passphrase: "" };
}

export function isSyncConfigured(settings: SyncSettings): boolean {
  return settings.owner.trim().length > 0 && settings.repo.trim().length > 0 && settings.token.trim().length > 0 && !!settings.tripId;
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      settings: defaultSyncSettings(),
      hydrated: false,
      status: "idle",
      lastSyncAt: null,
      lastError: null,
      lastReport: null,
      pending: false,
      itineraryChangedAt: null,
      shas: {},
      setSettings: (patch) =>
        set((prev) => {
          const settings = { ...prev.settings, ...patch };
          // Autre dépôt ou autre voyage : les sha connus ne veulent plus rien dire.
          const scopeChanged =
            settings.owner !== prev.settings.owner || settings.repo !== prev.settings.repo || settings.tripId !== prev.settings.tripId || settings.branch !== prev.settings.branch;
          return scopeChanged ? { settings, shas: {}, lastSyncAt: null, lastError: null, lastReport: null, itineraryChangedAt: null } : { settings };
        }),
      markPending: (itineraryChanged) =>
        set((prev) => ({
          pending: true,
          itineraryChangedAt: itineraryChanged ? new Date().toISOString() : prev.itineraryChangedAt,
        })),
      begin: () => set({ status: "syncing", lastError: null }),
      finish: (report, shas) =>
        set({ status: "idle", lastSyncAt: new Date().toISOString(), lastReport: report, lastError: null, pending: false, itineraryChangedAt: null, shas }),
      fail: (message, offline = false) => set({ status: offline ? "offline" : "error", lastError: offline ? null : message }),
      forget: () => set({ settings: defaultSyncSettings(), shas: {}, lastSyncAt: null, lastError: null, lastReport: null, pending: false, itineraryChangedAt: null, status: "idle" }),
    }),
    {
      name: SYNC_STORAGE_KEY,
      storage: createJSONStorage(() => idbStorage),
      skipHydration: true,
      partialize: (state) => ({
        settings: state.settings,
        lastSyncAt: state.lastSyncAt,
        pending: state.pending,
        itineraryChangedAt: state.itineraryChangedAt,
        shas: state.shas,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SyncState>;
        return {
          ...current,
          settings: { ...defaultSyncSettings(), ...(p.settings ?? {}) },
          lastSyncAt: typeof p.lastSyncAt === "string" ? p.lastSyncAt : null,
          pending: p.pending === true,
          itineraryChangedAt: typeof p.itineraryChangedAt === "string" ? p.itineraryChangedAt : null,
          shas: p.shas && typeof p.shas === "object" ? p.shas : {},
          hydrated: true,
        };
      },
    },
  ),
);

let hydration: Promise<void> | null = null;

/** Réhydratation unique, attendue par le démarrage et par le planificateur. */
export function ensureSyncHydrated(): Promise<void> {
  if (!hydration) {
    hydration = Promise.resolve(useSyncStore.persist.rehydrate()).then(() => {
      if (!useSyncStore.getState().hydrated) useSyncStore.setState({ hydrated: true });
    });
  }
  return hydration;
}
