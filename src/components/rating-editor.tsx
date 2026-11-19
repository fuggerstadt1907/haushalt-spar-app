"use client";

import { useActionState, useState, useTransition } from "react";
import { confirmRating, rateNow, saveRating, type RatingFormState } from "@/app/(app)/pruefen/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NECESSITY_LABEL, URGENCY_LABEL } from "@/lib/labels";
import { NECESSITIES, URGENCIES } from "@/lib/rating/types";

const INITIAL: RatingFormState = { error: null };
const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export interface EditableRating {
  id: string;
  kind: string;
  amountCents: number;
  counterparty: string | null;
  categoryId: string | null;
  necessity: string | null;
  urgency: string | null;
}

export interface CategoryOption {
  id: string;
  name: string;
}

function Feedback({ state }: { state: RatingFormState }) {
  if (state.error) return <p role="alert" className="text-sm text-destructive">{state.error}</p>;
  if (state.ok) return <p role="status" className="text-sm text-muted-foreground">{state.ok}</p>;
  return null;
}

export interface KindOption {
  value: "expense" | "income" | "refund";
  label: string;
}

/** Abflüsse sind immer Ausgaben. Eine erkannte Erstattung bleibt Erstattung oder wird Einnahme (F4). */
export function kindOptionsFor(rating: Pick<EditableRating, "kind" | "amountCents">): KindOption[] {
  if (rating.amountCents < 0) return [{ value: "expense", label: "Ausgabe" }];
  if (rating.kind === "refund") {
    return [
      { value: "refund", label: "Erstattung" },
      { value: "income", label: "Einnahme" },
    ];
  }
  return [{ value: "income", label: "Einnahme" }];
}

/**
 * Auswahlfelder Art, Kategorie, Notwendigkeit und Dringlichkeit. Gibt es nur eine mögliche Art,
 * steht sie fest. Kategorie und Stufen gibt es nur bei Ausgaben.
 */
export function RatingFields({
  idPrefix,
  rating,
  kindOptions,
  categories,
}: {
  idPrefix: string;
  rating: Pick<EditableRating, "kind" | "categoryId" | "necessity" | "urgency">;
  kindOptions: KindOption[];
  categories: CategoryOption[];
}) {
  const [kind, setKind] = useState(
    kindOptions.find((o) => o.value === rating.kind)?.value ?? kindOptions[0].value,
  );
  const id = (field: string) => `${field}-${idPrefix}`;

  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {kindOptions.length > 1 ? (
        <div className="space-y-1.5">
          <Label htmlFor={id("kind")}>Art</Label>
          <select
            id={id("kind")}
            name="kind"
            className={selectClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as KindOption["value"])}
          >
            {kindOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="kind" value={kind} />
      )}
      {kind === "expense" && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={id("category")}>Kategorie</Label>
            <select id={id("category")} name="categoryId" className={selectClass} defaultValue={rating.categoryId ?? ""} required>
              <option value="" disabled>
                Bitte wählen
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("necessity")}>Notwendigkeit</Label>
            <select id={id("necessity")} name="necessity" className={selectClass} defaultValue={rating.necessity ?? ""} required>
              <option value="" disabled>
                Bitte wählen
              </option>
              {NECESSITIES.map((n) => (
                <option key={n} value={n}>
                  {NECESSITY_LABEL[n]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("urgency")}>Dringlichkeit</Label>
            <select id={id("urgency")} name="urgency" className={selectClass} defaultValue={rating.urgency ?? ""} required>
              <option value="" disabled>
                Bitte wählen
              </option>
              {URGENCIES.map((u) => (
                <option key={u} value={u}>
                  {URGENCY_LABEL[u]}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  );
}

/** Bewertung einer Buchung setzen. Eine Änderung wird zur Regel (R11). */
export function RatingForm({ rating, categories }: { rating: EditableRating; categories: CategoryOption[] }) {
  const [state, action, pending] = useActionState(saveRating, INITIAL);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={rating.id} />
      <RatingFields idPrefix={rating.id} rating={rating} kindOptions={kindOptionsFor(rating)} categories={categories} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Wird gespeichert …" : "Speichern"}
        </Button>
        {rating.counterparty && (
          <span className="text-xs text-muted-foreground">Gilt bei Änderung künftig für alle Buchungen von „{rating.counterparty}“.</span>
        )}
      </div>
      <Feedback state={state} />
    </form>
  );
}

/** „Stimmt“ und „Ändern“ unter einem Vorschlag (R10). */
export function RatingActions({
  rating,
  categories,
  canConfirm,
  editLabel = "Ändern",
  compact = false,
}: {
  rating: EditableRating;
  categories: CategoryOption[];
  canConfirm: boolean;
  editLabel?: string;
  /** Kleine, unauffällige Buttons für die Buchungsliste. */
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirmState, setConfirmState] = useState<RatingFormState>(INITIAL);

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex flex-wrap gap-2">
        {canConfirm && (
          <Button
            size={compact ? "xs" : "sm"}
            variant={compact ? "outline" : "default"}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setConfirmState(await confirmRating(rating.id));
              })
            }
          >
            {pending ? "Wird bestätigt …" : "Stimmt"}
          </Button>
        )}
        <Button size={compact ? "xs" : "sm"} variant={compact ? "ghost" : "outline"} aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
          {editing ? "Schließen" : editLabel}
        </Button>
      </div>
      {confirmState.error && <Feedback state={confirmState} />}
      {editing && <RatingForm rating={rating} categories={categories} />}
    </div>
  );
}

/** „Jetzt bewerten“: unbewertete Ausgaben an Regeln und KI. */
export function RateNowForm({ unratedCount }: { unratedCount: number }) {
  const [state, action, pending] = useActionState(rateNow, INITIAL);
  return (
    <form action={action} className="space-y-2">
      <Button type="submit" variant="outline" disabled={pending || unratedCount === 0}>
        {pending ? "KI bewertet …" : `Jetzt bewerten (${unratedCount})`}
      </Button>
      <Feedback state={state} />
    </form>
  );
}
