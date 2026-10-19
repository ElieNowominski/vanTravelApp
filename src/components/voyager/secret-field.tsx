import { useEffect, useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { maskSecret } from "@/lib/voyager";

/** Code reçu chiffré sans la phrase sur cet appareil : on le dit, sans rien montrer. */
export function LockedSecret({ label }: { label: string }) {
  return (
    <p className="inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-lg bg-muted px-3 text-left">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="size-3.5" aria-hidden />
        Chiffré : phrase à saisir dans « Compte et synchro »
      </span>
    </p>
  );
}

/**
 * Code d'accès masqué par défaut, révélé au toucher, re-masqué après 20 s.
 * `compact` : un simple bouton discret en ligne (le code sert rarement), le code s'affiche à sa place.
 */
export function SecretField({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(false), 20_000);
    return () => window.clearTimeout(timer);
  }, [shown]);

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground"
        aria-label={shown ? `${label} : ${value}. Masquer` : `${label} masqué. Toucher pour révéler`}
      >
        {shown ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
        {shown ? <span className="font-mono text-sm font-semibold tracking-wider text-foreground">{value}</span> : label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setShown((v) => !v)}
      className="inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-lg bg-muted px-3 text-left"
      aria-label={shown ? `${label} : ${value}. Masquer` : `${label} masqué. Toucher pour révéler`}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span className={shown ? "font-mono text-base font-semibold tracking-wider" : "font-mono text-base tracking-widest"}>
          {shown ? value : maskSecret(value)}
        </span>
        {shown ? <EyeOff className="size-4 text-muted-foreground" /> : <Eye className="size-4 text-muted-foreground" />}
      </span>
    </button>
  );
}
