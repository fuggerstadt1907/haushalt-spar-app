"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Label } from "@/components/ui/label";

export interface FilterOption {
  value: string;
  label: string;
}

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-56";

export interface RatingFilterValues {
  category: string;
  necessity: string;
  urgency: string;
}

export function TransactionFilters({
  accounts,
  months,
  categories,
  necessities,
  urgencies,
  account,
  month,
  rating,
}: {
  accounts: FilterOption[];
  months: FilterOption[];
  categories: FilterOption[];
  necessities: FilterOption[];
  urgencies: FilterOption[];
  account: string;
  month: string;
  rating: RatingFilterValues;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end" aria-busy={pending}>
      <div className="space-y-1.5">
        <Label htmlFor="filter-konto">Konto</Label>
        <select id="filter-konto" className={selectClass} value={account} onChange={(e) => update("konto", e.target.value)}>
          <option value="">Alle Konten</option>
          {accounts.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filter-monat">Monat</Label>
        <select id="filter-monat" className={selectClass} value={month} onChange={(e) => update("monat", e.target.value)}>
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filter-kategorie">Kategorie</Label>
        <select
          id="filter-kategorie"
          className={selectClass}
          value={rating.category}
          onChange={(e) => update("kategorie", e.target.value)}
        >
          <option value="">Alle Kategorien</option>
          <option value="ohne">Ohne Kategorie</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filter-notwendigkeit">Notwendigkeit</Label>
        <select
          id="filter-notwendigkeit"
          className={selectClass}
          value={rating.necessity}
          onChange={(e) => update("notwendigkeit", e.target.value)}
        >
          <option value="">Alle</option>
          {necessities.map((n) => (
            <option key={n.value} value={n.value}>
              {n.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filter-dringlichkeit">Dringlichkeit</Label>
        <select
          id="filter-dringlichkeit"
          className={selectClass}
          value={rating.urgency}
          onChange={(e) => update("dringlichkeit", e.target.value)}
        >
          <option value="">Alle</option>
          {urgencies.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
