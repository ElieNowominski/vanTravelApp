import { describe, expect, it } from "vitest";
import { eachDateInclusive, formatDateRange, formatDayLabel, formatDuration } from "@/lib/format";

describe("eachDateInclusive", () => {
  it("liste toutes les dates, bornes comprises", () => {
    const dates = eachDateInclusive("2027-02-07", "2027-02-19");
    expect(dates).toHaveLength(13);
    expect(dates[0]).toBe("2027-02-07");
    expect(dates.at(-1)).toBe("2027-02-19");
  });

  it("renvoie vide sur une date invalide", () => {
    expect(eachDateInclusive("n/a", "2027-02-19")).toEqual([]);
  });
});

describe("formatDayLabel", () => {
  it("ne dépend pas du fuseau de la machine", () => {
    const { weekday, label } = formatDayLabel("2027-02-07");
    expect(weekday.toLowerCase().startsWith("dim")).toBe(true);
    expect(label).toContain("7");
  });
});

describe("formatDateRange", () => {
  it("compacte un même mois", () => {
    expect(formatDateRange("2027-02-07", "2027-02-19")).toMatch(/^7–19 févr\. 2027$/);
  });
  it("garde les deux mois sinon", () => {
    expect(formatDateRange("2027-01-28", "2027-02-12")).toMatch(/janv\..*–.*févr\. 2027/);
  });
});

describe("formatDuration", () => {
  it("formate heures et minutes", () => {
    expect(formatDuration(90 * 60)).toBe("1 h 30");
    expect(formatDuration(45 * 60)).toBe("45 min");
    expect(formatDuration(7200)).toBe("2 h");
  });
});
