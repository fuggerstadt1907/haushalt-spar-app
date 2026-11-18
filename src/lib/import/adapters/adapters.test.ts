import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { camtXml, mastercardCsv, SAMPLE_IBANS, utf8 } from "../../../../fixtures/builders";
import { ImportError } from "../types";
import { parseStatement } from "./index";

describe("CAMT-Adapter", () => {
  const file = utf8(
    camtXml({
      iban: SAMPLE_IBANS.gehaltskonto,
      opening: 1000,
      closing: 986.01,
      entries: [
        {
          date: "2026-11-03",
          amount: -13.99,
          name: "Streamingdienst GmbH",
          purpose: "Abo November",
          bookingText: "FOLGELASTSCHRIFT",
          creditorId: "DE98ZZZ09999999999",
          mandate: "MANDAT-1",
        },
        { date: "2026-11-18", amount: -8.4, status: "PDNG", name: "Bäckerei" },
        { date: "2026-11-04", amount: 200, name: "Max Muster", iban: SAMPLE_IBANS.fremd },
      ],
    }),
  );

  it("liest Vorzeichen, Status, Gegenpartei, Gläubiger-ID und Mandatsreferenz", () => {
    const statement = parseStatement(file, "giro");
    expect(statement.format).toBe("camt.052.001.08");
    expect(statement.accountIban).toBe(SAMPLE_IBANS.gehaltskonto);
    expect(statement.transactions).toHaveLength(3);

    const [debit, pending, credit] = statement.transactions;
    expect(debit).toMatchObject({
      bookingDate: "2026-11-03",
      status: "booked",
      amountCents: -1399,
      counterparty: "Streamingdienst GmbH",
      purpose: "Abo November",
      bookingText: "FOLGELASTSCHRIFT",
      creditorId: "DE98ZZZ09999999999",
      mandateReference: "MANDAT-1",
    });
    expect(pending).toMatchObject({ status: "pending", amountCents: -840, counterparty: "Bäckerei" });
    expect(credit).toMatchObject({ amountCents: 20000, counterpartyIban: SAMPLE_IBANS.fremd, creditorId: null });
  });

  it("liest Zeitraum und Salden", () => {
    const statement = parseStatement(file, "giro");
    expect(statement.periodFrom).toBe("2026-11-03");
    expect(statement.periodTo).toBe("2026-11-18");
    expect(statement.openingBalanceCents).toBe(100000);
    expect(statement.closingBalanceCents).toBe(98601);
  });

  it("ohne Salden bleiben sie leer", () => {
    const statement = parseStatement(
      utf8(camtXml({ iban: SAMPLE_IBANS.gehaltskonto, entries: [{ date: "2026-11-01", amount: -1, name: "X" }] })),
      "giro",
    );
    expect(statement.openingBalanceCents).toBeNull();
    expect(statement.closingBalanceCents).toBeNull();
  });
});

describe("CAMT-Sammelbuchung", () => {
  it("zählt jeden Einzelposten mit seinem eigenen Betrag", () => {
    const xml = camtXml({ iban: SAMPLE_IBANS.gehaltskonto, entries: [{ date: "2026-11-01", amount: -30, name: "X" }] })
      .replace(/<TxDtls>[\s\S]*<\/TxDtls>/, [10, 20].map((v) => `<TxDtls><Amt Ccy="EUR">${v}.00</Amt><RltdPties><Cdtr><Pty><Nm>Posten ${v}</Nm></Pty></Cdtr></RltdPties></TxDtls>`).join(""));
    const statement = parseStatement(utf8(xml), "giro");
    expect(statement.transactions.map((t) => t.amountCents)).toEqual([-1000, -2000]);
  });

  it("lehnt Einzelposten ohne Betrag ab, statt den Gesamtbetrag doppelt zu zählen", () => {
    const xml = camtXml({ iban: SAMPLE_IBANS.gehaltskonto, entries: [{ date: "2026-11-01", amount: -30, name: "X" }] })
      .replace(/<TxDtls>[\s\S]*<\/TxDtls>/, "<TxDtls><Refs/></TxDtls><TxDtls><Refs/></TxDtls>");
    expect(() => parseStatement(utf8(xml), "giro")).toThrow(/keinen Betrag/);
  });
});

