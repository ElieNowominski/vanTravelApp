import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";
import { buildCatalog, findCatalogPlace, placeToInput } from "@/lib/catalog";
import { DEFAULT_VEHICLE, START_STOP_ID, STORAGE_KEY } from "@/lib/constants";
import { eachDateInclusive, formatDayLabel } from "@/lib/format";
import { newId } from "@/lib/geo";
import { normalizeStops } from "@/lib/stop-activities";
import { configFromSnapshot, isTripConfig, tripDates } from "@/lib/trip-config";
import { normalizeMarks } from "@/lib/trip-marks";
import type {
  LayersState,
  Leg,
  PlaceInput,
  RouteOption,
  SavedTrip,
  Stop,
  TripConfig,
  TripDay,
  TripMark,
  TripMarkKind,
  TripSnapshot,
  Vehicle,
} from "@/lib/types";
import { routeBetween } from "@/services/routing";

export type TripState = {
  /** Le voyage courant (dates, départ, véhicule, hébergements). `null` : rien de chargé. */
  config: TripConfig | null;
  days: TripDay[];
  stops: Record<string, Stop>;
  legs: Leg[];
  currentDayIndex: number;
  customPins: PlaceInput[];
  layers: LayersState;
  pinMode: boolean;
  routingStatus: "idle" | "loading" | "error";
  routingMessage: string | null;
  pendingLegId: string | null;
  activeSavedId: string | null;
  activeSavedName: string | null;
  marks: TripMark[];
  setTripConfig: (config: TripConfig, options?: { reset?: boolean }) => void;
  addPlace: (place: PlaceInput) => Promise<void>;
  removeStop: (stopId: string) => Promise<void>;
  markOvernight: (stopId: string) => void;
  unlockDay: (dayIndex: number) => void;
  setCurrentDay: (index: number) => void;
  selectAlternative: (legId: string, index: number) => void;
  dismissAlternatives: () => void;
  addCustomPin: (pin: PlaceInput, addToItinerary: boolean) => Promise<void>;
  removeCustomPin: (placeId: string) => void;
  setLayer: (key: keyof LayersState, value: boolean) => void;
  setPinMode: (value: boolean) => void;
  resetTrip: () => void;
  loadCatalogPlan: () => Promise<void>;
  loadSavedTrip: (trip: SavedTrip) => void;
  setActiveSaved: (id: string | null, name: string | null) => void;
  addMark: (kind: TripMarkKind, text: string) => void;
  removeMark: (id: string) => void;
  setMarks: (marks: TripMark[]) => void;
  addStopActivity: (stopId: string, text: string) => void;
  removeStopActivity: (stopId: string, activityId: string) => void;
};

function emptyDays(config: TripConfig | null): TripDay[] {
  if (!config) return [];
  return tripDates(config).map((date) => {
    const { weekday, label } = formatDayLabel(date);
    return {
      date,
      weekday,
      label,
      locked: false,
      overnightStopId: null,
      stopIds: [],
    };
  });
}

function seedStart(config: TripConfig | null): { days: TripDay[]; stops: Record<string, Stop> } {
  const days = emptyDays(config);
  if (!config || days.length === 0) return { days, stops: {} };
  const place = findCatalogPlace(buildCatalog(config), config.start.placeId);
  if (!place) return { days, stops: {} };
  const stop: Stop = {
    ...placeToInput(place),
    id: START_STOP_ID,
    isOvernight: false,
    notes: config.start.notes ?? place.notes,
    activities: [],
  };
  days[0].stopIds = [stop.id];
  return { days, stops: { [stop.id]: stop } };
}

const initialLayers: LayersState = {
  towns: true,
  pois: true,
  camps: true,
  osmCamps: true,
  freedom: false,
  custom: true,
};

function initialTrip(config: TripConfig | null) {
  const seeded = seedStart(config);
  return {
    config,
    ...seeded,
    legs: [] as Leg[],
    currentDayIndex: 0,
    customPins: [] as PlaceInput[],
    layers: initialLayers,
    pinMode: false,
    routingStatus: "idle" as const,
    routingMessage: null as string | null,
    pendingLegId: null as string | null,
    activeSavedId: null as string | null,
    activeSavedName: null as string | null,
    marks: [] as TripMark[],
  };
}

function lastStopOfDay(state: { days: TripDay[]; stops: Record<string, Stop> }, dayIndex: number): Stop | null {
  const ids = state.days[dayIndex]?.stopIds ?? [];
  const lastId = ids[ids.length - 1];
  return lastId ? state.stops[lastId] ?? null : null;
}

