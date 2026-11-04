import { useEffect, useState, type ComponentType } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Bike, Bus, Car, Caravan, Flag, Footprints, MapPin, Motorbike, TrainFront, type LucideProps } from "lucide-react";
import { PlaceSearchScreen } from "@/components/place-search-screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useBack } from "@/hooks/use-back";
import { useTripBoot } from "@/hooks/use-trip-boot";
import { catalogOption, searchPublicCatalogs } from "@/lib/catalog";
import { markOpened } from "@/lib/launch";
import { buildNewTripConfig, durationLabel, newTripError, TRAVEL_CHOICES, type TravelChoice } from "@/lib/new-trip";
import type { PlaceInput } from "@/lib/types";
import { cn } from "@/lib/utils";
import { startNewTrip } from "@/store/trip-switch";

/** Tous les catalogues publics, hors ligne ; Photon complète pendant la frappe. */
const localPlaces = (query: string) => searchPublicCatalogs(query).map(catalogOption);

const CHOICE_ICONS: Record<TravelChoice, ComponentType<LucideProps>> = {
  van: Bus,
  "camping-car": Caravan,
  voiture: Car,
  moto: Motorbike,
  train: TrainFront,
  velo: Bike,
  marche: Footprints,
};

/**
 * Création d'un voyage (lot 6, maquette validée le 4 nov. 2026) : nom, dates, départ, arrivée (le départ par
 * défaut), déplacement. Un seul écran à 390 px, le bouton reste en bas.
 */
export function NewTripScreen() {
  // Le brouillon doit être relu avant de créer : sinon le voyage ouvert serait remplacé sans passer par la bibliothèque.
  const ready = useTripBoot();
  useEffect(markOpened, []);
  const navigate = useNavigate();
  const back = useBack("/voyages");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [start, setStart] = useState<PlaceInput | null>(null);
  const [end, setEnd] = useState<PlaceInput | null>(null);
  const [roundTrip, setRoundTrip] = useState(true);
  const [choice, setChoice] = useState<TravelChoice>("van");
  const [picking, setPicking] = useState<"start" | "end" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const duration = durationLabel(startDate, endDate);
  const input = { name, startDate, endDate, start, end, roundTrip, choice };

  const create = async () => {
    const problem = newTripError(input);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await startNewTrip(buildNewTripConfig(input));
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création impossible sur ce navigateur.");
      setBusy(false);
    }
  };

  return (
    <main className="flex h-dvh flex-col bg-background pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
        <header className="flex items-center gap-1 px-2 pt-3 pb-1">
          <button type="button" aria-label="Retour à mes voyages" onClick={back} className="flex size-11 items-center justify-center rounded-full hover:bg-muted">
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="text-xl font-semibold">Nouveau voyage</h1>
        </header>

        <form
          id="new-trip"
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pt-2 pb-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trip-name">Nom</Label>
            <Input id="trip-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Fjords en van 2027" className="h-12 text-base" />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="trip-start">Début</Label>
                <Input id="trip-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-12 text-base" />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="trip-end">Fin</Label>
                <Input id="trip-end" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className="h-12 text-base" />
              </div>
            </div>
            {duration && <p className="text-[13px] text-muted-foreground">{duration}</p>}
          </div>

          <PlaceChoice label="Départ" place={start} icon={MapPin} emptyText="Choisir le départ" onPick={() => setPicking("start")} />

          <div className="flex flex-col gap-2">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <Label htmlFor="trip-round">Retour au point de départ</Label>
              <Switch id="trip-round" aria-label="Retour au point de départ" checked={roundTrip} onCheckedChange={(checked) => setRoundTrip(checked)} className="after:-inset-3" />
            </div>
            {!roundTrip && <PlaceChoice label="Arrivée" place={end} icon={Flag} emptyText="Choisir l’arrivée" onPick={() => setPicking("end")} />}
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Déplacement</legend>
            <div className="grid grid-cols-4 gap-2">
              {TRAVEL_CHOICES.map((option) => {
                const Icon = CHOICE_ICONS[option.id];
                const selected = option.id === choice;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setChoice(option.id)}
                    className={cn(
                      "flex h-17 flex-col items-center justify-center gap-1.5 rounded-lg border px-0.5 text-xs",
                      selected ? "border-2 border-primary bg-primary/10 font-semibold text-primary" : "bg-card hover:bg-muted",
                    )}
                  >
                    <Icon className="size-5.5" />
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[13px] leading-snug text-muted-foreground">
              Mode proposé pour chaque tronçon, changeable ensuite tronçon par tronçon (ferry, train). Gabarit et rythme du véhicule se règlent dans le profil.
            </p>
          </fieldset>
        </form>

        <div className="border-t px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          {error && (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" form="new-trip" disabled={busy || !ready} className="h-12 w-full text-base font-semibold">
            Créer le voyage
          </Button>
        </div>
      </div>

      {picking && (
        <PlaceSearchScreen
          title={picking === "start" ? "Départ" : "Arrivée"}
          local={localPlaces}
          bias={picking === "end" && start ? { lng: start.lng, lat: start.lat } : null}
          onSelect={(place) => {
            if (picking === "start") setStart(place);
            else setEnd(place);
            setError(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </main>
  );
}

function PlaceChoice({
  label,
  place,
  icon: Icon,
  emptyText,
  onPick,
}: {
  label: string;
  place: PlaceInput | null;
  icon: ComponentType<LucideProps>;
  emptyText: string;
  onPick: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {place ? (
        <div className="flex min-h-14 items-center gap-2.5 rounded-lg border bg-card py-1 pr-1 pl-3">
          <Icon className="size-4.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-medium">{place.name}</span>
            {place.area && <span className="block truncate text-[13px] text-muted-foreground">{place.area}</span>}
          </span>
          <button type="button" onClick={onPick} className="flex min-h-11 shrink-0 items-center px-2.5 text-sm font-medium text-primary">
            Changer
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPick}
          className="flex min-h-14 items-center gap-2.5 rounded-lg border border-dashed bg-card px-3 text-left text-base text-muted-foreground hover:bg-muted"
        >
          <Icon className="size-4.5 shrink-0" />
          {emptyText}
        </button>
      )}
    </div>
  );
}
