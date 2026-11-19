import { describe, expect, it } from "vitest";
import { sumByCategory, sumTransactions } from "./sums";

describe("sumTransactions", () => {
  it("lässt Umbuchungen und Sammelabbuchungen weg und verrechnet Erstattungen", () => {
    const sums = sumTransactions([
      { amountCents: 300000, kind: "income", bookingStatus: "booked" },
      { amountCents: -20000, kind: "transfer", bookingStatus: "booked" },
      { amountCents: 20000, kind: "transfer", bookingStatus: "booked" },
      { amountCents: -12000, kind: "card_settlement", bookingStatus: "booked" },
      { amountCents: -8000, kind: "expense", bookingStatus: "booked" },
      { amountCents: 3000, kind: "refund", bookingStatus: "booked" },
      { amountCents: -4999, kind: "expense", bookingStatus: "pending" },
    ]);
    expect(sums).toEqual({ incomeCents: 300000, expensesCents: 9999, pendingExpensesCents: 4999 });
  });
});

describe("sumByCategory", () => {
  it("summiert Ausgaben je Kategorie und rechnet Erstattungen bei der erstatteten Ausgabe ab", () => {
    const base = { bookingStatus: "booked" as const, refundOf: null };
    const result = sumByCategory([
      { ...base, id: "a", amountCents: -8000, kind: "expense", categoryId: "kleidung" },
      { ...base, id: "b", amountCents: 3000, kind: "refund", categoryId: null, refundOf: "a" },
      { ...base, id: "c", amountCents: -2500, kind: "expense", categoryId: "lebensmittel" },
      { ...base, id: "d", amountCents: -1000, kind: "expense", categoryId: null },
      { ...base, id: "e", amountCents: 500, kind: "refund", categoryId: null, refundOf: "ausserhalb" },
      { ...base, id: "f", amountCents: 300000, kind: "income", categoryId: null },
      { ...base, id: "g", amountCents: -12000, kind: "card_settlement", categoryId: null },
    ]);
    expect(result).toEqual([
      { categoryId: "kleidung", cents: 5000 },
      { categoryId: "lebensmittel", cents: 2500 },
      { categoryId: null, cents: 500 },
    ]);
  });
});
