import { DEFAULT_VEHICLE } from "@/lib/constants";
import type { SavedTrip } from "@/lib/types";
import { selectedOption, dayStats } from "@/store/trip-store";

export type DriveDay = {
  dayIndex: number;
  label: string;
  driveSec: number;
  km: number;
};

export type CompareStats = {
  km: number;
  driveSec: number;
  nights: number;
  longDays: number;
  stopCount: number;
  overnights: Array<{ dayIndex: number; label: string; name: string | null }>;
  minDriveDay: DriveDay | null;
  maxDriveDay: DriveDay | null;
};

export function compareStats(trip: SavedTrip): CompareStats {
  let km = 0;
  let driveSec = 0;
  let nights = 0;
  let longDays = 0;
  let stopCount = 0;
  let minDriveDay: DriveDay | null = null;
  let maxDriveDay: DriveDay | null = null;
  const overnights = trip.days.map((day, index) => {
    const stats = dayStats(trip, index);
    km += stats.km;
    driveSec += stats.driveSec;
    stopCount += stats.stopCount;
    if (stats.overnight) nights += 1;
    const maxHours = trip.config?.vehicle.maxComfortableDriveHours ?? DEFAULT_VEHICLE.maxComfortableDriveHours;
    if (stats.driveSec / 3600 > maxHours) longDays += 1;
    const used = stats.stopCount > 0 || Boolean(stats.overnight);
    if (used) {
      const driveDay: DriveDay = {
        dayIndex: index,
        label: `${day.weekday} ${day.label}`,
        driveSec: stats.driveSec,
        km: stats.km,
      };
      if (!minDriveDay || stats.driveSec < minDriveDay.driveSec) minDriveDay = driveDay;
      if (!maxDriveDay || stats.driveSec > maxDriveDay.driveSec) maxDriveDay = driveDay;
    }
    return {
      dayIndex: index,
      label: `${day.weekday} ${day.label}`,
      name: stats.overnight?.name ?? null,
    };
  });
  return { km, driveSec, nights, longDays, stopCount, overnights, minDriveDay, maxDriveDay };
}

export function tripRouteFeatures(
  trip: SavedTrip,
  color: string,
  tripIndex: number,
): { lines: GeoJSON.Feature[]; points: GeoJSON.Feature[] } {
  const lines: GeoJSON.Feature[] = [];
  const points: GeoJSON.Feature[] = [];
  let seq = 0;
  trip.days.forEach((day, dayIndex) => {
    for (const stopId of day.stopIds) {
      const stop = trip.stops[stopId];
      if (!stop) continue;
      seq += 1;
      const overnight = stop.isOvernight || day.overnightStopId === stopId;
      points.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [stop.lng, stop.lat] },
        properties: {
          seq,
          name: stop.name,
          overnight: overnight ? 1 : 0,
          color,
          tripIndex,
          tripName: trip.name,
          dayLabel: `${day.weekday} ${day.label}`,
        },
      });
    }
    for (const leg of trip.legs.filter((item) => item.dayIndex === dayIndex)) {
      const option = selectedOption(leg);
      if (!option) continue;
      lines.push({
        type: "Feature",
        geometry: option.geometry,
        properties: { color, tripIndex, tripName: trip.name, dayIndex },
      });
    }
  });
  return { lines, points };
}

export function boundsFromFeatures(features: GeoJSON.Feature[]): [[number, number], [number, number]] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const visit = (lng: number, lat: number) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  };
  for (const feature of features) {
    const geom = feature.geometry;
    if (geom.type === "Point") {
      visit(geom.coordinates[0], geom.coordinates[1]);
    } else if (geom.type === "LineString") {
      for (const coord of geom.coordinates) visit(coord[0], coord[1]);
    }
  }
  if (!Number.isFinite(minLng)) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}
