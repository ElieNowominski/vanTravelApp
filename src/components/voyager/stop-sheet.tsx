import { useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { BookingCard } from "@/components/voyager/booking-card";
import { BookingForm } from "@/components/voyager/booking-form";
import { ChecklistSection } from "@/components/voyager/checklist-section";
import { DocumentsSection } from "@/components/voyager/documents-section";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useDraftField } from "@/hooks/use-draft-field";
import { catalogKindLabel } from "@/lib/trip-plan";
import type { Booking, Stop } from "@/lib/types";
import { cn } from "@/lib/utils";
import { mapsDirectionsUrl } from "@/lib/voyager";
import { useTripStore } from "@/store/trip-store";

type Tab = "bookings" | "documents" | "checklist" | "notes";

/** Fiche étape : réservations, documents, checklist, notes. Panneau bas sur mobile. */
export function StopSheet({
  stop,
  defaultCurrency,
  onClose,
  initialTab = "bookings",
}: {
  stop: Stop | null;
  defaultCurrency: string;
  onClose: () => void;
  initialTab?: Tab;
}) {
  return (
    <Sheet open={stop != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:max-w-lg"
      >
        {stop && <StopSheetBody key={stop.id} stop={stop} defaultCurrency={defaultCurrency} initialTab={initialTab} />}
      </SheetContent>
    </Sheet>
  );
}

function StopSheetBody({ stop, defaultCurrency, initialTab }: { stop: Stop; defaultCurrency: string; initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [editing, setEditing] = useState<Booking | null | "new">(null);
  const upsertBooking = useTripStore((s) => s.upsertBooking);
  const removeBooking = useTripStore((s) => s.removeBooking);
  const addChecklistItem = useTripStore((s) => s.addChecklistItem);
  const toggleChecklistItem = useTripStore((s) => s.toggleChecklistItem);
  const removeChecklistItem = useTripStore((s) => s.removeChecklistItem);
  const setStopNotes = useTripStore((s) => s.setStopNotes);
  const notes = useDraftField(stop.notes ?? "", (next) => setStopNotes(stop.id, next));

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "bookings", label: "Réservations", count: stop.bookings.length },
    { id: "documents", label: "Documents", count: stop.documents.length },
    { id: "checklist", label: "Checklist", count: stop.checklist.filter((i) => !i.done).length },
    { id: "notes", label: "Notes" },
  ];

  return (
    <>
      <SheetHeader className="p-0 pr-10">
        <SheetTitle className="text-lg leading-tight">{stop.name}</SheetTitle>
        <SheetDescription>
          {catalogKindLabel(stop.kind, typeof stop.meta?.category === "string" ? stop.meta.category : undefined)}
          {stop.area ? ` · ${stop.area}` : ""}
          {stop.isOvernight ? " · nuit" : ""}
        </SheetDescription>
      </SheetHeader>

      <a
        href={mapsDirectionsUrl(stop.lat, stop.lng)}
        target="_blank"
        rel="noreferrer"
        className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 w-full")}
      >
        <MapPin className="size-4" />
        Itinéraire dans Google Maps
      </a>

      <div role="tablist" className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
              setEditing(null);
            }}
            className={cn(
              "h-11 shrink-0 rounded-lg px-3 text-sm font-medium",
              tab === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {t.label}
            {t.count ? ` · ${t.count}` : ""}
          </button>
        ))}
      </div>

      {tab === "bookings" && (
        <div className="flex flex-col gap-3">
          {editing ? (
            <BookingForm
              initial={editing === "new" ? null : editing}
              defaultCurrency={defaultCurrency}
              onCancel={() => setEditing(null)}
              onSubmit={(input) => {
                upsertBooking(stop.id, input, editing === "new" ? undefined : editing.id);
                setEditing(null);
              }}
            />
          ) : (
            <>
              {stop.bookings.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Aucune réservation. Note ici le camping, la référence et le code d’accès : tout reste lisible hors ligne.
                </p>
              )}
              {stop.bookings.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  destination={stop}
                  onEdit={() => setEditing(booking)}
                  onRemove={() => removeBooking(stop.id, booking.id)}
                />
              ))}
              <Button variant="outline" className="h-11" onClick={() => setEditing("new")}>
                <Plus className="size-4" />
                Ajouter une réservation
              </Button>
            </>
          )}
        </div>
      )}

      {tab === "documents" && <DocumentsSection stopId={stop.id} documents={stop.documents} />}

      {tab === "checklist" && (
        <ChecklistSection
          items={stop.checklist}
          onAdd={(text) => addChecklistItem(stop.id, text)}
          onToggle={(id) => toggleChecklistItem(stop.id, id)}
          onRemove={(id) => removeChecklistItem(stop.id, id)}
        />
      )}

      {tab === "notes" && (
        <div className="flex flex-col gap-2">
          {stop.warning && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{stop.warning}</p>}
          {stop.activities.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {stop.activities.map((activity) => (
                <li key={activity.id} className="flex gap-2">
                  <span className="text-muted-foreground">•</span>
                  {activity.text}
                </li>
              ))}
            </ul>
          )}
          <Textarea
            value={notes.draft}
            onChange={(e) => notes.setDraft(e.target.value)}
            onBlur={notes.commit}
            rows={6}
            placeholder="Emplacement, horaires, ce qu’on a aimé…"
            aria-label="Notes de l’étape"
          />
          <p className="text-xs text-muted-foreground">Enregistré quand tu quittes le champ.</p>
        </div>
      )}
    </>
  );
}
