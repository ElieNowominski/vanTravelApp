import { Link } from "react-router";
import { BookOpen, CalendarDays, FolderOpen, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

export type VoyagerSection = "jour" | "depenses" | "documents" | "roadbook";

const ITEMS: Array<{ id: VoyagerSection; to: string; label: string; icon: typeof CalendarDays }> = [
  { id: "jour", to: "/", label: "Jour", icon: CalendarDays },
  { id: "depenses", to: "/depenses", label: "Dépenses", icon: Receipt },
  { id: "documents", to: "/documents", label: "Documents", icon: FolderOpen },
  { id: "roadbook", to: "/roadbook", label: "Roadbook", icon: BookOpen },
];

/**
 * Sections du mode Voyager : barre du bas sur téléphone, rangée d'onglets en haut sur grand écran
 * (`md:order-first` dans le cadre). Chaque cible fait 56 px de haut.
 */
export function VoyagerNav({ active }: { active: VoyagerSection | null }) {
  return (
    <nav
      aria-label="Sections"
      className="flex shrink-0 border-t bg-background pb-[env(safe-area-inset-bottom,0px)] md:order-first md:justify-center md:gap-1 md:border-t-0 md:border-b md:px-4 md:pb-0"
    >
      {ITEMS.map(({ id, to, label, icon: Icon }) => (
        <Link
          key={id}
          to={to}
          aria-current={active === id ? "page" : undefined}
          className={cn(
            "flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium md:h-12 md:flex-none md:flex-row md:gap-1.5 md:px-4 md:text-sm",
            active === id ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Icon className="size-5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
