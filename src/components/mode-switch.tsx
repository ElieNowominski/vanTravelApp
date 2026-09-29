import { Compass, Map as MapIcon } from "lucide-react";
import type { AppMode } from "@/lib/voyager";
import { cn } from "@/lib/utils";

/** Bascule Planifier / Voyager. Cibles de 44 px : elle vit dans l'en-tête des deux modes. */
export function ModeSwitch({ mode, onChange }: { mode: AppMode; onChange: (mode: AppMode) => void }) {
  return (
    <div role="tablist" aria-label="Mode" className="inline-flex h-11 rounded-xl bg-muted p-1 text-sm">
      <ModeTab active={mode === "plan"} onClick={() => onChange("plan")} icon={<MapIcon className="size-4" />}>
        Planifier
      </ModeTab>
      <ModeTab active={mode === "travel"} onClick={() => onChange("travel")} icon={<Compass className="size-4" />}>
        Voyager
      </ModeTab>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-w-28 items-center justify-center gap-1.5 rounded-lg px-3 font-medium transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
