import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronRight, Eye, Plus, Smartphone, Upload } from "lucide-react";
import { SyncStatusButton } from "@/components/account/sync-status-button";
import { NetworkBanner } from "@/components/network-banner";
import { UpdateBanner } from "@/components/update-banner";
import { useOnline } from "@/hooks/use-online";
import { useTripBoot } from "@/hooks/use-trip-boot";
import { useTripZone } from "@/hooks/use-trip-zone";
import { parseBackup, restoreBackup } from "@/lib/backup";
import { formatDateRange, formatKm } from "@/lib/format";
import { markOpened } from "@/lib/launch";
import { buildTripEntries, dayProgress, groupTrips, monthLabel, startsInLabel, type AccountTripSummary, type TripEntry } from "@/lib/trip-list";
import { listSavedTrips, snapshotStats } from "@/lib/trip-library";
import type { SavedTrip } from "@/lib/types";
import { cn } from "@/lib/utils";
import { dayIndexForDate, departureOf, todayInZone } from "@/lib/voyager";
import { listMemberTrips } from "@/services/supabase-sync";
import { useAccountStore } from "@/store/account-store";
import { openTripEntry } from "@/store/trip-switch";
import { currentSnapshot, dayStats, useTripStore } from "@/store/trip-store";

const PAST_PREVIEW = 2;

