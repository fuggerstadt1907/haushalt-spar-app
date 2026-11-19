"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireProfile } from "@/lib/dal";
import { normalizeIban } from "@/lib/import/preview";
import { DELETE_ALL_CONFIRMATION } from "@/lib/labels";
import { applyRuleToOpen } from "@/lib/rating/run";
import { NECESSITIES, URGENCIES, type Necessity, type Urgency } from "@/lib/rating/types";

export type FormState = { error: string | null; ok?: string };

const IBAN_PATTERN = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;

function readAccountForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  const ibanRaw = String(formData.get("iban") ?? "").trim();
  const iban = ibanRaw ? normalizeIban(ibanRaw) : null;
  if (!name) return { error: "Bitte einen Namen eingeben." } as const;
  if (type !== "giro" && type !== "credit_card") return { error: "Bitte einen Kontotyp wählen." } as const;
  if (iban && !IBAN_PATTERN.test(iban)) return { error: "Die IBAN ist ungültig." } as const;
  return { name, type, iban } as const;
}

/**
 * Bekommt ein Konto eine IBAN, werden bisherige Zahlungen an genau diese IBAN zu Umbuchungen (R7).
 */
async function markTransfersTo(supabase: Awaited<ReturnType<typeof requireProfile>>["supabase"], iban: string | null, userId: string) {
  if (!iban) return;
  const { error } = await supabase
    .from("transaction")
    .update({ kind: "transfer", refund_of: null, updated_by: userId })
    .eq("counterparty_iban", iban)
    .in("kind", ["expense", "income", "refund"]);
  // Das Konto ist gespeichert. Ein Fehler hier soll das nicht wie einen Fehlschlag aussehen lassen.
  if (error) console.error("Umbuchungen nachziehen", error.message);
}

function dbError(error: { code?: string; message: string }, duplicate = "Ein Konto mit dieser IBAN gibt es schon."): FormState {
  if (error.code === "23505") return { error: duplicate };
  console.error("Einstellungen", error.message);
  return { error: "Speichern fehlgeschlagen." };
}

export async function createAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, profile } = await requireProfile();
  const input = readAccountForm(formData);
  if ("error" in input) return { error: input.error ?? null };

  const { error } = await supabase
    .from("account")
    .insert({ name: input.name, type: input.type, iban: input.iban, created_by: profile.id });
  if (error) return dbError(error);
  await markTransfersTo(supabase, input.iban, profile.id);

  revalidatePath("/", "layout");
  return { error: null, ok: `Konto „${input.name}“ angelegt.` };
}

export async function updateAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, profile } = await requireProfile();
  const id = String(formData.get("id") ?? "");
  const input = readAccountForm(formData);
  if ("error" in input) return { error: input.error ?? null };

  // Die IBAN geht nie in den Browser zurück. Leeres Feld = unverändert, Entfernen per Checkbox.
  const removeIban = formData.get("removeIban") === "on";
  const changes = removeIban ? { name: input.name, iban: null } : input.iban ? { name: input.name, iban: input.iban } : { name: input.name };
  const { error } = await supabase.from("account").update(changes).eq("id", id);
  if (error) return dbError(error);
  if (!removeIban) await markTransfersTo(supabase, input.iban, profile.id);

  revalidatePath("/", "layout");
  return { error: null, ok: "Gespeichert." };
}

export async function deleteAccount(formData: FormData) {
  const { supabase } = await requireProfile();
  const { error } = await supabase.from("account").delete().eq("id", String(formData.get("id") ?? ""));
  if (error) throw error;
  revalidatePath("/", "layout");
}

/** Löscht einen Import samt seinen Buchungen (R25). */
export async function deleteImport(formData: FormData) {
  const { supabase } = await requireProfile();
  const { error } = await supabase.from("import").delete().eq("id", String(formData.get("id") ?? ""));
  if (error) throw error;
  revalidatePath("/", "layout");
}

/** Löscht Konten, Imports und Buchungen des Haushalts (R25). Logins bleiben bestehen. */
export async function deleteAllData(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireProfile();
  if (String(formData.get("confirmation") ?? "").trim() !== DELETE_ALL_CONFIRMATION) {
    return { error: `Bitte zur Bestätigung „${DELETE_ALL_CONFIRMATION}“ eingeben.` };
  }
  const { error } = await supabase.rpc("delete_all_household_data");
  if (error) return dbError(error);
  revalidatePath("/", "layout");
  return { error: null, ok: "Alle Daten wurden gelöscht." };
}

// Kategorien (R12) ---------------------------------------------------------------------

const DUPLICATE_CATEGORY = "Diese Kategorie gibt es schon.";

