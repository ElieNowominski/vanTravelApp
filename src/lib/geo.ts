export function haversineKm(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function straightLine(a: { lng: number; lat: number }, b: { lng: number; lat: number }): GeoJSON.LineString {
  return {
    type: "LineString",
    coordinates: [
      [a.lng, a.lat],
      [b.lng, b.lat],
    ],
  };
}

export function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function inSouthIsland(lng: number, lat: number): boolean {
  return lng >= 166 && lng <= 175.2 && lat <= -40.3 && lat >= -47.5;
}

function centroidOf(coords: number[][] | number[][][]): [number, number] | null {
  const ring = Array.isArray(coords[0]?.[0])
    ? (coords[0] as number[][])
    : (coords as number[][]);
  if (!ring.length) return null;
  let lng = 0;
  let lat = 0;
  let n = 0;
  for (const point of ring) {
    if (typeof point[0] !== "number" || typeof point[1] !== "number") continue;
    lng += point[0];
    lat += point[1];
    n += 1;
  }
  if (n === 0) return null;
  return [lng / n, lat / n];
}

/** MapLibre clustering only accepts Point features. */
export function asPointCollection(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const feature of fc.features) {
    const g = feature.geometry;
    if (!g) continue;
    if (g.type === "Point") {
      features.push(feature);
      continue;
    }
    if (g.type === "MultiPoint") {
      for (const coordinates of g.coordinates) {
        features.push({
          type: "Feature",
          properties: feature.properties,
          geometry: { type: "Point", coordinates },
        });
      }
      continue;
    }
    const coords =
      g.type === "Polygon" || g.type === "MultiLineString"
        ? g.coordinates
        : g.type === "MultiPolygon"
          ? g.coordinates[0]
          : g.type === "LineString"
            ? [g.coordinates]
            : null;
    const center = coords ? centroidOf(coords as number[][] | number[][][]) : null;
    if (center) {
      features.push({
        type: "Feature",
        properties: feature.properties,
        geometry: { type: "Point", coordinates: center },
      });
    }
  }
  return { type: "FeatureCollection", features };
}
