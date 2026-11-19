import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { camtXml, mastercardCsv, SAMPLE_IBANS, utf8 } from "../../../fixtures/builders";
import { expandFiles, parseFiles, type ImportFile } from "./files";
import { ImportError } from "./types";

/** Tagesdatei wie bei der Sparkasse: nur gebuchte Umsätze, mit Anfangs- und Endsaldo. */
function day(date: string, opening: number, amounts: number[], iban: string = SAMPLE_IBANS.gehaltskonto): ImportFile {
  const closing = Math.round((opening + amounts.reduce((a, b) => a + b, 0)) * 100) / 100;
  return {
    name: `${date.replaceAll("-", ".")}.xml`,
    content: utf8(
      camtXml({
        iban,
        opening,
        closing,
        entries: amounts.map((amount, i) => ({ date, amount, name: `Händler ${date} ${i}` })),
      }),
    ),
  };
}

const days = [day("2026-11-03", 1000, [-10, -5]), day("2026-11-04", 985, [200]), day("2026-11-05", 1185, [-85])];

describe("mehrere Tagesdateien", () => {
  it("führt sie zu einem Auszug zusammen, sortiert nach Datum, mit Saldo vom ersten bis zum letzten Tag", () => {
    const statement = parseFiles([days[2], days[0], days[1]], "giro");
    expect(statement.transactions.map((t) => t.bookingDate)).toEqual([
      "2026-11-03",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
    ]);
    expect(statement).toMatchObject({
      periodFrom: "2026-11-03",
      periodTo: "2026-11-05",
      openingBalanceCents: 100000,
      closingBalanceCents: 110000,
    });
    const sum = statement.transactions.reduce((s, t) => s + t.amountCents, 0);
    expect(statement.openingBalanceCents! + sum).toBe(statement.closingBalanceCents);
  });

  it("ein fehlender Tag fällt in der Saldo-Prüfung als Differenz auf", () => {
    const statement = parseFiles([days[0], days[2]], "giro");
    const sum = statement.transactions.reduce((s, t) => s + t.amountCents, 0);
    expect(statement.openingBalanceCents! + sum - statement.closingBalanceCents!).toBe(-20000);
  });

  it("liest die ZIP der Sparkasse samt Unterordner und ignoriert macOS-Beifang", () => {
    const zip = zipSync({
      "export/2026.11.03.xml": days[0].content,
      "export/2026.11.04.xml": days[1].content,
      "__MACOSX/export/._2026.11.03.xml": new Uint8Array([1, 2, 3]),
      "export/.DS_Store": new Uint8Array([1]),
    });
    const files = expandFiles([{ name: "export.zip", content: zip }]);
    expect(files.map((f) => f.name).sort()).toEqual(["2026.11.03.xml", "2026.11.04.xml"]);
    expect(parseFiles([{ name: "export.zip", content: zip }], "giro").transactions).toHaveLength(3);
  });

  it("dieselbe Datei doppelt gewählt zählt nur einmal", () => {
    expect(parseFiles([days[0], { ...days[0], name: "kopie.xml" }], "giro").transactions).toHaveLength(2);
  });

  it("vorgemerkte Umsätze ohne Salden verhindern die Saldo-Prüfung der gebuchten nicht", () => {
    const pending: ImportFile = {
      name: "vorgemerkt.xml",
      content: utf8(
        camtXml({
          iban: SAMPLE_IBANS.gehaltskonto,
          entries: [{ date: "2026-11-06", amount: -9.99, name: "Shop", status: "PDNG" }],
        }),
      ),
    };
    const statement = parseFiles([...days, pending], "giro");
    expect(statement.transactions).toHaveLength(5);
    expect(statement.openingBalanceCents).toBe(100000);
    expect(statement.closingBalanceCents).toBe(110000);
  });

  it("lehnt Dateien verschiedener Konten ab", () => {
    expect(() => parseFiles([days[0], day("2026-11-04", 0, [-1], SAMPLE_IBANS.gemeinschaftskonto)], "giro")).toThrow(
      /verschiedenen Konten/,
    );
  });

  it("lehnt gemischte Formate ab und nennt bei kaputten Dateien den Dateinamen", () => {
    const csv = { name: "karte.csv", content: mastercardCsv([{ receipt: "01.11.26", booking: "01.11.26", amount: "-1,00", description: "X", ref: "1" }]) };
    expect(() => parseFiles([days[0], csv], "giro")).toThrow(/karte\.csv/);
    expect(() => parseFiles([days[0], { name: "kaputt.xml", content: utf8("nix") }], "giro")).toThrow(/kaputt\.xml/);
  });

  it("meldet eine ZIP ohne passende Dateien verständlich", () => {
    const zip = zipSync({ "readme.txt": utf8("hallo") });
    expect(() => parseFiles([{ name: "leer.zip", content: zip }], "giro")).toThrow(ImportError);
  });
});
