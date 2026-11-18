import { describe, expect, it } from "vitest";
import { sumTransactions } from "./sums";

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
