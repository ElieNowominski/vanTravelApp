import { START_STOP_ID } from "@/lib/constants";
import { normalizeTombstones } from "@/lib/migrations";
import type {
  Booking,
  ChecklistItem,
  EntityMeta,
  Expense,
  Leg,
  Stop,
  TripDay,
  TripDocument,
  TripMark,
  TripSnapshot,
} from "@/lib/types";

/**
 * Modèle de synchronisation entre appareils, sans base de données : trois fichiers JSON par voyage
 * dans le dépôt privé, fusionnés « dernière écriture gagne » par entité.
 *
 * - `itinerary.json` : jours, étapes, tronçons, pins, figeage, plus et moins. Produit par la planification,
 *   rarement modifié en voyage : le fichier entier suit la dernière écriture (`updatedAt`).
 * - `travel.json` : par étape (réservations, documents, checklist, notes), par jour (notes, météo),
 *   pierres tombales. Chaque entité porte `updatedAt` : la plus récente gagne, une suppression plus
 *   récente que la dernière écriture gagne sur l'entité.
 * - `expenses.json` : dépenses, fichier à part car les deux personnes en saisissent en même temps.
 *
 * Tout ici est pur : ni réseau, ni store, ni horloge implicite.
 */
export const SYNC_FORMAT = 1;

export type StopTravel = {
  bookings: Booking[];
  documents: TripDocument[];
  checklist: ChecklistItem[];
  notes?: string;
  notesAt?: string;
};

export type DayTravel = {
  notes?: string;
  notesAt?: string;
  weather?: string;
  weatherAt?: string;
};

export type TravelDoc = {
  format: typeof SYNC_FORMAT;
  updatedAt: string;
  /** Par identifiant d'étape. */
  stops: Record<string, StopTravel>;
  /** Par date calendaire AAAA-MM-JJ. */
  days: Record<string, DayTravel>;
  tombstones: Record<string, string>;
};

export type ExpensesDoc = {
  format: typeof SYNC_FORMAT;
  updatedAt: string;
  expenses: Expense[];
  tombstones: Record<string, string>;
};

export type ItineraryDoc = {
  format: typeof SYNC_FORMAT;
  updatedAt: string;
  updatedBy: string;
  snapshot: TripSnapshot;
  marks: TripMark[];
};

const EPOCH = new Date(0).toISOString();

function later(a: string | undefined, b: string | undefined): boolean {
  return (a ?? EPOCH) > (b ?? EPOCH);
}

/** Union par id, la plus récente gagne ; une pierre tombale plus récente que l'entité l'efface. */
export function mergeEntities<T extends EntityMeta>(a: T[], b: T[], tombstones: Record<string, string>): T[] {
  const byId = new Map<string, T>();
  for (const item of [...a, ...b]) {
    const current = byId.get(item.id);
    if (!current || later(item.updatedAt, current.updatedAt)) byId.set(item.id, item);
  }
  return [...byId.values()].filter((item) => {
    const buried = tombstones[item.id];
    return !buried || later(item.updatedAt, buried);
  });
}

export function mergeTombstones(a: Record<string, string>, b: Record<string, string>): Record<string, string> {
  const out = { ...a };
  for (const [id, at] of Object.entries(b)) {
    if (!out[id] || at > out[id]) out[id] = at;
  }
  return out;
}

function pickStamped<T extends { at?: string; value?: string }>(a: T, b: T): T {
  return later(b.at, a.at) ? b : a;
}

function mergeStopTravel(a: StopTravel | undefined, b: StopTravel | undefined, tombstones: Record<string, string>): StopTravel {
  const x = a ?? emptyStopTravel();
  const y = b ?? emptyStopTravel();
  const notes = pickStamped({ value: x.notes, at: x.notesAt }, { value: y.notes, at: y.notesAt });
  return {
    bookings: mergeEntities(x.bookings, y.bookings, tombstones),
    documents: mergeEntities(x.documents, y.documents, tombstones),
    checklist: mergeEntities(x.checklist, y.checklist, tombstones),
    notes: notes.value,
    notesAt: notes.at,
  };
}

function mergeDayTravel(a: DayTravel | undefined, b: DayTravel | undefined): DayTravel {
  const x = a ?? {};
  const y = b ?? {};
  const notes = pickStamped({ value: x.notes, at: x.notesAt }, { value: y.notes, at: y.notesAt });
  const weather = pickStamped({ value: x.weather, at: x.weatherAt }, { value: y.weather, at: y.weatherAt });
  return { notes: notes.value, notesAt: notes.at, weather: weather.value, weatherAt: weather.at };
}

