
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useTripStore } from "@/store/trip-store";
import type { LayerKey } from "@/lib/types";

/**
 * Calques propres à la Nouvelle-Zélande, masqués quand le voyage n'y passe pas : catalogue (villes et spots),
 * DOC, et les campings OSM générés au build sur son cadre. Les points d'intérêt OSM à la demande (lot 5)
 * valent partout, Nouvelle-Zélande comprise.
 */
const NZ_ONLY: LayerKey[] = ["towns", "pois", "camps", "osmCamps", "freedom"];

const ITEMS: Array<{ key: LayerKey; label: string; hint: string }> = [
  { key: "towns", label: "Villes", hint: "Cliquables" },
  { key: "pois", label: "Spots", hint: "Catalogue" },
  { key: "camps", label: "Campings DOC", hint: "Gérés" },
  { key: "osmCamps", label: "Holiday parks / OSM", hint: "Gratuit, eau, électricité" },
  { key: "osmPois", label: "Points d'intérêt OSM", hint: "Campings, aires, vidange, eau" },
  { key: "freedom", label: "Freedom camping", hint: "Zones DOC" },
  { key: "custom", label: "Mes pins", hint: "Perso" },
];

export function LayerControls({
  campsLoading,
  osmCampsLoading,
  nzSources = true,
  poiStatus,
}: {
  campsLoading?: boolean;
  osmCampsLoading?: boolean;
  nzSources?: boolean;
  /** État du calque des points d'intérêt : zoom insuffisant, chargement, plafond, hors ligne. */
  poiStatus?: string | null;
}) {
  const layers = useTripStore((s) => s.layers);
  const setLayer = useTripStore((s) => s.setLayer);
  const [open, setOpen] = useState(true);

  return (
    <div className="absolute top-3 left-3 z-10 w-[min(100%-1.5rem,17rem)] rounded-xl bg-background/95 p-3 shadow-lg ring-1 ring-foreground/10 backdrop-blur">
      <button
        type="button"
        className="mb-2 flex w-full items-center justify-between text-sm font-medium"
        onClick={() => setOpen((v) => !v)}
      >
        Calques
        <span className="text-muted-foreground">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2">
          {ITEMS.filter((item) => nzSources || !NZ_ONLY.includes(item.key)).map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-3">
              <Label htmlFor={`layer-${item.key}`} className="flex flex-col gap-0">
                <span>{item.label}</span>
                <span className="text-xs font-normal text-muted-foreground">{item.hint}</span>
              </Label>
              <Switch
                id={`layer-${item.key}`}
                checked={Boolean(layers[item.key])}
                onCheckedChange={(checked) => setLayer(item.key, checked)}
                size="sm"
              />
            </div>
          ))}
          {nzSources && layers.camps && campsLoading && (
            <p className="text-xs text-muted-foreground">Chargement des campings DOC…</p>
          )}
          {layers.osmPois && poiStatus && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {poiStatus}
            </p>
          )}
          {nzSources && layers.osmCamps && osmCampsLoading && (
            <p className="text-xs text-muted-foreground">Chargement holiday parks / OSM…</p>
          )}
        </div>
      )}
    </div>
  );
}
