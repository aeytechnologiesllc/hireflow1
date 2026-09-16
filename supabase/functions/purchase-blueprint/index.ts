import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { isBlueprintBillingEnabled } from "../_shared/appSettings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[PURCHASE-BLUEPRINT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // The free tier has been open on purpose since 2026-09-04 -- nothing may
    // sit behind a paywall while billing is off. If this function is somehow
    // still reached (the UI hides the purchase button in that state), refuse
    // rather than charge someone for something included for free.
    const billingEnabled = await isBlueprintBillingEnabled(supabaseClient);
    if (!billingEnabled) {
      logStep("Billing is off — blueprint is free, refusing to open checkout");
      return new Response(
        JSON.stringify({ error: "The Improvement Blueprint is included at no charge right now — no purchase needed." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    // No hardcoded fallback: a wrong or stale price id charged the wrong
    // amount silently. With billing on, a missing price id must fail loudly
    // instead of falling back to a guess.
    const BLUEPRINT_PRICE_ID = Deno.env.get("STRIPE_BLUEPRINT_PRICE_ID");
    if (!BLUEPRINT_PRICE_ID) throw new Error("STRIPE_BLUEPRINT_PRICE_ID is not set");

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get applicationId from request body
    const { applicationId } = await req.json();
    if (!applicationId) throw new Error("applicationId is required");
    logStep("Application ID received", { applicationId });

    // Initialize Stripe
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if Stripe customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing Stripe customer", { customerId });
    }

    // Get origin for redirect URLs
    const origin = req.headers.get("origin") || "https://lovable.dev";
    logStep("Origin for redirects", { origin });

    // Create checkout session for one-time payment
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price: BLUEPRINT_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/applications/${applicationId}?blueprint_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/applications/${applicationId}?blueprint_cancelled=true`,
      metadata: {
        applicationId,
        userId: user.id,
        type: "improvement_blueprint",
      },
    });

    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in purchase-blueprint", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
