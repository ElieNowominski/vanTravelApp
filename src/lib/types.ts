export type PlaceKind = "town" | "poi" | "camp" | "freedom" | "custom";

export type CatalogPlace = {
  id: string;
  name: string;
  lng: number;
  lat: number;
  region: string;
  area?: string;
  category?: string;
  notes?: string;
  warning?: string;
};

export type PlaceInput = {
  placeId: string;
  name: string;
  lng: number;
  lat: number;
  kind: PlaceKind;
  area?: string;
  notes?: string;
  warning?: string;
  meta?: Record<string, string | number | boolean | null>;
};

export type StopActivity = {
  id: string;
  text: string;
};

export type Stop = PlaceInput & {
  id: string;
  isOvernight: boolean;
  activities: StopActivity[];
};

export type RouteOption = {
  geometry: GeoJSON.LineString;
  distanceKm: number;
  durationCarSec: number;
  durationVanSec: number;
  winding: boolean;
  label: string;
};

export type Leg = {
  id: string;
  fromStopId: string;
  toStopId: string;
  dayIndex: number;
  options: RouteOption[];
  selectedIndex: number;
  estimated: boolean;
};

export type TripDay = {
  date: string;
  label: string;
  weekday: string;
  locked: boolean;
  overnightStopId: string | null;
  stopIds: string[];
};

export type LayerKey = "towns" | "pois" | "camps" | "osmCamps" | "freedom" | "custom";

export type LayersState = Record<LayerKey, boolean>;

export type CustomPinDraft = {
  name: string;
  category: string;
  notes: string;
  lng: number;
  lat: number;
  addToItinerary: boolean;
};

export type TripSnapshot = {
  days: TripDay[];
  stops: Record<string, Stop>;
  legs: Leg[];
  customPins: PlaceInput[];
  currentDayIndex: number;
};

export type TripMarkKind = "plus" | "minus";

export type TripMark = {
  id: string;
  kind: TripMarkKind;
  text: string;
};

export type SavedTrip = TripSnapshot & {
  id: string;
  name: string;
  savedAt: string;
  km: number;
  nights: number;
  marks: TripMark[];
  /** Voyage associé ; absent sur les anciens circuits, dérivé alors du snapshot. */
  config?: TripConfig | null;
};

/** Préréglage géographique public (cadre carte, fuseau). */
export type RegionPreset = {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
  bbox: { xmin: number; ymin: number; xmax: number; ymax: number };
  maxBounds: [[number, number], [number, number]];
  timeZone: string;
};

export type RestrictedRoad = { id: string; name: string; note: string };

export type Vehicle = {
  name: string;
  selfContained: boolean;
  lengthM?: number;
  widthM?: number;
  heightM?: number;
  /** Multiplicateur appliqué au temps voiture. */
  timeFactor: number;
  /** Multiplicateur supplémentaire sur routes lentes. */
  windingFactor: number;
  maxComfortableDriveHours: number;
  notes?: string;
  restrictedRoads?: RestrictedRoad[];
};

export type TripMilestone = {
  placeId: string;
  date: string;
  label?: string;
  notes?: string;
};

export type PlanStop = {
  placeId: string;
  overnight?: boolean;
  notes?: string;
  activities?: string[];
};

export type TripPlan = {
  days: Array<{ date: string; stops: PlanStop[] }>;
};

/**
 * Un voyage : tout ce qui est propre à un séjour donné.
 * Données personnelles : vit dans le dépôt privé, jamais dans le bundle.
 */
export type TripConfig = {
  id: string;
  schemaVersion: 1;
  name: string;
  regionId: string;
  start: TripMilestone;
  end: TripMilestone;
  arrival?: TripMilestone;
  vehicle: Vehicle;
  /** Hébergements réservés (pins teal), fusionnés au catalogue public. */
  stays: CatalogPlace[];
  /** Ordre des étapes et nuits, rechargeable via le bouton « Plan ». */
  plan: TripPlan;
};