function departureForDay(
  state: { days: TripDay[]; stops: Record<string, Stop> },
  dayIndex: number,
): Stop | null {
  const existing = lastStopOfDay(state, dayIndex);
  if (existing) return existing;
  for (let i = dayIndex - 1; i >= 0; i--) {
    const overnightId = state.days[i].overnightStopId;
    if (overnightId && state.stops[overnightId]) return state.stops[overnightId];
    const last = lastStopOfDay(state, i);
    if (last) return last;
  }
  return null;
}

function samePoint(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  return Math.abs(a.lng - b.lng) < 0.0004 && Math.abs(a.lat - b.lat) < 0.0004;
}

/** Même calendrier (mêmes dates) : on peut changer de voyage sans perdre les étapes. */
function sameCalendar(days: TripDay[], config: TripConfig): boolean {
  const dates = eachDateInclusive(config.start.date, config.end.date);
  return days.length === dates.length && days.every((day, i) => day.date === dates[i]);
}

async function buildLeg(from: Stop, to: Stop, dayIndex: number, vehicle: Vehicle): Promise<Leg> {
  const result = await routeBetween(from, to, vehicle);
  return {
    id: newId("leg"),
    fromStopId: from.id,
    toStopId: to.id,
    dayIndex,
    options: result.options,
    selectedIndex: 0,
    estimated: result.estimated,
  };
}

