/**
 * The billing functions' argument names, read from the migration itself
 * (pricing v9; docs/BILLING.md), for the fake databases in
 * scripts/billing_webhook.test.mjs, scripts/billing_checkout.test.mjs,
 * scripts/billing_sync.test.mjs and scripts/delete_account.test.mjs.
 *
 * PostgREST finds a function by the names of the arguments it is sent: a name
 * the SQL does not have, or a required one left out, is "function not found"
 * in production while a fake that takes anything passes (the billing review,
 * finding 20). Each fake asks rpcArgsProblem() first and answers such a call
 * with an error, as PostgREST would.
 *
 * Not a test itself (no .test.mjs): imported by them.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = [
  "supabase/migrations/20261031100000_billing_pricing_v9.sql",
  // Called by billing functions' callers too, defined before v9.
  "supabase/migrations/20261025400000_daily_alert_claims.sql",
];

/** public.<name> → its arguments ({ name, hasDefault }), the last definition in the files winning. */
export function sqlSignatures(files = MIGRATIONS) {
  const out = new Map();
  for (const rel of files) {
    const sql = readFileSync(path.join(ROOT, rel), "utf8").replace(/--[^\n]*/g, " ");
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(([^)]*)\)/gi)) {
      const args = m[2].trim()
        ? m[2].split(",").map((part) => {
            const words = part.trim().split(/\s+/);
            return { name: words[0], hasDefault: /\bdefault\b|=/i.test(part) };
          })
        : [];
      out.set(m[1], args);
    }
  }
  return out;
}

/** Why PostgREST would not find public.<fn> called with these named arguments, or null when it would. */
export function rpcArgsProblem(signatures, fn, args) {
  const sig = signatures.get(fn);
  if (!sig) return `there is no SQL function public.${fn}`;
  const names = new Set(sig.map((a) => a.name));
  for (const key of Object.keys(args ?? {})) if (!names.has(key)) return `public.${fn} has no argument ${key}`;
  for (const a of sig) if (!a.hasDefault && !(a.name in (args ?? {}))) return `public.${fn} needs ${a.name}`;
  return null;
}
