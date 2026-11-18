"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DELETE_ALL_CONFIRMATION } from "@/lib/labels";
import { createAccount, deleteAllData, updateAccount, type FormState } from "./actions";

const INITIAL: FormState = { error: null };
const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="text-sm text-destructive">{state.error}</p>;
  if (state.ok) return <p role="status" className="text-sm text-muted-foreground">{state.ok}</p>;
  return null;
}

const IBAN_HINT = "Nur zum Erkennen von Umbuchungen zwischen euren Konten. Wird nie an Dritte gegeben.";

export function NewAccountForm() {
  const [state, action, pending] = useActionState(createAccount, INITIAL);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_10rem_1fr_auto] sm:items-end">
      <div className="space-y-1.5">
        <Label htmlFor="new-name">Name</Label>
        <Input id="new-name" name="name" placeholder="z. B. Gehaltskonto" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-type">Typ</Label>
        <select id="new-type" name="type" className={selectClass} defaultValue="giro">
          <option value="giro">Girokonto</option>
          <option value="credit_card">Kreditkarte</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-iban">IBAN (optional)</Label>
        <Input id="new-iban" name="iban" placeholder="DE…" autoComplete="off" title={IBAN_HINT} />
      </div>
      <Button type="submit" disabled={pending}>
        Konto anlegen
      </Button>
      <div className="sm:col-span-4">
        <Feedback state={state} />
        <p className="text-xs text-muted-foreground">{IBAN_HINT}</p>
      </div>
    </form>
  );
}

export function EditAccountForm({
  account,
}: {
  account: { id: string; name: string; type: string; ibanHint: string | null };
}) {
  const [state, action, pending] = useActionState(updateAccount, INITIAL);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="id" value={account.id} />
      <input type="hidden" name="type" value={account.type} />
      <div className="space-y-1.5">
        <Label htmlFor={`name-${account.id}`}>Name</Label>
        <Input id={`name-${account.id}`} name="name" defaultValue={account.name} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`iban-${account.id}`}>IBAN</Label>
        <Input
          id={`iban-${account.id}`}
          name="iban"
          autoComplete="off"
          placeholder={account.ibanHint ? `Hinterlegt, ${account.ibanHint}` : "Keine IBAN hinterlegt"}
        />
        {account.ibanHint && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="removeIban" className="size-3.5" /> IBAN entfernen
          </label>
        )}
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        Speichern
      </Button>
      <div className="sm:col-span-3">
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function DeleteAllForm() {
  const [state, action, pending] = useActionState(deleteAllData, INITIAL);
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="confirmation">Zur Bestätigung „{DELETE_ALL_CONFIRMATION}“ eingeben</Label>
        <Input id="confirmation" name="confirmation" autoComplete="off" className="max-w-xs" />
      </div>
      <Button type="submit" variant="destructive" disabled={pending}>
        Alle Daten löschen
      </Button>
      <Feedback state={state} />
    </form>
  );
}
