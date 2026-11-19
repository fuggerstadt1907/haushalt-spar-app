import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/dal";
import { formatDate, formatDateTime } from "@/lib/format";
import { ACCOUNT_TYPE_LABEL, KIND_LABEL, NECESSITY_LABEL, URGENCY_LABEL } from "@/lib/labels";
import type { Necessity, Urgency } from "@/lib/rating/types";
import { deleteAccount, deleteCategory, deleteImport, deletePrivateName, deleteRule } from "./actions";
import {
  DeleteAllForm,
  EditAccountForm,
  NewAccountForm,
  NewCategoryForm,
  PrivateNameForm,
  RenameCategoryForm,
  RuleForm,
} from "./forms";

export const metadata: Metadata = { title: "Einstellungen" };

async function Accounts() {
  const { supabase } = await requireProfile();
  const { data: accounts, error } = await supabase.from("account").select("id, name, type, iban").order("name");
  if (error) throw error;

  return (
    <div className="space-y-4">
      {accounts.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Konten.</p>}
      {accounts.map((account) => (
        <div key={account.id} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="secondary">{ACCOUNT_TYPE_LABEL[account.type as "giro" | "credit_card"]}</Badge>
            <ConfirmDelete
              id={account.id}
              action={deleteAccount}
              title={`Konto „${account.name}“ löschen?`}
              description="Alle Imports und Buchungen dieses Kontos werden ebenfalls gelöscht."
            />
          </div>
          <EditAccountForm
            account={{
              id: account.id,
              name: account.name,
              type: account.type,
              ibanHint: account.iban ? `endet auf ${account.iban.slice(-4)}` : null,
            }}
          />
        </div>
      ))}
      <div className="rounded-lg border border-dashed p-4">
        <h3 className="mb-3 text-sm font-medium">Neues Konto</h3>
        <NewAccountForm />
      </div>
    </div>
  );
}

async function Categories() {
  const { supabase } = await requireProfile();
  const { data: categories, error } = await supabase.from("category").select("id, name, is_default").order("name");
  if (error) throw error;
  const defaults = categories.filter((c) => c.is_default);
  const own = categories.filter((c) => !c.is_default);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {defaults.map((c) => (
          <Badge key={c.id} variant="secondary">
            {c.name}
          </Badge>
        ))}
      </div>
      {own.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {own.map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-4 py-3">
              <RenameCategoryForm category={c} />
              <ConfirmDelete
                id={c.id}
                action={deleteCategory}
                title={`Kategorie „${c.name}“ löschen?`}
                description="Buchungen mit dieser Kategorie werden wieder unbewertet und erscheinen unter „Zu prüfen“."
              />
            </li>
          ))}
        </ul>
      )}
      <NewCategoryForm />
    </div>
  );
}

