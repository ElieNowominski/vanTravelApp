import { buildSavedTrip, listSavedTrips, putSavedTrip } from "@/lib/trip-library";
import { configFromSnapshot, isTripConfig } from "@/lib/trip-config";
import { normalizeMarks } from "@/lib/trip-marks";
import { migrateSnapshot } from "@/lib/migrations";
import { blobToDataUrl, dataUrlToBlob, getDocumentBlob, putDocumentBlob } from "@/lib/document-store";
import { chooseExportMethod, type ExportMethod } from "@/lib/pwa";
import type { SavedTrip, TripConfig, TripMark, TripSnapshot } from "@/lib/types";
import { currentSnapshot, useTripStore } from "@/store/trip-store";

export const BACKUP_APP = "vantravel";
/** 1 : sans voyage. 2 : avec `config`. 3 : contenu des documents (`documents`, data URL par id). */
export const BACKUP_VERSION = 3;

export type BackupDraft = TripSnapshot & {
  marks: TripMark[];
  activeSavedId: string | null;
  activeSavedName: string | null;
  config: TripConfig | null;
};

export type BackupFile = {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  /** Circuit affiché au moment de l'export (brouillon zustand). */
  draft: BackupDraft | null;
  /** Bibliothèque IndexedDB. */
  savedTrips: SavedTrip[];
  /** Contenu des photos et PDF, par `TripDocument.id` (data URL). Absent avant la v3. */
  documents?: Record<string, string>;
};

export type RestoreReport = {
  imported: number;
  updated: number;
  skipped: number;
  draftSavedAs: string | null;
  /** Le brouillon devenu circuit nommé, prêt à être ouvert. */
  draftTrip: SavedTrip | null;
  /** Tous les circuits présents dans le fichier, hydratés d'un voyage. */
  trips: SavedTrip[];
  /** Documents (photos, PDF) dont le contenu a été ajouté sur cet appareil. */
  documents: number;
};

export async function buildBackup(): Promise<BackupFile> {
  const state = useTripStore.getState();
  const draft = currentSnapshot(state);
  const savedTrips = await listSavedTrips();
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    draft: {
      ...draft,
      marks: state.marks,
      activeSavedId: state.activeSavedId,
      activeSavedName: state.activeSavedName,
      config: state.config,
    },
    savedTrips,
    documents: await collectDocumentBlobs([draft, ...savedTrips]),
  };
}

/** Identifiants de documents référencés par des snapshots, sans doublon. */
export function documentIdsOf(snapshots: Pick<TripSnapshot, "stops">[]): string[] {
  const ids = new Set<string>();
  for (const snapshot of snapshots) {
    for (const stop of Object.values(snapshot.stops ?? {})) {
      for (const doc of stop.documents ?? []) ids.add(doc.id);
    }
  }
  return [...ids];
}

async function collectDocumentBlobs(snapshots: Pick<TripSnapshot, "stops">[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const id of documentIdsOf(snapshots)) {
    const blob = await getDocumentBlob(id);
    if (blob) out[id] = await blobToDataUrl(blob);
  }
  return out;
}

