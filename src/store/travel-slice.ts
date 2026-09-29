import { newId } from "@/lib/geo";
import type { AppMode } from "@/lib/voyager";
import type { Booking, ChecklistItem, Expense, Stop, TripDay, TripDocument } from "@/lib/types";
import { currentAuthor } from "@/store/profile-store";
import type { TripState } from "@/store/trip-store";

export type BookingInput = Omit<Booking, "id" | "updatedAt" | "updatedBy">;
export type ExpenseInput = Omit<Expense, "id" | "updatedAt" | "updatedBy">;
export type DocumentInput = Omit<TripDocument, "id" | "updatedAt" | "updatedBy"> & { id?: string };

/** Actions du mode Voyager : réservations, documents, checklists, notes, dépenses, mode d'affichage. */
export type TravelSlice = {
  /** Choix explicite Planifier / Voyager ; `null` = mode par défaut (dates du voyage, itinéraire figé). */
  uiMode: AppMode | null;
  setUiMode: (mode: AppMode | null) => void;
  setStopNotes: (stopId: string, notes: string) => void;
  upsertBooking: (stopId: string, input: BookingInput, bookingId?: string) => string;
  removeBooking: (stopId: string, bookingId: string) => void;
  addDocument: (stopId: string, input: DocumentInput) => string;
  updateDocumentCaption: (stopId: string, documentId: string, caption: string) => void;
  removeDocument: (stopId: string, documentId: string) => void;
  addChecklistItem: (stopId: string, text: string) => void;
  toggleChecklistItem: (stopId: string, itemId: string) => void;
  removeChecklistItem: (stopId: string, itemId: string) => void;
  setDayNotes: (dayIndex: number, notes: string) => void;
  setDayWeather: (dayIndex: number, weather: string) => void;
  addExpense: (dayIndex: number, input: ExpenseInput) => string;
  updateExpense: (dayIndex: number, expenseId: string, patch: Partial<ExpenseInput>) => void;
  removeExpense: (dayIndex: number, expenseId: string) => void;
};

type Set = (fn: (prev: TripState) => Partial<TripState>) => void;

function stamp(): { updatedAt: string; updatedBy: string } {
  return { updatedAt: new Date().toISOString(), updatedBy: currentAuthor() };
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function patchStop(set: Set, stopId: string, fn: (stop: Stop) => Stop) {
  set((prev) => {
    const stop = prev.stops[stopId];
    if (!stop) return {};
    return { stops: { ...prev.stops, [stopId]: fn(stop) } };
  });
}

function patchDay(set: Set, dayIndex: number, fn: (day: TripDay) => TripDay) {
  set((prev) => {
    const day = prev.days[dayIndex];
    if (!day) return {};
    return { days: prev.days.map((d, i) => (i === dayIndex ? fn(d) : d)) };
  });
}

export function createTravelSlice(set: Set): TravelSlice {
  return {
    uiMode: null,
    setUiMode: (mode) => set(() => ({ uiMode: mode })),

    setStopNotes: (stopId, notes) => patchStop(set, stopId, (stop) => ({ ...stop, notes: clean(notes) })),

    upsertBooking: (stopId, input, bookingId) => {
      const id = bookingId ?? newId("booking");
      patchStop(set, stopId, (stop) => {
        const booking: Booking = {
          id,
          ...stamp(),
          provider: input.provider.trim() || "Réservation",
          reference: clean(input.reference),
          accessCode: clean(input.accessCode),
          address: clean(input.address),
          phone: clean(input.phone),
          url: clean(input.url),
          checkIn: clean(input.checkIn),
          checkOut: clean(input.checkOut),
          price: input.price && Number.isFinite(input.price.amount) ? input.price : undefined,
          notes: clean(input.notes),
        };
        const exists = stop.bookings.some((b) => b.id === id);
        return {
          ...stop,
          bookings: exists ? stop.bookings.map((b) => (b.id === id ? booking : b)) : [...stop.bookings, booking],
        };
      });
      return id;
    },

    removeBooking: (stopId, bookingId) =>
      patchStop(set, stopId, (stop) => ({ ...stop, bookings: stop.bookings.filter((b) => b.id !== bookingId) })),

    addDocument: (stopId, input) => {
      const id = input.id ?? newId("doc");
      patchStop(set, stopId, (stop) => ({
        ...stop,
        documents: [...stop.documents, { ...input, id, ...stamp(), caption: clean(input.caption) }],
      }));
      return id;
    },

    updateDocumentCaption: (stopId, documentId, caption) =>
      patchStop(set, stopId, (stop) => ({
        ...stop,
        documents: stop.documents.map((d) => (d.id === documentId ? { ...d, caption: clean(caption), ...stamp() } : d)),
      })),

    removeDocument: (stopId, documentId) =>
      patchStop(set, stopId, (stop) => ({ ...stop, documents: stop.documents.filter((d) => d.id !== documentId) })),

    addChecklistItem: (stopId, text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      patchStop(set, stopId, (stop) => ({
        ...stop,
        checklist: [...stop.checklist, { id: newId("check"), ...stamp(), text: trimmed, done: false } satisfies ChecklistItem],
      }));
    },

    toggleChecklistItem: (stopId, itemId) =>
      patchStop(set, stopId, (stop) => ({
        ...stop,
        checklist: stop.checklist.map((item) => (item.id === itemId ? { ...item, done: !item.done, ...stamp() } : item)),
      })),

    removeChecklistItem: (stopId, itemId) =>
      patchStop(set, stopId, (stop) => ({ ...stop, checklist: stop.checklist.filter((item) => item.id !== itemId) })),

    setDayNotes: (dayIndex, notes) => patchDay(set, dayIndex, (day) => ({ ...day, notes: clean(notes) })),

    setDayWeather: (dayIndex, weather) => patchDay(set, dayIndex, (day) => ({ ...day, weather: clean(weather) })),

    addExpense: (dayIndex, input) => {
      const id = newId("exp");
      patchDay(set, dayIndex, (day) => ({
        ...day,
        expenses: [
          ...(day.expenses ?? []),
          { id, ...stamp(), ...input, date: input.date || day.date, paidBy: input.paidBy.trim(), note: clean(input.note) },
        ],
      }));
      return id;
    },

    updateExpense: (dayIndex, expenseId, patch) =>
      patchDay(set, dayIndex, (day) => ({
        ...day,
        expenses: (day.expenses ?? []).map((e) => (e.id === expenseId ? { ...e, ...patch, ...stamp() } : e)),
      })),

    removeExpense: (dayIndex, expenseId) =>
      patchDay(set, dayIndex, (day) => ({ ...day, expenses: (day.expenses ?? []).filter((e) => e.id !== expenseId) })),
  };
}
