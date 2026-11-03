
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CUSTOM_CATEGORIES } from "@/lib/constants";
import { newId } from "@/lib/geo";
import type { PlaceResult } from "@/lib/place-search";
import { reversePlace } from "@/services/place-search";
import { useTripStore } from "@/store/trip-store";

export function CustomPinDialog({
  open,
  lng,
  lat,
  onClose,
}: {
  open: boolean;
  lng: number | null;
  lat: number | null;
  onClose: () => void;
}) {
  const addCustomPin = useTripStore((s) => s.addCustomPin);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("activite");
  const [notes, setNotes] = useState("");
  const [addToItinerary, setAddToItinerary] = useState(true);
  const [nearest, setNearest] = useState<{ at: string; place: PlaceResult } | null>(null);
  const at = lng != null && lat != null ? `${lng},${lat}` : "";
  const suggestion = nearest && nearest.at === at ? nearest.place : null;

  // Lieu OSM le plus proche (Photon) : proposé comme nom, la localisation sert de sous-titre à l'étape.
  useEffect(() => {
    if (!open || lng == null || lat == null) return;
    const controller = new AbortController();
    reversePlace({ lng, lat }, controller.signal)
      .then((outcome) => {
        const place = outcome.status === "ok" ? outcome.results[0] : undefined;
        if (place) setNearest({ at: `${lng},${lat}`, place });
      })
      .catch(() => {
        /* dialogue fermé avant la réponse */
      });
    return () => controller.abort();
  }, [open, lng, lat]);

  const finalName = name.trim() || suggestion?.name || "";
  const canSave = Boolean(finalName && lng != null && lat != null);

  const reset = () => {
    setName("");
    setCategory("activite");
    setNotes("");
    setAddToItinerary(true);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau lieu</DialogTitle>
          <DialogDescription>
            {lng != null && lat != null
              ? `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`
              : "Clique sur la carte pour poser le pin."}
            {suggestion?.area ? ` · ${suggestion.area}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pin-name">Nom</Label>
            <Input
              id="pin-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={suggestion?.name ?? "Ex. aire de pique-nique au bord du lac"}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pin-cat">Type</Label>
            <select
              id="pin-cat"
              // 16 px minimum : en dessous, iOS zoome la page au focus.
              className="h-11 rounded-lg border border-input bg-background px-2.5 text-base md:h-8 md:text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CUSTOM_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pin-notes">Notes</Label>
            <Textarea
              id="pin-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Durée, parking, marée, réservation…"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="pin-add">Ajouter à l’itinéraire</Label>
            <Switch
              id="pin-add"
              checked={addToItinerary}
              onCheckedChange={setAddToItinerary}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={!canSave}
            onClick={async () => {
              if (lng == null || lat == null) return;
              await addCustomPin(
                {
                  placeId: newId("custom"),
                  name: finalName,
                  lng,
                  lat,
                  kind: "custom",
                  notes: notes.trim() || undefined,
                  ...(suggestion?.area ? { area: suggestion.area } : {}),
                  meta: { category, ...(suggestion && !name.trim() ? { source: "osm" } : {}) },
                },
                addToItinerary,
              );
              reset();
              onClose();
            }}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