function emptyStopTravel(): StopTravel {
  return { bookings: [], documents: [], checklist: [] };
}

export function emptyTravelDoc(updatedAt = EPOCH): TravelDoc {
  return { format: SYNC_FORMAT, updatedAt, stops: {}, days: {}, tombstones: {} };
}

export function emptyExpensesDoc(updatedAt = EPOCH): ExpensesDoc {
  return { format: SYNC_FORMAT, updatedAt, expenses: [], tombstones: {} };
}

export function mergeTravel(a: TravelDoc, b: TravelDoc): TravelDoc {
  const tombstones = mergeTombstones(a.tombstones, b.tombstones);
  const stops: Record<string, StopTravel> = {};
  for (const id of new Set([...Object.keys(a.stops), ...Object.keys(b.stops)])) {
    stops[id] = mergeStopTravel(a.stops[id], b.stops[id], tombstones);
  }
  const days: Record<string, DayTravel> = {};
  for (const date of new Set([...Object.keys(a.days), ...Object.keys(b.days)])) {
    days[date] = mergeDayTravel(a.days[date], b.days[date]);
  }
  return { format: SYNC_FORMAT, updatedAt: a.updatedAt > b.updatedAt ? a.updatedAt : b.updatedAt, stops, days, tombstones };
}

export function mergeExpenses(a: ExpensesDoc, b: ExpensesDoc): ExpensesDoc {
  const tombstones = mergeTombstones(a.tombstones, b.tombstones);
  return {
    format: SYNC_FORMAT,
    updatedAt: a.updatedAt > b.updatedAt ? a.updatedAt : b.updatedAt,
    expenses: mergeEntities(a.expenses, b.expenses, tombstones).sort((x, y) => x.date.localeCompare(y.date) || x.updatedAt.localeCompare(y.updatedAt)),
    tombstones,
  };
}

/** Ce que le snapshot local porte comme données de voyage, à la forme du fichier `travel.json`. */
export function extractTravel(snapshot: TripSnapshot, updatedAt: string): TravelDoc {
  const stops: Record<string, StopTravel> = {};
  for (const stop of Object.values(snapshot.stops)) {
    const hasSomething = stop.bookings.length + stop.documents.length + stop.checklist.length > 0 || stop.notesAt;
    if (!hasSomething) continue;
    stops[stop.id] = {
      bookings: stop.bookings,
      documents: stop.documents,
      checklist: stop.checklist,
      notes: stop.notes,
      notesAt: stop.notesAt,
    };
  }
  const days: Record<string, DayTravel> = {};
  for (const day of snapshot.days) {
    if (!day.notesAt && !day.weatherAt) continue;
    days[day.date] = { notes: day.notes, notesAt: day.notesAt, weather: day.weather, weatherAt: day.weatherAt };
  }
  return { format: SYNC_FORMAT, updatedAt, stops, days, tombstones: snapshot.tombstones ?? {} };
}

export function extractExpenses(snapshot: TripSnapshot, updatedAt: string): ExpensesDoc {
  return {
    format: SYNC_FORMAT,
    updatedAt,
    expenses: snapshot.days.flatMap((day) => day.expenses ?? []),
    tombstones: snapshot.tombstones ?? {},
  };
}

/**
 * Réinjecte les fichiers fusionnés dans le snapshot local. Les étapes ou dates inconnues ici restent
 * dans les fichiers (rien n'est perdu) ; les entités locales absentes du fichier fusionné disparaissent
 * (c'est une suppression venue de l'autre appareil).
 */
