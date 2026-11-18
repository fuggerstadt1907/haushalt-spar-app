import { describe, expect, it } from "vitest";
import { camtXml, mastercardCsv, SAMPLE_IBANS, utf8, type CamtEntry, type CardRow } from "../../../fixtures/builders";
import { parseStatement } from "./adapters";
import { buildImportPreview, type ExistingTransaction, type ImportPreview, type OwnAccount } from "./preview";

const gehalt: OwnAccount = { id: "acc-gehalt", type: "giro", iban: SAMPLE_IBANS.gehaltskonto };
const gemeinsam: OwnAccount = { id: "acc-gemeinsam", type: "giro", iban: SAMPLE_IBANS.gemeinschaftskonto };
const karte: OwnAccount = { id: "acc-karte", type: "credit_card", iban: null };
const ownAccounts = [gehalt, gemeinsam, karte];

/** Simuliert einen Haushalt: Vorschau bauen und wie commit_import in den Bestand übernehmen. */
class Household {
  db: (ExistingTransaction & { bookingStatus: "booked" | "pending"; refundOf: string | null })[] = [];

  preview(account: OwnAccount, file: Uint8Array): ImportPreview {
    return buildImportPreview({
      account,
      statement: parseStatement(file, account.type),
      existing: this.db,
      ownAccounts,
    });
  }

  import(account: OwnAccount, file: Uint8Array): ImportPreview {
    const preview = this.preview(account, file);
    const deleted = new Set(preview.pendingDeletes.map((p) => p.id));
    this.db = this.db.filter((t) => !deleted.has(t.id));
    for (const row of preview.rows) {
      if (row.previewStatus === "existing") continue;
      const record = {
        id: row.id,
        accountId: account.id,
        bookingDate: row.bookingDate,
        bookingStatus: row.status,
        amountCents: row.amountCents,
        counterparty: row.counterparty,
        purpose: row.purpose,
        dedupeHash: row.dedupeHash,
        kind: row.kind,
        refundOf: row.refundOf,
      } as const;
      const index = this.db.findIndex((t) => t.id === row.id);
      if (index >= 0) this.db[index] = record;
      else this.db.push(record);
    }
    for (const update of preview.kindUpdates) {
      const target = this.db.find((t) => t.id === update.id)!;
      target.kind = update.kind;
      target.refundOf = update.refundOf;
    }
    return preview;
  }

  sums() {
    const booked = this.db;
    const income = booked.filter((t) => t.kind === "income").reduce((s, t) => s + t.amountCents, 0);
    const expenses = booked
      .filter((t) => t.kind === "expense" || t.kind === "refund")
      .reduce((s, t) => s + t.amountCents, 0);
    return { income, expenses };
  }
}

const giro = (account: OwnAccount, entries: CamtEntry[], extra: { opening?: number; closing?: number; to?: string } = {}) =>
  utf8(camtXml({ iban: account.iban!, entries, ...extra }));

function octoberEntries(from: number, to: number): CamtEntry[] {
  const entries: CamtEntry[] = [];
  for (let day = from; day <= to; day++) {
    entries.push({ date: `2026-10-${String(day).padStart(2, "0")}`, amount: -(day + 0.5), name: `Laden ${day}` });
  }
  return entries;
}

describe("AK2 (R4): Saldo-Prüfung", () => {
  it("warnt mit der Differenz, wenn die Buchungen den Endsaldo nicht ergeben", () => {
    const file = giro(gehalt, [{ date: "2026-10-02", amount: -100, name: "A" }], { opening: 1000, closing: 950 });
    const { balance } = new Household().preview(gehalt, file);
    expect(balance).toEqual({
      type: "checked",
      openingCents: 100000,
      closingCents: 95000,
      bookedSumCents: -10000,
      differenceCents: -5000,
    });
  });

  it("stimmt der Saldo, ist die Differenz 0", () => {
    const file = giro(gehalt, [{ date: "2026-10-02", amount: -100, name: "A" }], { opening: 1000, closing: 900 });
    expect(new Household().preview(gehalt, file).balance).toMatchObject({ type: "checked", differenceCents: 0 });
  });

  it("ohne Salden: Hinweis statt Prüfung, dazu Anzahl, Zeitraum und Summe", () => {
    const file = giro(gehalt, [
      { date: "2026-10-02", amount: -100, name: "A" },
      { date: "2026-10-09", amount: 40, name: "B" },
    ]);
    const preview = new Household().preview(gehalt, file);
    expect(preview.balance).toEqual({ type: "unavailable" });
    expect(preview.summary).toMatchObject({ count: 2, periodFrom: "2026-10-02", periodTo: "2026-10-09", sumCents: -6000 });
  });
});

