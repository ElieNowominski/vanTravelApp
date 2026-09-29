import { newId } from "@/lib/geo";
import { normalizeActivities } from "@/lib/stop-activities";
import type {
  Booking,
  ChecklistItem,
  EntityMeta,
  Expense,
  ExpenseCategory,
  Stop,
  TripDay,
  TripDocument,
  TripSnapshot,
} from "@/lib/types";

/**
 * Version de forme des données stockées (brouillon zustand, bibliothèque, sauvegarde).
 *
 * 1 : circuits d'origine (jours, étapes, tronçons, pins, activités, plus et moins).
 * 2 : mode Voyager. Étape += `bookings`, `documents`, `checklist` ; jour += `expenses`, `notes`, `weather` ;
 *     snapshot += `frozenAt`. Chaque entité porte `id`, `updatedAt`, `updatedBy`.
 *
 * La migration est idempotente : on peut la passer sur des données déjà à jour.
 */
export const SNAPSHOT_SCHEMA_VERSION = 2;

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

export function normalizeDocuments(value: unknown): TripDocument[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): TripDocument[] => {
    if (!isRecord(item)) return [];
    const kind = item.kind === "pdf" ? "pdf" : item.kind === "image" ? "image" : null;
    if (!kind) return [];
    return [
      {
        ...normalizeMeta(item, "doc"),
        kind,
        caption: str(item.caption),
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
    documents: normalizeDocuments(stop.documents),
    checklist: normalizeChecklist(stop.checklist),
  };
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
    weather: str(day.weather),
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
    legs: Array.isArray(raw.legs) ? raw.legs : [],
    customPins: Array.isArray(raw.customPins) ? raw.customPins : [],
    currentDayIndex: typeof raw.currentDayIndex === "number" ? raw.currentDayIndex : 0,
    frozenAt: typeof raw.frozenAt === "string" ? raw.frozenAt : null,
  };
}
