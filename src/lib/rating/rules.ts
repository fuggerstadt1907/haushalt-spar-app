import { normalizeText } from "@/lib/import/preview";
import { PAYMENT_SERVICE } from "./pseudonymize";
import type { MerchantRule, RatableTransaction, RatingUpdate } from "./types";

/**
 * Schlüssel einer Gegenpartei für Regeln (R11): normalisierter Name ohne Wörter mit Ziffern, damit
 * wechselnde Referenzen („AMAZON.DE*AB12CD“) dieselbe Regel treffen. Ohne Gegenpartei zählen die
 * ersten Wörter des Verwendungszwecks. Zahlungsdienste (PayPal, Klarna …) bekommen keinen Schlüssel,
 * eine Regel würde sonst für jeden Händler dahinter gelten.
 */
export function counterpartyKey(tx: { counterparty: string | null; purpose: string | null }): string {
  if (PAYMENT_SERVICE.test(tx.counterparty || tx.purpose || "")) return "";
  const words = (value: string | null) => normalizeText(value).split(" ").filter((w) => w && !/\d/.test(w));
  const fromCounterparty = words(tx.counterparty);
  if (fromCounterparty.length > 0) return fromCounterparty.join(" ");
  return words(tx.purpose).slice(0, 4).join(" ");
}

type RuleTarget = Pick<RatableTransaction, "counterparty" | "purpose" | "kind" | "amountCents">;

/** Regeln gibt es je Gegenpartei und Richtung: Ausgabenregel für Abflüsse, Einnahmenregel für Zuflüsse. */
export function ruleMapKey(counterpartyKey: string, kind: MerchantRule["kind"]): string {
  return `${kind}:${counterpartyKey}`;
}

export function buildRuleMap(rules: MerchantRule[]): Map<string, MerchantRule> {
  return new Map(rules.map((r) => [ruleMapKey(r.counterpartyKey, r.kind), r]));
}

/**
 * Regeln greifen nur bei Ausgaben, Einnahmen und Erstattungen, nie bei erkannten Umbuchungen.
 * Eine Ausgabenregel nur bei Abflüssen, eine Einnahmenregel nur bei Zuflüssen: Die Regel
 * „Finanzamt = Einnahme“ (Steuererstattung) darf die nächste Steuerzahlung nicht treffen.
 */
export function findRule(tx: RuleTarget, rules: Map<string, MerchantRule>): MerchantRule | null {
  if (tx.kind !== "expense" && tx.kind !== "income" && tx.kind !== "refund") return null;
  if (tx.amountCents === 0) return null;
  const key = counterpartyKey(tx);
  if (!key) return null;
  return rules.get(ruleMapKey(key, tx.amountCents < 0 ? "expense" : "income")) ?? null;
}

/**
 * Wendet eine Regel an. Gibt `null` zurück, wenn die Buchung danach noch eine Bewertung braucht
 * (Ausgabe, aber die Regel kennt nur die Art), sonst die fertige Änderung.
 */
export function applyRule(tx: Pick<RatableTransaction, "id" | "kind">, rule: MerchantRule): RatingUpdate | null {
  const kindChange = rule.kind !== tx.kind ? { kind: rule.kind, ...(tx.kind === "refund" ? { clearRefundOf: true as const } : {}) } : {};
  if (rule.kind !== "expense") {
    return {
      id: tx.id,
      ...kindChange,
      categoryId: null,
      necessity: null,
      urgency: null,
      aiReason: null,
      reviewStatus: "confirmed",
      ratingSource: "rule",
    };
  }
  if (!rule.categoryId || !rule.necessity || !rule.urgency) return null;
  return {
    id: tx.id,
    ...kindChange,
    categoryId: rule.categoryId,
    necessity: rule.necessity,
    urgency: rule.urgency,
    aiReason: null,
    reviewStatus: "confirmed",
    ratingSource: "rule",
  };
}
