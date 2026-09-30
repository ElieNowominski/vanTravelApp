import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useThemeStore } from "@/hooks/use-theme";
import { THEME_LABELS, nextThemePreference, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;
const ORDER: ThemePreference[] = ["system", "light", "dark"];

/** Apparence : icône qui fait défiler (en-tête Planifier) ou trois boutons de 44 px (dialogue profil). */
export function ThemeToggle({ variant = "icon" }: { variant?: "icon" | "segmented" }) {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

  if (variant === "icon") {
    const Icon = ICONS[preference];
    return (
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => setPreference(nextThemePreference(preference))}
        title={`Apparence : ${THEME_LABELS[preference]}`}
      >
        <Icon className="size-3.5" />
        <span className="sr-only">Apparence : {THEME_LABELS[preference]}</span>
      </Button>
    );
  }

  return (
    <div role="radiogroup" aria-label="Apparence" className="grid grid-cols-3 gap-2">
      {ORDER.map((pref) => {
        const Icon = ICONS[pref];
        const active = pref === preference;
        return (
          <button
            key={pref}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPreference(pref)}
            className={cn(
              "flex h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-medium ring-1",
              active ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-foreground ring-foreground/10",
            )}
          >
            <Icon className="size-4" />
            {pref === "system" ? "Auto" : THEME_LABELS[pref]}
          </button>
        );
      })}
    </div>
  );
}
