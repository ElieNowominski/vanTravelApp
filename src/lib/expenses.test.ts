import { describe, expect, it } from "vitest";
import { defaultExpenseCurrency, expensesForStop, groupExpenses, parseAmount, settleUp, stopCosts, totalsByCurrency, tripExpenseTotals } from "@/lib/expenses";
import type { Expense } from "@/lib/types";

function expense(amount: number, paidBy: string, currency = "NZD", category: Expense["category"] = "autre"): Expense {
  return { id: `e-${amount}-${paidBy}`, updatedAt: "", updatedBy: paidBy, date: "2027-02-07", amount, currency, category, paidBy };
}

describe("totaux", () => {
  it("additionne par devise sans mélanger", () => {
    const totals = totalsByCurrency([expense(10, "A"), expense(5.25, "B"), expense(3, "A", "EUR")]);
    expect(totals).toEqual({ NZD: 15.25, EUR: 3 });
  });

  it("agrège par payeur et catégorie sur tout le voyage", () => {
    const t = tripExpenseTotals([
      { expenses: [expense(60, "Élie", "NZD", "carburant"), expense(40, "Léa", "NZD", "camping")] },
      { expenses: [expense(20, "Léa", "NZD", "camping")] },
      { expenses: [] },
    ]);
    expect(t.count).toBe(3);
    expect(t.byCurrency).toEqual({ NZD: 120 });
    expect(t.byPayer).toEqual({ Élie: { NZD: 60 }, Léa: { NZD: 60 } });
    expect(t.byCategory).toEqual({ carburant: { NZD: 60 }, camping: { NZD: 60 } });
  });
});

describe("settleUp", () => {
  it("équilibre à deux : celle qui a moins payé rembourse la moitié de l'écart", () => {
    const out = settleUp([expense(100, "Élie"), expense(40, "Léa")], ["Élie", "Léa"]);
    expect(out).toEqual([{ from: "Léa", to: "Élie", amount: 30, currency: "NZD" }]);
  });

  it("rien à rembourser quand c'est équilibré, une ligne par devise sinon", () => {
    expect(settleUp([expense(50, "Élie"), expense(50, "Léa")], ["Élie", "Léa"])).toEqual([]);
    const out = settleUp([expense(50, "Élie"), expense(10, "Léa", "EUR")], ["Élie", "Léa"]);
    expect(out).toEqual([
      { from: "Léa", to: "Élie", amount: 25, currency: "NZD" },
      { from: "Élie", to: "Léa", amount: 5, currency: "EUR" },
    ]);
  });

  it("ajoute un payeur inconnu aux participants et ignore les payeurs vides", () => {
    const out = settleUp([expense(90, "Élie"), expense(0, "")], ["Élie", "Léa", "Tom"]);
    expect(out).toEqual([
      { from: "Léa", to: "Élie", amount: 30, currency: "NZD" },
      { from: "Tom", to: "Élie", amount: 30, currency: "NZD" },
    ]);
    expect(settleUp([expense(10, "Élie")], ["Élie"])).toEqual([]);
  });
});

describe("parseAmount", () => {
  it("accepte virgule, point et espaces, refuse le reste", () => {
    expect(parseAmount("12,50")).toBe(12.5);
    expect(parseAmount("12.5")).toBe(12.5);
    expect(parseAmount("1 250")).toBe(1250);
    expect(parseAmount("0")).toBe(0);
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("-3")).toBeNull();
    expect(parseAmount("1.234")).toBeNull();
  });
});

describe("coûts par étape", () => {
  const days = [
    { expenses: [{ ...expense(48, "A", "NZD", "camping"), stopId: "camp" }, { ...expense(21, "B", "EUR", "resto"), stopId: "camp" }, expense(3, "A")] },
    { expenses: [{ ...expense(98, "A", "NZD", "carburant"), stopId: "fairlie" }] },
  ];

  it("expensesForStop ne garde que les dépenses rattachées", () => {
    expect(expensesForStop(days, "camp").map((e) => e.amount)).toEqual([48, 21]);
    expect(expensesForStop(days, "nulle")).toEqual([]);
  });

  it("stopCosts additionne prix des réservations et dépenses, par devise", () => {
    const out = stopCosts(
      { bookings: [{ id: "b1", provider: "Camp", price: { amount: 48, currency: "NZD" } }, { id: "b2", provider: "Sans prix" }] },
      expensesForStop(days, "camp"),
    );
    expect(out.lines.map((l) => [l.source, l.amount])).toEqual([
      ["booking", 48],
      ["expense", 48],
      ["expense", 21],
    ]);
    expect(out.total).toEqual({ NZD: 96, EUR: 21 });
  });
});

describe("groupExpenses", () => {
  const snapshot = {
    days: [
      { date: "2027-02-07", label: "7 févr.", weekday: "Dim", stopIds: ["ville", "camp"], expenses: [{ ...expense(48, "A", "NZD", "camping"), id: "e1", updatedAt: "T1", stopId: "camp" }, { ...expense(3, "A"), id: "e2", updatedAt: "T2" }] },
      { date: "2027-02-08", label: "8 févr.", weekday: "Lun", stopIds: ["camp", "lac"], expenses: [] },
      { date: "2027-02-09", label: "9 févr.", weekday: "Mar", stopIds: ["lac"], expenses: [{ ...expense(98, "B", "NZD", "carburant"), id: "e3", updatedAt: "T0", stopId: "lac" }] },
    ],
    stops: { ville: { id: "ville", name: "Ville" }, camp: { id: "camp", name: "Camp" }, lac: { id: "lac", name: "Lac" } },
  };

  it("par jour : du plus récent au plus ancien, jours vides omis, dernière saisie en tête", () => {
    const groups = groupExpenses(snapshot, "day");
    expect(groups.map((g) => [g.key, g.detail, g.expenses.map((e) => e.id)])).toEqual([
      ["2027-02-09", "jour 3", ["e3"]],
      ["2027-02-07", "jour 1", ["e2", "e1"]],
    ]);
    expect(groups[1].total).toEqual({ NZD: 51 });
  });

  it("par étape : ordre de l'itinéraire, puis sans étape", () => {
    expect(groupExpenses(snapshot, "stop").map((g) => [g.label, g.expenses.map((e) => e.id)])).toEqual([
      ["Camp", ["e1"]],
      ["Lac", ["e3"]],
      ["Sans étape", ["e2"]],
    ]);
  });

  it("par catégorie : dans l'ordre des catégories", () => {
    expect(groupExpenses(snapshot, "category").map((g) => g.key)).toEqual(["carburant", "camping", "autre"]);
  });
});

describe("defaultExpenseCurrency", () => {
  it("propose la devise de la dernière dépense saisie, l'euro pour la première", () => {
    expect(defaultExpenseCurrency([])).toBe("EUR");
    expect(
      defaultExpenseCurrency([
        { currency: "NOK", updatedAt: "2027-06-03T10:00:00.000Z" },
        { currency: "SEK", updatedAt: "2027-06-09T08:00:00.000Z" },
        { currency: "DKK", updatedAt: "2027-06-01T12:00:00.000Z" },
      ]),
    ).toBe("SEK");
  });
});
