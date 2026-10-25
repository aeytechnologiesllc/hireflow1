/**
 * aiBudget.ts — one unit from today's platform-wide AI budget before each
 * OpenAI call (2026-10-25; supabase/migrations/20261025020000_ai_daily_budget.sql,
 * docs/LAUNCH-PLAN.md, Phase 1, task 3).
 *
 * Fails open, like _shared/rateLimit.ts: no settings (a Node test, a local
 * run), a network error or an unexpected answer all mean "go ahead". Only an
 * explicit false from ai_budget_take() refuses.
 */
/**
 * `business` (2026-10-25, Phase 5, task 4): the job's employer_id, or the
 * account that asked; the database counts the call against that business's
 * own daily budget too (a team member against the business they work for;
 * HireFlow's own business against its own larger day since Phase 7,
 * ai_platform_business_daily_call_cap). Anything that is not a uuid is ignored.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Units a call takes from the budget, by what it sends (the Phase 7 security
 * review, round 2: one unit paid for a prompt of any size; a 1.2 MB prompt
 * took one unit and went out whole). One unit per 40,000 characters of text
 * (an ordinary call, a long practice included, is one), plus one for each
 * file or image it carries; at most 100, the most ai_budget_take takes at once.
 */
export const BUDGET_CHARS_PER_UNIT = 40_000;

export function budgetUnitsForText(chars: number, attachments = 0): number {
  const text = Math.max(1, Math.ceil(Math.max(0, chars) / BUDGET_CHARS_PER_UNIT));
  return Math.min(100, text + Math.max(0, attachments));
}

/** budgetUnitsForText over chat messages (string content, or text / image / file parts). */
export function budgetUnitsFor(messages: readonly { content: unknown }[] | null | undefined): number {
  let chars = 0;
  let attachments = 0;
  for (const message of Array.isArray(messages) ? messages : []) {
    const content = message?.content;
    if (typeof content === "string") chars += content.length;
    else if (Array.isArray(content)) {
      for (const part of content as Array<{ type?: unknown; text?: unknown }>) {
        if (part && part.type === "text" && typeof part.text === "string") chars += part.text.length;
        else if (part) attachments += 1;
      }
    }
  }
  return budgetUnitsForText(chars, attachments);
}

export async function takeDailyAiBudget(calls = 1, business: string | null = null): Promise<boolean> {
  const env = (globalThis as { Deno?: { env?: { get(name: string): string | undefined } } }).Deno?.env;
  const url = env?.get("SUPABASE_URL");
  const key = env?.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return true;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/ai_budget_take`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(
        typeof business === "string" && UUID.test(business) ? { p_calls: calls, p_business: business } : { p_calls: calls },
      ),
    });
    if (!res.ok) return true;
    const data = await res.json();
    return data !== false;
  } catch {
    return true;
  }
}
