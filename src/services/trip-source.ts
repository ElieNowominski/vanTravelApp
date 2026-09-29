import { validateTripConfig } from "@/lib/trip-config";
import type { TripConfig } from "@/lib/types";

type TripIndex = { trips: Array<{ id: string; name: string }> };

/**
 * En développement, Vite sert le dépôt privé sous /__private/ (vite.config.ts).
 * En production, rien : le voyage vient d'une sauvegarde importée ou, plus tard, de la synchro GitHub.
 */
export async function loadDevTrip(preferredId?: string | null): Promise<TripConfig | null> {
  if (!import.meta.env.DEV) return null;
  try {
    const indexRes = await fetch("/__private/trips/index.json", { cache: "no-store" });
    if (!indexRes.ok) return null;
    const index = (await indexRes.json()) as TripIndex;
    const entry = index.trips.find((t) => t.id === preferredId) ?? index.trips[0];
    if (!entry) return null;
    const tripRes = await fetch(`/__private/trips/${encodeURIComponent(entry.id)}/trip.json`, {
      cache: "no-store",
    });
    if (!tripRes.ok) return null;
    return validateTripConfig(await tripRes.json());
  } catch (error) {
    console.warn("Dépôt privé indisponible en dev :", error);
    return null;
  }
}
