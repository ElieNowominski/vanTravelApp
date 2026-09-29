import type { StyleSpecification } from "maplibre-gl";
import { absoluteAssetUrl } from "@/lib/base-url";
import type { Vehicle } from "@/lib/types";

export const MAP_MIN_ZOOM = 5;
export const MAP_MAX_ZOOM = 18;

/** Fond OSM raster. Usage interactif uniquement : pas de préchargement (politique OSM). */
export function buildMapStyle(): StyleSpecification {
  return {
    version: 8,
    name: "OSM roads",
    "font-faces": {
      "Noto Sans Regular": absoluteAssetUrl("fonts/NotoSans-Regular.ttf"),
      "Noto Sans Bold": absoluteAssetUrl("fonts/NotoSans-Bold.ttf"),
    },
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxzoom: 19,
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  } as StyleSpecification;
}

/** Véhicule générique quand le voyage n'en précise pas (voyage créé à la main, ancien circuit). */
export const DEFAULT_VEHICLE: Vehicle = {
  name: "Van",
  selfContained: true,
  timeFactor: 1.3,
  windingFactor: 1.15,
  maxComfortableDriveHours: 4,
};

/** Identifiant stable de l'étape de départ posée par le voyage. */
export const START_STOP_ID = "stop-start";

/** Une couleur par circuit comparé (pas par jour). */
export const COMPARE_COLORS = ["#0f766e", "#c2410c", "#4338ca"] as const;
export const COMPARE_MAX = 3;

export const DAY_COLORS = [
  "#e11d48",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0d9488",
  "#0284c7",
  "#4f46e5",
  "#9333ea",
  "#db2777",
  "#65a30d",
  "#0891b2",
  "#f43f5e",
  "#7c3aed",
];

export function dayColor(index: number) {
  return DAY_COLORS[index % DAY_COLORS.length];
}

export const STORAGE_KEY = "vantravel-trip-v2";
export const TRIP_LIBRARY_DB = "vantravel";
export const TRIP_LIBRARY_STORE = "saved-trips";
export const TRIP_LIBRARY_LS = "vantravel-trips-library-v2";

export const CUSTOM_CATEGORIES = [
  { id: "activite", label: "Activité" },
  { id: "rando", label: "Rando" },
  { id: "camping", label: "Camping / nuit" },
  { id: "vue", label: "Point de vue" },
  { id: "resto", label: "Resto / café" },
  { id: "autre", label: "Autre" },
] as const;