export const useTripStore = create<TripState>()(
  persist(
    (set, get) => ({
      ...initialTrip(null),

      setTripConfig: (config, options = {}) => {
        set((prev) => {
          const keep = !options.reset && prev.days.length > 0 && sameCalendar(prev.days, config);
          if (keep) return { config };
          return { ...initialTrip(config), layers: prev.layers, marks: prev.marks };
        });
      },

      addPlace: async (place) => {
        const state = get();
        if (state.days.length === 0) return;
        let dayIndex = state.currentDayIndex;
        if (state.days[dayIndex]?.locked) {
          const nextOpen = state.days.findIndex((d, i) => i > dayIndex && !d.locked);
          dayIndex = nextOpen >= 0 ? nextOpen : dayIndex;
        }
        const from = departureForDay(state, dayIndex);
        const sameAsDeparture = from ? samePoint(from, place) : false;

        const stop: Stop = {
          ...place,
          id: newId("stop"),
          isOvernight: false,
          activities: [],
        };

        set((prev) => {
          const days = prev.days.map((d, i) =>
            i === dayIndex ? { ...d, stopIds: [...d.stopIds, stop.id], locked: false } : d,
          );
          return {
            days,
            stops: { ...prev.stops, [stop.id]: stop },
            currentDayIndex: dayIndex,
            routingStatus: from && !sameAsDeparture ? "loading" : "idle",
            routingMessage:
              from && !sameAsDeparture ? `Calcul de la route vers ${stop.name}…` : null,
            pendingLegId: null,
          };
        });

        if (!from || sameAsDeparture) return;
        try {
          const leg = await buildLeg(from, stop, dayIndex, get().config?.vehicle ?? DEFAULT_VEHICLE);
          set((prev) => ({
            legs: [...prev.legs.filter((l) => l.toStopId !== stop.id), leg],
            routingStatus: "idle",
            routingMessage: leg.estimated
              ? "Route estimée (réseau routier indisponible)."
              : null,
            pendingLegId: leg.options.length > 1 ? leg.id : null,
          }));
        } catch {
          set({
            routingStatus: "error",
            routingMessage: "Le calcul d’itinéraire a échoué. L’étape est quand même ajoutée.",
          });
        }
      },

      removeStop: async (stopId) => {
        const state = get();
        if (stopId === START_STOP_ID && state.days[0]?.stopIds[0] === stopId) {
          return;
        }
        const dayIndex = state.days.findIndex((d) => d.stopIds.includes(stopId));
        if (dayIndex < 0) return;

        const day = state.days[dayIndex];
        const idx = day.stopIds.indexOf(stopId);
        const prevId = idx > 0 ? day.stopIds[idx - 1] : null;
        const nextId = day.stopIds[idx + 1] ?? null;

        set((prev) => {
          const stops = { ...prev.stops };
          delete stops[stopId];
          const days = prev.days.map((d, i) => {
            if (i !== dayIndex) return d;
            return {
              ...d,
              stopIds: d.stopIds.filter((id) => id !== stopId),
              overnightStopId: d.overnightStopId === stopId ? null : d.overnightStopId,
              locked: d.overnightStopId === stopId ? false : d.locked,
            };
          });
          return {
            stops,
            days,
            legs: prev.legs.filter((l) => l.fromStopId !== stopId && l.toStopId !== stopId),
            pendingLegId:
              prev.pendingLegId &&
              prev.legs.find((l) => l.id === prev.pendingLegId)?.toStopId === stopId
                ? null
                : prev.pendingLegId,
          };
        });

        if (prevId && nextId) {
          const from = get().stops[prevId];
          const to = get().stops[nextId];
          if (from && to) {
            set({ routingStatus: "loading", routingMessage: "Recalcul du segment…" });
            try {
              const leg = await buildLeg(from, to, dayIndex, get().config?.vehicle ?? DEFAULT_VEHICLE);
              set((prev) => ({
                legs: [...prev.legs, leg],
                routingStatus: "idle",
                routingMessage: null,
              }));
            } catch {
              set({ routingStatus: "error", routingMessage: "Recalcul impossible." });
            }
          }
        }
      },

      markOvernight: (stopId) => {
        set((prev) => {
          const dayIndex = prev.days.findIndex((d) => d.stopIds.includes(stopId));
          if (dayIndex < 0) return prev;
          const days = prev.days.map((d, i) => {
            if (i !== dayIndex) return d;
            return { ...d, locked: true, overnightStopId: stopId };
          });
          const stops = {
            ...prev.stops,
            [stopId]: { ...prev.stops[stopId], isOvernight: true },
          };
          const nextIndex = Math.min(dayIndex + 1, days.length - 1);
          return {
            days,
            stops,
            currentDayIndex: nextIndex,
            pendingLegId: null,
          };
        });
      },

      unlockDay: (dayIndex) => {
        set((prev) => {
          const overnightId = prev.days[dayIndex]?.overnightStopId;
          const stops = { ...prev.stops };
          if (overnightId && stops[overnightId]) {
            stops[overnightId] = { ...stops[overnightId], isOvernight: false };
          }
          return {
            stops,
            days: prev.days.map((d, i) =>
              i === dayIndex ? { ...d, locked: false, overnightStopId: null } : d,
            ),
            currentDayIndex: dayIndex,
          };
        });
      },

      setCurrentDay: (index) => set({ currentDayIndex: index }),

      selectAlternative: (legId, index) => {
        set((prev) => ({
          legs: prev.legs.map((l) => (l.id === legId ? { ...l, selectedIndex: index } : l)),
        }));
      },

      dismissAlternatives: () => set({ pendingLegId: null }),

      addCustomPin: async (pin, addToItinerary) => {
        set((prev) => ({
          customPins: [...prev.customPins.filter((p) => p.placeId !== pin.placeId), pin],
          pinMode: false,
        }));
        if (addToItinerary) {
          await get().addPlace(pin);
        }
      },

      removeCustomPin: (placeId) => {
        set((prev) => ({
          customPins: prev.customPins.filter((p) => p.placeId !== placeId),
        }));
      },

      setLayer: (key, value) =>
        set((prev) => ({ layers: { ...prev.layers, [key]: value } })),

      setPinMode: (value) => set({ pinMode: value }),

      resetTrip: () => set((prev) => ({ ...initialTrip(prev.config), layers: prev.layers })),

      loadCatalogPlan: async () => {
        const config = get().config;
        if (!config) return;
        const catalog = buildCatalog(config);
        const marks = get().marks;
        const layers = get().layers;
        get().resetTrip();
        set({
          marks,
          layers,
          routingStatus: "loading",
          routingMessage: "Chargement du plan…",
        });
        try {
          for (const [dayIndex, dayPlan] of config.plan.days.entries()) {
            if (dayIndex >= get().days.length) break;
            get().setCurrentDay(dayIndex);
            for (const step of dayPlan.stops) {
              const place = findCatalogPlace(catalog, step.placeId);
              if (!place) continue;
              const existing = lastStopOfDay(get(), dayIndex);
              const alreadyThere =
                existing && existing.placeId === place.id && samePoint(existing, place);
              let stopId = existing?.id ?? null;
              if (!alreadyThere) {
                await get().addPlace({
                  ...placeToInput(place),
                  notes: step.notes ?? place.notes,
                });
                stopId = lastStopOfDay(get(), dayIndex)?.id ?? null;
              } else if (existing) {
                set((prev) => ({
                  stops: {
                    ...prev.stops,
                    [existing.id]: {
                      ...existing,
                      area: place.area ?? existing.area,
                      notes: step.notes ?? existing.notes,
                    },
                  },
                }));
              }
              if (!stopId) continue;
              for (const text of step.activities ?? []) {
                get().addStopActivity(stopId, text);
              }
              if (step.overnight) get().markOvernight(stopId);
            }
          }
          get().setCurrentDay(0);
          get().setActiveSaved(null, config.name);
          set({ routingStatus: "idle", routingMessage: null, pendingLegId: null });
        } catch {
          set({
            routingStatus: "error",
            routingMessage: "Le plan est chargé en partie : un calcul de route a échoué.",
          });
        }
      },

      loadSavedTrip: (trip) => {
        set((prev) => ({
          config: isTripConfig(trip.config)
            ? trip.config
            : configFromSnapshot(trip, { name: trip.name }) ?? prev.config,
          days: structuredClone(trip.days),
          stops: normalizeStops(structuredClone(trip.stops)),
          legs: structuredClone(trip.legs),
          customPins: structuredClone(trip.customPins ?? []),
          currentDayIndex: trip.currentDayIndex,
          activeSavedId: trip.id,
          activeSavedName: trip.name,
          marks: normalizeMarks(trip.marks),
          pinMode: false,
          pendingLegId: null,
          routingStatus: "idle",
          routingMessage: null,
        }));
      },

      setActiveSaved: (id, name) => set({ activeSavedId: id, activeSavedName: name }),

      addMark: (kind, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        set((prev) => ({
          marks: [...prev.marks, { id: newId("mark"), kind, text: trimmed }],
        }));
      },

      removeMark: (id) => {
        set((prev) => ({ marks: prev.marks.filter((mark) => mark.id !== id) }));
      },

      setMarks: (marks) => set({ marks: normalizeMarks(marks) }),

      addStopActivity: (stopId, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        set((prev) => {
          const stop = prev.stops[stopId];
          if (!stop) return prev;
          return {
            stops: {
              ...prev.stops,
              [stopId]: {
                ...stop,
                activities: [...(stop.activities ?? []), { id: newId("act"), text: trimmed }],
              },
            },
          };
        });
      },

      removeStopActivity: (stopId, activityId) => {
        set((prev) => {
          const stop = prev.stops[stopId];
          if (!stop) return prev;
          return {
            stops: {
              ...prev.stops,
              [stopId]: {
                ...stop,
                activities: (stop.activities ?? []).filter((activity) => activity.id !== activityId),
              },
            },
          };
        });
      },
    }),
    {
      name: STORAGE_KEY,
      // IndexedDB : un circuit avec ses tracés dépasse le quota localStorage.
      storage: createJSONStorage(() => idbStorage),
      skipHydration: true,
      partialize: (state) => ({
        config: state.config,
        days: state.days,
        stops: state.stops,
        legs: state.legs,
        currentDayIndex: state.currentDayIndex,
        customPins: state.customPins,
        layers: state.layers,
        activeSavedId: state.activeSavedId,
        activeSavedName: state.activeSavedName,
        marks: state.marks,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<TripState>;
        return {
          ...current,
          ...p,
          config: isTripConfig(p.config) ? p.config : null,
          layers: { ...initialLayers, ...(p.layers ?? {}) },
          marks: normalizeMarks(p.marks),
          stops: normalizeStops(p.stops ?? current.stops),
          days: Array.isArray(p.days) ? p.days : [],
          legs: Array.isArray(p.legs) ? p.legs : [],
          customPins: Array.isArray(p.customPins) ? p.customPins : [],
        };
      },
    },
  ),
);

export function selectedOption(leg: Leg): RouteOption | null {
  return leg.options[leg.selectedIndex] ?? leg.options[0] ?? null;
}

export function currentSnapshot(state: {
  days: TripDay[];
  stops: Record<string, Stop>;
  legs: Leg[];
  customPins: PlaceInput[];
  currentDayIndex: number;
}): TripSnapshot {
  return {
    days: state.days,
    stops: state.stops,
    legs: state.legs,
    customPins: state.customPins,
    currentDayIndex: state.currentDayIndex,
  };
}

export function dayStats(state: { days: TripDay[]; stops: Record<string, Stop>; legs: Leg[] }, dayIndex: number) {
  const day = state.days[dayIndex];
  const dayLegs = state.legs.filter((l) => l.dayIndex === dayIndex);
  const driveSec = dayLegs.reduce((sum, l) => sum + (selectedOption(l)?.durationVanSec ?? 0), 0);
  const km = dayLegs.reduce((sum, l) => sum + (selectedOption(l)?.distanceKm ?? 0), 0);
  const overnight = day?.overnightStopId ? state.stops[day.overnightStopId] : null;
  return { driveSec, km, overnight, stopCount: day?.stopIds.length ?? 0 };
}
