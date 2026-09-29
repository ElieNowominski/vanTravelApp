
import { Button } from "@/components/ui/button";
import { formatDuration, formatKm } from "@/lib/format";
import { useTripStore } from "@/store/trip-store";

export function AlternativesCard() {
  const pendingLegId = useTripStore((s) => s.pendingLegId);
  const legs = useTripStore((s) => s.legs);
  const stops = useTripStore((s) => s.stops);
  const selectAlternative = useTripStore((s) => s.selectAlternative);
  const dismissAlternatives = useTripStore((s) => s.dismissAlternatives);

  const leg = legs.find((l) => l.id === pendingLegId);
  if (!leg || leg.options.length < 2) return null;
  const to = stops[leg.toStopId];

  return (
    <div className="absolute bottom-4 left-3 z-10 w-[min(100%-1.5rem,22rem)] rounded-xl bg-background/95 p-3 shadow-lg ring-1 ring-foreground/10 backdrop-blur">
      <p className="mb-2 text-sm font-medium">
        Routes vers {to?.name ?? "l’étape"}
      </p>
      <div className="flex flex-col gap-1.5">
        {leg.options.map((option, index) => {
          const active = index === leg.selectedIndex;
          return (
            <button
              key={`${leg.id}-${index}`}
              type="button"
              onClick={() => selectAlternative(leg.id, index)}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                active ? "border-primary bg-primary/8" : "border-border hover:bg-muted"
              }`}
            >
              <span>
                {option.label}
                {option.winding ? " · lente" : ""}
              </span>
              <span className="text-muted-foreground">
                {formatDuration(option.durationVanSec)} · {formatKm(option.distanceKm)}
              </span>
            </button>
          );
        })}
      </div>
      <Button className="mt-2 w-full" size="sm" onClick={dismissAlternatives}>
        Garder cette route
      </Button>
    </div>
  );
}
