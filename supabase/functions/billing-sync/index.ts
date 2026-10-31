/**
 * billing-sync — reads Unlimited subscriptions again from Stripe before the
 * hourly close acts on them (pricing v9; docs/BILLING.md). What a run does is
 * in sync.ts.
 *
 * Called every hour (minute 7) by the database's own scheduler (pg_cron, the
 * `billing-sync` job), never by a browser. The job sends a secret it reads
 * from Vault; this asks the database whether it matches
 * (billing_sync_secret_matches, service role only), as document-cleanup does.
 * Without it: 401, and nothing is read. It takes no input but { all: true }
 * (every subscription Stripe still bills, after a webhook outage). The answer
 * is counts only.
 *
 * While STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is missing: 503 "billing
 * is not set up", and nothing else.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { NOT_SET_UP, stripeConfig, stripeRequest } from "../_shared/stripe.ts";
import { syncSubscriptions } from "./sync.ts";

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const given = req.headers.get("x-billing-sync-secret") ?? "";
  if (given.length < 32 || given.length > 256) return json({ error: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });
  const { data: matches, error: secretError } = await admin.rpc("billing_sync_secret_matches", { p_given: given });
  if (secretError || matches !== true) return json({ error: "unauthorized" }, 401);

  const config = stripeConfig((key) => Deno.env.get(key));
  if (!config) return json({ error: NOT_SET_UP }, 503);

  const body = (await req.json().catch(() => null)) as { all?: unknown } | null;
  const outcome = await syncSubscriptions(
    {
      rpc: (fn, args) => admin.rpc(fn, args),
      stripe: (method, path, params) => stripeRequest(config, method, path, params ?? {}),
      livemode: config.livemode,
    },
    body?.all === true,
  );
  return json(outcome.body, outcome.status);
});
