import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EXPENSE_CATEGORIES,
  allExpenses,
  categoryLabel,
  formatMoney,
  formatTotals,
  parseAmount,
  settleUp,
  totalsByCurrency,
  tripExpenseTotals,
} from "@/lib/expenses";
import { tripPeople, type Profile } from "@/lib/profile";
import type { ExpenseCategory, TripDay } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useTripStore } from "@/store/trip-store";

/** Journal des dépenses : saisie rapide, totaux du jour et du voyage, qui a payé, qui doit quoi. */
export function ExpensesPanel({
  days,
  dayIndex,
  defaultCurrency,
  profile,
  onEditProfile,
}: {
  days: TripDay[];
  dayIndex: number;
  defaultCurrency: string;
  profile: Profile;
  onEditProfile: () => void;
}) {
  const addExpense = useTripStore((s) => s.addExpense);
  const removeExpense = useTripStore((s) => s.removeExpense);
  const day = days[dayIndex];
  const dayExpenses = day?.expenses ?? [];
  const everyone = allExpenses(days);
  const people = useMemo(() => tripPeople(profile, everyone.map((e) => e.paidBy)), [profile, everyone]);
  const totals = useMemo(() => tripExpenseTotals(days), [days]);
  const transfers = useMemo(() => settleUp(everyone, tripPeople(profile)), [everyone, profile]);
  const currencies = useMemo(
    () => [...new Set([defaultCurrency, "EUR", ...everyone.map((e) => e.currency)])],
    [defaultCurrency, everyone],
  );

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [category, setCategory] = useState<ExpenseCategory>("carburant");
  const [paidBy, setPaidBy] = useState(profile.name.trim() || people[0] || "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const parsed = parseAmount(amount);
    if (parsed == null || parsed === 0) return setError("Montant illisible (ex. 62 ou 62,40).");
    if (!paidBy.trim()) return setError("Qui a payé ?");
    addExpense(dayIndex, { date: day?.date ?? "", amount: parsed, currency, category, paidBy, note });
    setAmount("");
    setNote("");
    setError(null);
  };

  if (!day) return null;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
        <p className="text-xs font-medium text-muted-foreground">
          Nouvelle dépense · {day.weekday} {day.label}
        </p>
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Montant"
            className="h-12 text-lg"
            aria-label="Montant"
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="h-12 rounded-lg border border-input bg-background px-2 text-sm"
            aria-label="Devise"
          >
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <Chips
          label="Catégorie"
          options={EXPENSE_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))}
          value={category}
          onChange={(id) => setCategory(id as ExpenseCategory)}
        />
        {people.length > 0 ? (
          <Chips label="Payé par" options={people.map((p) => ({ id: p, label: p }))} value={paidBy} onChange={setPaidBy} />
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">Payé par</p>
            <Input value={paidBy} onChange={(e) => setPaidBy(e.target.value)} placeholder="Prénom" className="h-11" />
            <button type="button" className="text-left text-xs underline underline-offset-2" onClick={onEditProfile}>
              Renseigner les deux prénoms une fois pour toutes
            </button>
          </div>
        )}
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (station, camping, resto…)" className="h-11" />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="h-11" onClick={submit}>
          <Plus className="size-4" />
          Ajouter
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium">Ce jour</h3>
          <p className="text-sm font-semibold">{formatTotals(totalsByCurrency(dayExpenses))}</p>
        </div>
        {dayExpenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">Rien de noté pour ce jour.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl bg-card ring-1 ring-foreground/10">
            {dayExpenses.map((expense) => (
              <li key={expense.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {formatMoney(expense.amount, expense.currency)}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{categoryLabel(expense.category)}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {expense.paidBy || "?"}
                    {expense.note ? ` · ${expense.note}` : ""}
                  </p>
                </div>
                <ConfirmAction
                  size="icon-sm"
                  className="size-11"
                  icon={<Trash2 className="size-4" />}
                  label={<span className="sr-only">Supprimer</span>}
                  question="Supprimer ?"
                  confirmLabel="Oui"
                  onConfirm={() => removeExpense(dayIndex, expense.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-xl bg-muted/60 p-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium">Tout le voyage</h3>
          <p className="text-base font-semibold">{formatTotals(totals.byCurrency)}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {totals.count} dépense{totals.count > 1 ? "s" : ""}
        </p>
        {Object.keys(totals.byPayer).length > 0 && (
          <ul className="flex flex-col gap-0.5 text-sm">
            {Object.entries(totals.byPayer).map(([payer, byCurrency]) => (
              <li key={payer} className="flex justify-between">
                <span>{payer}</span>
                <span>{formatTotals(byCurrency)}</span>
              </li>
            ))}
          </ul>
        )}
        {transfers.length > 0 ? (
          <div className="mt-1 border-t pt-2 text-sm">
            <p className="text-xs font-medium text-muted-foreground">Pour équilibrer à parts égales</p>
            {transfers.map((t) => (
              <p key={`${t.from}-${t.to}-${t.currency}`}>
                <span className="font-medium">{t.from}</span> doit {formatMoney(t.amount, t.currency)} à{" "}
                <span className="font-medium">{t.to}</span>
              </p>
            ))}
          </div>
        ) : totals.count > 0 && tripPeople(profile).length >= 2 ? (
          <p className="mt-1 border-t pt-2 text-sm text-muted-foreground">Comptes équilibrés.</p>
        ) : totals.count > 0 ? (
          <button type="button" className="mt-1 border-t pt-2 text-left text-xs underline underline-offset-2" onClick={onEditProfile}>
            Renseigne les deux prénoms pour voir qui doit quoi.
          </button>
        ) : null}
        {Object.keys(totals.byCategory).length > 1 && (
          <ul className="mt-1 flex flex-wrap gap-1.5 border-t pt-2 text-xs text-muted-foreground">
            {Object.entries(totals.byCategory).map(([cat, byCurrency]) => (
              <li key={cat} className="rounded-full bg-background px-2 py-0.5">
                {categoryLabel(cat as ExpenseCategory)} {formatTotals(byCurrency)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Chips({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            onClick={() => onChange(option.id)}
            className={cn(
              "h-10 rounded-full px-3 text-sm ring-1",
              value === option.id ? "bg-primary text-primary-foreground ring-primary" : "bg-background ring-foreground/15",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
