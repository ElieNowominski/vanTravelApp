/**
 * Les dates du voyage sont des dates calendaires (« le 7 février »), sans heure.
 * On les formate en UTC à midi pour ne dépendre d'aucun fuseau.
 */
function calendarDate(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00Z`);
}

export function formatDuration(totalSec: number): string {
  const minutes = Math.max(1, Math.round(totalSec / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m.toString().padStart(2, "0")}`;
}

export function formatKm(km: number): string {
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function isRestDay(km: number, sec: number): boolean {
  return km < 0.5 && sec < 120;
}

export function formatDayDrive(km: number, sec: number): string {
  if (isRestDay(km, sec)) return "sur place";
  return `${formatKm(km)}  ·  ${formatDuration(sec)}`;
}

export function formatDayLabel(isoDate: string): { weekday: string; label: string } {
  const date = calendarDate(isoDate);
  const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" }).format(date);
  const label = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
  return { weekday: capitalize(weekday.replace(".", "")), label };
}

/** « 6 févr. » */
export function formatShortDay(isoDate: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    calendarDate(isoDate),
  );
}

/** « 7–19 févr. 2027 » ou « 28 janv. – 12 févr. 2027 ». */
export function formatDateRange(startIso: string, endIso: string): string {
  const start = calendarDate(startIso);
  const end = calendarDate(endIso);
  const sameMonth = startIso.slice(0, 7) === endIso.slice(0, 7);
  const endLabel = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(end);
  if (sameMonth) {
    const startDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", timeZone: "UTC" }).format(start);
    return `${startDay}–${endLabel}`;
  }
  const startLabel = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(start);
  return `${startLabel} – ${endLabel}`;
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function eachDateInclusive(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const current = new Date(`${startIso}T12:00:00Z`);
  const end = new Date(`${endIso}T12:00:00Z`);
  if (Number.isNaN(current.getTime()) || Number.isNaN(end.getTime())) return out;
  while (current.getTime() <= end.getTime()) {
    out.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return out;
}
