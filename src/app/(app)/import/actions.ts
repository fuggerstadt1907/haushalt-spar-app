"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireProfile } from "@/lib/dal";
import { MAX_UPLOAD_BYTES, parseFiles } from "@/lib/import/files";
import {
  buildImportPreview,
  MATCH_WINDOW_DAYS,
  normalizeIban,
  REFUND_WINDOW_DAYS,
  type BalanceCheck,
  type ExistingTransaction,
  type ImportPreview,
  type PreviewStatus,
} from "@/lib/import/preview";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { ImportError, type BookingStatus, type TransactionKind } from "@/lib/import/types";


/** Was der Browser von der Vorschau sieht. IBANs bleiben auf dem Server. */
export interface PreviewView {
  accountId: string;
  accountName: string;
  fileName: string;
  summary: ImportPreview["summary"];
  balance: BalanceCheck;
  kindUpdateCount: number;
  pendingDeletes: { id: string; bookingDate: string; amountCents: number; counterparty: string | null }[];
  rows: {
    key: string;
    bookingDate: string;
    status: BookingStatus;
    previewStatus: PreviewStatus;
    amountCents: number;
    originalAmountCents: number | null;
    originalCurrency: string | null;
    counterparty: string | null;
    purpose: string | null;
    kind: TransactionKind;
  }[];
}

export type ImportActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "preview"; preview: PreviewView };

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Liest die hochgeladene Datei nur im Arbeitsspeicher (R5) und berechnet die Vorschau gegen den
 * aktuellen Bestand. Wird für „Vorschau“ und für „Übernehmen“ gleichermaßen aufgerufen.
 */
async function computePreview(formData: FormData) {
  const { supabase } = await requireProfile();

  const accountId = formData.get("accountId");
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (typeof accountId !== "string" || !accountId) throw new ImportError("Bitte ein Konto wählen.");
  if (files.length === 0) throw new ImportError("Bitte eine Datei wählen.");
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_UPLOAD_BYTES) {
    throw new ImportError("Die Dateien sind zusammen größer als 4 MB. Bitte in mehreren Teilen importieren.");
  }

  const { data: accounts, error: accountsError } = await supabase.from("account").select("id, name, type, iban");
  if (accountsError) throw accountsError;
  const account = accounts.find((a) => a.id === accountId);
  if (!account) throw new ImportError("Konto nicht gefunden.");

  const statement = parseFiles(
    await Promise.all(files.map(async (f) => ({ name: f.name, content: new Uint8Array(await f.arrayBuffer()) }))),
    account.type as "giro" | "credit_card",
  );

  if (statement.accountIban) {
    const fileIban = normalizeIban(statement.accountIban);
    const owner = accounts.find((a) => a.iban && normalizeIban(a.iban) === fileIban);
    if ((account.iban && normalizeIban(account.iban) !== fileIban) || (owner && owner.id !== account.id)) {
      throw new ImportError(
        `Die Datei gehört zu einem anderen Konto${owner ? ` („${owner.name}“)` : ""} als „${account.name}“.`,
      );
    }
  }

  const from = addDays(statement.periodFrom, -(REFUND_WINDOW_DAYS + MATCH_WINDOW_DAYS));
  const to = addDays(statement.periodTo, MATCH_WINDOW_DAYS);
  const rows = await fetchAll((rangeFrom, rangeTo) =>
    supabase
      .from("transaction")
      .select("id, account_id, booking_date, booking_status, amount_cents, counterparty, purpose, dedupe_hash, kind, refund_of")
      .gte("booking_date", from)
      .lte("booking_date", to)
      .order("id")
      .range(rangeFrom, rangeTo),
  );
  const existing: ExistingTransaction[] = rows.map((t) => ({
    id: t.id,
    accountId: t.account_id,
    bookingDate: t.booking_date,
    bookingStatus: t.booking_status as BookingStatus,
    amountCents: t.amount_cents,
    counterparty: t.counterparty,
    purpose: t.purpose,
    dedupeHash: t.dedupe_hash,
    kind: t.kind as TransactionKind,
    refundOf: t.refund_of,
  }));

  const ownAccounts = accounts.map((a) => ({ id: a.id, type: a.type as "giro" | "credit_card", iban: a.iban }));
  const preview = buildImportPreview({
    account: ownAccounts.find((a) => a.id === account.id)!,
    statement,
    existing,
    ownAccounts,
  });
  const fileName = files.length === 1 ? files[0].name : `${files.length} Dateien`;
  return { supabase, account, statement, preview, fileName };
}

