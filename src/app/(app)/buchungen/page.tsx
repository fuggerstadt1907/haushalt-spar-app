import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Amount } from "@/components/amount";
import { PageHeader } from "@/components/page-header";
import { RatingActions } from "@/components/rating-editor";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/dal";
import { formatDate, formatForeign, formatMonth, isMonth, monthRange } from "@/lib/format";
import type { BookingStatus, TransactionKind } from "@/lib/import/types";
import { KIND_LABEL, NECESSITY_LABEL, URGENCY_LABEL } from "@/lib/labels";
import { NECESSITIES, URGENCIES, type Necessity, type Urgency } from "@/lib/rating/types";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { sumByCategory, sumTransactions } from "@/lib/transactions/sums";
import { cn } from "@/lib/utils";
import { TransactionFilters } from "./filters";

export const metadata: Metadata = { title: "Buchungen" };

// Eine Korrektur wendet die neue Regel auf alle offenen Buchungen an.
export const maxDuration = 60;

const NOT_COUNTED: TransactionKind[] = ["transfer", "card_settlement"];
/** Einnahmen haben nichts zu bewerten, Erstattungen können zur Einnahme werden (F4). */
const RATABLE: TransactionKind[] = ["expense", "refund"];

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | "" {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

/** Die letzten 25 Monate bis zum jüngsten Monat mit Buchungen (ältere werden ohnehin gelöscht, R25). */
function monthOptions(latest: string) {
  const [year, month] = latest.split("-").map(Number);
  return Array.from({ length: 25 }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 1 - i, 1));
    const value = date.toISOString().slice(0, 7);
    return { value, label: formatMonth(value) };
  });
}

