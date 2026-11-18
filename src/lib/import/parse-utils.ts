import { ImportError } from "./types";

/** "1.234,56" (decimal ",") oder "1234.56" (decimal ".") → Cent, ohne Fließkomma. */
const AMOUNT_PATTERNS = {
  ",": { pattern: /^([+-]?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/, thousands: "." },
  ".": { pattern: /^([+-]?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/, thousands: "," },
} as const;

export function parseAmountToCents(raw: string, decimal: "," | "."): number {
  const { pattern, thousands } = AMOUNT_PATTERNS[decimal];
  const match = pattern.exec(raw.trim().replace(/\s/g, ""));
  if (!match) throw new ImportError(`Betrag „${raw}“ konnte nicht gelesen werden.`);
  const [, sign, whole, frac = ""] = match;
  const cents = Number(whole.split(thousands).join("")) * 100 + Number(frac.padEnd(2, "0"));
  return sign === "-" ? -cents : cents;
}

/** "TT.MM.JJ" oder "TT.MM.JJJJ" → "JJJJ-MM-TT". */
export function parseGermanDate(raw: string): string {
  const match = /^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/.exec(raw.trim());
  if (!match) throw new ImportError(`Datum „${raw}“ konnte nicht gelesen werden.`);
  const [, day, month, year] = match;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month}-${day}`;
}

export function minMaxDate(dates: string[]): { from: string; to: string } {
  const sorted = [...dates].sort();
  return { from: sorted[0], to: sorted[sorted.length - 1] };
}

export function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
