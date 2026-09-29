/** Préfixe d'URL du site (`/` en local, `/vanTravelApp/` sur GitHub Pages). */
export function baseUrl(): string {
  const base = import.meta.env.BASE_URL || "/";
  return base.endsWith("/") ? base : `${base}/`;
}

/** URL relative d'un fichier de `public/`, préfixe inclus. */
export function assetUrl(relativePath: string): string {
  return `${baseUrl()}${relativePath.replace(/^\/+/, "")}`;
}

/** URL absolue, pour les consommateurs qui n'aiment pas les chemins relatifs (MapLibre). */
export function absoluteAssetUrl(relativePath: string): string {
  return new URL(assetUrl(relativePath), window.location.origin).href;
}
