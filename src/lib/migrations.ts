import { newId } from "@/lib/geo";
import { isTravelMode } from "@/lib/profiles";
import { normalizeActivities } from "@/lib/stop-activities";
import type {
  Booking,
  ChecklistItem,
  DocumentScope,
  EntityMeta,
  Expense,
  ExpenseCategory,
  Leg,
  ManualLeg,
  RouteOption,
  Stop,
  TripDay,
  TripDocument,
  TrackKind,
  TravelMode,
  TripSnapshot,
} from "@/lib/types";

/**
 * Version de forme des données stockées (brouillon zustand, bibliothèque, sauvegarde).
 *
 * 1 : circuits d'origine (jours, étapes, tronçons, pins, activités, plus et moins).
 * 2 : mode Voyager. Étape += `bookings`, `documents`, `checklist` ; jour += `expenses`, `notes`, `weather` ;
 *     snapshot += `frozenAt`. Chaque entité porte `id`, `updatedAt`, `updatedBy`.
 * 3 : synchronisation. Snapshot += `tombstones` (id -> date de suppression) ; étape += `notesAt` ;
 *     jour += `notesAt`, `weatherAt` ; réservation += `accessCodeSecure` (code chiffré).
 * 4 : navigation Voyager. Document d'étape += `scope` (« nuit » si l'étape est une nuit, sinon « activite »,
 *     quand il manque) ; dépense += `stopId` (optionnel) ; snapshot += `tripDocuments` (documents hors étape).
 * 5 : v2, modes de déplacement (ADR 0002). Tronçon += `mode` (« van » quand il manque : la v1 ne connaissait
 *     que le van), `track`, `manual` (tronçon sans tracé) ; option de route : `durationCarSec` devient
 *     `durationRawSec`, `durationVanSec` devient `durationSec`.
 *
 * La migration est idempotente : on peut la passer sur des données déjà à jour.
 */
export const SNAPSHOT_SCHEMA_VERSION = 5;

export const EXPENSE_CATEGORY_IDS: ExpenseCategory[] = [
  "carburant",
  "camping",
  "courses",
  "resto",
  "activite",
  "transport",
  "autre",
];

const EPOCH = new Date(0).toISOString();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function normalizeMeta(raw: Record<string, unknown>, prefix: string): EntityMeta {
  return {
    id: str(raw.id) ?? newId(prefix),
    updatedAt: str(raw.updatedAt) ?? EPOCH,
    updatedBy: str(raw.updatedBy) ?? "",
  };
}

export function normalizeBookings(value: unknown): Booking[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Booking[] => {
    if (!isRecord(item)) return [];
    const provider = str(item.provider);
    if (!provider) return [];
    const price = isRecord(item.price) && num(item.price.amount) != null && str(item.price.currency)
      ? { amount: num(item.price.amount) as number, currency: str(item.price.currency) as string }
      : undefined;
    return [
      {
        ...normalizeMeta(item, "booking"),
        provider,
        reference: str(item.reference),
        accessCode: str(item.accessCode),
        accessCodeSecure: str(item.accessCodeSecure),
        address: str(item.address),
        phone: str(item.phone),
        url: str(item.url),
        checkIn: str(item.checkIn),
        checkOut: str(item.checkOut),
        price,
        notes: str(item.notes),
      },
    ];
  });
}

function documentScope(value: unknown): DocumentScope | undefined {
  return value === "nuit" || value === "activite" ? value : undefined;
}

/**
 * `defaultScope` : portée posée quand elle manque (document d'étape antérieur à la v4). Sans elle, la
 * portée reste absente (document de voyage, ou ligne de synchro lue sans son étape : `migrateStop` complète).
 */
export function normalizeDocuments(value: unknown, defaultScope?: DocumentScope): TripDocument[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): TripDocument[] => {
    if (!isRecord(item)) return [];
    const kind = item.kind === "pdf" ? "pdf" : item.kind === "image" ? "image" : null;
    if (!kind) return [];
    const scope = documentScope(item.scope) ?? defaultScope;
    return [
      {
        ...normalizeMeta(item, "doc"),
        kind,
        caption: str(item.caption),
        ...(scope ? { scope } : {}),
        path: str(item.path) ?? "",
        size: num(item.size) ?? 0,
        mimeType: str(item.mimeType) ?? (kind === "pdf" ? "application/pdf" : "image/jpeg"),
      },
    ];
  });
}

export function normalizeChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ChecklistItem[] => {
    if (!isRecord(item)) return [];
    const text = str(item.text);
    if (!text) return [];
    return [{ ...normalizeMeta(item, "check"), text: text.trim(), done: item.done === true }];
  });
}

export function normalizeExpenses(value: unknown, fallbackDate = ""): Expense[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Expense[] => {
    if (!isRecord(item)) return [];
    const amount = num(item.amount);
    if (amount == null) return [];
    const category = EXPENSE_CATEGORY_IDS.includes(item.category as ExpenseCategory)
      ? (item.category as ExpenseCategory)
      : "autre";
    return [
      {
        ...normalizeMeta(item, "exp"),
        date: str(item.date) ?? fallbackDate,
        amount,
        currency: str(item.currency) ?? "EUR",
        category,
        paidBy: str(item.paidBy) ?? "",
        note: str(item.note),
        ...(str(item.stopId) ? { stopId: str(item.stopId) } : {}),
      },
    ];
  });
}

