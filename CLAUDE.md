# CLAUDE.md

@AGENTS.md

## Projekt

Private Haushalts-Spar-App (zwei Nutzer, ein Haushalt). Auftrag und Etappen:
`docs/requirements/haushalt-spar-app.md`. Neue Requirements liegen unter `docs/requirements/`,
Pläne unter `docs/plans/`.

## Sprache

- Oberfläche, Commit-Messages, Code-Kommentare und Doku: Deutsch.
- Bezeichner im Code: Englisch. Datenbank: Englisch, snake_case, Tabellen im Singular (`transaction`).
- Beträge immer in Cent als Ganzzahl (`amount_cents`, negativ = Abfluss). Anzeige über `src/lib/format.ts`.

## Stack & Struktur

- Next.js 16 mit `cacheComponents`: Alles, was Cookies oder `searchParams` liest, gehört in eine
  `<Suspense>`-Grenze. Kein `export const dynamic`. Middleware heißt `src/proxy.ts`.
- Datenzugriff in Server Components und Server Actions immer über `requireProfile()`
  (`src/lib/dal.ts`). Die Absicherung macht RLS in Postgres, nicht der Client.
- Import-Pipeline in `src/lib/import/`: Adapter je Dateiformat (`adapters/`), `preview.ts` als
  reine Funktion für Duplikate, vorgemerkt→gebucht und Arten. Gespeichert wird atomar per RPC
  `commit_import`. Neues Format = neuer Adapter in `adapters/index.ts`.
- KI-Bewertung in `src/lib/rating/`: `rateTransactions` (rein, erst Regeln, dann KI) bekommt
  den Provider injiziert (`RatingProvider`, Gemini in `gemini.ts`). Alles, was an die KI geht,
  läuft durch `buildRatingRequest` (Pseudonymisierung, R8). Keine anderen Felder an die KI geben.
- UI: shadcn/ui (Base UI, nicht Radix: `render`-Prop statt `asChild`).

## Datenbank

- Migrationen nur über neue Dateien in `supabase/migrations/`, nie bereits eingespielte Dateien
  ändern. Einspielen mit `supabase db push`, danach Typen neu erzeugen (siehe README).
- Jede Tabelle hat RLS mit `household_id = private.current_household_id()`.
- Migrationen und `supabase config push` gegen das Remote-Projekt nur nach Rückfrage.

## Checks

`npm run check` (Typecheck, Lint, Vitest) und `npm run build` müssen grün sein. Logik wird an
den öffentlichen Funktionen getestet (`parseStatement`, `buildImportPreview`, `sumTransactions`, `rateTransactions`).

## Öffentliches Repo

Keine Secrets, IBANs, E-Mail-Adressen oder echten Auszüge committen. Testdaten nur synthetisch
(`fixtures/builders.ts`, IBANs mit Bankleitzahl 00000000). Echte Dateien liegen in
`fixtures/private/` (gitignored). Der gitleaks-Hook muss aktiv sein
(`git config core.hooksPath .githooks`).
