import { newId } from "@/lib/geo";
import type { Stop, StopActivity } from "@/lib/types";

export function normalizeActivities(value: unknown): StopActivity[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Partial<StopActivity>;
    if (typeof raw.text !== "string" || !raw.text.trim()) return [];
    return [
      {
        id: typeof raw.id === "string" && raw.id ? raw.id : newId("act"),
        text: raw.text.trim(),
      },
    ];
  });
}

export function normalizeStops(stops: Record<string, Stop> | undefined): Record<string, Stop> {
  if (!stops) return {};
  const next: Record<string, Stop> = {};
  for (const [id, stop] of Object.entries(stops)) {
    if (!stop) continue;
    next[id] = { ...stop, activities: normalizeActivities(stop.activities) };
  }
  return next;
}
