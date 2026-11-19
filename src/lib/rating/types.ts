import type { AccountType, TransactionKind } from "@/lib/import/types";

export const NECESSITIES = ["must", "should", "could", "dispensable"] as const;
export const URGENCIES = ["immediate", "could_wait", "impulse"] as const;

export type Necessity = (typeof NECESSITIES)[number];
export type Urgency = (typeof URGENCIES)[number];
export type ReviewStatus = "unrated" | "suggested" | "confirmed";
export type RatingSource = "rule" | "ai" | "manual";

/** Arten, die eine Regel oder Korrektur setzen kann. Umbuchung und Sammelabbuchung erkennt der Import. */
export const RULE_KINDS = ["expense", "income"] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

/** Was die Bewertung von einer Buchung kennt. Die IBAN dient nur der Erkennung, sie geht nie an die KI. */
export interface RatableTransaction {
  id: string;
  accountType: AccountType;
  bookingDate: string;
  amountCents: number;
  kind: TransactionKind;
  reviewStatus: ReviewStatus;
  counterparty: string | null;
  counterpartyIban: string | null;
  purpose: string | null;
  bookingText: string | null;
  creditorId: string | null;
  merchantCategoryCode: string | null;
}

export interface Category {
  id: string;
  name: string;
}

export interface MerchantRule {
  counterpartyKey: string;
  kind: RuleKind;
  categoryId: string | null;
  necessity: Necessity | null;
  urgency: Urgency | null;
}

export interface Rating {
  categoryId: string;
  necessity: Necessity;
  urgency: Urgency;
}

/** Änderung an einer Buchung. Fehlende Felder bleiben unverändert. */
export interface RatingUpdate {
  id: string;
  kind?: RuleKind;
  /** Nur gesetzt, wenn eine Regel eine Erstattung zur Einnahme macht. */
  clearRefundOf?: true;
  categoryId: string | null;
  necessity: Necessity | null;
  urgency: Urgency | null;
  aiReason: string | null;
  reviewStatus: ReviewStatus;
  ratingSource: RatingSource | null;
}
