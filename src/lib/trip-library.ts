import { TRIP_LIBRARY_DB, TRIP_LIBRARY_LS, TRIP_LIBRARY_STORE } from "@/lib/constants";
import { newId } from "@/lib/geo";
import { normalizeStops } from "@/lib/stop-activities";
import { isTripConfig } from "@/lib/trip-config";
import { normalizeMarks } from "@/lib/trip-marks";
import type { SavedTrip, TripConfig, TripMark, TripSnapshot } from "@/lib/types";
import { dayStats } from "@/store/trip-store";

export function snapshotStats(snapshot: TripSnapshot) {
  let km = 0;
  let nights = 0;
  snapshot.days.forEach((_day, index) => {
    const stats = dayStats(snapshot, index);
    km += stats.km;
    if (stats.overnight) nights += 1;
  });
  return { km, nights };
}

export function suggestTripName(snapshot: TripSnapshot): string {
  const nights = snapshot.days
    .map((day) => (day.overnightStopId ? snapshot.stops[day.overnightStopId]?.name : null))
    .filter((name): name is string => Boolean(name));
  if (nights.length > 0) return nights.slice(0, 3).join(" → ");
  const firstId = snapshot.days[0]?.stopIds[0];
  const startName = firstId ? snapshot.stops[firstId]?.name : null;
  const stops = snapshot.days.flatMap((day) =>
    day.stopIds.map((id) => snapshot.stops[id]?.name).filter(Boolean),
  );
  const unique = [...new Set(stops)].filter((name) => name !== startName);
  if (unique.length > 0) return unique.slice(0, 3).join(" → ");
  return `Circuit ${new Date().toLocaleDateString("fr-FR")}`;
}

export { normalizeMarks } from "@/lib/trip-marks";

export function buildSavedTrip(
  name: string,
  snapshot: TripSnapshot,
  id = newId("trip"),
  marks: TripMark[] = [],
  config: TripConfig | null = null,
): SavedTrip {
  const stats = snapshotStats(snapshot);
  return {
    id,
    name: name.trim() || suggestTripName(snapshot),
    savedAt: new Date().toISOString(),
    km: stats.km,
    nights: stats.nights,
    marks: normalizeMarks(marks),
    config: isTripConfig(config) ? structuredClone(config) : null,
    days: structuredClone(snapshot.days),
    stops: structuredClone(snapshot.stops),
    legs: structuredClone(snapshot.legs),
    customPins: structuredClone(snapshot.customPins),
    currentDayIndex: snapshot.currentDayIndex,
    frozenAt: snapshot.frozenAt ?? null,
  };
}

export async function listSavedTrips(): Promise<SavedTrip[]> {
  const trips = await readAll();
  return trips.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function patchSavedTripMarks(id: string, marks: TripMark[]): Promise<void> {
  const trip = await getSavedTrip(id);
  if (!trip) return;
  await putSavedTrip({ ...trip, marks: normalizeMarks(marks) });
}

export async function getSavedTrip(id: string): Promise<SavedTrip | null> {
  const trips = await readAll();
  return trips.find((t) => t.id === id) ?? null;
}

export async function putSavedTrip(trip: SavedTrip): Promise<void> {
  const trips = await readAll();
  const next = [...trips.filter((t) => t.id !== trip.id), trip];
  await writeAll(next);
}

export async function deleteSavedTrip(id: string): Promise<void> {
  const trips = await readAll();
  await writeAll(trips.filter((t) => t.id !== id));
}

function hydrateTrip(trip: SavedTrip): SavedTrip {
  return {
    ...trip,
    marks: normalizeMarks(trip.marks),
    stops: normalizeStops(trip.stops),
    customPins: Array.isArray(trip.customPins) ? trip.customPins : [],
    config: isTripConfig(trip.config) ? trip.config : null,
  };
}

async function readAll(): Promise<SavedTrip[]> {
  try {
    const fromIdb = await idbAll();
    if (fromIdb.length > 0) {
      writeLocalBestEffort(fromIdb);
      return fromIdb.map(hydrateTrip);
    }
    const fromLs = readLocal();
    if (fromLs.length > 0) {
      try {
        await idbReplace(fromLs);
      } catch {
        /* IndexedDB indisponible : le localStorage suffit. */
      }
    }
    return fromLs.map(hydrateTrip);
  } catch {
    return readLocal().map(hydrateTrip);
  }
}

async function writeAll(trips: SavedTrip[]): Promise<void> {
  try {
    await idbReplace(trips);
    writeLocalBestEffort(trips);
  } catch (error) {
    writeLocalBestEffort(trips);
    throw error;
  }
}

function readLocal(): SavedTrip[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(TRIP_LIBRARY_LS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedTrip[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** localStorage ~5 Mo : on n’y met pas les traces GPS (IndexedDB les garde). */
function compactTrips(trips: SavedTrip[]): SavedTrip[] {
  return trips.map((trip) => ({
    ...trip,
    legs: trip.legs.map((leg) => ({
      ...leg,
      options: leg.options.map((option) => ({
        ...option,
        geometry: { type: "LineString" as const, coordinates: [] },
      })),
    })),
  }));
}

function writeLocalBestEffort(trips: SavedTrip[]) {
  if (typeof localStorage === "undefined") return;
  const payload = JSON.stringify(compactTrips(trips));
  try {
    localStorage.setItem(TRIP_LIBRARY_LS, payload);
  } catch {
    try {
      localStorage.removeItem(TRIP_LIBRARY_LS);
      localStorage.setItem(TRIP_LIBRARY_LS, payload);
    } catch {
      try {
        localStorage.removeItem(TRIP_LIBRARY_LS);
      } catch {
        /* IndexedDB reste la source de vérité. */
      }
    }
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponible"));
      return;
    }
    const req = indexedDB.open(TRIP_LIBRARY_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TRIP_LIBRARY_STORE)) {
        db.createObjectStore(TRIP_LIBRARY_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB"));
  });
}

async function idbAll(): Promise<SavedTrip[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(TRIP_LIBRARY_STORE, "readonly");
      const req = tx.objectStore(TRIP_LIBRARY_STORE).getAll();
      req.onsuccess = () => resolve((req.result as SavedTrip[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbReplace(trips: SavedTrip[]): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TRIP_LIBRARY_STORE, "readwrite");
      const store = tx.objectStore(TRIP_LIBRARY_STORE);
      store.clear();
      for (const trip of trips) store.put(trip);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
