import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import type { LayerKey, PlaceInput, PlaceKind } from "@/lib/types";

/**
 * Fond de carte vectoriel OpenFreeMap Liberty (lot 6, choisi le 4 nov. 2026 après le prototype de la branche
 * `proto/fond-vectoriel`). Ses tuiles OpenMapTiles portent les noms des lieux et tous les lieux d'OSM
 * (couche `poi`, à partir du zoom 14 seulement) : noms cliquables et calques superposés sans requête de plus.
 * Gratuit, sans clé ni limite de requêtes, sans garantie de service : repli sur les tuiles raster OSM.
 */
export const BASE_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
/** Source vectorielle du style Liberty. */
export const BASE_SOURCE = "openmaptiles";
/** Les tuiles n'ont les lieux (`poi`) qu'à partir de ce zoom ; en dessous, seulement les gares. */
export const BASE_POI_MIN_ZOOM = 14;

export type BaseOverlayKey = Extract<LayerKey, `base${string}`>;

type Expression = unknown[];

export type BaseOverlay = { key: BaseOverlayKey; label: string; hint: string; color: string; filter: Expression };

/** Calques superposés lus dans la couche `poi` des tuiles, une couleur par famille. */
export const BASE_OVERLAYS: BaseOverlay[] = [
  { key: "baseCamps", label: "Campings", hint: "Campings, aires", color: "#15803d", filter: ["==", ["get", "class"], "campsite"] },
  { key: "baseLodging", label: "Hébergements", hint: "Hôtels, auberges, chambres", color: "#7c3aed", filter: ["==", ["get", "class"], "lodging"] },
  {
    key: "baseFood",
    label: "Restos et cafés",
    hint: "Restaurants, cafés, bars",
    color: "#dc2626",
    filter: ["in", ["get", "class"], ["literal", ["restaurant", "fast_food", "cafe", "bar", "beer", "ice_cream"]]],
  },
  {
    key: "baseShops",
    label: "Courses",
    hint: "Supermarchés, épiceries, boulangeries",
    color: "#ea580c",
    filter: ["any", ["==", ["get", "class"], "grocery"], ["in", ["get", "subclass"], ["literal", ["convenience", "supermarket", "bakery"]]]],
  },
  { key: "baseFuel", label: "Carburant et recharge", hint: "Stations, bornes", color: "#0f172a", filter: ["==", ["get", "class"], "fuel"] },
  {
    key: "baseSights",
    label: "À voir",
    hint: "Points de vue, musées, monuments",
    color: "#ca8a04",
    filter: ["any", ["in", ["get", "class"], ["literal", ["attraction", "museum", "castle", "monument"]]], ["==", ["get", "subclass"], "gallery"]],
  },
  {
    key: "baseServices",
    label: "Toilettes et eau",
    hint: "Toilettes, points d'eau, douches",
    color: "#0284c7",
    filter: ["any", ["==", ["get", "class"], "toilets"], ["in", ["get", "subclass"], ["literal", ["drinking_water", "water_point", "shower"]]]],
  },
];

export const baseOverlayLayerId = (key: BaseOverlayKey) => `base-overlay-${key}`;
export const baseOverlayLabelId = (key: BaseOverlayKey) => `base-overlay-${key}-label`;

/** Calques de la carte des points superposés (cercles) et de leurs noms, pour la visibilité et la capture. */
export const BASE_OVERLAY_LAYER_IDS = BASE_OVERLAYS.flatMap((o) => [baseOverlayLayerId(o.key), baseOverlayLabelId(o.key)]);

/** Nom affiché : le nom français s'il existe, sinon le nom local (le style Liberty préférait l'anglais). */
export const LABEL_TEXT_FIELD: Expression = ["coalesce", ["get", "name:fr"], ["get", "name"], ["get", "name:latin"]];

/** Calques de noms qui deviennent cliquables : lieux habités et lieux (POI), pas les pays ni les régions. */
export function isClickableBaseLabel(layer: { id: string; type: string; "source-layer"?: string }): boolean {
  if (layer.type !== "symbol") return false;
  if (layer["source-layer"] !== "place" && layer["source-layer"] !== "poi") return false;
  return !/country|state/.test(layer.id);
}

