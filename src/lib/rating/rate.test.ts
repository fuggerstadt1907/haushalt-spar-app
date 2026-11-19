import { describe, expect, it, vi } from "vitest";
import { SAMPLE_IBANS } from "../../../fixtures/builders";
import type { RatingRequestItem } from "./pseudonymize";
import { rateTransactions, type RatingProvider } from "./rate";
import { counterpartyKey } from "./rules";
import type { Category, MerchantRule, RatableTransaction } from "./types";

const CATEGORIES: Category[] = [
  { id: "cat-abos", name: "Abos & Medien" },
  { id: "cat-wohnen", name: "Wohnen" },
  { id: "cat-lebensmittel", name: "Lebensmittel" },
];

let nextId = 1;
function tx(overrides: Partial<RatableTransaction> = {}): RatableTransaction {
  return {
    id: `tx-${nextId++}`,
    accountType: "giro",
    bookingDate: "2026-11-03",
    amountCents: -1099,
    kind: "expense",
    reviewStatus: "unrated",
    counterparty: "Spotify AB",
    counterpartyIban: null,
    purpose: "Spotify Premium",
    bookingText: "Lastschrift",
    creditorId: "SE00ZZZ0000000000",
    merchantCategoryCode: null,
    ...overrides,
  };
}

/** Fake-KI: merkt sich jeden Request und antwortet mit „Lebensmittel / Kann / Hätte warten können“. */
function fakeProvider(answer?: (items: RatingRequestItem[]) => unknown) {
  const requests: RatingRequestItem[][] = [];
  const provider: RatingProvider = {
    rate: vi.fn(async (items: RatingRequestItem[]) => {
      requests.push(items);
      return (
        answer?.(items) ?? {
          bewertungen: items.map((i) => ({
            ref: i.ref,
            kategorie: "Lebensmittel",
            notwendigkeit: "could",
            dringlichkeit: "could_wait",
            begruendung: "Testbegründung",
          })),
        }
      );
    }),
  };
  return { provider, requests };
}

describe("rateTransactions: Pseudonymisierung (R8, AK7)", () => {
  it("schickt weder IBAN noch Namen einer Privatperson an die KI", async () => {
    const { provider, requests } = fakeProvider();
    const privateTransfer = tx({
      counterparty: "Anna Beispiel",
      counterpartyIban: SAMPLE_IBANS.fremd,
      creditorId: null,
      bookingText: "Überweisung",
      purpose: `Miete Garage Anna Beispiel IBAN ${SAMPLE_IBANS.fremd} Kto 1234567890 anna@example.org`,
    });

    await rateTransactions({
      transactions: [privateTransfer],
      rules: [],
      categories: CATEGORIES,
      provider,
      privateNames: ["Kim Muster"],
    });

    const sent = JSON.stringify(requests);
    expect(sent).not.toContain(SAMPLE_IBANS.fremd);
    expect(sent).not.toContain("1234567890");
    expect(sent).not.toMatch(/anna|beispiel/i);
    expect(requests[0][0]).toEqual({
      ref: "1",
      gegenpartei: "[Person]",
      text: "Überweisung · Miete Garage [Person] IBAN [IBAN] Kto [Nummer] [E-Mail]",
      betrag: -10.99,
      datum: "2026-11-03",
    });
  });

  it("entfernt eine IBAN auch mit Leerzeichen und die Namen der eigenen Profile", async () => {
    const { provider, requests } = fakeProvider();
    await rateTransactions({
      transactions: [tx({ purpose: "Kundin Kim Muster, Konto DE48 0000 0000 0000 0000 99" })],
      rules: [],
      categories: CATEGORIES,
      provider,
      privateNames: ["Kim Muster"],
    });

    const sent = JSON.stringify(requests);
    expect(sent).not.toMatch(/kim|muster|DE48/i);
    expect(requests[0][0].gegenpartei).toBe("Spotify AB");
  });

  it("erkennt IBANs und Nummern auch kleingeschrieben oder mit Leerzeichen", async () => {
    const { provider, requests } = fakeProvider();
    await rateTransactions({
      transactions: [tx({ purpose: "iban de48 0000 0000 0000 0000 99 Kto 123 456 789 Tel 0664 123 45" })],
      rules: [],
      categories: CATEGORIES,
      provider,
    });
    const sent = JSON.stringify(requests);
    expect(sent).not.toMatch(/de48|123 456|0664/i);
    expect(requests[0][0].text).toBe("Lastschrift · iban [IBAN] Kto [Nummer] Tel [Nummer]");
  });

  it("hält Namen mit mehrdeutigen Kürzeln für Personen und verbirgt Personen hinter PayPal", async () => {
    const { provider, requests } = fakeProvider();
    await rateTransactions({
      transactions: [
        tx({ counterparty: "Max Ab", creditorId: null, bookingText: "Überweisung", purpose: "Danke Max" }),
        tx({ counterparty: "Lisa Stadt", creditorId: null, bookingText: "Überweisung", purpose: null }),
        tx({ accountType: "credit_card", counterparty: "PAYPAL *ANNABEISPIEL", creditorId: null }),
      ],
      rules: [],
      categories: CATEGORIES,
      provider,
    });
    const sent = JSON.stringify(requests);
    expect(sent).not.toMatch(/max|lisa|stadt|annabeispiel/i);
    expect(requests[0].map((i) => i.gegenpartei)).toEqual(["[Person]", "[Person]", "PAYPAL *[Person]"]);
  });

  it("gibt Firmen (Gläubiger-ID, Rechtsform, Kartenumsatz) mit Namen weiter", async () => {
    const { provider, requests } = fakeProvider();
    await rateTransactions({
      transactions: [
        tx({ counterparty: "Stadtwerke Musterstadt GmbH", creditorId: null, bookingText: "Überweisung" }),
        tx({ accountType: "credit_card", counterparty: "Bäckerei Korn", creditorId: null, merchantCategoryCode: "5462" }),
      ],
      rules: [],
      categories: CATEGORIES,
      provider,
    });

    expect(requests[0].map((i) => i.gegenpartei)).toEqual(["Stadtwerke Musterstadt GmbH", "Bäckerei Korn"]);
    expect(requests[0][1].haendlerkategorie).toBe("5462");
  });
});

