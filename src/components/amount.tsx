import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Betrag mit Vorzeichenfarbe: Zufluss grün, Abfluss neutral. */
export function Amount({ cents, className, muted }: { cents: number; className?: string; muted?: boolean }) {
  return (
    <span
      className={cn(
        "tabular-nums whitespace-nowrap",
        cents > 0 && !muted && "text-emerald-700 dark:text-emerald-400",
        muted && "text-muted-foreground",
        className,
      )}
    >
      {formatCents(cents)}
    </span>
  );
}
