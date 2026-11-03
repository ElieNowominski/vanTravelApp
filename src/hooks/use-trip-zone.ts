import { useMemo } from "react";
import { useZoneLookup } from "@/hooks/use-zone-lookup";
import { computeZone, currentTravelDate, tripPoints, zoneLabel, type TripZone, type ZoneLookup } from "@/lib/zone";
import { useTripStore } from "@/store/trip-store";

/**
 * Zone du voyage courant (ADR 0003) et date du jour en voyage, dans le fuseau de l'étape du jour.
 * Avant le chargement des fuseaux (quelques millisecondes), le fuseau de l'appareil sert de repli.
 */
export function useTripZone(): { zone: TripZone; label: string; today: string; lookup: ZoneLookup | null } {
  const config = useTripStore((s) => s.config);
  const days = useTripStore((s) => s.days);
  const stops = useTripStore((s) => s.stops);
  const lookup = useZoneLookup();
  const zone = useMemo(() => computeZone(tripPoints(config, { days, stops }), lookup), [config, days, stops, lookup]);
  const label = useMemo(() => zoneLabel(zone.countries), [zone]);
  // Recalculée à chaque rendu : l'app peut rester ouverte au passage de minuit.
  const today = currentTravelDate({ days, stops }, config, lookup);
  return { zone, label, today, lookup };
}
