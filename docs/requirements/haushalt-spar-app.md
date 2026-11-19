# Haushalt-Spar-App

> Status: not ready (Etappe 1 umgesetzt, Etappen 2–4 startbereit) · Ticket: Freitext (Chat, 2026-11-18) · Stand: 2026-11-19

## Zusammenfassung

Eine private Web-App für zwei Erwachsene eines Haushalts. Sie liest Kontoauszüge und
Kreditkartenabrechnungen der Sparkasse ein, lässt jede Ausgabe von einer KI kategorisieren und
bewerten und stellt sie den Einnahmen gegenüber. Im Mittelpunkt stehen die Fixkosten: Die App
erkennt laufende Verträge, schlägt Kündigungen oder Wechsel vor und zeigt, was zuerst zu tun ist.

## Problem & Ziel

Der Umgang mit Geld fällt schwer. Es fehlt der Überblick, wohin das Geld monatlich fließt und welche
laufenden Kosten verzichtbar sind. Heute gibt es dafür kein Werkzeug, nur das Online-Banking.

**Erfolgskriterium:** Die monatliche Fixkostensumme sinkt messbar. Das Cockpit zeigt den Verlauf
der Fixkosten pro Monat. Nach sechs Monaten Nutzung liegt sie sichtbar unter dem Ausgangswert.

## Akteure & Rollen

| Akteur | Rechte |
| --- | --- |
| Alessandro | Alles: importieren, bewerten, korrigieren, Verträge und Einnahmen pflegen, löschen |
| Partner:in | Dieselben Rechte, gleichberechtigt |
| Andere | Kein Zugang. Es gibt keine Registrierung. Beide Accounts werden einmalig angelegt. |

Jede Änderung (Bewertung, Vertragsstatus, Import) speichert, wer sie vorgenommen hat.

## Anforderungen

### Zugang

- **R1**: Anmeldung mit E-Mail und Passwort. Genau zwei Accounts, beide gehören zu einem Haushalt.
  Eine öffentliche Registrierung gibt es nicht.

### Import

- **R2**: Es können mehrere Konten angelegt werden: Sparkassen-Girokonten und die
  Sparkassen-Mastercard Gold. Jedes Konto hat einen Typ (Giro / Kreditkarte).
- **R3**: Upload eines Auszugs pro Konto. Ein Import-Adapter wandelt die Datei in einheitliche
  Buchungen um. Weitere Formate oder Quellen lassen sich als neuer Adapter ergänzen. Unterstützt
  werden diese Formate (deutsche Sparkasse):
  - Girokonten: XML CAMT V8 (camt.052.001.08), gebuchte und vorgemerkte Umsätze. Gläubiger-ID
    und Mandatsreferenz werden mit übernommen.
  - Mastercard Gold: der CSV-Export aus dem Online-Banking (ISO-8859-1, Trennzeichen `;`, Datum
    `TT.MM.JJ`, Dezimalkomma). Spalten: Umsatz getätigt von (Karte), Belegdatum, Buchungsdatum,
    Originalbetrag/-währung, Umrechnungskurs, Buchungsbetrag/-währung, Transaktionsbeschreibung
    (+ Zusatz), Buchungsreferenz, Gebührenschlüssel (Händlerkategorie-Code, z. B. 5818, als
    Hinweis für die KI), Länderkennzeichen, BAR-Entgelt, AEE, Abrechnungskennzeichen. Gezählt wird
    der Buchungsbetrag in EUR, Fremdwährungsbeträge werden angezeigt.

  Die Beispieldateien zeigen: Der CAMT-Export ist `camt.052.001.08` mit dem Status pro Eintrag
  (`PDNG` = vorgemerkt, `BOOK` = gebucht) und enthält **keine Salden**. Auch die CSV hat keine.
- **R4**: Nach dem Upload kommt eine Vorschau mit allen erkannten Buchungen. Sie prüft, ob
  Anfangssaldo plus Buchungen den Endsaldo ergeben, sofern die Datei Salden enthält. Bei den
  Sparkassen-Exporten ist das nicht der Fall. Dann zeigt die Vorschau Anzahl, Zeitraum und Summe
  der Buchungen zum Abgleich mit dem Online-Banking, mit dem Hinweis „Saldo-Prüfung nicht
  möglich“.
  Gespeichert wird erst nach „Übernehmen“.
- **R5**: Die Originaldatei wird nach dem Import gelöscht. Gespeichert werden nur die Buchungen und
  die Metadaten des Imports (Konto, Zeitraum, Salden, wer, wann).
- **R6**: Doppelte Buchungen bei überlappenden Imports werden erkannt und nicht erneut angelegt.
- **R7**: Jede Buchung bekommt eine Art: Ausgabe, Einnahme, Umbuchung (zwischen eigenen Konten),
  Kreditkarten-Sammelabbuchung oder Erstattung. Umbuchungen und Sammelabbuchungen zählen nicht
  als Ausgabe oder Einnahme. Erstattungen werden mit der ursprünglichen Ausgabe verrechnet.
- **R7a**: Vorgemerkte Umsätze werden als „vorläufig“ gespeichert und in der Buchungsliste so
  gekennzeichnet. Im Cockpit zählen sie als eigener Posten („davon vorgemerkt“). Taucht derselbe
  Umsatz später gebucht auf, ersetzt die gebuchte Buchung die vorläufige und übernimmt deren
  Bewertung. Ist ein vorläufiger Umsatz beim nächsten Import weder vorgemerkt noch gebucht, wird
  er gelöscht.

