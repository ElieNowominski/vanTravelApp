import { ExternalLink, Pencil, Phone, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { Button, buttonVariants } from "@/components/ui/button";
import { DirectionsButtons } from "@/components/voyager/directions-buttons";
import { SecretField } from "@/components/voyager/secret-field";
import { formatMoney } from "@/lib/expenses";
import type { Booking } from "@/lib/types";
import { cn } from "@/lib/utils";
import { telHref } from "@/lib/voyager";

export function BookingCard({
  booking,
  destination,
  onEdit,
  onRemove,
  compact = false,
}: {
  booking: Booking;
  /** Coordonnées de l'étape : bouton « Ouvrir dans Google Maps ». */
  destination?: { lat: number; lng: number } | null;
  onEdit?: () => void;
  onRemove?: () => void;
  compact?: boolean;
}) {
  return (
    <article className="flex flex-col gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{booking.provider}</p>
          {booking.reference && (
            <p className="text-sm">
              <span className="text-muted-foreground">Réf. </span>
              <span className="font-mono font-medium select-all">{booking.reference}</span>
            </p>
          )}
        </div>
        {booking.price && (
          <span className="shrink-0 text-sm font-medium">{formatMoney(booking.price.amount, booking.price.currency)}</span>
        )}
      </header>

      {booking.accessCode && <SecretField label="Code d’accès" value={booking.accessCode} />}

      {(booking.checkIn || booking.checkOut) && (
        <p className="text-xs text-muted-foreground">
          {booking.checkIn ? `Arrivée ${booking.checkIn}` : ""}
          {booking.checkIn && booking.checkOut ? " · " : ""}
          {booking.checkOut ? `Départ ${booking.checkOut}` : ""}
        </p>
      )}
      {booking.address && <p className="text-sm">{booking.address}</p>}
      {!compact && booking.notes && <p className="text-sm whitespace-pre-line text-muted-foreground">{booking.notes}</p>}

      <div className="flex flex-wrap gap-2">
        {destination && <DirectionsButtons lat={destination.lat} lng={destination.lng} />}
        {booking.phone && (
          <a href={telHref(booking.phone)} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 flex-1 min-w-36")}>
            <Phone className="size-4" />
            Appeler
          </a>
        )}
      </div>
      {booking.phone && <p className="text-xs text-muted-foreground select-all">{booking.phone}</p>}
      {booking.url && (
        <a href={booking.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline underline-offset-2">
          <ExternalLink className="size-3" />
          Ouvrir la réservation
        </a>
      )}

      {(onEdit || onRemove) && (
        <footer className="flex flex-wrap gap-1 border-t pt-2">
          {onEdit && (
            <Button size="sm" variant="ghost" className="h-9" onClick={onEdit}>
              <Pencil className="size-3.5" />
              Modifier
            </Button>
          )}
          {onRemove && (
            <ConfirmAction
              size="sm"
              className="h-9"
              icon={<Trash2 className="size-3.5" />}
              label="Supprimer"
              question="Supprimer cette réservation ?"
              confirmLabel="Supprimer"
              onConfirm={onRemove}
            />
          )}
        </footer>
      )}
    </article>
  );
}
