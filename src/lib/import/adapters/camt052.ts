import { XMLParser } from "fast-xml-parser";
import { emptyToNull, minMaxDate, parseAmountToCents } from "../parse-utils";
import {
  ImportError,
  type BookingStatus,
  type ImportAdapter,
  type ParsedStatement,
  type ParsedTransaction,
} from "../types";

/**
 * CAMT.052 (Kontoumsätze, Sparkasse: camt.052.001.08) inkl. vorgemerkter Umsätze.
 * CAMT.053 (Kontoauszug) hat dieselbe Eintragsstruktur und wird mit gelesen.
 */

// fast-xml-parser liefert lose Objekte. Die Zugriffe unten sind deshalb defensiv.
type Node = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ["Rpt", "Stmt", "Ntry", "TxDtls", "Ustrd", "Bal", "NtryDtls"].includes(name),
});

function node(value: unknown): Node | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Node) : undefined;
}

function get(root: unknown, ...path: string[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    const n = node(current);
    if (!n) return undefined;
    current = n[key];
  }
  return current;
}

function text(value: unknown): string | null {
  if (typeof value === "string") return emptyToNull(value);
  const n = node(value);
  if (n && typeof n["#text"] === "string") return emptyToNull(n["#text"]);
  return null;
}

function arr(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function decode(content: Uint8Array): string {
  return new TextDecoder("utf-8").decode(content);
}

function namespaceOf(xml: string): string | null {
  return /xmlns(?::\w+)?="(urn:iso:std:iso:20022:tech:xsd:camt\.05[23]\.[0-9.]+)"/.exec(xml)?.[1] ?? null;
}

function signedCents(amount: unknown, indicator: unknown): number | null {
  const raw = text(amount);
  if (!raw) return null;
  const cents = parseAmountToCents(raw, ".");
  return text(indicator) === "DBIT" ? -Math.abs(cents) : Math.abs(cents);
}

function dateOf(dateNode: unknown): string | null {
  return text(get(dateNode, "Dt")) ?? text(get(dateNode, "DtTm"))?.slice(0, 10) ?? null;
}

function partyName(party: unknown): string | null {
  // v8: <Cdtr><Pty><Nm>, ältere Versionen: <Cdtr><Nm>
  return text(get(party, "Pty", "Nm")) ?? text(get(party, "Nm"));
}

function creditorIdOf(party: unknown): string | null {
  const id = get(party, "Pty", "Id") ?? get(party, "Id");
  return text(get(id, "PrvtId", "Othr", "Id")) ?? text(get(id, "OrgId", "Othr", "Id"));
}

function statusOf(entry: unknown): BookingStatus | null {
  const code = text(get(entry, "Sts", "Cd")) ?? text(get(entry, "Sts"));
  if (code === "BOOK") return "booked";
  if (code === "PDNG") return "pending";
  return null; // INFO u. a.: keine echte Buchung
}

const OPENING_CODES = ["OPBD", "PRCD"];
const CLOSING_CODES = ["CLBD", "ITBD"];

function balance(reports: unknown[], codes: string[], pick: "first" | "last"): number | null {
  const ordered = pick === "first" ? reports : [...reports].reverse();
  for (const report of ordered) {
    for (const bal of arr(get(report, "Bal"))) {
      const code = text(get(bal, "Tp", "CdOrPrtry", "Cd"));
      if (code && codes.includes(code)) return signedCents(get(bal, "Amt"), get(bal, "CdtDbtInd"));
    }
  }
  return null;
}

function parseEntry(entry: unknown): ParsedTransaction[] {
  const status = statusOf(entry);
  if (!status) return [];

  const entryIndicator = get(entry, "CdtDbtInd");
  const bookingDate = dateOf(get(entry, "BookgDt")) ?? dateOf(get(entry, "ValDt"));
  if (!bookingDate) throw new ImportError("Eine Buchung hat kein Datum.");
  const valueDate = dateOf(get(entry, "ValDt"));
  const bookingText = text(get(entry, "AddtlNtryInf"));
  const bankReference = text(get(entry, "AcctSvcrRef"));

  const details = arr(get(entry, "NtryDtls")).flatMap((d) => arr(get(d, "TxDtls")));
  const parts = details.length > 0 ? details : [undefined];

  return parts.map((tx) => {
    const indicator = get(tx, "CdtDbtInd") ?? entryIndicator;
    const isDebit = text(indicator) === "DBIT";
    // Sammelbuchung mit mehreren Einzelposten: Jeder Posten braucht seinen eigenen Betrag,
    // sonst würde der Gesamtbetrag mehrfach gezählt.
    const amountCents =
      parts.length > 1
        ? (signedCents(get(tx, "Amt"), indicator) ?? signedCents(get(tx, "AmtDtls", "TxAmt", "Amt"), indicator))
        : signedCents(get(entry, "Amt"), entryIndicator);
    if (amountCents === null) throw new ImportError("Eine Buchung hat keinen Betrag.");

    const parties = get(tx, "RltdPties");
    const counterpartyNode = isDebit ? get(parties, "Cdtr") : get(parties, "Dbtr");
    const ultimate = isDebit ? get(parties, "UltmtCdtr") : get(parties, "UltmtDbtr");
    const counterpartyAccount = isDebit ? get(parties, "CdtrAcct") : get(parties, "DbtrAcct");
    const mandateReference = text(get(tx, "Refs", "MndtId"));

    return {
      bookingDate,
      valueDate,
      status,
      amountCents,
      originalAmountCents: null,
      originalCurrency: null,
      counterparty: partyName(counterpartyNode) ?? partyName(ultimate),
      counterpartyIban: text(get(counterpartyAccount, "Id", "IBAN")),
      purpose: emptyToNull(arr(get(tx, "RmtInf", "Ustrd")).map(text).filter(Boolean).join(" ")),
      bookingText,
      // Die Gläubiger-ID steht bei Lastschriften in der Identifikation des Zahlungsempfängers.
      creditorId: isDebit ? creditorIdOf(counterpartyNode) : null,
      mandateReference,
      bankReference,
      merchantCategoryCode: null,
    };
  });
}

export const camt052Adapter: ImportAdapter = {
  id: "camt052",
  label: "CAMT (XML) – Girokonto",
  accountType: "giro",

  detect(content) {
    const head = decode(content.subarray(0, 2000));
    return namespaceOf(head) !== null;
  },

  parse(content): ParsedStatement {
    const xml = decode(content);
    const namespace = namespaceOf(xml);
    if (!namespace) throw new ImportError("Die Datei ist keine CAMT-Datei.");

    let doc: unknown;
    try {
      doc = parser.parse(xml);
    } catch {
      throw new ImportError("Die XML-Datei ist beschädigt.");
    }

    const root = get(doc, "Document");
    const reports = [
      ...arr(get(root, "BkToCstmrAcctRpt", "Rpt")),
      ...arr(get(root, "BkToCstmrStmt", "Stmt")),
    ];
    if (reports.length === 0) throw new ImportError("Die CAMT-Datei enthält keinen Bericht.");

    const transactions = reports.flatMap((r) => arr(get(r, "Ntry")).flatMap(parseEntry));
    if (transactions.length === 0) throw new ImportError("Die Datei enthält keine Buchungen.");

    const fromTo = reports.map((r) => ({
      from: text(get(r, "FrToDt", "FrDtTm"))?.slice(0, 10) ?? null,
      to: text(get(r, "FrToDt", "ToDtTm"))?.slice(0, 10) ?? null,
    }));
    const dates = minMaxDate(transactions.map((t) => t.bookingDate));
    const declaredFrom = fromTo.map((f) => f.from).filter((d): d is string => !!d).sort()[0];
    const declaredTo = fromTo.map((f) => f.to).filter((d): d is string => !!d).sort().at(-1);

    return {
      format: namespace.split(":").at(-1) ?? "camt",
      accountIban: text(get(reports[0], "Acct", "Id", "IBAN")),
      periodFrom: declaredFrom && declaredFrom < dates.from ? declaredFrom : dates.from,
      periodTo: declaredTo && declaredTo > dates.to ? declaredTo : dates.to,
      openingBalanceCents: balance(reports, OPENING_CODES, "first"),
      closingBalanceCents: balance(reports, CLOSING_CODES, "last"),
      transactions,
    };
  },
};
