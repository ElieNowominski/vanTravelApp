
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BASE_OVERLAYS } from "@/lib/base-map";
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

/** Replié d'office sur un téléphone : ouvert, le panneau couvre la carte. */
const startsOpen = () => typeof window === "undefined" || !window.matchMedia?.("(max-width: 767px)").matches;

function LayerSwitch({ id, label, hint, color, checked, onChange }: { id: string; label: string; hint: string; color?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="flex items-center gap-2">
        {color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />}
        <span className="flex flex-col gap-0">
          <span>{label}</span>
          <span className="text-xs font-normal text-muted-foreground">{hint}</span>
        </span>
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} size="sm" />
    </div>
  );
}

export function LayerControls({
  campsLoading,
  osmCampsLoading,
  nzSources = true,
  poiStatus,
  baseOverlays = false,
}: {
  campsLoading?: boolean;
  osmCampsLoading?: boolean;
  nzSources?: boolean;
  /** État du calque des points d'intérêt : zoom insuffisant, chargement, plafond, hors ligne. */
  poiStatus?: string | null;
  /** Fond vectoriel chargé : les lieux de ses tuiles peuvent se superposer (lot 6). */
  baseOverlays?: boolean;
}) {
  const layers = useTripStore((s) => s.layers);
  const setLayer = useTripStore((s) => s.setLayer);
  const [open, setOpen] = useState(startsOpen);

  return (
    <div className="absolute top-3 left-3 z-10 flex max-h-[calc(100%-1.5rem)] w-[min(100%-1.5rem,17rem)] flex-col rounded-xl bg-background/95 p-3 shadow-lg ring-1 ring-foreground/10 backdrop-blur">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between text-sm font-medium"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Calques
        <span className="text-muted-foreground">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          {ITEMS.filter((item) => nzSources || !NZ_ONLY.includes(item.key)).map((item) => (
            <LayerSwitch
              key={item.key}
              id={`layer-${item.key}`}
              label={item.label}
              hint={item.hint}
              checked={Boolean(layers[item.key])}
              onChange={(checked) => setLayer(item.key, checked)}
            />
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
          {baseOverlays && (
            <div className="flex flex-col gap-2 border-t pt-2">
              <p className="text-xs font-medium text-muted-foreground">Lieux de la carte (zoom 14 et plus)</p>
              {BASE_OVERLAYS.map((overlay) => (
                <LayerSwitch
                  key={overlay.key}
                  id={`layer-${overlay.key}`}
                  label={overlay.label}
                  hint={overlay.hint}
                  color={overlay.color}
                  checked={Boolean(layers[overlay.key])}
                  onChange={(checked) => setLayer(overlay.key, checked)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
