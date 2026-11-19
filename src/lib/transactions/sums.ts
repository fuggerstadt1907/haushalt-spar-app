import type { BookingStatus, TransactionKind } from "@/lib/import/types";

export interface SummableTransaction {
  amountCents: number;
  kind: TransactionKind;
  bookingStatus: BookingStatus;
}

export interface Sums {
  incomeCents: number;
  /** Positiver Betrag. Erstattungen sind bereits abgezogen (R7). */
  expensesCents: number;
  pendingExpensesCents: number;
}

/**
 * Einnahmen und Ausgaben (R7): Umbuchungen und Sammelabbuchungen zählen nicht,
 * Erstattungen werden mit den Ausgaben verrechnet. Vorgemerktes wird gesondert ausgewiesen (R7a).
 */
export function sumTransactions(transactions: SummableTransaction[]): Sums {
  let incomeCents = 0;
  let expensesCents = 0;
  let pendingExpensesCents = 0;
  for (const t of transactions) {
    if (t.kind === "income") incomeCents += t.amountCents;
    if (t.kind === "expense" || t.kind === "refund") {
      expensesCents -= t.amountCents;
      if (t.bookingStatus === "pending") pendingExpensesCents -= t.amountCents;
    }
  }
  return { incomeCents, expensesCents, pendingExpensesCents };
}

export interface CategorizableTransaction extends SummableTransaction {
  id: string;
  categoryId: string | null;
  refundOf: string | null;
}

export interface CategorySum {
  /** `null` = ohne Kategorie (unbewertet oder Erstattung ohne passende Ausgabe im Zeitraum). */
  categoryId: string | null;
  /** Positiver Betrag, Erstattungen sind abgezogen. */
  cents: number;
}

/**
 * Monatsübersicht nach Kategorien (R22). Ergibt in Summe dieselben Ausgaben wie sumTransactions:
 * Erstattungen zählen bei der Kategorie der erstatteten Ausgabe, wenn diese im Zeitraum liegt.
 */
export function sumByCategory(transactions: CategorizableTransaction[]): CategorySum[] {
  const byId = new Map(transactions.map((t) => [t.id, t]));
  const sums = new Map<string | null, number>();
  for (const t of transactions) {
    if (t.kind !== "expense" && t.kind !== "refund") continue;
    const origin = t.kind === "refund" && t.refundOf ? byId.get(t.refundOf) : undefined;
    const categoryId = t.kind === "expense" ? t.categoryId : (origin?.categoryId ?? null);
    sums.set(categoryId, (sums.get(categoryId) ?? 0) - t.amountCents);
  }
  return [...sums]
    .map(([categoryId, cents]) => ({ categoryId, cents }))
    .filter((s) => s.cents !== 0)
    .sort((a, b) => b.cents - a.cents);
}