function toErrorState(error: unknown): ImportActionState {
  // redirect() aus requireProfile (abgelaufene Session) nicht als Fehler verschlucken.
  unstable_rethrow(error);
  if (error instanceof ImportError) return { status: "error", message: error.message };
  console.error("Import fehlgeschlagen", error instanceof Error ? error.message : error);
  return { status: "error", message: "Der Import ist fehlgeschlagen. Es wurde nichts gespeichert." };
}

export async function previewImport(_prev: ImportActionState, formData: FormData): Promise<ImportActionState> {
  try {
    const { account, preview, fileName } = await computePreview(formData);
    return {
      status: "preview",
      preview: {
        accountId: account.id,
        accountName: account.name,
        fileName,
        summary: preview.summary,
        balance: preview.balance,
        kindUpdateCount: preview.kindUpdates.length,
        pendingDeletes: preview.pendingDeletes.map((p) => ({
          id: p.id,
          bookingDate: p.bookingDate,
          amountCents: p.amountCents,
          counterparty: p.counterparty ?? p.purpose,
        })),
        rows: preview.rows.map((r, i) => ({
          key: `${i}`,
          bookingDate: r.bookingDate,
          status: r.status,
          previewStatus: r.previewStatus,
          amountCents: r.amountCents,
          originalAmountCents: r.originalAmountCents,
          originalCurrency: r.originalCurrency,
          counterparty: r.counterparty,
          purpose: r.purpose,
          kind: r.kind,
        })),
      },
    };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function commitImport(_prev: ImportActionState, formData: FormData): Promise<ImportActionState> {
  let target: string;
  try {
    const { supabase, account, statement, preview } = await computePreview(formData);

    if (
      preview.balance.type === "checked" &&
      preview.balance.differenceCents !== 0 &&
      formData.get("confirmBalanceMismatch") !== "on"
    ) {
      throw new ImportError("Der Saldo stimmt nicht. Bitte die Abweichung ausdrücklich bestätigen.");
    }

    const toRecord = (r: (typeof preview.rows)[number]) => ({
      id: r.id,
      booking_date: r.bookingDate,
      value_date: r.valueDate,
      booking_status: r.status,
      amount_cents: r.amountCents,
      original_amount_cents: r.originalAmountCents,
      original_currency: r.originalCurrency,
      counterparty: r.counterparty,
      counterparty_iban: r.counterpartyIban,
      purpose: r.purpose,
      booking_text: r.bookingText,
      creditor_id: r.creditorId,
      mandate_reference: r.mandateReference,
      bank_reference: r.bankReference,
      merchant_category_code: r.merchantCategoryCode,
      dedupe_hash: r.dedupeHash,
      kind: r.kind,
      refund_of: r.refundOf,
    });

    const { error } = await supabase.rpc("commit_import", {
      p_import: {
        account_id: account.id,
        format: statement.format,
        period_from: statement.periodFrom,
        period_to: statement.periodTo,
        opening_balance_cents: statement.openingBalanceCents,
        closing_balance_cents: statement.closingBalanceCents,
      },
      p_inserts: preview.rows.filter((r) => r.previewStatus === "new").map(toRecord),
      p_pending_updates: preview.rows.filter((r) => r.previewStatus === "replaces_pending").map(toRecord),
      p_pending_deletes: preview.pendingDeletes.map((p) => p.id),
      p_kind_updates: preview.kindUpdates.map((u) => ({ id: u.id, kind: u.kind, refund_of: u.refundOf })),
    });
    if (error) throw error;

    target = `/buchungen?konto=${account.id}&monat=${statement.periodTo.slice(0, 7)}`;
  } catch (error) {
    return toErrorState(error);
  }

  revalidatePath("/", "layout");
  redirect(target);
}
