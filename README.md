# Haushalt-Spar-App

Private Web-App für einen Haushalt mit zwei Erwachsenen. Sie liest Kontoauszüge (CAMT-XML) und
Kreditkarten-Umsätze (CSV) der Sparkasse ein, erkennt Duplikate, Umbuchungen,
Kreditkarten-Sammelabbuchungen und Erstattungen und zeigt alle Buchungen an einem Ort.
Anforderungen und Etappen stehen in [`docs/requirements/haushalt-spar-app.md`](docs/requirements/haushalt-spar-app.md).

Stack: Next.js 16 (App Router, TypeScript), Tailwind + shadcn/ui, Supabase (Auth, Postgres, RLS,
pg_cron), Hosting auf Vercel.

## Setup

Voraussetzungen: Node 24, die [Supabase CLI](https://supabase.com/docs/guides/cli) und
[gitleaks](https://github.com/gitleaks/gitleaks) (`brew install gitleaks`).

```bash
npm install
git config core.hooksPath .githooks   # Secret-Check vor jedem Commit und Push
cp .env.example .env.local            # Werte eintragen, siehe unten
npm run dev
```

### Umgebungsvariablen

| Variable | Wo | Hinweis |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local`, Vercel | Projekt-URL, darf öffentlich sein |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local`, Vercel | `sb_publishable_…`, darf öffentlich sein, RLS schützt die Daten |
| `SUPABASE_SECRET_KEY` | nur `.env.local` | `sb_secret_…`, nur für `npm run create-user`. Nie committen, nicht bei Vercel |
| `GEMINI_API_KEY` | `.env.local`, Vercel (Secret) | Google AI Studio, nur serverseitig. Nie committen. Fehlt er, bleiben neue Ausgaben unbewertet unter „Zu prüfen“ |
| `GEMINI_MODEL` | optional, `.env.local`, Vercel | Gemini-Modell für die Bewertung, Standard `gemini-3.5-flash-lite` |

Secrets liegen nur in `.env.local` (gitignored) und in den Umgebungsvariablen von Vercel.

## Datenbank

Migrationen liegen versioniert in `supabase/migrations/`, die Auth-Einstellungen in
`supabase/config.toml` (öffentliche Registrierung aus, Passwörter ab 8 Zeichen mit Groß- und Kleinbuchstaben, Zahl und Sonderzeichen).

```bash
supabase link --project-ref <project-ref>
supabase db push        # Migrationen einspielen
supabase config push    # Auth-Einstellungen einspielen
supabase gen types typescript --linked > src/lib/supabase/database.types.ts
```

Beim Deploy laufen zuerst die Migrationen, dann der Client.

## Accounts anlegen

Eine Registrierung gibt es nicht. Die beiden Accounts werden einmalig per Skript angelegt. Es
legt beim ersten Aufruf den Haushalt an und ordnet den Account zu. Das Passwort wird abgefragt
und nirgends gespeichert.

```bash
npm run create-user -- --email <mail> --name <Anzeigename> --household "<Haushaltsname>"
npm run create-user -- --email <mail> --name <Anzeigename>
```

E-Mail-Adressen und IBANs kommen nur über das Skript, die App oder das Supabase-Dashboard in die
Datenbank, nie über Dateien im Repo.

## Deploy (Vercel)

1. Repository in Vercel importieren (Framework: Next.js).
2. `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` als Umgebungsvariablen setzen,
   dazu `GEMINI_API_KEY` als Secret (optional `GEMINI_MODEL`).
3. In Supabase unter Authentication → URL Configuration die Vercel-URL als Site URL eintragen.

Deployt wird aus `main`.

## Checks

```bash
npm run check      # Typecheck, Lint, Tests
npm run build
```

## Testdaten

`fixtures/sample/` enthält synthetische Sparkassen-Dateien (IBANs mit Bankleitzahl 00000000). Sie
werden mit `npm run fixtures` aus `fixtures/builders.ts` erzeugt. Echte Auszüge gehören nach
`fixtures/private/`. Der Ordner ist gitignored.

## Öffentliches Repository

Das Repo darf öffentlich sein: keine Secrets, keine echten Bankdaten, keine personenbezogenen
Daten. Die Hooks `.githooks/pre-commit` und `.githooks/pre-push` prüfen jeden Commit und Push mit gitleaks. Die Regeln
stehen in `.gitleaks.toml`, inklusive einer Regel für IBANs. Auf GitHub ist zusätzlich die Push
Protection aktiv.
