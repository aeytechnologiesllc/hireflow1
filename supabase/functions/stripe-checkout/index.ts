import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Stripe price IDs (Enterprise removed - merged into Business)
const STRIPE_PRICES = {
  growth: {
    monthly: "price_1SeWKzJoMc2msNl4m1z9SDUL",
    yearly: "price_1SeWL5JoMc2msNl4j8st2mmO",
  },
  business: {
    monthly: "price_1SeWL7JoMc2msNl4380r2cSi",
    yearly: "price_1SeWL9JoMc2msNl4NNQVohgY",
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { planType, interval = "monthly", successUrl, cancelUrl } = await req.json();
    
    console.log("Creating checkout session for plan:", planType, "interval:", interval);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("User not authenticated");
    }

    // Use service role to check current subscription status
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Check if user has EVER had a subscription (trial or otherwise)
    const { data: existingSub } = await supabaseAdmin
      .from("subscriptions")
      .select("status, trial_start, trial_end")
      .eq("user_id", user.id)
      .single();

    // User has already used their trial if they have any subscription with trial dates
    const hasUsedTrial = existingSub && (
      existingSub.status === 'trialing' ||
      existingSub.trial_start !== null ||
      existingSub.trial_end !== null
    );
    console.log("User trial status:", hasUsedTrial ? "has used trial (will charge immediately)" : "new user (will get 7-day trial)");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Get the correct price ID based on plan and interval
    const priceId = STRIPE_PRICES[planType as keyof typeof STRIPE_PRICES]?.[interval as "monthly" | "yearly"];
    if (!priceId) {
      throw new Error(`Invalid plan type or interval: ${planType}/${interval}`);
    }

    // Check for existing customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId = customers.data[0]?.id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
    }

    // Create checkout session - only give trial to NEW users, not upgrading trial users
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      subscription_data: {
        // Skip trial for users who have already used their trial
        ...(hasUsedTrial ? {} : { trial_period_days: 7 }),
        metadata: {
          user_id: user.id,
          plan_type: planType,
          interval: interval,
        },
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        user_id: user.id,
        plan_type: planType,
        interval: interval,
      },
    });

    console.log("Checkout session created:", session.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error creating checkout session:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
