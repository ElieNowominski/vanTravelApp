import { haversineKm } from "@/lib/geo";
import { selectedOption } from "@/lib/legs";
import { hashString } from "@/lib/sync-model";
import type { Leg, PlaceInput } from "@/lib/types";

/**
 * Points d'intérêt OSM à la demande (lot 5) : campings, aires de camping-car, vidanges, points d'eau,
 * lus sur Overpass. Logique pure : requêtes, lecture des réponses, grille du cache de la carte, couloir
 * le long du tracé figé, distances au tracé. Le réseau et le cache IndexedDB vivent dans `src/services/overpass.ts`.
 *
 * Politique d'usage d'Overpass (wiki OSM, vérifiée le 3 nov. 2026) : pour un usage régulier ou une app,
 * moins de 100 requêtes et 10 Mo par jour, tous utilisateurs confondus ; pause de 30 s après un 429 ;
 * cache et une requête à la fois. D'où un zoom minimal, une grille mise en cache et un plafond `poi` bas.
 */
export type PoiCategory = "camping" | "aire" | "vidange" | "eau";

export type Poi = {
  /** `osm:n123`, `osm:w456`, `osm:r789` : même forme que les lieux de la recherche Photon. */
  id: string;
  name: string;
  category: PoiCategory;
  lng: number;
  lat: number;
  /** Étiquettes OSM utiles à la popup et aux équipements (voir `POI_TAGS`), le reste est jeté. */
  tags: Record<string, string>;
};

export type Bounds = { west: number; south: number; east: number; north: number };

export const POI_CATEGORY_LABELS: Record<PoiCategory, string> = {
  camping: "Camping",
  aire: "Aire de camping-car",
  vidange: "Vidange",
  eau: "Point d'eau",
};

export const POI_CATEGORIES: PoiCategory[] = ["camping", "aire", "vidange", "eau"];

/** Point d'intérêt -> lieu ajoutable : même identifiant que la recherche Photon, catégorie dans `meta`. */
export function poiToPlaceInput(poi: Poi): PlaceInput {
  return {
    placeId: poi.id,
    name: poi.name,
    lng: poi.lng,
    lat: poi.lat,
    kind: poi.category === "camping" || poi.category === "aire" ? "camp" : "poi",
    meta: { source: "osm", category: POI_CATEGORY_LABELS[poi.category] },
  };
}

