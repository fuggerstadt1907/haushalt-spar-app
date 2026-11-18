import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/dal";
import { formatDate, formatDateTime } from "@/lib/format";
import { ACCOUNT_TYPE_LABEL } from "@/lib/labels";
import { deleteAccount, deleteImport } from "./actions";
import { DeleteAllForm, EditAccountForm, NewAccountForm } from "./forms";

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
              Löscht alle Konten, Imports und Buchungen des Haushalts. Die beiden Logins bleiben bestehen.
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
