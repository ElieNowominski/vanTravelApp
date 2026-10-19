import { useRef, useState } from "react";
import { Camera, FileText, Paperclip, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDocumentUrl } from "@/hooks/use-document-url";
import { useDraftField } from "@/hooks/use-draft-field";
import { deleteDocumentBlob, putDocumentBlob } from "@/lib/document-store";
import { formatBytes } from "@/lib/freeze";
import { newId } from "@/lib/geo";
import { extensionFor, prepareDocument } from "@/lib/image-compress";
import type { TripDocument } from "@/lib/types";
import type { DocumentInput } from "@/store/travel-slice";
import { useTripStore } from "@/store/trip-store";

/**
 * Liste gérable de documents (photo ou PDF) : ajout par l'appareil photo ou un fichier, légende, suppression.
 * Le contenu est compressé côté client (~300 Ko) et vit dans IndexedDB ; l'entité ne porte que les
 * métadonnées. Qui possède la liste (une étape, le voyage) est l'affaire de l'appelant.
 */
export function DocumentList({
  documents,
  onAdd,
  onCaption,
  onRemove,
  emptyText,
}: {
  documents: TripDocument[];
  onAdd: (input: DocumentInput) => void;
  onCaption: (documentId: string, caption: string) => void;
  onRemove: (documentId: string) => void;
  emptyText?: string;
}) {
  const tripId = useTripStore((s) => s.config?.id ?? "voyage");
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const ingest = async (file: File) => {
    setBusy(true);
    setStatus(null);
    try {
      const { blob, kind } = await prepareDocument(file);
      const id = newId("doc");
      await putDocumentBlob(id, blob);
      onAdd({
        id,
        kind,
        caption: file.name.replace(/\.[a-z0-9]+$/i, ""),
        path: `trips/${tripId}/docs/${id}.${extensionFor(blob.type)}`,
        size: blob.size,
        mimeType: blob.type,
      });
      setStatus(
        file.size !== blob.size
          ? `Ajouté : ${formatBytes(file.size)} → ${formatBytes(blob.size)}.`
          : `Ajouté (${formatBytes(blob.size)}).`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ajout impossible.");
    } finally {
      setBusy(false);
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    void (async () => {
      for (const file of files) await ingest(file);
    })();
  };

  return (
    <div className="flex flex-col gap-2">
      {documents.length === 0 && !busy && emptyText && <p className="text-sm text-muted-foreground">{emptyText}</p>}
      <ul className="flex flex-col gap-2">
        {documents.map((doc) => (
          <DocumentRow
            key={doc.id}
            doc={doc}
            onCaption={(caption) => onCaption(doc.id, caption)}
            onRemove={async () => {
              onRemove(doc.id);
              await deleteDocumentBlob(doc.id);
            }}
          />
        ))}
      </ul>
      <div className="flex gap-2">
        <Button variant="outline" className="h-11 flex-1" disabled={busy} onClick={() => cameraRef.current?.click()}>
          <Camera className="size-4" />
          Photo
        </Button>
        <Button variant="outline" className="h-11 flex-1" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Paperclip className="size-4" />
          Fichier ou PDF
        </Button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={onPick} />
      </div>
      {busy && <p className="text-xs text-muted-foreground">Compression en cours…</p>}
      {status && <p className="text-xs text-muted-foreground">{status}</p>}
    </div>
  );
}

function DocumentRow({ doc, onCaption, onRemove }: { doc: TripDocument; onCaption: (caption: string) => void; onRemove: () => Promise<void> }) {
  const { url, missing } = useDocumentUrl(doc.id);
  const caption = useDraftField(doc.caption ?? "", onCaption);

  return (
    <li className="flex gap-3 rounded-xl bg-card p-2 ring-1 ring-foreground/10">
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted"
        aria-label={doc.kind === "pdf" ? "Ouvrir le PDF" : "Ouvrir la photo"}
      >
        {doc.kind === "image" && url ? (
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <FileText className="size-8 text-muted-foreground" />
        )}
      </a>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Input
          value={caption.draft}
          onChange={(e) => caption.setDraft(e.target.value)}
          onBlur={caption.commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder="Légende"
          className="h-9"
          aria-label="Légende du document"
        />
        <p className="text-xs text-muted-foreground">
          {doc.kind === "pdf" ? "PDF" : "Photo"} · {formatBytes(doc.size)}
          {missing ? " · contenu absent sur cet appareil" : ""}
        </p>
        <div className="mt-auto">
          <ConfirmAction
            size="sm"
            className="h-9"
            icon={<Trash2 className="size-3.5" />}
            label="Supprimer"
            question="Supprimer ce document ?"
            confirmLabel="Supprimer"
            onConfirm={onRemove}
          />
        </div>
      </div>
    </li>
  );
}

/** Vignettes en lecture seule (page Documents) : ouvrir le fichier, rien d'autre. */
export function DocumentTiles({ documents, badge }: { documents: TripDocument[]; badge?: (doc: TripDocument) => string | null }) {
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
      {documents.map((doc) => (
        <DocumentTile key={doc.id} doc={doc} badge={badge?.(doc) ?? null} />
      ))}
    </ul>
  );
}

function DocumentTile({ doc, badge }: { doc: TripDocument; badge: string | null }) {
  const { url, missing } = useDocumentUrl(doc.id);
  return (
    <li>
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="relative flex aspect-square flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl bg-card p-1.5 ring-1 ring-foreground/10"
        aria-label={`${doc.caption || (doc.kind === "pdf" ? "PDF" : "Photo")}${missing ? ", contenu absent sur cet appareil" : ""}`}
      >
        {doc.kind === "image" && url ? (
          <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <FileText className="size-7 text-muted-foreground" aria-hidden />
        )}
        {badge && (
          <span className="absolute top-1.5 left-1.5 rounded-full bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
            {badge}
          </span>
        )}
        <span
          className={cnTile(doc.kind === "image" && !!url)}
        >
          {doc.caption || (doc.kind === "pdf" ? "PDF" : "Photo")}
        </span>
      </a>
    </li>
  );
}

function cnTile(overImage: boolean): string {
  return overImage
    ? "absolute inset-x-1.5 bottom-1.5 truncate rounded-md bg-background/90 px-1.5 py-0.5 text-center text-[11px] leading-tight"
    : "w-full truncate px-1 text-center text-[11px] leading-tight";
}
