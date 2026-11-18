/**
 * Erzeugt synthetische Sparkassen-Dateien für Tests und fixtures/sample/.
 * Alle IBANs haben die Bankleitzahl 00000000 und sind damit erkennbar unecht.
 */

export const SAMPLE_IBANS = {
  gehaltskonto: "DE02000000000000000001",
  gemeinschaftskonto: "DE75000000000000000002",
  fremd: "DE48000000000000000099",
} as const;

export interface CamtEntry {
  date: string;
  /** Euro mit Vorzeichen, z. B. -13.99 */
  amount: number;
  status?: "BOOK" | "PDNG";
  name: string;
  iban?: string;
  purpose?: string;
  bookingText?: string;
  ref?: string;
  creditorId?: string;
  mandate?: string;
}

export interface CamtOptions {
  iban: string;
  entries: CamtEntry[];
  opening?: number;
  closing?: number;
  from?: string;
  to?: string;
}

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function balanceXml(code: string, amount: number, date: string): string {
  return `
      <Bal>
        <Tp><CdOrPrtry><Cd>${code}</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">${Math.abs(amount).toFixed(2)}</Amt>
        <CdtDbtInd>${amount < 0 ? "DBIT" : "CRDT"}</CdtDbtInd>
        <Dt><Dt>${date}</Dt></Dt>
      </Bal>`;
}

function entryXml(entry: CamtEntry, index: number): string {
  const debit = entry.amount < 0;
  const party = `<Pty><Nm>${escapeXml(entry.name)}</Nm>${
    entry.creditorId ? `<Id><PrvtId><Othr><Id>${entry.creditorId}</Id></Othr></PrvtId></Id>` : ""
  }</Pty>`;
  const account = entry.iban ? `<Id><IBAN>${entry.iban}</IBAN></Id>` : "";
  const parties = debit
    ? `<Cdtr>${party}</Cdtr>${account ? `<CdtrAcct>${account}</CdtrAcct>` : ""}`
    : `<Dbtr>${party}</Dbtr>${account ? `<DbtrAcct>${account}</DbtrAcct>` : ""}`;
  const amount = Math.abs(entry.amount).toFixed(2);
  return `
      <Ntry>
        <Amt Ccy="EUR">${amount}</Amt>
        <CdtDbtInd>${debit ? "DBIT" : "CRDT"}</CdtDbtInd>
        <Sts><Cd>${entry.status ?? "BOOK"}</Cd></Sts>
        <BookgDt><Dt>${entry.date}</Dt></BookgDt>
        <ValDt><Dt>${entry.date}</Dt></ValDt>
        <AcctSvcrRef>${entry.ref ?? `REF-${index + 1}`}</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <Refs>${entry.mandate ? `<MndtId>${entry.mandate}</MndtId>` : ""}</Refs>
            <Amt Ccy="EUR">${amount}</Amt>
            <RltdPties>${parties}</RltdPties>
            ${entry.purpose ? `<RmtInf><Ustrd>${escapeXml(entry.purpose)}</Ustrd></RmtInf>` : ""}
          </TxDtls>
        </NtryDtls>
        ${entry.bookingText ? `<AddtlNtryInf>${escapeXml(entry.bookingText)}</AddtlNtryInf>` : ""}
      </Ntry>`;
}

export function camtXml(options: CamtOptions): string {
  const dates = options.entries.map((e) => e.date).sort();
  const from = options.from ?? dates[0];
  const to = options.to ?? dates[dates.length - 1];
  const balances =
    options.opening !== undefined && options.closing !== undefined
      ? balanceXml("OPBD", options.opening, from) + balanceXml("CLBD", options.closing, to)
      : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.052.001.08">
  <BkToCstmrAcctRpt>
    <GrpHdr><MsgId>SAMPLE</MsgId><CreDtTm>${to}T12:00:00+01:00</CreDtTm></GrpHdr>
    <Rpt>
      <Id>SAMPLE-RPT</Id>
      <CreDtTm>${to}T12:00:00+01:00</CreDtTm>
      <FrToDt><FrDtTm>${from}T00:00:00+01:00</FrDtTm><ToDtTm>${to}T23:59:59+01:00</ToDtTm></FrToDt>
      <Acct><Id><IBAN>${options.iban}</IBAN></Id><Ccy>EUR</Ccy></Acct>${balances}${options.entries
        .map(entryXml)
        .join("")}
    </Rpt>
  </BkToCstmrAcctRpt>
</Document>
`;
}

export interface CardRow {
  /** TT.MM.JJ */
  receipt: string;
  booking: string;
  /** "-22,44" */
  amount: string;
  description: string;
  extra?: string;
  ref: string;
  mcc?: string;
  originalAmount?: string;
  originalCurrency?: string;
}

const CARD_HEADER = [
  "Umsatz getätigt von",
  "Belegdatum",
  "Buchungsdatum",
  "Originalbetrag",
  "Originalwährung",
  "Umrechnungskurs",
  "Buchungsbetrag",
  "Buchungswährung",
  "Transaktionsbeschreibung",
  "Transaktionsbeschreibung Zusatz",
  "Buchungsreferenz",
  "Gebührenschlüssel",
  "Länderkennzeichen",
  "BAR-Entgelt+Buchungsreferenz",
  "AEE+Buchungsreferenz",
  "Abrechnungskennzeichen",
];

export function mastercardCsvText(rows: CardRow[]): string {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      "KARTE-001",
      r.receipt,
      r.booking,
      r.originalAmount ?? "0,00",
      r.originalCurrency ?? "",
      "1,00",
      r.amount,
      "EUR",
      r.description,
      r.extra ?? "",
      r.ref,
      r.mcc ?? "",
      "",
      "",
      "",
      "",
    ]
      .map(quote)
      .join(";"),
  );
  return [CARD_HEADER.map(quote).join(";"), ...lines].join("\r\n") + "\r\n";
}

/** Wie das Online-Banking: ISO-8859-1. */
export function mastercardCsv(rows: CardRow[]): Uint8Array {
  return new Uint8Array(Buffer.from(mastercardCsvText(rows), "latin1"));
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
