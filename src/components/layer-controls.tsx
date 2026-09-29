
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useTripStore } from "@/store/trip-store";
import type { LayerKey } from "@/lib/types";

const ITEMS: Array<{ key: LayerKey; label: string; hint: string }> = [
  { key: "towns", label: "Villes", hint: "Cliquables" },
  { key: "pois", label: "Spots", hint: "Catalogue" },
  { key: "camps", label: "Campings DOC", hint: "Gérés" },
  { key: "osmCamps", label: "Holiday parks / OSM", hint: "Gratuit, eau, électricité" },
  { key: "freedom", label: "Freedom camping", hint: "Zones DOC" },
  { key: "custom", label: "Mes pins", hint: "Perso" },
];

export function LayerControls({
  campsError,
  osmCampsError,
  freedomError,
  campsLoading,
  osmCampsLoading,
}: {
  campsError?: string | null;
  osmCampsError?: string | null;
  freedomError?: string | null;
  campsLoading?: boolean;
  osmCampsLoading?: boolean;
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
          {ITEMS.map((item) => (
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
          {layers.camps && campsLoading && (
            <p className="text-xs text-muted-foreground">Chargement des campings DOC…</p>
          )}
          {layers.camps && campsError && (
            <p className="text-xs text-destructive">{campsError}</p>
          )}
          {layers.osmCamps && osmCampsLoading && (
            <p className="text-xs text-muted-foreground">Chargement holiday parks / OSM…</p>
          )}
          {layers.osmCamps && osmCampsError && (
            <p className="text-xs text-destructive">{osmCampsError}</p>
          )}
          {layers.freedom && freedomError && (
            <p className="text-xs text-destructive">{freedomError}</p>
          )}
        </div>
      )}
    </div>
  );
}
