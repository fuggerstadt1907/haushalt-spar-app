import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { requireProfile } from "@/lib/dal";
import { ACCOUNT_TYPE_LABEL } from "@/lib/labels";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import" };

async function ImportSection() {
  const { supabase } = await requireProfile();
  const { data: accounts, error } = await supabase.from("account").select("id, name, type").order("name");
  if (error) throw error;

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Noch kein Konto angelegt.{" "}
        <Link href="/einstellungen" className="underline underline-offset-4">
          Erstes Konto anlegen
        </Link>
      </p>
    );
  }
  return (
    <ImportForm
      accounts={accounts.map((a) => ({
        id: a.id,
        label: `${a.name} (${ACCOUNT_TYPE_LABEL[a.type as "giro" | "credit_card"]})`,
      }))}
    />
  );
}

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import"
        description="Girokonto: CAMT-XML (camt.052) aus dem Online-Banking, gerne alle Tagesdateien auf einmal oder die ZIP. Kreditkarte: Umsatz-CSV der Mastercard. Dateien werden nur gelesen und nicht gespeichert."
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Lädt …</p>}>
        <ImportSection />
      </Suspense>
    </>
  );
}