### KI-Bewertung

- **R8**: Vor jedem KI-Aufruf werden IBANs, Kontonummern und Namen von Privatpersonen entfernt
  bzw. durch Platzhalter ersetzt. An die KI gehen nur Buchungstext (bereinigt), Gegenpartei
  (Firmenname), Betrag und Datum.
- **R9**: Die KI schlägt für jede neue Ausgabe vor:
  - eine Kategorie aus der Kategorienliste,
  - die Notwendigkeit in 4 Stufen: Muss / Sollte / Kann / Verzichtbar,
  - die Dringlichkeit in 3 Stufen: Sofort nötig / Hätte warten können / Impulskauf,
  - eine kurze Begründung.
- **R10**: Vorschläge haben den Status „vorgeschlagen“, bis jemand sie bestätigt oder korrigiert.
  Offene Vorschläge stehen gesammelt unter „Zu prüfen“.
- **R11**: Eine Korrektur erzeugt eine Regel für die Gegenpartei (Kategorie, Notwendigkeit,
  Dringlichkeit, Art). Künftige Buchungen derselben Gegenpartei werden zuerst mit Regeln bewertet,
  nur der Rest geht an die KI. Regeln sind einsehbar, änderbar und löschbar.
- **R12**: Die App startet mit einer festen Liste von etwa 15 Kategorien (z. B. Wohnen, Energie,
  Versicherungen, Mobilität, Lebensmittel, Abos & Medien, Kommunikation, Kinder, Gesundheit,
  Freizeit, Essen gehen, Kleidung, Haushalt, Sparen, Sonstiges). Eigene Kategorien können
  ergänzt werden.

### Fixkosten & Verträge

- **R13**: Wiederkehrende Zahlungen werden erkannt: vorrangig über Gläubiger-ID und
  Mandatsreferenz (eine Lastschrift entspricht einem Vertrag), sonst über gleiche Gegenpartei,
  ähnlichen Betrag und regelmäßigen Rhythmus (monatlich, quartalsweise oder jährlich). Daraus entsteht ein
  Vertragsvorschlag. Ihr bestätigt ihn oder verwerft ihn.
- **R14**: Ein Vertrag hat Name, Gegenpartei, Kategorie, Rhythmus, Betrag und Monatsbetrag. Quartals-
  und Jahreszahlungen werden auf den Monat umgerechnet. Ein Vertragsende kann eingetragen werden,
  muss aber nicht. Fehlt es, fragt die App auf der Vertragskarte danach. Die Kündigungsfrist wird
  nach Vertragsart vorbelegt und lässt sich überschreiben: Versicherung 3 Monate zum Ablauf;
  Handy, Internet, Strom, Gas, Fitness und Streaming 1 Monat (gesetzliche Frist nach der
  Mindestlaufzeit); unbekannte Art 3 Monate.
- **R15**: Ein Vertrag hat einen von drei Status: aktiv / gekündigt zum \<Datum\> / sofort beenden.
- **R16**: Ist ein Vertrag als „gekündigt zum \<Datum\>“ markiert und wird danach trotzdem
  abgebucht, zeigt die App eine deutliche Warnung.
- **R17**: Die KI schlägt pro Vertrag eine Aktion vor: kündigen, wechseln, verhandeln oder behalten.
  Dazu kommen eine Begründung und die geschätzte Ersparnis pro Jahr. Doppelungen werden als solche
  markiert (z. B. zwei Streamingdienste).
- **R18**: Jeder Vertrag hat eine Handlungspriorität. Sie ergibt sich aus der geschätzten
  Ersparnis und, sofern ein Vertragsende eingetragen ist, der Nähe des letzten Kündigungstags
  (Vertragsende minus Kündigungsfrist). Ab 4 Wochen vor dem letzten Kündigungstag gilt
  „Frist naht“, im Zweifel also rund 4 Monate vor Vertragsende. „Sofort beenden“ steht immer
  oben.

### Einnahmen

- **R19**: Eingänge in den Auszügen (Gehalt, Familienbeihilfe usw.) werden als Einnahmequellen
  vorgeschlagen und einmal bestätigt. Zusätzlich lassen sich Einnahmequellen von Hand anlegen
  (Name, Betrag, Rhythmus).

### Tarifvergleich

- **R20**: Auf jeder Vertragskarte gibt es den Button „Günstigeren Tarif suchen“. Die KI
  recherchiert im Web nach aktuellen Alternativen und zeigt bis zu drei Angebote mit Preis,
  Quelle (Link) und Datum der Recherche. Dabei gehen nur Vertragsart, Anbieter, aktueller Preis
  und, falls angegeben, Eckdaten wie Verbrauch oder Datenvolumen an die KI. Die Ergebnisse werden
  am Vertrag gespeichert.

### Cockpit & Hilfe

- **R21**: Die Startseite ist das Fixkosten-Cockpit. Es zeigt:
  - Einnahmen und Ausgaben des aktuellen Monats samt Veränderung zum Vormonat,
  - die Fixkostensumme pro Monat mit Verlauf,
  - die Liste „Jetzt handeln“ (Verträge nach Handlungspriorität mit direkten Aktionen),
  - die Liste „Zu prüfen“ (Anzahl offener KI-Vorschläge).