function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Recherche hors ligne dans les points d'intérêt gardés sur l'appareil (cases de la carte, couloir figé) :
 * noms qui commencent par la saisie d'abord, puis ceux qui la contiennent, sans accents ni casse. Les points
 * sans vrai nom (nommés d'après leur catégorie) ne sortent pas : « Point d'eau » ne désigne aucun lieu.
 */
export function searchPois(pois: Poi[], query: string, limit = 5): Poi[] {
  const q = foldText(query);
  if (q.length < 2) return [];
  const seen = new Set<string>();
  const starts: Poi[] = [];
  const contains: Poi[] = [];
  for (const poi of pois) {
    if (seen.has(poi.id) || poi.name === POI_CATEGORY_LABELS[poi.category]) continue;
    const name = foldText(poi.name);
    if (name.startsWith(q)) starts.push(poi);
    else if (name.includes(q)) contains.push(poi);
    else continue;
    seen.add(poi.id);
  }
  const byName = (a: Poi, b: Poi) => a.name.localeCompare(b.name, "fr");
  return [...starts.sort(byName), ...contains.sort(byName)].slice(0, limit);
}

/** Zoom à partir duquel la carte charge les points d'intérêt de la zone affichée. */
export const POI_MIN_ZOOM = 11;
/** Côté d'une case de la grille du cache, en degrés (environ 22 km en latitude). */
export const POI_CELL_DEG = 0.2;
/** Au-delà, la zone affichée est trop grande pour une requête (grand écran) : on demande de zoomer. */
export const POI_MAX_CELLS = 24;
/** Une case reste valable un mois : campings et points d'eau bougent peu. */
export const POI_CELL_TTL_MS = 30 * 24 * 3600 * 1000;
/** Demi-largeur du couloir mis en cache le long du tracé figé. */
export const CORRIDOR_RADIUS_M = 3000;
/**
 * Côté maximal, en cases, d'un rectangle de requête du couloir. Le couloir passe par des rectangles et non
 * par `around` sur une polyligne : cette forme a rendu 0 résultat le 3 nov. 2026 là où le rectangle en
 * rendait 24 (serveur saturé, non tranché), et le rectangle remplit aussi le cache de la carte.
 */
export const CORRIDOR_GROUP_SPAN = 4;
/** Plafond d'éléments par réponse, pour rester loin des 10 Mo par jour. */
export const POI_MAX_ELEMENTS = 800;
/** Écart minimal entre deux requêtes ; pause imposée après un 429 ou un 406. */
export const POI_MIN_INTERVAL_MS = 2000;
export const POI_BACKOFF_MS = 30_000;

/** Étiquettes gardées : nom, exploitant, site, équipements (`amenitiesFromOsm`), horaires, description. */
const POI_TAGS = [
  "name",
  "operator",
  "website",
  "url",
  "fee",
  "drinking_water",
  "water_point",
  "electricity",
  "power_supply",
  "toilets",
  "shower",
  "sanitary_dump_station",
  "opening_hours",
  "description",
  "tourism",
  "amenity",
] as const;

const FILTERS = [
  `["tourism"~"^(camp_site|caravan_site)$"]`,
  `["amenity"~"^(sanitary_dump_station|water_point|drinking_water)$"]`,
];

export function poiCategory(tags: Record<string, unknown>): PoiCategory | null {
  if (tags.tourism === "camp_site") return "camping";
  if (tags.tourism === "caravan_site") return "aire";
  if (tags.amenity === "sanitary_dump_station") return "vidange";
  if (tags.amenity === "water_point" || tags.amenity === "drinking_water") return "eau";
  return null;
}

const coord = (n: number) => Number(n.toFixed(5));

/** Requête sur un rectangle (zone affichée, ou union des cases manquantes). */
export function overpassBboxQuery(bounds: Bounds): string {
  const bbox = [bounds.south, bounds.west, bounds.north, bounds.east].map(coord).join(",");
  return `[out:json][timeout:25][bbox:${bbox}];(${FILTERS.map((f) => `nwr${f};`).join("")});out center tags ${POI_MAX_ELEMENTS};`;
}

const TYPE_LETTER: Record<string, string> = { node: "n", way: "w", relation: "r" };

/** Réponse Overpass (`out center tags`) -> points d'intérêt ; une forme inattendue donne une liste vide. */
export function parseOverpass(json: unknown): Poi[] {
  const elements = (json as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];
  const pois: Poi[] = [];
  for (const raw of elements) {
    const el = raw as { type?: string; id?: number; lat?: number; lon?: number; center?: { lat?: number; lon?: number }; tags?: Record<string, unknown> };
    const letter = TYPE_LETTER[el.type ?? ""];
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!letter || typeof el.id !== "number" || typeof lat !== "number" || typeof lng !== "number") continue;
    const allTags = el.tags ?? {};
    const category = poiCategory(allTags);
    if (!category) continue;
    const tags: Record<string, string> = {};
    for (const key of POI_TAGS) {
      const value = allTags[key];
      if (typeof value === "string" && value) tags[key] = value;
    }
    pois.push({
      id: `osm:${letter}${el.id}`,
      name: tags.name || tags.operator || POI_CATEGORY_LABELS[category],
      category,
      lng,
      lat,
      tags,
    });
  }
  return pois;
}

/** Fusion sans doublon (même élément OSM vu par deux requêtes) ; la dernière version gagne. */
/** Ligne d'état sous l'interrupteur du calque ; `null` quand tout va bien. */
export function viewportStatusText(result: { scope: "zoom" | "too-wide" | "area"; status: string; message?: string; count: number }): string | null {
  if (result.scope === "zoom") return "Zoomer davantage pour voir les points d'intérêt.";
  if (result.scope === "too-wide") return "Zone trop grande : zoomer pour charger les points d'intérêt.";
  if (result.status === "offline") return `Hors ligne : ${result.count} point${result.count > 1 ? "s" : ""} en cache sur cette zone.`;
  if (result.status !== "ok") return result.message ?? "Points d'intérêt indisponibles.";
  return null;
}