export function applyTravel(snapshot: TripSnapshot, travel: TravelDoc, expenses: ExpensesDoc): TripSnapshot {
  const stops: Record<string, Stop> = {};
  for (const [id, stop] of Object.entries(snapshot.stops)) {
    const t = travel.stops[id];
    // Notes de planification (sans horodatage) : conservées tant que rien de daté ne vient les remplacer.
    const keepPlanningNotes = !t?.notesAt && !stop.notesAt;
    stops[id] = t
      ? {
          ...stop,
          bookings: t.bookings,
          documents: t.documents,
          checklist: t.checklist,
          notes: keepPlanningNotes ? stop.notes : t.notes,
          notesAt: t.notesAt,
        }
      : { ...stop, bookings: [], documents: [], checklist: [], notes: stop.notesAt ? undefined : stop.notes, notesAt: undefined };
  }
  const byDate = new Map<string, Expense[]>();
  for (const expense of expenses.expenses) {
    const list = byDate.get(expense.date) ?? [];
    list.push(expense);
    byDate.set(expense.date, list);
  }
  const days: TripDay[] = snapshot.days.map((day) => {
    const d = travel.days[day.date] ?? {};
    return {
      ...day,
      notes: d.notesAt ? d.notes : day.notesAt ? undefined : day.notes,
      notesAt: d.notesAt,
      weather: d.weatherAt ? d.weather : day.weatherAt ? undefined : day.weather,
      weatherAt: d.weatherAt,
      expenses: byDate.get(day.date) ?? [],
    };
  });
  return { ...snapshot, stops, days, tombstones: mergeTombstones(travel.tombstones, expenses.tombstones) };
}

/** Itinéraire sans les données de voyage : c'est ce que `itinerary.json` transporte. */
/** Cinq décimales, soit un mètre : assez pour une route, et dix pour cent de fichier en moins. */
const COORD_DECIMALS = 5;

export function roundLegCoordinates(leg: Leg, decimals = COORD_DECIMALS): Leg {
  const factor = 10 ** decimals;
  return {
    ...leg,
    options: leg.options.map((option) => ({
      ...option,
      geometry: {
        ...option.geometry,
        coordinates: option.geometry.coordinates.map((position) => position.map((value) => Math.round(value * factor) / factor)),
      },
    })),
  };
}

export function stripTravel(snapshot: TripSnapshot): TripSnapshot {
  const stops: Record<string, Stop> = {};
  for (const [id, stop] of Object.entries(snapshot.stops)) {
    stops[id] = { ...stop, bookings: [], documents: [], checklist: [], notesAt: undefined, notes: stop.notesAt ? undefined : stop.notes };
  }
  return {
    schemaVersion: snapshot.schemaVersion,
    days: snapshot.days.map((day) => ({
      date: day.date,
      label: day.label,
      weekday: day.weekday,
      locked: day.locked,
      overnightStopId: day.overnightStopId,
      stopIds: day.stopIds,
      expenses: [],
    })),
    stops,
    legs: snapshot.legs.map((leg) => roundLegCoordinates(leg)),
    customPins: snapshot.customPins,
    currentDayIndex: snapshot.currentDayIndex,
    frozenAt: snapshot.frozenAt ?? null,
  };
}

/**
 * Signature structurelle de l'itinéraire, sans géométrie : change quand la planification change,
 * pas quand on saisit une réservation. Sert à savoir si `itinerary.json` doit être renvoyé.
 */
