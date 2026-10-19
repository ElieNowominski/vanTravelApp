import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Plus, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { VoyagerFrame } from "@/components/voyager/voyager-frame";
import {
  allExpenses,
  categoryLabel,
  categoryShort,
  formatMoney,
  formatTotals,
  groupExpenses,
  settleUp,
  tripExpenseTotals,
  type ExpenseGrouping,
} from "@/lib/expenses";
import { tripPeople } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { useProfileStore } from "@/store/profile-store";
import { useTripStore } from "@/store/trip-store";

const GROUPINGS: Array<{ id: ExpenseGrouping; label: string }> = [
  { id: "day", label: "Par jour" },
  { id: "stop", label: "Par étape" },
  { id: "category", label: "Par catégorie" },
];

/** Dépenses de tout le voyage (`/depenses`) : total, qui doit quoi, liste par jour, par étape ou par catégorie. */
export function ExpensesPage() {
  return (
    <VoyagerFrame active="depenses">
      <ExpensesBody />
    </VoyagerFrame>
  );
}

function ExpensesBody() {
  const days = useTripStore((s) => s.days);
  const stops = useTripStore((s) => s.stops);
  const removeExpense = useTripStore((s) => s.removeExpense);
  const profile = useProfileStore((s) => s.profile);
  const [grouping, setGrouping] = useState<ExpenseGrouping>("day");

  const totals = useMemo(() => tripExpenseTotals(days), [days]);
  const transfers = useMemo(() => settleUp(allExpenses(days), tripPeople(profile)), [days, profile]);
  const groups = useMemo(() => groupExpenses({ days, stops }, grouping), [days, stops, grouping]);

  return (
    <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <header className="border-b bg-background px-4 pt-2 pb-3">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs tracking-wide text-muted-foreground uppercase">
                Tout le voyage · {totals.count} dépense{totals.count > 1 ? "s" : ""}
              </p>
              <h1 className="text-2xl leading-tight font-semibold">{formatTotals(totals.byCurrency)}</h1>
            </div>
            <div className="min-w-0 max-w-[55%] text-right text-sm">
              {transfers.length > 0 ? (
                <>
                  <p className="text-xs text-muted-foreground">Pour équilibrer</p>
                  {transfers.map((t) => (
                    <p key={`${t.from}-${t.to}-${t.currency}`} className="text-balance">
                      <span className="font-medium">{t.from}</span> doit {formatMoney(t.amount, t.currency)} à <span className="font-medium">{t.to}</span>
                    </p>
                  ))}
                </>
              ) : totals.count > 0 && tripPeople(profile).length >= 2 ? (
                <p className="text-xs text-muted-foreground">Comptes équilibrés</p>
              ) : null}
            </div>
          </div>
          <div role="group" aria-label="Regrouper par" className="flex rounded-lg bg-muted p-0.5">
            {GROUPINGS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={grouping === option.id}
                onClick={() => setGrouping(option.id)}
                className={cn(
                  "h-9 flex-1 rounded-md text-sm font-medium",
                  grouping === option.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-3 pb-28">
        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune dépense notée. Le bouton « Dépense » en ajoute une, rattachée au jour et, si tu veux, à une étape.</p>
        )}
        {groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">
                {group.label}
                {group.detail ? <span className="font-normal text-muted-foreground"> · {group.detail}</span> : null}
              </h2>
              <span className="text-sm font-semibold">{formatTotals(group.total)}</span>
            </div>
            <ul className="flex flex-col divide-y rounded-xl bg-card ring-1 ring-foreground/10">
              {group.expenses.map((expense) => {
                const stopName = expense.stopId ? stops[expense.stopId]?.name : null;
                const day = days[expense.dayIndex];
                return (
                  <li key={expense.id} className="flex min-h-13 items-center gap-2.5 px-3 py-1.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground uppercase">
                      {categoryShort(expense.category)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{formatMoney(expense.amount, expense.currency)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[
                          grouping !== "category" ? categoryLabel(expense.category) : null,
                          expense.paidBy || "?",
                          grouping !== "day" && day ? `${day.weekday} ${day.label}` : null,
                          grouping !== "stop" ? (stopName ?? (expense.stopId ? "étape retirée" : null)) : null,
                          expense.note,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <ConfirmAction
                      size="icon-sm"
                      className="size-11 shrink-0"
                      icon={<Trash2 className="size-4" />}
                      label={<span className="sr-only">Supprimer</span>}
                      question="Supprimer ?"
                      confirmLabel="Oui"
                      onConfirm={() => removeExpense(expense.dayIndex, expense.id)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <Link
        to="/depenses/nouvelle"
        className="sticky bottom-4 ml-auto mr-4 flex h-12 w-fit items-center gap-2 rounded-full bg-primary pr-5 pl-4 text-sm font-semibold text-primary-foreground shadow-lg"
      >
        <Plus className="size-5" />
        Dépense
      </Link>
    </main>
  );
}
