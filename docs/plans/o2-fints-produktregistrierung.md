# Plan O2: FinTS-Produktregistrierung

> Status: offen · Gehört zu: [Requirements Haushalt-Spar-App](../requirements/haushalt-spar-app.md), O2 · Blockiert: Etappe 5 · Stand: 2026-11-18

## Worum es geht

Deutsche Banken lassen seit dem 01.08.2019 nur noch registrierte Software über FinTS zu. Die App
braucht deshalb eine eigene **FinTS-Produktregistrierungsnummer**. Sie wird bei jeder Verbindung
im Feld „Produktbezeichnung“ mitgeschickt. Ohne diese Nummer lehnt die Sparkasse den Abruf ab.

Die Registrierung vergibt die Deutsche Kreditwirtschaft (DK), derzeit kostenlos. Ein Produkt
wird einmal registriert und nicht bei jeder neuen Version.

## Vorbereitung

- [ ] Formular herunterladen: [fints.org → Produktregistrierung](https://www.fints.org/de/hersteller/produktregistrierung),
      Link „Registrierungsformular“ (`FinTS-Produktregistrierung_V1.0.4.pdf`). Der Download-Link
      läuft ab, deshalb immer über die Seite gehen.
- [ ] [FAQ zur Produktregistrierung](https://www.fints.org/de/hersteller/faq-produktregistrierung)
      kurz lesen.

## Antrag ausfüllen

Die Felder richten sich nach dem PDF. Das hier sind die vorgeschlagenen Werte:

| Angabe | Wert |
| --- | --- |
| Art des Antrags | Neuantrag (Feld „Registrierungsnummer“ bleibt leer) |
| Hersteller / Firma | eigener Name (Privatperson) |
| Anschrift, Kontakt | private Anschrift, E-Mail für die Antwort |
| Produktbezeichnung | Haushalt-Spar-App |
| Produktkategorie | Webserver-Anwendung (alternativ „Privatanwender-Software“, falls angeboten) |
| Kurzbeschreibung (falls verlangt) | Private Web-App eines einzelnen Haushalts zur Auswertung der eigenen Kontoumsätze. Nur Abruf von Umsätzen (keine Zahlungsaufträge), nur eigene Konten, kein Vertrieb an Dritte. |
| Genutzte Geschäftsvorfälle (falls verlangt) | Umsatzabruf Girokonto (HKCAZ/camt bzw. HKKAZ/MT940), Kreditkartenumsätze (DKKKU), Saldenabfrage (HKSAL), TAN-Verfahren per Decoupled/pushTAN (HKTAN) |

Hinweis: Firmenname, Produktbezeichnung und Kategorie fließen in die Nummer ein. Den
Produktnamen also jetzt festlegen und später nicht mehr ändern. Eine Änderung wäre ein neuer
Antrag.

## Ablauf

| # | Schritt | Wer | Dauer |
| --- | --- | --- | --- |
| 1 | Formular herunterladen und ausfüllen (Werte oben) | Alessandro | 15 Min. |
| 2 | Unterschreiben, falls verlangt, und als PDF an **registrierung@hbci-zka.de** senden. Betreff z. B. „FinTS-Produktregistrierung – Neuantrag Haushalt-Spar-App“ | Alessandro | 5 Min. |
| 3 | Auf die Antwort warten. Die DK nennt 10–15 Werktage. Nach 3 Wochen ohne Antwort freundlich nachfragen. | DK | 2–3 Wochen |
| 4 | Antwort ablegen: Registrierungsnummer + mitgeschickte Bankenliste (CSV mit BLZ und FinTS-Server-URLs). Beides **nicht ins Repo** (siehe unten). | Alessandro | 5 Min. |
| 5 | In der Bankenliste die BLZ der eigenen Sparkasse suchen und die FinTS-URL notieren. | Alessandro | 5 Min. |
| 6 | Verbindungstest mit lib-fints: Dialog aufbauen, pushTAN freigeben, Konten und Umsätze der letzten 30 Tage abrufen, Kreditkartenumsätze abrufen. | Claude (Etappe 5) | 1 Session |
| 7 | Ergebnis im Requirements-Dokument eintragen: O2 erledigt, Etappe 5 frei. | Claude | – |

Der Antrag läuft parallel zu den Etappen 1–4 und blockiert sie nicht. Am besten jetzt stellen,
dann liegt die Nummer vor, bevor Etappe 5 beginnt.

## Nach Erhalt: Ablage

- Die Registrierungsnummer kommt als Umgebungsvariable `FINTS_PRODUCT_ID` in `.env.local` und in
  die Vercel-Umgebungsvariablen. Sie ist kein Passwort. Die DK vergibt sie aber an dich als
  Hersteller, und wer sie missbraucht, fällt auf dein Produkt zurück. Deshalb gehört sie nicht
  ins öffentliche Repo (R27). In `.env.example` steht nur ein Platzhalter.
- Die Bankenliste der DK bleibt lokal (z. B. `fixtures/private/`). Im Code steht nur die eine
  FinTS-URL als Konfiguration.

## Was schiefgehen kann

| Fall | Reaktion |
| --- | --- |
| Antrag abgelehnt (z. B. weil Privatperson statt Firma) | Fallback aus R26: Girokonten über Enable Banking (restricted mode, kostenlos), Kreditkarte weiter per CSV-Upload. Das Requirements-Dokument wird entsprechend angepasst. |
| Rückfragen der DK | Beantworten. Kernaussage: rein private Nutzung, nur Lesezugriff auf eigene Konten, kein Vertrieb. |
| Keine Antwort nach 4 Wochen | Nachfassen per E-Mail. Etappen 1–4 laufen unabhängig weiter. |
| Verbindungstest mit lib-fints scheitert an der Sparkasse | Fallback python-fints als kleiner eigener Dienst. Die Registrierungsnummer gilt für das Produkt, nicht für die Bibliothek. |

## Quellen

- [fints.org – Produktregistrierung](https://www.fints.org/de/hersteller/produktregistrierung) (abgerufen 18.11.2026)
- [fints.org – FAQ Produktregistrierung](https://www.fints.org/de/hersteller/faq-produktregistrierung) (abgerufen 18.11.2026)
- [SWEN – FinTS-Konzept](https://maltewinckler.github.io/swen/concepts/fints/) (Erfahrungsbericht einer privaten Registrierung)