async function Rules() {
  const { supabase } = await requireProfile();
  const [rules, categories] = await Promise.all([
    supabase
      .from("merchant_rule")
      .select("id, counterparty_label, kind, category_id, necessity, urgency, updated_at, category(name), updater:profile!merchant_rule_updated_by_fkey(display_name)")
      .order("counterparty_label"),
    supabase.from("category").select("id, name").order("name"),
  ]);
  if (rules.error) throw rules.error;
  if (categories.error) throw categories.error;

  if (rules.data.length === 0) {
    return <p className="text-sm text-muted-foreground">Noch keine Regeln. Sie entstehen, wenn ihr eine Bewertung korrigiert.</p>;
  }
  return (
    <ul className="space-y-3">
      {rules.data.map((r) => (
        <li key={r.id} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.counterparty_label}</p>
              <p className="text-sm text-muted-foreground">
                {r.kind === "expense" && r.necessity && r.urgency
                  ? `${r.category?.name ?? "Ohne Kategorie"} · ${NECESSITY_LABEL[r.necessity as Necessity]} · ${URGENCY_LABEL[r.urgency as Urgency]}`
                  : `${KIND_LABEL[r.kind as "expense" | "income"]} (Zuflüsse)`}
                {r.updater?.display_name && ` · ${r.updater.display_name}, ${formatDate(r.updated_at.slice(0, 10))}`}
              </p>
            </div>
            <ConfirmDelete
              id={r.id}
              action={deleteRule}
              title={`Regel für „${r.counterparty_label}“ löschen?`}
              description="Bereits bewertete Buchungen behalten ihre Bewertung. Neue Buchungen bewertet wieder die KI."
            />
          </div>
          {r.kind === "expense" && (
            <RuleForm
              rule={{ id: r.id, kind: r.kind, categoryId: r.category_id, necessity: r.necessity, urgency: r.urgency }}
              categories={categories.data}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

async function PrivateNames() {
  const { supabase } = await requireProfile();
  const [names, profiles] = await Promise.all([
    supabase.from("private_name").select("id, name").order("name"),
    supabase.from("profile").select("display_name").order("display_name"),
  ]);
  if (names.error) throw names.error;
  if (profiles.error) throw profiles.error;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Immer entfernt: {profiles.data.map((p) => `„${p.display_name}“`).join(", ")} (Anzeigenamen der Logins).
      </p>
      {names.data.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {names.data.map((n) => (
            <li key={n.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span>{n.name}</span>
              <ConfirmDelete
                id={n.id}
                action={deletePrivateName}
                title={`„${n.name}“ von der Liste nehmen?`}
                description="Der Name wird danach nicht mehr vor dem KI-Aufruf entfernt."
                label="Entfernen"
              />
            </li>
          ))}
        </ul>
      )}
      <PrivateNameForm />
    </div>
  );
}

async function Imports() {
  const { supabase } = await requireProfile();
  const { data: imports, error } = await supabase
    .from("import")
    .select("id, period_from, period_to, transaction_count, created_at, account(name), profile(display_name)")
    .order("created_at", { ascending: false });
  if (error) throw error;

  if (imports.length === 0) return <p className="text-sm text-muted-foreground">Noch keine Imports.</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {imports.map((i) => (
        <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
          <div>
            <p className="font-medium">
              {i.account?.name} · {formatDate(i.period_from)} – {formatDate(i.period_to)}
            </p>
            <p className="text-muted-foreground">
              {i.transaction_count} Buchungen · {formatDateTime(i.created_at)}
              {i.profile?.display_name && ` · ${i.profile.display_name}`}
            </p>
          </div>
          <ConfirmDelete
            id={i.id}
            action={deleteImport}
            title="Import löschen?"
            description="Alle Buchungen aus diesem Import werden gelöscht. Andere Imports bleiben unberührt."
          />
        </li>
      ))}
    </ul>
  );
}

const loading = <p className="text-sm text-muted-foreground">Lädt …</p>;

export default function EinstellungenPage() {
  return (
    <>
      <PageHeader title="Einstellungen" />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Konten</CardTitle>
            <CardDescription>Girokonten und Kreditkarte, deren Auszüge ihr importiert.</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={loading}>
              <Accounts />
            </Suspense>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Kategorien</CardTitle>
            <CardDescription>
              Die Startliste ist fest, damit Monate vergleichbar bleiben. Eigene Kategorien lassen sich ergänzen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={loading}>
              <Categories />
            </Suspense>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Regeln</CardTitle>
            <CardDescription>
              Jede Korrektur einer Bewertung legt eine Regel für die Gegenpartei an. Buchungen mit Regel werden ohne KI
              bewertet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={loading}>
              <Rules />
            </Suspense>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Namen, die nie an die KI gehen</CardTitle>
            <CardDescription>
              Vor jeder KI-Bewertung werden IBANs, Kontonummern und Namen von Privatpersonen entfernt. Tragt hier
              zusätzlich eure vollen Namen und andere Namen ein, die in Verwendungszwecken auftauchen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={loading}>
              <PrivateNames />
            </Suspense>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Imports</CardTitle>
            <CardDescription>
              Gespeichert sind nur die Buchungen und diese Angaben, nie die Datei. Buchungen älter als 24 Monate
              werden automatisch gelöscht.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={loading}>
              <Imports />
            </Suspense>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Alle Daten löschen</CardTitle>
            <CardDescription>
              Löscht alle Konten, Imports, Buchungen, Regeln, eigenen Kategorien und die Namensliste des Haushalts. Die beiden Logins bleiben bestehen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteAllForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
