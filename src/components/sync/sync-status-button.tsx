import { useState } from "react";
import { Cloud, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { SyncDialog } from "@/components/sync/sync-dialog";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";
import { syncBadge } from "@/lib/sync-status";
import { isSyncConfigured, useSyncStore } from "@/store/sync-store";

/** Icône d'état de la synchro (nuage, en cours, en attente, erreur) qui ouvre « Compte et synchro ». */
export function SyncStatusButton({ variant = "icon" }: { variant?: "icon" | "full" }) {
  const [open, setOpen] = useState(false);
  const status = useSyncStore((s) => s.status);
  const pending = useSyncStore((s) => s.pending);
  const settings = useSyncStore((s) => s.settings);
  const online = useOnline();
  const badge = syncBadge({ configured: isSyncConfigured(settings), status, pending, online });

  const icon =
    badge.kind === "syncing" ? (
      <RefreshCw className={cn(variant === "icon" ? "size-3.5" : "size-4", "animate-spin")} />
    ) : badge.kind === "error" ? (
      <TriangleAlert className={cn(variant === "icon" ? "size-3.5" : "size-4", "text-destructive")} />
    ) : badge.kind === "offline" || badge.kind === "unconfigured" ? (
      <CloudOff className={variant === "icon" ? "size-3.5" : "size-4"} />
    ) : (
      <Cloud className={variant === "icon" ? "size-3.5" : "size-4"} />
    );

  return (
    <>
      {variant === "icon" ? (
        <Button variant="outline" size="icon-sm" className="relative" onClick={() => setOpen(true)} title={badge.label}>
          {icon}
          {badge.kind === "pending" && <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-500" />}
          <span className="sr-only">{badge.label}</span>
        </Button>
      ) : (
        <Button variant="outline" className="h-11" onClick={() => setOpen(true)}>
          {icon}
          {badge.kind === "unconfigured" ? "Configurer la synchro" : badge.label}
        </Button>
      )}
      <SyncDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