async function TransactionList({ searchParams }: { searchParams: PageProps<"/buchungen">["searchParams"] }) {
  const params = await searchParams;
  const { supabase } = await requireProfile();
  const [{ data: accounts, error }, { data: categories, error: categoriesError }] = await Promise.all([
    supabase.from("account").select("id, name").order("name"),
    supabase.from("category").select("id, name").order("name"),
  ]);
  if (error) throw error;
  if (categoriesError) throw categoriesError;

  const account = typeof params.konto === "string" && accounts.some((a) => a.id === params.konto) ? params.konto : "";

  let latestQuery = supabase.from("transaction").select("booking_date").order("booking_date", { ascending: false }).limit(1);
  if (account) latestQuery = latestQuery.eq("account_id", account);
  const { data: latest } = await latestQuery;
  const latestMonth = latest?.[0]?.booking_date.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
  const month = isMonth(params.monat) ? params.monat : latestMonth;
  const range = monthRange(month);
  const category = pick(params.kategorie, ["ohne", ...categories.map((c) => c.id)]);
  const necessity = pick(params.notwendigkeit, NECESSITIES);
  const urgency = pick(params.dringlichkeit, URGENCIES);

  const rows = await fetchAll((from, to) => {
    let query = supabase
      .from("transaction")
      .select(
        "id, account_id, booking_date, booking_status, amount_cents, original_amount_cents, original_currency, counterparty, purpose, kind, refund_of, review_status, category_id, necessity, urgency, ai_reason",
      )
      .gte("booking_date", range.from)
      .lt("booking_date", range.toExclusive)
      .order("booking_date", { ascending: false })
      .order("id")
      .range(from, to);
    if (account) query = query.eq("account_id", account);
    return query;
  });

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const sums = sumTransactions(
    rows.map((r) => ({
      amountCents: r.amount_cents,
      kind: r.kind as TransactionKind,
      bookingStatus: r.booking_status as BookingStatus,
    })),
  );
  const months = monthOptions(month > latestMonth ? month : latestMonth);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const byCategory = sumByCategory(
    rows.map((r) => ({
      id: r.id,
      amountCents: r.amount_cents,
      kind: r.kind as TransactionKind,
      bookingStatus: r.booking_status as BookingStatus,
      categoryId: r.category_id,
      refundOf: r.refund_of,
    })),
  );

  // Bewertungsfilter (R22) betreffen nur Ausgaben.
  const filtered = category || necessity || urgency;
  const visible = filtered
    ? rows.filter(
        (r) =>
          r.kind === "expense" &&
          (!category || (category === "ohne" ? !r.category_id : r.category_id === category)) &&
          (!necessity || r.necessity === necessity) &&
          (!urgency || r.urgency === urgency),
      )
    : rows;
  const categoryHref = (id: string | null) => {
    const query = new URLSearchParams({ monat: month, kategorie: id ?? "ohne" });
    if (account) query.set("konto", account);
    return `/buchungen?${query}`;
  };

  return (
    <div className="space-y-6">
      <TransactionFilters
        accounts={accounts.map((a) => ({ value: a.id, label: a.name }))}
        months={months}
        categories={categories.map((c) => ({ value: c.id, label: c.name }))}
        necessities={NECESSITIES.map((n) => ({ value: n, label: NECESSITY_LABEL[n] }))}
        urgencies={URGENCIES.map((u) => ({ value: u, label: URGENCY_LABEL[u] }))}
        account={account}
        month={month}
        rating={{ category, necessity, urgency }}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Einnahmen</CardDescription>
            <CardTitle className="text-xl">
              <Amount cents={sums.incomeCents} muted />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Ausgaben</CardDescription>
            <CardTitle className="text-xl">
              <Amount cents={sums.expensesCents} muted />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>davon vorgemerkt</CardDescription>
            <CardTitle className="text-xl">
              <Amount cents={sums.pendingExpensesCents} muted />
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {byCategory.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Ausgaben nach Kategorie</CardTitle>
            <CardDescription>Erstattungen sind bei der erstatteten Ausgabe abgezogen.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {byCategory.map((s) => (
                <li key={s.categoryId ?? "ohne"}>
                  <Link
                    href={categoryHref(s.categoryId)}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-md px-2 py-1 text-sm hover:bg-muted",
                      (category === s.categoryId || (category === "ohne" && !s.categoryId)) && "bg-muted font-medium",
                    )}
                  >
                    <span className="truncate">{s.categoryId ? categoryName.get(s.categoryId) : "Ohne Kategorie"}</span>
                    <Amount cents={s.cents} muted />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {filtered && (
        <p className="text-sm text-muted-foreground">
          {visible.length} von {rows.length} Buchungen (gefiltert, nur Ausgaben).
        </p>
      )}

      {visible.length === 0 && filtered ? (
        <p className="text-sm text-muted-foreground">Keine Ausgaben für diese Filter.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keine Buchungen in diesem Monat.{" "}
          {accounts.length === 0 ? (
            <Link href="/einstellungen" className="underline underline-offset-4">
              Erstes Konto anlegen
            </Link>
          ) : (
            <Link href="/import" className="underline underline-offset-4">
              Auszug importieren
            </Link>
          )}
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {visible.map((t) => {
            const kind = t.kind as TransactionKind;
            const notCounted = NOT_COUNTED.includes(kind);
            const rated = kind === "expense" && t.necessity && t.urgency;
            return (
              <li key={t.id} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[6.5rem_1fr_auto]">
                <span className="text-sm text-muted-foreground tabular-nums md:row-span-2">{formatDate(t.booking_date)}</span>
                <span className="col-start-2 row-start-1 text-right md:col-start-3">
                  <Amount cents={t.amount_cents} muted={notCounted} className={cn(notCounted && "line-through decoration-1")} />
                  {t.original_currency && t.original_amount_cents !== null && (
                    <span className="block text-xs text-muted-foreground">
                      {formatForeign(t.original_amount_cents, t.original_currency)}
                    </span>
                  )}
                </span>
                <span className="col-span-2 min-w-0 md:col-span-1 md:col-start-2 md:row-start-1">
                  <span className="block truncate font-medium">{t.counterparty ?? t.purpose ?? "Ohne Text"}</span>
                  {t.counterparty && t.purpose && (
                    <span className="block truncate text-sm text-muted-foreground">{t.purpose}</span>
                  )}
                </span>
                <span className="col-span-2 flex flex-wrap items-center gap-1.5 md:col-span-2 md:col-start-2">
                  <Badge variant={kind === "expense" ? "secondary" : "outline"}>{KIND_LABEL[kind]}</Badge>
                  {t.booking_status === "pending" && <Badge variant="destructive">vorläufig</Badge>}
                  {rated && (
                    <>
                      <Badge variant="outline">{t.category_id ? categoryName.get(t.category_id) : "Ohne Kategorie"}</Badge>
                      <Badge variant="outline">{NECESSITY_LABEL[t.necessity as Necessity]}</Badge>
                      <Badge variant="outline">{URGENCY_LABEL[t.urgency as Urgency]}</Badge>
                      {t.review_status === "suggested" && <span className="text-xs text-muted-foreground">KI-Vorschlag</span>}
                    </>
                  )}
                  {kind === "expense" && !rated && <span className="text-xs text-muted-foreground">unbewertet</span>}
                  {!account && <span className="text-xs text-muted-foreground">{accountName.get(t.account_id)}</span>}
                </span>
                {RATABLE.includes(kind) && (
                  <div className="col-span-2 md:col-span-2 md:col-start-2">
                    <RatingActions
                      rating={{
                        id: t.id,
                        kind: t.kind,
                        amountCents: t.amount_cents,
                        counterparty: t.counterparty,
                        categoryId: t.category_id,
                        necessity: t.necessity,
                        urgency: t.urgency,
                      }}
                      categories={categories}
                      canConfirm={t.review_status === "suggested" && kind === "expense"}
                      editLabel={kind === "expense" ? (rated ? "Bewertung ändern" : "Bewerten") : "Art ändern"}
                      compact
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function BuchungenPage(props: PageProps<"/buchungen">) {
  return (
    <>
      <PageHeader
        title="Buchungen"
        description="Durchgestrichene Beträge (Umbuchungen, Sammelabbuchungen) zählen nicht als Ausgabe oder Einnahme."
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Lädt …</p>}>
        <TransactionList searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
