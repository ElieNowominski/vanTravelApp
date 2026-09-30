import { useMemo, useRef, useState } from "react";
import { Cloud, FolderOpen, MapPinned, Upload } from "lucide-react";
import { SyncStatusButton } from "@/components/sync/sync-status-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseBackup, restoreBackup } from "@/lib/backup";
import { buildCatalog, findCatalogPlace } from "@/lib/catalog";
import { DEFAULT_VEHICLE } from "@/lib/constants";
import { DEFAULT_REGION_ID, getRegion } from "@/lib/regions";
import { slugify } from "@/lib/trip-config";
import { listSavedTrips } from "@/lib/trip-library";
import type { SavedTrip, TripConfig } from "@/lib/types";
import { useTripStore } from "@/store/trip-store";

/**
 * Affiché quand aucun voyage n'est chargé (première ouverture sur un appareil).
 * Trois portes : une sauvegarde, un circuit déjà dans la bibliothèque, un voyage neuf.
 */
export function TripSetupScreen() {
  const setTripConfig = useTripStore((s) => s.setTripConfig);
  const loadSavedTrip = useTripStore((s) => s.loadSavedTrip);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [library, setLibrary] = useState<SavedTrip[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const region = getRegion(DEFAULT_REGION_ID);
  const catalog = useMemo(() => buildCatalog(null), []);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startPlaceId, setStartPlaceId] = useState(catalog.towns[0]?.id ?? "");

  const importFile = async (file: File) => {
    setBusy(true);
    try {
      const backup = parseBackup(await file.text());
      const report = await restoreBackup(backup);
      const candidate = report.draftTrip ?? report.trips.find((trip) => trip.config) ?? null;
      if (candidate) {
        loadSavedTrip(candidate);
        return;
      }
      setStatus("Sauvegarde importée, mais aucun circuit avec des dates exploitables.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import impossible.");
    } finally {
      setBusy(false);
    }
  };

  const showLibrary = async () => {
    setBusy(true);
    try {
      setLibrary(await listSavedTrips());
    } catch {
      setStatus("Bibliothèque illisible sur ce navigateur.");
    } finally {
      setBusy(false);
    }
  };

  const createTrip = () => {
    const trimmed = name.trim();
    if (!trimmed) return setStatus("Donne un nom au voyage.");
    if (!startDate || !endDate) return setStatus("Renseigne les deux dates.");
    if (endDate < startDate) return setStatus("La fin précède le début.");
    const place = findCatalogPlace(catalog, startPlaceId);
    if (!place) return setStatus("Choisis un point de départ.");
    const config: TripConfig = {
      id: `trip-${slugify(trimmed)}-${startDate}`,
      schemaVersion: 1,
      name: trimmed,
      regionId: region.id,
      start: { placeId: place.id, date: startDate },
      end: { placeId: place.id, date: endDate },
      vehicle: { ...DEFAULT_VEHICLE },
      stays: [],
      plan: { days: [] },
    };
    setTripConfig(config, { reset: true });
  };

  return (
    // Le body ne défile pas (`overflow: hidden`) : l'écran porte son propre défilement, sinon le bas
    // du formulaire est hors de portée sur un petit iPhone.
    <main className="h-dvh overflow-y-auto overscroll-contain">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pt-[calc(1.5rem+env(safe-area-inset-top,0px))] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      <header className="flex flex-col gap-1">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">vanTravel</p>
        <h1 className="font-heading text-2xl leading-tight">Aucun voyage chargé sur cet appareil</h1>
        <p className="text-sm text-muted-foreground">
          Reprends une sauvegarde, rouvre un circuit enregistré ici, ou pars d’un voyage neuf.
        </p>
      </header>

      {status && (
        <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">
          {status}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="size-4" />
            Depuis le dépôt privé
          </CardTitle>
          <CardDescription>
            Le voyage partagé sur GitHub : colle ton token, choisis le voyage, tout arrive ici et reste synchronisé avec l’autre
            téléphone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SyncStatusButton variant="full" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="size-4" />
            Reprendre une sauvegarde
          </CardTitle>
          <CardDescription>
            Le fichier JSON exporté depuis la bibliothèque (ou depuis la console de l’ancienne version).
            Tout est ajouté ici, rien n’est écrasé.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => fileInputRef.current?.click()}>
            <Upload className="size-4" />
            Importer un fichier
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
          <Button variant="outline" disabled={busy} onClick={() => void showLibrary()}>
            <FolderOpen className="size-4" />
            Circuits déjà enregistrés
          </Button>
        </CardContent>
        {library && (
          <CardContent>
            {library.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun circuit dans la bibliothèque de ce navigateur.</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {library.map((trip) => (
                  <li key={trip.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{trip.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {trip.days[0]?.date ?? "sans date"} · {trip.nights} nuit{trip.nights > 1 ? "s" : ""}
                      </p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => loadSavedTrip(trip)}>
                      Ouvrir
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPinned className="size-4" />
            Nouveau voyage
          </CardTitle>
          <CardDescription>{region.name}. Le véhicule et les hébergements se règlent ensuite.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trip-name">Nom</Label>
            <Input
              id="trip-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Île du Sud 2027"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="trip-start">Début</Label>
              <Input
                id="trip-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="trip-end">Fin</Label>
              <Input id="trip-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trip-start-place">Départ</Label>
            <select
              id="trip-start-place"
              value={startPlaceId}
              onChange={(e) => setStartPlaceId(e.target.value)}
              // 16 px minimum : en dessous, iOS zoome la page au focus et ne revient pas toujours.
              className="h-11 rounded-lg border border-input bg-background px-3 text-base"
            >
              {catalog.towns.map((town) => (
                <option key={town.id} value={town.id}>
                  {town.name}
                </option>
              ))}
            </select>
          </div>
          <Button className="h-11 w-full sm:w-fit" onClick={createTrip}>
            Créer le voyage
          </Button>
        </CardContent>
      </Card>

      {import.meta.env.DEV && (
        <p className="text-xs text-muted-foreground">
          Mode développement : le voyage du dépôt privé se charge tout seul s’il existe (variable
          PRIVATE_DATA_DIR, fichier trips/index.json).
        </p>
      )}
      </div>
    </main>
  );
}