- **R22**: Zusätzlich gibt es eine Buchungsliste mit Filtern nach Konto, Monat, Kategorie,
  Notwendigkeit und Dringlichkeit sowie eine Monatsübersicht nach Kategorien.
- **R23**: Eine kurze Hilfe in der App erklärt die Bewertungsstufen, die Vertragsstatus und den
  Import-Ablauf.
- **R24**: Die App ist responsiv und auf dem Handy voll nutzbar.

### Datenhaltung

- **R25**: Buchungen, die älter als 24 Monate sind, werden automatisch gelöscht. Verträge,
  Einnahmequellen, Regeln und Kategorien sind davon nicht betroffen. Einzelne Imports lassen sich
  komplett löschen, ebenso alle Daten.

### Automatischer Bankabruf (Etappe 5)

- **R26**: Umsätze von Girokonten und Mastercard werden per FinTS auf Knopfdruck abgerufen
  („Umsätze abrufen“). Die Online-Banking-PIN wird bei jedem Abruf eingegeben, nur für diesen
  Abruf verwendet und nie gespeichert oder geloggt. Verlangt die Sparkasse eine S-pushTAN, wartet
  die App auf die Freigabe. Die Umsätze laufen durch dieselbe Pipeline wie ein Upload
  (Duplikaterkennung, Arten, vorläufig/gebucht, KI). Der Upload bleibt als Fallback erhalten.
  Wird die FinTS-Produkt-ID nicht erteilt (O2), kommen die Girokonten stattdessen über Enable
  Banking (restricted mode, kostenlos), die Kreditkarte bleibt dann beim CSV-Upload.

### Öffentliches Repository

- **R27**: Das Repository kann jederzeit öffentlich auf GitHub liegen. Es enthält keine Secrets,
  keine echten Bankdaten und keine personenbezogenen Daten: keine API-Keys, keine IBANs, keine
  E-Mail-Adressen der Accounts, keine echten Auszüge. Testdaten und Beispieldateien sind
  synthetisch oder vollständig anonymisiert. Eine Secret-Prüfung (Pre-Commit-Hook mit z. B.
  gitleaks und GitHub Push Protection) verhindert versehentliche Commits.

### Akzeptanzkriterien

- **AK1 (R1)**: Given eine Person ohne Account. When sie die App aufruft. Then sieht sie nur den
  Login und kann sich nicht registrieren.
- **AK2 (R4)**: Given ein Auszug, dessen Buchungen den Endsaldo nicht ergeben. When die Vorschau
  erscheint. Then warnt sie mit dem Differenzbetrag, und „Übernehmen“ erfordert eine ausdrückliche
  Bestätigung.
- **AK3 (R5)**: Given ein übernommener Import. When man den Dateispeicher prüft. Then ist die
  Originaldatei nicht mehr vorhanden.
- **AK4 (R6)**: Given ein Auszug Oktober ist importiert. When ein Auszug 15.10.–15.11. desselben
  Kontos importiert wird. Then werden die Buchungen vom 15.–31.10. nicht doppelt angelegt, und die
  Vorschau zeigt sie als „bereits vorhanden“.
- **AK5 (R7)**: Given 200 € gehen vom Gehaltskonto ab und gleichzeitig auf dem Gemeinschaftskonto
  ein. When beide importiert sind. Then sind beide als Umbuchung markiert und fehlen in den
  Summen von Einnahmen und Ausgaben.
- **AK6 (R7)**: Given eine Kreditkartenabrechnung mit 12 Einzelbuchungen und die zugehörige
  Sammelabbuchung auf dem Girokonto. When beides importiert ist. Then zählen die 12
  Einzelbuchungen als Ausgaben, die Sammelabbuchung nicht.
- **AK7 (R8)**: Given eine Buchung mit IBAN und Privatperson im Text. When sie an die KI geht.
  Then enthält der Request weder die IBAN noch den Namen.
- **AK8 (R11)**: Given eine Buchung „Spotify“ wurde von „Kann“ auf „Verzichtbar“ korrigiert. When
  im nächsten Monat wieder Spotify abbucht. Then ist die Buchung ohne KI-Aufruf mit
  „Verzichtbar“ bewertet.
- **AK9 (R14)**: Given eine Jahresversicherung über 600 €. When sie als Vertrag bestätigt ist.
  Then zählt sie im Cockpit mit 50 €/Monat zu den Fixkosten.
- **AK10 (R16)**: Given ein Vertrag „gekündigt zum 31.12.“. When im Januar erneut eine Abbuchung
  importiert wird. Then zeigt das Cockpit eine Warnung an diesem Vertrag.
- **AK11 (R18)**: Given ein Vertrag mit Status „sofort beenden“. When das Cockpit lädt. Then steht
  er in „Jetzt handeln“ ganz oben.
- **AK12 (R20)**: Given ein Handyvertrag. When „Günstigeren Tarif suchen“ gedrückt wird. Then
  erscheinen bis zu drei Angebote, jeweils mit Preis und Link zur Quelle.
- **AK13 (R25)**: Given eine Buchung, die 24 Monate und 1 Tag alt ist. When der tägliche
  Aufräumlauf durch ist. Then ist sie gelöscht, der zugehörige Vertrag bleibt bestehen.
