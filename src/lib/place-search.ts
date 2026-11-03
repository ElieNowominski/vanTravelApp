import type { PlaceInput, PlaceKind, TripSnapshot } from "@/lib/types";

/**
 * Recherche de lieux sur OpenStreetMap par Photon (lot 3, ADR 0004) : construction des requêtes et lecture
 * des réponses. Le Nominatim public interdit l'autocomplétion pendant la frappe ; le serveur public de Photon
 * l'accepte « dans une limite raisonnable » (https://photon.komoot.io), d'où l'attente de fin de frappe,
 * le cache et l'écart minimal entre deux requêtes côté service (`src/services/place-search.ts`).
 */
export const PHOTON_URL = "https://photon.komoot.io";

/** En dessous, une requête ramène surtout du bruit et coûte une unité du plafond. */
export const MIN_QUERY_LENGTH = 3;

/** Attente après la dernière frappe avant d'interroger Photon. */
export const SEARCH_DEBOUNCE_MS = 450;

/** Écart minimal entre deux requêtes vers Photon, comme pour OSRM (règle 8). */
export const MIN_REQUEST_INTERVAL_MS = 1000;

export const SEARCH_LIMIT = 8;

type Point = { lng: number; lat: number };

/** Lieu trouvé, prêt à devenir une étape ou un repère du voyage. */
export type PlaceResult = {
  /** `osm:<type><id>` (ex. `osm:R404159`), stable d'une recherche à l'autre. */
  placeId: string;
  name: string;
  lng: number;
  lat: number;
  kind: PlaceKind;
  /** Libellé du type en français (« Ville », « Camping »), absent pour un type sans libellé. */
  category?: string;
  /** Localisation lisible : commune, région, pays. */
  area?: string;
  countryCode?: string;
};

/** Clé de cache : la même recherche à la casse et aux espaces près ne repart pas vers Photon. */
export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isSearchable(query: string): boolean {
  return normalizeQuery(query).length >= MIN_QUERY_LENGTH;
}

export type SearchOptions = {
  /** Point autour duquel les résultats proches passent devant (étape en cours, départ). */
  bias?: Point | null;
  limit?: number;
  lang?: string;
};

const coord = (value: number) => value.toFixed(5);

export function photonSearchUrl(query: string, options: SearchOptions = {}): string {
  const params = new URLSearchParams({
    q: query.trim().replace(/\s+/g, " "),
    limit: String(options.limit ?? SEARCH_LIMIT),
    lang: options.lang ?? "fr",
  });
  if (options.bias) {
    params.set("lat", coord(options.bias.lat));
    params.set("lon", coord(options.bias.lng));
    // Zoom 7 : les lieux à quelques centaines de kilomètres passent devant, sans masquer une ville lointaine.
    params.set("zoom", "7");
  }
  return `${PHOTON_URL}/api/?${params.toString()}`;
}

export function photonReverseUrl(point: Point, lang = "fr"): string {
  const params = new URLSearchParams({ lat: coord(point.lat), lon: coord(point.lng), limit: "1", lang });
  return `${PHOTON_URL}/reverse?${params.toString()}`;
}

const CATEGORY_LABELS: Record<string, string> = {
  "place:city": "Ville",
  "place:town": "Ville",
  "place:municipality": "Commune",
  "place:village": "Village",
  "place:hamlet": "Hameau",
  "place:suburb": "Quartier",
  "place:neighbourhood": "Quartier",
  "place:quarter": "Quartier",
  "place:locality": "Lieu-dit",
  "place:island": "Île",
  "place:islet": "Île",
  "place:county": "Région",
  "place:state": "Région",
  "place:region": "Région",
  "place:country": "Pays",
  "tourism:camp_site": "Camping",
  "tourism:caravan_site": "Aire de camping-cars",
  "tourism:viewpoint": "Point de vue",
  "tourism:attraction": "Site touristique",
  "tourism:museum": "Musée",
  "tourism:hotel": "Hôtel",
  "tourism:hostel": "Auberge",
  "tourism:guest_house": "Chambre d'hôtes",
  "tourism:alpine_hut": "Refuge",
  "tourism:wilderness_hut": "Refuge",
  "tourism:information": "Information",
  "railway:station": "Gare",
  "railway:halt": "Gare",
  "public_transport:station": "Gare",
  "amenity:ferry_terminal": "Port de ferry",
  "amenity:parking": "Parking",
  "amenity:fuel": "Station-service",
  "amenity:sanitary_dump_station": "Vidange",
  "amenity:drinking_water": "Point d'eau",
  "aeroway:aerodrome": "Aéroport",
  "natural:peak": "Sommet",
  "natural:beach": "Plage",
  "natural:water": "Lac",
  "natural:glacier": "Glacier",
  "waterway:waterfall": "Cascade",
  "leisure:park": "Parc",
  "leisure:nature_reserve": "Réserve naturelle",
  "boundary:national_park": "Parc national",
  "boundary:protected_area": "Espace protégé",
};

/** Type OSM -> type d'étape de l'app : une localité, un camping, ou un point d'intérêt. */
export function photonKind(osmKey: string, osmValue: string): PlaceKind {
  if (osmKey === "place") return "town";
  if (osmKey === "tourism" && (osmValue === "camp_site" || osmValue === "caravan_site")) return "camp";
  return "poi";
}

export function photonCategory(osmKey: string, osmValue: string): string | undefined {
  return CATEGORY_LABELS[`${osmKey}:${osmValue}`] ?? (osmKey === "highway" ? "Route" : undefined);
}

type PhotonProperties = Record<string, unknown>;

const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);

