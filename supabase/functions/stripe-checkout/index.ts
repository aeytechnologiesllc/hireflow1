/**
 * RETIRED — this endpoint is intentionally disabled.
 *
 * It sold the old Growth/Business SUBSCRIPTION plans (mode: "subscription",
 * hardcoded STRIPE_PRICES for growth/business monthly+yearly). The owner's
 * 2026-08-27 decision replaced that pricing entirely: no subscription —
 * posting a job is free, a job unlocks for $49 at applicant #4, +$25 per
 * applicant pack, $2 per voice interview past the first 10, and Ava Boost is
 * a separate flat $79/$149/$299 per-job ad spend. See
 * supabase/migrations/20260916170000_job_billing_schema.sql and
 * unlock-job-checkout / purchase-applicant-pack-checkout / ava-boost-checkout
 * for the functions that replaced this one.
 *
 * The free tier is deliberately open right now (no plan ever gated a
 * feature while billing is off) — this function selling a subscription on
 * top of that would have let someone pay for nothing. Kept as a tombstone,
 * same convention as check-email-exists, rather than deleted, so an
 * already-deployed copy is replaced with a refusal instead of lingering
 * live and still charging people for a plan the product no longer has.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({
      error: "gone",
      message:
        "stripe-checkout (Growth/Business subscriptions) has been retired. HireFlow no longer sells a subscription — see unlock-job-checkout, purchase-applicant-pack-checkout and ava-boost-checkout.",
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
