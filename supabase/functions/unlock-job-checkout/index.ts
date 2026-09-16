// Creates the Stripe Checkout Session for a $49 job unlock (30 days, 25
// processed applicants included). One-time payment, not a subscription.
//
// setup_future_usage: 'off_session' on the payment intent saves the card so
// a later voice-interview overage ($2, once the job's 10 included
// interviews are used) can be charged off-session without asking the
// employer to re-enter a card — see deduct-voice-minutes and
// stripe-webhook's checkout.session.completed handler, which is where the
// saved payment method id actually gets persisted to
// subscriptions.stripe_default_payment_method_id.
//
// Uses Stripe's inline `price_data` rather than a pre-created Price object:
// the amount is a fixed, code-owned constant (UNLOCK_PRICE_CENTS), so there
// is nothing to keep in sync with a dashboard object and no Stripe Price id
// to provision before this can ship.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getBillingFlags } from "../_shared/billingFlags.ts";
import { getOrCreateStripeCustomerId } from "../_shared/stripeCustomer.ts";
import { UNLOCK_PRICE_CENTS } from "../_shared/jobBillingPricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobId, successUrl, cancelUrl } = await req.json();
    if (!jobId || typeof jobId !== "string") {
      return new Response(JSON.stringify({ error: "jobId is required" }), {
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

    // The free tier is deliberately open right now. This endpoint must
    // refuse outright while billing is off -- hiding the button in the UI
    // is not enough on its own, the server must also say no.
    const billing = await getBillingFlags(supabaseAdmin);
    if (!billing.billingEnabled) {
      return new Response(JSON.stringify({ error: "Billing is not enabled yet." }), {
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
    if (!employerRole) throw new Error("Only the employer account owner can unlock a job");

    const { data: job, error: jobError } = await supabaseAdmin
      .from("jobs")
      .select("id, title, employer_id")
      .eq("id", jobId)
      .maybeSingle();
    if (jobError || !job) throw new Error("Job not found");
    if (job.employer_id !== user.id) throw new Error("Only this job's owner can unlock it");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2023-10-16" });
    const customerId = await getOrCreateStripeCustomerId(stripe, supabaseAdmin, user);

    const { data: unlockRow, error: insertError } = await supabaseAdmin
      .from("job_unlocks")
      .insert({ job_id: job.id, employer_id: user.id, status: "pending", amount_cents: UNLOCK_PRICE_CENTS })
      .select("id")
      .single();
    if (insertError || !unlockRow) throw new Error("Could not start the unlock");

    const origin = req.headers.get("origin") || Deno.env.get("APP_BASE_URL") || "https://hireflownow.com";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: UNLOCK_PRICE_CENTS,
          product_data: {
            name: `Unlock "${job.title}"`,
            description: "30 days · 25 processed applicants included",
          },
        },
        quantity: 1,
      }],
      payment_intent_data: {
        setup_future_usage: "off_session",
        metadata: { kind: "unlock", job_id: job.id, employer_id: user.id, job_unlock_id: unlockRow.id },
      },
      success_url: successUrl || `${origin}/applicants?roleId=${job.id}&unlock=success`,
      cancel_url: cancelUrl || `${origin}/applicants?roleId=${job.id}&unlock=canceled`,
      metadata: { kind: "unlock", job_id: job.id, employer_id: user.id, job_unlock_id: unlockRow.id },
    });

    await supabaseAdmin.from("job_unlocks").update({ stripe_checkout_session_id: session.id }).eq("id", unlockRow.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[unlock-job-checkout] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