describe("Mastercard-CSV-Adapter", () => {
  const file = mastercardCsv([
    {
      receipt: "11.11.26",
      booking: "12.11.26",
      amount: "-22,44",
      originalAmount: "-25,00",
      originalCurrency: "USD",
      description: "Digitaler Händler",
      ref: "TX-1",
      mcc: "5818",
    },
    { receipt: "03.11.26", booking: "03.11.26", amount: "1.427,54", description: "Lastschrift", ref: "TX-2" },
    { receipt: "01.11.26", booking: "02.11.26", amount: "-7,88", description: "Lebensmittel Süd", ref: "TX-3" },
  ]);

  it("liest ISO-8859-1, Dezimalkomma, Datum TT.MM.JJ und Fremdwährung", () => {
    const statement = parseStatement(file, "credit_card");
    expect(statement.transactions).toHaveLength(3);
    expect(statement.transactions[0]).toMatchObject({
      bookingDate: "2026-11-12",
      valueDate: "2026-11-11",
      amountCents: -2244,
      originalAmountCents: -2500,
      originalCurrency: "USD",
      counterparty: "Digitaler Händler",
      merchantCategoryCode: "5818",
      bankReference: "TX-1",
    });
    expect(statement.transactions[1].amountCents).toBe(142754);
    expect(statement.transactions[2].counterparty).toBe("Lebensmittel Süd");
    expect(statement.periodFrom).toBe("2026-11-02");
    expect(statement.periodTo).toBe("2026-11-12");
    expect(statement.openingBalanceCents).toBeNull();
  });
});

describe("Formaterkennung", () => {
  it("lehnt eine Datei ab, die nicht zum Kontotyp passt", () => {
    const csv = mastercardCsv([{ receipt: "01.11.26", booking: "01.11.26", amount: "-1,00", description: "X", ref: "1" }]);
    expect(() => parseStatement(csv, "giro")).toThrow(/passt nicht zum gewählten Konto/);
  });

  it("meldet unbekannte oder kaputte Dateien verständlich", () => {
    expect(() => parseStatement(utf8("hallo welt"), "giro")).toThrow(ImportError);
    expect(() => parseStatement(utf8("hallo welt"), "giro")).toThrow(/Datei konnte nicht gelesen werden/);
    const broken = utf8('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.052.001.08"><BkToCstmrAcctRpt>');
    expect(() => parseStatement(broken, "giro")).toThrow(ImportError);
  });
});

describe("Beispieldateien in fixtures/sample", () => {
  const dir = new URL("../../../../fixtures/sample/", import.meta.url);
  it.each([
    ["camt052-gehaltskonto-oktober.xml", "giro", 10],
    ["camt052-gehaltskonto-16okt-15nov.xml", "giro", 10],
    ["camt052-gemeinschaftskonto-oktober.xml", "giro", 2],
    ["mastercard-oktober.csv", "credit_card", 5],
  ] as const)("%s lässt sich lesen", (file, type, count) => {
    const statement = parseStatement(new Uint8Array(readFileSync(new URL(file, dir))), type);
    expect(statement.transactions).toHaveLength(count);
  });

  it("der Oktober-Auszug hat einen stimmigen Saldo", () => {
    const s = parseStatement(new Uint8Array(readFileSync(new URL("camt052-gehaltskonto-oktober.xml", dir))), "giro");
    const sum = s.transactions.reduce((acc, t) => acc + t.amountCents, 0);
    expect(s.openingBalanceCents! + sum).toBe(s.closingBalanceCents);
  });
});
