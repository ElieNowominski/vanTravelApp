import { describe, expect, it } from "vitest";
import { parseAmount, settleUp, totalsByCurrency, tripExpenseTotals } from "@/lib/expenses";
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
