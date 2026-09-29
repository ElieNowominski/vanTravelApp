import { useState } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { IOS_INSTALL_STEPS } from "@/lib/pwa";

/**
 * Bouton « Installer » : invite native quand le navigateur la propose,
 * guide pas à pas sur iOS. Absent une fois l'app installée.
 */
export function InstallButton({ variant = "icon" }: { variant?: "icon" | "full" }) {
  const { context, install } = useInstallPrompt();
  const [guideOpen, setGuideOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  if (context === "installed" || context === "unsupported") return null;

  const onClick = () => {
    if (context === "ios-manual") {
      setGuideOpen(true);
      return;
    }
    void install().then((accepted) => {
      setStatus(accepted ? "Installée : retrouve vanTravel sur l’écran d’accueil." : null);
    });
  };

  return (
    <>
      {variant === "icon" ? (
        <Button variant="outline" size="icon-sm" onClick={onClick} title="Installer sur le téléphone">
          <Smartphone className="size-3.5" />
          <span className="sr-only">Installer sur le téléphone</span>
        </Button>
      ) : (
        <Button variant="outline" className="h-11" onClick={onClick}>
          <Smartphone className="size-4" />
          Installer sur le téléphone
        </Button>
      )}
      {status && <p className="text-xs text-muted-foreground">{status}</p>}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter à l’écran d’accueil</DialogTitle>
            <DialogDescription>
              Sur iPhone et iPad, l’installation passe par le menu Partager de Safari.
            </DialogDescription>
          </DialogHeader>
          <ol className="flex flex-col gap-2 text-sm">
            {IOS_INSTALL_STEPS.map((step, index) => (
              <li key={step} className="flex gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  {index + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          <DialogFooter>
            <Button onClick={() => setGuideOpen(false)}>Compris</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