- **AK15 (R7a)**: Given ein vorgemerkter Umsatz über 49,99 € ist bewertet. When er im nächsten
  Import gebucht auftaucht. Then gibt es nur eine Buchung, sie ist gebucht und behält die
  Bewertung.
- **AK16 (R18)**: Given ein Handyvertrag mit Vertragsende 31.03. und vorbelegter Frist 1 Monat.
  When heute der 05.02. ist. Then steht er mit „Frist naht“ in „Jetzt handeln“ (letzter
  Kündigungstag 28.02.).
- **AK17 (R26)**: Given ein FinTS-Abruf ist abgeschlossen. When man Datenbank und Logs prüft.
  Then ist die PIN nirgends zu finden.
- **AK14 (R27)**: Given ein Commit, der einen API-Key oder eine IBAN enthält. When committet oder
  gepusht wird. Then bricht der Secret-Check ab.

## Edge Cases & Fehlerfälle

- **Überlappende oder doppelte Imports**: werden über die Duplikaterkennung abgefangen (R6).
- **Umbuchungen zwischen eigenen Konten**: werden über Betrag, Datum und eigene IBANs gepaart
  (R7). Findet sich kein Gegenstück, weil ein Konto nicht importiert ist, gilt die Buchung trotzdem
  als Umbuchung, wenn die Ziel-IBAN ein eigenes Konto ist.
- **Kreditkarten-Sammelabbuchung**: wird als solche erkannt und nicht gezählt (R7). Fehlt die
  Kartenabrechnung für den Monat, weist das Cockpit darauf hin, dass Ausgaben fehlen.
- **Erstattungen und Rückbuchungen**: werden mit der Ausgabe verrechnet. Findet sich keine
  passende Ausgabe, wird die Erstattung als Einnahme der Kategorie „Sonstiges“ vorgeschlagen.
- **Jahres- und Quartalszahlungen**: werden auf Monatsbeträge umgerechnet (R14).
- **Zahlung trotz Kündigung**: löst eine Warnung aus (R16).
- **Datei nicht lesbar oder falsches Format**: Die Vorschau zeigt eine verständliche Meldung
  („Datei konnte nicht gelesen werden“). Es wird nichts gespeichert.
- **Saldo stimmt nicht**: Die Vorschau warnt mit der Differenz (AK2).
- **KI nicht erreichbar oder fehlerhafte Antwort**: Die Buchungen werden trotzdem gespeichert,
  bleiben unbewertet und tauchen unter „Zu prüfen“ auf. Ein Button stößt die Bewertung erneut an.
- **Gleichzeitige Bearbeitung durch beide**: Wer zuletzt speichert, gewinnt. Die Änderung zeigt,
  wer sie gemacht hat.
- **Vorgemerkter Umsatz ändert sich oder verschwindet**: wird beim nächsten Import ersetzt oder
  gelöscht (R7a).
- **FinTS** (Etappe 5): Falsche PIN, abgelehnte oder nicht rechtzeitig bestätigte pushTAN und eine
  Störung der Sparkasse führen zu einer klaren Meldung. Es wird nichts gespeichert, der Upload
  bleibt möglich. Da die S-pushTAN-Freigabe Minuten dauern kann, wird der Dialogzustand
  serverseitig gehalten und abgefragt, statt in einem einzigen Request zu warten.

## UX/UI & Texte

- Die Startseite ist das Fixkosten-Cockpit (R21). Weitere Bereiche: Buchungen, Verträge,
  Einnahmen, Import, Einstellungen (Konten, Kategorien, Regeln), Hilfe.
- Die Oberfläche ist auf Deutsch, Beträge in Euro im deutschen Format (1.234,56 €).
- Leerer Zustand beim ersten Login: Der Weg führt zum ersten Konto und zum ersten Import.
- Die Vertragskarte zeigt den Betrag pro Monat und pro Jahr, Status, Vertragsende (oder die Frage
  danach), den KI-Vorschlag mit Ersparnis und die Aktionen (Status ändern, Tarif vergleichen).
- Keine Erinnerungen per Mail oder Push. Fristen und Warnungen erscheinen nur in der App.

Skizze Cockpit:

```
┌─ November 2026 ───────────────────┐
│ Einnahmen   4.820 €                │
│ Ausgaben    4.610 €   ▲ +3 %      │
│ Fixkosten   2.140 €/M  ▼ -45 €    │
├─ Jetzt handeln ───────────────────┤
│ ● Netflix + Disney+ doppelt  -14€/M │
│   [sofort beenden] [behalten]       │
│ ● Handyvertrag endet 03/27  -20€/M │
│   [Tarif vergleichen]               │
├─ Zu prüfen (12 Buchungen) ────────┤
└────────────────────────────────────┘
```

## Daten & Schema

Neues Projekt, es gibt keine Bestandsdaten. Entitäten:

