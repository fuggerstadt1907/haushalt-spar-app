import { ImportError, type AccountType, type ImportAdapter, type ParsedStatement } from "../types";
import { camt052Adapter } from "./camt052";
import { sparkasseMastercardCsvAdapter } from "./sparkasse-mastercard-csv";

/** Alle Import-Adapter. Ein neues Format = ein neuer Eintrag hier. */
export const adapters: ImportAdapter[] = [camt052Adapter, sparkasseMastercardCsvAdapter];

const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  giro: "ein Girokonto",
  credit_card: "eine Kreditkarte",
};

/** Erkennt das Format, prüft, ob es zum Konto passt, und liest die Datei. */
export function parseStatement(content: Uint8Array, accountType: AccountType): ParsedStatement {
  const adapter = adapters.find((a) => a.detect(content));
  if (!adapter) {
    throw new ImportError(
      "Datei konnte nicht gelesen werden. Unterstützt werden CAMT-XML (Girokonto) und der Mastercard-CSV-Export der Sparkasse.",
    );
  }
  if (adapter.accountType !== accountType) {
    throw new ImportError(
      `Die Datei (${adapter.label}) passt nicht zum gewählten Konto. Sie gehört zu ${ACCOUNT_TYPE_LABEL[adapter.accountType]}.`,
    );
  }
  try {
    return adapter.parse(content);
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError("Datei konnte nicht gelesen werden.");
  }
}
