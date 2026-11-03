import { useEffect } from "react";
import { MapPinned } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/hooks/use-online";
import { usePoiStore } from "@/store/poi-store";
import { useTripStore } from "@/store/trip-store";

/**
 * État du couloir de points d'intérêt d'un itinéraire figé (lot 5) : avancement pendant la mise en cache,
 * nombre de points gardés pour le hors ligne, bouton pour compléter ou refaire après un échec ou un changement.
 */
export function PoiCorridorStatus() {
  const config = useTripStore((s) => s.config);
  const days = useTripStore((s) => s.days);
  const legs = useTripStore((s) => s.legs);
  const { pois, upToDate, running, done, total, outcome, load, fill } = usePoiStore();
  const online = useOnline();
  const tripId = config?.id ?? null;

  useEffect(() => {
    if (tripId) void load(tripId, legs, days.length);
  }, [tripId, legs, days.length, load]);

  if (!tripId || total === 0) return null;

  let text: string;
  if (running) text = `Mise en cache des points d’intérêt du tracé : ${done} sur ${total} zones…`;
  else if (upToDate) text = `${pois.length} points d’intérêt OSM gardés le long du tracé pour le hors ligne (campings, aires, vidanges, eau).`;
  else if (outcome && outcome.status !== "ok") {
    const reason = outcome.status === "offline" ? "Hors ligne." : outcome.message;
    text = `Points d’intérêt du tracé : ${done} sur ${total} zones en cache. ${reason}`;
  } else if (done > 0) text = `Points d’intérêt du tracé : ${done} sur ${total} zones en cache.`;
  else text = "Points d’intérêt du tracé pas encore en cache pour le hors ligne.";

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {text}
      </p>
      {!running && !upToDate && (
        <Button variant="outline" size="sm" className="w-fit" disabled={!online} onClick={() => void fill(tripId, legs, days.length)}>
          <MapPinned className="size-3.5" />
          {done > 0 ? "Compléter le cache" : "Mettre en cache"}
        </Button>
      )}
    </div>
  );
}