| Entität | Wesentliche Felder |
| --- | --- |
| `household` | id, name |
| `profile` | id (Auth-User), household_id, display_name |
| `account` | household_id, name, type (`giro` \| `credit_card`), iban (nur für die Erkennung von Umbuchungen, verlässt nie den Server) |
| `import` | account_id, period_from, period_to, opening_balance?, closing_balance?, source (`upload` \| `fints` \| `enable_banking`), created_by |
| `transaction` | account_id, import_id, booking_date, booking_status (`booked` \| `pending`), amount_cents, counterparty, purpose, creditor_id, mandate_reference, dedupe_hash, kind (`expense` \| `income` \| `transfer` \| `card_settlement` \| `refund`), refund_of, category_id, necessity (`must` \| `should` \| `could` \| `dispensable`), urgency (`immediate` \| `could_wait` \| `impulse`), ai_reason, review_status (`suggested` \| `confirmed` \| `unrated`), contract_id, updated_by |
| `category` | household_id, name, is_default |
| `merchant_rule` | household_id, counterparty_pattern, category_id, necessity, urgency, kind, created_by |
| `contract` | household_id, name, contract_type, creditor_id?, mandate_reference?, counterparty_pattern, category_id, notice_period_months, interval (`monthly` \| `quarterly` \| `yearly`), amount_cents, monthly_cents, end_date?, status (`active` \| `cancelled` \| `terminate_now`), cancelled_effective_date?, suggested_action (`cancel` \| `switch` \| `negotiate` \| `keep`), savings_per_year_cents, ai_reason, updated_by |
| `income_source` | household_id, name, amount_cents, interval, origin (`detected` \| `manual`) |
| `tariff_search` | contract_id, created_at, offers (Anbieter, Preis, Link), created_by |

Lebensdauer: `transaction` wird nach 24 Monaten automatisch gelöscht (R25). Originaldateien werden
gar nicht dauerhaft gespeichert (R5). Alles andere bleibt, bis es gelöscht wird.

## Sicherheit & Datenschutz

- Alle Tabellen haben Row Level Security in Supabase: Lesen und Schreiben nur für Profile
  desselben Haushalts. Durchgesetzt wird das in der Datenbank, nicht im Client.
- Die öffentliche Registrierung ist in Supabase Auth abgeschaltet.
- Der Claude-API-Key existiert nur serverseitig (Next.js-Server-Routen). Der Client spricht die
  API nie direkt an.
- Die Pseudonymisierung vor jedem KI-Aufruf (R8) wird serverseitig erzwungen und mit einem Test
  abgesichert (AK7).
- Supabase-Projekt in der EU-Region (Frankfurt).
- Das Repo ist public-tauglich (R27). Secrets liegen nur in `.env.local` (gitignored) sowie in den
  Umgebungsvariablen von Vercel und Supabase. Im Repo liegt nur eine `.env.example` mit
  Platzhaltern. Die Supabase-URL und der Publishable Key dürfen öffentlich sein, weil RLS den
  Zugriff schützt. Der Service-Role-Key und der Anthropic-Key dürfen es nie. Echte Daten (eigene
  IBANs, Account-E-Mails) kommen nur über die App oder das Supabase-Dashboard in die Datenbank,
  nie über Seed-Dateien im Repo.
- Die Online-Banking-PIN für FinTS wird nie gespeichert, nie geloggt und nie an die KI gegeben.
  Sie existiert nur im Arbeitsspeicher während eines Abrufs (R26, AK17).
- Hochgeladene Dateien werden nie gespeichert, sondern nur im Arbeitsspeicher gelesen. Für
  „Übernehmen“ schickt der Browser die Datei erneut (R5, Entscheidung 35).
- Privates Projekt ohne Dritte als Nutzer, es braucht keine Datenschutzerklärung. Rechtlich ist
  das Sache des Haushalts selbst.

## Abhängigkeiten

- **Supabase** (Auth, Postgres, pg_cron für den Aufräumlauf), Free-Tier. Storage wird nicht
  gebraucht, Uploads werden nur im Arbeitsspeicher gelesen (Entscheidung 35).
- **Vercel** für das Hosting, Free-Tier.
- **Anthropic Claude API** für Kategorisierung, Bewertung, Vertragsvorschläge und, mit dem
  Web-Search-Tool, den Tarifvergleich. Die Kosten liegen voraussichtlich bei wenigen Cent bis
  einigen Euro pro Monat.
- **Beispieldateien** liegen in `fixtures/private/` (gitignored): eine CAMT-V8-Datei mit
  vorgemerkten Umsätzen und eine Kreditkarten-CSV. Fürs Repo werden daraus synthetische Fixtures
  erzeugt.
- **FinTS** (Etappe 5): eine kostenlose Produkt-Registrierung bei der Deutschen Kreditwirtschaft
  (Formular auf fints.org/de/hersteller/produktregistrierung, per E-Mail an
  registrierung@hbci-zka.de, Antwort in 10–15 Werktagen, O2) und die Bibliothek lib-fints (TypeScript, kann
  Decoupled-TAN und Kreditkartenumsätze, mit der Sparkasse aber noch nicht erprobt; Fallback:
  python-fints als kleiner eigener Dienst). Quellen: github.com/robocode13/lib-fints,
  enablebanking.com/docs/markets/de/, bankaccountdata.gocardless.com/new-signups-disabled
  (abgerufen 18.11.2026).
- **Enable Banking** nur als Fallback, falls die Produkt-ID abgelehnt wird.

## Zielbild (Lösung)

