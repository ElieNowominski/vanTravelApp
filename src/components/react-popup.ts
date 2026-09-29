import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { LngLatLike, Map as MapLibreMap, Popup } from "maplibre-gl";

/**
 * Popups carte en React : un `Root` par popup, remonté à chaque ouverture, démonté à la fermeture.
 * Remplace les chaînes HTML assemblées à la main (échappement, listeners posés à la main).
 */
const roots = new WeakMap<Popup, Root>();
const wired = new WeakSet<Popup>();

export function showReactPopup(popup: Popup, map: MapLibreMap, lngLat: LngLatLike, node: ReactNode): void {
  const previous = roots.get(popup);
  if (previous) window.setTimeout(() => previous.unmount(), 0);
  const container = document.createElement("div");
  const root = createRoot(container);
  root.render(node);
  roots.set(popup, root);
  if (!wired.has(popup)) {
    wired.add(popup);
    popup.on("close", () => {
      const current = roots.get(popup);
      roots.delete(popup);
      if (current) window.setTimeout(() => current.unmount(), 0);
    });
  }
  popup.setLngLat(lngLat).setDOMContent(container).addTo(map);
}