/** Position d'un point sur la route du jour : « km 34 · à 1,2 km du tracé ». */
export function routeCaption(item: { offKm: number; alongKm: number }): string {
  const off = item.offKm < 0.15 ? "au bord de la route" : `à ${item.offKm.toFixed(1).replace(".", ",")} km du tracé`;
  return `km ${Math.round(item.alongKm)} · ${off}`;
}

export function mergePois(...lists: Poi[][]): Poi[] {
  const byId = new Map<string, Poi>();
  for (const list of lists) for (const poi of list) byId.set(poi.id, poi);
  return [...byId.values()];
}

export function poisToGeoJSON(pois: Poi[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: pois.map((poi) => ({
      type: "Feature",
      id: poi.id,
      geometry: { type: "Point", coordinates: [poi.lng, poi.lat] },
      // `poiCategory` et non `category`, déjà pris par le catalogue (« interdit-locateur »).
      properties: { ...poi.tags, id: poi.id, name: poi.name, poiCategory: poi.category, source: "OSM" },
    })),
  };
}

// --- Grille du cache de la carte ------------------------------------------------------------------

/** Case de la grille : `i:j`, colonnes depuis -180, lignes depuis -90. */
export function cellKey(i: number, j: number): string {
  return `${i}:${j}`;
}

export function cellOf(lng: number, lat: number): string {
  return cellKey(Math.floor((lng + 180) / POI_CELL_DEG), Math.floor((lat + 90) / POI_CELL_DEG));
}

export function cellBounds(key: string): Bounds {
  const [i, j] = key.split(":").map(Number);
  const west = i * POI_CELL_DEG - 180;
  const south = j * POI_CELL_DEG - 90;
  return { west, south, east: west + POI_CELL_DEG, north: south + POI_CELL_DEG };
}

export function cellsForBounds(bounds: Bounds): string[] {
  const clampLat = (v: number) => Math.max(-89.999, Math.min(89.999, v));
  const clampLng = (v: number) => Math.max(-179.999, Math.min(179.999, v));
  const i0 = Math.floor((clampLng(bounds.west) + 180) / POI_CELL_DEG);
  const i1 = Math.floor((clampLng(bounds.east) + 180) / POI_CELL_DEG);
  const j0 = Math.floor((clampLat(bounds.south) + 90) / POI_CELL_DEG);
  const j1 = Math.floor((clampLat(bounds.north) + 90) / POI_CELL_DEG);
  const keys: string[] = [];
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) keys.push(cellKey(i, j));
  return keys;
}

/**
 * Cases entièrement couvertes par un rectangle aligné sur la grille (`boundsOfCells`). Sans le retrait,
 * l'arrondi des bords (10,000000000000014) ferait entrer les cases voisines, mises en cache vides à tort.
 */
export function cellsCoveredBy(bounds: Bounds): string[] {
  const inset = POI_CELL_DEG / 10;
  return cellsForBounds({ west: bounds.west + inset, south: bounds.south + inset, east: bounds.east - inset, north: bounds.north - inset });
}

export function boundsOfCells(keys: string[]): Bounds {
  const all = keys.map(cellBounds);
  return {
    west: Math.min(...all.map((b) => b.west)),
    south: Math.min(...all.map((b) => b.south)),
    east: Math.max(...all.map((b) => b.east)),
    north: Math.max(...all.map((b) => b.north)),
  };
}

export type ViewportPlan =
  | { status: "zoom" }
  | { status: "too-wide"; cells: number }
  | { status: "cached"; cells: string[] }
  | { status: "fetch"; cells: string[]; missing: string[]; bounds: Bounds };

/**
 * Que faire pour la zone affichée : rien sous le zoom minimal ou sur une zone trop grande, lire le cache
 * si toutes les cases sont fraîches, sinon une seule requête sur le rectangle des cases manquantes.
 */
export function planViewport(bounds: Bounds, zoom: number, fresh: (key: string) => boolean): ViewportPlan {
  if (zoom < POI_MIN_ZOOM) return { status: "zoom" };
  const cells = cellsForBounds(bounds);
  if (cells.length > POI_MAX_CELLS) return { status: "too-wide", cells: cells.length };
  const missing = cells.filter((key) => !fresh(key));
  if (missing.length === 0) return { status: "cached", cells };
  return { status: "fetch", cells, missing, bounds: boundsOfCells(missing) };
}

