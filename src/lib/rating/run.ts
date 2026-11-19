import "server-only";
import type { requireProfile } from "@/lib/dal";
import type { AccountType, TransactionKind } from "@/lib/import/types";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createGeminiProvider } from "./gemini";
import { rateTransactions } from "./rate";
import { applyRule, buildRuleMap, findRule } from "./rules";
import type { MerchantRule, Necessity, RatableTransaction, RatingUpdate, ReviewStatus, RuleKind, Urgency } from "./types";

type Supabase = Awaited<ReturnType<typeof requireProfile>>["supabase"];

/** Höchstens so viele KI-Batches pro Lauf, damit Import und Button im Zeitlimit bleiben. */
export const MAX_BATCHES_PER_RUN = 3;

const TRANSACTION_FIELDS =
  "id, booking_date, amount_cents, kind, review_status, counterparty, counterparty_iban, purpose, booking_text, creditor_id, merchant_category_code, account(type)";

type TransactionRow = {
  id: string;
  booking_date: string;
  amount_cents: number;
  kind: string;
  review_status: string;
  counterparty: string | null;
  counterparty_iban: string | null;
  purpose: string | null;
  booking_text: string | null;
  creditor_id: string | null;
  merchant_category_code: string | null;
  account: { type: string } | null;
};

function toRatable(row: TransactionRow): RatableTransaction {
  return {
    id: row.id,
    accountType: (row.account?.type ?? "giro") as AccountType,
    bookingDate: row.booking_date,
    amountCents: row.amount_cents,
    kind: row.kind as TransactionKind,
    reviewStatus: row.review_status as ReviewStatus,
    counterparty: row.counterparty,
    counterpartyIban: row.counterparty_iban,
    purpose: row.purpose,
    bookingText: row.booking_text,
    creditorId: row.creditor_id,
    merchantCategoryCode: row.merchant_category_code,
  };
}

export async function loadRules(supabase: Supabase): Promise<MerchantRule[]> {
  const { data, error } = await supabase.from("merchant_rule").select("counterparty_key, kind, category_id, necessity, urgency");
  if (error) throw error;
  return data.map((r) => ({
    counterpartyKey: r.counterparty_key,
    kind: r.kind as RuleKind,
    categoryId: r.category_id,
    necessity: r.necessity as Necessity | null,
    urgency: r.urgency as Urgency | null,
  }));
}

/**
 * Speichert Bewertungen. KI-Vorschläge nur auf noch unbewertete Buchungen, Regeln nur auf nicht
 * bestätigte. So überschreibt ein Lauf im Hintergrund nie, was jemand inzwischen bestätigt hat.
 */
export async function saveRatingUpdates(supabase: Supabase, updates: RatingUpdate[], userId: string) {
  for (let i = 0; i < updates.length; i += 10) {
    const results = await Promise.all(
      updates.slice(i, i + 10).map((u) => {
        let query = supabase
          .from("transaction")
          .update({
            ...(u.kind ? { kind: u.kind } : {}),
            ...(u.clearRefundOf ? { refund_of: null } : {}),
            category_id: u.categoryId,
            necessity: u.necessity,
            urgency: u.urgency,
            ai_reason: u.aiReason,
            review_status: u.reviewStatus,
            rating_source: u.ratingSource,
            updated_by: userId,
          })
          .eq("id", u.id);
        query = u.ratingSource === "ai" ? query.eq("review_status", "unrated") : query.neq("review_status", "confirmed");
        return query;
      }),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
  }
}

/**
 * Bewertet Buchungen (R9–R11). Mit `ids` die Buchungen eines Imports (Regeln für alle Arten, KI für
 * unbewertete Ausgaben), ohne `ids` alle noch unbewerteten Ausgaben („Jetzt bewerten“).
 */
export async function runRating(supabase: Supabase, userId: string, ids?: string[]) {
  const [rows, rules, categories, privateNames] = await Promise.all([
    ids ? loadByIds(supabase, ids) : loadUnrated(supabase),
    loadRules(supabase),
    supabase.from("category").select("id, name").order("name"),
    loadPrivateNames(supabase),
  ]);
  if (categories.error) throw categories.error;

  const result = await rateTransactions({
    transactions: rows.map(toRatable),
    rules,
    categories: categories.data,
    provider: createGeminiProvider(),
    privateNames,
    maxBatches: MAX_BATCHES_PER_RUN,
    onUpdates: (updates) => saveRatingUpdates(supabase, updates, userId),
  });
  return { ratedCount: result.updates.length, unratedCount: result.unratedCount, aiFailed: result.aiFailed };
}

/** Namen, die nie an die KI gehen (R8): Anzeigenamen der Profile und die Namensliste des Haushalts. */
async function loadPrivateNames(supabase: Supabase): Promise<string[]> {
  const [profiles, names] = await Promise.all([
    supabase.from("profile").select("display_name"),
    supabase.from("private_name").select("name"),
  ]);
  if (profiles.error) throw profiles.error;
  if (names.error) throw names.error;
  return [...profiles.data.map((p) => p.display_name), ...names.data.map((n) => n.name)];
}

async function loadByIds(supabase: Supabase, ids: string[]): Promise<TransactionRow[]> {
  const rows: TransactionRow[] = [];
  // Kurze Abfragen, die URL einer in()-Liste ist begrenzt.
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from("transaction")
      .select(TRANSACTION_FIELDS)
      .in("id", ids.slice(i, i + 100))
      .neq("review_status", "confirmed");
    if (error) throw error;
    rows.push(...data);
  }
  return rows;
}

function loadUnrated(supabase: Supabase): Promise<TransactionRow[]> {
  return fetchAll((from, to) =>
    supabase
      .from("transaction")
      .select(TRANSACTION_FIELDS)
      .eq("review_status", "unrated")
      .eq("kind", "expense")
      .order("booking_date", { ascending: false })
      .order("id")
      .range(from, to),
  );
}

/**
 * Eine neue oder geänderte Regel gilt sofort auch für offene Buchungen derselben Gegenpartei
 * (Entscheidung: rückwirkend). Bestätigte Buchungen bleiben unverändert.
 */
export async function applyRuleToOpen(supabase: Supabase, rule: MerchantRule, userId: string) {
  const rows = await fetchAll((from, to) =>
    supabase
      .from("transaction")
      .select("id, kind, amount_cents, counterparty, purpose")
      .neq("review_status", "confirmed")
      .in("kind", ["expense", "income", "refund"])
      .order("id")
      .range(from, to),
  );
  const ruleMap = buildRuleMap([rule]);
  const updates = rows
    .map((r) => ({ id: r.id, kind: r.kind as TransactionKind, amountCents: r.amount_cents, counterparty: r.counterparty, purpose: r.purpose }))
    .filter((r) => findRule(r, ruleMap))
    .map((r) => applyRule(r, rule))
    .filter((u): u is RatingUpdate => u !== null);
  await saveRatingUpdates(supabase, updates, userId);
  return updates.length;
}
