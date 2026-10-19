import type { Booking, Expense, ExpenseCategory, Stop, TripDay } from "@/lib/types";

export const EXPENSE_CATEGORIES: Array<{ id: ExpenseCategory; label: string }> = [
  { id: "carburant", label: "Carburant" },
  { id: "camping", label: "Camping / nuit" },
  { id: "courses", label: "Courses" },
  { id: "resto", label: "Resto / café" },
  { id: "activite", label: "Activité" },
  { id: "transport", label: "Transport / péage" },
  { id: "autre", label: "Autre" },
];

export function categoryLabel(id: ExpenseCategory): string {
  return EXPENSE_CATEGORIES.find((c) => c.id === id)?.label ?? "Autre";
}

const CATEGORY_SHORT: Record<ExpenseCategory, string> = {
  carburant: "Carb",
  camping: "Nuit",
  courses: "Cour",
  resto: "Resto",
  activite: "Act",
  transport: "Trans",
  autre: "Autre",
};

/** Abréviation pour une pastille de liste. */
export function categoryShort(id: ExpenseCategory): string {
  return CATEGORY_SHORT[id] ?? "Autre";
}

/** Totaux par devise : on n'additionne jamais deux devises entre elles. */
export type MoneyByCurrency = Record<string, number>;

export function totalsByCurrency(expenses: Expense[]): MoneyByCurrency {
  const out: MoneyByCurrency = {};
  for (const expense of expenses) {
    out[expense.currency] = round2((out[expense.currency] ?? 0) + expense.amount);
  }
  return out;
}

export function allExpenses(days: Pick<TripDay, "expenses">[]): Expense[] {
  return days.flatMap((day) => day.expenses ?? []);
}

export type TripExpenseTotals = {
  count: number;
  byCurrency: MoneyByCurrency;
  byPayer: Record<string, MoneyByCurrency>;
  byCategory: Record<string, MoneyByCurrency>;
};

export function tripExpenseTotals(days: Pick<TripDay, "expenses">[]): TripExpenseTotals {
  const expenses = allExpenses(days);
  const byPayer: Record<string, MoneyByCurrency> = {};
  const byCategory: Record<string, MoneyByCurrency> = {};
  for (const expense of expenses) {
    const payer = expense.paidBy.trim() || "?";
    byPayer[payer] = { ...byPayer[payer], [expense.currency]: round2((byPayer[payer]?.[expense.currency] ?? 0) + expense.amount) };
    byCategory[expense.category] = {
      ...byCategory[expense.category],
      [expense.currency]: round2((byCategory[expense.category]?.[expense.currency] ?? 0) + expense.amount),
    };
  }
  return { count: expenses.length, byCurrency: totalsByCurrency(expenses), byPayer, byCategory };
}

export type Transfer = { from: string; to: string; amount: number; currency: string };

/**
 * Répartition à parts égales entre les personnes du voyage : qui doit combien à qui, par devise.
 * `people` fixe les participants (les deux profils) ; toute personne ayant payé est ajoutée.
 */
export function settleUp(expenses: Expense[], people: string[]): Transfer[] {
  const participants = [...people.map((p) => p.trim()).filter(Boolean)];
  for (const expense of expenses) {
    const payer = expense.paidBy.trim();
    if (payer && !participants.includes(payer)) participants.push(payer);
  }
  if (participants.length < 2) return [];

  const transfers: Transfer[] = [];
  const currencies = [...new Set(expenses.map((e) => e.currency))];
  for (const currency of currencies) {
    const inCurrency = expenses.filter((e) => e.currency === currency);
    const total = inCurrency.reduce((sum, e) => sum + e.amount, 0);
    const share = total / participants.length;
    const balance = new Map<string, number>(participants.map((p) => [p, -share]));
    for (const expense of inCurrency) {
      const payer = expense.paidBy.trim();
      if (!payer) continue;
      balance.set(payer, (balance.get(payer) ?? 0) + expense.amount);
    }
    // Créanciers (solde positif) et débiteurs (négatif), appariés du plus gros au plus petit.
    const creditors = [...balance.entries()].filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]);
    const debtors = [...balance.entries()].filter(([, v]) => v < -0.005).sort((a, b) => a[1] - b[1]);
    let i = 0;
    let j = 0;
    while (i < creditors.length && j < debtors.length) {
      const [to, credit] = creditors[i];
      const [from, debit] = debtors[j];
      const amount = Math.min(credit, -debit);
      if (amount > 0.005) transfers.push({ from, to, amount: round2(amount), currency });
      creditors[i] = [to, credit - amount];
      debtors[j] = [from, debit + amount];
      if (creditors[i][1] <= 0.005) i += 1;
      if (debtors[j][1] >= -0.005) j += 1;
    }
  }
  return transfers;
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatTotals(totals: MoneyByCurrency): string {
  const parts = Object.entries(totals).map(([currency, amount]) => formatMoney(amount, currency));
  return parts.length > 0 ? parts.join(" + ") : formatMoney(0, "EUR");
}

