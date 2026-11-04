import { tripPhase, daysBetween, type TripPhase } from "@/lib/voyager";
import { normalizeTripConfig } from "@/lib/trip-config";
import type { MemberRole } from "@/lib/roles";
import type { SavedTrip, TripConfig } from "@/lib/types";

/**
 * Accueil (lot 6) : une seule liste pour les voyages du compte, ceux de la bibliothèque de l'appareil et
 * le voyage ouvert. Un voyage du compte et sa copie locale (même `config.id`) ne font qu'une ligne ; les
 * autres copies locales restent des lignes à part, sans lien avec le compte.
 */
export type AccountTripSummary = { id: string; name: string; role: MemberRole; config: unknown };

/** Le voyage chargé dans l'app : ses chiffres sont plus frais que ceux de la bibliothèque. */
export type ActiveTrip = {
  config: TripConfig;
  savedId: string | null;
  accountTripId: string | null;
  km: number;
  /** « Aujourd'hui » dans le fuseau de l'étape du jour. */
  today: string;
};

export type TripEntry = {
  key: string;
  name: string;
  config: TripConfig | null;
  startDate: string | null;
  endDate: string | null;
  from: string | null;
  to: string | null;
  nights: number | null;
  km: number | null;
  phase: TripPhase | "undated";
  saved: SavedTrip | null;
  account: (AccountTripSummary & { config: TripConfig | null }) | null;
  active: boolean;
};

function placeName(config: TripConfig | null, which: "start" | "end"): string | null {
  const name = config?.[which].name;
  return typeof name === "string" && name ? name : null;
}

function fromConfig(config: TripConfig | null, today: string) {
  return {
    startDate: config?.start.date ?? null,
    endDate: config?.end.date ?? null,
    from: placeName(config, "start"),
    to: placeName(config, "end"),
    phase: config ? tripPhase(config, today) : ("undated" as const),
  };
}

function savedEntry(trip: SavedTrip, today: string): TripEntry {
  const config = normalizeTripConfig(trip.config);
  const base = fromConfig(config, today);
  // Ancien circuit sans voyage associé : les dates viennent de ses jours.
  const startDate = base.startDate ?? trip.days[0]?.date ?? null;
  const endDate = base.endDate ?? trip.days[trip.days.length - 1]?.date ?? null;
  const phase = config ? base.phase : startDate && endDate ? tripPhase({ start: { date: startDate, placeId: "" }, end: { date: endDate, placeId: "" } }, today) : "undated";
  return {
    key: `saved:${trip.id}`,
    name: trip.name,
    config,
    ...base,
    startDate,
    endDate,
    phase,
    // Nuits du calendrier (et non nuits déjà placées) : c'est la durée du voyage qu'on lit dans la liste.
    nights: startDate && endDate ? daysBetween(startDate, endDate) : trip.nights,
    km: trip.km,
    saved: trip,
    account: null,
    active: false,
  };
}

function isNewer(a: SavedTrip, b: SavedTrip): boolean {
  return a.savedAt > b.savedAt;
}

export function buildTripEntries(input: {
  saved: SavedTrip[];
  account: AccountTripSummary[] | null;
  active: ActiveTrip | null;
  today: string;
}): TripEntry[] {
  const { saved, account, active, today } = input;
  const accountIds = new Set((account ?? []).map((trip) => trip.id));

  // La copie locale la plus récente d'un voyage du compte rejoint sa ligne ; les autres restent à part.
  const localCopy = new Map<string, SavedTrip>();
  for (const trip of saved) {
    const id = trip.config?.id;
    if (!id || !accountIds.has(id)) continue;
    const current = localCopy.get(id);
    if (!current || isNewer(trip, current)) localCopy.set(id, trip);
  }
  const merged = new Set([...localCopy.values()].map((trip) => trip.id));

  const entries: TripEntry[] = (account ?? []).map((trip) => {
    const copy = localCopy.get(trip.id) ?? null;
    const config = normalizeTripConfig(trip.config) ?? normalizeTripConfig(copy?.config);
    return {
      key: `account:${trip.id}`,
      name: trip.name || config?.name || "Voyage",
      config,
      ...fromConfig(config, today),
      nights: config ? daysBetween(config.start.date, config.end.date) : (copy?.nights ?? null),
      km: copy?.km ?? null,
      saved: copy,
      account: { ...trip, config },
      active: false,
    };
  });
  for (const trip of saved) if (!merged.has(trip.id)) entries.push(savedEntry(trip, today));

  if (active) {
    const index = entries.findIndex(
      (entry) =>
        (entry.account && entry.account.id === active.accountTripId && active.config.id === entry.account.id) ||
        (!!active.savedId && entry.saved?.id === active.savedId && (!entry.account || entry.account.id === active.config.id)),
    );
    const fresh = {
      name: active.config.name,
      config: active.config,
      ...fromConfig(active.config, active.today),
      nights: daysBetween(active.config.start.date, active.config.end.date),
      km: active.km,
      active: true,
    };
    if (index >= 0) entries[index] = { ...entries[index], ...fresh };
    else entries.push({ key: "active", saved: null, account: null, ...fresh });
  }
  return entries;
}

export type TripGroups = { during: TripEntry[]; upcoming: TripEntry[]; past: TripEntry[] };

/** En cours, à venir (le plus proche d'abord, puis sans date), passés (le plus récent d'abord). */
export function groupTrips(entries: TripEntry[]): TripGroups {
  const byStart = (a: TripEntry, b: TripEntry) => (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999");
  return {
    during: entries.filter((e) => e.phase === "during").sort(byStart),
    upcoming: entries.filter((e) => e.phase === "before" || e.phase === "undated").sort(byStart),
    past: entries.filter((e) => e.phase === "after").sort((a, b) => (b.endDate ?? "").localeCompare(a.endDate ?? "")),
  };
}

/** « demain », « dans 5 jours », « dans 3 semaines », « dans 7 mois », « dans 2 ans ». */
export function startsInLabel(today: string, startDate: string): string {
  const days = daysBetween(today, startDate);
  if (days <= 0) return "aujourd’hui";
  if (days === 1) return "demain";
  if (days < 14) return `dans ${days} jours`;
  if (days < 60) return `dans ${Math.round(days / 7)} semaines`;
  const months = Math.round(days / 30.44);
  if (months < 18) return `dans ${months} mois`;
  const years = Math.round(days / 365.25);
  return `dans ${years} an${years > 1 ? "s" : ""}`;
}

/** « sept. 2026 », pour la liste des voyages passés. */
export function monthLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${isoDate}T12:00:00Z`));
}

/** Jour du voyage (1 pour le premier) et nombre de jours. */
export function dayProgress(startDate: string, endDate: string, today: string): { day: number; total: number } {
  const total = daysBetween(startDate, endDate) + 1;
  const day = Math.min(total, Math.max(1, daysBetween(startDate, today) + 1));
  return { day, total };
}
