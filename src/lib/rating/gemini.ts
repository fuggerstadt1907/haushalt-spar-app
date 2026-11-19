import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { RatingRequestItem } from "./pseudonymize";
import type { RatingProvider } from "./rate";
import { NECESSITIES, URGENCIES } from "./types";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const REQUEST_TIMEOUT_MS = 25_000;

const INSTRUCTIONS = `Du bewertest Ausgaben eines Privathaushalts in Deutschland. Für jeden Eintrag:
- kategorie: genau eine der vorgegebenen Kategorien.
- notwendigkeit: must (Muss: Grundbedarf, Pflicht), should (Sollte: sinnvoll, aber verhandelbar),
  could (Kann: Komfort), dispensable (Verzichtbar: ohne Nachteil streichbar).
- dringlichkeit: immediate (Sofort nötig), could_wait (Hätte warten können), impulse (Impulskauf).
- begruendung: ein kurzer Satz auf Deutsch, höchstens 20 Wörter.
Beträge sind in Euro, negativ = Ausgabe. "haendlerkategorie" ist der Händlerkategorie-Code (MCC)
der Kreditkarte. Platzhalter wie [Person] oder [Nummer] ersetzen entfernte Angaben.
Antworte für jeden Eintrag mit seiner ref.`;

/** Gemini über die kostenlose Stufe (Entscheidung 46). Modell per GEMINI_MODEL austauschbar. */
export function createGeminiProvider(): RatingProvider | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  // Ohne Grenzen wiederholt das SDK bis zu 5-mal mit bis zu 60 s Pause und sprengt das Zeitlimit.
  // Lieber schnell scheitern: Die Buchungen bleiben dann unter „Zu prüfen“.
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: REQUEST_TIMEOUT_MS, retryOptions: { attempts: 2, initialDelay: 2, maxDelay: 5 } },
  });
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  return {
    async rate(items: RatingRequestItem[], categories: string[]) {
      const response = await ai.models.generateContent({
        model,
        contents: `Kategorien: ${JSON.stringify(categories)}\n\nEinträge:\n${JSON.stringify(items)}`,
        config: {
          systemInstruction: INSTRUCTIONS,
          temperature: 0.2,
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "object",
            properties: {
              bewertungen: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    ref: { type: "string" },
                    kategorie: { type: "string", enum: categories },
                    notwendigkeit: { type: "string", enum: [...NECESSITIES] },
                    dringlichkeit: { type: "string", enum: [...URGENCIES] },
                    begruendung: { type: "string" },
                  },
                  required: ["ref", "kategorie", "notwendigkeit", "dringlichkeit", "begruendung"],
                },
              },
            },
            required: ["bewertungen"],
          },
        },
      });
      return JSON.parse(response.text ?? "");
    },
  };
}
