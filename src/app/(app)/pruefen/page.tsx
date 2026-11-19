import type { Metadata } from "next";
import { Suspense } from "react";
import { Amount } from "@/components/amount";
import { PageHeader } from "@/components/page-header";
import { RateNowForm, RatingActions } from "@/components/rating-editor";
import { Badge } from "@/components/ui/badge";
import { requireProfile } from "@/lib/dal";
import { formatDate } from "@/lib/format";
import { NECESSITY_LABEL, URGENCY_LABEL } from "@/lib/labels";
import type { Necessity, Urgency } from "@/lib/rating/types";
import { fetchAll } from "@/lib/supabase/fetch-all";

export const metadata: Metadata = { title: "Zu prüfen" };

// „Jetzt bewerten“ wartet auf die KI.
export const maxDuration = 60;

async function ReviewList() {
  const { supabase } = await requireProfile();
  const [rows, categories] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("transaction")
        .select(
          "id, booking_date, booking_status, amount_cents, counterparty, purpose, kind, review_status, category_id, necessity, urgency, ai_reason, account(name), category(name)",
        )
        .eq("kind", "expense")
        .neq("review_status", "confirmed")
        .order("booking_date", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    supabase.from("category").select("id, name").order("name"),
  ]);
  if (categories.error) throw categories.error;
  const unratedCount = rows.filter((r) => r.review_status === "unrated").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? "Alles geprüft. Neue Ausgaben erscheinen hier nach dem nächsten Import."
            : `${rows.length} Ausgabe${rows.length === 1 ? "" : "n"} offen, davon ${unratedCount} noch ohne KI-Vorschlag.`}
        </p>
        <RateNowForm unratedCount={unratedCount} />
      </div>

      {rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((t) => (
            <li key={t.id} className="space-y-3 rounded-xl border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.counterparty ?? t.purpose ?? "Ohne Text"}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {formatDate(t.booking_date)} · {t.account?.name}
                    {t.counterparty && t.purpose ? ` · ${t.purpose}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Amount cents={t.amount_cents} />
                  {t.booking_status === "pending" && <Badge variant="destructive">vorläufig</Badge>}
                </div>
              </div>
              {t.review_status === "suggested" && t.necessity && t.urgency ? (
                <div className="space-y-1">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{t.category?.name ?? "Ohne Kategorie"}</Badge>
                    <Badge variant="outline">{NECESSITY_LABEL[t.necessity as Necessity]}</Badge>
                    <Badge variant="outline">{URGENCY_LABEL[t.urgency as Urgency]}</Badge>
                  </div>
                  {t.ai_reason && <p className="text-sm text-muted-foreground">„{t.ai_reason}“</p>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Noch kein KI-Vorschlag.</p>
              )}
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
                categories={categories.data}
                canConfirm={t.review_status === "suggested"}
                editLabel={t.review_status === "suggested" ? "Ändern" : "Bewerten"}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PruefenPage() {
  return (
    <>
      <PageHeader
        title="Zu prüfen"
        description="Die KI schlägt vor, ihr bestätigt oder korrigiert. Jede Korrektur wird zur Regel für diese Gegenpartei."
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Lädt …</p>}>
        <ReviewList />
      </Suspense>
    </>
  );
}