/** Répartit une réponse dans les cases demandées ; une case sans résultat est mise en cache vide. */
export function splitByCell(pois: Poi[], cells: string[]): Map<string, Poi[]> {
  const out = new Map<string, Poi[]>(cells.map((key) => [key, []]));
  for (const poi of pois) out.get(cellOf(poi.lng, poi.lat))?.push(poi);
  return out;
}

export function isCellFresh(fetchedAt: number | undefined, now: number): boolean {
  return typeof fetchedAt === "number" && now - fetchedAt < POI_CELL_TTL_MS;
}

/** Attente avant la prochaine requête : écart minimal, ou fin de la pause imposée par le serveur. */
export function poiWait(lastRequestAt: number | null, pausedUntil: number | null, now: number): number {
  const gap = lastRequestAt == null ? 0 : lastRequestAt + POI_MIN_INTERVAL_MS - now;
  const pause = pausedUntil == null ? 0 : pausedUntil - now;
  return Math.max(0, gap, pause);
}


// --- Couloir le long du tracé ---------------------------------------------------------------------

type Xy = [number, number];

/** Projection locale équirectangulaire en kilomètres, suffisante sur quelques centaines de kilomètres. */
function projector(lat0: number) {
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110.574;
  return ([lng, lat]: GeoJSON.Position): Xy => [lng * kx, lat * ky];
}

function segmentDistance(p: Xy, a: Xy, b: Xy): { dist: number; t: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  const x = a[0] + t * dx - p[0];
  const y = a[1] + t * dy - p[1];
  return { dist: Math.hypot(x, y), t };
}

/** Douglas-Peucker, tolérance en kilomètres ; garde toujours le premier et le dernier point. */
export function simplifyLine(line: GeoJSON.Position[], toleranceKm: number): GeoJSON.Position[] {
  if (line.length <= 2) return line.slice();
  const project = projector(line[0][1]);
  const pts = line.map(project);
  const keep = new Uint8Array(line.length);
  keep[0] = 1;
  keep[line.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, line.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let worst = -1;
    let worstDist = 0;
    for (let k = first + 1; k < last; k++) {
      const { dist } = segmentDistance(pts[k], pts[first], pts[last]);
      if (dist > worstDist) {
        worstDist = dist;
        worst = k;
      }
    }
    if (worst > 0 && worstDist > toleranceKm) {
      keep[worst] = 1;
      stack.push([first, worst], [worst, last]);
    }
  }
  return line.filter((_, k) => keep[k] === 1);
}

/** Tracé routier d'un jour : tronçons avec tracé, bout à bout. Train, ferry, vélo et marche n'en ont pas. */
export function dayTrackLine(legs: Leg[], dayIndex: number): GeoJSON.Position[] {
  const line: GeoJSON.Position[] = [];
  for (const leg of legs) {
    if (leg.dayIndex !== dayIndex || leg.track === "aucun") continue;
    const coords = selectedOption(leg)?.geometry.coordinates ?? [];
    line.push(...coords);
  }
  return line;
}

/** Cases de la grille à moins de `radiusKm` d'une ligne, dans l'ordre de la route (points tous les 2 km). */
export function cellsAlongLine(line: GeoJSON.Position[], radiusKm = CORRIDOR_RADIUS_M / 1000): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const visit = (lng: number, lat: number) => {
    const dLat = radiusKm / 110.574;
    const dLng = radiusKm / (111.32 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
    for (const key of cellsForBounds({ west: lng - dLng, south: lat - dLat, east: lng + dLng, north: lat + dLat })) {
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(key);
      }
    }
  };
  for (let k = 0; k < line.length; k++) {
    const [lng, lat] = line[k];
    visit(lng, lat);
    const next = line[k + 1];
    if (!next) continue;
    const steps = Math.floor(haversineKm({ lng, lat }, { lng: next[0], lat: next[1] }) / 2);
    for (let s = 1; s <= steps; s++) {
      const t = s / (steps + 1);
      visit(lng + (next[0] - lng) * t, lat + (next[1] - lat) * t);
    }
  }
  return ordered;
}

/**
 * Regroupe des cases (dans l'ordre de la route) en rectangles d'au plus `maxSpan` cases de côté : une requête
 * par rectangle. Chaque groupe rend toutes les cases de son rectangle, pour les remettre dans le cache.
 */
