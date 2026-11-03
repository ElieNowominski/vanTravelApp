import tzlookup from "@photostructure/tz-lookup";
import { iso1A2Code } from "@rapideditor/country-coder";
import type { PlaceZone } from "@/lib/zone";

/**
 * Fuseau horaire et pays d'un point, sans réseau (Q21 du cadrage). Les deux bibliothèques pèsent environ
 * 250 Ko compressés : ce module se charge à la demande (`loadZoneLookup`), hors du paquet principal.
 */
const cache = new Map<string, PlaceZone>();

export function placeZone(lng: number, lat: number): PlaceZone {
  const key = `${lng.toFixed(3)},${lat.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const zone: PlaceZone = {};
  try {
    zone.timeZone = tzlookup(lat, lng);
  } catch {
    /* coordonnées hors limites */
  }
  const code = iso1A2Code([lng, lat]);
  if (code) zone.countryCode = code;
  cache.set(key, zone);
  return zone;
}
