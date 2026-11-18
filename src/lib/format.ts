const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const dateFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

/** 123456 → „1.234,56 €“ */
export function formatCents(cents: number): string {
  return euro.format(cents / 100);
}

/** Fremdwährung, z. B. „-25,00 USD“ */
export function formatForeign(cents: number, currency: string): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(cents / 100);
}

/** „2026-11-03“ → „03.11.2026“ */
export function formatDate(isoDate: string): string {
  return dateFormat.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`));
}

export function formatDateTime(isoTimestamp: string): string {
  return dateTimeFormat.format(new Date(isoTimestamp));
}

/** „2026-11“ → „November 2026“ */
export function formatMonth(month: string): string {
  return monthFormat.format(new Date(`${month}-01T00:00:00Z`));
}

/** Erster Tag und erster Tag des Folgemonats für „JJJJ-MM“. */
export function monthRange(month: string): { from: string; toExclusive: string } {
  const [year, m] = month.split("-").map(Number);
  const next = m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, "0")}`;
  return { from: `${month}-01`, toExclusive: `${next}-01` };
}

export function isMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