describe("rateTransactions: Regeln (R11)", () => {
  const spotifyRule: MerchantRule = {
    counterpartyKey: counterpartyKey({ counterparty: "Spotify AB", purpose: null }),
    kind: "expense",
    categoryId: "cat-abos",
    necessity: "dispensable",
    urgency: "could_wait",
  };

  it("bewertet eine Gegenpartei mit Regel ohne KI-Aufruf (AK8)", async () => {
    const { provider } = fakeProvider();
    const result = await rateTransactions({
      transactions: [tx({ bookingDate: "2026-12-03" })],
      rules: [spotifyRule],
      categories: CATEGORIES,
      provider,
    });

    expect(provider.rate).not.toHaveBeenCalled();
    expect(result.updates).toEqual([
      expect.objectContaining({
        categoryId: "cat-abos",
        necessity: "dispensable",
        urgency: "could_wait",
        reviewStatus: "confirmed",
        ratingSource: "rule",
      }),
    ]);
  });

  it("trifft die Regel auch bei wechselnden Referenznummern", async () => {
    const amazonRule: MerchantRule = { ...spotifyRule, counterpartyKey: counterpartyKey({ counterparty: "AMAZON.DE*AB12CD34", purpose: null }) };
    const { provider } = fakeProvider();
    const result = await rateTransactions({
      transactions: [tx({ counterparty: "AMAZON.DE*ZZ98XY76" })],
      rules: [amazonRule],
      categories: CATEGORIES,
      provider,
    });
    expect(provider.rate).not.toHaveBeenCalled();
    expect(result.updates[0].ratingSource).toBe("rule");
  });

  it("schickt nur den Rest ohne Regel an die KI", async () => {
    const { provider, requests } = fakeProvider();
    const rewe = tx({ counterparty: "REWE Markt GmbH" });
    const result = await rateTransactions({
      transactions: [tx(), rewe],
      rules: [spotifyRule],
      categories: CATEGORIES,
      provider,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].map((i) => i.gegenpartei)).toEqual(["REWE Markt GmbH"]);
    expect(result.updates.find((u) => u.id === rewe.id)).toMatchObject({ reviewStatus: "suggested", ratingSource: "ai" });
  });

  it("macht per Regel aus einer Erstattung eine Einnahme, ohne die Steuerzahlung zu treffen (F4)", async () => {
    const refund = tx({ kind: "refund", amountCents: 50000, counterparty: "Finanzamt Musterstadt", creditorId: null });
    const payment = tx({ amountCents: -80000, counterparty: "Finanzamt Musterstadt", creditorId: null });
    const incomeRule: MerchantRule = {
      counterpartyKey: counterpartyKey(refund),
      kind: "income",
      categoryId: null,
      necessity: null,
      urgency: null,
    };
    const { provider, requests } = fakeProvider();
    const result = await rateTransactions({
      transactions: [refund, payment],
      rules: [incomeRule],
      categories: CATEGORIES,
      provider,
    });
    expect(result.updates.find((u) => u.id === refund.id)).toEqual(
      expect.objectContaining({ kind: "income", clearRefundOf: true, categoryId: null, reviewStatus: "confirmed" }),
    );
    // Die Steuerzahlung bleibt Ausgabe und geht an die KI.
    expect(requests[0]).toHaveLength(1);
    expect(result.updates.find((u) => u.id === payment.id)).toMatchObject({ ratingSource: "ai" });
    expect(result.updates.find((u) => u.id === payment.id)).not.toHaveProperty("kind");
  });

  it("wendet eine Ausgabenregel nicht auf eine Erstattung derselben Gegenpartei an", async () => {
    const result = await rateTransactions({
      transactions: [tx({ kind: "refund", amountCents: 500 })],
      rules: [spotifyRule],
      categories: CATEGORIES,
      provider: null,
    });
    expect(result.updates).toEqual([]);
  });

  it("legt für Zahlungsdienste keinen Regelschlüssel an", () => {
    expect(counterpartyKey({ counterparty: "PayPal Europe S.a.r.l. et Cie S.C.A", purpose: "Ihr Einkauf bei Shop" })).toBe("");
    expect(counterpartyKey({ counterparty: null, purpose: "Klarna Bank AB Rechnung 123456" })).toBe("");
  });

  it("lässt erkannte Umbuchungen und bestätigte Buchungen in Ruhe", async () => {
    const { provider } = fakeProvider();
    const result = await rateTransactions({
      transactions: [tx({ kind: "transfer" }), tx({ reviewStatus: "confirmed", counterparty: "REWE" })],
      rules: [{ ...spotifyRule, kind: "income" }],
      categories: CATEGORIES,
      provider,
    });
    expect(provider.rate).not.toHaveBeenCalled();
    expect(result.updates).toEqual([]);
  });
});

