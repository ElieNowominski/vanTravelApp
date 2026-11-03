import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseAmount } from "@/lib/expenses";
import { formatDuration, formatKm } from "@/lib/format";
import { legDurationSec } from "@/lib/legs";
import { isRoadMode, isTravelMode, TRAVEL_MODE_LABELS, TRAVEL_MODES } from "@/lib/profiles";
import type { Leg } from "@/lib/types";
import { useTripStore } from "@/store/trip-store";

/**
 * Tronçon ouvert dans le panneau Planifier : mode, puis la route à choisir (van, voiture, moto)
 * ou l'horaire à saisir (train, ferry, vélo, marche).
 */
export function LegEditor({ leg, defaultCurrency, onDone }: { leg: Leg; defaultCurrency: string; onDone: () => void }) {
  const setLegMode = useTripStore((s) => s.setLegMode);
  const selectAlternative = useTripStore((s) => s.selectAlternative);
  const loading = useTripStore((s) => s.routingStatus === "loading");

  return (
    <div className="mt-1 mb-1.5 ml-5 rounded-lg bg-muted/50 px-2 py-2">
      <div className="flex items-center gap-2">
        <Label htmlFor={`mode-${leg.id}`} className="text-xs text-muted-foreground">
          Mode
        </Label>
        <select
          id={`mode-${leg.id}`}
          value={leg.mode}
          disabled={loading}
          onChange={(e) => {
            if (isTravelMode(e.target.value)) void setLegMode(leg.id, e.target.value);
          }}
          // 16 px minimum : en dessous, iOS zoome la page au focus.
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-base md:h-8 md:text-sm"
        >
          {TRAVEL_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {TRAVEL_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
      </div>

      {leg.track === "aucun" ? (
        <ManualLegForm key={`${leg.id}-${leg.mode}`} leg={leg} defaultCurrency={defaultCurrency} onDone={onDone} />
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {leg.options.length > 1 &&
            leg.options.map((option, index) => (
              <button
                key={`${leg.id}-${index}`}
                type="button"
                onClick={() => selectAlternative(leg.id, index)}
                className={`flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-left text-xs md:min-h-8 ${
                  index === leg.selectedIndex ? "border-primary bg-primary/8" : "border-border bg-background hover:bg-muted"
                }`}
              >
                <span>
                  {option.label}
                  {option.winding ? " · lente" : ""}
                </span>
                <span className="text-muted-foreground">
                  {formatDuration(option.durationSec)} · {formatKm(option.distanceKm)}
                </span>
              </button>
            ))}
          <p className="text-[11px] leading-snug text-muted-foreground">
            {isRoadMode(leg.mode)
              ? leg.estimated
                ? "Route estimée à vol d’oiseau : le calcul reprendra au prochain changement avec du réseau."
                : "Route calculée par OSRM, durée ajustée au profil du voyage."
              : null}
          </p>
          <Button size="sm" variant="ghost" className="h-11 self-end md:h-8" onClick={onDone}>
            Fermer
          </Button>
        </div>
      )}
    </div>
  );
}

function ManualLegForm({ leg, defaultCurrency, onDone }: { leg: Leg; defaultCurrency: string; onDone: () => void }) {
  const updateLegManual = useTripStore((s) => s.updateLegManual);
  const manual = leg.manual ?? {};
  const [departAt, setDepartAt] = useState(manual.departAt ?? "");
  const [arriveAt, setArriveAt] = useState(manual.arriveAt ?? "");
  // Une estimation se montre en indication, pas en valeur : la personne saisit l'horaire réel.
  const [duration, setDuration] = useState(leg.estimated || !manual.durationSec ? "" : formatDuration(manual.durationSec));
  const [distanceKm, setDistanceKm] = useState(manual.distanceKm != null ? String(manual.distanceKm).replace(".", ",") : "");
  const [operator, setOperator] = useState(manual.operator ?? "");
  const [amount, setAmount] = useState(manual.price ? String(manual.price.amount).replace(".", ",") : "");
  const [currency, setCurrency] = useState(manual.price?.currency ?? defaultCurrency);
  const [notes, setNotes] = useState(manual.notes ?? "");
  const id = (field: string) => `leg-${leg.id}-${field}`;

  const save = () => {
    const parsed = amount.trim() ? parseAmount(amount) : null;
    updateLegManual(leg.id, {
      departAt,
      arriveAt,
      duration,
      distanceKm,
      operator,
      price: parsed != null ? { amount: parsed, currency: currency.trim().toUpperCase() || defaultCurrency } : null,
      notes,
    });
    onDone();
  };

  return (
    <form
      className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field id={id("depart")} label="Départ">
        <Input id={id("depart")} className="h-11 md:h-8" value={departAt} onChange={(e) => setDepartAt(e.target.value)} placeholder="8 h 00" />
      </Field>
      <Field id={id("arrive")} label="Arrivée">
        <Input id={id("arrive")} className="h-11 md:h-8" value={arriveAt} onChange={(e) => setArriveAt(e.target.value)} placeholder="11 h 15" />
      </Field>
      <Field id={id("duration")} label="Durée">
        <Input
          id={id("duration")}
          className="h-11 md:h-8"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder={leg.estimated ? `≈ ${formatDuration(legDurationSec(leg))}` : "3 h 15"}
        />
      </Field>
      <Field id={id("km")} label="Distance (km)">
        <Input id={id("km")} className="h-11 md:h-8" inputMode="decimal" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} />
      </Field>
      <div className="col-span-2">
        <Field id={id("operator")} label="Compagnie, numéro">
          <Input id={id("operator")} className="h-11 md:h-8" value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="Fjord Line, train 47" />
        </Field>
      </div>
      <Field id={id("amount")} label="Prix">
        <Input id={id("amount")} className="h-11 md:h-8" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field id={id("currency")} label="Devise">
        <Input id={id("currency")} className="h-11 uppercase md:h-8" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} />
      </Field>
      <div className="col-span-2">
        <Field id={id("notes")} label="Notes">
          <Input id={id("notes")} className="h-11 md:h-8" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Embarquement 45 min avant" />
        </Field>
      </div>
      <p className="col-span-2 text-[11px] leading-snug text-muted-foreground">
        Sans tracé : la carte relie les deux étapes en pointillé. La durée se déduit des deux heures si elle est vide. Le prix reste
        pour mémoire, il n’entre pas dans les dépenses.
      </p>
      <div className="col-span-2 flex justify-end gap-1">
        <Button type="button" size="sm" variant="ghost" className="h-11 md:h-8" onClick={onDone}>
          Fermer
        </Button>
        <Button type="submit" size="sm" className="h-11 md:h-8">
          Enregistrer
        </Button>
      </div>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Label htmlFor={id} className="text-[11px] text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
