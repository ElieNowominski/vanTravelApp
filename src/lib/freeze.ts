import type { Leg, TripSnapshot } from "@/lib/types";

/**
 * Itinéraire figé : une fois le circuit arrêté, chaque tronçon ne garde que la géométrie
 * retenue. Les alternatives OSRM (jusqu'à trois tracés complets par tronçon) pèsent
 * l'essentiel du stockage et n'ont plus d'usage en voyage.
 */
export function freezeLeg(leg: Leg): Leg {
  const selected = leg.options[leg.selectedIndex] ?? leg.options[0];
  return {
    ...leg,
    options: selected ? [selected] : [],
    selectedIndex: 0,
  };
}

export function freezeSnapshot<T extends TripSnapshot>(snapshot: T, now = new Date()): T {
  return {
    ...snapshot,
    legs: snapshot.legs.map(freezeLeg),
    frozenAt: now.toISOString(),
  };
}

/** Rouvre l'itinéraire à la planification. Les alternatives retirées ne reviennent pas. */
export function unfreezeSnapshot<T extends TripSnapshot>(snapshot: T): T {
  return { ...snapshot, frozenAt: null };
}

export function isFrozen(snapshot: Pick<TripSnapshot, "frozenAt"> | null | undefined): boolean {
  return typeof snapshot?.frozenAt === "string" && snapshot.frozenAt.length > 0;
}

/** Poids approximatif d'une valeur une fois sérialisée en JSON (octets UTF-8). */
export function jsonBytes(value: unknown): number {
  const text = JSON.stringify(value) ?? "";
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
  return text.length;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/** Nombre d'alternatives qui seraient retirées par le figeage. */
export function countDroppedOptions(legs: Leg[]): number {
  return legs.reduce((sum, leg) => sum + Math.max(0, leg.options.length - 1), 0);
}
