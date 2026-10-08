import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";

export const ACCOUNT_STORAGE_KEY = "vantravel-account-v1";

/** Réglages par appareil. La session Supabase elle-même vit dans le stockage de supabase-js. */
export type AccountSettings = {
  /** Voyage synchronisé (identifiant de la table `trips`). */
  tripId: string | null;
  autoSync: boolean;
  /** Phrase partagée qui chiffre les codes d'accès sur le serveur ; vide : codes en clair dans la base. */
  passphrase: string;
};

/** Identité mémorisée pour l'affichage hors ligne ; la vérité est la session supabase-js. */
export type AccountUser = { id: string; email: string | null; displayName: string };

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

export type AccountState = {
  settings: AccountSettings;
  user: AccountUser | null;
  hydrated: boolean;
  status: SyncStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  lastReport: string | null;
  /** Des modifications locales attendent d'être envoyées. */
  pending: boolean;
  /** Dernière modification structurelle de l'itinéraire depuis la dernière synchro réussie. */
  itineraryChangedAt: string | null;
  /**
   * Ce que cet appareil sait du serveur à la dernière synchro : `itinerary` -> `updated_at` brut de la
   * ligne (verrou optimiste), `doc:<id>` -> le fichier est dans le bucket, `gone:<id>` -> déjà retiré.
   */
  seen: Record<string, string>;
  setSettings: (patch: Partial<AccountSettings>) => void;
  setUser: (user: AccountUser | null) => void;
  markPending: (itineraryChanged: boolean) => void;
  begin: () => void;
  finish: (report: string, seen: Record<string, string>) => void;
  fail: (message: string, offline?: boolean) => void;
  /** Déconnexion locale : identité, voyage et état de synchro oubliés ; les données locales restent. */
  forget: () => void;
};

export function defaultAccountSettings(): AccountSettings {
  return { tripId: null, autoSync: true, passphrase: "" };
}

/** Une synchro peut partir : quelqu'un est connecté et un voyage est choisi. */
export function isSyncConfigured(state: Pick<AccountState, "user" | "settings">): boolean {
  return !!state.user && !!state.settings.tripId;
}

const cleared = () => ({ seen: {}, lastSyncAt: null, lastError: null, lastReport: null, pending: false, itineraryChangedAt: null, status: "idle" as const });

export const useAccountStore = create<AccountState>()(
  persist(
    (set) => ({
      settings: defaultAccountSettings(),
      user: null,
      hydrated: false,
      status: "idle",
      lastSyncAt: null,
      lastError: null,
      lastReport: null,
      pending: false,
      itineraryChangedAt: null,
      seen: {},
      setSettings: (patch) =>
        set((prev) => {
          const settings = { ...prev.settings, ...patch };
          // Autre voyage : ce qu'on savait du serveur ne veut plus rien dire.
          return settings.tripId !== prev.settings.tripId ? { settings, ...cleared() } : { settings };
        }),
      setUser: (user) =>
        set((prev) => {
          if (user?.id === prev.user?.id) return { user };
          // Autre compte : le voyage choisi et l'état de synchro ne lui appartiennent pas.
          return { user, settings: { ...prev.settings, tripId: null }, ...cleared() };
        }),
      markPending: (itineraryChanged) =>
        set((prev) => ({
          pending: true,
          itineraryChangedAt: itineraryChanged ? new Date().toISOString() : prev.itineraryChangedAt,
        })),
      begin: () => set({ status: "syncing", lastError: null }),
      finish: (report, seen) =>
        set({ status: "idle", lastSyncAt: new Date().toISOString(), lastReport: report, lastError: null, pending: false, itineraryChangedAt: null, seen }),
      fail: (message, offline = false) => set({ status: offline ? "offline" : "error", lastError: offline ? null : message }),
      forget: () => set({ user: null, settings: defaultAccountSettings(), ...cleared() }),
    }),
    {
      name: ACCOUNT_STORAGE_KEY,
      storage: createJSONStorage(() => idbStorage),
      skipHydration: true,
      partialize: (state) => ({
        settings: state.settings,
        user: state.user,
        lastSyncAt: state.lastSyncAt,
        pending: state.pending,
        itineraryChangedAt: state.itineraryChangedAt,
        seen: state.seen,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AccountState>;
        const u = p.user;
        return {
          ...current,
          settings: { ...defaultAccountSettings(), ...(p.settings ?? {}) },
          user: u && typeof u === "object" && typeof u.id === "string" ? { id: u.id, email: typeof u.email === "string" ? u.email : null, displayName: typeof u.displayName === "string" ? u.displayName : "" } : null,
          lastSyncAt: typeof p.lastSyncAt === "string" ? p.lastSyncAt : null,
          pending: p.pending === true,
          itineraryChangedAt: typeof p.itineraryChangedAt === "string" ? p.itineraryChangedAt : null,
          seen: p.seen && typeof p.seen === "object" ? p.seen : {},
          hydrated: true,
        };
      },
    },
  ),
);

let hydration: Promise<void> | null = null;

/** Réhydratation unique, attendue par le démarrage, l'écoute de session et le planificateur. */
export function ensureAccountHydrated(): Promise<void> {
  if (!hydration) {
    hydration = Promise.resolve(useAccountStore.persist.rehydrate()).then(() => {
      if (!useAccountStore.getState().hydrated) useAccountStore.setState({ hydrated: true });
    });
  }
  return hydration;
}
