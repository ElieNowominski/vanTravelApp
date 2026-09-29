import { useEffect, useState } from "react";
import { loadDevTrip } from "@/services/trip-source";
import { useTripStore } from "@/store/trip-store";

/**
 * Réhydrate le brouillon (IndexedDB) puis, en dev seulement, charge le voyage du dépôt privé
 * si rien n'est encore chargé. Partagé par l'écran principal et le roadbook.
 */
export function useTripBoot(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      await Promise.resolve(useTripStore.persist.rehydrate());
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
