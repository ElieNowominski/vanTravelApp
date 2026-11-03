import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePlaceSearch } from "@/hooks/use-place-search";
import { mergePlaceOptions, optionFromResult, type PlaceOption } from "@/lib/place-search";
import type { PlaceInput } from "@/lib/types";

/**
 * Champ de recherche de lieux : catalogue local (immédiat, hors ligne) puis OpenStreetMap par Photon pendant
 * la frappe. Interface provisoire : la recherche de lieux aura sa maquette au lot 6.
 */
export function PlaceSearchField({
  id,
  placeholder,
  local,
  bias,
  actionLabel = "Ajouter",
  onSelect,
}: {
  id?: string;
  placeholder: string;
  /** Résultats du catalogue pour la saisie courante. */
  local: (query: string) => PlaceOption[];
  /** Point autour duquel les résultats OSM proches passent devant. */
  bias?: { lng: number; lat: number } | null;
  actionLabel?: string;
  onSelect: (place: PlaceInput) => void;
}) {
  const [query, setQuery] = useState("");
  const osm = usePlaceSearch(query, bias);
  const options = useMemo(
    () => (query.trim() ? mergePlaceOptions(local(query).slice(0, 5), osm.results.map(optionFromResult)) : []),
    [query, local, osm.results],
  );
  const hasOsm = options.some((option) => option.source === "osm");

  return (
    <div>
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="search"
          className="h-11 pr-9 pl-8"
        />
        {osm.status === "loading" && (
          <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Recherche en cours" />
        )}
      </div>
      {options.length > 0 && (
        <ul className="mt-2 max-h-64 overflow-auto overscroll-contain rounded-lg border bg-card">
          {options.map((option) => (
            <li key={option.key}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onSelect(option.input);
                  setQuery("");
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate">{option.name}</span>
                  {option.caption && <span className="block truncate text-xs text-muted-foreground">{option.caption}</span>}
                </span>
                <span className="shrink-0 text-xs text-primary">{actionLabel}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {osm.message && <p className="mt-1.5 text-xs text-muted-foreground">{osm.message}</p>}
      {query.trim() && osm.status === "ok" && options.length === 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">Aucun lieu trouvé.</p>
      )}
      {hasOsm && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Recherche{" "}
          <a href="https://photon.komoot.io" target="_blank" rel="noreferrer" className="underline">
            Photon
          </a>{" "}
          · ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">
            contributeurs OpenStreetMap
          </a>
        </p>
      )}
    </div>
  );
}
