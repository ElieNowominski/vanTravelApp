import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { BookOpen, CalendarDays, ChevronRight, Moon, Receipt } from "lucide-react";
import { InstallButton } from "@/components/install-button";
import { ModeSwitch } from "@/components/mode-switch";
import { NetworkBanner } from "@/components/network-banner";
import { SyncStatusButton } from "@/components/sync/sync-status-button";
import { UpdateBanner } from "@/components/update-banner";
import { Button } from "@/components/ui/button";
import { DayStrip } from "@/components/voyager/day-strip";
import { ExpensesPanel } from "@/components/voyager/expenses-panel";
import { ProfileButton, ProfileDialog } from "@/components/voyager/profile-dialog";
import { StopSheet } from "@/components/voyager/stop-sheet";
import { TodayCard } from "@/components/voyager/today-card";
import { DEFAULT_VEHICLE } from "@/lib/constants";
import { formatDateRange } from "@/lib/format";
import { isProfileComplete } from "@/lib/profile";
import { getRegion } from "@/lib/regions";
import { cn } from "@/lib/utils";
import { dayIndexForDate, daysBetween, summarizeDay, todayInZone, tripPhase } from "@/lib/voyager";
import { useProfileStore } from "@/store/profile-store";
import { useTripStore } from "@/store/trip-store";

type Tab = "day" | "expenses";

/** Mode Voyager : l'écran par défaut en voyage. Tout ce qui s'affiche vient d'IndexedDB. */
export function VoyagerApp() {
  const config = useTripStore((s) => s.config);
  const days = useTripStore((s) => s.days);
  const stops = useTripStore((s) => s.stops);
  const legs = useTripStore((s) => s.legs);
  const setUiMode = useTripStore((s) => s.setUiMode);
  const profile = useProfileStore((s) => s.profile);
  const profileHydrated = useProfileStore((s) => s.hydrated);

  const region = getRegion(config?.regionId);
  const today = todayInZone(region.timeZone);
  const todayIndex = dayIndexForDate(days, today);
  const phase = config ? tripPhase(config, today) : "before";
  const [selected, setSelected] = useState(() => Math.max(0, todayIndex));
  const [tab, setTab] = useState<Tab>("day");
  const [openStopId, setOpenStopId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileDismissed, setProfileDismissed] = useState(false);
  // Première ouverture en voyage : le prénom est demandé une fois, sans bloquer (fermable).
  const promptProfile = profileHydrated && !isProfileComplete(profile) && !profileDismissed;

  const snapshot = useMemo(() => ({ days, stops, legs }), [days, stops, legs]);
  const summary = useMemo(() => summarizeDay(snapshot, selected), [snapshot, selected]);
  const openStop = openStopId ? (stops[openStopId] ?? null) : null;

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
          {phase === "after" && <p className="text-right text-xs text-muted-foreground">Voyage terminé</p>}
        </div>
      </header>

      <DayStrip days={days} selected={selected} todayIndex={todayIndex} onSelect={setSelected} />

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {tab === "day" && summary && (
            <>
              {todayIndex >= 0 && selected !== todayIndex && (
                <Button variant="ghost" size="sm" className="h-9 w-fit" onClick={() => setSelected(todayIndex)}>
                  <CalendarDays className="size-3.5" />
                  Revenir à aujourd’hui
                </Button>
              )}
              <TodayCard
                summary={summary}
                isToday={selected === todayIndex}
                vehicle={config.vehicle ?? DEFAULT_VEHICLE}
                onOpenStop={setOpenStopId}
              />
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Étapes du jour</h3>
                {summary.stops.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune étape posée ce jour.</p>
                ) : (
                  <ol className="flex flex-col divide-y rounded-xl bg-card ring-1 ring-foreground/10">
                    {summary.stops.map((stop, index) => {
                      const open = stop.checklist.filter((i) => !i.done).length;
                      return (
                        <li key={stop.id}>
                          <button
                            type="button"
                            className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left"
                            onClick={() => setOpenStopId(stop.id)}
                          >
                            <span
                              className={cn(
                                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                                stop.isOvernight ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                              )}
                            >
                              {stop.isOvernight ? <Moon className="size-3.5" /> : index + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{stop.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {[
                                  stop.area,
                                  stop.bookings.length > 0 ? `${stop.bookings.length} réservation${stop.bookings.length > 1 ? "s" : ""}` : null,
                                  stop.documents.length > 0 ? `${stop.documents.length} doc${stop.documents.length > 1 ? "s" : ""}` : null,
                                  open > 0 ? `${open} à faire` : null,
                                  stop.activities.length > 0 ? `${stop.activities.length} activité${stop.activities.length > 1 ? "s" : ""}` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || "Toucher pour la fiche"}
                              </span>
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </>
          )}
          {tab === "expenses" && (
            <ExpensesPanel
              days={days}
              dayIndex={selected}
              defaultCurrency={region.currency}
              profile={profile}
              onEditProfile={() => setProfileOpen(true)}
            />
          )}
        </div>
      </main>

      <nav aria-label="Sections" className="flex shrink-0 border-t bg-background pb-[env(safe-area-inset-bottom,0px)]">
        <BottomTab active={tab === "day"} onClick={() => setTab("day")} icon={<CalendarDays className="size-5" />} label="Jour" />
        <BottomTab active={tab === "expenses"} onClick={() => setTab("expenses")} icon={<Receipt className="size-5" />} label="Dépenses" />
        <Link
          to="/roadbook"
          className="flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted-foreground"
        >
          <BookOpen className="size-5" />
          Roadbook
        </Link>
      </nav>

      <StopSheet stop={openStop} defaultCurrency={region.currency} onClose={() => setOpenStopId(null)} />
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

function BottomTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
