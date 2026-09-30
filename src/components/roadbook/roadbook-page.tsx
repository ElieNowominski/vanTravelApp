import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { RouteSketchSvg } from "@/components/roadbook/route-sketch-svg";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { useTripBoot } from "@/hooks/use-trip-boot";
import { DEFAULT_VEHICLE, dayColor } from "@/lib/constants";
import { printNeedsBrowser } from "@/lib/pwa";
import { formatMoney, formatTotals, totalsByCurrency } from "@/lib/expenses";
import { formatDateRange, formatDayDrive, formatDuration, formatKm, isRestDay } from "@/lib/format";
import { getRegion } from "@/lib/regions";
import { sketchDay } from "@/lib/route-sketch";
import { overnightCaption, stayById } from "@/lib/trip-plan";
import { cn } from "@/lib/utils";
import { departureOf, summarizeDay } from "@/lib/voyager";
import { dayStats, selectedOption, useTripStore } from "@/store/trip-store";

/**
 * Roadbook imprimable : HTML sémantique, un jour par section, `break-inside: avoid`.
 * Les codes d'accès sont exclus par défaut (papier perdu = code exposé).
 */
export function RoadbookPage() {
  const ready = useTripBoot();
  const config = useTripStore((s) => s.config);
  const days = useTripStore((s) => s.days);
  const stops = useTripStore((s) => s.stops);
  const legs = useTripStore((s) => s.legs);
  const marks = useTripStore((s) => s.marks);
  const activeSavedName = useTripStore((s) => s.activeSavedName);
  const { context: installContext } = useInstallPrompt();
  const [withCodes, setWithCodes] = useState(false);
  const [withSketch, setWithSketch] = useState(true);
  const snapshot = useMemo(() => ({ days, stops, legs }), [days, stops, legs]);

  if (!ready) {
    return <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">Chargement…</div>;
  }
  if (!config) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p>Aucun voyage chargé.</p>
        <Link to="/" className="underline">
          Retour
        </Link>
      </main>
    );
  }

  const region = getRegion(config.regionId);
  const vehicle = config.vehicle ?? DEFAULT_VEHICLE;
  const title = activeSavedName || config.name;
  const totals = days.reduce(
    (acc, _d, i) => {
      const s = dayStats(snapshot, i);
      acc.km += s.km;
      acc.sec += s.driveSec;
      acc.nights += s.overnight ? 1 : 0;
      return acc;
    },
    { km: 0, sec: 0, nights: 0 },
  );
  const allExpenses = days.flatMap((d) => d.expenses ?? []);

  return (
    <div className="roadbook h-dvh overflow-y-auto bg-background print:h-auto print:overflow-visible">
      <div className="mx-auto max-w-3xl px-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-[calc(2rem+env(safe-area-inset-bottom,0px))] print:max-w-none print:p-0">
        <nav className="no-print mb-4 flex flex-wrap items-center gap-2">
          <Link to="/" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")}>
            <ArrowLeft className="size-4" />
            Retour
          </Link>
          {printNeedsBrowser({ userAgent: navigator.userAgent, standalone: installContext === "installed" }) ? (
            // Web app iOS installée : `window.print()` est sans effet. Le lien ouvre la page dans Safari,
            // dont le menu Partager sait imprimer et enregistrer en PDF.
            <a
              href={window.location.href}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ size: "lg" }), "h-11")}
            >
              <Printer className="size-4" />
              Ouvrir dans Safari pour imprimer
            </a>
          ) : (
            <Button className="h-11" onClick={() => window.print()}>
              <Printer className="size-4" />
              Imprimer ou enregistrer en PDF
            </Button>
          )}
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="rb-codes" checked={withCodes} onCheckedChange={setWithCodes} />
              <Label htmlFor="rb-codes" className="text-xs">
                Codes d’accès
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="rb-sketch" checked={withSketch} onCheckedChange={setWithSketch} />
              <Label htmlFor="rb-sketch" className="text-xs">
                Croquis
              </Label>
            </div>
          </div>
        </nav>

        <header className="mb-6 border-b pb-4">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Roadbook · {region.name}</p>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDateRange(config.start.date, config.end.date)} · {days.length} jours · {totals.nights} nuits ·{" "}
            {formatKm(totals.km)} · {formatDuration(totals.sec)} en van
          </p>
          <p className="text-sm text-muted-foreground">
            {vehicle.name}
            {vehicle.selfContained ? " · self-contained" : ""}
            {vehicle.lengthM ? ` · ${vehicle.lengthM} m` : ""}
            {vehicle.heightM ? ` × ${vehicle.heightM} m de haut` : ""}
          </p>
          {config.arrival && (
            <p className="mt-1 text-sm">
              Veille du départ ({config.arrival.date.slice(8, 10)}/{config.arrival.date.slice(5, 7)}) :{" "}
              {overnightCaption(stayById(config, config.arrival.placeId))}
            </p>
          )}
          {vehicle.restrictedRoads && vehicle.restrictedRoads.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Routes interdites par le loueur : {vehicle.restrictedRoads.map((r) => r.name).join(", ")}.
            </p>
          )}
        </header>

        {days.map((day, index) => {
          const summary = summarizeDay(snapshot, index);
          if (!summary) return null;
          const departure = departureOf(snapshot, index);
          const sketch = withSketch ? sketchDay(snapshot, index, { width: 320, height: 190 }) : null;
          const dayExpenses = day.expenses ?? [];
          const color = dayColor(index);
          return (
            <section key={day.date} className="roadbook-day mb-6 rounded-xl ring-1 ring-foreground/10 print:mb-4 print:rounded-none print:ring-0 print:border-b print:pb-4">
              <header className="flex items-start gap-3 px-4 pt-3">
                <span className="mt-1 size-3 shrink-0 rounded-full print:hidden" style={{ backgroundColor: color }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold">
                    Jour {index + 1} · {day.weekday} {day.label}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {isRestDay(summary.km, summary.driveSec)
                      ? "Sur place"
                      : `${departure?.name ?? "Départ"} → ${summary.overnight?.name ?? summary.stops[summary.stops.length - 1]?.name ?? "?"} · ${formatDayDrive(summary.km, summary.driveSec)}`}
                    {summary.estimated ? " (estimé)" : ""}
                  </p>
                  {day.weather && <p className="text-sm">Météo : {day.weather}</p>}
                </div>
              </header>

              <div className="grid gap-4 px-4 py-3 md:grid-cols-[1fr_320px]">
                <div className="flex min-w-0 flex-col gap-3">
                  <ol className="flex flex-col gap-2">
                    {summary.stops.map((stop, stopIndex) => {
                      const inbound = legs.find((l) => l.toStopId === stop.id && l.dayIndex === index);
                      const option = inbound ? selectedOption(inbound) : null;
                      return (
                        <li key={stop.id} className="text-sm">
                          {option && inbound && (
                            <p className="text-xs text-muted-foreground">
                              {stops[inbound.fromStopId]?.name ?? "Départ"} → {stop.name} · {formatKm(option.distanceKm)} ·{" "}
                              {formatDuration(option.durationVanSec)}
                              {option.winding ? " · route lente" : ""}
                            </p>
                          )}
                          <p>
                            <span className="font-medium">
                              {stop.isOvernight ? "Nuit : " : `${stopIndex + 1}. `}
                              {stop.name}
                            </span>
                            {stop.area ? <span className="text-muted-foreground"> · {stop.area}</span> : null}
                          </p>
                          {stop.notes && <p className="text-xs text-muted-foreground">{stop.notes}</p>}
                          {stop.warning && <p className="text-xs text-destructive">{stop.warning}</p>}
                          {stop.activities.length > 0 && (
                            <ul className="ml-4 list-disc text-xs">
                              {stop.activities.map((a) => (
                                <li key={a.id}>{a.text}</li>
                              ))}
                            </ul>
                          )}
                          {stop.bookings.map((booking) => (
                            <div key={booking.id} className="mt-1 rounded-lg bg-muted/60 px-2 py-1.5 text-xs print:bg-transparent print:border print:border-foreground/20">
                              <p>
                                <span className="font-medium">{booking.provider}</span>
                                {booking.reference ? (
                                  <>
                                    {" "}
                                    · réf. <span className="font-mono">{booking.reference}</span>
                                  </>
                                ) : null}
                                {booking.price ? ` · ${formatMoney(booking.price.amount, booking.price.currency)}` : ""}
                              </p>
                              {withCodes && booking.accessCode && (
                                <p>
                                  Code : <span className="font-mono font-semibold">{booking.accessCode}</span>
                                </p>
                              )}
                              {booking.address && <p>{booking.address}</p>}
                              {(booking.phone || booking.checkIn || booking.checkOut) && (
                                <p>
                                  {booking.phone ?? ""}
                                  {booking.phone && (booking.checkIn || booking.checkOut) ? " · " : ""}
                                  {booking.checkIn ? `arrivée ${booking.checkIn}` : ""}
                                  {booking.checkIn && booking.checkOut ? ", " : ""}
                                  {booking.checkOut ? `départ ${booking.checkOut}` : ""}
                                </p>
                              )}
                              {booking.notes && <p className="whitespace-pre-line">{booking.notes}</p>}
                            </div>
                          ))}
                          {stop.checklist.length > 0 && (
                            <ul className="mt-1 text-xs">
                              {stop.checklist.map((item) => (
                                <li key={item.id}>
                                  {item.done ? "☑" : "☐"} {item.text}
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                    {summary.stops.length === 0 && <li className="text-sm text-muted-foreground">Aucune étape.</li>}
                  </ol>
                  {day.notes && <p className="text-sm whitespace-pre-line">{day.notes}</p>}
                  {dayExpenses.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Dépenses du jour : {formatTotals(totalsByCurrency(dayExpenses))}
                    </p>
                  )}
                </div>
                {sketch && (
                  <div className="shrink-0">
                    <RouteSketchSvg sketch={sketch} color={color} />
                  </div>
                )}
              </div>
            </section>
          );
        })}

        {(marks.length > 0 || allExpenses.length > 0) && (
          <footer className="roadbook-day mt-6 border-t pt-4 text-sm">
            {allExpenses.length > 0 && (
              <p>
                <span className="font-medium">Dépenses du voyage :</span> {formatTotals(totalsByCurrency(allExpenses))}
              </p>
            )}
            {marks.length > 0 && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <ul className="text-xs">
                  {marks
                    .filter((m) => m.kind === "plus")
                    .map((m) => (
                      <li key={m.id}>+ {m.text}</li>
                    ))}
                </ul>
                <ul className="text-xs">
                  {marks
                    .filter((m) => m.kind === "minus")
                    .map((m) => (
                      <li key={m.id}>− {m.text}</li>
                    ))}
                </ul>
              </div>
            )}
          </footer>
        )}
        <p className="mt-6 text-[10px] text-muted-foreground">
          Tracés routiers © OpenStreetMap contributors, calculés avec OSRM. Croquis sans fond de carte.
        </p>
      </div>
    </div>
  );
}