describe("AK4 (R6): Duplikate bei überlappenden Imports", () => {
  it("legt 15.–31.10. nicht doppelt an und zeigt sie als bereits vorhanden", () => {
    const household = new Household();
    household.import(gehalt, giro(gehalt, octoberEntries(1, 31)));
    expect(household.db).toHaveLength(31);

    const november: CamtEntry[] = Array.from({ length: 15 }, (_, i) => ({
      date: `2026-11-${String(i + 1).padStart(2, "0")}`,
      amount: -(i + 1),
      name: `November ${i + 1}`,
    }));
    const preview = household.import(gehalt, giro(gehalt, [...octoberEntries(15, 31), ...november]));

    expect(preview.summary.existingCount).toBe(17);
    expect(preview.summary.newCount).toBe(15);
    expect(preview.rows.filter((r) => r.bookingDate < "2026-11-01").every((r) => r.previewStatus === "existing")).toBe(true);
    expect(household.db).toHaveLength(46);
  });

  it("zwei gleiche Käufe am selben Tag bleiben zwei Buchungen, auch beim erneuten Import", () => {
    const household = new Household();
    const same: CamtEntry = { date: "2026-10-05", amount: -2.5, name: "Kaffee" };
    const file = giro(gehalt, [same, same]);
    household.import(gehalt, file);
    expect(household.db).toHaveLength(2);
    expect(household.import(gehalt, file).summary.newCount).toBe(0);
    expect(household.db).toHaveLength(2);
  });
});

describe("AK5 (R7): Umbuchung zwischen eigenen Konten", () => {
  it("markiert beide Seiten als Umbuchung und lässt sie aus den Summen", () => {
    const household = new Household();
    household.import(
      gehalt,
      giro(gehalt, [
        { date: "2026-10-10", amount: -200, name: "Gemeinschaftskonto", iban: SAMPLE_IBANS.gemeinschaftskonto },
        { date: "2026-10-01", amount: 3000, name: "Arbeitgeber GmbH", iban: SAMPLE_IBANS.fremd },
      ]),
    );
    household.import(
      gemeinsam,
      giro(gemeinsam, [{ date: "2026-10-10", amount: 200, name: "Gehaltskonto", iban: SAMPLE_IBANS.gehaltskonto }]),
    );

    const transfers = household.db.filter((t) => Math.abs(t.amountCents) === 20000);
    expect(transfers.map((t) => t.kind)).toEqual(["transfer", "transfer"]);
    expect(household.sums()).toEqual({ income: 300000, expenses: 0 });
  });
});

