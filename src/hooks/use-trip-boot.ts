import { useEffect, useState } from "react";
import { listMemberTrips } from "@/services/supabase-sync";
import { syncNow } from "@/services/sync";
import { ensureAccountHydrated, isSyncConfigured, useAccountStore } from "@/store/account-store";
import { useTripStore } from "@/store/trip-store";

/**
 * Réhydrate le brouillon (IndexedDB) puis, sans voyage chargé et avec un compte : prend le voyage
 * mémorisé (ou le premier du compte) et le synchronise. Partagé par l'écran principal et le roadbook.
 * Sans compte, l'écran de démarrage prend la main.
 */
export function useTripBoot(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      await Promise.all([Promise.resolve(useTripStore.persist.rehydrate()), ensureAccountHydrated()]);
      if (useTripStore.getState().config) return;
      const account = useAccountStore.getState();
      if (!account.user) return;
      if (!account.settings.tripId && (typeof navigator === "undefined" || navigator.onLine)) {
        try {
          const trips = await listMemberTrips();
          if (trips[0] && !cancelled) account.setSettings({ tripId: trips[0].id });
        } catch {
          /* hors ligne ou session expirée : l'écran de démarrage le dira */
        }
      }
      // Nouvel appareil déjà connecté : le voyage et l'itinéraire viennent du compte.
      if (isSyncConfigured(useAccountStore.getState())) await syncNow("démarrage");
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