**Architektur:** Next.js mit TypeScript auf Vercel, Supabase als Backend. Die gesamte KI-Logik
läuft in Server-Routen. _Verworfen:_ Vite-SPA mit Edge Functions, weil der Server-Teil von
Next.js das Geheimhalten des API-Keys und die KI-Pipeline einfacher macht. Selbst-Hosting,
weil Wartung, Backups und der Zugriff von unterwegs zu aufwendig wären.

**Module:**

1. **Auth & Haushalt**: zwei Profile, ein Haushalt, RLS.
2. **Import-Pipeline**: Adapter je Quelle (CAMT V8, Kreditkarten-CSV, später FinTS) → einheitliche Buchungen →
   Duplikaterkennung → Bestimmung der Art (Umbuchung, Sammelabbuchung, Erstattung) → Vorschau →
   Speichern. _Entscheidung:_ Adapter-Schnittstelle, weil es mehrere Formate gibt und FinTS
   später andocken soll. _Entscheidung:_ CAMT V8 XML statt CSV-CAMT, weil es Salden für die
   Saldo-Prüfung enthalten könnte (bei der Sparkasse leider nicht) und streng strukturiert ist. MT940 ist veraltet.
3. **Bewertung**: zuerst Regeln, dann pseudonymisierter Batch-Aufruf an Claude mit strukturierter
   Ausgabe (Kategorie, Notwendigkeit, Dringlichkeit, Begründung). _Entscheidung:_ Die KI schlägt
   vor, Menschen bestätigen, und Korrekturen werden zu Regeln. _Verworfen:_ Die KI entscheidet
   allein, weil Fehler sonst unbemerkt in den Zahlen landen.
4. **Verträge**: Erkennung wiederkehrender Zahlungen, Vertragskarten, Status, Warnung bei Zahlung
   trotz Kündigung, KI-Aktionsvorschlag, Handlungspriorität.
5. **Einnahmen**: erkannte und manuelle Einnahmequellen.
6. **Tarifvergleich**: Claude mit Web-Search auf Knopfdruck, Ergebnisse am Vertrag gespeichert.
   _Verworfen:_ automatische Suche vor Fristende, weil sie laufende Kosten und einen Scheduler
   braucht.
7. **Cockpit & Auswertungen**: Startseite, Buchungsliste, Monatsübersicht, Hilfe.
8. **Datenhaltung**: täglicher Aufräumlauf (24 Monate), Löschen von Imports und Gesamtdaten.

**Weitere Entscheidungen mit verworfener Alternative:**

- Pseudonymisiert an die Cloud-KI. _Verworfen:_ volle Daten (Drittanbieter-Risiko) und lokales
  Modell (schwächere Qualität, Setup-Aufwand).
- Zwei getrennte Werte, Notwendigkeit (4 Stufen) und Dringlichkeit (3 Stufen), plus eine
  Handlungspriorität pro Vertrag. _Verworfen:_ ein Score von 1 bis 10, weil die Abstufung zu fein
  ist und eher Diskussionen auslöst.
- Feste Kategorienliste, erweiterbar. _Verworfen:_ freie KI-Kategorien, weil Monate sonst nicht
  vergleichbar bleiben.

### Etappen

- **Etappe 1 – Fundament & Import** · umgesetzt · 2026-11-19 · etappe-1-fundament-import · R1–R7a, R22 (Buchungsliste ohne Bewertungsfilter),
  R24, R25, R27: Login, Konten, Upload mit Vorschau, Duplikate, Arten, Buchungsliste. Allein schon
  nützlich, weil alle Konten an einem Ort zusammenlaufen. Beginnt mit dem Projekt-Setup:
  - Git-Repository, Next.js-Projekt mit TypeScript
  - Supabase-Projekt (EU) samt Supabase CLI und versionierten Migrationen
  - Vercel-Deploy
  - `.env.example`, Secret-Check (gitleaks-Hook, Push Protection)
  - `README.md` und `CLAUDE.md`
  - synthetische Fixtures aus `fixtures/private/`
- **Etappe 2 – KI-Bewertung** · offen · R8–R12, R22 (Filter): Kategorien, Notwendigkeit,
  Dringlichkeit, „Zu prüfen“, Regeln. Lässt sich mit den Daten aus Etappe 1 testen.
- **Etappe 3 – Fixkosten-Cockpit** · offen · R13–R19, R21, R23: Verträge, Status, Warnungen,
  KI-Aktionen, Einnahmen, Cockpit, Hilfe. Ab hier wird das Erfolgskriterium messbar.
- **Etappe 4 – Tarifvergleich** · offen · R20: Websuche pro Vertrag.
- **Etappe 5 – Bankabruf per FinTS** · offen · R26: FinTS-Adapter auf Knopfdruck, Fallback
  Enable Banking. _Blockiert durch O2 (Produkt-ID)._

## Rollout & Release

- Neues Supabase-Projekt (EU). Migrationen über die Supabase CLI, im Repo versioniert. Beim
  Deploy laufen zuerst die Migrationen, dann der Client.
- Deploy auf Vercel aus dem Haupt-Branch. Umgebungsvariablen: Supabase-URL und -Keys sowie der
  Anthropic-API-Key (nur serverseitig).
- Einmalig: die beiden Accounts in Supabase Auth anlegen und dem Haushalt zuordnen, die Konten
  anlegen.
- Jede Etappe ist ein eigener Deploy. Feature-Flags braucht es nicht, da es nur zwei Nutzer gibt.

