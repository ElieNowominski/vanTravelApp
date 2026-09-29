import { CloudDownload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppUpdateStore } from "@/services/app-update";

/**
 * « Nouvelle version disponible » : rien ne se recharge tout seul, la mise à jour se fait au toucher.
 * Affiché aussi, brièvement, quand l'app est prête à fonctionner hors ligne.
 */
export function UpdateBanner() {
  const needRefresh = useAppUpdateStore((s) => s.needRefresh);
  const offlineReady = useAppUpdateStore((s) => s.offlineReady);
  const applying = useAppUpdateStore((s) => s.applying);
  const apply = useAppUpdateStore((s) => s.apply);

  if (needRefresh) {
    return (
      <div
        role="status"
        className="flex shrink-0 items-center justify-between gap-3 bg-foreground px-3 py-1.5 text-xs font-medium text-background"
      >
        <span className="flex items-center gap-2">
          <CloudDownload className="size-3.5" aria-hidden />
          Nouvelle version disponible.
        </span>
        <Button size="sm" variant="secondary" className="h-9" disabled={applying} onClick={() => void apply()}>
          {applying ? "Mise à jour…" : "Mettre à jour"}
        </Button>
      </div>
    );
  }

  if (offlineReady) {
    return (
      <div role="status" className="flex shrink-0 items-center justify-center bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
        Prête pour le hors ligne : l’app et les données publiques sont en cache.
      </div>
    );
  }

  return null;
}
