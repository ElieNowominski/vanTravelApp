import { MapPin } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { directionsLinks } from "@/lib/voyager";

/**
 * Boutons de guidage vers un point : Google Maps partout, Plans en premier sur iPhone.
 * À poser dans une rangée `flex flex-wrap gap-2` : chaque bouton fait 44 px de haut.
 */
export function DirectionsButtons({
  lat,
  lng,
  primary = "default",
  className,
}: {
  lat: number;
  lng: number;
  /** Variante du premier bouton ; les suivants sont toujours `outline`. */
  primary?: "default" | "outline";
  className?: string;
}) {
  const links = directionsLinks(lat, lng, navigator.userAgent);
  return (
    <>
      {links.map((link, index) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: index === 0 ? primary : "outline", size: "lg" }), "h-11 min-w-36 flex-1", className)}
        >
          <MapPin className="size-4" />
          {link.label}
        </a>
      ))}
    </>
  );
}
