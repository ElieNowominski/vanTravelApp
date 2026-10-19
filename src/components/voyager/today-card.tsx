import { Link } from "react-router";
import { ArrowRight, ChevronRight, CloudSun, MapPin, Moon, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DirectionsButtons } from "@/components/voyager/directions-buttons";
import { LockedSecret, SecretField } from "@/components/voyager/secret-field";
import { useDraftField } from "@/hooks/use-draft-field";
import { formatDayDrive, isRestDay } from "@/lib/format";
import type { Vehicle } from "@/lib/types";
import { cn } from "@/lib/utils";
import { directionsLinks, telHref, type DaySummary } from "@/lib/voyager";
import { useTripStore } from "@/store/trip-store";

/**
 * « Aujourd'hui » : ce qu'il faut savoir en trois touches. Prochaine étape, route,
 * nuit du soir avec référence et code, Google Maps et téléphone. La fiche de l'étape est une page (`/etape/:id`).
 */
export function TodayCard({ summary, isToday, vehicle }: { summary: DaySummary; isToday: boolean; vehicle: Vehicle }) {
  const setDayWeather = useTripStore((s) => s.setDayWeather);
  const setDayNotes = useTripStore((s) => s.setDayNotes);
  const weather = useDraftField(summary.day.weather ?? "", (next) => setDayWeather(summary.dayIndex, next));
  const notes = useDraftField(summary.day.notes ?? "", (next) => setDayNotes(summary.dayIndex, next));
  const { day, dayIndex, departure, nextStop, overnight, tonightBooking, driveSec, km } = summary;
  const rest = isRestDay(km, driveSec);
  const tooLong = driveSec / 3600 > vehicle.maxComfortableDriveHours;

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Jour {dayIndex + 1}</p>
          <h2 className="text-xl leading-tight font-semibold">
            {day.weekday} {day.label}
          </h2>
        </div>
        {isToday && <Badge>Aujourd’hui</Badge>}
      </header>

      <section className="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
        <p className="text-xs font-medium text-muted-foreground">Route du jour</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm">
          <span className="font-medium">{departure?.name ?? "Départ"}</span>
          <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="font-medium">{overnight?.name ?? nextStop?.name ?? "à définir"}</span>
        </p>
        <p className={cn("mt-1 text-sm", tooLong ? "text-destructive" : "text-muted-foreground")}>
          {rest ? "Journée sur place" : `${formatDayDrive(km, driveSec)} en van`}
          {summary.estimated ? " · estimé" : ""}
          {tooLong ? ` · plus de ${vehicle.maxComfortableDriveHours} h` : ""}
        </p>
        {nextStop && nextStop.id !== overnight?.id && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Prochaine étape</p>
              <p className="truncate text-sm font-medium">{nextStop.name}</p>
            </div>
            <a
              href={directionsLinks(nextStop.lat, nextStop.lng, navigator.userAgent)[0]?.href}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 shrink-0")}
            >
              <MapPin className="size-4" />
              Y aller
            </a>
          </div>
        )}
      </section>

      <section className="rounded-xl bg-primary/5 p-3 ring-1 ring-primary/20">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-xs font-medium text-primary">
            <Moon className="size-4" aria-hidden />
            Nuit du soir
          </p>
          {overnight && (
            <Link to={`/etape/${overnight.id}`} className="inline-flex min-h-11 items-center gap-0.5 text-sm font-medium text-primary">
              Fiche de l’étape
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
        {overnight ? (
          <>
            <Link to={`/etape/${overnight.id}`} className="mt-1 block">
              <p className="text-lg leading-tight font-semibold">{overnight.name}</p>
              {overnight.area && <p className="text-sm text-muted-foreground">{overnight.area}</p>}
            </Link>
            {tonightBooking ? (
              <div className="mt-2 flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-x-3">
                  <p className="text-sm">
                    {tonightBooking.provider !== overnight.name ? `${tonightBooking.provider} · ` : ""}
                    {tonightBooking.reference ? (
                      <>
                        <span className="text-muted-foreground">Réf. </span>
                        <span className="font-mono font-medium select-all">{tonightBooking.reference}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">sans référence</span>
                    )}
                  </p>
                  {tonightBooking.accessCode && <SecretField label="Code d’accès" value={tonightBooking.accessCode} compact />}
                </div>
                {!tonightBooking.accessCode && tonightBooking.accessCodeSecure && <LockedSecret label="Code d’accès" />}
                {tonightBooking.address && <p className="text-sm">{tonightBooking.address}</p>}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Pas de réservation notée.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <DirectionsButtons lat={overnight.lat} lng={overnight.lng} />
              {tonightBooking?.phone && (
                <a href={telHref(tonightBooking.phone)} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 min-w-36 flex-1")}>
                  <Phone className="size-4" />
                  Appeler
                </a>
              )}
            </div>
            {tonightBooking?.phone && <p className="mt-1 text-xs text-muted-foreground select-all">{tonightBooking.phone}</p>}
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Nuit non posée pour ce jour. Le mode Planifier permet de la choisir.</p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
        <div className="flex items-center gap-2">
          <CloudSun className="size-4 text-muted-foreground" aria-hidden />
          <Input
            value={weather.draft}
            onChange={(e) => weather.setDraft(e.target.value)}
            onBlur={weather.commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            placeholder="Météo : grand soleil, vent l’après-midi…"
            className="h-11 border-0 bg-muted"
            aria-label="Météo du jour"
          />
        </div>
        <Textarea
          value={notes.draft}
          onChange={(e) => notes.setDraft(e.target.value)}
          onBlur={notes.commit}
          rows={3}
          placeholder="Notes du jour"
          aria-label="Notes du jour"
          className="bg-muted"
        />
      </section>
    </div>
  );
}
