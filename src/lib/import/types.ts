export type AccountType = "giro" | "credit_card";
export type BookingStatus = "booked" | "pending";
export type TransactionKind = "expense" | "income" | "transfer" | "card_settlement" | "refund";

/** Eine Buchung, wie ein Adapter sie aus einer Datei liest. Daten als ISO-Datum (YYYY-MM-DD). */
export interface ParsedTransaction {
  bookingDate: string;
  valueDate: string | null;
  status: BookingStatus;
  /** Negativ = Abfluss, positiv = Zufluss, in EUR-Cent. */
  amountCents: number;
  originalAmountCents: number | null;
  originalCurrency: string | null;
  counterparty: string | null;
  counterpartyIban: string | null;
  purpose: string | null;
  bookingText: string | null;
  creditorId: string | null;
  mandateReference: string | null;
  bankReference: string | null;
  merchantCategoryCode: string | null;
}

export interface ParsedStatement {
  format: string;
  accountIban: string | null;
  periodFrom: string;
  periodTo: string;
  openingBalanceCents: number | null;
  closingBalanceCents: number | null;
  transactions: ParsedTransaction[];
}

/** Wandelt eine Datei in einheitliche Buchungen um (R3). Neue Formate = neuer Adapter. */
export interface ImportAdapter {
  id: string;
  label: string;
  accountType: AccountType;
  detect(content: Uint8Array): boolean;
  parse(content: Uint8Array): ParsedStatement;
}

/** Fehler mit einer Meldung, die so in der Oberfläche angezeigt werden kann. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}
