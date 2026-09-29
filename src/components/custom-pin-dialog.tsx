
import { useState } from "react";
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

  const canSave = Boolean(name.trim() && lng != null && lat != null);

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
          <DialogTitle>Nouveau point d’attention</DialogTitle>
          <DialogDescription>
            {lng != null && lat != null
              ? `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`
              : "Clique sur la carte pour poser le pin."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pin-name">Nom</Label>
            <Input
              id="pin-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. rando Blue Pools au lever du soleil"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pin-cat">Type</Label>
            <select
              id="pin-cat"
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
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
                  name: name.trim(),
                  lng,
                  lat,
                  kind: "custom",
                  notes: notes.trim() || undefined,
                  meta: { category },
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
