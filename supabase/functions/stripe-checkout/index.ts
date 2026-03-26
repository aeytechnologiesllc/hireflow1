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
    monthly: Deno.env.get("STRIPE_GROWTH_MONTHLY_PRICE_ID") || "price_1SeWKzJoMc2msNl4m1z9SDUL",
    yearly: Deno.env.get("STRIPE_GROWTH_YEARLY_PRICE_ID") || "price_1SeWL5JoMc2msNl4j8st2mmO",
  },
  business: {
    monthly: Deno.env.get("STRIPE_BUSINESS_MONTHLY_PRICE_ID") || "price_1SeWL7JoMc2msNl4380r2cSi",
    yearly: Deno.env.get("STRIPE_BUSINESS_YEARLY_PRICE_ID") || "price_1SeWL9JoMc2msNl4NNQVohgY",
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

    // Check if user has EVER had a subscription record (any status = not eligible for trial)
    const { data: existingSub } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    // If user has ANY subscription record, they are not eligible for a trial
    const hasSubscriptionRecord = !!existingSub;
    console.log("User has subscription record:", hasSubscriptionRecord);

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

    // SAFETY: Cancel ALL existing active/trialing subscriptions to prevent duplicates
    const existingActiveSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
    });
    
    const existingTrialingSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "trialing",
    });
    
    const allActiveSubscriptions = [
      ...existingActiveSubscriptions.data,
      ...existingTrialingSubscriptions.data,
    ];
    
    if (allActiveSubscriptions.length > 0) {
      console.log(`Found ${allActiveSubscriptions.length} existing subscription(s), canceling before new checkout...`);
      for (const sub of allActiveSubscriptions) {
        console.log(`Canceling subscription ${sub.id} (status: ${sub.status})`);
        await stripe.subscriptions.cancel(sub.id);
      }
      console.log(`Successfully canceled ${allActiveSubscriptions.length} subscription(s)`);
    }

    // Check Stripe for any historical subscriptions (for trial eligibility)
    let hasStripeSubscriptionHistory = false;
    const stripeSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 1,
    });
    hasStripeSubscriptionHistory = stripeSubscriptions.data.length > 0;
    console.log("User has Stripe subscription history:", hasStripeSubscriptionHistory);

    // Only eligible for trial if NO subscription record AND NO Stripe history
    const eligibleForTrial = !hasSubscriptionRecord && !hasStripeSubscriptionHistory;
    console.log("Eligible for trial:", eligibleForTrial);

    // Create checkout session in EMBEDDED mode
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      ui_mode: "embedded",
      subscription_data: {
        ...(eligibleForTrial ? { trial_period_days: 7 } : {}),
        metadata: {
          user_id: user.id,
          plan_type: planType,
          interval: interval,
        },
      },
      return_url: `${successUrl || `${req.headers.get("origin")}/dashboard?subscription=success`}&session_id={CHECKOUT_SESSION_ID}`,
      metadata: {
        user_id: user.id,
        plan_type: planType,
        interval: interval,
      },
    });

    console.log("Embedded checkout session created:", session.id);

    return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
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
