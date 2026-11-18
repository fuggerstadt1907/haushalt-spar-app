import { emptyToNull, minMaxDate, parseAmountToCents, parseGermanDate } from "../parse-utils";
import { ImportError, type ImportAdapter, type ParsedStatement } from "../types";

/**
 * CSV-Export der Sparkassen-Mastercard aus dem Online-Banking:
 * ISO-8859-1, Trennzeichen ";", Datum TT.MM.JJ, Dezimalkomma. Enthält keine Salden.
 */

const COLUMNS = {
  receiptDate: "Belegdatum",
  bookingDate: "Buchungsdatum",
  originalAmount: "Originalbetrag",
  originalCurrency: "Originalwährung",
  amount: "Buchungsbetrag",
  currency: "Buchungswährung",
  description: "Transaktionsbeschreibung",
  descriptionExtra: "Transaktionsbeschreibung Zusatz",
  reference: "Buchungsreferenz",
  mcc: "Gebührenschlüssel",
} as const;

const SIGNATURE = ["Umsatz getätigt von", "Buchungsbetrag", "Buchungsreferenz"];

function decode(content: Uint8Array): string {
  return new TextDecoder("iso-8859-1").decode(content).replace(/^﻿/, "");
}

/** Minimaler CSV-Parser für ";" mit Anführungszeichen ("" = escaptes "). */
export function parseCsv(input: string, separator = ";"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export const sparkasseMastercardCsvAdapter: ImportAdapter = {
  id: "sparkasse-mastercard-csv",
  label: "CSV – Sparkassen-Mastercard",
  accountType: "credit_card",

  detect(content) {
    const head = decode(content.subarray(0, 1000));
    return SIGNATURE.every((column) => head.includes(column));
  },

  parse(content): ParsedStatement {
    const [header, ...rows] = parseCsv(decode(content));
    if (!header || !SIGNATURE.every((column) => header.includes(column))) {
      throw new ImportError("Die Datei ist kein Mastercard-Export der Sparkasse.");
    }
    const index = Object.fromEntries(
      Object.entries(COLUMNS).map(([key, name]) => [key, header.indexOf(name)]),
    ) as Record<keyof typeof COLUMNS, number>;
    const missing = Object.entries(index).filter(([, i]) => i < 0);
    if (missing.length > 0) {
      throw new ImportError(`In der CSV fehlen Spalten: ${missing.map(([k]) => COLUMNS[k as keyof typeof COLUMNS]).join(", ")}.`);
    }

    const transactions = rows.map((cells, rowIndex) => {
      const cell = (key: keyof typeof COLUMNS) => cells[index[key]]?.trim() ?? "";
      const currency = cell("currency");
      if (currency !== "EUR") {
        throw new ImportError(`Zeile ${rowIndex + 2}: Buchungswährung „${currency}“ wird nicht unterstützt.`);
      }
      const originalCurrency = emptyToNull(cell("originalCurrency"));
      const foreign = originalCurrency !== null && originalCurrency !== "EUR";

      return {
        bookingDate: parseGermanDate(cell("bookingDate")),
        // Belegdatum = Tag des Kaufs
        valueDate: cell("receiptDate") ? parseGermanDate(cell("receiptDate")) : null,
        status: "booked" as const,
        amountCents: parseAmountToCents(cell("amount"), ","),
        originalAmountCents: foreign ? parseAmountToCents(cell("originalAmount"), ",") : null,
        originalCurrency: foreign ? originalCurrency : null,
        counterparty: emptyToNull(cell("description")),
        counterpartyIban: null,
        purpose: emptyToNull(cell("descriptionExtra")),
        bookingText: null,
        creditorId: null,
        mandateReference: null,
        bankReference: emptyToNull(cell("reference")),
        merchantCategoryCode: emptyToNull(cell("mcc")),
      };
    });

    if (transactions.length === 0) throw new ImportError("Die Datei enthält keine Buchungen.");
    const period = minMaxDate(transactions.map((t) => t.bookingDate));

    return {
      format: "sparkasse-mastercard-csv",
      accountIban: null,
      periodFrom: period.from,
      periodTo: period.to,
      openingBalanceCents: null,
      closingBalanceCents: null,
      transactions,
    };
  },
};
