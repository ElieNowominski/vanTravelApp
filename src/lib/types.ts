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
  /**
   * Code chiffré (enveloppe AES-GCM, `src/lib/secure.ts`) tel qu'il voyage dans le dépôt privé.
   * Présent sans `accessCode` quand la phrase de déchiffrement manque sur cet appareil.
   */
  accessCodeSecure?: string;
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

/** Un document d'étape concerne la nuit (camping, réservation) ou une activité (billets, plan). */
export type DocumentScope = "nuit" | "activite";

export type TripDocument = EntityMeta & {
  kind: DocumentKind;
  caption?: string;
  /** Absent sur un document de voyage (passeport, assurance) ; posé à la migration sur ceux d'une étape. */
  scope?: DocumentScope;
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
  /** Étape à laquelle la dépense se rattache ; absente, elle reste au jour. */
  stopId?: string;
};

export type Stop = PlaceInput & {
  id: string;
  isOvernight: boolean;
  activities: StopActivity[];
  bookings: Booking[];
  documents: TripDocument[];
  checklist: ChecklistItem[];
  /** Horodatage ISO de la dernière écriture de `notes` en voyage (fusion « dernière écriture gagne »). */
  notesAt?: string;
};

/** Façon de parcourir un tronçon (ADR 0002). Les trois premiers passent par le routage routier. */
export type TravelMode = "van" | "voiture" | "moto" | "train" | "ferry" | "velo" | "marche";

/** Tracé d'un tronçon : calculé par le routage (ou estimé), importé (GPX), ou absent (train, ferry). */
export type TrackKind = "calcule" | "importe" | "aucun";

export type RouteOption = {
  geometry: GeoJSON.LineString;
  distanceKm: number;
  /** Durée renvoyée par le routage, avant le profil de déplacement. */
  durationRawSec: number;
  /** Durée retenue, ajustée par le profil (rythme du van, routes lentes). */
  durationSec: number;
  winding: boolean;
  label: string;
};

/** Tronçon saisi à la main, sans tracé (train, ferry) : horaires et durée tels qu'annoncés. */
export type ManualLeg = {
  durationSec?: number;
  distanceKm?: number;
  /** Heures libres (« 16 h 30 »). */
  departAt?: string;
  arriveAt?: string;
  /** Compagnie, numéro de train ou de traversée. */
  operator?: string;
  /** Prix du billet, pour mémoire : il n'entre pas dans les dépenses. */
  price?: Money;
  notes?: string;
};

export type Leg = {
  id: string;
  fromStopId: string;
  toStopId: string;
  dayIndex: number;
  mode: TravelMode;
  track: TrackKind;
  options: RouteOption[];
  selectedIndex: number;
  estimated: boolean;
  /** Présent quand `track` vaut « aucun ». */
  manual?: ManualLeg;
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
  notesAt?: string;
  /** Météo notée à la main (« grand soleil, vent l'après-midi »). */
  weather?: string;
  weatherAt?: string;
  expenses: Expense[];
};

export type LayerKey = "towns" | "pois" | "camps" | "osmCamps" | "osmPois" | "freedom" | "custom";

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
  /**
   * Suppressions en voyage (réservation, document, coche, dépense) : id -> date ISO.
   * Sans elles, la synchro ferait renaître l'entité depuis l'autre appareil.
   */
  tombstones?: Record<string, string>;
  /** Documents du voyage, hors étape (passeport, assurance, contrat du van). Schéma v4. */
  tripDocuments?: TripDocument[];
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

export type BBox = { xmin: number; ymin: number; xmax: number; ymax: number };

/**
 * Préréglage géographique public. v2 : ne sert plus à cadrer un voyage (zone déduite des étapes, ADR 0003),
 * seulement à reconnaître les sources propres à un pays (catalogue et calques DOC de la Nouvelle-Zélande)
 * et à migrer les voyages de la v1.
 */
export type RegionPreset = {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
  bbox: BBox;
  maxBounds: [[number, number], [number, number]];
  timeZone: string;
  /** Devise locale par défaut des dépenses (code ISO 4217). */
  currency: string;
  /** Pays couverts (ISO 3166-1 alpha-2). */
  countries: string[];
};

export type RestrictedRoad = { id: string; name: string; note: string };

/** Préréglage standard dont un profil est copié (Q13 du cadrage). */
export type ProfilePresetId = "van" | "camping-car" | "voiture" | "moto";

/**
 * Profil de déplacement du voyage : caractéristiques du moyen de transport qui jouent sur les temps et les routes.
 * Copié depuis un préréglage puis ajustable ; le voyage garde son propre exemplaire.
 */
export type TravelProfile = {
  presetId: ProfilePresetId;
  /** Mode des tronçons routiers de ce profil. */
  mode: TravelMode;
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

/** Véhicule de la v1 : lu à la migration seulement. */
export type Vehicle = Omit<TravelProfile, "presetId" | "mode">;

export type TripMilestone = {
  placeId: string;
  date: string;
  label?: string;
  notes?: string;
  /** v2 : nom et position du lieu, pour ne plus dépendre d'un catalogue (voyage n'importe où). */
  name?: string;
  lng?: number;
  lat?: number;
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
 * Données personnelles : vit dans Supabase, jamais dans le bundle.
 *
 * Version 1 : `regionId` et `vehicle`. Version 2 (v2 de l'app) : plus de région (zone déduite des étapes),
 * `defaultMode` et `profile` ; repères avec nom et position. `validateTripConfig` lit les deux.
 */
export type TripConfig = {
  id: string;
  schemaVersion: 2;
  name: string;
  /** Mode des nouveaux tronçons. */
  defaultMode: TravelMode;
  start: TripMilestone;
  end: TripMilestone;
  arrival?: TripMilestone;
  profile: TravelProfile;
  /** Hébergements réservés (pins teal), fusionnés au catalogue public. */
  stays: CatalogPlace[];
  /** Ordre des étapes et nuits, rechargeable via le bouton « Plan ». */
  plan: TripPlan;
};
