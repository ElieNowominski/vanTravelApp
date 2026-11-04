import { useState } from "react";
import { Cloud, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { AccountDialog } from "@/components/account/account-dialog";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";
import { syncBadge } from "@/lib/sync-status";
import { isSyncConfigured, useAccountStore } from "@/store/account-store";

/** Icône d'état de la synchro (nuage, en cours, en attente, erreur) qui ouvre « Compte et synchro ».
 * `round` : rond de 44 px, en tête de l'accueil. */
export function SyncStatusButton({ variant = "icon" }: { variant?: "icon" | "round" | "full" }) {
  const [open, setOpen] = useState(false);
  const status = useAccountStore((s) => s.status);
  const pending = useAccountStore((s) => s.pending);
  const configured = useAccountStore((s) => isSyncConfigured(s));
  const signedIn = useAccountStore((s) => !!s.user);
  const online = useOnline();
  const badge = syncBadge({ configured, status, pending, online });

  const icon =
    badge.kind === "syncing" ? (
      <RefreshCw className={cn(variant !== "full" ? "size-3.5" : "size-4", "animate-spin")} />
    ) : badge.kind === "error" ? (
      <TriangleAlert className={cn(variant !== "full" ? "size-3.5" : "size-4", "text-destructive")} />
    ) : badge.kind === "offline" || badge.kind === "unconfigured" ? (
      <CloudOff className={variant !== "full" ? "size-3.5" : "size-4"} />
    ) : (
      <Cloud className={variant !== "full" ? "size-3.5" : "size-4"} />
    );

  return (
    <>
      {variant !== "full" ? (
        <Button
          variant="outline"
          size={variant === "round" ? "icon" : "icon-sm"}
          className={cn("relative", variant === "round" && "size-11 rounded-full text-primary [&_svg]:size-5")}
          onClick={() => setOpen(true)}
          title={badge.label}
        >
          {icon}
          {badge.kind === "pending" && <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-500" />}
          <span className="sr-only">{badge.label}</span>
        </Button>
      ) : (
        <Button variant="outline" className="h-11" onClick={() => setOpen(true)}>
          {icon}
          {badge.kind === "unconfigured" ? (signedIn ? "Choisir le voyage" : "Se connecter") : badge.label}
        </Button>
      )}
      <AccountDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
