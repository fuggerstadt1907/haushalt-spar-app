"use client";

import { useActionState, useState, useTransition } from "react";
import { Amount } from "@/components/amount";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatCents, formatDate, formatForeign } from "@/lib/format";
import { KIND_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { commitImport, previewImport, type ImportActionState, type PreviewView } from "./actions";

const PREVIEW_STATUS_LABEL = {
  new: "neu",
  existing: "bereits vorhanden",
  replaces_pending: "ersetzt vorgemerkte",
} as const;

const fieldClass =
  "h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const IDLE: ImportActionState = { status: "idle" };

export function ImportForm({ accounts }: { accounts: { id: string; label: string }[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  // Die Dateien bleiben nur im Browser-Speicher und werden bei „Übernehmen“ erneut geschickt (R5).
  const [files, setFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [confirmMismatch, setConfirmMismatch] = useState(false);
  const [previewState, runPreview, previewPending] = useActionState(previewImport, IDLE);
  const [commitState, runCommit, commitPending] = useActionState(commitImport, IDLE);
  const [, startTransition] = useTransition();
  const [showPreview, setShowPreview] = useState(false);
  // Welche Aktion zuletzt lief, damit nur deren Fehler angezeigt wird.
  const [lastAction, setLastAction] = useState<"preview" | "commit" | null>(null);

  function formData() {
    const data = new FormData();
    data.set("accountId", accountId);
    for (const file of files) data.append("file", file);
    if (confirmMismatch) data.set("confirmBalanceMismatch", "on");
    return data;
  }

  function reset() {
    setFiles([]);
    setFileInputKey((k) => k + 1);
    setConfirmMismatch(false);
    setShowPreview(false);
    setLastAction(null);
  }

  const preview = showPreview && previewState.status === "preview" ? previewState.preview : null;
  const error =
    (lastAction === "commit" && commitState.status === "error" && commitState.message) ||
    (lastAction === "preview" && previewState.status === "error" && previewState.message) ||
    null;
  const busy = previewPending || commitPending;

  return (
    <div className="space-y-6">
      <form
        className="grid gap-4 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setConfirmMismatch(false);
          setShowPreview(true);
          setLastAction("preview");
          startTransition(() => runPreview(formData()));
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="import-konto">Konto</Label>
          <select
            id="import-konto"
            className={fieldClass}
            value={accountId}
            disabled={busy}
            onChange={(e) => {
              setAccountId(e.target.value);
              setShowPreview(false);
              setLastAction(null);
            }}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="import-datei">Dateien</Label>
          <input
            key={fileInputKey}
            id="import-datei"
            type="file"
            multiple
            accept=".xml,.csv,.zip,text/xml,text/csv,application/xml,application/zip"
            disabled={busy}
            className={cn(fieldClass, "py-1.5 file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium")}
            onChange={(e) => {
              setFiles(Array.from(e.target.files ?? []));
              setShowPreview(false);
              setLastAction(null);
            }}
          />
        </div>
        <Button type="submit" className="h-10" disabled={files.length === 0 || !accountId || busy}>
          {previewPending ? "Wird gelesen …" : "Vorschau"}
        </Button>
      </form>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Nichts gespeichert</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {preview && (
        <PreviewPanel
          preview={preview}
          confirmMismatch={confirmMismatch}
          onConfirmMismatch={setConfirmMismatch}
          busy={busy}
          commitPending={commitPending}
          onCommit={() => {
            setLastAction("commit");
            startTransition(() => runCommit(formData()));
          }}
          onDiscard={reset}
        />
      )}
    </div>
  );
}

function PreviewPanel({
  preview,
  confirmMismatch,
  onConfirmMismatch,
  busy,
  commitPending,
  onCommit,
  onDiscard,
}: {
  preview: PreviewView;
  confirmMismatch: boolean;
  onConfirmMismatch: (value: boolean) => void;
  busy: boolean;
  commitPending: boolean;
  onCommit: () => void;
  onDiscard: () => void;
}) {
  const { summary, balance } = preview;
  const mismatch = balance.type === "checked" && balance.differenceCents !== 0;
  const nothingNew =
    summary.newCount === 0 &&
    summary.replacesPendingCount === 0 &&
    preview.pendingDeletes.length === 0 &&
    preview.kindUpdateCount === 0;

  return (
    <section aria-labelledby="vorschau" className="space-y-4">
      <h2 id="vorschau" className="text-lg font-medium">
        Vorschau: {preview.fileName} → {preview.accountName}
      </h2>

      <dl className="grid grid-cols-2 gap-3 rounded-xl border p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Buchungen</dt>
          <dd className="text-lg font-medium">{summary.count}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Zeitraum</dt>
          <dd className="font-medium">
            {formatDate(summary.periodFrom)} – {formatDate(summary.periodTo)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Summe</dt>
          <dd className="text-lg font-medium">
            <Amount cents={summary.sumCents} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Neu / vorhanden</dt>
          <dd className="font-medium">
            {summary.newCount} / {summary.existingCount}
            {summary.replacesPendingCount > 0 && `, ${summary.replacesPendingCount} ersetzen vorgemerkte`}
          </dd>
        </div>
      </dl>

      {balance.type === "unavailable" ? (
        <Alert>
          <AlertTitle>Saldo-Prüfung nicht möglich</AlertTitle>
          <AlertDescription>
            Die Datei enthält keine Salden. Bitte Anzahl, Zeitraum und Summe mit dem Online-Banking vergleichen.
          </AlertDescription>
        </Alert>
      ) : mismatch ? (
        <Alert variant="destructive">
          <AlertTitle>Saldo stimmt nicht: Differenz {formatCents(balance.differenceCents)}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              Anfangssaldo {formatCents(balance.openingCents)} + Buchungen {formatCents(balance.bookedSumCents)} ergibt
              nicht den Endsaldo {formatCents(balance.closingCents)}. Möglicherweise fehlen Buchungen, z. B. eine Tagesdatei.
            </p>
            <label className="flex items-start gap-2 text-foreground">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={confirmMismatch}
                onChange={(e) => onConfirmMismatch(e.target.checked)}
              />
              Ich habe die Abweichung geprüft und möchte trotzdem übernehmen.
            </label>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertTitle>Saldo geprüft</AlertTitle>
          <AlertDescription>
            Anfangssaldo {formatCents(balance.openingCents)} + Buchungen ergibt den Endsaldo{" "}
            {formatCents(balance.closingCents)}.
          </AlertDescription>
        </Alert>
      )}

      {(preview.pendingDeletes.length > 0 || preview.kindUpdateCount > 0) && (
        <Alert>
          <AlertDescription className="space-y-1">
            {preview.pendingDeletes.length > 0 && (
              <p>
                {preview.pendingDeletes.length} vorgemerkte Buchung(en) tauchen nicht mehr auf und werden entfernt:{" "}
                {preview.pendingDeletes
                  .map((p) => `${formatDate(p.bookingDate)} ${p.counterparty ?? ""} ${formatCents(p.amountCents)}`)
                  .join(", ")}
                .
              </p>
            )}
            {preview.kindUpdateCount > 0 && (
              <p>
                {preview.kindUpdateCount} Abbuchung(en) auf dem Girokonto werden als Kreditkarten-Sammelabbuchung
                erkannt und zählen dann nicht mehr als Ausgabe.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      <ul className="max-h-[28rem] divide-y overflow-y-auto rounded-xl border">
        {preview.rows.map((row) => (
          <li
            key={row.key}
            className={cn(
              "grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-4 py-2.5 text-sm",
              row.previewStatus === "existing" && "text-muted-foreground",
            )}
          >
            <span className="min-w-0 truncate">
              <span className="tabular-nums">{formatDate(row.bookingDate)}</span> ·{" "}
              <span className="font-medium">{row.counterparty ?? row.purpose ?? "Ohne Text"}</span>
            </span>
            <span className="text-right">
              <Amount cents={row.amountCents} muted={row.previewStatus === "existing"} />
              {row.originalCurrency && row.originalAmountCents !== null && (
                <span className="block text-xs text-muted-foreground">
                  {formatForeign(row.originalAmountCents, row.originalCurrency)}
                </span>
              )}
            </span>
            <span className="col-span-2 flex flex-wrap gap-1.5">
              <Badge variant={row.previewStatus === "new" ? "default" : "outline"}>
                {PREVIEW_STATUS_LABEL[row.previewStatus]}
              </Badge>
              <Badge variant="secondary">{KIND_LABEL[row.kind]}</Badge>
              {row.status === "pending" && <Badge variant="destructive">vorläufig</Badge>}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="h-10" onClick={onDiscard} disabled={busy}>
          Verwerfen
        </Button>
        <Button
          type="button"
          className="h-10"
          onClick={onCommit}
          disabled={busy || (mismatch && !confirmMismatch) || nothingNew}
        >
          {commitPending ? "Wird übernommen …" : nothingNew ? "Nichts Neues" : "Übernehmen"}
        </Button>
      </div>
    </section>
  );
}
