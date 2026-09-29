import type { AmenityChip } from "@/lib/amenities";

/** Contenu d'une popup carte (lieu du catalogue, camping, étape). Monté via `showReactPopup`. */
export function PlacePopup({
  title,
  subtitle,
  details,
  amenities,
  notes,
  warning,
  link,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  details?: string[];
  amenities?: AmenityChip[];
  notes?: string;
  warning?: string;
  link?: { href: string; label: string } | null;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="w-60 p-3 text-sm text-foreground">
      <p className="leading-tight font-medium">{title}</p>
      {subtitle && <p className="mt-1 text-xs opacity-70">{subtitle}</p>}
      {details?.filter(Boolean).map((line) => (
        <p key={line} className="mt-1 text-xs">
          {line}
        </p>
      ))}
      {amenities && amenities.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {amenities.map((chip) => (
            <li
              key={chip.label}
              className={
                chip.ok
                  ? "rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-800"
                  : "rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] text-orange-800"
              }
            >
              {chip.label}
            </li>
          ))}
        </ul>
      )}
      {notes && <p className="mt-2 text-xs leading-snug opacity-80">{notes.slice(0, 220)}</p>}
      {warning && <p className="mt-2 text-xs text-red-700">{warning}</p>}
      {link && (
        <a className="mt-2 inline-block text-xs underline" href={link.href} target="_blank" rel="noreferrer">
          {link.label}
        </a>
      )}
      <button
        type="button"
        onClick={onAction}
        className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-xs font-medium text-primary-foreground"
      >
        {actionLabel}
      </button>
    </div>
  );
}
