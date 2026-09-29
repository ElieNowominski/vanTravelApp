import { useEffect, useState } from "react";
import { List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ItineraryPanel } from "@/components/itinerary-panel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TripMap } from "@/components/trip-map";
import { TripSetupScreen } from "@/components/trip-setup-screen";
import { loadDevTrip } from "@/services/trip-source";
import { useTripStore } from "@/store/trip-store";

export function TripApp() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const config = useTripStore((s) => s.config);

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
      <div className="flex h-dvh min-h-0 flex-col md:flex-row">
        <div className="relative min-h-0 flex-1">
          <TripMap />
          <Button
            className="absolute right-3 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-20 shadow-lg md:hidden"
            onClick={() => setSheetOpen(true)}
          >
            <List className="size-4" />
            Itinéraire
          </Button>
        </div>
        <aside className="hidden h-full w-[min(100%,26rem)] shrink-0 border-l md:block">
          <ItineraryPanel />
        </aside>
        {sheetOpen ? (
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="bottom" className="h-[80vh] p-0 sm:max-w-none" showCloseButton>
              <ItineraryPanel />
            </SheetContent>
          </Sheet>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
