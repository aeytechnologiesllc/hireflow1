/**
 * billing-portal — Stripe's own billing page for a business owner: manage or
 * cancel Unlimited, change the card, see and download invoices and receipts
 * (pricing v9; docs/BILLING.md).
 *
 *   POST {}  ->  { url }
 *
 * The owner only (public.billing_portal_check, service role only): never a
 * teammate, never the exempt platform account, and only once the owner has a
 * Stripe customer in this mode (anyone who has paid). Back to Settings on
 * HireFlow's own site.
 *
 * While STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is missing: 503 "billing
 * is not set up".
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { requireSignedInUser } from "../_shared/signedInUser.ts";
import { NOT_SET_UP, returnOrigin, stripeConfig, stripeRequest } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const REFUSALS: Record<string, { status: number; error: string }> = {
  owner_only: { status: 403, error: "Only the account owner can manage billing." },
  exempt: { status: 409, error: "Your account is exempt." },
  no_customer: { status: 404, error: "There is nothing to manage yet: no payment has been made." },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const config = stripeConfig((key) => Deno.env.get(key));
  if (!config) return json({ error: NOT_SET_UP, code: "not_set_up" }, 503);

  const caller = await requireSignedInUser(req, corsHeaders);
  if (caller.refusal) return caller.refusal;

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });
  const { data: checked, error } = await admin.rpc("billing_portal_check", { p_caller: caller.userId, p_livemode: config.livemode });
  if (error) {
    console.error("[billing-portal] check failed:", error.message);
    return json({ error: "Billing is not available just now. Try again in a moment.", code: "failed" }, 500);
  }
  const check = (checked ?? {}) as Record<string, unknown>;
  if (check.ok !== true || typeof check.customer_id !== "string") {
    const reason = String(check.reason ?? "failed");
    const refusal = REFUSALS[reason] ?? { status: 500, error: "Billing is not available just now. Try again in a moment." };
    return json({ error: refusal.error, code: reason }, refusal.status);
  }

  const origin = returnOrigin(req.headers.get("origin"), (key) => Deno.env.get(key));
  const session = await stripeRequest(config, "POST", "/billing_portal/sessions", {
    customer: check.customer_id,
    return_url: `${origin}/settings?billing=back`,
  });
  const url = typeof session.body?.url === "string" ? session.body.url : null;
  if (!session.ok || !url || !/^https:\/\//.test(url)) {
    console.error("[billing-portal] Stripe did not open the portal:", session.status, JSON.stringify(session.body?.error ?? null));
    return json({ error: "Billing is not available just now. Try again in a moment.", code: "stripe" }, 502);
  }
  return json({ url });
});
