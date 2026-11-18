import { createHash, randomUUID } from "node:crypto";
import type {
  AccountType,
  BookingStatus,
  ParsedStatement,
  ParsedTransaction,
  TransactionKind,
} from "./types";

/**
 * Vorschau eines Imports (R4, R6, R7, R7a): reine Funktion über die gelesene Datei und den
 * Bestand. Dieselbe Funktion liefert beim „Übernehmen“ die Änderungen für commit_import.
 */

export interface OwnAccount {
  id: string;
  type: AccountType;
  iban: string | null;
}

export interface ExistingTransaction {
  id: string;
  accountId: string;
  bookingDate: string;
  bookingStatus: BookingStatus;
  amountCents: number;
  counterparty: string | null;
  purpose: string | null;
  dedupeHash: string;
  kind: TransactionKind;
  refundOf: string | null;
}

export interface PreviewInput {
  account: OwnAccount;
  statement: ParsedStatement;
  /** Buchungen des Haushalts (alle Konten) rund um den Zeitraum der Datei. */
  existing: ExistingTransaction[];
  ownAccounts: OwnAccount[];
}

/** new = wird angelegt, existing = bereits vorhanden, replaces_pending = ersetzt eine vorläufige Buchung. */
export type PreviewStatus = "new" | "existing" | "replaces_pending";

export interface PreviewRow extends ParsedTransaction {
  /** Neue Zeilen bekommen hier schon ihre id, damit Erstattungen darauf zeigen können. */
  id: string;
  previewStatus: PreviewStatus;
  dedupeHash: string;
  kind: TransactionKind;
  refundOf: string | null;
}

export interface KindUpdate {
  id: string;
  kind: TransactionKind;
  refundOf: string | null;
}

export type BalanceCheck =
  | {
      type: "checked";
      openingCents: number;
      closingCents: number;
      bookedSumCents: number;
      /** Anfangssaldo + gebuchte Umsätze − Endsaldo. 0 = stimmt. */
      differenceCents: number;
    }
  | { type: "unavailable" };

export interface ImportPreview {
  rows: PreviewRow[];
  pendingDeletes: ExistingTransaction[];
  kindUpdates: KindUpdate[];
  balance: BalanceCheck;
  summary: {
    count: number;
    periodFrom: string;
    periodTo: string;
    sumCents: number;
    newCount: number;
    existingCount: number;
    replacesPendingCount: number;
    pendingCount: number;
  };
}

/** Toleranz in Tagen für vorgemerkt→gebucht und Sammelabbuchung Karte↔Giro. */
export const MATCH_WINDOW_DAYS = 5;
/** So weit schaut eine Erstattung nach der ursprünglichen Ausgabe zurück. */
export const REFUND_WINDOW_DAYS = 90;

/** Auf der Kreditkarte: die Gutschrift aus dem Einzug vom Girokonto. */
const CARD_SETTLEMENT_ON_CARD = /^lastschrift\b/;
/**
 * Auf dem Girokonto: Abbuchung der Kreditkartenabrechnung, falls die Kartenabrechnung (noch)
 * fehlt. Girocard-Zahlungen („Kartenzahlung“) sind ausdrücklich keine Sammelabbuchung.
 */
const CARD_SETTLEMENT_ON_GIRO = /kreditkart|kartenabrechnung|mastercard/;
const NOT_CARD_SETTLEMENT_ON_GIRO = /kartenzahlung|girocard|debit/;

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .trim();
}

export function normalizeIban(value: string | null | undefined): string {
  return (value ?? "").replace(/\s/g, "").toUpperCase();
}

function counterpartyKey(tx: { counterparty: string | null; purpose: string | null }): string {
  return normalizeText(tx.counterparty) || normalizeText(tx.purpose);
}

