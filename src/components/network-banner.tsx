import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

type Phase = "online" | "offline" | "back-online";

/**
 * Bandeau d'état réseau. Hors ligne : rappel que tout ce qui est stocké reste disponible.
 * Retour en ligne : confirmation brève. La synchro en attente (phase 5) s'affichera ici aussi.
 */
export function NetworkBanner() {
  const [phase, setPhase] = useState<Phase>(() =>
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online",
  );

  useEffect(() => {
    let timer: number | null = null;
    const down = () => {
      if (timer) window.clearTimeout(timer);
      setPhase("offline");
    };
    const up = () => {
      setPhase((current) => (current === "offline" ? "back-online" : current));
      timer = window.setTimeout(() => setPhase("online"), 4000);
    };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  if (phase === "online") return null;

  return (
    <div
      role="status"
      className={
        phase === "back-online"
          ? "flex shrink-0 items-center justify-center gap-2 bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          : "flex shrink-0 items-center justify-center gap-2 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-950"
      }
    >
      {phase === "back-online" ? (
        "De retour en ligne."
      ) : (
        <>
          <WifiOff className="size-3.5" aria-hidden />
          Hors ligne : l’itinéraire, les nuits et les fiches restent disponibles.
        </>
      )}
    </div>
  );
}