export function backupFilename(date = new Date()): string {
  return `vantravel-sauvegarde-${date.toISOString().slice(0, 10)}.json`;
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Exporte la sauvegarde : feuille de partage sur iOS (Fichiers, AirDrop vers l'autre téléphone),
 * téléchargement ailleurs. Résout avec la méthode employée, `null` si le partage a été annulé.
 */
export async function exportJson(filename: string, data: unknown): Promise<ExportMethod | null> {
  const file = new File([JSON.stringify(data, null, 2)], filename, { type: "application/json" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  const canShareFiles = typeof nav.share === "function" && nav.canShare?.({ files: [file] }) === true;
  const method = chooseExportMethod({ userAgent: navigator.userAgent, canShareFiles });
  if (method === "share") {
    try {
      await nav.share({ files: [file], title: "Sauvegarde vanTravel" });
      return "share";
    } catch (error) {
      // Annulation par la personne : rien à faire. Autre échec : on retombe sur le téléchargement.
      if (error instanceof DOMException && error.name === "AbortError") return null;
    }
  }
  downloadJson(filename, data);
  return "download";
}

/**
 * Accepte le format `BackupFile` (v1 sans voyage, v2 avec) et le format « brut »
 * du snippet console (brouillon zustand `{ state, version }` + `savedTrips`).
 */
export function parseBackup(raw: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Le fichier n'est pas un JSON valide.");
  }
  if (!isRecord(parsed)) throw new Error("Le fichier ne ressemble pas à une sauvegarde.");

  const savedTrips = Array.isArray(parsed.savedTrips)
    ? parsed.savedTrips.filter(isSavedTripLike).map(hydrateSavedTrip)
    : [];

  const draft = parseDraft(parsed.draft);

  if (savedTrips.length === 0 && !draft) {
    throw new Error("Aucun circuit trouvé dans ce fichier.");
  }

  const documents: Record<string, string> = {};
  if (isRecord(parsed.documents)) {
    for (const [id, value] of Object.entries(parsed.documents)) {
      if (typeof value === "string" && value.startsWith("data:")) documents[id] = value;
    }
  }

  return {
    app: BACKUP_APP,
    version: typeof parsed.version === "number" ? parsed.version : 1,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString(),
    draft,
    savedTrips,
    documents,
  };
}

/**
 * Fusionne la sauvegarde dans la bibliothèque locale sans rien écraser de plus récent.
 * Le brouillon est ajouté comme circuit nommé : rien n'est perdu, rien n'est remplacé.
 * Les circuits sans voyage (v1) en reçoivent un, dérivé de leurs jours.
 */
export async function restoreBackup(backup: BackupFile): Promise<RestoreReport> {
  const existing = await listSavedTrips();
  const byId = new Map(existing.map((trip) => [trip.id, trip]));
  const report: RestoreReport = {
    imported: 0,
    updated: 0,
    skipped: 0,
    draftSavedAs: null,
    draftTrip: null,
    trips: [],
    documents: 0,
  };

  for (const raw of backup.savedTrips) {
    const trip: SavedTrip = {
      ...raw,
      config: isTripConfig(raw.config) ? raw.config : configFromSnapshot(raw, { name: raw.name }),
    };
    report.trips.push(trip);
    const local = byId.get(trip.id);
    if (!local) {
      await putSavedTrip(trip);
      report.imported += 1;
    } else if (trip.savedAt > local.savedAt) {
      await putSavedTrip(trip);
      report.updated += 1;
    } else {
      report.skipped += 1;
    }
  }

  if (backup.draft && hasContent(backup.draft)) {
    const base = backup.draft.activeSavedName?.trim() || backup.draft.config?.name || "Brouillon";
    const stamp = new Date(backup.exportedAt).toLocaleDateString("fr-FR");
    const config = backup.draft.config ?? configFromSnapshot(backup.draft, { name: base });
    const trip = buildSavedTrip(
      `${base} (import du ${stamp})`,
      backup.draft,
      undefined,
      backup.draft.marks,
      config,
    );
    await putSavedTrip(trip);
    report.draftSavedAs = trip.name;
    report.draftTrip = trip;
    report.trips.unshift(trip);
  }

  // Contenu des documents : on n'écrase jamais un blob déjà présent sur cet appareil.
  for (const [id, dataUrl] of Object.entries(backup.documents ?? {})) {
    try {
      if (await getDocumentBlob(id)) continue;
      await putDocumentBlob(id, await dataUrlToBlob(dataUrl));
      report.documents += 1;
    } catch {
      /* document illisible : les métadonnées restent, la fiche signale l'absence */
    }
  }

  return report;
}

function parseDraft(value: unknown): BackupDraft | null {
  if (!isRecord(value)) return null;
  // Format zustand persist : { state: {...}, version }.
  const state = isRecord(value.state) ? value.state : value;
  if (!Array.isArray(state.days) || !isRecord(state.stops)) return null;
  return {
    ...migrateSnapshot(state as Partial<TripSnapshot>),
    marks: normalizeMarks(state.marks as TripMark[] | undefined),
    activeSavedId: typeof state.activeSavedId === "string" ? state.activeSavedId : null,
    activeSavedName: typeof state.activeSavedName === "string" ? state.activeSavedName : null,
    config: isTripConfig(state.config) ? state.config : null,
  };
}

/** Un brouillon vide (seul le départ) ne mérite pas un circuit nommé. */
function hasContent(snapshot: TripSnapshot): boolean {
  const stopCount = snapshot.days.reduce((sum, day) => sum + day.stopIds.length, 0);
  return stopCount > 1 || snapshot.legs.length > 0 || snapshot.customPins.length > 0;
}

function isSavedTripLike(value: unknown): value is SavedTrip {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    Array.isArray(value.days) &&
    isRecord(value.stops) &&
    Array.isArray(value.legs)
  );
}

function hydrateSavedTrip(trip: SavedTrip): SavedTrip {
  return {
    ...migrateSnapshot(trip),
    savedAt: typeof trip.savedAt === "string" ? trip.savedAt : new Date(0).toISOString(),
    marks: normalizeMarks(trip.marks),
    config: isTripConfig(trip.config) ? trip.config : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
