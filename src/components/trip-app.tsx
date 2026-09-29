import { useCallback, useEffect, useState, type ReactNode } from "react";
import { List, Map as MapIcon } from "lucide-react";
import { ItineraryPanel } from "@/components/itinerary-panel";
import { NetworkBanner } from "@/components/network-banner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TripMap } from "@/components/trip-map";
import { TripSetupScreen } from "@/components/trip-setup-screen";
import { cn } from "@/lib/utils";
import { loadDevTrip } from "@/services/trip-source";
import { useTripStore } from "@/store/trip-store";

type MobileView = "map" | "list";

function viewFromHistory(): MobileView {
  const state = window.history.state as { view?: MobileView } | null;
  return state?.view === "list" ? "list" : "map";
}

export function TripApp() {
  const [ready, setReady] = useState(false);
  const config = useTripStore((s) => s.config);

  /**
   * Mobile : deux onglets (carte, itinéraire) plutôt qu'un tiroir modal.
   * L'onglet itinéraire pousse une entrée d'historique : le geste « retour » du téléphone ramène à la carte.
   */
  const [view, setView] = useState<MobileView>(() => viewFromHistory());

  useEffect(() => {
    const onPop = () => setView(viewFromHistory());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const showList = useCallback(() => {
    if (viewFromHistory() !== "list") window.history.pushState({ view: "list" }, "");
    setView("list");
  }, []);

  const showMap = useCallback(() => {
    if (viewFromHistory() === "list") {
      window.history.back();
      return;
    }
    setView("map");
  }, []);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      await Promise.resolve(useTripStore.persist.rehydrate());
      if (!useTripStore.getState().config) {
        // Dev : le dépôt privé fournit le voyage. Prod : l'écran de démarrage prend le relais.
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

  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
        Chargement du circuit…
      </div>
    );
  }

  if (!config) {
    return <TripSetupScreen />;
  }

  return (
    <TooltipProvider>
      <div className="flex h-dvh min-h-0 flex-col pt-[env(safe-area-inset-top,0px)]">
        <NetworkBanner />
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className={cn("relative min-h-0 flex-1", view === "map" ? "block" : "hidden md:block")}>
          <TripMap />
        </div>
        <aside
          className={cn(
            "min-h-0 flex-1 md:h-full md:w-[min(100%,26rem)] md:flex-none md:border-l",
            view === "list" ? "block" : "hidden md:block",
          )}
        >
          <ItineraryPanel />
        </aside>
        <nav
          aria-label="Vue"
          className="flex shrink-0 border-t bg-background pb-[env(safe-area-inset-bottom,0px)] md:hidden"
        >
          <MobileTab active={view === "map"} onClick={showMap} label="Carte" icon={<MapIcon className="size-5" />} />
          <MobileTab
            active={view === "list"}
            onClick={showList}
            label="Itinéraire"
            icon={<List className="size-5" />}
          />
        </nav>
        </div>
      </div>
    </TooltipProvider>
  );
}

function MobileTab({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