export function itinerarySignature(snapshot: TripSnapshot): string {
  const days = snapshot.days.map((d) => [d.date, d.overnightStopId, d.locked ? 1 : 0, d.stopIds]);
  const stops = Object.values(snapshot.stops)
    .map((s) => [s.id, s.placeId, s.name, s.lng, s.lat, s.kind, s.isOvernight ? 1 : 0, s.activities.map((a) => a.text), s.notesAt ? "" : s.notes ?? ""])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const legs = snapshot.legs.map((l) => [l.id, l.fromStopId, l.toStopId, l.selectedIndex, l.options.length]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const pins = snapshot.customPins.map((p) => [p.placeId, p.name, p.lng, p.lat]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return hashString(JSON.stringify([days, stops, legs, pins, snapshot.frozenAt ?? null]));
}

/** FNV-1a 32 bits, suffisant pour détecter un changement. */
export function hashString(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Applique un itinéraire distant en gardant les données de voyage locales des étapes connues. */
export function applyItinerary(local: TripSnapshot, remote: TripSnapshot): TripSnapshot {
  const stops: Record<string, Stop> = {};
  for (const [id, stop] of Object.entries(remote.stops)) {
    const mine = local.stops[id];
    stops[id] = mine
      ? { ...stop, bookings: mine.bookings, documents: mine.documents, checklist: mine.checklist, notes: mine.notesAt ? mine.notes : stop.notes, notesAt: mine.notesAt }
      : stop;
  }
  const localDays = new Map(local.days.map((d) => [d.date, d]));
  const days: TripDay[] = remote.days.map((day) => {
    const mine = localDays.get(day.date);
    return mine
      ? { ...day, notes: mine.notes, notesAt: mine.notesAt, weather: mine.weather, weatherAt: mine.weatherAt, expenses: mine.expenses ?? [] }
      : day;
  });
  return {
    ...local,
    days,
    stops,
    legs: remote.legs,
    customPins: remote.customPins,
    currentDayIndex: Math.min(remote.currentDayIndex, Math.max(0, days.length - 1)),
    frozenAt: remote.frozenAt ?? null,
    tombstones: normalizeTombstones(local.tombstones),
  };
}

/**
 * Un snapshot réduit à l'étape de départ posée automatiquement (`seedStart`) ne porte aucune information :
 * ni en local ni dans le dépôt il ne doit l'emporter sur un vrai itinéraire.
 */
export function hasItinerary(snapshot: Pick<TripSnapshot, "days" | "stops" | "legs" | "customPins">): boolean {
  if (snapshot.legs.length > 0 || snapshot.customPins.length > 0) return true;
  if (Object.keys(snapshot.stops).some((id) => id !== START_STOP_ID)) return true;
  return snapshot.days.some((day) => day.stopIds.some((id) => id !== START_STOP_ID));
}

export type ItineraryDecision = "keep-local" | "take-remote" | "push-local" | "none";
/** Choix explicite de la personne dans le dialogue : « Recevoir », « Envoyer », ou la règle automatique. */
export type ItineraryForce = "auto" | "take-remote" | "push-local";

/** Applique le choix explicite seulement s'il a un sens (on ne reçoit pas un itinéraire absent). */
export function resolveItineraryDecision(auto: ItineraryDecision, force: ItineraryForce, input: { hasLocal: boolean; hasRemote: boolean }): ItineraryDecision {
  if (force === "take-remote" && input.hasRemote) return "take-remote";
  if (force === "push-local" && input.hasLocal) return "push-local";
  return auto;
}

/**
 * Qui a raison sur l'itinéraire ? `localChangedAt` : dernière modification structurelle locale
 * depuis la dernière synchro (`null` : rien de changé). `remoteChanged` : le fichier distant a bougé.
 */
export function decideItinerary(input: {
  localChangedAt: string | null;
  remoteChanged: boolean;
  remoteUpdatedAt: string | null;
  hasRemote: boolean;
  hasLocal: boolean;
}): ItineraryDecision {
  if (!input.hasRemote) return input.hasLocal ? "push-local" : "none";
  if (!input.hasLocal) return "take-remote";
  if (input.localChangedAt && input.remoteChanged) {
    return later(input.remoteUpdatedAt ?? undefined, input.localChangedAt) ? "take-remote" : "push-local";
  }
  if (input.localChangedAt) return "push-local";
  if (input.remoteChanged) return "take-remote";
  return "none";
}

/** Chemin des fichiers d'un voyage dans le dépôt privé. */
export function tripPaths(tripId: string) {
  const base = `trips/${tripId}`;
  return {
    trip: `${base}/trip.json`,
    itinerary: `${base}/itinerary.json`,
    travel: `${base}/travel.json`,
    expenses: `${base}/expenses.json`,
    docs: `${base}/docs`,
  };
}

/** Document sans chemin (ancienne saisie) : on en déduit un stable. */
export function documentPath(tripId: string, doc: TripDocument): string {
  if (doc.path) return doc.path;
  const ext = doc.kind === "pdf" ? "pdf" : doc.mimeType === "image/png" ? "png" : "jpg";
  return `${tripPaths(tripId).docs}/${doc.id}.${ext}`;
}

export function isTravelDoc(value: unknown): value is TravelDoc {
  const v = value as Partial<TravelDoc> | null;
  return !!v && typeof v === "object" && v.format === SYNC_FORMAT && typeof v.stops === "object" && typeof v.days === "object";
}

export function isExpensesDoc(value: unknown): value is ExpensesDoc {
  const v = value as Partial<ExpensesDoc> | null;
  return !!v && typeof v === "object" && v.format === SYNC_FORMAT && Array.isArray(v.expenses);
}

export function isItineraryDoc(value: unknown): value is ItineraryDoc {
  const v = value as Partial<ItineraryDoc> | null;
  return !!v && typeof v === "object" && v.format === SYNC_FORMAT && !!v.snapshot && typeof v.snapshot === "object";
}
