
import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ChevronDown,
  Columns2,
  Download,
  MapPin,
  Footprints,
  Moon,
  RotateCcw,
  Route,
  Search,
  Trash2,
  Unlock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { TripLibraryButton } from "@/components/trip-library-dialog";
import { TripMarksEditor } from "@/components/trip-marks-editor";
import { StopActivitiesEditor } from "@/components/stop-activities-editor";
import { buildCatalog, placeToInput, searchCatalog } from "@/lib/catalog";
import { captureTripMapImage } from "@/lib/capture-map";
import { DEFAULT_VEHICLE, START_STOP_ID, dayColor } from "@/lib/constants";
import { getActiveMap } from "@/lib/map-registry";
import { getRegion } from "@/lib/regions";
import { exportTripPdf } from "@/lib/export-pdf";
import { formatDateRange, formatDayDrive, formatDuration, formatKm, formatShortDay } from "@/lib/format";
import { catalogKindLabel, overnightCaption, stayById } from "@/lib/trip-plan";
import { patchSavedTripMarks } from "@/lib/trip-library";
import { cn } from "@/lib/utils";
import { dayStats, selectedOption, useTripStore } from "@/store/trip-store";

export function ItineraryPanel() {
  const days = useTripStore((s) => s.days);
  const stops = useTripStore((s) => s.stops);
  const legs = useTripStore((s) => s.legs);
  const currentDayIndex = useTripStore((s) => s.currentDayIndex);
  const pinMode = useTripStore((s) => s.pinMode);
  const setCurrentDay = useTripStore((s) => s.setCurrentDay);
  const addPlace = useTripStore((s) => s.addPlace);
  const removeStop = useTripStore((s) => s.removeStop);
  const markOvernight = useTripStore((s) => s.markOvernight);
  const unlockDay = useTripStore((s) => s.unlockDay);
  const setPinMode = useTripStore((s) => s.setPinMode);
  const resetTrip = useTripStore((s) => s.resetTrip);
  const loadCatalogPlan = useTripStore((s) => s.loadCatalogPlan);
  const routingStatus = useTripStore((s) => s.routingStatus);
  const activeSavedName = useTripStore((s) => s.activeSavedName);
  const marks = useTripStore((s) => s.marks);
  const addMark = useTripStore((s) => s.addMark);
  const removeMark = useTripStore((s) => s.removeMark);
  const addStopActivity = useTripStore((s) => s.addStopActivity);
  const removeStopActivity = useTripStore((s) => s.removeStopActivity);
  const config = useTripStore((s) => s.config);
  const catalog = useMemo(() => buildCatalog(config), [config]);
  const region = getRegion(config?.regionId);
  const vehicle = config?.vehicle ?? DEFAULT_VEHICLE;

  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [marksOpen, setMarksOpen] = useState(false);
  const [openStopId, setOpenStopId] = useState<string | null>(null);
  const results = useMemo(() => (query.trim() ? searchCatalog(catalog, query).slice(0, 8) : []), [query, catalog]);
  const plusCount = marks.filter((mark) => mark.kind === "plus").length;
  const minusCount = marks.filter((mark) => mark.kind === "minus").length;

  const totals = days.reduce(
    (acc, _day, index) => {
      const stats = dayStats({ days, stops, legs }, index);
      acc.km += stats.km;
      acc.sec += stats.driveSec;
      acc.nights += stats.overnight ? 1 : 0;
      return acc;
    },
    { km: 0, sec: 0, nights: 0 },
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="border-b px-4 py-3">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          {region.name}
          {config ? ` · ${formatDateRange(config.start.date, config.end.date)}` : ""}
        </p>
        <h1 className="font-heading text-lg leading-tight">
          {activeSavedName || config?.name || "Roadtrip van"}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {vehicle.name}{vehicle.selfContained ? " · self-contained" : ""} · temps × {vehicle.timeFactor}
        </p>
        {config?.arrival && (
          <p className="mt-1 text-xs text-muted-foreground">
            Nuit du {formatShortDay(config.arrival.date)} :{" "}
            {overnightCaption(stayById(config, config.arrival.placeId))}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant="secondary">{formatKm(totals.km)}</Badge>
          <Badge variant="secondary">{formatDuration(totals.sec)}</Badge>
          <Badge variant="secondary">{totals.nights} nuits posées</Badge>
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            variant={pinMode ? "default" : "outline"}
            size="sm"
            className="flex-1"
            onClick={() => setPinMode(!pinMode)}
          >
            <MapPin className="size-3.5" />
            {pinMode ? "Clique la carte…" : "Pin custom"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() => {
              void (async () => {
                setExporting(true);
                try {
                  const map = getActiveMap();
                  const mapImage = map
                    ? await captureTripMapImage(map, { days, stops, legs })
                    : null;
                  await exportTripPdf(
                    { days, stops, legs },
                    { mapImage, title: activeSavedName, marks, config },
                  );
                } finally {
                  setExporting(false);
                }
              })();
            }}
          >
            <Download className="size-3.5" />
            {exporting ? "PDF…" : "PDF"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!config || loadingPlan || routingStatus === "loading"}
            title="Remplacer le circuit par le plan catalogue (vrais campings)"
            onClick={() => {
              const ok = window.confirm(
                "Remplacer le circuit affiché par le plan avec les campings réservés ?",
              );
              if (!ok) return;
              setLoadingPlan(true);
              void loadCatalogPlan().finally(() => setLoadingPlan(false));
            }}
          >
            <Route className="size-3.5" />
            {loadingPlan ? "Plan…" : "Plan"}
          </Button>
          <TripLibraryButton />
          <Link
            to="/comparer"
            className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))}
            title="Comparer les circuits"
          >
            <Columns2 className="size-3.5" />
          </Link>
          <Button variant="outline" size="icon-sm" onClick={() => resetTrip()} title="Nouveau circuit">
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
        <div className="mt-3">
          <button
            type="button"
            className="flex w-full items-center gap-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setMarksOpen((open) => !open)}
            aria-expanded={marksOpen}
          >
            <ChevronDown className={`size-3.5 shrink-0 transition-transform ${marksOpen ? "" : "-rotate-90"}`} />
            Plus et moins
            {(plusCount > 0 || minusCount > 0) && (
              <span className="ml-auto font-normal">
                {plusCount > 0 ? `+${plusCount}` : ""}
                {plusCount > 0 && minusCount > 0 ? " · " : ""}
                {minusCount > 0 ? `−${minusCount}` : ""}
              </span>
            )}
          </button>
          {marksOpen && (
            <div className="mt-1.5">
              <TripMarksEditor
                marks={marks}
                onAdd={(kind, text) => {
                  addMark(kind, text);
                  const id = useTripStore.getState().activeSavedId;
                  if (id) void patchSavedTripMarks(id, useTripStore.getState().marks);
                }}
                onRemove={(markId) => {
                  removeMark(markId);
                  const id = useTripStore.getState().activeSavedId;
                  if (id) void patchSavedTripMarks(id, useTripStore.getState().marks);
                }}
              />
            </div>
          )}
        </div>
      </header>

      <div className="border-b px-4 py-2">
        <div className="relative">
          <Search className="absolute top-2 left-2 size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher Tekapo, Milford…"
            className="pl-7"
          />
        </div>
        {results.length > 0 && (
          <ul className="mt-2 max-h-40 overflow-auto rounded-lg border bg-card">
            {results.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    void addPlace(placeToInput(place));
                    setQuery("");
                  }}
                >
                  <span>
                    {place.name}
                    <span className="block text-xs text-muted-foreground">
                      {place.kind === "camp" && place.area
                        ? `${place.area} · ${catalogKindLabel(place.kind, place.category)}`
                        : `${catalogKindLabel(place.kind, place.category)} · ${place.region}`}
                    </span>
                  </span>
                  <span className="text-xs text-primary">Ajouter</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div className="flex flex-col gap-3 p-3">
          <p className="px-1 text-xs text-muted-foreground">
            Clique une ville ou un spot sur la carte pour enchaîner les étapes. « Nuit ici »
            valide la journée. « Sur le chemin » note les activités de l’étape.
          </p>
          {days.map((day, index) => {
            const stats = dayStats({ days, stops, legs }, index);
            const active = index === currentDayIndex;
            const tooLong = stats.driveSec / 3600 > vehicle.maxComfortableDriveHours;
            const lastId = day.stopIds[day.stopIds.length - 1];
            const color = dayColor(index);
            return (
              <section
                key={day.date}
                className={`overflow-hidden rounded-xl ring-1 ${
                  active ? "ring-primary/40 bg-primary/4" : "ring-foreground/10 bg-card"
                }`}
              >
                <div className="flex">
                  <div
                    className="w-1.5 shrink-0 self-stretch"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left"
                  onClick={() => setCurrentDay(index)}
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <span
                      className="mt-0.5 size-3.5 shrink-0 rounded-full ring-2 ring-white"
                      style={{ backgroundColor: color }}
                      title={`Couleur du jour ${index + 1} sur la carte`}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        Jour {index + 1} · {day.weekday} {day.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {day.stopIds.length === 0
                          ? "Aucune étape"
                          : formatDayDrive(stats.km, stats.driveSec)}
                        {stats.overnight ? ` · ${stats.overnight.name}` : ""}
                        {day.locked ? " · validé" : ""}
                      </p>
                    </div>
                  </div>
                  {tooLong && (
                    <Badge variant="destructive">+{vehicle.maxComfortableDriveHours} h</Badge>
                  )}
                </button>
                <Separator />
                <ol className="flex flex-col px-1 py-1">
                  {day.stopIds.length === 0 && (
                    <li className="px-2 py-2 text-xs text-muted-foreground">
                      {index === 0
                        ? "Le départ est posé. Ajoute la prochaine ville."
                        : "Départ depuis la nuit précédente. Ajoute un spot."}
                    </li>
                  )}
                  {day.stopIds.map((stopId, stopIndex) => {
                    const stop = stops[stopId];
                    if (!stop) return null;
                    const inbound =
                      stopIndex === 0
                        ? legs.find((l) => l.toStopId === stopId && l.dayIndex === index)
                        : legs.find(
                            (l) =>
                              l.fromStopId === day.stopIds[stopIndex - 1] &&
                              l.toStopId === stopId,
                          );
                    const option = inbound ? selectedOption(inbound) : null;
                    const canNight = stopId === lastId && !day.locked;
                    const activities = stop.activities ?? [];
                    const open = openStopId === stopId;
                    return (
                      <li key={stopId} className="px-2 py-1.5">
                        {option && inbound && (
                          <p className="mb-1 pl-5 text-[11px] text-muted-foreground">
                            {stops[inbound.fromStopId]?.name ?? "Départ"} → {stop.name}
                            {" · "}
                            {formatDuration(option.durationVanSec)} van
                            {option.winding ? " · route lente" : ""} · {formatKm(option.distanceKm)}
                            {inbound.estimated ? " · estimé" : ""}
                            {inbound.options.length > 1
                              ? ` · ${inbound.options.length} routes`
                              : ""}
                          </p>
                        )}
                        <div className="flex items-start gap-2">
                          <span
                            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
                            style={{ backgroundColor: color }}
                          >
                            {stop.isOvernight ? "N" : stopIndex + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              className="w-full text-left"
                              onClick={() => {
                                setCurrentDay(index);
                                setOpenStopId((id) => (id === stopId ? null : stopId));
                              }}
                            >
                              <p className="truncate text-sm font-medium">{stop.name}</p>
                              {stop.area && (
                                <p className="text-xs text-muted-foreground">{stop.area}</p>
                              )}
                              {stop.notes && (
                                <p className="text-xs leading-snug text-muted-foreground">
                                  {stop.notes}
                                </p>
                              )}
                              {stop.warning && (
                                <p className="text-xs text-destructive">{stop.warning}</p>
                              )}
                              {!open && activities.length > 0 && (
                                <p className="text-[11px] text-muted-foreground">
                                  {activities.length} activité{activities.length > 1 ? "s" : ""}{" "}
                                  sur le chemin
                                </p>
                              )}
                            </button>
                            {open && (
                              <StopActivitiesEditor
                                activities={activities}
                                onAdd={(text) => addStopActivity(stopId, text)}
                                onRemove={(activityId) => removeStopActivity(stopId, activityId)}
                              />
                            )}
                            <div className="mt-1 flex flex-wrap gap-1">
                              <Button
                                size="xs"
                                variant={open ? "secondary" : "ghost"}
                                onClick={() => {
                                  setCurrentDay(index);
                                  setOpenStopId((id) => (id === stopId ? null : stopId));
                                }}
                              >
                                <Footprints className="size-3" />
                                Sur le chemin
                                {activities.length > 0 ? ` · ${activities.length}` : ""}
                              </Button>
                              {canNight && (
                                <Button
                                  size="xs"
                                  variant="secondary"
                                  onClick={() => markOvernight(stopId)}
                                >
                                  <Moon className="size-3" />
                                  Nuit ici
                                </Button>
                              )}
                              {day.locked && stop.isOvernight && (
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => unlockDay(index)}
                                >
                                  <Unlock className="size-3" />
                                  Modifier
                                </Button>
                              )}
                              {!(stopId === START_STOP_ID && index === 0 && stopIndex === 0) && (
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => void removeStop(stopId)}
                                >
                                  <Trash2 className="size-3" />
                                  Retirer
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
