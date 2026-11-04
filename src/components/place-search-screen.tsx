import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Landmark, Loader2, Map as MapIcon, MapPin, Search, Tent, TrainFront, TriangleAlert, WifiOff, X } from "lucide-react";
import { useOnline } from "@/hooks/use-online";
import { usePlaceSearch } from "@/hooks/use-place-search";
import { mergePlaceOptions, optionFromResult, type PlaceOption } from "@/lib/place-search";
import { poiToPlaceInput, POI_CATEGORY_LABELS, searchPois, type Poi } from "@/lib/poi";
import type { PlaceInput } from "@/lib/types";
import { getAllPois } from "@/services/poi-cache";

/**
 * Recherche de lieux plein écran (lot 6, maquette validée le 4 nov. 2026) : catalogue local et points
 * d'intérêt gardés sur l'appareil (immédiats, hors ligne), puis OpenStreetMap par Photon pendant la frappe.
 * Sur grand écran, un panneau centré. Pas d'`autoFocus` (iOS, voir `CLAUDE.md`).
 */
export function PlaceSearchScreen({
  title,
  placeholder = "Ville, gare, camping, adresse…",
  local,
  bias,
  onSelect,
  onClose,
  onPickOnMap,
}: {
  title: string;
  placeholder?: string;
  /** Résultats du catalogue pour la saisie courante. */
  local: (query: string) => PlaceOption[];
  /** Point autour duquel les résultats OSM proches passent devant. */
  bias?: { lng: number; lat: number } | null;
  onSelect: (place: PlaceInput) => void;
  onClose: () => void;
  /** Planifier : renvoie vers la carte (appui long). Absent à la création, sans carte. */
  onPickOnMap?: () => void;
}) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const online = useOnline();
  const osm = usePlaceSearch(query, bias);
  const [kept, setKept] = useState<Poi[]>([]);

  useEffect(() => {
    let alive = true;
    void getAllPois().then((pois) => alive && setKept(pois));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const deviceOptions = useMemo(() => {
    if (!query.trim()) return [];
    const catalog = local(query).slice(0, 5);
    const pois = searchPois(kept, query).map(
      (poi): PlaceOption => ({
        key: `appareil:${poi.id}`,
        name: poi.name,
        caption: `${POI_CATEGORY_LABELS[poi.category]} · gardé sur l’appareil`,
        source: "appareil",
        input: poiToPlaceInput(poi),
      }),
    );
    return mergePlaceOptions(catalog, pois);
  }, [query, local, kept]);

  const options = useMemo(() => mergePlaceOptions(deviceOptions, osm.results.map(optionFromResult)), [deviceOptions, osm.results]);
  const searched = query.trim().length > 0;
  const offline = !online || osm.status === "offline";
  const blocked = osm.status === "quota" || osm.status === "error";
  const hasOsm = options.some((option) => option.source === "osm");
  const nothing = searched && options.length === 0 && (osm.status === "ok" || offline || blocked);

  const choose = (place: PlaceInput) => {
    onSelect(place);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex sm:items-center sm:justify-center sm:bg-black/20 sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${inputId}-title`}
        className="flex h-full w-full flex-col bg-background pt-[env(safe-area-inset-top,0px)] sm:h-[min(42rem,90dvh)] sm:max-w-lg sm:rounded-xl sm:border sm:pt-0 sm:shadow-xl"
      >
        <header className="flex flex-col gap-2 border-b py-3 pr-4 pl-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Retour sans choisir"
              onClick={onClose}
              className="flex size-11 items-center justify-center rounded-full hover:bg-muted"
            >
              <ArrowLeft className="size-5" />
            </button>
            <h2 id={`${inputId}-title`} className="text-xl font-semibold">
              {title}
            </h2>
          </div>
          <div className="relative ml-2">
            <label htmlFor={inputId} className="sr-only">
              Rechercher un lieu
            </label>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-muted-foreground" />
            <input
              id={inputId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              autoComplete="off"
              enterKeyHint="search"
              className="h-12 w-full rounded-lg border-2 border-input bg-card pr-12 pl-10 text-base outline-none focus:border-primary [&::-webkit-search-cancel-button]:hidden"
            />
            {osm.status === "loading" ? (
              <Loader2 className="absolute top-1/2 right-3.5 size-4.5 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Recherche en cours" />
            ) : (
              searched && (
                <button
                  type="button"
                  aria-label="Effacer"
                  onClick={() => setQuery("")}
                  className="absolute top-0.5 right-0.5 flex size-11 items-center justify-center text-muted-foreground"
                >
                  <X className="size-4.5" />
                </button>
              )
            )}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {searched && offline && (
            <Notice icon={<WifiOff className="size-5" />} title="Pas de réseau">
              La recherche OpenStreetMap reprend dès le retour du réseau. En attendant, les lieux déjà connus de l’appareil restent proposés.
            </Notice>
          )}
          {searched && !offline && blocked && (
            <Notice icon={<TriangleAlert className="size-5" />} title={osm.status === "quota" ? "Plafond du jour atteint" : "Recherche indisponible"}>
              {osm.message ?? "La recherche OpenStreetMap ne répond pas."} Les lieux déjà connus de l’appareil restent proposés.
            </Notice>
          )}

          {options.length > 0 && (
            <section className="py-2">
              {(offline || blocked) && <h3 className="px-4 pt-2 pb-1 text-[13px] font-semibold text-muted-foreground">Sur cet appareil</h3>}
              <ul>
                {options.map((option) => (
                  <li key={option.key}>
                    <button
                      type="button"
                      onClick={() => choose(option.input)}
                      className="flex min-h-15 w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <OptionIcon option={option} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-base">
                          <Highlighted text={option.name} query={query} />
                        </span>
                        {option.caption && <span className="block truncate text-[13px] text-muted-foreground">{option.caption}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {nothing && <p className="px-4 pt-4 text-sm text-muted-foreground">Aucun lieu trouvé pour « {query.trim()} ».</p>}
          {searched && osm.status === "ok" && (
            <p className="px-4 pt-2 text-[13px] leading-snug text-muted-foreground">Pas le bon lieu ? Ajoute la ville ou le pays à la recherche.</p>
          )}
          {!searched && (
            <p className="px-4 pt-4 text-sm leading-relaxed text-muted-foreground">
              Tape au moins trois lettres. Les lieux connus de l’appareil s’affichent tout de suite, ceux d’OpenStreetMap avec le réseau.
            </p>
          )}

          {onPickOnMap && (searched || !online) && (
            <div className="flex flex-col gap-1 px-4 pt-4 pb-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Le lieu n’y est pas ? Touche longuement la carte à l’endroit voulu : l’étape s’ajoute avec ses coordonnées, le nom pourra être corrigé.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onPickOnMap();
                }}
                className="flex min-h-11 items-center gap-2 self-start text-[15px] font-medium text-primary"
              >
                <MapIcon className="size-4.5" />
                Choisir sur la carte
              </button>
            </div>
          )}
        </div>

        {hasOsm && (
          <footer className="border-t px-4 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] text-xs text-muted-foreground sm:pb-3">
            Recherche{" "}
            <a href="https://photon.komoot.io" target="_blank" rel="noreferrer" className="text-primary underline">
              Photon
            </a>{" "}
            · ©{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="text-primary underline">
              contributeurs OpenStreetMap
            </a>
          </footer>
        )}
      </div>
    </div>
  );
}

function Notice({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div role="status" className="m-4 flex gap-3 rounded-xl bg-amber-50 p-3.5 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="flex flex-col gap-1">
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="text-sm leading-snug">{children}</span>
      </span>
    </div>
  );
}

function OptionIcon({ option }: { option: PlaceOption }) {
  const category = String(option.input.meta?.category ?? "").toLowerCase();
  if (/gare|station|arrêt/.test(category)) return <TrainFront className="size-4.5" />;
  if (option.input.kind === "camp" || option.input.kind === "freedom" || /camping|aire/.test(category)) return <Tent className="size-4.5" />;
  if (option.input.kind === "poi") return <Landmark className="size-4.5" />;
  return <MapPin className="size-4.5" />;
}

/** Met en gras la partie du nom qui correspond à la saisie (sans tenir compte de la casse). */
function Highlighted({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  const at = q ? text.toLowerCase().indexOf(q) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <strong className="font-semibold">{text.slice(at, at + q.length)}</strong>
      {text.slice(at + q.length)}
    </>
  );
}