function deviceToday(): string {
  return todayInZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

/**
 * Accueil (lot 6, maquette validée le 4 nov. 2026) : les voyages en cours, à venir et passés, ceux du compte
 * et ceux de l'appareil dans une seule liste. Sobre : la carte « En cours » ouvre la journée, le reste ouvre
 * le voyage. Sans aucun voyage, l'écran de premier lancement.
 */
export function HomeScreen() {
  const ready = useTripBoot();
  const navigate = useNavigate();
  const online = useOnline();
  const user = useAccountStore((s) => s.user);
  const accountTripId = useAccountStore((s) => s.settings.tripId);
  const config = useTripStore((s) => s.config);
  const activeSavedId = useTripStore((s) => s.activeSavedId);
  const days = useTripStore((s) => s.days);
  const stops = useTripStore((s) => s.stops);
  const legs = useTripStore((s) => s.legs);
  const { today: tripToday } = useTripZone();

  const [saved, setSaved] = useState<SavedTrip[] | null>(null);
  const [account, setAccount] = useState<AccountTripSummary[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Arrivé ici, l'accueil est vu : ouvrir un voyage ne doit plus y ramener.
  useEffect(markOpened, []);

  const refreshSaved = useCallback(
    () =>
      listSavedTrips()
        .then(setSaved)
        .catch(() => {
          setSaved([]);
          setStatus("Bibliothèque illisible sur ce navigateur.");
        }),
    [],
  );

  useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  // Les voyages du compte, en ligne seulement ; hors ligne, ceux de l'appareil suffisent.
  useEffect(() => {
    if (!user || !online) return;
    let alive = true;
    listMemberTrips(user.id)
      .then((list) => alive && setAccount(list))
      .catch(() => alive && setAccount(null));
    return () => {
      alive = false;
    };
  }, [user, online]);

  const today = deviceToday();
  const entries = useMemo(() => {
    if (!saved) return null;
    const stats = config ? snapshotStats(currentSnapshot({ days, stops, legs, customPins: [], currentDayIndex: 0 })) : null;
    return buildTripEntries({
      saved,
      account: user ? account : null,
      active: config ? { config, savedId: activeSavedId, accountTripId, km: stats?.km ?? 0, today: tripToday } : null,
      today,
    });
  }, [saved, account, user, config, activeSavedId, accountTripId, days, stops, legs, tripToday, today]);
  const groups = useMemo(() => (entries ? groupTrips(entries) : null), [entries]);

  /** Le trajet du jour du voyage ouvert, pour la carte « En cours ». */
  const todayLine = useMemo(() => {
    if (!config || days.length === 0) return null;
    const index = dayIndexForDate(days, tripToday);
    const snapshot = { days, stops };
    const from = departureOf(snapshot, index);
    const stats = dayStats({ days, stops, legs }, index);
    const to = stats.overnight ?? (days[index].stopIds.length ? stops[days[index].stopIds[days[index].stopIds.length - 1]] : null);
    if (!to) return null;
    if (!from || from.id === to.id || stats.km < 0.5) return `Aujourd’hui : ${to.name}`;
    return `Aujourd’hui : ${from.name} → ${to.name} · ${formatKm(stats.km)}`;
  }, [config, days, stops, legs, tripToday]);

  const open = async (entry: TripEntry) => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      await openTripEntry(entry);
      navigate("/");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ouverture impossible.");
      setBusy(false);
    }
  };

  const importFile = async (file: File) => {
    setBusy(true);
    setStatus(null);
    try {
      const report = await restoreBackup(parseBackup(await file.text()));
      await refreshSaved();
      const candidate = report.draftTrip ?? report.trips.find((trip) => trip.config) ?? null;
      if (!useTripStore.getState().config && candidate) {
        useTripStore.getState().loadSavedTrip(candidate);
        navigate("/");
        return;
      }
      const count = report.imported + report.updated;
      setStatus(count > 0 ? `Sauvegarde importée : ${count} voyage${count > 1 ? "s" : ""} ajouté${count > 1 ? "s" : ""} ou mis à jour.` : "Sauvegarde importée, rien de neuf.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import impossible.");
    } finally {
      setBusy(false);
    }
  };

  const importButton = (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => fileInputRef.current?.click()}
        className="flex min-h-11 items-center gap-2 self-center px-3 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <Upload className="size-4" />
        Importer une sauvegarde
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void importFile(file);
        }}
      />
    </>
  );

  const statusLine = status && (
    <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">
      {status}
    </p>
  );

  if (!ready || !groups) {
    return <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">Chargement des voyages…</div>;
  }

  const empty = groups.during.length + groups.upcoming.length + groups.past.length === 0;
  const showLocalTag = !!user && account !== null;

  if (empty) {
    return (
      <main className="h-dvh overflow-y-auto overscroll-contain bg-background">
        <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-between gap-8 px-4 pt-[calc(1.5rem+env(safe-area-inset-top,0px))] pb-[calc(1.75rem+env(safe-area-inset-bottom,0px))]">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">vanTravel</p>
          <div className="flex flex-col gap-5">
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden className="text-primary">
              <circle cx="16" cy="54" r="6" stroke="currentColor" strokeWidth="3" />
              <circle cx="56" cy="18" r="6" stroke="currentColor" strokeWidth="3" />
              <path d="M21 50c10-6 4-16 14-20s14 2 18-7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 7" />
            </svg>
            <h1 className="font-heading text-3xl leading-tight font-semibold">Où pars-tu ?</h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              Itinéraire, réservations, dépenses et documents d’un voyage itinérant, consultables sans réseau.
            </p>
          </div>
          <div className="flex flex-col gap-2.5">
            {statusLine}
            <NewTripLink />
            {!user && <SyncStatusButton variant="full" />}
            {!user && <p className="text-center text-[13px] leading-snug text-muted-foreground">Connecté, tu retrouves les voyages de ton compte et ceux partagés avec toi.</p>}
            {importButton}
          </div>
        </div>
      </main>
    );
  }

  const past = showAllPast ? groups.past : groups.past.slice(0, PAST_PREVIEW);

  return (
    <div className="flex h-dvh flex-col bg-background pt-[env(safe-area-inset-top,0px)]">
      <UpdateBanner />
      <NetworkBanner />
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 px-4 pt-6 pb-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">vanTravel</p>
            <h1 className="font-heading text-[26px] leading-tight font-semibold">Mes voyages</h1>
          </div>
          <SyncStatusButton variant="round" />
        </header>

        <main className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-4 pt-1 pb-6">
          {statusLine}

          {groups.during.length > 0 && (
            <Section title="En cours">
              {groups.during.map((entry) => {
                const progress = entry.startDate && entry.endDate ? dayProgress(entry.startDate, entry.endDate, entry.active ? tripToday : today) : null;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    disabled={busy}
                    onClick={() => void open(entry)}
                    className="flex flex-col gap-2.5 rounded-2xl bg-primary p-4 text-left text-primary-foreground disabled:opacity-70"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[13px] opacity-85">{progress ? `Jour ${progress.day} sur ${progress.total}` : "En cours"}</span>
                      <span className="rounded-full bg-primary-foreground/15 px-2 py-0.5 text-xs">Voyager</span>
                    </span>
                    <span className="flex flex-col gap-1">
                      <span className="text-xl leading-tight font-semibold">{entry.name}</span>
                      {entry.active && todayLine && <span className="text-sm opacity-90">{todayLine}</span>}
                    </span>
                    {progress && (
                      <span className="h-1 overflow-hidden rounded-full bg-primary-foreground/20" aria-hidden>
                        <span className="block h-1 bg-primary-foreground" style={{ width: `${Math.round((progress.day / progress.total) * 100)}%` }} />
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-sm font-medium">
                      Ouvrir la journée
                      <ChevronRight className="size-4" />
                    </span>
                  </button>
                );
              })}
            </Section>
          )}

          {groups.upcoming.length > 0 && (
            <Section title="À venir">
              <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
                {groups.upcoming.map((entry) => (
                  <li key={entry.key}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void open(entry)}
                      className="flex min-h-18 w-full items-center gap-3 py-3 pr-3 pl-4 text-left hover:bg-muted disabled:opacity-70"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-base font-semibold">{entry.name}</span>
                        <span className="text-[13px] text-muted-foreground">{datesLine(entry)}</span>
                        {routeLine(entry) && <span className="text-[13px] text-muted-foreground">{routeLine(entry)}</span>}
                        <EntryTags entry={entry} showLocal={showLocalTag} />
                      </span>
                      {entry.startDate && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{startsInLabel(today, entry.startDate)}</span>
                      )}
                      <ChevronRight className="size-4.5 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {groups.past.length > 0 && (
            <Section title="Passés">
              <ul className="flex flex-col">
                {past.map((entry) => (
                  <li key={entry.key}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void open(entry)}
                      className="flex min-h-11 w-full items-center justify-between gap-3 px-1 text-left text-[15px] hover:text-primary disabled:opacity-70"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{entry.name}</span>
                        {entry.active && <span className="shrink-0 text-xs text-muted-foreground">· ouvert</span>}
                      </span>
                      <span className="shrink-0 text-[13px] text-muted-foreground">{entry.endDate ? monthLabel(entry.endDate) : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {groups.past.length > PAST_PREVIEW && (
                <button type="button" onClick={() => setShowAllPast((v) => !v)} className="min-h-11 self-start px-1 text-sm font-medium text-primary">
                  {showAllPast ? "Afficher moins" : `Afficher les ${groups.past.length} voyages passés`}
                </button>
              )}
            </Section>
          )}

          {importButton}
        </main>

        <div className="border-t px-4 pt-3 pb-[calc(1.75rem+env(safe-area-inset-bottom,0px))] md:pb-4">
          <NewTripLink />
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function NewTripLink() {
  return (
    <Link
      to="/voyages/nouveau"
      className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
    >
      <Plus className="size-4.5" />
      Nouveau voyage
    </Link>
  );
}

function datesLine(entry: TripEntry): string {
  if (!entry.startDate || !entry.endDate) return "Sans dates";
  const nights = entry.nights ?? 0;
  return `${formatDateRange(entry.startDate, entry.endDate)} · ${nights} nuit${nights > 1 ? "s" : ""}`;
}

function routeLine(entry: TripEntry): string | null {
  const places = entry.from && entry.to && entry.from !== entry.to ? `${entry.from} → ${entry.to}` : entry.from ? `Boucle depuis ${entry.from}` : null;
  const km = entry.km && entry.km >= 1 ? formatKm(entry.km).replace(/\B(?=(\d{3})+(?!\d))/g, " ") : null;
  return [places, km].filter(Boolean).join(" · ") || null;
}

function EntryTags({ entry, showLocal }: { entry: TripEntry; showLocal: boolean }) {
  const tags: Array<{ key: string; icon: ReactNode; text: string }> = [];
  if (entry.active) tags.push({ key: "active", icon: null, text: "Ouvert sur cet appareil" });
  if (entry.account?.role === "viewer") tags.push({ key: "viewer", icon: <Eye className="size-3.5" />, text: "Partagé en lecture" });
  if (showLocal && !entry.account) tags.push({ key: "local", icon: <Smartphone className="size-3.5" />, text: "Sur cet appareil seulement" });
  if (tags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5">
      {tags.map((tag) => (
        <span key={tag.key} className={cn("flex items-center gap-1.5 text-[13px]", tag.key === "active" ? "text-primary" : "text-muted-foreground")}>
          {tag.icon}
          {tag.text}
        </span>
      ))}
    </span>
  );
}