## Nicht-Ziele

- Kündigen oder Wechseln direkt aus der App. Die App schlägt vor, ausgeführt wird beim Anbieter.
- Steuern, Investments, Depot- oder Kreditplanung.
- Erinnerungen per E-Mail oder Push.
- Mehrere Haushalte oder öffentliche Nutzung.

**Ausblick (nicht Teil der Etappen):** Bargeld-Erfassung, weitere Banken, Auslesen von
Vertrags-PDFs, automatischer Tarifvergleich vor Fristende, FinTS-Abruf im Hintergrund (bräuchte
eine gespeicherte PIN und ist deshalb bewusst ausgeschlossen).

## Doku & Hilfe

- `README.md`: Setup, Umgebungsvariablen, Deploy, Anlegen der Accounts.
- `CLAUDE.md`: Projektkonventionen für künftige KI-Sessions (Sprache, Stack, Ablage der
  Requirements unter `docs/requirements/`).
- Hilfe in der App (R23).

## Entscheidungsprotokoll

| # | Frage | Entscheidung | Begründung |
| --- | --- | --- | --- |
| 1 | Wer nutzt die App? | Alessandro und Partner:in, eigene Logins | Gemeinsame Verantwortung für die Familienfinanzen |
| 2 | Wie wird die KI eingesetzt? | Claude API, pseudonymisiert | Gute Qualität, sensible Kennungen verlassen den Server nicht |
| 3 | Erfolgskriterium | Fixkosten messbar senken | Kernanliegen des Tickets |
| 4 | Hosting | Supabase (EU) + Vercel | Zugriff für beide auch mobil, Auth/RLS fertig, kostenlos |
| 5 | Konten | Mehrere Sparkassen-Konten + Sparkassen-Mastercard Gold | Gesamtbild des Haushalts |
| 6 | Bewertungsablauf | KI schlägt vor, Menschen bestätigen, Korrektur wird Regel | Vertrauen in die Zahlen, die App lernt dazu |
| 7 | Einnahmen | Erkennen und manuell ergänzen | Deckt auch Geld auf nicht importierten Konten ab |
| 8 | Bedeutung von „Dringlichkeit“ | Beides: Dringlichkeit pro Ausgabe und Handlungspriorität pro Vertrag | Beide Sichten sind gewünscht |
| 9 | Kategorien | Feste Startliste, erweiterbar | Vergleichbarkeit über Monate |
| 10 | Umfang des KI-Coachs | Analyse + Vorschläge + Tarifvergleich per Websuche | Möglichst konkrete Hilfe beim Senken |
| 11 | Originaldateien | Sofort nach Import löschen | Datensparsamkeit |
| 12 | Vertragsfristen | Optional. Status aktiv / gekündigt zum / sofort beenden | Kein Pflegezwang, trotzdem nachverfolgbar |
| 13 | Skala Dringlichkeit | 3 Stufen | Schnell verständlich und korrigierbar |
| 14 | Auslöser Tarifvergleich | Auf Knopfdruck pro Vertrag | Kosten kontrolliert |
| 15 | Erinnerungen | Keine, nur Anzeige in der App | Bewusst einfach gehalten |
| 16 | Sonderfälle | Duplikate, Umbuchungen/Erstattungen, Jahreszahlungen, Zahlung trotz Kündigung | Ohne sie stimmen die Summen nicht |
| 17 | Rollen | Gleichberechtigt, keine Registrierung | Zwei Erwachsene, ein Haushalt |
| 18 | Startseite | Fixkosten-Cockpit | Passt zum Erfolgskriterium |
| 19 | Stack | Next.js + TypeScript + Supabase | Passt zu Vercel, React-Erfahrung vorhanden |
| 20 | Nicht-Ziele | Kündigen aus der App, Steuern/Investments/Kredite | Fokus auf Fixkosten |
| 21 | Etappen | 4 Etappen + PSD2 als Etappe 5 | Jede Etappe für sich nutzbar |
| 22 | Fehlerhafter Import | Vorschau mit Saldo-Prüfung vor dem Speichern | Keine falschen Daten in der Statistik |
| 23 | Aufbewahrung | Buchungen rollierend 24 Monate | Datensparsamkeit bei ausreichender Vergleichsbasis |
| 24 | PSD2 | Im Umfang als Etappe 5, Upload bleibt, nur kostenlose Anbieter | Komfort ohne laufende Kosten |
| 25 | Kreditkarte | Einzelbuchungen zählen, Sammelabbuchung nicht | Händlerdetails nötig für die Bewertung, keine Doppelzählung |
| 26 | Doku | README + CLAUDE.md + kurze Hilfe in der App | Partner:in versteht die Bewertungsstufen |
| 27 | Darf das Repo public sein? | Ja. Keine Secrets oder echten Daten im Repo, Secret-Check | Bedenkenlos teilbar, Schutz durch RLS und serverseitige Keys |
| 28 | Bank | Deutsche Sparkasse | Laut Nutzer |
| 29 | Importformat Girokonten | XML CAMT V8, gebucht + vorgemerkt; Kreditkarte CSV | Strukturiert, Mandatsdaten, mögliche Salden |
| 30 | Vorgemerkte Umsätze | Als vorläufig importieren, gesondert summieren, später ersetzen | Aktueller Stand ohne verfälschte Summen |
| 31 | Kündigungsfristen | Je Vertragsart vorbelegt, überschreibbar; „Frist naht“ 4 Wochen vor letztem Kündigungstag | Gängige gesetzliche Fristen, lieber früher warnen |
| 32 | Bankabruf | FinTS auf Knopfdruck, PIN nie gespeichert; Fallback Enable Banking | Einzige kostenlose Option inkl. Kreditkarte, ohne gespeicherte PIN |
| 33 | Beispieldateien | Liegen vor; CAMT ohne Salden → Vorschau mit Summenabgleich statt Saldo-Prüfung | Sparkassen-Export liefert keine Salden |
| 34 | Entwicklungs-Datenbank | Direkt gegen das Supabase-Cloud-Projekt (EU), Logik per Unit-Test ohne DB | Docker fehlt lokal, keine Installation nötig |
| 35 | Upload zwischen Vorschau und Übernehmen | Datei wird nie gespeichert. Der Server parst im Speicher, bei „Übernehmen“ schickt der Browser sie erneut | Kein Storage, nichts aufzuräumen, AK3 strukturell erfüllt |
| 36 | Duplikate und Vormerkungen | Fingerprint aus Konto, Datum, Betrag, Gegenpartei, Text, laufende Nummer. Vorgemerkt→gebucht (oder geänderte Vormerkung): gleiches Konto, gleicher Betrag, passende Gegenpartei, ±5 Tage, gleiche Zeile. Gelöscht werden nur Vormerkungen im Zeitraum der Datei | Robust, auch wenn die Sparkasse Referenzen ändert; Bewertung bleibt erhalten |
| 37 | Erkennung der Sammelabbuchung | Karte: positive Zeile „Lastschrift“. Giro: Abbuchung mit gleichem Betrag ±5 Tage, sonst Textmuster (Kreditkarte/Mastercard, nicht girocard) | Funktioniert in beiden Import-Reihenfolgen und ohne Kartenabrechnung |
| 38 | Erstattungen | Gutschrift derselben Gegenpartei, bis 90 Tage nach der Ausgabe, höchstens bis zum noch nicht erstatteten Betrag. Gutschriften auf der Karte sind immer Erstattungen | Teilerstattungen möglich, keine Doppelverrechnung |
| 39 | UI-Stack | Tailwind + shadcn/ui (Base UI) | Responsiv (R24) und zugängliche Komponenten |
| 40 | Repo | Public auf GitHub, Secret-Check per gitleaks vor Commit und Push | Push Protection greift nur bei öffentlichen Repos kostenlos |
| 41 | Registrierung abschalten | `auth.enable_signup = false`, E-Mail-Provider bleibt an | `auth.email.enable_signup = false` schaltet in Supabase den ganzen E-Mail-Login ab |
| 42 | IBAN in der Oberfläche | Nur maskiert („endet auf …“), Feld leer = unverändert | IBAN verlässt den Server nie |
| 43 | Gläubiger-IDs im Secret-Check | SEPA-Gläubiger-IDs (`..ZZZ…`) sind erlaubt | Keine Kontodaten, werden in Testdaten gebraucht |

