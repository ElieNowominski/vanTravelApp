import { useEffect, useState } from "react";
import { syncNow } from "@/services/sync";
import { loadDevTrip } from "@/services/trip-source";
import { ensureSyncHydrated, isSyncConfigured, useSyncStore } from "@/store/sync-store";
import { useTripStore } from "@/store/trip-store";

/**
 * Réhydrate le brouillon (IndexedDB) puis, sans voyage chargé : synchro depuis le dépôt privé si elle
 * est configurée, sinon en dev le voyage servi sous /__private/. Partagé par l'écran principal et le roadbook.
 */
export function useTripBoot(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      await Promise.all([Promise.resolve(useTripStore.persist.rehydrate()), ensureSyncHydrated()]);
      if (!useTripStore.getState().config) {
        if (isSyncConfigured(useSyncStore.getState().settings)) {
          // Nouvel appareil déjà configuré : le voyage et l'itinéraire viennent du dépôt.
          await syncNow("démarrage");
        }
      }
      if (!useTripStore.getState().config) {
        const dev = await loadDevTrip();
        if (dev && !cancelled) {
          useTripStore.getState().setTripConfig(dev);
          // Premier lancement sur cet appareil : on pose le plan du voyage (routes recalculées).
          if (dev.plan.days.length > 0 && useTripStore.getState().legs.length === 0) {
            void useTripStore.getState().loadCatalogPlan();
          }
        }
      }
    };
    void boot().finally(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
