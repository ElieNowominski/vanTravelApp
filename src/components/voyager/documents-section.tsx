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
import { useTripStore } from "@/store/trip-store";

/**
 * Photos et PDF d'une étape : compressés côté client (~300 Ko), stockés dans IndexedDB.
 * Le chemin `trips/<voyage>/docs/<id>.<ext>` est réservé pour la synchro (phase 5).
 */
export function DocumentsSection({ stopId, documents }: { stopId: string; documents: TripDocument[] }) {
  const tripId = useTripStore((s) => s.config?.id ?? "voyage");
  const addDocument = useTripStore((s) => s.addDocument);
  const removeDocument = useTripStore((s) => s.removeDocument);
  const updateCaption = useTripStore((s) => s.updateDocumentCaption);
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
      addDocument(stopId, {
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
    <div className="flex flex-col gap-3">
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

      {documents.length === 0 && !busy && (
        <p className="text-sm text-muted-foreground">
          Confirmation de réservation, ticket, plan du camping : tout reste sur le téléphone, lisible sans réseau.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {documents.map((doc) => (
          <DocumentRow
            key={doc.id}
            doc={doc}
            onCaption={(caption) => updateCaption(stopId, doc.id, caption)}
            onRemove={async () => {
              removeDocument(stopId, doc.id);
              await deleteDocumentBlob(doc.id);
            }}
          />
        ))}
      </ul>
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
