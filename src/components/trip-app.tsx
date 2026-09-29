import { useCallback, useEffect, useState, type ReactNode } from "react";
import { List, Map as MapIcon } from "lucide-react";
import { ItineraryPanel } from "@/components/itinerary-panel";
import { NetworkBanner } from "@/components/network-banner";
import { UpdateBanner } from "@/components/update-banner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TripMap } from "@/components/trip-map";
import { TripSetupScreen } from "@/components/trip-setup-screen";
import { VoyagerApp } from "@/components/voyager/voyager-app";
import { useTripBoot } from "@/hooks/use-trip-boot";
import { getRegion } from "@/lib/regions";
import { cn } from "@/lib/utils";
import { defaultMode, todayInZone } from "@/lib/voyager";
import { useTripStore } from "@/store/trip-store";

type MobileView = "map" | "list";

function viewFromHistory(): MobileView {
  const state = window.history.state as { view?: MobileView } | null;
  return state?.view === "list" ? "list" : "map";
}

export function TripApp() {
  const ready = useTripBoot();
  const config = useTripStore((s) => s.config);
  const frozenAt = useTripStore((s) => s.frozenAt);
  const uiMode = useTripStore((s) => s.uiMode);

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

  // Voyager par défaut pendant le voyage (fuseau de la région) ou dès que l'itinéraire est figé.
  const mode = uiMode ?? defaultMode(config, frozenAt, todayInZone(getRegion(config.regionId).timeZone));
  if (mode === "travel") return <VoyagerApp />;
  return <PlanApp />;
}

/** Mode Planifier : carte et panneau itinéraire (onglets sur mobile, côte à côte sur grand écran). */
function PlanApp() {
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

  return (
    <TooltipProvider>
      <div className="flex h-dvh min-h-0 flex-col pt-[env(safe-area-inset-top,0px)]">
        <UpdateBanner />
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
