import type { Expense, ExpenseCategory, TripDay } from "@/lib/types";

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
