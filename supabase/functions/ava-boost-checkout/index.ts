// Creates the Stripe Checkout Session for an Ava Boost purchase: HireFlow
// runs Facebook/Instagram job ads from HireFlow's OWN Meta ad account (the
// employer connects nothing). Flat $79/$149/$299 tiers, Employment special
// ad category (>= 15-mile radius, no narrow targeting -- enforced both here
// and in _shared/metaAdsClient.ts), and the card is only AUTHORIZED here
// (capture_method: 'manual') -- it is captured later by ava-boost-worker
// only once the ad is actually approved and live, or released if rejected
// twice or not live within 24h. See _shared/jobBillingPricing.ts's
// nextBoostWorkerAction for that state machine.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getBillingFlags } from "../_shared/billingFlags.ts";
import { getOrCreateStripeCustomerId } from "../_shared/stripeCustomer.ts";
import { isBoostTierCents, BOOST_MIN_RADIUS_MILES } from "../_shared/jobBillingPricing.ts";
import { createMetaGraphAdsClient } from "../_shared/metaAdsClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobId, tierCents, radiusMiles, successUrl, cancelUrl } = await req.json();
    if (!jobId || typeof jobId !== "string") {
      return new Response(JSON.stringify({ error: "jobId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isBoostTierCents(tierCents)) {
      return new Response(JSON.stringify({ error: "Choose a Boost tier: $79, $149 or $299." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error("User not authenticated");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const billing = await getBillingFlags(supabaseAdmin);
    if (!billing.boostEnabled) {
      return new Response(JSON.stringify({ error: "Ava Boost is not enabled yet." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Boost creates a real, HireFlow-run ad campaign -- without Meta
    // credentials configured there is nothing for ava-boost-worker to
    // submit to, so refuse the purchase rather than take a hold nobody can
    // ever turn into a live ad.
    if (!createMetaGraphAdsClient(Deno.env)) {
      return new Response(JSON.stringify({ error: "Ava Boost is not available right now." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: employerRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "employer")
      .maybeSingle();
    if (!employerRole) throw new Error("Only the employer account owner can buy Ava Boost");

    const { data: job, error: jobError } = await supabaseAdmin
      .from("jobs")
      .select("id, title, employer_id, latitude, longitude, is_remote, status")
      .eq("id", jobId)
      .maybeSingle();
    if (jobError || !job) throw new Error("Job not found");
    if (job.employer_id !== user.id) throw new Error("Only this job's owner can buy Ava Boost for it");
    if (job.status !== "published") throw new Error("Publish the job before boosting it");
    if (job.latitude == null || job.longitude == null) {
      throw new Error("This job needs a location before it can be boosted");
    }

    // Employment special ad category: the radius floor is enforced
    // server-side regardless of what the client sent.
    const radius = Math.max(BOOST_MIN_RADIUS_MILES, Number(radiusMiles) || BOOST_MIN_RADIUS_MILES);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2023-10-16" });
    const customerId = await getOrCreateStripeCustomerId(stripe, supabaseAdmin, user);

    const { data: orderRow, error: insertError } = await supabaseAdmin
      .from("boost_orders")
      .insert({
        job_id: job.id,
        employer_id: user.id,
        tier_cents: tierCents,
        status: "pending_payment",
        radius_miles: radius,
      })
      .select("id")
      .single();
    if (insertError || !orderRow) throw new Error("Could not start the Boost purchase");

    const origin = req.headers.get("origin") || Deno.env.get("APP_BASE_URL") || "https://hireflownow.com";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: tierCents,
          product_data: {
            name: `Ava Boost — "${job.title}"`,
            description: `Facebook & Instagram job ads, ~${radius}mi radius. Charged only once your ad is live.`,
          },
        },
        quantity: 1,
      }],
      payment_intent_data: {
        // Authorize now, capture later -- only once ava-boost-worker
        // confirms the ad is actually approved and live.
        capture_method: "manual",
        metadata: { kind: "boost", job_id: job.id, employer_id: user.id, boost_order_id: orderRow.id },
      },
      success_url: successUrl || `${origin}/applicants?roleId=${job.id}&boost=success`,
      cancel_url: cancelUrl || `${origin}/applicants?roleId=${job.id}&boost=canceled`,
      metadata: { kind: "boost", job_id: job.id, employer_id: user.id, boost_order_id: orderRow.id },
    });

    await supabaseAdmin.from("boost_orders").update({ stripe_checkout_session_id: session.id }).eq("id", orderRow.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[ava-boost-checkout] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
