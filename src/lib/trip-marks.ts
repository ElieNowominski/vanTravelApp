import { newId } from "@/lib/geo";
import type { TripMark } from "@/lib/types";

export function normalizeMarks(value: unknown): TripMark[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Partial<TripMark>;
    if (raw.kind !== "plus" && raw.kind !== "minus") return [];
    if (typeof raw.text !== "string" || !raw.text.trim()) return [];
    return [
      {
        id: typeof raw.id === "string" && raw.id ? raw.id : newId("mark"),
        kind: raw.kind,
        text: raw.text.trim(),
      },
    ];
  });
}