export async function createCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireProfile();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Bitte einen Namen eingeben." };
  const { error } = await supabase.from("category").insert({ name });
  if (error) return dbError(error, DUPLICATE_CATEGORY);
  revalidatePath("/", "layout");
  return { error: null, ok: `Kategorie „${name}“ angelegt.` };
}

/** Nur eigene Kategorien lassen sich umbenennen und löschen, die Startliste bleibt fest. */
export async function renameCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireProfile();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Bitte einen Namen eingeben." };
  const { error } = await supabase
    .from("category")
    .update({ name })
    .eq("id", String(formData.get("id") ?? ""))
    .eq("is_default", false);
  if (error) return dbError(error, DUPLICATE_CATEGORY);
  revalidatePath("/", "layout");
  return { error: null, ok: "Gespeichert." };
}

/**
 * Buchungen dieser Kategorie werden wieder unbewertet und landen unter „Zu prüfen“. Regeln
 * verlieren die Kategorie (on delete set null), deren Buchungen bewertet dann wieder die KI.
 */
export async function deleteCategory(formData: FormData) {
  const { supabase, profile } = await requireProfile();
  const id = String(formData.get("id") ?? "");
  const { data: category, error: loadError } = await supabase.from("category").select("is_default").eq("id", id).maybeSingle();
  if (loadError) throw loadError;
  if (!category || category.is_default) return;
  const { error: resetError } = await supabase
    .from("transaction")
    .update({
      category_id: null,
      necessity: null,
      urgency: null,
      ai_reason: null,
      review_status: "unrated",
      rating_source: null,
      updated_by: profile.id,
    })
    .eq("category_id", id);
  if (resetError) throw resetError;
  const { error } = await supabase
    .from("category")
    .delete()
    .eq("id", id)
    .eq("is_default", false);
  if (error) throw error;
  revalidatePath("/", "layout");
}

// Regeln (R11) -------------------------------------------------------------------------

/** Nur Ausgabenregeln haben etwas zu ändern (Kategorie, Stufen). Die Richtung steht fest. */
export async function updateRule(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, profile } = await requireProfile();
  const id = String(formData.get("id") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  const necessity = String(formData.get("necessity") ?? "") as Necessity;
  const urgency = String(formData.get("urgency") ?? "") as Urgency;
  if (!categoryId || !NECESSITIES.includes(necessity) || !URGENCIES.includes(urgency)) {
    return { error: "Bitte Kategorie, Notwendigkeit und Dringlichkeit wählen." };
  }

  const { data: rule, error } = await supabase
    .from("merchant_rule")
    .update({ category_id: categoryId, necessity, urgency, updated_by: profile.id })
    .eq("id", id)
    .eq("kind", "expense")
    .select("counterparty_key")
    .maybeSingle();
  if (error) return dbError(error);
  if (!rule) return { error: "Regel nicht gefunden." };
  revalidatePath("/", "layout");

  try {
    const changed = await applyRuleToOpen(
      supabase,
      { counterpartyKey: rule.counterparty_key, kind: "expense", categoryId, necessity, urgency },
      profile.id,
    );
    return { error: null, ok: changed > 0 ? `Gespeichert, ${changed} offene Buchung${changed === 1 ? "" : "en"} angepasst.` : "Gespeichert." };
  } catch (applyError) {
    unstable_rethrow(applyError);
    console.error("Regel rückwirkend anwenden", applyError instanceof Error ? applyError.message : applyError);
    return { error: null, ok: "Gespeichert. Offene Buchungen konnten nicht angepasst werden, die Regel gilt ab dem nächsten Import." };
  }
}

/** Bereits bewertete Buchungen behalten ihre Bewertung. */
export async function deleteRule(formData: FormData) {
  const { supabase } = await requireProfile();
  const { error } = await supabase.from("merchant_rule").delete().eq("id", String(formData.get("id") ?? ""));
  if (error) throw error;
  revalidatePath("/", "layout");
}

// Namen, die nie an die KI gehen (R8) ------------------------------------------------------

export async function addPrivateName(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, profile } = await requireProfile();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Bitte mindestens zwei Zeichen eingeben." };
  const { error } = await supabase.from("private_name").insert({ name, created_by: profile.id });
  if (error) return dbError(error, "Dieser Name steht schon auf der Liste.");
  revalidatePath("/einstellungen");
  return { error: null, ok: `„${name}“ hinzugefügt.` };
}

export async function deletePrivateName(formData: FormData) {
  const { supabase } = await requireProfile();
  const { error } = await supabase.from("private_name").delete().eq("id", String(formData.get("id") ?? ""));
  if (error) throw error;
  revalidatePath("/einstellungen");
}
