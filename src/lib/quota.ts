/**
 * Plafonds des services à quota (table `usage_limits`, fonction `consume_quota`, migration 0004).
 * Le client demande une unité avant chaque appel à un service public gratuit (recherche de lieux,
 * points d'intérêt) ; au plafond, il n'appelle pas le service et le dit.
 */
export type QuotaService = "geocode" | "poi";

export type QuotaResult =
  | { allowed: true; used: number; limit: number; remaining: number }
  | { allowed: false; scope: "user" | "total"; used: number; limit: number; resetAt: string | null };

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/** Réponse de `consume_quota` ; une forme inattendue vaut refus, pour ne jamais appeler le service à l'aveugle. */
export function parseQuotaResult(value: unknown): QuotaResult {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  if (v.allowed === true) {
    return { allowed: true, used: num(v.used), limit: num(v.limit), remaining: Math.max(0, num(v.remaining)) };
  }
  return {
    allowed: false,
    scope: v.scope === "total" ? "total" : "user",
    used: num(v.used),
    limit: num(v.limit),
    resetAt: typeof v.resetAt === "string" ? v.resetAt : null,
  };
}

const SERVICE_LABELS: Record<QuotaService, string> = {
  geocode: "recherche de lieux",
  poi: "points d'intérêt",
};

/** Message à l'écran quand la demande est refusée ; l'heure de remise à zéro dans le fuseau de l'appareil. */
export function quotaRefusalMessage(service: QuotaService, result: Extract<QuotaResult, { allowed: false }>, timeZone?: string): string {
  const what = SERVICE_LABELS[service];
  const who = result.scope === "total" ? "pour l'ensemble des comptes" : "pour ton compte";
  let when = "demain";
  if (result.resetAt) {
    const reset = new Date(result.resetAt);
    if (!Number.isNaN(reset.getTime())) {
      when = `à ${new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone }).format(reset)}`;
    }
  }
  return `Plafond du jour atteint ${who} (${what}, ${result.limit} demandes). Disponible de nouveau ${when}.`;
}