/** Commune, région et pays, sans répéter le nom du lieu. */
export function photonArea(props: PhotonProperties, name: string): string | undefined {
  const parts: string[] = [];
  for (const value of [text(props.city) ?? text(props.locality) ?? text(props.district), text(props.state) ?? text(props.county), text(props.country)]) {
    if (value && value !== name && !parts.includes(value)) parts.push(value);
  }
  return parts.length ? parts.join(", ") : undefined;
}

/** Nom affichable : le nom OSM, sinon l'adresse (résultat de recherche inversée sur un bâtiment ou une rue). */
function photonName(props: PhotonProperties): string | undefined {
  const name = text(props.name);
  if (name) return name;
  const street = text(props.street);
  if (street) return [text(props.housenumber), street].filter(Boolean).join(" ");
  return text(props.city) ?? text(props.locality);
}

/** Réponse GeoJSON de Photon -> lieux ; les entrées sans nom ni coordonnées sont ignorées, les doublons aussi. */
export function parsePhotonResults(data: unknown): PlaceResult[] {
  const features = (data && typeof data === "object" ? (data as { features?: unknown }).features : null) ?? [];
  if (!Array.isArray(features)) return [];
  const results: PlaceResult[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    const f = (feature ?? {}) as { geometry?: { type?: string; coordinates?: unknown }; properties?: PhotonProperties };
    const coords = f.geometry?.type === "Point" ? f.geometry.coordinates : null;
    if (!Array.isArray(coords) || typeof coords[0] !== "number" || typeof coords[1] !== "number") continue;
    const [lng, lat] = coords as [number, number];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const props = f.properties ?? {};
    const name = photonName(props);
    if (!name) continue;
    const osmKey = text(props.osm_key) ?? "";
    const osmValue = text(props.osm_value) ?? "";
    const osmType = text(props.osm_type) ?? "";
    const osmId = typeof props.osm_id === "number" || typeof props.osm_id === "string" ? String(props.osm_id) : "";
    const placeId = osmType && osmId ? `osm:${osmType}${osmId}` : `osm:${lng.toFixed(5)},${lat.toFixed(5)}`;
    const key = `${name.toLowerCase()}|${lng.toFixed(3)}|${lat.toFixed(3)}`;
    if (seen.has(placeId) || seen.has(key)) continue;
    seen.add(placeId);
    seen.add(key);
    const result: PlaceResult = { placeId, name, lng, lat, kind: photonKind(osmKey, osmValue) };
    const category = photonCategory(osmKey, osmValue);
    if (category) result.category = category;
    const area = photonArea(props, name);
    if (area) result.area = area;
    const countryCode = text(props.countrycode);
    if (countryCode) result.countryCode = countryCode.toUpperCase();
    results.push(result);
  }
  return results;
}

/** Ligne secondaire d'un résultat : « Camping · Odda, Vestland, Norvège ». */
export function resultCaption(result: Pick<PlaceResult, "category" | "area">): string {
  return [result.category, result.area].filter(Boolean).join(" · ");
}

/** Résultat -> étape : la source OSM et le type restent dans `meta` pour la fiche et les futurs points d'intérêt. */
export function resultToPlaceInput(result: PlaceResult): PlaceInput {
  return {
    placeId: result.placeId,
    name: result.name,
    lng: result.lng,
    lat: result.lat,
    kind: result.kind,
    ...(result.area ? { area: result.area } : {}),
    meta: { source: "osm", ...(result.category ? { category: result.category } : {}) },
  };
}

/** Attente avant la prochaine requête pour garder l'écart minimal avec la précédente. */
export function waitBeforeRequest(lastRequestAt: number | null, now: number, minIntervalMs = MIN_REQUEST_INTERVAL_MS): number {
  if (lastRequestAt == null) return 0;
  return Math.max(0, lastRequestAt + minIntervalMs - now);
}

/** Ligne d'une liste de résultats, qu'elle vienne du catalogue local ou d'OSM. */
export type PlaceOption = {
  key: string;
  name: string;
  caption: string;
  source: "catalogue" | "osm";
  input: PlaceInput;
};

export function optionFromResult(result: PlaceResult): PlaceOption {
  return { key: result.placeId, name: result.name, caption: resultCaption(result), source: "osm", input: resultToPlaceInput(result) };
}

/** Distance sous laquelle un résultat OSM du même nom qu'un lieu du catalogue est le même lieu. */
const SAME_PLACE_KM = 2;

function closeKm(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 111 * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLng);
}

/** Catalogue d'abord (hors ligne, notes et avertissements), puis OSM sans les lieux déjà listés. */
export function mergePlaceOptions(local: PlaceOption[], remote: PlaceOption[]): PlaceOption[] {
  const extra = remote.filter(
    (r) => !local.some((l) => l.name.toLowerCase() === r.name.toLowerCase() && closeKm(l.input, r.input) < SAME_PLACE_KM),
  );
  return [...local, ...extra];
}

/** Point de préférence de la recherche : dernière étape du jour en cours ou des jours précédents, sinon le départ. */
export function searchBias(
  snapshot: Pick<TripSnapshot, "days" | "stops">,
  dayIndex: number,
  start?: { lng?: number; lat?: number } | null,
): Point | null {
  for (let i = Math.min(dayIndex, snapshot.days.length - 1); i >= 0; i -= 1) {
    const ids = snapshot.days[i].stopIds;
    for (let j = ids.length - 1; j >= 0; j -= 1) {
      const stop = snapshot.stops[ids[j]];
      if (stop) return { lng: stop.lng, lat: stop.lat };
    }
  }
  return typeof start?.lng === "number" && typeof start?.lat === "number" ? { lng: start.lng, lat: start.lat } : null;
}
