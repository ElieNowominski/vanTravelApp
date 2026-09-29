import { assetUrl } from "@/lib/base-url";

/** Jeux de données produits au build par `npm run data` (scripts/fetch-datasets.mjs). */
export type DatasetName = "doc-campsites" | "osm-camps" | "doc-freedom";

export async function loadDataset(name: DatasetName): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(assetUrl(`data/generated/${name}.geojson`));
  if (!res.ok) throw new Error(`Jeu de données « ${name} » absent (lance npm run data).`);
  // Une SPA renvoie index.html pour un fichier manquant : on vérifie la forme, pas le statut.
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error(`Jeu de données « ${name} » absent (lance npm run data).`);
  }
  const data = (await res.json()) as GeoJSON.FeatureCollection;
  if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    throw new Error(`Jeu de données « ${name} » illisible.`);
  }
  return data;
}
