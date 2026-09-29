import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseAmount } from "@/lib/expenses";
import type { Booking } from "@/lib/types";
import type { BookingInput } from "@/store/travel-slice";

export function BookingForm({
  initial,
  defaultCurrency,
  onSubmit,
  onCancel,
}: {
  initial?: Booking | null;
  defaultCurrency: string;
  onSubmit: (input: BookingInput) => void;
  onCancel: () => void;
}) {
  const [provider, setProvider] = useState(initial?.provider ?? "");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [accessCode, setAccessCode] = useState(initial?.accessCode ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [checkIn, setCheckIn] = useState(initial?.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(initial?.checkOut ?? "");
  const [amount, setAmount] = useState(initial?.price ? String(initial.price.amount).replace(".", ",") : "");
  const [currency, setCurrency] = useState(initial?.price?.currency ?? defaultCurrency);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!provider.trim()) return setError("Indique au moins le nom du camping ou du prestataire.");
    const parsed = amount.trim() ? parseAmount(amount) : null;
    if (amount.trim() && parsed == null) return setError("Prix illisible (ex. 45 ou 45,50).");
    onSubmit({
      provider,
      reference,
      accessCode,
      address,
      phone,
      url,
      checkIn,
      checkOut,
      price: parsed != null ? { amount: parsed, currency: currency.trim().toUpperCase() || defaultCurrency } : undefined,
      notes,
    });
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field id="bk-provider" label="Camping, hôtel, prestataire *">
        <Input id="bk-provider" className="h-11" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Lakes Edge Holiday Park" autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="bk-ref" label="Référence">
          <Input id="bk-ref" className="h-11 font-mono" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="ABC1234" autoCapitalize="characters" />
        </Field>
        <Field id="bk-code" label="Code d’accès">
          <Input id="bk-code" className="h-11 font-mono" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} placeholder="Portail, boîte à clés" />
        </Field>
      </div>
      <Field id="bk-address" label="Adresse">
        <Input id="bk-address" className="h-11" value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="bk-phone" label="Téléphone">
          <Input id="bk-phone" className="h-11" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+64 3 …" />
        </Field>
        <Field id="bk-url" label="Lien">
          <Input id="bk-url" className="h-11" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field id="bk-in" label="Arrivée">
          <Input id="bk-in" className="h-11" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} placeholder="à partir de 14 h" />
        </Field>
        <Field id="bk-out" label="Départ">
          <Input id="bk-out" className="h-11" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} placeholder="avant 10 h" />
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Field id="bk-amount" label="Prix">
          <Input id="bk-amount" className="h-11" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="45" />
        </Field>
        <Field id="bk-currency" label="Devise">
          <Input id="bk-currency" className="h-11 uppercase" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} />
        </Field>
      </div>
      <Field id="bk-notes" label="Notes">
        <Textarea id="bk-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Emplacement, consignes, contact…" />
      </Field>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" className="h-11">
          {initial ? "Enregistrer" : "Ajouter la réservation"}
        </Button>
      </div>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
