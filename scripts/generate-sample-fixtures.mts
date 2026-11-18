// Erzeugt synthetische Beispieldateien in fixtures/sample/ (R27: keine echten Daten im Repo).
//   node scripts/generate-sample-fixtures.mts
import { writeFileSync } from "node:fs";
import { camtXml, mastercardCsv, SAMPLE_IBANS } from "../fixtures/builders.ts";

const dir = new URL("../fixtures/sample/", import.meta.url);

const october = camtXml({
  iban: SAMPLE_IBANS.gehaltskonto,
  opening: 1250,
  closing: 2312.66,
  entries: [
    { date: "2026-10-01", amount: 3100, name: "Arbeitgeber Beispiel GmbH", purpose: "Gehalt Oktober", iban: SAMPLE_IBANS.fremd },
    { date: "2026-10-02", amount: -950, name: "Hausverwaltung Muster", purpose: "Miete Oktober", iban: SAMPLE_IBANS.fremd },
    { date: "2026-10-03", amount: -13.99, name: "Streaming Beispiel", purpose: "Abo", bookingText: "FOLGELASTSCHRIFT", creditorId: "DE98ZZZ09999999999", mandate: "MANDAT-001" },
    { date: "2026-10-05", amount: -84.0, name: "Stadtwerke Beispiel", purpose: "Abschlag Strom", bookingText: "FOLGELASTSCHRIFT", creditorId: "DE11ZZZ00000000001", mandate: "MANDAT-002" },
    { date: "2026-10-10", amount: -200, name: "Gemeinschaftskonto", purpose: "Haushaltsgeld", iban: SAMPLE_IBANS.gemeinschaftskonto },
    { date: "2026-10-16", amount: -62.35, name: "Supermarkt Beispiel", purpose: "Kartenzahlung girocard" },
    { date: "2026-10-20", amount: -120.0, name: "Sparkasse", purpose: "Kreditkartenabrechnung 09/26" },
    { date: "2026-10-24", amount: -80.0, name: "Modehaus Beispiel", purpose: "Kartenzahlung girocard" },
    { date: "2026-10-28", amount: 30.0, name: "Modehaus Beispiel", purpose: "Gutschrift Retoure" },
    { date: "2026-10-30", amount: -557.0, name: "Versicherung Beispiel AG", purpose: "Jahresbeitrag Hausrat", bookingText: "ERSTLASTSCHRIFT", creditorId: "DE22ZZZ00000000002", mandate: "MANDAT-003" },
  ],
});

const overlap = camtXml({
  iban: SAMPLE_IBANS.gehaltskonto,
  entries: [
    { date: "2026-10-16", amount: -62.35, name: "Supermarkt Beispiel", purpose: "Kartenzahlung girocard" },
    { date: "2026-10-20", amount: -120.0, name: "Sparkasse", purpose: "Kreditkartenabrechnung 09/26" },
    { date: "2026-10-24", amount: -80.0, name: "Modehaus Beispiel", purpose: "Kartenzahlung girocard" },
    { date: "2026-10-28", amount: 30.0, name: "Modehaus Beispiel", purpose: "Gutschrift Retoure" },
    { date: "2026-10-30", amount: -557.0, name: "Versicherung Beispiel AG", purpose: "Jahresbeitrag Hausrat", bookingText: "ERSTLASTSCHRIFT", creditorId: "DE22ZZZ00000000002", mandate: "MANDAT-003" },
    { date: "2026-11-02", amount: 3100, name: "Arbeitgeber Beispiel GmbH", purpose: "Gehalt November", iban: SAMPLE_IBANS.fremd },
    { date: "2026-11-03", amount: -950, name: "Hausverwaltung Muster", purpose: "Miete November", iban: SAMPLE_IBANS.fremd },
    { date: "2026-11-03", amount: -13.99, name: "Streaming Beispiel", purpose: "Abo", bookingText: "FOLGELASTSCHRIFT", creditorId: "DE98ZZZ09999999999", mandate: "MANDAT-001" },
    { date: "2026-11-14", amount: -49.99, status: "PDNG", name: "Elektronikmarkt Beispiel", purpose: "Kartenzahlung girocard" },
    { date: "2026-11-15", amount: -18.64, status: "PDNG", name: "Bäckerei Beispiel", purpose: "Kartenzahlung girocard" },
  ],
});

const gemeinschaft = camtXml({
  iban: SAMPLE_IBANS.gemeinschaftskonto,
  entries: [
    { date: "2026-10-10", amount: 200, name: "Gehaltskonto", purpose: "Haushaltsgeld", iban: SAMPLE_IBANS.gehaltskonto },
    { date: "2026-10-12", amount: -143.2, name: "Drogerie Beispiel", purpose: "Kartenzahlung girocard" },
  ],
});

const card = mastercardCsv([
  { receipt: "11.10.26", booking: "12.10.26", amount: "-22,44", originalAmount: "-25,00", originalCurrency: "USD", description: "Digitale Produkte Beispiel", ref: "TX-001", mcc: "5818" },
  { receipt: "11.10.26", booking: "12.10.26", amount: "-0,39", description: "Währungsumrechnungsgebühr", ref: "TX-002", mcc: "5818" },
  { receipt: "14.10.26", booking: "15.10.26", amount: "-45,01", description: "Tankstelle Beispiel", ref: "TX-003", mcc: "5541" },
  { receipt: "17.10.26", booking: "19.10.26", amount: "-52,16", description: "Lebensmittel Beispiel", ref: "TX-004", mcc: "5411" },
  { receipt: "20.10.26", booking: "20.10.26", amount: "120,00", description: "Lastschrift", ref: "TX-005" },
]);

writeFileSync(new URL("camt052-gehaltskonto-oktober.xml", dir), october);
writeFileSync(new URL("camt052-gehaltskonto-16okt-15nov.xml", dir), overlap);
writeFileSync(new URL("camt052-gemeinschaftskonto-oktober.xml", dir), gemeinschaft);
writeFileSync(new URL("mastercard-oktober.csv", dir), card);
console.log("fixtures/sample/ geschrieben.");
