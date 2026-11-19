"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireProfile } from "@/lib/dal";
import { applyRuleToOpen, runRating } from "@/lib/rating/run";
import { counterpartyKey } from "@/lib/rating/rules";
import { NECESSITIES, URGENCIES, type MerchantRule, type Necessity, type Urgency } from "@/lib/rating/types";

export type RatingFormState = { error: string | null; ok?: string };

function failed(context: string, error: unknown): RatingFormState {
  // redirect() aus requireProfile (abgelaufene Session) nicht als Fehler verschlucken.
  unstable_rethrow(error);
  console.error(context, error instanceof Error ? error.message : error);
  return { error: "Speichern fehlgeschlagen." };
}

/** „Stimmt“: Der KI-Vorschlag wird unverändert bestätigt (R10). Erzeugt keine Regel. */
export async function confirmRating(id: string): Promise<RatingFormState> {
  try {
    const { supabase, profile } = await requireProfile();
    const { data, error } = await supabase
      .from("transaction")
      .update({ review_status: "confirmed", updated_by: profile.id })
      .eq("id", id)
      .eq("review_status", "suggested")
      .select("id");
    if (error) throw error;
    revalidatePath("/", "layout");
    if (data.length === 0) return { error: "Die Buchung wurde inzwischen schon bearbeitet." };
    return { error: null, ok: "Bestätigt." };
  } catch (error) {
    return failed("Bewertung bestätigen", error);
  }
}

type RatingInput = {
  id: string;
  kind: "expense" | "income" | "refund";
  categoryId: string | null;
  necessity: Necessity | null;
  urgency: Urgency | null;
};

