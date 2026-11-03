import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Phone, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BookingCard } from "@/components/voyager/booking-card";
import { BookingForm } from "@/components/voyager/booking-form";
import { ChecklistSection } from "@/components/voyager/checklist-section";
import { DirectionsButtons } from "@/components/voyager/directions-buttons";
import { DocumentList } from "@/components/voyager/document-list";
import { VoyagerFrame } from "@/components/voyager/voyager-frame";
import { useBack } from "@/hooks/use-back";
import { useDraftField } from "@/hooks/use-draft-field";
import { DOCUMENT_SCOPES, documentScope } from "@/lib/documents";
import { allExpenses, defaultExpenseCurrency, expensesForStop, formatMoney, formatTotals, stopCosts } from "@/lib/expenses";
import { catalogKindLabel } from "@/lib/trip-plan";
import type { Booking, DocumentScope, Stop } from "@/lib/types";
import { cn } from "@/lib/utils";
import { telHref } from "@/lib/voyager";
import { useTripStore } from "@/store/trip-store";

/** Fiche d'une étape, en page (`/etape/:stopId`) : réservation, documents, coûts, checklist, notes. */
export function StopPage() {
  return (
    <VoyagerFrame active={null}>
      <StopPageBody />
    </VoyagerFrame>
  );
}

function StopPageBody() {
  const { stopId = "" } = useParams();
  const stop = useTripStore((s) => s.stops[stopId]);
  const back = useBack("/");
  if (!stop) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-6">
        <p className="text-sm text-muted-foreground">Cette étape n’existe plus dans l’itinéraire.</p>
        <Button variant="outline" className="h-11 w-fit" onClick={back}>
          <ArrowLeft className="size-4" />
          Retour
        </Button>
      </main>
    );
  }
  return <StopSheet key={stop.id} stop={stop} />;
}

