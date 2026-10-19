import { cn } from "@/lib/utils";

/** Choix unique parmi quelques pastilles (catégorie, payeur) : cibles de 40 px, aria radio. */
export function Chips({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            onClick={() => onChange(option.id)}
            className={cn(
              "h-10 rounded-full px-3 text-sm ring-1",
              value === option.id ? "bg-primary text-primary-foreground ring-primary" : "bg-background ring-foreground/15",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
