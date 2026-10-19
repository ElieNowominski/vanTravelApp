import type { ReactNode } from "react";
import { Link } from "react-router";
import { NetworkBanner } from "@/components/network-banner";
import { UpdateBanner } from "@/components/update-banner";
import { VoyagerNav, type VoyagerSection } from "@/components/voyager/voyager-nav";
import { useTripBoot } from "@/hooks/use-trip-boot";
import { useTripStore } from "@/store/trip-store";

/**
 * Cadre des pages du mode Voyager (`/etape/:id`, `/depenses`, `/documents`) : réhydratation du brouillon,
 * bandeaux, navigation entre sections. Le contenu porte son propre défilement (règle iPhone).
 */
export function VoyagerFrame({ active, children }: { active: VoyagerSection | null; children: ReactNode }) {
  const ready = useTripBoot();
  const config = useTripStore((s) => s.config);

  if (!ready) {
    return <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">Chargement…</div>;
  }
  if (!config) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p>Aucun voyage chargé.</p>
        <Link to="/" className="underline">
          Retour
        </Link>
      </main>
    );
  }
  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background pt-[env(safe-area-inset-top,0px)]">
      <UpdateBanner />
      <NetworkBanner />
      {children}
      <VoyagerNav active={active} />
    </div>
  );
}
