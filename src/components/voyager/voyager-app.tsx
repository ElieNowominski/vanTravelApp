import { useMemo, useState } from "react";
import { Link } from "react-router";
import { CalendarDays, ChevronRight, Moon } from "lucide-react";
import { InstallButton } from "@/components/install-button";
import { ModeSwitch } from "@/components/mode-switch";
import { NetworkBanner } from "@/components/network-banner";
import { SyncStatusButton } from "@/components/account/sync-status-button";
import { UpdateBanner } from "@/components/update-banner";
import { Button } from "@/components/ui/button";
import { DayStrip } from "@/components/voyager/day-strip";
import { ProfileButton, ProfileDialog } from "@/components/voyager/profile-dialog";
import { TodayCard } from "@/components/voyager/today-card";
import { VoyagerNav } from "@/components/voyager/voyager-nav";
import { DEFAULT_VEHICLE } from "@/lib/constants";
import { expensesForStop, formatTotals, stopCosts, totalsByCurrency } from "@/lib/expenses";
import { formatDateRange } from "@/lib/format";
import { isProfileComplete } from "@/lib/profile";
import { getRegion } from "@/lib/regions";
import { cn } from "@/lib/utils";
import { dayIndexForDate, daysBetween, summarizeDay, todayInZone, tripPhase } from "@/lib/voyager";
import { useProfileStore } from "@/store/profile-store";
import { useTripStore } from "@/store/trip-store";

/** Mode Voyager, écran Jour : l'écran par défaut en voyage. Tout ce qui s'affiche vient d'IndexedDB. */
export function VoyagerApp() {
  const config = useTripStore((s) => s.config);
  const days = useTripStore((s) => s.days);
  const stops = useTripStore((s) => s.stops);
  const legs = useTripStore((s) => s.legs);
  const setUiMode = useTripStore((s) => s.setUiMode);
  const travelDay = useTripStore((s) => s.travelDay);
  const setTravelDay = useTripStore((s) => s.setTravelDay);
  const profile = useProfileStore((s) => s.profile);
  const profileHydrated = useProfileStore((s) => s.hydrated);

  const region = getRegion(config?.regionId);
  const today = todayInZone(region.timeZone);
  const todayIndex = dayIndexForDate(days, today);
  const phase = config ? tripPhase(config, today) : "before";
  // Le jour choisi survit à un passage par une fiche d'étape (store, non persisté) ; sinon aujourd'hui.
  const selected = Math.min(Math.max(0, travelDay ?? todayIndex), Math.max(0, days.length - 1));
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileDismissed, setProfileDismissed] = useState(false);
  // Première ouverture en voyage : le prénom est demandé une fois, sans bloquer (fermable).
  const promptProfile = profileHydrated && !isProfileComplete(profile) && !profileDismissed;

  const snapshot = useMemo(() => ({ days, stops, legs }), [days, stops, legs]);
  const summary = useMemo(() => summarizeDay(snapshot, selected), [snapshot, selected]);
  const dayTotal = useMemo(() => totalsByCurrency(days[selected]?.expenses ?? []), [days, selected]);

  if (!config) return null;

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background pt-[env(safe-area-inset-top,0px)]">
      <UpdateBanner />
      <NetworkBanner />
      <header className="flex flex-col gap-2 border-b px-4 pt-2 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs tracking-wide text-muted-foreground uppercase">
              {region.name} · {formatDateRange(config.start.date, config.end.date)}
            </p>
            <h1 className="truncate font-heading text-lg leading-tight">{config.name}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <InstallButton />
            <SyncStatusButton />
            <ProfileButton onClick={() => setProfileOpen(true)} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <ModeSwitch mode="travel" onChange={(mode) => setUiMode(mode)} />
          {phase === "before" && (
            <p className="text-right text-xs text-muted-foreground">
              Départ dans {daysBetween(today, config.start.date)} jour{daysBetween(today, config.start.date) > 1 ? "s" : ""}
            </p>
          )}
          {phase === "during" && (
            <p className="text-right text-xs text-muted-foreground">
              Jour {selected + 1} sur {days.length}
            </p>
          )}
          {phase === "after" && <p className="text-right text-xs text-muted-foreground">Voyage terminé</p>}
        </div>
      </header>

      <DayStrip days={days} selected={selected} todayIndex={todayIndex} onSelect={setTravelDay} />

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {summary && (
            <>
              {todayIndex >= 0 && selected !== todayIndex && (
                <Button variant="ghost" size="sm" className="h-9 w-fit" onClick={() => setTravelDay(null)}>
                  <CalendarDays className="size-3.5" />
                  Revenir à aujourd’hui
                </Button>
              )}
              <TodayCard summary={summary} isToday={selected === todayIndex} vehicle={config.vehicle ?? DEFAULT_VEHICLE} />
              <section className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium">Étapes du jour</h3>
                  <Link to="/depenses" className="text-sm text-primary">
                    Dépenses du jour : {formatTotals(dayTotal)}
                  </Link>
                </div>
                {summary.stops.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune étape posée ce jour.</p>
                ) : (
                  <ol className="flex flex-col divide-y rounded-xl bg-card ring-1 ring-foreground/10">
                    {summary.stops.map((stop, index) => {
                      const open = stop.checklist.filter((i) => !i.done).length;
                      const costs = stopCosts(stop, expensesForStop(days, stop.id));
                      const isNight = stop.id === summary.overnight?.id;
                      return (
                        <li key={stop.id}>
                          <Link to={`/etape/${stop.id}`} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left">
                            <span
                              className={cn(
                                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                                isNight ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                              )}
                            >
                              {isNight ? <Moon className="size-3.5" /> : index + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{stop.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {[
                                  stop.area,
                                  stop.bookings.length > 0 ? `${stop.bookings.length} réservation${stop.bookings.length > 1 ? "s" : ""}` : null,
                                  stop.documents.length > 0 ? `${stop.documents.length} doc${stop.documents.length > 1 ? "s" : ""}` : null,
                                  open > 0 ? `${open} à faire` : null,
                                  costs.lines.length > 0 ? formatTotals(costs.total) : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || "Toucher pour la fiche"}
                              </span>
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      <VoyagerNav active="jour" />

      <ProfileDialog
        open={profileOpen || promptProfile}
        onClose={() => {
          setProfileOpen(false);
          setProfileDismissed(true);
        }}
      />
    </div>
  );
}