function StopSheet({ stop }: { stop: Stop }) {
  const days = useTripStore((s) => s.days);
  const upsertBooking = useTripStore((s) => s.upsertBooking);
  const removeBooking = useTripStore((s) => s.removeBooking);
  const addDocument = useTripStore((s) => s.addDocument);
  const updateDocumentCaption = useTripStore((s) => s.updateDocumentCaption);
  const removeDocument = useTripStore((s) => s.removeDocument);
  const addChecklistItem = useTripStore((s) => s.addChecklistItem);
  const toggleChecklistItem = useTripStore((s) => s.toggleChecklistItem);
  const removeChecklistItem = useTripStore((s) => s.removeChecklistItem);
  const setStopNotes = useTripStore((s) => s.setStopNotes);
  const notes = useDraftField(stop.notes ?? "", (next) => setStopNotes(stop.id, next));
  const back = useBack("/");
  const [editing, setEditing] = useState<Booking | null | "new">(null);

  const proposedCurrency = useMemo(() => defaultExpenseCurrency(allExpenses(days)), [days]);
  const dayIndex = days.findIndex((day) => day.stopIds.includes(stop.id));
  const day = dayIndex >= 0 ? days[dayIndex] : null;
  const isNight = stop.isOvernight || days.some((d) => d.overnightStopId === stop.id);
  const phone = stop.bookings.find((b) => b.phone)?.phone;
  const costs = stopCosts(stop, expensesForStop(days, stop.id));
  const open = stop.checklist.filter((i) => !i.done).length;
  const byScope = (scope: DocumentScope) => stop.documents.filter((doc) => documentScope(doc, stop) === scope);
  const newExpenseHref = `/depenses/nouvelle?etape=${encodeURIComponent(stop.id)}${dayIndex >= 0 ? `&jour=${dayIndex}` : ""}`;

  const sections = [
    { id: "reservation", label: "Réservation", count: stop.bookings.length || null },
    { id: "documents", label: "Documents", count: stop.documents.length || null },
    { id: "couts", label: "Coûts", count: costs.lines.length > 0 ? formatTotals(costs.total) : null },
    { id: "checklist", label: "À faire", count: open || null },
    { id: "notes", label: "Notes", count: null },
  ];

  return (
    <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <header className="flex flex-col gap-2 border-b bg-background px-4 pt-1 pb-3">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2">
          <div className="flex items-center gap-1">
            <button type="button" onClick={back} aria-label="Retour" className="-ml-2 flex size-11 items-center justify-center rounded-lg">
              <ArrowLeft className="size-5" />
            </button>
            <p className="text-xs text-muted-foreground">
              {day ? `Jour ${dayIndex + 1} · ${day.weekday} ${day.label}` : "Hors itinéraire"}
              {isNight ? " · nuit" : ""}
            </p>
          </div>
          <div>
            <h1 className="text-xl leading-tight font-semibold">{stop.name}</h1>
            <p className="text-sm text-muted-foreground">
              {catalogKindLabel(stop.kind, typeof stop.meta?.category === "string" ? stop.meta.category : undefined)}
              {stop.area ? ` · ${stop.area}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DirectionsButtons lat={stop.lat} lng={stop.lng} />
            {phone && (
              <a href={telHref(phone)} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 min-w-36 flex-1")}>
                <Phone className="size-4" />
                Appeler
              </a>
            )}
          </div>
          <nav aria-label="Sections de la fiche" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="inline-flex h-9 shrink-0 items-center rounded-full bg-muted px-3 text-xs font-medium text-foreground"
              >
                {section.label}
                {section.count != null ? <span className="ml-1 text-muted-foreground">· {section.count}</span> : null}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-4xl gap-5 px-4 pt-4 pb-8 md:grid-cols-[minmax(0,1fr)_20rem] md:gap-x-6">
        <Section id="reservation" title={stop.bookings.length > 1 ? "Réservations" : "Réservation"} className="md:col-start-1 md:row-start-1">
          {editing ? (
            <BookingForm
              initial={editing === "new" ? null : editing}
              defaultCurrency={proposedCurrency}
              onCancel={() => setEditing(null)}
              onSubmit={(input) => {
                upsertBooking(stop.id, input, editing === "new" ? undefined : editing.id);
                setEditing(null);
              }}
            />
          ) : (
            <>
              {stop.bookings.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucune réservation. Note ici le camping, la référence et le code d’accès : tout reste lisible hors ligne.</p>
              )}
              {stop.bookings.map((booking) => (
                <BookingCard key={booking.id} booking={booking} onEdit={() => setEditing(booking)} onRemove={() => removeBooking(stop.id, booking.id)} />
              ))}
              <Button variant="outline" className="h-11" onClick={() => setEditing("new")}>
                <Plus className="size-4" />
                Ajouter une réservation
              </Button>
            </>
          )}
        </Section>

        <Section
          id="documents"
          title="Documents"
          count={stop.documents.length || null}
          action={
            <Link to="/documents" className="text-sm font-medium text-primary">
              Tous les documents
            </Link>
          }
          className="md:col-start-2 md:row-start-1"
        >
          {DOCUMENT_SCOPES.map((scope) => (
            <div key={scope.id} className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">{scope.label}</h3>
              <DocumentList
                documents={byScope(scope.id)}
                onAdd={(input) => addDocument(stop.id, { ...input, scope: scope.id })}
                onCaption={(id, caption) => updateDocumentCaption(stop.id, id, caption)}
                onRemove={(id) => removeDocument(stop.id, id)}
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Confirmation, ticket, plan : tout reste sur le téléphone, lisible sans réseau.</p>
        </Section>

        <Section
          id="couts"
          title="Coûts de l’étape"
          action={costs.lines.length > 0 ? <span className="text-sm font-semibold">{formatTotals(costs.total)}</span> : null}
          className="md:col-start-2 md:row-start-2"
        >
          {costs.lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Rien de noté : le prix d’une réservation et les dépenses rattachées à l’étape s’additionnent ici.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-xl bg-card ring-1 ring-foreground/10">
              {costs.lines.map((line) => (
                <li key={line.id} className="flex min-h-12 items-center gap-3 px-3 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{formatMoney(line.amount, line.currency)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {line.label} · {line.source === "booking" ? "réservation" : "dépense"}
                      {line.paidBy ? ` · ${line.paidBy}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link to={newExpenseHref} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")}>
            <Plus className="size-4" />
            Ajouter une dépense ici
          </Link>
        </Section>

        <Section id="checklist" title="À faire" count={stop.checklist.length > 0 ? `${open} sur ${stop.checklist.length}` : null} className="md:col-start-1 md:row-start-2">
          <ChecklistSection
            items={stop.checklist}
            onAdd={(text) => addChecklistItem(stop.id, text)}
            onToggle={(id) => toggleChecklistItem(stop.id, id)}
            onRemove={(id) => removeChecklistItem(stop.id, id)}
          />
        </Section>

        <Section id="notes" title="Notes" className="md:col-start-1 md:row-start-3">
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
            rows={5}
            placeholder="Emplacement, horaires, ce qu’on a aimé…"
            aria-label="Notes de l’étape"
          />
          <p className="text-xs text-muted-foreground">Enregistré quand tu quittes le champ.</p>
        </Section>
      </div>
    </main>
  );
}

function Section({
  id,
  title,
  count,
  action,
  className,
  children,
}: {
  id: string;
  title: string;
  count?: string | number | null;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("flex scroll-mt-4 flex-col gap-2", className)}>
      <div className="flex min-h-9 items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {title}
          {count != null ? <span className="font-normal text-muted-foreground"> · {count}</span> : null}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
