import { useState } from "react";
import { Database, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DatasetProblem = { label: string; message: string };

/**
 * Jeux de données publics manquants (campings DOC, aires OSM, freedom camping) :
 * un seul message clair sur la carte, au lieu de lignes rouges perdues dans les calques.
 * L'itinéraire et les fiches n'en dépendent pas : la notice se ferme.
 */
export function DatasetNotice({ problems }: { problems: DatasetProblem[] }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || problems.length === 0) return null;
  const missing = problems.every((p) => /absent/i.test(p.message));

  return (
    <div
      role="alert"
      className="absolute inset-x-3 top-14 z-10 mx-auto max-w-sm rounded-xl bg-background/95 p-3 text-sm shadow-lg ring-1 ring-destructive/30 backdrop-blur md:left-auto md:right-3 md:top-3"
    >
      <div className="flex items-start gap-2">
        <Database className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {problems.length === 1 ? "Un calque est indisponible" : `${problems.length} calques sont indisponibles`}
          </p>
          <ul className="mt-1 text-xs text-muted-foreground">
            {problems.map((p) => (
              <li key={p.label}>
                {p.label} : {p.message.replace(/\s*\(lance npm run data\)\.?/, "").replace(/\.$/, "")}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            {missing
              ? import.meta.env.DEV
                ? "En local, lance « npm run data » puis recharge. Le reste de l’app fonctionne."
                : "Le prochain déploiement les régénère. L’itinéraire et les fiches ne sont pas concernés."
              : "Réessaie plus tard : l’itinéraire et les fiches ne sont pas concernés."}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="-mr-1 -mt-1 shrink-0"
          onClick={() => setDismissed(true)}
          aria-label="Fermer"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
