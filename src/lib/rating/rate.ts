import { z } from "zod";
import { buildRatingRequest, type RatingRequestItem } from "./pseudonymize";
import { applyRule, buildRuleMap, findRule } from "./rules";
import { NECESSITIES, URGENCIES, type Category, type MerchantRule, type RatableTransaction, type RatingUpdate } from "./types";

/**
 * Austauschbare KI-Schnittstelle. Bekommt ausschließlich pseudonymisierte Einträge (R8) und die
 * Namen der Kategorien, liefert die Rohantwort. Geprüft wird die Antwort hier, nicht im Provider.
 */
export interface RatingProvider {
  rate(items: RatingRequestItem[], categories: string[]): Promise<unknown>;
}

export const ratingResponseSchema = z.object({
  bewertungen: z.array(
    z.object({
      ref: z.string(),
      kategorie: z.string(),
      notwendigkeit: z.enum(NECESSITIES),
      dringlichkeit: z.enum(URGENCIES),
      begruendung: z.string(),
    }),
  ),
});

export interface RatingResult {
  updates: RatingUpdate[];
  /** Ausgaben, die mangels Antwort unbewertet bleiben (KI-Fehler, Limit, ungültige Antwort). */
  unratedCount: number;
  /** Die KI war nicht erreichbar oder hat abgebrochen. */
  aiFailed: boolean;
}

export const BATCH_SIZE = 40;

/**
 * Bewertet Buchungen (R9–R11): zuerst Regeln, der Rest der Ausgaben geht gebündelt an die KI.
 * Bestätigte Buchungen fasst die Bewertung nicht an. Scheitert ein Batch, bleiben dessen und alle
 * folgenden Buchungen unbewertet, damit ein Ratenlimit nicht für jeden weiteren Batch zuschlägt.
 */
export async function rateTransactions({
  transactions,
  rules,
  categories,
  provider,
  privateNames = [],
  maxBatches = Infinity,
  onUpdates,
}: {
  transactions: RatableTransaction[];
  rules: MerchantRule[];
  categories: Category[];
  provider: RatingProvider | null;
  privateNames?: string[];
  maxBatches?: number;
  /** Wird nach den Regeln und nach jedem KI-Batch aufgerufen, damit Fertiges sofort gespeichert wird. */
  onUpdates?: (updates: RatingUpdate[]) => Promise<void>;
}): Promise<RatingResult> {
  const ruleMap = buildRuleMap(rules);
  const updates: RatingUpdate[] = [];
  const forAi: RatableTransaction[] = [];

  for (const tx of transactions) {
    if (tx.reviewStatus === "confirmed") continue;
    const rule = findRule(tx, ruleMap);
    const update = rule ? applyRule(tx, rule) : null;
    if (update) updates.push(update);
    else if (tx.kind === "expense" && tx.reviewStatus === "unrated") forAi.push(tx);
  }

  await onUpdates?.(updates);

  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
  let aiFailed = false;
  let aiRated = 0;

  for (let start = 0, batch = 0; start < forAi.length; start += BATCH_SIZE, batch++) {
    if (!provider || batch >= maxBatches) break;
    const chunk = forAi.slice(start, start + BATCH_SIZE);
    let raw: unknown;
    try {
      raw = await provider.rate(buildRatingRequest(chunk, privateNames), categories.map((c) => c.name));
    } catch (error) {
      console.error("KI-Bewertung fehlgeschlagen", error instanceof Error ? error.message : error);
      aiFailed = true;
      break;
    }
    const parsed = ratingResponseSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("KI-Antwort ungültig", parsed.error.message);
      continue;
    }
    const batchUpdates: RatingUpdate[] = [];
    const answered = new Set<string>();
    for (const answer of parsed.data.bewertungen) {
      const tx = chunk[Number(answer.ref) - 1];
      const categoryId = categoryByName.get(answer.kategorie.trim().toLowerCase());
      // Doppelte Antworten auf dieselbe Buchung: die erste gilt.
      if (!tx || !categoryId || answered.has(tx.id)) continue;
      answered.add(tx.id);
      batchUpdates.push({
        id: tx.id,
        categoryId,
        necessity: answer.notwendigkeit,
        urgency: answer.dringlichkeit,
        aiReason: answer.begruendung.trim().slice(0, 500),
        reviewStatus: "suggested",
        ratingSource: "ai",
      });
    }
    updates.push(...batchUpdates);
    aiRated += batchUpdates.length;
    await onUpdates?.(batchUpdates);
  }

  return { updates, unratedCount: forAi.length - aiRated, aiFailed };
}
