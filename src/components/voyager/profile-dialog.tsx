import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
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
import { PROFILE_COLORS, initials } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { useProfileStore } from "@/store/profile-store";

/** Avatar du profil local : ouvre le réglage prénom, couleur, prénom de l'autre personne. */
export function ProfileButton({ onClick }: { onClick: () => void }) {
  const profile = useProfileStore((s) => s.profile);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-full text-sm font-semibold text-white ring-2 ring-background"
      style={{ backgroundColor: profile.color }}
      aria-label={profile.name ? `Profil : ${profile.name}` : "Renseigner le profil"}
      title={profile.name || "Profil"}
    >
      {initials(profile.name || "?")}
    </button>
  );
}

export function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useProfileStore((s) => s.profile);
  const setProfile = useProfileStore((s) => s.setProfile);
  const [name, setName] = useState(profile.name);
  const [partner, setPartner] = useState(profile.partnerName);
  const [color, setColor] = useState(profile.color);

  const save = () => {
    setProfile({ name: name.trim(), partnerName: partner.trim(), color });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Qui utilise ce téléphone ?</DialogTitle>
          <DialogDescription>
            Le prénom signe les réservations et les dépenses saisies ici. Rien ne quitte l’appareil avant la synchro.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-name">Mon prénom</Label>
            {/* Pas d'autoFocus : sur iOS le clavier s'ouvrirait avant l'affichage et décalerait la page. */}
            <Input id="profile-name" className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-partner">Prénom de l’autre personne</Label>
            <Input id="profile-partner" className="h-11" value={partner} onChange={(e) => setPartner(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">Apparence</p>
            <ThemeToggle variant="segmented" />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">Couleur</p>
            <div className="flex gap-2">
              {PROFILE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Couleur ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className={cn("size-11 rounded-full ring-offset-2 ring-offset-background", color === c && "ring-2 ring-foreground")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={onClose}>
            Annuler
          </Button>
          <Button className="h-11" onClick={save} disabled={!name.trim()}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
