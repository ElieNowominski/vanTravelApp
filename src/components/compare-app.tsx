
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { CompareMap } from "@/components/compare-map";
import { TripMarksEditor } from "@/components/trip-marks-editor";
import { Button, buttonVariants } from "@/components/ui/button";
import { COMPARE_COLORS, COMPARE_MAX, DEFAULT_VEHICLE } from "@/lib/constants";
import { compareStats } from "@/lib/compare";
import { formatDuration, formatKm } from "@/lib/format";
import { newId } from "@/lib/geo";
import {
  listSavedTrips,
  patchSavedTripMarks,
} from "@/lib/trip-library";
import type { SavedTrip, TripMark, TripMarkKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useTripStore } from "@/store/trip-store";

const SELECT_KEY = "nz-van-compare-ids";

export function CompareApp() {
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const activeSavedId = useTripStore((s) => s.activeSavedId);
  const setMarks = useTripStore((s) => s.setMarks);
  const config = useTripStore((s) => s.config);
  const maxDriveHours = config?.vehicle.maxComfortableDriveHours ?? DEFAULT_VEHICLE.maxComfortableDriveHours;

  const refresh = useCallback(
    (keepIds?: string[]) =>
      listSavedTrips().then((all) => {
        setTrips(all);
        setSelected((prev) => {
          const wanted = keepIds ?? prev;
          const valid = wanted.filter((id) => all.some((trip) => trip.id === id));
          if (valid.length > 0) return valid.slice(0, COMPARE_MAX);
          return all.slice(0, Math.min(2, all.length)).map((trip) => trip.id);
        });
        setLoading(false);
      }),
    [],
  );

  useEffect(() => {
    let ids: string[] | undefined;
    try {
      const raw = sessionStorage.getItem(SELECT_KEY);
      if (raw) ids = JSON.parse(raw) as string[];
    } catch {
      ids = undefined;
    }
    void refresh(ids);
  }, [refresh]);

  useEffect(() => {
    if (selected.length === 0) return;
    sessionStorage.setItem(SELECT_KEY, JSON.stringify(selected));
  }, [selected]);

  const chosen = useMemo(
    () => selected.map((id) => trips.find((trip) => trip.id === id)).filter((trip): trip is SavedTrip => Boolean(trip)),
    [selected, trips],
  );
  const stats = useMemo(() => chosen.map(compareStats), [chosen]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= COMPARE_MAX) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  const persistMarks = async (tripId: string, marks: TripMark[]) => {
    await patchSavedTripMarks(tripId, marks);
    setTrips((prev) => prev.map((trip) => (trip.id === tripId ? { ...trip, marks } : trip)));
    if (activeSavedId === tripId) setMarks(marks);
  };

  const addMark = (trip: SavedTrip, kind: TripMarkKind, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const next = [...trip.marks, { id: newId("mark"), kind, text: trimmed }];
    void persistMarks(trip.id, next);
  };

  const removeMark = (trip: SavedTrip, id: string) => {
    void persistMarks(
      trip.id,
      trip.marks.filter((mark) => mark.id !== id),
    );
  };

  const minKm = Math.min(...stats.map((item) => item.km), Infinity);
  const minSec = Math.min(...stats.map((item) => item.driveSec), Infinity);

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-2.5">
        <Link
          to="/"
          className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))}
          title="Retour au circuit"
        >
          <ArrowLeft className="size-3.5" />
        </Link>
        <div className="min-w-0">
          <h1 className="font-heading text-base leading-tight">Comparer les circuits</h1>
          <p className="text-xs text-muted-foreground">Jusqu’à {COMPARE_MAX} variantes · une couleur chacun</p>
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap gap-2 border-b px-4 py-2">
        {loading && <p className="text-xs text-muted-foreground">Chargement…</p>}
        {!loading && trips.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Enregistre au moins deux circuits (icône dossier) pour les comparer.
          </p>
        )}
        {trips.map((trip) => {
          const index = selected.indexOf(trip.id);
          const on = index >= 0;
          return (
            <Button
              key={trip.id}
              size="sm"
              variant={on ? "default" : "outline"}
              onClick={() => toggle(trip.id)}
              className="max-w-56"
              style={on ? { backgroundColor: COMPARE_COLORS[index], borderColor: COMPARE_COLORS[index] } : undefined}
            >
              <span className="truncate">{trip.name}</span>
            </Button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-[32vh] flex-[1.15] border-b">
          {chosen.length === 0 ? (
            <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
              Choisis 2 ou 3 circuits ci-dessus.
            </div>
          ) : (
            <CompareMap
              trips={chosen}
              colors={chosen.map((_, i) => COMPARE_COLORS[i] ?? COMPARE_COLORS[0])}
            />
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {chosen.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Rien à comparer pour l’instant.</p>
          ) : (
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
              <section>
                <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Stats
                </h2>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-3 py-1.5 font-medium"> </th>
                        {chosen.map((trip, i) => (
                          <th key={trip.id} className="px-3 py-1.5 font-medium">
                            <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: COMPARE_COLORS[i] }} />
                            {trip.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <MetricRow
                        label="Distance"
                        values={stats.map((item) => formatKm(item.km))}
                        highlight={stats.map((item) => item.km === minKm && minKm > 0)}
                      />
                      <MetricRow
                        label="Conduite van"
                        values={stats.map((item) => formatDuration(item.driveSec))}
                        highlight={stats.map((item) => item.driveSec === minSec && minSec > 0)}
                      />
                      <MetricRow label="Nuits posées" values={stats.map((item) => String(item.nights))} />
                      <MetricRow
                        label={`Jours > ${maxDriveHours} h`}
                        values={stats.map((item) => String(item.longDays))}
                        warn={stats.map((item) => item.longDays > 0)}
                      />
                      <MetricRow
                        label="Jour le plus long"
                        values={stats.map((item) => formatDriveDay(item.maxDriveDay))}
                      />
                      <MetricRow
                        label="Jour le plus court"
                        values={stats.map((item) => formatDriveDay(item.minDriveDay))}
                      />
                      <MetricRow label="Étapes" values={stats.map((item) => String(item.stopCount))} />
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Nuits
                </h2>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-3 py-1.5 font-medium">Jour</th>
                        {chosen.map((trip, i) => (
                          <th key={trip.id} className="px-3 py-1.5 font-medium">
                            <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: COMPARE_COLORS[i] }} />
                            {trip.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(stats[0]?.overnights ?? []).map((night, dayIndex) => (
                        <tr key={night.dayIndex} className="border-b last:border-b-0">
                          <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                            J{dayIndex + 1} · {night.label}
                          </td>
                          {stats.map((item, i) => {
                            const name = item.overnights[dayIndex]?.name;
                            return (
                              <td key={`${chosen[i]?.id}-n${dayIndex}`} className="px-3 py-1.5">
                                {name ?? <span className="text-muted-foreground">—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Plus et moins
                </h2>
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: `repeat(${chosen.length}, minmax(0, 1fr))` }}
                >
                  {chosen.map((trip, i) => (
                    <div key={trip.id} className="rounded-lg border p-3">
                      <p className="mb-2 truncate text-xs font-medium" style={{ color: COMPARE_COLORS[i] }}>
                        {trip.name}
                      </p>
                      <TripMarksEditor
                        marks={trip.marks}
                        onAdd={(kind, text) => addMark(trip, kind, text)}
                        onRemove={(id) => removeMark(trip, id)}
                      />
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDriveDay(day: { dayIndex: number; label: string; driveSec: number; km: number } | null): string {
  if (!day) return "—";
  const time = day.driveSec <= 0 ? "0 min" : formatDuration(day.driveSec);
  const distance = day.km <= 0 ? "0 km" : formatKm(day.km);
  return `J${day.dayIndex + 1} · ${day.label} · ${distance} · ${time}`;
}

function MetricRow({
  label,
  values,
  highlight,
  warn,
}: {
  label: string;
  values: string[];
  highlight?: boolean[];
  warn?: boolean[];
}) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-3 py-1.5 text-muted-foreground">{label}</td>
      {values.map((value, i) => (
        <td
          key={`${label}-${i}`}
          className={`px-3 py-1.5 ${highlight?.[i] ? "font-semibold text-emerald-800" : ""} ${
            warn?.[i] ? "text-destructive" : ""
          }`}
        >
          {value}
        </td>
      ))}
    </tr>
  );
}
