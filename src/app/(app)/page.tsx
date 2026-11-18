import Link from "next/link";
import { Suspense } from "react";
import { Amount } from "@/components/amount";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/dal";
import { formatMonth, monthRange } from "@/lib/format";
import type { BookingStatus, TransactionKind } from "@/lib/import/types";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { sumTransactions } from "@/lib/transactions/sums";

function EmptyState({ step }: { step: "account" | "import" }) {
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>{step === "account" ? "Willkommen!" : "Fast geschafft"}</CardTitle>
        <CardDescription>
          {step === "account"
            ? "Leg zuerst deine Konten an: Girokonten und die Kreditkarte. Danach importierst du den ersten Auszug."
            : "Deine Konten sind angelegt. Jetzt fehlt der erste Auszug: CAMT-XML fürs Girokonto oder die CSV der Kreditkarte."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href={step === "account" ? "/einstellungen" : "/import"} className={buttonVariants()}>
          {step === "account" ? "Erstes Konto anlegen" : "Ersten Auszug importieren"}
        </Link>
      </CardContent>
    </Card>
  );
}

async function Overview() {
  const { supabase } = await requireProfile();

  const [{ count: accountCount }, { data: latest }] = await Promise.all([
    supabase.from("account").select("id", { count: "exact", head: true }),
    supabase.from("transaction").select("booking_date").order("booking_date", { ascending: false }).limit(1),
  ]);
  if (!accountCount) return <EmptyState step="account" />;
  if (!latest?.length) return <EmptyState step="import" />;

  const month = latest[0].booking_date.slice(0, 7);
  const range = monthRange(month);
  const rows = await fetchAll((from, to) =>
    supabase
      .from("transaction")
      .select("amount_cents, kind, booking_status")
      .gte("booking_date", range.from)
      .lt("booking_date", range.toExclusive)
      .order("id")
      .range(from, to),
  );
  const sums = sumTransactions(
    rows.map((r) => ({
      amountCents: r.amount_cents,
      kind: r.kind as TransactionKind,
      bookingStatus: r.booking_status as BookingStatus,
    })),
  );

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">{formatMonth(month)}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Einnahmen</CardDescription>
            <CardTitle className="text-2xl">
              <Amount cents={sums.incomeCents} muted />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Ausgaben</CardDescription>
            <CardTitle className="text-2xl">
              <Amount cents={sums.expensesCents} muted />
            </CardTitle>
            {sums.pendingExpensesCents !== 0 && (
              <p className="text-sm text-muted-foreground">
                davon vorgemerkt <Amount cents={sums.pendingExpensesCents} muted />
              </p>
            )}
          </CardHeader>
        </Card>
      </div>
      <p className="text-sm text-muted-foreground">
        Umbuchungen und Kreditkarten-Sammelabbuchungen zählen nicht mit, Erstattungen sind verrechnet. Das
        Fixkosten-Cockpit folgt in einer späteren Etappe.{" "}
        <Link href={`/buchungen?monat=${month}`} className="underline underline-offset-4">
          Alle Buchungen des Monats
        </Link>
      </p>
    </div>
  );
}

export default function CockpitPage() {
  return (
    <>
      <PageHeader title="Cockpit" />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Lädt …</p>}>
        <Overview />
      </Suspense>
    </>
  );
}
