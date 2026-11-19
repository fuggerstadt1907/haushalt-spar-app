import type { AccountType, TransactionKind } from "@/lib/import/types";
import type { Necessity, Urgency } from "@/lib/rating/types";

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

export const NECESSITY_LABEL: Record<Necessity, string> = {
  must: "Muss",
  should: "Sollte",
  could: "Kann",
  dispensable: "Verzichtbar",
};

export const URGENCY_LABEL: Record<Urgency, string> = {
  immediate: "Sofort nötig",
  could_wait: "Hätte warten können",
  impulse: "Impulskauf",
};

/** Muss eingetippt werden, bevor alle Daten gelöscht werden. */
export const DELETE_ALL_CONFIRMATION = "LÖSCHEN";
