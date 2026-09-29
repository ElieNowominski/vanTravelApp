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

/** Commun aux entités du mode Voyager : sert à la fusion « dernière écriture gagne » (phase 5). */
export type EntityMeta = {
  id: string;
  /** ISO 8601. */
  updatedAt: string;
  /** Prénom du profil local qui a écrit. */
  updatedBy: string;
};

export type Money = { amount: number; currency: string };

export type Booking = EntityMeta & {
  /** Nom du camping, du loueur, de la compagnie. */
  provider: string;
  reference?: string;
  /** Code d'accès, portail, boîte à clés : masqué par défaut à l'écran. */
  accessCode?: string;
  address?: string;
  phone?: string;
  url?: string;
  /** Dates ou heures libres (« 14 h », « 2027-02-08 »). */
  checkIn?: string;
  checkOut?: string;
  price?: Money;
  notes?: string;
};

export type DocumentKind = "image" | "pdf";

export type TripDocument = EntityMeta & {
  kind: DocumentKind;
  caption?: string;
  /**
   * Chemin cible dans le dépôt privé (`trips/<id>/docs/<docId>.<ext>`), rempli à la synchro (phase 5).
   * Le contenu vit localement dans IndexedDB (`src/lib/document-store.ts`), jamais dans le brouillon JSON.
   */
  path: string;
  size: number;
  mimeType: string;
};

export type ChecklistItem = EntityMeta & {
  text: string;
  done: boolean;
};

export type ExpenseCategory = "carburant" | "camping" | "courses" | "resto" | "activite" | "transport" | "autre";

export type Expense = EntityMeta & {
  /** Date calendaire AAAA-MM-JJ. */
  date: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  /** Prénom de la personne qui a payé. */
  paidBy: string;
  note?: string;
};

export type Stop = PlaceInput & {
  id: string;
  isOvernight: boolean;
  activities: StopActivity[];
  bookings: Booking[];
  documents: TripDocument[];
  checklist: ChecklistItem[];
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
  /** Notes du jour saisies en voyage. */
  notes?: string;
  /** Météo notée à la main (« grand soleil, vent l'après-midi »). */
  weather?: string;
  expenses: Expense[];
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
  /** Version de forme du snapshot (voir `src/lib/migrations.ts`) ; absente sur les anciens circuits (= 1). */
  schemaVersion?: number;
  days: TripDay[];
  stops: Record<string, Stop>;
  legs: Leg[];
  customPins: PlaceInput[];
  currentDayIndex: number;
  /** Date ISO du figeage de l'itinéraire (une géométrie par tronçon) ; `null` tant qu'on planifie. */
  frozenAt?: string | null;
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
  /** Devise locale par défaut des dépenses (code ISO 4217). */
  currency: string;
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
