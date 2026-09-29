import { create } from "zustand";

/**
 * Mise à jour de l'app (service worker en mode « prompt ») : la nouvelle version attend
 * que l'utilisateur l'applique, au lieu de recharger la page au milieu d'une saisie.
 * `src/main.tsx` branche les callbacks de `registerSW` sur ce store.
 */
type AppUpdateState = {
  /** Une nouvelle version est installée et attend d'être activée. */
  needRefresh: boolean;
  /** Première installation terminée : tout est en cache pour le hors ligne. */
  offlineReady: boolean;
  applying: boolean;
  apply: () => Promise<void>;
  dismissOfflineReady: () => void;
};

let updateServiceWorker: ((reload?: boolean) => Promise<void>) | null = null;

export const useAppUpdateStore = create<AppUpdateState>()((set) => ({
  needRefresh: false,
  offlineReady: false,
  applying: false,
  apply: async () => {
    if (!updateServiceWorker) return;
    set({ applying: true });
    try {
      // Active la version en attente ; la page se recharge quand le nouveau worker prend la main.
      await updateServiceWorker(true);
    } catch {
      set({ applying: false });
    }
  },
  dismissOfflineReady: () => set({ offlineReady: false }),
}));

export function bindServiceWorkerUpdater(fn: (reload?: boolean) => Promise<void>): void {
  updateServiceWorker = fn;
}

export function reportNeedRefresh(): void {
  useAppUpdateStore.setState({ needRefresh: true });
}

export function reportOfflineReady(): void {
  useAppUpdateStore.setState({ offlineReady: true });
  window.setTimeout(() => useAppUpdateStore.setState({ offlineReady: false }), 6000);
}
