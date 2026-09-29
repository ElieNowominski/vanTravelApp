import { DEFAULT_VEHICLE } from "@/lib/constants";
import { eachDateInclusive } from "@/lib/format";
import { DEFAULT_REGION_ID } from "@/lib/regions";
import type {
  CatalogPlace,
  PlanStop,
  Stop,
  TripConfig,
  TripMilestone,
  TripPlan,
  TripSnapshot,
  Vehicle,
} from "@/lib/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMilestone(value: unknown, field: string): TripMilestone {
  if (!isRecord(value)) throw new Error(`Voyage invalide : « ${field} » manquant.`);
  if (typeof value.placeId !== "string" || !value.placeId) {
    throw new Error(`Voyage invalide : « ${field}.placeId » manquant.`);
  }
  if (typeof value.date !== "string" || !ISO_DATE.test(value.date)) {
    throw new Error(`Voyage invalide : « ${field}.date » doit être au format AAAA-MM-JJ.`);
  }
  return {
    placeId: value.placeId,
    date: value.date,
    label: typeof value.label === "string" ? value.label : undefined,
    notes: typeof value.notes === "string" ? value.notes : undefined,
  };
}

function parseVehicle(value: unknown): Vehicle {
  if (!isRecord(value)) return { ...DEFAULT_VEHICLE };
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  return {
    name: typeof value.name === "string" && value.name ? value.name : DEFAULT_VEHICLE.name,
    selfContained: typeof value.selfContained === "boolean" ? value.selfContained : true,
    lengthM: typeof value.lengthM === "number" ? value.lengthM : undefined,
    widthM: typeof value.widthM === "number" ? value.widthM : undefined,
    heightM: typeof value.heightM === "number" ? value.heightM : undefined,
    timeFactor: num(value.timeFactor, DEFAULT_VEHICLE.timeFactor),
    windingFactor: num(value.windingFactor, DEFAULT_VEHICLE.windingFactor),
    maxComfortableDriveHours: num(value.maxComfortableDriveHours, DEFAULT_VEHICLE.maxComfortableDriveHours),
    notes: typeof value.notes === "string" ? value.notes : undefined,
    restrictedRoads: Array.isArray(value.restrictedRoads)
      ? (value.restrictedRoads.filter(isRecord) as Vehicle["restrictedRoads"])
      : undefined,
  };
}

function parsePlan(value: unknown): TripPlan {
  if (!isRecord(value) || !Array.isArray(value.days)) return { days: [] };
  return {
    days: value.days.filter(isRecord).map((day) => ({
      date: typeof day.date === "string" ? day.date : "",
      stops: Array.isArray(day.stops)
        ? day.stops.filter(isRecord).map(
            (stop): PlanStop => ({
              placeId: String(stop.placeId ?? ""),
              overnight: stop.overnight === true ? true : undefined,
              notes: typeof stop.notes === "string" ? stop.notes : undefined,
              activities: Array.isArray(stop.activities) ? stop.activities.map(String) : undefined,
            }),
          )
        : [],
    })),
  };
}

/** Valide un `trip.json` (dépôt privé, import) et complète les champs optionnels. */
export function validateTripConfig(value: unknown): TripConfig {
  if (!isRecord(value)) throw new Error("Voyage invalide : objet attendu.");
  if (typeof value.id !== "string" || !value.id) throw new Error("Voyage invalide : « id » manquant.");
  if (typeof value.name !== "string" || !value.name) throw new Error("Voyage invalide : « name » manquant.");
  const start = parseMilestone(value.start, "start");
  const end = parseMilestone(value.end, "end");
  if (end.date < start.date) throw new Error("Voyage invalide : la fin précède le début.");
  return {
    id: value.id,
    schemaVersion: 1,
    name: value.name,
    regionId: typeof value.regionId === "string" && value.regionId ? value.regionId : DEFAULT_REGION_ID,
    start,
    end,
    arrival: value.arrival ? parseMilestone(value.arrival, "arrival") : undefined,
    vehicle: parseVehicle(value.vehicle),
    stays: Array.isArray(value.stays) ? (value.stays.filter(isRecord) as unknown as CatalogPlace[]) : [],
    plan: parsePlan(value.plan),
  };
}

export function isTripConfig(value: unknown): value is TripConfig {
  try {
    validateTripConfig(value);
    return true;
  } catch {
    return false;
  }
}

export function tripDates(config: TripConfig): string[] {
  return eachDateInclusive(config.start.date, config.end.date);
}

/** Le plan (ordre des étapes, nuits) tel qu'il ressort du circuit affiché : sert à exporter un `trip.json`. */
export function planFromSnapshot(snapshot: TripSnapshot): TripPlan {
  return {
    days: snapshot.days.map((day) => ({
      date: day.date,
      stops: day.stopIds
        .map((id) => snapshot.stops[id])
        .filter((stop): stop is Stop => Boolean(stop))
        .map((stop) => {
          const plan: PlanStop = { placeId: stop.placeId };
          if (stop.isOvernight || day.overnightStopId === stop.id) plan.overnight = true;
          if (stop.notes) plan.notes = stop.notes;
          if (stop.activities?.length) plan.activities = stop.activities.map((a) => a.text);
          return plan;
        }),
    })),
  };
}

/** Hébergements du circuit : toute étape « camp » devient un séjour (le catalogue public n'en a pas). */
export function staysFromSnapshot(snapshot: TripSnapshot): CatalogPlace[] {
  const seen = new Set<string>();
  const stays: CatalogPlace[] = [];
  for (const stop of Object.values(snapshot.stops)) {
    if (stop.kind !== "camp" || seen.has(stop.placeId)) continue;
    seen.add(stop.placeId);
    stays.push({
      id: stop.placeId,
      name: stop.name,
      lng: stop.lng,
      lat: stop.lat,
      region: "",
      area: stop.area,
      category: typeof stop.meta?.category === "string" ? stop.meta.category : "campsite",
      notes: stop.notes,
      warning: stop.warning,
    });
  }
  return stays;
}

/**
 * Reconstruit un voyage à partir d'un circuit qui n'en porte pas (sauvegarde v1).
 * Les dates viennent des jours, le départ de la première étape, le reste est générique.
 */
export function configFromSnapshot(
  snapshot: TripSnapshot,
  options: { name?: string; regionId?: string; vehicle?: Vehicle; id?: string } = {},
): TripConfig | null {
  const days = snapshot.days.filter((day) => ISO_DATE.test(day.date));
  if (days.length === 0) return null;
  const firstStop = days
    .flatMap((day) => day.stopIds)
    .map((id) => snapshot.stops[id])
    .find((stop): stop is Stop => Boolean(stop));
  if (!firstStop) return null;

  const lastDay = days[days.length - 1];
  const lastId = lastDay.overnightStopId ?? lastDay.stopIds[lastDay.stopIds.length - 1];
  const lastStop = (lastId && snapshot.stops[lastId]) || firstStop;
  const name = options.name?.trim() || "Voyage importé";

  return {
    id: options.id ?? `trip-${slugify(name)}-${days[0].date}`,
    schemaVersion: 1,
    name,
    regionId: options.regionId ?? DEFAULT_REGION_ID,
    start: { placeId: firstStop.placeId, date: days[0].date, notes: firstStop.notes },
    end: { placeId: lastStop.placeId, date: lastDay.date },
    vehicle: options.vehicle ?? { ...DEFAULT_VEHICLE },
    stays: staysFromSnapshot(snapshot),
    plan: planFromSnapshot(snapshot),
  };
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "voyage";
}
