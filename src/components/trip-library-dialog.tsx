
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Copy, Download, FolderOpen, Lock, LockOpen, Pencil, Save, Trash2, Upload } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { backupFilename, buildBackup, downloadJson, parseBackup, restoreBackup } from "@/lib/backup";
import { formatKm } from "@/lib/format";
import { countDroppedOptions, formatBytes, freezeSnapshot, jsonBytes } from "@/lib/freeze";
import { newId } from "@/lib/geo";
import {
  buildSavedTrip,
  deleteSavedTrip,
  listSavedTrips,
  putSavedTrip,
  suggestTripName,
} from "@/lib/trip-library";
import type { SavedTrip } from "@/lib/types";
import { currentSnapshot, dayStats, useTripStore } from "@/store/trip-store";

export function TripLibraryButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="icon-sm" onClick={() => setOpen(true)} title="Circuits enregistrés">
        <FolderOpen className="size-3.5" />
      </Button>
      {/* Monté seulement quand ouvert : l'état initial se calcule à l'ouverture, sans effet. */}
      {open ? <TripLibraryDialog onOpenChange={setOpen} /> : null}
    </>
  );
}

function TripLibraryDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const state = useTripStore();
  const snapshot = currentSnapshot(state);
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(() => state.activeSavedName || suggestTripName(snapshot));
  const [status, setStatus] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(
    () =>
      listSavedTrips()
        .then((all) => setTrips(all))
        .catch(() => setStatus("Impossible de lire la bibliothèque."))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (asNew: boolean) => {
    try {
      const id = !asNew && state.activeSavedId ? state.activeSavedId : newId("trip");
      const trip = buildSavedTrip(name, snapshot, id, state.marks, state.config);
      await putSavedTrip(trip);
      state.setActiveSaved(trip.id, trip.name);
      setStatus(asNew || !state.activeSavedId ? "Circuit enregistré." : "Circuit mis à jour.");
      await refresh();
    } catch {
      setStatus("Enregistrement impossible sur ce navigateur.");
    }
  };

  const openTrip = (trip: SavedTrip) => {
    if (state.activeSavedId !== trip.id) {
      const ok = window.confirm("Le circuit affiché sera remplacé. Enregistre-le avant si besoin.");
      if (!ok) return;
    }
    state.loadSavedTrip(trip);
    onOpenChange(false);
  };

  const duplicate = async (trip: SavedTrip) => {
    const copy = buildSavedTrip(`${trip.name} (copie)`, trip, newId("trip"), trip.marks, trip.config ?? null);
    await putSavedTrip(copy);
    await refresh();
  };

  const rename = async (trip: SavedTrip) => {
    const next = renameValue.trim();
    if (!next) return;
    await putSavedTrip({ ...trip, name: next, savedAt: new Date().toISOString() });
    if (state.activeSavedId === trip.id) state.setActiveSaved(trip.id, next);
    setRenamingId(null);
    await refresh();
  };

  const remove = async (trip: SavedTrip) => {
    if (!window.confirm(`Supprimer « ${trip.name} » ?`)) return;
    await deleteSavedTrip(trip.id);
    if (state.activeSavedId === trip.id) state.setActiveSaved(null, null);
    await refresh();
  };

  /** Figer : une géométrie par tronçon, puis mise à jour du circuit enregistré s'il y en a un. */
  const freeze = async () => {
    state.freezeItinerary();
    const next = useTripStore.getState();
    if (next.activeSavedId) {
      const trip = buildSavedTrip(next.activeSavedName ?? name, currentSnapshot(next), next.activeSavedId, next.marks, next.config);
      await putSavedTrip(trip);
      await refresh();
    }
    setStatus("Itinéraire figé : une seule route par tronçon, mode Voyager par défaut.");
  };

  const unfreeze = async () => {
    state.unfreezeItinerary();
    const next = useTripStore.getState();
    if (next.activeSavedId) {
      const trip = buildSavedTrip(next.activeSavedName ?? name, currentSnapshot(next), next.activeSavedId, next.marks, next.config);
      await putSavedTrip(trip);
      await refresh();
    }
    setStatus("Itinéraire rouvert à la planification.");
  };

  const exportAll = async () => {
    setBusy(true);
    try {
      const backup = await buildBackup();
      downloadJson(backupFilename(), backup);
      setStatus(
        `Sauvegarde téléchargée : circuit affiché + ${backup.savedTrips.length} circuit${
          backup.savedTrips.length > 1 ? "s" : ""
        } enregistré${backup.savedTrips.length > 1 ? "s" : ""}.`,
      );
    } catch {
      setStatus("Export impossible.");
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File) => {
    setBusy(true);
    try {
      const backup = parseBackup(await file.text());
      const report = await restoreBackup(backup);
      const parts = [
        report.imported > 0 ? `${report.imported} ajouté${report.imported > 1 ? "s" : ""}` : null,
        report.updated > 0 ? `${report.updated} mis à jour` : null,
        report.skipped > 0 ? `${report.skipped} déjà à jour` : null,
        report.draftSavedAs ? `brouillon enregistré sous « ${report.draftSavedAs} »` : null,
      ].filter(Boolean);
      setStatus(parts.length > 0 ? `Import terminé : ${parts.join(", ")}.` : "Rien à importer.");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Circuits enregistrés</DialogTitle>
          <DialogDescription>
            Sur ce navigateur, sur ce PC. Éteindre l’ordinateur ne les efface pas.{" "}
            <Link to="/comparer" className="text-foreground underline underline-offset-2">
              Comparer
            </Link>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="trip-name">Nom</Label>
          <div className="flex gap-2">
            <Input
              id="trip-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Milford d’abord"
            />
            <Button size="sm" onClick={() => void save(false)}>
              <Save className="size-3.5" />
              {state.activeSavedId ? "Maj" : "Sauver"}
            </Button>
          </div>
          {state.activeSavedId && (
            <Button variant="outline" size="sm" className="w-fit" onClick={() => void save(true)}>
              Enregistrer sous un autre nom
            </Button>
          )}
          {status && <p className="text-xs text-muted-foreground">{status}</p>}
        </div>

        <ul className="max-h-64 overflow-auto rounded-lg border">
          {loading && trips.length === 0 && (
            <li className="px-3 py-4 text-xs text-muted-foreground">Chargement…</li>
          )}
          {!loading && trips.length === 0 && (
            <li className="px-3 py-4 text-xs text-muted-foreground">Aucun circuit nommé pour l’instant.</li>
          )}
          {trips.map((trip) => {
            const km = trip.km || snapshotStatsSafe(trip);
            return (
              <li key={trip.id} className="border-b px-3 py-2 last:border-b-0">
                {renamingId === trip.id ? (
                  <div className="flex gap-2">
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void rename(trip);
                      }}
                    />
                    <Button size="xs" onClick={() => void rename(trip)}>
                      OK
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="truncate text-sm font-medium">
                      {trip.name}
                      {state.activeSavedId === trip.id ? (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">(ouvert)</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatKm(km)} · {trip.nights} nuit{trip.nights > 1 ? "s" : ""} ·{" "}
                      {new Date(trip.savedAt).toLocaleString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Button size="xs" variant="secondary" onClick={() => openTrip(trip)}>
                        Ouvrir
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => {
                          setRenamingId(trip.id);
                          setRenameValue(trip.name);
                        }}
                      >
                        <Pencil className="size-3" />
                        Renommer
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => void duplicate(trip)}>
                        <Copy className="size-3" />
                        Dupliquer
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => void remove(trip)}>
                        <Trash2 className="size-3" />
                        Supprimer
                      </Button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-1.5 border-t pt-3">
          <p className="text-xs font-medium">Itinéraire</p>
          {state.frozenAt ? (
            <>
              <p className="text-xs text-muted-foreground">
                Figé le {new Date(state.frozenAt).toLocaleDateString("fr-FR")} : une route par tronçon, l’app s’ouvre en
                mode Voyager.
              </p>
              <Button variant="outline" size="sm" className="w-fit" onClick={() => void unfreeze()}>
                <LockOpen className="size-3.5" />
                Rouvrir à la planification
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Une fois le circuit arrêté, figer ne garde que la route choisie par tronçon
                {countDroppedOptions(snapshot.legs) > 0
                  ? ` (${countDroppedOptions(snapshot.legs)} alternative${countDroppedOptions(snapshot.legs) > 1 ? "s" : ""} retirée${countDroppedOptions(snapshot.legs) > 1 ? "s" : ""}, ${formatBytes(jsonBytes(snapshot))} → ${formatBytes(jsonBytes(freezeSnapshot(snapshot)))})`
                  : ""}
                .
              </p>
              <ConfirmAction
                variant="outline"
                size="sm"
                className="w-fit"
                icon={<Lock className="size-3.5" />}
                label="Figer l’itinéraire"
                question="Retirer les routes alternatives ?"
                confirmLabel="Figer"
                disabled={snapshot.legs.length === 0}
                onConfirm={freeze}
              />
            </>
          )}
        </div>

        <div className="flex flex-col gap-1.5 border-t pt-3">
          <p className="text-xs font-medium">Sauvegarde</p>
          <p className="text-xs text-muted-foreground">
            Un fichier JSON avec le circuit affiché et tous les circuits enregistrés, tracés compris.
            L’import ajoute sans écraser ce qui est plus récent ici.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void exportAll()}>
              <Download className="size-3.5" />
              Exporter
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3.5" />
              Importer
            </Button>
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function snapshotStatsSafe(trip: SavedTrip): number {
  if (trip.km) return trip.km;
  return trip.days.reduce((sum, _d, i) => sum + dayStats(trip, i).km, 0);
}