describe("rateTransactions: KI-Vorschläge (R9, R10)", () => {
  it("übernimmt nur Ausgaben als Vorschlag mit Kategorie, Stufen und Begründung", async () => {
    const { provider, requests } = fakeProvider();
    const expense = tx({ counterparty: "REWE Markt GmbH" });
    const result = await rateTransactions({
      transactions: [expense, tx({ kind: "income", amountCents: 300000, counterparty: "Arbeitgeber GmbH" })],
      rules: [],
      categories: CATEGORIES,
      provider,
    });

    expect(requests[0]).toHaveLength(1);
    expect(result.updates).toEqual([
      {
        id: expense.id,
        categoryId: "cat-lebensmittel",
        necessity: "could",
        urgency: "could_wait",
        aiReason: "Testbegründung",
        reviewStatus: "suggested",
        ratingSource: "ai",
      },
    ]);
    expect(result).toMatchObject({ unratedCount: 0, aiFailed: false });
  });

  it("lässt Buchungen mit unbekannter Kategorie oder kaputter Antwort unbewertet", async () => {
    const { provider } = fakeProvider((items) =>
      items.length > 1
        ? {
            bewertungen: [
              { ref: "1", kategorie: "Erfundene Kategorie", notwendigkeit: "must", dringlichkeit: "immediate", begruendung: "x" },
              { ref: "2", kategorie: "wohnen", notwendigkeit: "must", dringlichkeit: "immediate", begruendung: "Miete" },
            ],
          }
        : { falsch: true },
    );
    const result = await rateTransactions({
      transactions: [tx(), tx({ counterparty: "Hausverwaltung GmbH" })],
      rules: [],
      categories: CATEGORIES,
      provider,
    });

    expect(result.updates).toHaveLength(1);
    expect(result.updates[0]).toMatchObject({ categoryId: "cat-wohnen", necessity: "must" });
    expect(result.unratedCount).toBe(1);
  });

  it("speichert bei KI-Fehler nichts und bricht weitere Batches ab", async () => {
    const provider: RatingProvider = { rate: vi.fn().mockRejectedValue(new Error("429 Too Many Requests")) };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await rateTransactions({
      transactions: Array.from({ length: 90 }, () => tx()),
      rules: [],
      categories: CATEGORIES,
      provider,
    });

    expect(provider.rate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ updates: [], unratedCount: 90, aiFailed: true });
  });

  it("meldet Fertiges nach den Regeln und nach jedem Batch", async () => {
    const { provider } = fakeProvider();
    const saved: number[] = [];
    await rateTransactions({
      transactions: Array.from({ length: 50 }, () => tx({ counterparty: "REWE Markt GmbH" })),
      rules: [],
      categories: CATEGORIES,
      provider,
      onUpdates: async (updates) => {
        saved.push(updates.length);
      },
    });
    expect(saved).toEqual([0, 40, 10]);
  });

  it("bewertet höchstens maxBatches Batches pro Lauf", async () => {
    const { provider, requests } = fakeProvider();
    const result = await rateTransactions({
      transactions: Array.from({ length: 90 }, () => tx()),
      rules: [],
      categories: CATEGORIES,
      provider,
      maxBatches: 2,
    });
    expect(requests.map((r) => r.length)).toEqual([40, 40]);
    expect(result.unratedCount).toBe(10);
  });
});
