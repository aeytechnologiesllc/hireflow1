// Creates the Stripe Checkout Session for a $25 pack of 25 extra processed
// applicants. Requires the job to have a currently-active unlock (its
// 30-day window has not lapsed) -- see the migration header comment in
// 20260916170000_job_billing_schema.sql for why a pack cannot be bought
// against a lapsed unlock (the employer re-unlocks for $49 instead, which
// also grants a fresh 25 baseline and window).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getBillingFlags } from "../_shared/billingFlags.ts";
import { getOrCreateStripeCustomerId } from "../_shared/stripeCustomer.ts";
import { PACK_PRICE_CENTS } from "../_shared/jobBillingPricing.ts";

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
    if (!employerRole) throw new Error("Only the employer account owner can buy an applicant pack");

    const { data: job, error: jobError } = await supabaseAdmin
      .from("jobs")
      .select("id, title, employer_id")
      .eq("id", jobId)
      .maybeSingle();
    if (jobError || !job) throw new Error("Job not found");
    if (job.employer_id !== user.id) throw new Error("Only this job's owner can buy an applicant pack");

    const { data: activeUnlock } = await supabaseAdmin
      .from("job_unlocks")
      .select("id, expires_at")
      .eq("job_id", job.id)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!activeUnlock) {
      throw new Error("This job needs an active unlock before buying an applicant pack. Unlock it for $49 first.");
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2023-10-16" });
    const customerId = await getOrCreateStripeCustomerId(stripe, supabaseAdmin, user);

    const { data: packRow, error: insertError } = await supabaseAdmin
      .from("applicant_packs")
      .insert({
        job_id: job.id,
        employer_id: user.id,
        job_unlock_id: activeUnlock.id,
        status: "pending",
        amount_cents: PACK_PRICE_CENTS,
      })
      .select("id")
      .single();
    if (insertError || !packRow) throw new Error("Could not start the pack purchase");

    const origin = req.headers.get("origin") || Deno.env.get("APP_BASE_URL") || "https://hireflownow.com";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: PACK_PRICE_CENTS,
          product_data: {
            name: `Applicant pack — "${job.title}"`,
            description: "+25 processed applicants",
          },
        },
        quantity: 1,
      }],
      success_url: successUrl || `${origin}/applicants?roleId=${job.id}&pack=success`,
      cancel_url: cancelUrl || `${origin}/applicants?roleId=${job.id}&pack=canceled`,
      metadata: { kind: "pack", job_id: job.id, employer_id: user.id, applicant_pack_id: packRow.id },
    });

    await supabaseAdmin.from("applicant_packs").update({ stripe_checkout_session_id: session.id }).eq("id", packRow.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[purchase-applicant-pack-checkout] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