/** « 12,50 » ou « 12.5 » ou « 1 250 » -> 12.5 / 1250 ; `null` si illisible ou négatif. */
export function parseAmount(text: string): number | null {
  // \s couvre déjà l'espace fine et l'espace insécable (séparateurs de milliers français).
  const cleaned = text.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Dépenses rattachées à une étape, tous jours confondus. */
export function expensesForStop(days: Pick<TripDay, "expenses">[], stopId: string): Expense[] {
  return allExpenses(days).filter((expense) => expense.stopId === stopId);
}

export type StopCostLine = {
  id: string;
  source: "booking" | "expense";
  label: string;
  amount: number;
  currency: string;
  paidBy?: string;
};

/** Coût d'une étape : le prix de ses réservations et les dépenses qui lui sont rattachées, par devise. */
export function stopCosts(
  stop: { bookings: Pick<Booking, "id" | "provider" | "price">[] },
  expenses: Expense[],
): { lines: StopCostLine[]; total: MoneyByCurrency } {
  const lines: StopCostLine[] = [];
  for (const booking of stop.bookings) {
    if (!booking.price) continue;
    lines.push({ id: booking.id, source: "booking", label: booking.provider, amount: booking.price.amount, currency: booking.price.currency });
  }
  for (const expense of expenses) {
    lines.push({
      id: expense.id,
      source: "expense",
      label: [categoryLabel(expense.category), expense.note].filter(Boolean).join(" · "),
      amount: expense.amount,
      currency: expense.currency,
      paidBy: expense.paidBy || undefined,
    });
  }
  const total: MoneyByCurrency = {};
  for (const line of lines) total[line.currency] = round2((total[line.currency] ?? 0) + line.amount);
  return { lines, total };
}

export type ExpenseGrouping = "day" | "stop" | "category";

export type ExpenseGroup = {
  key: string;
  label: string;
  /** Complément du titre (« jour 2 », « sans étape »). */
  detail?: string;
  expenses: Array<Expense & { dayIndex: number }>;
  total: MoneyByCurrency;
};

/**
 * Dépenses du voyage regroupées pour la page Dépenses. Par jour : du plus récent au plus ancien, les jours
 * sans dépense omis. Par étape : dans l'ordre de l'itinéraire, puis « Sans étape ». Par catégorie : dans
 * l'ordre des catégories. Dans un groupe, la saisie la plus récente vient en premier.
 */
export function groupExpenses(
  snapshot: { days: Pick<TripDay, "date" | "label" | "weekday" | "stopIds" | "expenses">[]; stops: Record<string, Pick<Stop, "id" | "name">> },
  grouping: ExpenseGrouping,
): ExpenseGroup[] {
  const all = snapshot.days.flatMap((day, dayIndex) => (day.expenses ?? []).map((expense) => ({ ...expense, dayIndex })));
  const byUpdated = (a: Expense, b: Expense) => b.updatedAt.localeCompare(a.updatedAt);
  const groups: ExpenseGroup[] = [];
  const push = (key: string, label: string, detail: string | undefined, expenses: ExpenseGroup["expenses"]) => {
    if (expenses.length === 0) return;
    groups.push({ key, label, detail, expenses: [...expenses].sort(byUpdated), total: totalsByCurrency(expenses) });
  };

  if (grouping === "day") {
    snapshot.days.forEach((day, dayIndex) => {
      push(day.date, `${day.weekday} ${day.label}`, `jour ${dayIndex + 1}`, all.filter((e) => e.dayIndex === dayIndex));
    });
    return groups.reverse();
  }

  if (grouping === "stop") {
    const seen = new Set<string>();
    for (const day of snapshot.days) {
      for (const stopId of day.stopIds) {
        if (seen.has(stopId)) continue;
        seen.add(stopId);
        push(stopId, snapshot.stops[stopId]?.name ?? "Étape retirée", undefined, all.filter((e) => e.stopId === stopId));
      }
    }
    for (const expense of all) {
      if (expense.stopId && !seen.has(expense.stopId)) {
        seen.add(expense.stopId);
        push(expense.stopId, snapshot.stops[expense.stopId]?.name ?? "Étape retirée", undefined, all.filter((e) => e.stopId === expense.stopId));
      }
    }
    push("none", "Sans étape", undefined, all.filter((e) => !e.stopId));
    return groups;
  }

  for (const category of EXPENSE_CATEGORIES) {
    push(category.id, category.label, undefined, all.filter((e) => e.category === category.id));
  }
  return groups;
}