describe("AK6 (R7): Kreditkarten-Sammelabbuchung", () => {
  const cardRows: CardRow[] = [
    ...Array.from({ length: 12 }, (_, i) => ({
      receipt: `${String(i + 1).padStart(2, "0")}.10.26`,
      booking: `${String(i + 2).padStart(2, "0")}.10.26`,
      amount: "-10,00",
      description: `Händler ${i + 1}`,
      ref: `TX-${i + 1}`,
    })),
    { receipt: "03.11.26", booking: "03.11.26", amount: "120,00", description: "Lastschrift", ref: "TX-99" },
  ];
  const settlementOnGiro: CamtEntry = { date: "2026-11-02", amount: -120, name: "Sparkasse", purpose: "Abrechnung 10/26" };

  it("Karte zuerst: 12 Einzelbuchungen zählen, die Sammelabbuchung nicht", () => {
    const household = new Household();
    household.import(karte, mastercardCsv(cardRows));
    household.import(gehalt, giro(gehalt, [settlementOnGiro]));

    expect(household.db.filter((t) => t.kind === "expense")).toHaveLength(12);
    expect(household.db.filter((t) => t.kind === "card_settlement")).toHaveLength(2);
    expect(household.sums()).toEqual({ income: 0, expenses: -12000 });
  });

  it("Girokonto zuerst: die Kartenabrechnung stuft die Abbuchung nachträglich um", () => {
    const household = new Household();
    household.import(gehalt, giro(gehalt, [settlementOnGiro]));
    expect(household.db[0].kind).toBe("expense");

    const preview = household.import(karte, mastercardCsv(cardRows));
    expect(preview.kindUpdates).toHaveLength(1);
    expect(household.sums()).toEqual({ income: 0, expenses: -12000 });
  });

  it("ohne Kartenabrechnung erkennt das Textmuster die Abbuchung, Girocard-Zahlungen nicht", () => {
    const preview = new Household().preview(
      gehalt,
      giro(gehalt, [
        { date: "2026-11-02", amount: -120, name: "Sparkasse", purpose: "Kreditkartenabrechnung Mastercard" },
        { date: "2026-11-03", amount: -18.64, name: "Supermarkt", purpose: "Kartenzahlung girocard" },
      ]),
    );
    expect(preview.rows.map((r) => r.kind)).toEqual(["card_settlement", "expense"]);
  });
});

describe("R7: Erstattungen", () => {
  it("verrechnet eine Gutschrift derselben Gegenpartei mit der Ausgabe", () => {
    const household = new Household();
    household.import(gehalt, giro(gehalt, [{ date: "2026-09-01", amount: -80, name: "Modehaus" }]));
    const preview = household.import(gehalt, giro(gehalt, [{ date: "2026-10-01", amount: 30, name: "Modehaus" }]));

    const refund = preview.rows[0];
    expect(refund.kind).toBe("refund");
    expect(refund.refundOf).toBe(household.db.find((t) => t.amountCents === -8000)!.id);
    expect(household.sums()).toEqual({ income: 0, expenses: -5000 });
  });

  it("ohne passende Ausgabe wird die Gutschrift zur Einnahme", () => {
    const preview = new Household().preview(gehalt, giro(gehalt, [{ date: "2026-10-01", amount: 30, name: "Unbekannt" }]));
    expect(preview.rows[0]).toMatchObject({ kind: "income", refundOf: null });
  });

  it("älter als 90 Tage zählt nicht als Erstattung", () => {
    const household = new Household();
    household.import(gehalt, giro(gehalt, [{ date: "2026-06-01", amount: -80, name: "Modehaus" }]));
    const preview = household.preview(gehalt, giro(gehalt, [{ date: "2026-10-01", amount: 30, name: "Modehaus" }]));
    expect(preview.rows[0].kind).toBe("income");
  });

  it("Gutschrift auf der Karte findet die Ausgabe in derselben Datei", () => {
    const preview = new Household().preview(
      karte,
      mastercardCsv([
        { receipt: "01.10.26", booking: "02.10.26", amount: "-50,00", description: "Onlineshop", ref: "1" },
        { receipt: "05.10.26", booking: "06.10.26", amount: "50,00", description: "Onlineshop", ref: "2" },
      ]),
    );
    expect(preview.rows[1]).toMatchObject({ kind: "refund", refundOf: preview.rows[0].id });
  });
});

describe("AK15 (R7a): vorgemerkt → gebucht", () => {
  it("ersetzt die vorläufige Buchung durch die gebuchte und behält dieselbe Zeile", () => {
    const household = new Household();
    household.import(gehalt, giro(gehalt, [{ date: "2026-11-17", amount: -49.99, name: "Elektronikmarkt", status: "PDNG" }]));
    const pendingId = household.db[0].id;

    const preview = household.import(
      gehalt,
      giro(gehalt, [{ date: "2026-11-19", amount: -49.99, name: "Elektronikmarkt", purpose: "Beleg 4711" }]),
    );

    expect(preview.summary.replacesPendingCount).toBe(1);
    expect(household.db).toHaveLength(1);
    expect(household.db[0]).toMatchObject({ id: pendingId, bookingStatus: "booked" });
  });

  it("löscht eine vorläufige Buchung, die weder vorgemerkt noch gebucht wieder auftaucht", () => {
    const household = new Household();
    household.import(gehalt, giro(gehalt, [{ date: "2026-11-17", amount: -12, name: "Tankstelle", status: "PDNG" }]));
    const preview = household.import(gehalt, giro(gehalt, [{ date: "2026-11-15", amount: -3, name: "Kiosk" }], { to: "2026-11-18" }));
    expect(preview.pendingDeletes).toHaveLength(1);
    expect(household.db.map((t) => t.counterparty)).toEqual(["Kiosk"]);
  });

  it("dieselbe vorgemerkte Buchung in zwei Dateien bleibt eine", () => {
    const household = new Household();
    const file = giro(gehalt, [{ date: "2026-11-17", amount: -12, name: "Tankstelle", status: "PDNG" }]);
    household.import(gehalt, file);
    const preview = household.import(gehalt, file);
    expect(preview.summary.existingCount).toBe(1);
    expect(preview.pendingDeletes).toHaveLength(0);
    expect(household.db).toHaveLength(1);
  });
});

