"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/dal";
import { normalizeIban } from "@/lib/import/preview";
import { DELETE_ALL_CONFIRMATION } from "@/lib/labels";

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

function dbError(error: { code?: string; message: string }): FormState {
  if (error.code === "23505") return { error: "Ein Konto mit dieser IBAN gibt es schon." };
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
