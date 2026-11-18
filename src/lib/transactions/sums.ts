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
