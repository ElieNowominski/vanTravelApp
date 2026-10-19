import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DocumentList, DocumentTiles } from "@/components/voyager/document-list";
import { VoyagerFrame } from "@/components/voyager/voyager-frame";
import { countDocuments, groupDocuments, scopeLabel, type DocumentFilter } from "@/lib/documents";
import { formatBytes } from "@/lib/freeze";
import { cn } from "@/lib/utils";
import { useTripStore } from "@/store/trip-store";

const FILTERS: Array<{ id: DocumentFilter; label: string }> = [
  { id: "all", label: "Tous" },
  { id: "trip", label: "Voyage" },
  { id: "nuit", label: "Nuits" },
  { id: "activite", label: "Activités" },
];

/**
 * Documents du voyage (`/documents`) : ceux du voyage (passeport, assurance, contrat du van) se gèrent ici,
 * ceux des étapes s'ouvrent ici et se gèrent sur la fiche de l'étape.
 */
export function DocumentsPage() {
  return (
    <VoyagerFrame active="documents">
      <DocumentsBody />
    </VoyagerFrame>
  );
}

function DocumentsBody() {
  const days = useTripStore((s) => s.days);
  const stops = useTripStore((s) => s.stops);
  const tripDocuments = useTripStore((s) => s.tripDocuments);
  const addTripDocument = useTripStore((s) => s.addTripDocument);
  const updateTripDocumentCaption = useTripStore((s) => s.updateTripDocumentCaption);
  const removeTripDocument = useTripStore((s) => s.removeTripDocument);
  const [filter, setFilter] = useState<DocumentFilter>("all");
  const [query, setQuery] = useState("");

  const snapshot = useMemo(() => ({ days, stops, tripDocuments }), [days, stops, tripDocuments]);
  const groups = useMemo(() => groupDocuments(snapshot, { filter, query }), [snapshot, filter, query]);
  const counts = useMemo(() => countDocuments(snapshot), [snapshot]);
  const showTripSection = (filter === "all" || filter === "trip") && !query.trim();
  const stopGroups = groups.filter((group) => group.key !== "trip");
  const tripGroup = groups.find((group) => group.key === "trip");

  return (
    <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <header className="border-b bg-background px-4 pt-2 pb-3">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs tracking-wide text-muted-foreground uppercase">
                Tout le voyage · {counts.count} document{counts.count > 1 ? "s" : ""}
              </p>
              <h1 className="text-xl leading-tight font-semibold">Documents</h1>
            </div>
            <p className="text-xs text-muted-foreground">{formatBytes(counts.bytes)} sur l’appareil</p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Légende, étape, lieu…"
              aria-label="Rechercher un document"
              className="h-11 pl-9"
            />
          </div>
          <div role="group" aria-label="Filtrer" className="flex flex-wrap gap-1.5">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={filter === option.id}
                onClick={() => setFilter(option.id)}
                className={cn(
                  "h-9 rounded-full px-3 text-sm ring-1",
                  filter === option.id ? "bg-primary text-primary-foreground ring-primary" : "bg-background ring-foreground/15",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-3 pb-8">
        {showTripSection ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">
              Voyage <span className="font-normal text-muted-foreground">· hors étape</span>
            </h2>
            <DocumentList
              documents={tripDocuments}
              onAdd={addTripDocument}
              onCaption={updateTripDocumentCaption}
              onRemove={removeTripDocument}
              emptyText="Passeport, assurance, contrat du van : les documents qui ne tiennent à aucune étape."
            />
          </section>
        ) : (
          tripGroup && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">
                Voyage <span className="font-normal text-muted-foreground">· hors étape</span>
              </h2>
              <DocumentTiles documents={tripGroup.documents} />
            </section>
          )
        )}

        {stopGroups.map((group) => (
          <section key={group.key} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="truncate text-sm font-semibold">
                {group.label}
                {group.dayIndex != null ? <span className="font-normal text-muted-foreground"> · jour {group.dayIndex + 1}</span> : null}
              </h2>
              <Link to={`/etape/${group.key}`} className="shrink-0 text-sm font-medium text-primary">
                Fiche
              </Link>
            </div>
            <DocumentTiles documents={group.documents} badge={(doc) => (filter === "all" ? scopeBadge(doc.scope) : null)} />
          </section>
        ))}

        {stopGroups.length === 0 && filter !== "trip" && (
          <p className="text-sm text-muted-foreground">
            {query.trim() ? "Aucun document ne correspond." : "Les documents d’une étape s’ajoutent depuis sa fiche, section Documents."}
          </p>
        )}
      </div>
    </main>
  );
}

function scopeBadge(scope: "nuit" | "activite" | undefined): string | null {
  if (!scope) return null;
  return scope === "nuit" ? "nuit" : scopeLabel(scope).toLowerCase().replace(/s$/, "");
}
