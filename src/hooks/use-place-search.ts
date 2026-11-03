import { useEffect, useState } from "react";
import { isSearchable, normalizeQuery, SEARCH_DEBOUNCE_MS, type PlaceResult } from "@/lib/place-search";
import { searchPlaces } from "@/services/place-search";

export type PlaceSearchState = {
  status: "idle" | "loading" | "ok" | "offline" | "quota" | "error";
  results: PlaceResult[];
  message?: string;
};

const IDLE: PlaceSearchState = { status: "idle", results: [] };

/**
 * Recherche OSM pendant la frappe : part après `SEARCH_DEBOUNCE_MS` sans frappe, annule la précédente.
 * `bias` est comparé par valeur (lng, lat) pour ne pas relancer la recherche à chaque rendu. La réponse
 * est rangée sous la recherche qui l'a demandée : tant qu'elle ne correspond pas à la saisie, l'état est
 * « en cours » avec les résultats précédents, pour que la liste ne clignote pas.
 */
export function usePlaceSearch(query: string, bias?: { lng: number; lat: number } | null): PlaceSearchState {
  const [answer, setAnswer] = useState<{ key: string; state: PlaceSearchState }>({ key: "", state: IDLE });
  const searchable = isSearchable(query);
  const biasLng = bias?.lng;
  const biasLat = bias?.lat;
  const key = searchable ? `${normalizeQuery(query)}|${biasLng ?? ""},${biasLat ?? ""}` : "";

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const point = biasLng != null && biasLat != null ? { lng: biasLng, lat: biasLat } : null;
      searchPlaces(query, { bias: point, signal: controller.signal })
        .then((outcome) => {
          if (controller.signal.aborted) return;
          const state: PlaceSearchState =
            outcome.status === "ok"
              ? { status: "ok", results: outcome.results }
              : outcome.status === "offline"
                ? { status: "offline", results: [], message: "Hors ligne : la recherche OSM reviendra avec le réseau." }
                : { status: outcome.status, results: [], message: outcome.message };
          setAnswer({ key, state });
        })
        .catch(() => {
          /* annulée par la frappe suivante */
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // `query` suit `key` : seule la clé normalisée relance la recherche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!key) return IDLE;
  if (answer.key === key) return answer.state;
  // Résultats précédents gardés seulement pendant qu'on complète ou corrige la même recherche.
  const previous = answer.key.split("|")[0];
  const current = key.split("|")[0];
  const related = previous !== "" && (current.startsWith(previous) || previous.startsWith(current));
  return { status: "loading", results: related ? answer.state.results : [] };
}
