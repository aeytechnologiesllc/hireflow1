/**
 * aiBudget.ts — one unit from today's platform-wide AI budget before each
 * OpenAI call (2026-10-25; supabase/migrations/20261025020000_ai_daily_budget.sql,
 * docs/LAUNCH-PLAN.md, Phase 1, task 3).
 *
 * Fails open, like _shared/rateLimit.ts: no settings (a Node test, a local
 * run), a network error or an unexpected answer all mean "go ahead". Only an
 * explicit false from ai_budget_take() refuses.
 */
export async function takeDailyAiBudget(calls = 1): Promise<boolean> {
  const env = (globalThis as { Deno?: { env?: { get(name: string): string | undefined } } }).Deno?.env;
  const url = env?.get("SUPABASE_URL");
  const key = env?.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return true;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/ai_budget_take`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_calls: calls }),
    });
    if (!res.ok) return true;
    const data = await res.json();
    return data !== false;
  } catch {
    return true;
  }
}
