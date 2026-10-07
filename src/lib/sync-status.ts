import type { SyncStatus } from "@/store/sync-store";

export type SyncBadge = { kind: "unconfigured" | "syncing" | "offline" | "pending" | "error" | "ok"; label: string };

/** Ce que l'icône de synchro doit dire, à partir de l'état brut. */
export function syncBadge(input: { configured: boolean; status: SyncStatus; pending: boolean; online: boolean }): SyncBadge {
  if (!input.configured) return { kind: "unconfigured", label: "Synchro non configurée" };
  if (input.status === "syncing") return { kind: "syncing", label: "Synchronisation…" };
  if (!input.online || input.status === "offline") {
    return { kind: "offline", label: input.pending ? "Hors ligne, modifications en attente" : "Hors ligne" };
  }
  if (input.status === "error") return { kind: "error", label: "Synchro en erreur" };
  if (input.pending) return { kind: "pending", label: "Modifications en attente d’envoi" };
  return { kind: "ok", label: "Synchronisée" };
}

/**
 * Ce que la prochaine synchro fera de l'itinéraire, annoncé avant d'agir. `hasRemote` : le dépôt a un
 * `itinerary.json` ; `remoteChanged` : son sha n'est plus celui de la dernière synchro.
 */
export function describeItinerarySync(input: { hasLocal: boolean; localChangedAt: string | null; hasRemote: boolean; remoteChanged: boolean }): string {
  if (!input.hasRemote) {
    return input.hasLocal
      ? "Le dépôt n’a pas encore d’itinéraire : celui de cet appareil sera envoyé."
      : "Ni le dépôt ni cet appareil n’ont d’itinéraire : le plan du voyage sera posé.";
  }
  if (!input.hasLocal) return "Cet appareil n’a pas d’itinéraire : celui du dépôt sera reçu.";
  if (input.localChangedAt && input.remoteChanged) {
    return "Le dépôt et cet appareil ont changé depuis la dernière synchro : la synchro automatique garde le plus récent. « Recevoir » ou « Envoyer » tranche à la main.";
  }
  if (input.localChangedAt) return "L’itinéraire de cet appareil a changé : il sera envoyé au dépôt.";
  if (input.remoteChanged) return "L’itinéraire du dépôt a changé : il sera reçu et remplacera celui de cet appareil (réservations, notes et dépenses conservées).";
  return "Itinéraire identique des deux côtés.";
}

/** « il y a 3 min », « il y a 2 h », « hier », ou la date ; `jamais` sans synchro. */
export function formatRelativeSync(iso: string | null, now = new Date()): string {
  if (!iso) return "jamais";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "jamais";
  const diffSec = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (diffSec < 60) return "à l’instant";
  const min = Math.round(diffSec / 60);
  if (min < 60) return `il y a ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} jours`;
  return then.toISOString().slice(0, 10);
}
