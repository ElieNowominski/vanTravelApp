import { describe, expect, it } from "vitest";
import { parseQuotaResult, quotaRefusalMessage } from "@/lib/quota";

describe("parseQuotaResult", () => {
  it("lit une demande acceptée", () => {
    expect(parseQuotaResult({ allowed: true, used: 12, limit: 500, remaining: 488 })).toEqual({ allowed: true, used: 12, limit: 500, remaining: 488 });
  });

  it("lit un refus au plafond du compte", () => {
    expect(parseQuotaResult({ allowed: false, scope: "user", used: 500, limit: 500, resetAt: "2026-11-04T00:00:00+00:00" })).toEqual({
      allowed: false,
      scope: "user",
      used: 500,
      limit: 500,
      resetAt: "2026-11-04T00:00:00+00:00",
    });
  });

  it("lit un refus au plafond global", () => {
    const result = parseQuotaResult({ allowed: false, scope: "total", used: 2000, limit: 2000, resetAt: null });
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.scope).toBe("total");
  });

  it("une réponse inattendue vaut refus", () => {
    expect(parseQuotaResult(null).allowed).toBe(false);
    expect(parseQuotaResult("ok").allowed).toBe(false);
    expect(parseQuotaResult({ allowed: "true" }).allowed).toBe(false);
  });
});

describe("quotaRefusalMessage", () => {
  it("dit quel plafond, combien et quand", () => {
    const message = quotaRefusalMessage("geocode", { allowed: false, scope: "user", used: 500, limit: 500, resetAt: "2026-11-04T00:00:00Z" }, "Europe/Paris");
    expect(message).toBe("Plafond du jour atteint pour ton compte (recherche de lieux, 500 demandes). Disponible de nouveau à 01:00.");
  });

  it("plafond global, sans heure connue", () => {
    const message = quotaRefusalMessage("poi", { allowed: false, scope: "total", used: 1000, limit: 1000, resetAt: null });
    expect(message).toBe("Plafond du jour atteint pour l'ensemble des comptes (points d'intérêt, 1000 demandes). Disponible de nouveau demain.");
  });
});
