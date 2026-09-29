import type { CatalogPlace, Stop, TripConfig } from "@/lib/types";

export function stayById(config: TripConfig | null | undefined, id: string): CatalogPlace | null {
  return config?.stays.find((stay) => stay.id === id) ?? null;
}

export function overnightCaption(stop: Pick<Stop, "name" | "area"> | null | undefined): string {
  if (!stop) return "Nuit non posée";
  return stop.area ? `${stop.name} (${stop.area})` : stop.name;
}

export function catalogKindLabel(kind: string, category?: string): string {
  if (kind === "town") return "Ville";
  if (kind === "camp") {
    if (category === "lodge") return "Lodge";
    if (category === "doc") return "Camping DOC";
    if (category === "holiday-park") return "Holiday park";
    return "Camping";
  }
  return "Spot";
}
