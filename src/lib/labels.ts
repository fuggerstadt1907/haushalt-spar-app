import type { AccountType, TransactionKind } from "@/lib/import/types";

export const KIND_LABEL: Record<TransactionKind, string> = {
  expense: "Ausgabe",
  income: "Einnahme",
  transfer: "Umbuchung",
  card_settlement: "Kreditkarten-Sammelabbuchung",
  refund: "Erstattung",
};

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  giro: "Girokonto",
  credit_card: "Kreditkarte",
};

/** Muss eingetippt werden, bevor alle Daten gelöscht werden. */
export const DELETE_ALL_CONFIRMATION = "LÖSCHEN";
