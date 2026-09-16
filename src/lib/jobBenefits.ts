/**
 * Normalize a job's benefits list before it hits jobs.benefits (text[]).
 *
 * Shared by every write path so the same rules apply regardless of where the
 * list came from: CreateJob.tsx / GuestJobCreator.tsx split a comma-separated
 * field with their own normalizeCommaSeparatedText/parseCommaSeparatedList
 * (free text a human typed and can already see rendered back to them), while
 * src/lib/jobFromFlow.ts maps the Ava JobBrief's `benefits: string[]`
 * (assembled turn-by-turn by mergeBriefFromTool from voice/typed tool-call
 * args, so it can arrive with whitespace, exact repeats, or a case-variant
 * repeat like "Health insurance" / "health insurance" from two different
 * turns) onto the same column. This module owns just that shape: trimmed,
 * deduped case-insensitively (first occurrence wins, so the exact casing the
 * employer said first is kept), empty strings dropped, and capped so a
 * malformed or runaway list can never make it into a public-facing column
 * unbounded.
 */

/** Generous but finite — real benefits lists run 3-10 items; this only guards against garbage input. */
export const MAX_BENEFITS = 20;

export function normalizeBenefits(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= MAX_BENEFITS) break;
  }
  return out;
}
