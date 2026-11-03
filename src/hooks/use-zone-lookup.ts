import { useEffect, useState } from "react";
import type { ZoneLookup } from "@/lib/zone";

let loaded: ZoneLookup | null = null;
let pending: Promise<ZoneLookup> | null = null;

/** Charge une fois le module des fuseaux et pays (précaché par le service worker, donc disponible hors ligne). */
export function loadZoneLookup(): Promise<ZoneLookup> {
  pending ??= import("@/lib/place-zone").then((mod) => {
    loaded = mod.placeZone;
    return loaded;
  });
  return pending;
}

/** `null` le temps du chargement : les calculs de zone retombent alors sur le fuseau de l'appareil. */
export function useZoneLookup(): ZoneLookup | null {
  // `loaded` est une fonction : passée telle quelle, React l'appellerait comme initialiseur.
  const [lookup, setLookup] = useState<ZoneLookup | null>(() => loaded);
  useEffect(() => {
    if (lookup) return;
    let alive = true;
    loadZoneLookup()
      .then((fn) => {
        if (alive) setLookup(() => fn);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lookup]);
  return lookup;
}
