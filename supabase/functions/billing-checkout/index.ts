/**
 * billing-checkout — a Stripe Checkout page for a job ($99, 30 days) or for
 * Unlimited ($299 a month) (pricing v9; docs/BILLING.md).
 *
 *   POST { kind: "job" | "unlimited", jobId?, ui? }  ->  { url } | { clientSecret, publishableKey }
 *
 * Paying inside HireFlow (2026-11-01): with ui: "embedded" the session is
 * Stripe's embedded form (ui_mode embedded_page, or embedded on an account
 * whose API version predates 2026-03-25) and the answer is its client secret
 * with Stripe's publishable key (STRIPE_PUBLISHABLE_KEY, a function secret),
 * which the page mounts with Stripe.js; without ui, or while that key is not
 * set, Stripe's hosted page and its address, as before. Either way each $99 payment gets an invoice
 * (invoice_creation) saying which job it was for, so it shows in Stripe's
 * billing page and the business's email.
 *
 * Who is asking comes from their sign-in; who pays is their business's owner
 * (a teammate who may create jobs pays for a job they may publish; only the
 * owner starts Unlimited). The database decides whether a checkout makes sense
 * (public.billing_checkout_check, service role only): billing on, a hiring
 * account, not the exempt platform account, the business's own job with no
 * days left on it, no Unlimited already, its email confirmed and not paused.
 * The price is found by its lookup key, never a hard-coded id. The Stripe
 * customer is the owner's, made once per mode (Idempotency-Key) and kept in
 * billing_customers. Checkout takes cards only (a payment that settles later
 * would be taken with nothing given). Checkout returns to the job (or
 * Settings) on HireFlow's own site; billing-webhook does the rest.
 *
 * Never two Unlimited, never two pages for one job: the database hands out
 * one claim at a time (billing_checkout_begin: Unlimited per business, $99 per
 * job), the earlier open page is expired in Stripe first, and for Unlimited
 * Stripe's own list of the customer's subscriptions is asked: one that is on,
 * or that Stripe is still trying to charge, is one already. The page is made
 * with an Idempotency-Key from the claim.
 *
 * While STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is missing: 503 "billing
 * is not set up".
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { requireSignedInUser } from "../_shared/signedInUser.ts";
import {
  JOB_PRICE_LOOKUP_KEY,
  NOT_SET_UP,
  UNLIMITED_PRICE_LOOKUP_KEY,
  priceByLookupKey,
  returnOrigin,
  STILL_BILLING,
  stripeConfig,
  stripeErrorParam,
  stripePublishableKey,
  stripeRequest,
  subscriptionsOfCustomer,
  type FormValue,
  type StripeReply,
} from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** The database's "no", as an answer the page can read (src/lib/billing.ts words each code). */
const REFUSALS: Record<string, { status: number; error: string }> = {
  billing_off: { status: 409, error: "Billing is off." },
  bad_kind: { status: 400, error: "That request could not be read." },
  not_hiring_account: { status: 403, error: "Only a hiring account can pay for jobs." },
  exempt: { status: 409, error: "Your account is exempt. Publish as usual." },
  job_not_found: { status: 404, error: "That job could not be found." },
  already_unlimited: { status: 409, error: "You already have Unlimited." },
  unlimited_active: { status: 409, error: "Unlimited covers this job. Publish it as usual." },
  job_live: { status: 409, error: "This job is already live." },
  job_has_time: { status: 409, error: "This job still has days paid for. Publish it as usual." },
  owner_only: { status: 403, error: "Ask the account owner: only they can start Unlimited." },
  unlimited_retrying: { status: 409, error: "Your Unlimited payment is being retried. Update your card in Settings, under Billing." },
  checkout_busy: { status: 409, error: "A checkout is already opening. Try again in a moment." },
  already_paid: { status: 409, error: "Your payment for this job went through. It goes live in a moment." },
  free_job_available: { status: 409, error: "Your first job is free. Publish it as usual." },
  email_not_verified: { status: 409, error: "Confirm your email first: press Publish in the job editor and we'll send a code." },
  business_suspended: { status: 403, error: "Your business is paused, so jobs can't be published right now. Open Help to message us." },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const config = stripeConfig((key) => Deno.env.get(key));
  if (!config) return json({ error: NOT_SET_UP, code: "not_set_up" }, 503);

  const caller = await requireSignedInUser(req, corsHeaders);
  if (caller.refusal) return caller.refusal;

  let body: { kind?: unknown; jobId?: unknown; ui?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "That request could not be read.", code: "bad_request" }, 400);
  }
  const kind = body.kind === "job" || body.kind === "unlimited" ? body.kind : null;
  if (!kind) return json({ error: "That request could not be read.", code: "bad_kind" }, 400);
  const jobId = typeof body.jobId === "string" && UUID.test(body.jobId) ? body.jobId : null;
  if (kind === "job" && !jobId) return json({ error: REFUSALS.job_not_found.error, code: "job_not_found" }, 404);
  // The form inside HireFlow needs Stripe's publishable key; without it, Stripe's own page.
  const publishableKey = stripePublishableKey((key) => Deno.env.get(key), config.livemode);
  const embedded = body.ui === "embedded" && publishableKey !== null;

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });

  const { data: checked, error: checkError } = await admin.rpc("billing_checkout_check", {
    p_caller: caller.userId,
    p_kind: kind,
    p_job: jobId,
    p_livemode: config.livemode,
  });
  if (checkError) {
    console.error("[billing-checkout] check failed:", checkError.message);
    return json({ error: "Payments are not available just now. Try again in a moment.", code: "failed" }, 500);
  }
  const check = (checked ?? {}) as Record<string, unknown>;
  if (check.ok !== true) {
    const reason = String(check.reason ?? "failed");
    const refusal = REFUSALS[reason] ?? { status: 500, error: "Payments are not available just now. Try again in a moment." };
    return json({ error: refusal.error, code: reason }, refusal.status);
  }
  const ownerId = String(check.owner_id ?? "");
  if (!UUID.test(ownerId)) return json({ error: "Payments are not available just now. Try again in a moment.", code: "failed" }, 500);

  // The price, by its lookup key (the same key in test and live mode).
  const lookupKey = kind === "job" ? JOB_PRICE_LOOKUP_KEY : UNLIMITED_PRICE_LOOKUP_KEY;
  const found = await priceByLookupKey(config, lookupKey);
  if (!found.reached) {
    console.error("[billing-checkout] Stripe did not answer the price lookup");
    return json({ error: "Payments are not available just now. Try again in a moment.", code: "stripe" }, 502);
  }
  const price = found.price;
  if (!price || price.recurring !== (kind === "unlimited")) {
    console.error(`[billing-checkout] no usable active price with lookup key ${lookupKey}`);
    return json({ error: NOT_SET_UP, code: "price_missing" }, 503);
  }

  // The owner's Stripe customer: the one kept, or a new one (made once, even
  // if two checkouts start at the same moment).
  let customerId = typeof check.customer_id === "string" && check.customer_id ? check.customer_id : null;
  if (!customerId) {
    const mode = config.livemode ? "live" : "test";
    const made = await stripeRequest(
      config,
      "POST",
      "/customers",
      {
        email: typeof check.email === "string" ? check.email : undefined,
        name: typeof check.company === "string" ? check.company : undefined,
        metadata: { owner_id: ownerId },
      },
      { idempotencyKey: `hireflow-customer-${ownerId}-${mode}` },
    );
    const madeId = typeof made.body?.id === "string" ? made.body.id : null;
    if (!made.ok || !madeId) {
      console.error("[billing-checkout] Stripe did not make the customer:", made.status, JSON.stringify(made.body?.error ?? null));
      return json({ error: "Payments are not available just now. Try again in a moment.", code: "stripe" }, 502);
    }
    const { data: kept, error: keepError } = await admin.rpc("billing_save_customer", { p_owner: ownerId, p_livemode: config.livemode, p_customer: madeId });
    if (keepError || typeof kept !== "string") {
      console.error("[billing-checkout] could not keep the customer:", keepError?.message);
      return json({ error: "Payments are not available just now. Try again in a moment.", code: "failed" }, 500);
    }
    customerId = kept;
  }

  // One claim at a time: Unlimited for the business, $99 for this job.
  const failed = (code: string, status = 502) =>
    json({ error: REFUSALS[code]?.error ?? "Payments are not available just now. Try again in a moment.", code }, REFUSALS[code]?.status ?? status);
  const { data: begun, error: beginError } = await admin.rpc("billing_checkout_begin", {
    p_owner: ownerId,
    p_kind: kind,
    p_job: jobId,
    p_livemode: config.livemode,
  });
  const claim = (begun ?? {}) as { ok?: unknown; reason?: unknown; claim?: unknown; earlier?: unknown };
  if (beginError || (claim.ok !== true && claim.reason !== "checkout_busy") || (claim.ok === true && typeof claim.claim !== "string")) {
    console.error("[billing-checkout] could not claim the checkout:", beginError?.message ?? JSON.stringify(begun));
    return failed("failed", 500);
  }
  if (claim.ok !== true) return failed("checkout_busy");
  const claimId = claim.claim as string;
  const release = async () => {
    const { error } = await admin.rpc("billing_checkout_opened", { p_claim: claimId, p_session: null });
    if (error) console.error("[billing-checkout] could not release the claim:", error.message);
  };

  // The earlier open page (Unlimited for this business, or $99 for this job):
  // expired in Stripe, so only the new one can be paid. One already paid is
  // left to the webhook.
  let earlierPaid = false;
  for (const earlier of Array.isArray(claim.earlier) ? claim.earlier : []) {
    if (typeof earlier !== "string" || !/^cs_[A-Za-z0-9_]+$/.test(earlier)) continue;
    const path = `/checkout/sessions/${encodeURIComponent(earlier)}`;
    const expired = await stripeRequest(config, "POST", `${path}/expire`);
    let status = expired.ok ? "expired" : null;
    if (!status) {
      const now = await stripeRequest(config, "GET", path);
      status = now.ok && (now.body?.status === "expired" || now.body?.status === "complete") ? String(now.body.status) : null;
    }
    if (!status) {
      console.error("[billing-checkout] could not expire the earlier checkout:", expired.status, JSON.stringify(expired.body?.error ?? null));
      await release();
      return failed("stripe");
    }
    const { error } = await admin.rpc("billing_checkout_closed", { p_session: earlier, p_status: status });
    if (error) console.error("[billing-checkout] could not record the earlier checkout:", error.message);
    if (status === "complete") earlierPaid = true;
  }
  if (earlierPaid && kind === "job") {
    await release();
    return failed("already_paid");
  }

  // Unlimited: never a second. Stripe's own list of the customer's
  // subscriptions decides (a webhook that is late or failing has not told the
  // database yet).
  if (kind === "unlimited" && typeof check.customer_id === "string" && check.customer_id) {
    const listed = await subscriptionsOfCustomer(config, customerId);
    if (!listed.reached) {
      console.error("[billing-checkout] Stripe did not list the customer's subscriptions");
      await release();
      return failed("stripe");
    }
    const live = listed.list.filter((sub) => STILL_BILLING.has(String(sub.status ?? "")));
    if (live.some((sub) => sub.status === "active" || sub.status === "trialing")) {
      await release();
      return failed("already_unlimited");
    }
    if (live.length) {
      await release();
      return failed("unlimited_retrying");
    }
  }

  // Back to HireFlow's own pages, never an address from the request.
  const origin = returnOrigin(req.headers.get("origin"), (key) => Deno.env.get(key));
  const back = jobId ? `${origin}/jobs/${jobId}` : `${origin}/settings`;
  const paid = `${back}?billing=${kind === "job" ? "paid" : "unlimited"}`;
  const metadata: Record<string, string> = { owner_id: ownerId, kind, ...(jobId ? { job_id: jobId } : {}) };
  // What the receipt and Stripe's billing page say it was for.
  const description = kind === "job" ? jobPaymentDescription(check.job_title) : `HireFlow Unlimited: every job live while it lasts, unlimited applicants`;

  const fields = {
    mode: kind === "job" ? "payment" : "subscription",
    customer: customerId,
    client_reference_id: ownerId,
    line_items: [{ price: price.id, quantity: 1 }],
    // Cards only: a payment that settles days later would be taken with nothing given.
    payment_method_types: ["card"],
    metadata,
    ...(kind === "job"
      ? {
          payment_intent_data: { metadata, description },
          // An invoice for each $99 payment, so it is in Stripe's billing page
          // and the business's email with what it paid for (subscriptions make
          // their own). Stripe charges a small fee per invoice (docs/BILLING.md).
          invoice_creation: { enabled: true, invoice_data: { description, metadata } },
        }
      : { subscription_data: { metadata, description } }),
  };
  // Inside HireFlow (Stripe's embedded form, when the page asked for it) or
  // Stripe's own page. Embedded: no redirect for a card (the page shows the
  // confirmation itself); the way back is only for a payment that needs one.
  // Stripe's 2026-03-25 API renamed "embedded" to "embedded_page": the account's
  // version decides (HireFlow's live account is on 2025-11-17, so "embedded"
  // first), and the other name is tried when Stripe refuses the first. Each name
  // has its own Idempotency-Key: Stripe keeps a key with the request it first
  // came with, a refused one too, and answered the second name with an
  // idempotency_error (the owner's first in-app payment, 2026-11-02).
  const pages: Array<[string, Record<string, FormValue>]> = embedded
    ? [
        ["embedded", { ui_mode: "embedded", return_url: paid, redirect_on_completion: "if_required" }],
        ["embedded_page", { ui_mode: "embedded_page", return_url: paid, redirect_on_completion: "if_required" }],
      ]
    : [["hosted", { success_url: paid, cancel_url: `${back}?billing=cancelled` }]];
  let session: StripeReply = { ok: false, status: 0, body: null };
  for (const [name, page] of pages) {
    session = await stripeRequest(
      config,
      "POST",
      "/checkout/sessions",
      { ...fields, ...page },
      { idempotencyKey: name === "hosted" ? `hireflow-checkout-${claimId}` : `hireflow-checkout-${claimId}-${name}` },
    );
    // Only a refused ui_mode tries the other name (Stripe made no page for it).
    if (session.ok || !(embedded && session.status === 400 && stripeErrorParam(session) === "ui_mode")) break;
  }
  const url = typeof session.body?.url === "string" ? session.body.url : null;
  const clientSecret = typeof session.body?.client_secret === "string" ? session.body.client_secret : null;
  const sessionId = typeof session.body?.id === "string" ? session.body.id : null;
  const usable = embedded ? !!clientSecret && /^cs_(?:test|live)_[A-Za-z0-9_]+$/.test(clientSecret) : !!url && /^https:\/\//.test(url);
  if (!session.ok || !usable || !sessionId) {
    console.error("[billing-checkout] Stripe did not make the checkout:", session.status, JSON.stringify(session.body?.error ?? null));
    await release();
    return failed("stripe");
  }
  const { error: openedError } = await admin.rpc("billing_checkout_opened", { p_claim: claimId, p_session: sessionId });
  if (openedError) console.error("[billing-checkout] could not record the checkout:", openedError.message);
  return json(embedded ? { clientSecret, publishableKey } : { url });
});

/** "HireFlow: “Chat agent” live for 30 days, unlimited applicants" (the job's title made plain, cut to 80). */
function jobPaymentDescription(title: unknown): string {
  const plain = typeof title === "string" ? title.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : "";
  return plain ? `HireFlow: “${plain}” live for 30 days, unlimited applicants` : "HireFlow: one job live for 30 days, unlimited applicants";
}