function readRatingForm(formData: FormData): RatingInput | { error: string } {
  const id = String(formData.get("id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (!id || (kind !== "expense" && kind !== "income" && kind !== "refund")) return { error: "Bitte eine Art wählen." };
  if (kind !== "expense") return { id, kind, categoryId: null, necessity: null, urgency: null };

  const categoryId = String(formData.get("categoryId") ?? "");
  const necessity = String(formData.get("necessity") ?? "") as Necessity;
  const urgency = String(formData.get("urgency") ?? "") as Urgency;
  if (!categoryId) return { error: "Bitte eine Kategorie wählen." };
  if (!NECESSITIES.includes(necessity)) return { error: "Bitte die Notwendigkeit wählen." };
  if (!URGENCIES.includes(urgency)) return { error: "Bitte die Dringlichkeit wählen." };
  return { id, kind, categoryId, necessity, urgency };
}

/**
 * Bewertung setzen oder korrigieren. Weicht sie vom bisherigen Stand ab, entsteht eine Regel für
 * die Gegenpartei, die sofort auch für deren offene Buchungen gilt (R11). Abflüsse sind immer
 * Ausgaben. Zuflüsse sind Einnahmen oder bleiben die erkannte Erstattung.
 */
export async function saveRating(_prev: RatingFormState, formData: FormData): Promise<RatingFormState> {
  try {
    const { supabase, profile } = await requireProfile();
    const input = readRatingForm(formData);
    if ("error" in input) return { error: input.error };

    const { data: tx, error: loadError } = await supabase
      .from("transaction")
      .select("id, kind, amount_cents, counterparty, purpose, category_id, necessity, urgency")
      .eq("id", input.id)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!tx) return { error: "Buchung nicht gefunden." };
    if (!["expense", "income", "refund"].includes(tx.kind)) {
      return { error: "Umbuchungen und Sammelabbuchungen lassen sich nicht bewerten." };
    }
    if (tx.amount_cents < 0 && input.kind !== "expense") return { error: "Abbuchungen sind immer Ausgaben." };
    if (tx.amount_cents >= 0 && input.kind === "expense") return { error: "Gutschriften können keine Ausgabe sein." };
    if (input.kind === "refund" && tx.kind !== "refund") return { error: "Erstattungen erkennt der Import." };

    const unchanged =
      tx.kind === input.kind &&
      tx.category_id === input.categoryId &&
      tx.necessity === input.necessity &&
      tx.urgency === input.urgency;

    const { error: updateError } = await supabase
      .from("transaction")
      .update({
        kind: input.kind,
        ...(tx.kind === "refund" && input.kind !== "refund" ? { refund_of: null } : {}),
        category_id: input.categoryId,
        necessity: input.necessity,
        urgency: input.urgency,
        review_status: "confirmed",
        ...(unchanged ? {} : { rating_source: "manual", ai_reason: null }),
        updated_by: profile.id,
      })
      .eq("id", tx.id);
    if (updateError) throw updateError;

    const key = counterpartyKey(tx);
    if (unchanged || input.kind === "refund" || !key) {
      revalidatePath("/", "layout");
      if (unchanged || input.kind === "refund") return { error: null, ok: "Bestätigt." };
      return { error: null, ok: "Gespeichert. Für Zahlungsdienste und Buchungen ohne Gegenpartei entsteht keine Regel." };
    }

    const rule: MerchantRule = {
      counterpartyKey: key,
      kind: input.kind,
      categoryId: input.categoryId,
      necessity: input.necessity,
      urgency: input.urgency,
    };
    const ruleFields = {
      category_id: rule.categoryId,
      necessity: rule.necessity,
      urgency: rule.urgency,
      updated_by: profile.id,
    };
    // Erst anlegen, bei Konflikt (gibt es schon, auch gleichzeitig angelegt) aktualisieren.
    const { error: insertError } = await supabase.from("merchant_rule").insert({
      ...ruleFields,
      counterparty_key: key,
      kind: rule.kind,
      counterparty_label: tx.counterparty ?? tx.purpose ?? key,
      created_by: profile.id,
    });
    const existed = insertError?.code === "23505";
    if (insertError && !existed) throw insertError;
    if (existed) {
      const { error: ruleError } = await supabase
        .from("merchant_rule")
        .update(ruleFields)
        .eq("counterparty_key", key)
        .eq("kind", rule.kind);
      if (ruleError) throw ruleError;
    }

    const label = tx.counterparty ?? key;
    let ok = `Gespeichert. Regel für „${label}“ ${existed ? "aktualisiert" : "angelegt"}`;
    try {
      const changedCount = await applyRuleToOpen(supabase, rule, profile.id);
      ok += changedCount > 0 ? `, ${changedCount} weitere Buchung${changedCount === 1 ? "" : "en"} angepasst.` : ".";
    } catch (error) {
      unstable_rethrow(error);
      console.error("Regel rückwirkend anwenden", error instanceof Error ? error.message : error);
      ok += ". Offene Buchungen derselben Gegenpartei konnten nicht angepasst werden, die Regel gilt ab dem nächsten Import.";
    }
    revalidatePath("/", "layout");
    return { error: null, ok };
  } catch (error) {
    return failed("Bewertung speichern", error);
  }
}

/** „Jetzt bewerten“: alle unbewerteten Ausgaben an Regeln und KI (auch nach einem KI-Fehler). */
export async function rateNow(): Promise<RatingFormState> {
  try {
    const { supabase, profile } = await requireProfile();
    if (!process.env.GEMINI_API_KEY) return { error: "Die KI ist nicht eingerichtet (GEMINI_API_KEY fehlt)." };
    const result = await runRating(supabase, profile.id);
    revalidatePath("/", "layout");
    if (result.aiFailed) {
      return {
        error: `Die KI ist gerade nicht erreichbar oder am Tageslimit. ${result.ratedCount} bewertet, ${result.unratedCount} noch offen. Später erneut versuchen.`,
      };
    }
    return {
      error: null,
      ok:
        `${result.ratedCount} Buchung${result.ratedCount === 1 ? "" : "en"} bewertet.` +
        (result.unratedCount > 0 ? ` ${result.unratedCount} noch offen, bitte erneut starten.` : ""),
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("Jetzt bewerten", error instanceof Error ? error.message : error);
    return { error: "Die Bewertung ist fehlgeschlagen." };
  }
}
