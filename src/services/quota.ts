import { parseQuotaResult, type QuotaResult, type QuotaService } from "@/lib/quota";
import { requireSupabase, toSyncError } from "@/services/supabase";

const TIMEOUT_MS = 10_000;

/**
 * Demande `units` unités du service avant de l'appeler (fonction SQL `consume_quota`). Le compteur ne
 * bouge que si la demande passe. Lève une `SyncError` hors réseau ou sans session : l'appelant décide
 * alors de ne pas appeler le service.
 */
export async function consumeQuota(service: QuotaService, units = 1): Promise<QuotaResult> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("consume_quota", { p_service: service, p_units: units }).abortSignal(AbortSignal.timeout(TIMEOUT_MS));
  if (error) throw toSyncError(error, "Plafond d’usage");
  return parseQuotaResult(data);
}
