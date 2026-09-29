import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Confirmation intégrée à l'interface (remplace `window.confirm`, interdit sur mobile).
 * Premier toucher : le bouton laisse place à la question et deux choix. Se referme seul après 6 s.
 */
export function ConfirmAction({
  label,
  question,
  confirmLabel = "Oui",
  onConfirm,
  variant = "ghost",
  size = "xs",
  icon,
  disabled,
  className,
  title,
}: {
  label: ReactNode;
  question: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  variant?: "ghost" | "outline" | "secondary" | "destructive" | "default";
  size?: "xs" | "sm" | "default" | "icon-sm";
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!asking) return;
    const timer = window.setTimeout(() => setAsking(false), 6000);
    return () => window.clearTimeout(timer);
  }, [asking]);

  if (!asking) {
    return (
      <Button
        variant={variant}
        size={size}
        disabled={disabled}
        className={className}
        title={title}
        onClick={() => setAsking(true)}
      >
        {icon}
        {label}
      </Button>
    );
  }

  return (
    <span
      role="group"
      aria-label={question}
      className={cn("inline-flex flex-wrap items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs", className)}
    >
      <span className="mr-1">{question}</span>
      <Button
        size="xs"
        variant="destructive"
        className="min-h-8"
        onClick={() => {
          setAsking(false);
          void onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button size="xs" variant="outline" className="min-h-8" onClick={() => setAsking(false)}>
        Annuler
      </Button>
    </span>
  );
}
