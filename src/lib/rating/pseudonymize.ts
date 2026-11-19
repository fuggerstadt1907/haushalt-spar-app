import type { RatableTransaction } from "./types";

/**
 * Pseudonymisierung vor jedem KI-Aufruf (R8, AK7). An die KI gehen nur Gegenpartei (wenn Firma),
 * bereinigter Buchungstext, Betrag, Datum und bei Kartenumsätzen der Händlerkategorie-Code.
 */

export interface RatingRequestItem {
  ref: string;
  gegenpartei: string;
  text: string;
  betrag: number;
  datum: string;
  haendlerkategorie?: string;
}

export const PERSON = "[Person]";
/** IBAN am Stück oder in Viererblöcken, auch kleingeschrieben. */
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/gi;
/** Konto-, Kunden-, Mandats- und Telefonnummern: 6 und mehr Ziffern, auch mit Leerzeichen, - oder /. */
const NUMBER = /[A-Z0-9/-]*\d(?:[ /-]?\d){5,}[A-Z0-9/-]*/gi;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
/** Rechtsformen und eindeutige Einrichtungen. Mehrdeutige Kürzel (AB, SA, Co …) zählen nicht. */
const LEGAL_FORM =
  /\b(gmbh|ag|kg|ohg|ug|e\. ?v|e\. ?k|gbr|mbh|kgaa|ltd|limited|inc|llc|plc|sarl|s\.a\.r\.l|b\.v|n\.v|s\.p\.a|srl|corp|sparkasse|volksbank|raiffeisenbank|versicherung|krankenkasse|stadtwerke|finanzamt|gemeinde|magistrat)\b/i;

/** Zahlungsdienste. Hinter ihnen kann eine Privatperson stehen, und sie taugen nicht für Regeln. */
export const PAYMENT_SERVICE = /\b(paypal|klarna|amazon payments|sofort|unzer|stripe|adyen|mollie|ratepay|payone)\b/i;

/**
 * Firma oder Privatperson? Im Zweifel Person. Firmen sind Kartenumsätze (Händler), Lastschriften
 * mit Gläubiger-ID und Gegenparteien mit Rechtsform oder Behörden-/Bankbezeichnung im Namen.
 */
export function isCompany(tx: Pick<RatableTransaction, "accountType" | "creditorId" | "counterparty">): boolean {
  if (tx.accountType === "credit_card") return true;
  if (tx.creditorId) return true;
  return !!tx.counterparty && LEGAL_FORM.test(tx.counterparty);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Namensteile (ab 2 Zeichen) als Muster, das ganze Wörter unabhängig von Groß-/Kleinschreibung trifft. */
function namePattern(names: string[]): RegExp | null {
  const parts = [
    ...new Set(
      names
        .flatMap((n) => n.split(/[\s,.;/&+-]+/))
        .map((p) => p.trim())
        .filter((p) => p.length >= 2),
    ),
  ];
  if (parts.length === 0) return null;
  return new RegExp(`(?<![\\p{L}\\d])(?:${parts.map(escapeRegExp).join("|")})(?![\\p{L}\\d])`, "giu");
}

export function cleanText(text: string, names: string[]): string {
  let result = text.replace(IBAN, "[IBAN]").replace(EMAIL, "[E-Mail]").replace(NUMBER, "[Nummer]");
  const pattern = namePattern(names);
  if (pattern) result = result.replace(pattern, PERSON);
  return result
    .replace(/\[Person\](?:[\s,]*\[Person\])+/g, PERSON)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Baut die Einträge für den KI-Aufruf. `privateNames` sind Namen, die zusätzlich überall entfernt
 * werden (z. B. die Anzeigenamen der beiden Profile).
 */
export function buildRatingRequest(
  transactions: RatableTransaction[],
  privateNames: string[] = [],
): RatingRequestItem[] {
  return transactions.map((tx, index) => {
    const company = isCompany(tx);
    const names = company || !tx.counterparty ? privateNames : [...privateNames, tx.counterparty];
    const text = [tx.bookingText, tx.purpose].filter(Boolean).join(" · ");
    // „PAYPAL *ANNABEISPIEL“ auf der Karte: der Teil nach dem Stern kann eine Person sein.
    const counterparty =
      company && tx.counterparty && PAYMENT_SERVICE.test(tx.counterparty)
        ? tx.counterparty.replace(/\*.*$/, `*${PERSON}`)
        : tx.counterparty;
    const item: RatingRequestItem = {
      ref: String(index + 1),
      gegenpartei: counterparty ? (company ? cleanText(counterparty, privateNames) : PERSON) : "",
      text: cleanText(text, names),
      betrag: tx.amountCents / 100,
      datum: tx.bookingDate,
    };
    if (tx.accountType === "credit_card" && tx.merchantCategoryCode) item.haendlerkategorie = tx.merchantCategoryCode;
    return item;
  });
}