describe("Review-Fälle", () => {
  it("ein älterer Auszug löscht keine jüngeren vorgemerkten Buchungen", () => {
    const household = new Household();
    household.import(gehalt, giro(gehalt, [{ date: "2026-11-03", amount: -12, name: "Tankstelle", status: "PDNG" }]));
    const preview = household.import(gehalt, giro(gehalt, octoberEntries(1, 31)));
    expect(preview.pendingDeletes).toHaveLength(0);
    expect(household.db.some((t) => t.bookingStatus === "pending")).toBe(true);
  });

  it("eine Vormerkung mit verschobenem Datum bleibt dieselbe Zeile", () => {
    const household = new Household();
    household.import(gehalt, giro(gehalt, [{ date: "2026-11-14", amount: -49.99, name: "Elektronikmarkt", status: "PDNG" }]));
    const id = household.db[0].id;
    const preview = household.import(
      gehalt,
      giro(gehalt, [{ date: "2026-11-16", amount: -49.99, name: "Elektronikmarkt", status: "PDNG" }]),
    );
    expect(preview.summary.replacesPendingCount).toBe(1);
    expect(household.db).toEqual([expect.objectContaining({ id, bookingStatus: "pending", bookingDate: "2026-11-16" })]);
  });

  it("die Kartengutschrift wählt die erkannte Sammelabbuchung, nicht eine gleich hohe Ausgabe", () => {
    const household = new Household();
    household.import(
      gehalt,
      giro(gehalt, [
        { date: "2026-10-03", amount: -450, name: "Vermieter" },
        { date: "2026-10-08", amount: -450, name: "Sparkasse", purpose: "Kreditkartenabrechnung" },
      ]),
    );
    const preview = household.import(
      karte,
      mastercardCsv([{ receipt: "05.10.26", booking: "05.10.26", amount: "450,00", description: "Lastschrift", ref: "1" }]),
    );
    expect(preview.kindUpdates).toHaveLength(0);
    expect(household.db.find((t) => t.counterparty === "Vermieter")!.kind).toBe("expense");
  });

  it("eine Ausgabe wird höchstens bis zu ihrem Betrag erstattet", () => {
    const household = new Household();
    household.import(gehalt, giro(gehalt, [{ date: "2026-10-01", amount: -10, name: "Shop" }]));
    const preview = household.import(
      gehalt,
      giro(gehalt, [
        { date: "2026-10-05", amount: 10, name: "Shop", purpose: "Retoure 1" },
        { date: "2026-10-06", amount: 10, name: "Shop", purpose: "Retoure 2" },
      ]),
    );
    expect(preview.rows.map((r) => r.kind)).toEqual(["refund", "income"]);
  });

  it("eine Erstattung findet ihre Ausgabe auch, wenn diese in derselben Datei schon vorhanden ist", () => {
    const household = new Household();
    const expense: CamtEntry = { date: "2026-10-01", amount: -80, name: "Modehaus" };
    household.import(gehalt, giro(gehalt, [expense]));
    const preview = household.import(gehalt, giro(gehalt, [expense, { date: "2026-10-04", amount: 30, name: "Modehaus" }]));
    expect(preview.rows[1]).toMatchObject({ kind: "refund", refundOf: household.db[0].id });
  });
});