## Offene Punkte

| # | Frage | Wer klärt | Blockiert |
| --- | --- | --- | --- |
| F1 | Import löschen macht Folgen nicht rückgängig: per Karte umgestufte Giro-Abbuchungen bleiben Sammelabbuchung, ersetzte Vormerkungen gehören dem neuen Import, überlappende Buchungen dem ersten. Soll Löschen das zurückdrehen? | Alessandro | – |
| F2 | Textmuster der Sammelabbuchung (Giro) und Gegenpartei bei Kartenzahlungen mit einem echten, gebuchten Sparkassen-Export prüfen. Die Beispieldatei enthält nur Vormerkungen | Alessandro | – |
| F3 | Fehlertexte in Produktion: Next ersetzt Server-Fehlermeldungen, der Hinweis „kein Haushalt zugeordnet“ erreicht den User nicht | – | – |
| F4 | Steuererstattung nach Steuerzahlung an dieselbe Stelle wird als Erstattung statt Einnahme erkannt. In Etappe 2 per Regel korrigierbar? | – | – |
| F5 | IBAN entfernen oder ändern macht die daraus erkannten Umbuchungen nicht rückgängig | – | – |
| F6 | Übernehmen beide gleichzeitig dieselbe Datei, kann der Import an `refund_of` scheitern und muss wiederholt werden | – | – |
| F7 | Vercel-Deploy steht noch aus: Repo github.com/fuggerstadt1907/haushalt-spar-app in Vercel importieren, Env-Variablen setzen, Site URL in Supabase eintragen (README, „Deploy“). Repo ist public, Secret Scanning und Push Protection sind aktiv | Alessandro | – |
| O2 | FinTS-Produkt-ID beantragen: Formular von fints.org/de/hersteller/produktregistrierung ausfüllen (Produktname, Version, Hersteller = dein Name, Produkttyp „Privatanwender-Software“/Webserver-Anwendung) und an registrierung@hbci-zka.de senden. Antwort in 10–15 Werktagen. Ablauf und Formularwerte: [Plan O2](../plans/o2-fints-produktregistrierung.md). Wird sie abgelehnt, gilt der Fallback Enable Banking. | Alessandro | Etappe 5 |