/** Complète une étape de n'importe quelle version : tableaux manquants créés vides. */
export function migrateStop(stop: Partial<Stop> & Record<string, unknown>): Stop {
  return {
    ...(stop as Stop),
    activities: normalizeActivities(stop.activities),
    bookings: normalizeBookings(stop.bookings),
    documents: normalizeDocuments(stop.documents, stop.isOvernight ? "nuit" : "activite"),
    checklist: normalizeChecklist(stop.checklist),
    notesAt: str(stop.notesAt),
  };
}

function normalizeRouteOption(value: unknown): RouteOption[] {
  if (!isRecord(value)) return [];
  const geometry = value.geometry;
  if (!isRecord(geometry) || geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) return [];
  const durationSec = num(value.durationSec) ?? num(value.durationVanSec) ?? 0;
  return [
    {
      geometry: geometry as unknown as GeoJSON.LineString,
      distanceKm: num(value.distanceKm) ?? 0,
      durationRawSec: num(value.durationRawSec) ?? num(value.durationCarSec) ?? durationSec,
      durationSec,
      winding: value.winding === true,
      label: typeof value.label === "string" ? value.label : "",
    },
  ];
}

function normalizeManualLeg(value: unknown): ManualLeg | undefined {
  if (!isRecord(value)) return undefined;
  const manual: ManualLeg = {
    durationSec: num(value.durationSec),
    distanceKm: num(value.distanceKm),
    departAt: str(value.departAt),
    arriveAt: str(value.arriveAt),
    operator: str(value.operator),
    notes: str(value.notes),
  };
  return Object.fromEntries(Object.entries(manual).filter(([, v]) => v !== undefined)) as ManualLeg;
}

function trackKind(value: unknown, options: RouteOption[], manual: ManualLeg | undefined): TrackKind {
  if (value === "calcule" || value === "importe" || value === "aucun") return value;
  return options.length === 0 && manual ? "aucun" : "calcule";
}

/** Tronçons de n'importe quelle version ; un tronçon sans étapes ni identifiant est écarté. */
export function normalizeLegs(value: unknown, defaultMode: TravelMode = "van"): Leg[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Leg[] => {
    if (!isRecord(item)) return [];
    const id = str(item.id);
    const fromStopId = str(item.fromStopId);
    const toStopId = str(item.toStopId);
    if (!id || !fromStopId || !toStopId) return [];
    const options = Array.isArray(item.options) ? item.options.flatMap(normalizeRouteOption) : [];
    const manual = normalizeManualLeg(item.manual);
    const selectedIndex = num(item.selectedIndex) ?? 0;
    return [
      {
        id,
        fromStopId,
        toStopId,
        dayIndex: num(item.dayIndex) ?? 0,
        mode: isTravelMode(item.mode) ? item.mode : defaultMode,
        track: trackKind(item.track, options, manual),
        options,
        selectedIndex: selectedIndex >= 0 && selectedIndex < options.length ? selectedIndex : 0,
        estimated: item.estimated === true,
        ...(manual ? { manual } : {}),
      },
    ];
  });
}

/** Pierres tombales : id -> date ISO, tout le reste est ignoré. */
export function normalizeTombstones(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [id, at] of Object.entries(value)) {
    if (id && typeof at === "string" && at) out[id] = at;
  }
  return out;
}

export function normalizeStops(stops: Record<string, Stop> | undefined | null): Record<string, Stop> {
  if (!stops || typeof stops !== "object") return {};
  const next: Record<string, Stop> = {};
  for (const [id, stop] of Object.entries(stops)) {
    if (!stop || typeof stop !== "object") continue;
    next[id] = migrateStop(stop as Partial<Stop> & Record<string, unknown>);
  }
  return next;
}

export function migrateDay(day: Partial<TripDay> & Record<string, unknown>): TripDay {
  const date = typeof day.date === "string" ? day.date : "";
  return {
    date,
    label: typeof day.label === "string" ? day.label : "",
    weekday: typeof day.weekday === "string" ? day.weekday : "",
    locked: day.locked === true,
    overnightStopId: typeof day.overnightStopId === "string" ? day.overnightStopId : null,
    stopIds: Array.isArray(day.stopIds) ? day.stopIds.filter((id): id is string => typeof id === "string") : [],
    notes: str(day.notes),
    notesAt: str(day.notesAt),
    weather: str(day.weather),
    weatherAt: str(day.weatherAt),
    expenses: normalizeExpenses(day.expenses, date),
  };
}

export function normalizeDays(days: unknown): TripDay[] {
  if (!Array.isArray(days)) return [];
  return days.filter(isRecord).map((day) => migrateDay(day as Partial<TripDay> & Record<string, unknown>));
}

/**
 * Amène un snapshot (ou tout objet qui en contient un : circuit enregistré, brouillon) à la version courante.
 * Les champs inconnus sont conservés tels quels.
 */
export function migrateSnapshot<T extends Partial<TripSnapshot>>(raw: T): T & TripSnapshot {
  return {
    ...raw,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    days: normalizeDays(raw.days),
    stops: normalizeStops(raw.stops),
    legs: normalizeLegs(raw.legs),
    customPins: Array.isArray(raw.customPins) ? raw.customPins : [],
    currentDayIndex: typeof raw.currentDayIndex === "number" ? raw.currentDayIndex : 0,
    frozenAt: typeof raw.frozenAt === "string" ? raw.frozenAt : null,
    tombstones: normalizeTombstones(raw.tombstones),
    tripDocuments: normalizeDocuments(raw.tripDocuments),
  };
}
