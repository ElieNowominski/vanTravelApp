import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chips } from "@/components/voyager/chips";
import { VoyagerFrame } from "@/components/voyager/voyager-frame";
import { useBack } from "@/hooks/use-back";
import { useTripZone } from "@/hooks/use-trip-zone";
import { EXPENSE_CATEGORIES, allExpenses, defaultExpenseCurrency, parseAmount } from "@/lib/expenses";
import { tripPeople } from "@/lib/profile";
import type { ExpenseCategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { dayIndexForDate } from "@/lib/voyager";
import { useProfileStore } from "@/store/profile-store";
import { useTripStore } from "@/store/trip-store";

const NO_STOP = "";

/**
 * Nouvelle dépense (`/depenses/nouvelle?jour=N&etape=ID`) : montant, catégorie, payeur, jour, étape
 * rattachée (la nuit du jour proposée d'office), note.
 */
export function NewExpensePage() {
  return (
    <VoyagerFrame active="depenses">
      <NewExpenseBody />
    </VoyagerFrame>
  );
}

function NewExpenseBody() {
  const [params] = useSearchParams();
  const days = useTripStore((s) => s.days);
  const stops = useTripStore((s) => s.stops);
  const travelDay = useTripStore((s) => s.travelDay);
  const addExpense = useTripStore((s) => s.addExpense);
  const profile = useProfileStore((s) => s.profile);
  const back = useBack("/depenses");

  const { today } = useTripZone();
  const everyone = useMemo(() => allExpenses(days), [days]);
  const proposedCurrency = useMemo(() => defaultExpenseCurrency(everyone), [everyone]);
  const people = useMemo(() => tripPeople(profile, everyone.map((e) => e.paidBy)), [profile, everyone]);
  const currencies = useMemo(() => [...new Set([proposedCurrency, "EUR", ...everyone.map((e) => e.currency)])], [proposedCurrency, everyone]);

  const initialDay = (() => {
    const fromUrl = Number(params.get("jour"));
    if (params.has("jour") && Number.isInteger(fromUrl) && days[fromUrl]) return fromUrl;
    if (travelDay != null && days[travelDay]) return travelDay;
    return Math.max(0, dayIndexForDate(days, today));
  })();
  const [dayIndex, setDayIndex] = useState(initialDay);
  const day = days[dayIndex];
  const dayStops = (day?.stopIds ?? []).map((id) => stops[id]).filter(Boolean);
  const defaultStop = (index: number) => {
    const fromUrl = params.get("etape");
    const d = days[index];
    if (fromUrl && d?.stopIds.includes(fromUrl)) return fromUrl;
    return d?.overnightStopId ?? NO_STOP;
  };
  const [stopId, setStopId] = useState(() => defaultStop(initialDay));

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(proposedCurrency);
  const [category, setCategory] = useState<ExpenseCategory>("carburant");
  const [paidBy, setPaidBy] = useState(profile.name.trim() || people[0] || "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const parsed = parseAmount(amount);
    if (parsed == null || parsed === 0) return setError("Montant illisible (ex. 62 ou 62,40).");
    if (!paidBy.trim()) return setError("Qui a payé ?");
    if (!day) return setError("Choisis un jour.");
    addExpense(dayIndex, { date: day.date, amount: parsed, currency, category, paidBy, note, stopId: stopId || undefined });
    back();
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <header className="border-b bg-background px-4 pt-1 pb-2">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-2">
          <Button variant="ghost" className="-ml-2 h-11" onClick={back}>
            Annuler
          </Button>
          <h1 className="text-base font-semibold">Nouvelle dépense</h1>
          <Button className="h-10" onClick={submit}>
            Ajouter
          </Button>
        </div>
      </header>

      <form
        className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-4 pb-8"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="exp-amount" className="text-xs text-muted-foreground">
            Montant
          </label>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <Input
              id="exp-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="h-14 text-2xl font-semibold"
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-14 rounded-lg border border-input bg-background px-2 text-base"
              aria-label="Devise"
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
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
            <label htmlFor="exp-payer" className="text-xs text-muted-foreground">
              Payé par
            </label>
            <Input id="exp-payer" value={paidBy} onChange={(e) => setPaidBy(e.target.value)} placeholder="Prénom" className="h-11" />
            <p className="text-xs text-muted-foreground">Les deux prénoms se règlent une fois pour toutes dans le profil (écran Jour).</p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="exp-day" className="text-xs text-muted-foreground">
            Jour
          </label>
          <select
            id="exp-day"
            value={dayIndex}
            onChange={(e) => {
              const next = Number(e.target.value);
              setDayIndex(next);
              setStopId(defaultStop(next));
            }}
            className="h-11 rounded-lg border border-input bg-background px-2 text-base"
          >
            {days.map((d, i) => (
              <option key={d.date} value={i}>
                {d.weekday} {d.label} · jour {i + 1}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">Rattacher à une étape</p>
          <div role="radiogroup" aria-label="Étape" className="flex flex-col divide-y rounded-xl bg-card ring-1 ring-foreground/10">
            <StopOption id={NO_STOP} label="Aucune, juste le jour" selected={stopId === NO_STOP} onSelect={setStopId} />
            {dayStops.map((stop) => (
              <StopOption
                key={stop.id}
                id={stop.id}
                label={stop.name}
                night={day?.overnightStopId === stop.id}
                selected={stopId === stop.id}
                onSelect={setStopId}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">La nuit du jour est proposée d’office. Le coût s’ajoute à la fiche de l’étape.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="exp-note" className="text-xs text-muted-foreground">
            Note
          </label>
          <Input id="exp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Station, camping, resto…" className="h-11" />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-11">
          Ajouter la dépense
        </Button>
      </form>
    </main>
  );
}

function StopOption({
  id,
  label,
  night = false,
  selected,
  onSelect,
}: {
  id: string;
  label: string;
  night?: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={night ? `${label}, nuit` : label}
      onClick={() => onSelect(id)}
      className="flex min-h-12 items-center gap-3 px-3 text-left text-sm"
    >
      <span
        className={cn("size-5 shrink-0 rounded-full border-[1.5px] border-foreground/30", selected && "border-[6px] border-primary")}
        aria-hidden
      />
      <span className={cn("flex-1", selected && "font-medium")}>{label}</span>
      {night && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Moon className="size-3" aria-hidden />
          nuit
        </span>
      )}
    </button>
  );
}
