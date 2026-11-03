import { useEffect, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { POI_CATEGORY_LABELS, dayTrackLine, poisAlongLine, routeCaption, simplifyLine, type PoiCategory } from "@/lib/poi";
import { directionsLinks } from "@/lib/voyager";
import { usePoiStore } from "@/store/poi-store";
import { useTripStore } from "@/store/trip-store";

const DOT: Record<PoiCategory, string> = {
  camping: "bg-green-700",
  aire: "bg-amber-700",
  vidange: "bg-slate-600",
  eau: "bg-sky-600",
};

/**
 * « Sur la route » : campings, aires, vidanges et points d'eau le long du tracé du jour, deux par catégorie,
 * dans l'ordre de la route. Lu dans le couloir mis en cache au figeage (lot 5) : marche hors ligne.
 */
export function RoutePois({ dayIndex }: { dayIndex: number }) {
  const tripId = useTripStore((s) => s.config?.id ?? null);
  const legs = useTripStore((s) => s.legs);
  const dayCount = useTripStore((s) => s.days.length);
  const pois = usePoiStore((s) => (s.tripId === tripId ? s.pois : []));
  const load = usePoiStore((s) => s.load);

  useEffect(() => {
    if (tripId) void load(tripId, legs, dayCount);
  }, [tripId, legs, dayCount, load]);

  const line = useMemo(() => simplifyLine(dayTrackLine(legs, dayIndex), 0.2), [legs, dayIndex]);
  const items = useMemo(() => poisAlongLine(pois, line, undefined, 2), [pois, line]);
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <p className="text-xs font-medium text-muted-foreground">Sur la route</p>
      <ul className="mt-1 flex flex-col">
        {items.map(({ poi, offKm, alongKm }) => (
          <li key={poi.id}>
            <a
              href={directionsLinks(poi.lat, poi.lng, navigator.userAgent)[0]?.href}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center gap-2.5 py-1"
            >
              <span className={`size-2.5 shrink-0 rounded-full ${DOT[poi.category]}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{poi.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {poi.name !== POI_CATEGORY_LABELS[poi.category] ? `${POI_CATEGORY_LABELS[poi.category]} · ` : ""}
                  {routeCaption({ offKm, alongKm })}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-muted-foreground">© contributeurs OpenStreetMap</p>
    </section>
  );
}
