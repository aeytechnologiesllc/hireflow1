/**
 * billing-webhook — Stripe tells HireFlow what was paid (pricing v9;
 * docs/BILLING.md).
 *
 * Reachable without sign-in (verify_jwt = false: Stripe has no HireFlow
 * sign-in), so nothing here is believed until the Stripe-Signature header
 * checks out against STRIPE_WEBHOOK_SECRET: an HMAC-SHA256 of the raw body,
 * compared in constant time, no more than 5 minutes old
 * (_shared/stripe.ts, verifyStripeSignature). A request that fails it is
 * answered 400 and touches nothing. Then handle.ts does the event, and the
 * database records its id first (a repeat changes nothing). A refund the
 * database says is owed (a payment with nothing given for it, a second
 * Unlimited) is made in Stripe from here, keyed by the event.
 *
 * While STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is missing: 503 "billing
 * is not set up", and nothing else.
 *
 * Stripe → Developers → Webhooks: endpoint
 *   https://yqklrkpptnhubsnijqze.supabase.co/functions/v1/billing-webhook
 * for checkout.session.completed, customer.subscription.created,
 * customer.subscription.updated, customer.subscription.deleted,
 * invoice.payment_failed and charge.refunded.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { NOT_SET_UP, stripeConfig, stripeRequest, verifyStripeSignature } from "../_shared/stripe.ts";
import { handleStripeEvent } from "./handle.ts";

/** Stripe's events are a few kilobytes; anything far bigger is not one. */
const MAX_BODY_BYTES = 512 * 1024;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const config = stripeConfig((key) => Deno.env.get(key));
  if (!config) return json({ error: NOT_SET_UP }, 503);

  // The raw body, exactly as Stripe signed it.
  const payload = await req.text();
  if (payload.length > MAX_BODY_BYTES) return json({ error: "too large" }, 413);

  const signature = await verifyStripeSignature(payload, req.headers.get("stripe-signature"), config.webhookSecret);
  if (!signature.ok) {
    console.warn("[billing-webhook] refused a request whose signature does not check out:", signature.reason);
    return json({ error: "signature", reason: signature.reason }, 400);
  }

  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return json({ error: "not JSON" }, 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });

  const outcome = await handleStripeEvent(event, {
    rpc: (fn, args) => admin.rpc(fn, args),
    stripe: (method, path, params, options) => stripeRequest(config, method, path, params ?? {}, options ?? {}),
  });
  return json(outcome.body, outcome.status);
});