/** Style Liberty adapté : noms en français puis en local sur les lieux, les lieux habités et les eaux. */
export function localizeBaseStyle(style: StyleSpecification): StyleSpecification {
  const localized = new Set(["place", "poi", "water_name", "aerodrome_label", "mountain_peak", "park"]);
  return {
    ...style,
    layers: style.layers.map((layer): LayerSpecification => {
      if (layer.type !== "symbol" || !("source-layer" in layer) || !localized.has(String(layer["source-layer"]))) return layer;
      if (!layer.layout?.["text-field"]) return layer;
      return { ...layer, layout: { ...layer.layout, "text-field": LABEL_TEXT_FIELD as never } };
    }),
  };
}

const PLACE_CLASS: Record<string, string> = {
  city: "Ville",
  town: "Ville",
  village: "Village",
  hamlet: "Hameau",
  suburb: "Quartier",
  quarter: "Quartier",
  neighbourhood: "Quartier",
  isolated_dwelling: "Lieu-dit",
  locality: "Lieu-dit",
  island: "Île",
};

const SUBCLASS_FR: Record<string, string> = {
  restaurant: "Restaurant",
  fast_food: "Restauration rapide",
  cafe: "Café",
  bar: "Bar",
  pub: "Pub",
  ice_cream: "Glacier",
  hotel: "Hôtel",
  hostel: "Auberge de jeunesse",
  motel: "Motel",
  guest_house: "Chambre d'hôtes",
  chalet: "Chalet",
  alpine_hut: "Refuge",
  camp_site: "Camping",
  caravan_site: "Aire de camping-car",
  supermarket: "Supermarché",
  convenience: "Épicerie",
  bakery: "Boulangerie",
  fuel: "Station-service",
  charging_station: "Borne de recharge",
  viewpoint: "Point de vue",
  attraction: "Attraction",
  museum: "Musée",
  gallery: "Galerie",
  castle: "Château",
  monument: "Monument",
  toilets: "Toilettes",
  drinking_water: "Eau potable",
  water_point: "Point d'eau",
  shower: "Douches",
  station: "Gare",
  halt: "Halte",
  ferry_terminal: "Terminal de ferry",
  bus_stop: "Arrêt de bus",
};

export type BasePlace = { title: string; subtitle: string; place: PlaceInput };

/**
 * Lieu touché sur le fond (nom ou point superposé) -> titre, sous-titre en français et étape à ajouter.
 * `sourceLayer` vaut `place` (lieu habité) ou `poi` (lieu). Rien sans coordonnées.
 */
export function describeBaseFeature(
  props: Record<string, unknown>,
  sourceLayer: string | undefined,
  point: { lng: number; lat: number },
): BasePlace {
  const str = (value: unknown) => (typeof value === "string" && value ? value : null);
  const name = str(props["name:fr"]) ?? str(props.name) ?? str(props["name:latin"]) ?? "Lieu";
  const isPlace = sourceLayer === "place";
  const cls = String(props.class ?? "");
  const subclass = String(props.subclass ?? "");
  const kindText = isPlace ? (PLACE_CLASS[cls] ?? "Lieu") : (SUBCLASS_FR[subclass] ?? SUBCLASS_FR[cls] ?? "Lieu");
  const kind: PlaceKind = isPlace ? "town" : cls === "campsite" ? "camp" : "poi";
  return {
    title: name,
    subtitle: `${kindText} · OpenStreetMap`,
    place: {
      placeId: `osm-fond:${point.lng.toFixed(5)},${point.lat.toFixed(5)}`,
      name,
      lng: point.lng,
      lat: point.lat,
      kind,
      meta: { source: "osm" },
    },
  };
}

/** Le candidat le plus proche du point touché (coordonnées écran), et non le premier trouvé dans la zone. */
export function nearestTo<T>(candidates: Array<{ item: T; x: number; y: number }>, x: number, y: number): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c.item;
    }
  }
  return best;
}
