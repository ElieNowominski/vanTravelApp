import { create } from "zustand";
import type { Poi } from "@/lib/poi";
import type { Leg } from "@/lib/types";
import { cacheCorridor, readCorridor, type PoiOutcome } from "@/services/overpass";

/**
 * Couloir de points d'intérêt du voyage affiché (lot 5) : lu depuis IndexedDB pour Voyager, rempli au
 * figeage. Vit hors du brouillon : rien n'est synchronisé, chaque appareil met son couloir en cache.
 */
type PoiState = {
  tripId: string | null;
  pois: Poi[];
  upToDate: boolean;
  running: boolean;
  done: number;
  total: number;
  outcome: PoiOutcome | null;
  /** Relit le cache du voyage (au montage de Voyager, au changement de voyage). */
  load: (tripId: string, legs: Leg[], dayCount: number) => Promise<void>;
  /** Interroge Overpass pour les groupes manquants ; sans effet si une mise en cache tourne déjà. */
  fill: (tripId: string, legs: Leg[], dayCount: number) => Promise<void>;
};

export const usePoiStore = create<PoiState>()((set, get) => ({
  tripId: null,
  pois: [],
  upToDate: false,
  running: false,
  done: 0,
  total: 0,
  outcome: null,
  load: async (tripId, legs, dayCount) => {
    if (get().running && get().tripId === tripId) return;
    const { corridor, upToDate, total } = await readCorridor(tripId, legs, dayCount);
    set({
      tripId,
      pois: corridor?.pois ?? [],
      upToDate,
      total,
      done: upToDate ? total : (corridor?.groups.length ?? 0),
      outcome: get().tripId === tripId ? get().outcome : null,
    });
  },
  fill: async (tripId, legs, dayCount) => {
    if (get().running) return;
    set({ tripId, running: true, outcome: null });
    try {
      const result = await cacheCorridor(tripId, legs, dayCount, ({ done, total }) => set({ done, total }));
      if (get().tripId !== tripId) return;
      set({ pois: result.pois, upToDate: result.upToDate, done: result.done, total: result.total, outcome: result });
    } catch (error) {
      set({ outcome: { status: "error", message: error instanceof Error ? error.message : "Mise en cache interrompue." } });
    } finally {
      set({ running: false });
    }
  },
}));
