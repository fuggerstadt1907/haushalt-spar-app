import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { parseStatement } from "./adapters";
import { ImportError, type AccountType, type ParsedStatement } from "./types";

/**
 * Ein Import kann aus mehreren Dateien bestehen: Die Sparkasse exportiert gebuchte Umsätze als
 * eine CAMT-Datei pro Buchungstag, wahlweise als ZIP. Alles wird zu einer Vorschau zusammengeführt.
 */

export interface ImportFile {
  name: string;
  content: Uint8Array;
}

/** Vercel lehnt Anfragen über 4,5 MB ab. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_UNZIPPED_BYTES = 40 * 1024 * 1024;
const MAX_FILES = 500;
const SUPPORTED = /\.(xml|csv)$/i;

function isZip(content: Uint8Array): boolean {
  return content[0] === 0x50 && content[1] === 0x4b && content[2] === 0x03 && content[3] === 0x04;
}

/** Packt ZIPs aus, lässt nur XML/CSV durch und entfernt doppelt gewählte Dateien. */
export function expandFiles(files: ImportFile[]): ImportFile[] {
  const expanded: ImportFile[] = [];
  let unzippedBytes = 0;

  for (const file of files) {
    if (!isZip(file.content)) {
      expanded.push(file);
      continue;
    }
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(file.content, {
        filter: (entry) => {
          unzippedBytes += entry.originalSize;
          if (unzippedBytes > MAX_UNZIPPED_BYTES) throw new ImportError(`${file.name}: Die ZIP-Datei ist zu groß.`);
          const base = entry.name.split("/").pop() ?? "";
          return SUPPORTED.test(base) && !base.startsWith(".") && !entry.name.startsWith("__MACOSX/");
        },
      });
    } catch (error) {
      if (error instanceof ImportError) throw error;
      throw new ImportError(`${file.name}: Die ZIP-Datei konnte nicht entpackt werden.`);
    }
    for (const [name, content] of Object.entries(entries)) expanded.push({ name: name.split("/").pop()!, content });
  }

  const seen = new Set<string>();
  const unique = expanded.filter((file) => {
    const hash = createHash("sha256").update(file.content).digest("hex");
    if (seen.has(hash)) return false;
    seen.add(hash);
    return true;
  });

  if (unique.length === 0) throw new ImportError("Keine CAMT- oder CSV-Datei gefunden.");
  if (unique.length > MAX_FILES) throw new ImportError(`Höchstens ${MAX_FILES} Dateien pro Import.`);
  return unique;
}

/** Liest alle Dateien und führt sie zu einem Auszug zusammen. */
export function parseFiles(files: ImportFile[], accountType: AccountType): ParsedStatement {
  const statements = expandFiles(files)
    .map((file) => {
      try {
        return parseStatement(file.content, accountType);
      } catch (error) {
        if (error instanceof ImportError && files.length > 1) throw new ImportError(`${file.name}: ${error.message}`);
        throw error;
      }
    })
    .sort((a, b) => a.periodFrom.localeCompare(b.periodFrom) || a.periodTo.localeCompare(b.periodTo));

  if (statements.length === 1) return statements[0];

  if (new Set(statements.map((s) => s.format)).size > 1) {
    throw new ImportError("Die Dateien haben unterschiedliche Formate. Bitte nur Dateien eines Exports zusammen hochladen.");
  }
  const ibans = new Set(statements.map((s) => s.accountIban).filter((iban): iban is string => !!iban));
  if (ibans.size > 1) throw new ImportError("Die Dateien gehören zu verschiedenen Konten.");

  // Saldo-Prüfung über alle Tage: Anfangssaldo des ersten, Endsaldo des letzten Auszugs. Nur wenn
  // jeder Auszug mit gebuchten Umsätzen Salden hat. Fehlt ein Tag, ergibt das eine Differenz.
  const withBooked = statements.filter((s) => s.transactions.some((t) => t.status === "booked"));
  const balanced =
    withBooked.length > 0 && withBooked.every((s) => s.openingBalanceCents !== null && s.closingBalanceCents !== null);

  return {
    format: statements[0].format,
    accountIban: [...ibans][0] ?? null,
    periodFrom: statements[0].periodFrom,
    periodTo: statements.map((s) => s.periodTo).sort().at(-1)!,
    openingBalanceCents: balanced ? withBooked[0].openingBalanceCents : null,
    closingBalanceCents: balanced ? withBooked[withBooked.length - 1].closingBalanceCents : null,
    transactions: statements.flatMap((s) => s.transactions),
  };
}
