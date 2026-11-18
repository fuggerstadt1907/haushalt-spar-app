import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Amount } from "@/components/amount";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/dal";
import { formatDate, formatForeign, formatMonth, isMonth, monthRange } from "@/lib/format";
import type { BookingStatus, TransactionKind } from "@/lib/import/types";
import { KIND_LABEL } from "@/lib/labels";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { sumTransactions } from "@/lib/transactions/sums";
import { cn } from "@/lib/utils";
import { TransactionFilters } from "./filters";

export const metadata: Metadata = { title: "Buchungen" };

const NOT_COUNTED: TransactionKind[] = ["transfer", "card_settlement"];

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
  const { data: accounts, error } = await supabase.from("account").select("id, name").order("name");
  if (error) throw error;

  const account = typeof params.konto === "string" && accounts.some((a) => a.id === params.konto) ? params.konto : "";

  let latestQuery = supabase.from("transaction").select("booking_date").order("booking_date", { ascending: false }).limit(1);
  if (account) latestQuery = latestQuery.eq("account_id", account);
  const { data: latest } = await latestQuery;
  const latestMonth = latest?.[0]?.booking_date.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
  const month = isMonth(params.monat) ? params.monat : latestMonth;
  const range = monthRange(month);

  const rows = await fetchAll((from, to) => {
    let query = supabase
      .from("transaction")
      .select(
        "id, account_id, booking_date, booking_status, amount_cents, original_amount_cents, original_currency, counterparty, purpose, kind",
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

  return (
    <div className="space-y-6">
      <TransactionFilters
        accounts={accounts.map((a) => ({ value: a.id, label: a.name }))}
        months={months}
        account={account}
        month={month}
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

      {rows.length === 0 ? (
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
          {rows.map((t) => {
            const kind = t.kind as TransactionKind;
            const notCounted = NOT_COUNTED.includes(kind);
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
                  {!account && <span className="text-xs text-muted-foreground">{accountName.get(t.account_id)}</span>}
                </span>
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