export function groupCells(ordered: string[], maxSpan = CORRIDOR_GROUP_SPAN): string[][] {
  const groups: string[][] = [];
  let box: { i0: number; i1: number; j0: number; j1: number } | null = null;
  let current: string[] = [];
  for (const key of ordered) {
    const [i, j] = key.split(":").map(Number);
    const next: { i0: number; i1: number; j0: number; j1: number } = box
      ? { i0: Math.min(box.i0, i), i1: Math.max(box.i1, i), j0: Math.min(box.j0, j), j1: Math.max(box.j1, j) }
      : { i0: i, i1: i, j0: j, j1: j };
    if (box && (next.i1 - next.i0 >= maxSpan || next.j1 - next.j0 >= maxSpan)) {
      groups.push(current);
      current = [key];
      box = { i0: i, i1: i, j0: j, j1: j };
    } else {
      current.push(key);
      box = next;
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

export type CorridorPlan = {
  /** Change quand un tracé change, pour savoir si le cache est à refaire. */
  signature: string;
  /** Tracé de chaque jour qui roule, simplifié à 200 m. */
  lines: GeoJSON.Position[][];
  /** Une requête par groupe, sur le rectangle de ses cases. */
  groups: string[][];
};

/** Couloir d'un itinéraire figé : cases le long des tracés routiers, regroupées en requêtes. */
export function planCorridor(legs: Leg[], dayCount: number, radiusKm = CORRIDOR_RADIUS_M / 1000): CorridorPlan {
  const lines: GeoJSON.Position[][] = [];
  for (let dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    const line = dayTrackLine(legs, dayIndex);
    if (line.length >= 2) lines.push(simplifyLine(line, 0.2));
  }
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const line of lines) {
    for (const key of cellsAlongLine(line, radiusKm)) {
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(key);
      }
    }
  }
  const groups = groupCells(ordered);
  return { signature: hashString(JSON.stringify(groups)), lines, groups };
}

/** Rectangle d'un groupe de cases : la requête et les cases qu'elle couvre entièrement. */
export function groupRequest(group: string[]): { bounds: Bounds; cells: string[] } {
  const bounds = boundsOfCells(group);
  return { bounds, cells: cellsCoveredBy(bounds) };
}

export type PoiOnRoute = { poi: Poi; offKm: number; alongKm: number };

/** Distance au tracé et position le long du tracé (km depuis le départ du jour). */
export function locateOnLine(point: { lng: number; lat: number }, line: GeoJSON.Position[]): { offKm: number; alongKm: number } | null {
  if (line.length < 2) return null;
  const project = projector(line[0][1]);
  const p = project([point.lng, point.lat]);
  const pts = line.map(project);
  let best = { offKm: Infinity, alongKm: 0 };
  let walked = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const { dist, t } = segmentDistance(p, a, b);
    if (dist < best.offKm) best = { offKm: dist, alongKm: walked + t * len };
    walked += len;
  }
  return best;
}

/** Ne garde que les points à moins de `radiusKm` d'un des tracés : c'est ce que le couloir stocke. */
export function withinCorridor(pois: Poi[], lines: GeoJSON.Position[][], radiusKm = CORRIDOR_RADIUS_M / 1000): Poi[] {
  return pois.filter((poi) => lines.some((line) => (locateOnLine(poi, line)?.offKm ?? Infinity) <= radiusKm));
}

/**
 * Points d'intérêt du jour, dans l'ordre de la route : au plus `perCategory` par catégorie, à moins de
 * `maxOffKm` du tracé. Sert à Voyager, hors ligne, depuis le cache du couloir.
 */
export function poisAlongLine(pois: Poi[], line: GeoJSON.Position[], maxOffKm = CORRIDOR_RADIUS_M / 1000, perCategory = 3): PoiOnRoute[] {
  const located: PoiOnRoute[] = [];
  for (const poi of pois) {
    const where = locateOnLine(poi, line);
    if (where && where.offKm <= maxOffKm) located.push({ poi, ...where });
  }
  located.sort((a, b) => a.alongKm - b.alongKm);
  const counts = new Map<PoiCategory, number>();
  return located.filter(({ poi }) => {
    const n = counts.get(poi.category) ?? 0;
    counts.set(poi.category, n + 1);
    return n < perCategory;
  });
}