function compatibleCounterparty(a: string, b: string): boolean {
  if (!a || !b) return true;
  return a === b || a.includes(b) || b.includes(a);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/**
 * Fingerprint für die Duplikaterkennung (R6). Gleiche Buchungen am selben Tag werden
 * innerhalb der Datei durchnummeriert, damit sie nicht zusammenfallen.
 */
export function dedupeHashes(transactions: ParsedTransaction[]): string[] {
  const seen = new Map<string, number>();
  return transactions.map((t) => {
    const base = JSON.stringify([
      t.status,
      t.bookingDate,
      t.valueDate,
      t.amountCents,
      normalizeText(t.counterparty),
      normalizeText(t.purpose),
    ]);
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return createHash("sha256").update(`${base}#${occurrence}`).digest("hex");
  });
}

/** Ausgaben und Kartengutschriften, gegen die Erstattungen und Sammelabbuchungen geprüft werden. */
interface PoolEntry {
  id: string;
  accountId: string;
  accountType: AccountType;
  bookingDate: string;
  amountCents: number;
  key: string;
  kind: TransactionKind;
  /** Bereits erstatteter Betrag (positiv), damit eine Ausgabe nicht mehrfach erstattet wird. */
  refundedCents: number;
}

export function buildImportPreview(input: PreviewInput): ImportPreview {
  const { account, statement, existing, ownAccounts } = input;
  const accountType = (id: string): AccountType =>
    id === account.id ? account.type : (ownAccounts.find((a) => a.id === id)?.type ?? "giro");
  const otherOwnIbans = new Set(
    ownAccounts.filter((a) => a.id !== account.id && a.iban).map((a) => normalizeIban(a.iban)),
  );

  const sameAccount = existing.filter((e) => e.accountId === account.id);
  const byHash = new Map(sameAccount.map((e) => [e.dedupeHash, e]));
  const matchedExisting = new Set<string>();

  // 1. Duplikate (R6)
  const hashes = dedupeHashes(statement.transactions);
  const rows: PreviewRow[] = statement.transactions.map((tx, i) => {
    const match = byHash.get(hashes[i]);
    if (match && !matchedExisting.has(match.id)) {
      matchedExisting.add(match.id);
      return { ...tx, id: match.id, previewStatus: "existing", dedupeHash: hashes[i], kind: match.kind, refundOf: null };
    }
    return { ...tx, id: randomUUID(), previewStatus: "new", dedupeHash: hashes[i], kind: "expense", refundOf: null };
  });

  // 2. Vorgemerkt → gebucht oder geänderte Vormerkung (R7a): gleiche Zeile, damit die Bewertung
  // erhalten bleibt. Gebuchte Zeilen der Datei zuerst, sie haben Vorrang vor erneuten Vormerkungen.
  const openPending = sameAccount.filter((e) => e.bookingStatus === "pending" && !matchedExisting.has(e.id));
  const reconcileOrder = [...rows].sort((a, b) => Number(a.status === "pending") - Number(b.status === "pending"));
  for (const row of reconcileOrder) {
    if (row.previewStatus !== "new") continue;
    const key = counterpartyKey(row);
    const candidate = openPending
      .filter(
        (p) =>
          !matchedExisting.has(p.id) &&
          p.amountCents === row.amountCents &&
          Math.abs(daysBetween(p.bookingDate, row.bookingDate)) <= MATCH_WINDOW_DAYS &&
          compatibleCounterparty(counterpartyKey(p), key),
      )
      .sort(
        (a, b) =>
          Math.abs(daysBetween(a.bookingDate, row.bookingDate)) -
          Math.abs(daysBetween(b.bookingDate, row.bookingDate)),
      )[0];
    if (candidate) {
      matchedExisting.add(candidate.id);
      row.id = candidate.id;
      row.previewStatus = "replaces_pending";
    }
  }

  // Vorläufige Buchungen im Zeitraum der Datei, die weder vorgemerkt noch gebucht wieder
  // auftauchen, entfallen. Außerhalb des Zeitraums sagt die Datei nichts über sie aus.
  const pendingDeletes = openPending.filter(
    (p) => !matchedExisting.has(p.id) && p.bookingDate >= statement.periodFrom && p.bookingDate <= statement.periodTo,
  );
  const deletedIds = new Set(pendingDeletes.map((p) => p.id));

  // 3. Arten (R7)
  const reclassified = new Set(rows.filter((r) => r.previewStatus === "replaces_pending").map((r) => r.id));
  const pool: PoolEntry[] = existing
    .filter((e) => !deletedIds.has(e.id) && !reclassified.has(e.id))
    .map((e) => ({
      id: e.id,
      accountId: e.accountId,
      accountType: accountType(e.accountId),
      bookingDate: e.bookingDate,
      amountCents: e.amountCents,
      key: counterpartyKey(e),
      kind: e.kind,
      refundedCents: 0,
    }));
  for (const e of existing) {
    const target = e.kind === "refund" && e.refundOf ? pool.find((p) => p.id === e.refundOf) : undefined;
    if (target && !deletedIds.has(e.id) && !reclassified.has(e.id)) target.refundedCents += e.amountCents;
  }
  const usedSettlements = new Set<string>();

  const toClassify = rows
    .filter((r) => r.previewStatus !== "existing")
    // chronologisch, am selben Tag Ausgaben vor Gutschriften, damit Erstattungen ihre Ausgabe finden
    .sort((a, b) => a.bookingDate.localeCompare(b.bookingDate) || a.amountCents - b.amountCents);

  for (const row of toClassify) {
    const { kind, refundOf } = classify(row);
    row.kind = kind;
    row.refundOf = refundOf;
    pool.push({
      id: row.id,
      accountId: account.id,
      accountType: account.type,
      bookingDate: row.bookingDate,
      amountCents: row.amountCents,
      key: counterpartyKey(row),
      kind,
      refundedCents: 0,
    });
  }

  // 4. Kartengutschriften machen bereits importierte Giro-Abbuchungen zur Sammelabbuchung.
  const kindUpdates: KindUpdate[] = [];
  if (account.type === "credit_card") {
    for (const row of toClassify.filter((r) => r.kind === "card_settlement")) {
      // Bereits als Sammelabbuchung erkannte Abbuchungen (Textmuster) zuerst, erst dann Ausgaben.
      const debit =
        findSettlementCounterpart(row, "giro", ["card_settlement"]) ??
        findSettlementCounterpart(row, "giro", ["expense"]);
      if (debit) {
        usedSettlements.add(debit.id);
        if (debit.kind !== "card_settlement") {
          kindUpdates.push({ id: debit.id, kind: "card_settlement", refundOf: null });
        }
      }
    }
  }

  const transactions = statement.transactions;
  const bookedSumCents = transactions
    .filter((t) => t.status === "booked")
    .reduce((sum, t) => sum + t.amountCents, 0);
  const balance: BalanceCheck =
    statement.openingBalanceCents !== null && statement.closingBalanceCents !== null
      ? {
          type: "checked",
          openingCents: statement.openingBalanceCents,
          closingCents: statement.closingBalanceCents,
          bookedSumCents,
          differenceCents: statement.openingBalanceCents + bookedSumCents - statement.closingBalanceCents,
        }
      : { type: "unavailable" };

  return {
    rows,
    pendingDeletes,
    kindUpdates,
    balance,
    summary: {
      count: rows.length,
      periodFrom: statement.periodFrom,
      periodTo: statement.periodTo,
      sumCents: transactions.reduce((sum, t) => sum + t.amountCents, 0),
      newCount: rows.filter((r) => r.previewStatus === "new").length,
      existingCount: rows.filter((r) => r.previewStatus === "existing").length,
      replacesPendingCount: rows.filter((r) => r.previewStatus === "replaces_pending").length,
      pendingCount: rows.filter((r) => r.status === "pending").length,
    },
  };

  function classify(row: PreviewRow): KindUpdate {
    const none = { id: row.id, refundOf: null };
    const key = counterpartyKey(row);

    if (account.type === "credit_card") {
      if (row.amountCents > 0 && CARD_SETTLEMENT_ON_CARD.test(key)) {
        return { ...none, kind: "card_settlement" };
      }
      // Gutschriften auf der Karte sind immer Erstattungen, mit oder ohne gefundene Ausgabe.
      if (row.amountCents > 0) return { ...none, kind: "refund", refundOf: assignRefund(row) };
      return { ...none, kind: "expense" };
    }

    if (row.counterpartyIban && otherOwnIbans.has(normalizeIban(row.counterpartyIban))) {
      return { ...none, kind: "transfer" };
    }
    if (row.amountCents < 0) {
      const credit = findSettlementCounterpart(row, "credit_card", ["card_settlement"]);
      if (credit) {
        usedSettlements.add(credit.id);
        return { ...none, kind: "card_settlement" };
      }
      const text = normalizeText([row.counterparty, row.purpose, row.bookingText].join(" "));
      if (CARD_SETTLEMENT_ON_GIRO.test(text) && !NOT_CARD_SETTLEMENT_ON_GIRO.test(text)) {
        return { ...none, kind: "card_settlement" };
      }
      return { ...none, kind: "expense" };
    }
    const origin = assignRefund(row);
    return origin ? { ...none, kind: "refund", refundOf: origin } : { ...none, kind: "income" };
  }

  /** Gegenstück einer Sammelabbuchung auf dem anderen Konto: gleicher Betrag, ±5 Tage. */
  function findSettlementCounterpart(
    row: PreviewRow,
    onType: AccountType,
    kinds: TransactionKind[],
  ): PoolEntry | undefined {
    return pool
      .filter(
        (p) =>
          p.accountType === onType &&
          p.accountId !== account.id &&
          !usedSettlements.has(p.id) &&
          p.amountCents === -row.amountCents &&
          Math.abs(daysBetween(p.bookingDate, row.bookingDate)) <= MATCH_WINDOW_DAYS &&
          kinds.includes(p.kind),
      )
      .sort(
        (a, b) =>
          Math.abs(daysBetween(a.bookingDate, row.bookingDate)) -
          Math.abs(daysBetween(b.bookingDate, row.bookingDate)),
      )[0];
  }

  /**
   * Ursprüngliche Ausgabe einer Erstattung: gleiche Gegenpartei, bis 90 Tage zurück, Betrag ≤ noch
   * nicht erstatteter Rest der Ausgabe. Liefert deren id und bucht den Betrag als erstattet.
   */
  function assignRefund(row: PreviewRow): string | null {
    const key = counterpartyKey(row);
    if (!key) return null;
    const origin = pool
      .filter((p) => {
        const age = daysBetween(p.bookingDate, row.bookingDate);
        return (
          p.kind === "expense" &&
          p.key === key &&
          age >= 0 &&
          age <= REFUND_WINDOW_DAYS &&
          -p.amountCents - p.refundedCents >= row.amountCents
        );
      })
      .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate))[0];
    if (!origin) return null;
    origin.refundedCents += row.amountCents;
    return origin.id;
  }
}
