import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[SYNC-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    // Get authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Initialize Stripe
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Find customer by email
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      logStep("No Stripe customer found");
      return new Response(JSON.stringify({ 
        synced: false, 
        message: "No Stripe customer found for this email" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    // Get active subscriptions from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    // Also check for trialing subscriptions
    const trialingSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "trialing",
      limit: 1,
    });

    const allSubscriptions = [...subscriptions.data, ...trialingSubscriptions.data];
    
    if (allSubscriptions.length === 0) {
      logStep("No active or trialing subscription found in Stripe");
      return new Response(JSON.stringify({ 
        synced: false, 
        message: "No active subscription found in Stripe" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Deduplication: if multiple active subs exist, cancel all but the newest
    if (allSubscriptions.length > 1) {
      allSubscriptions.sort((a, b) => b.created - a.created);
      const toCancel = allSubscriptions.slice(1);
      for (const sub of toCancel) {
        logStep("Canceling duplicate subscription", { id: sub.id, created: sub.created });
        await stripe.subscriptions.cancel(sub.id);
      }
      logStep("Deduplication complete", { kept: allSubscriptions[0].id, canceled: toCancel.length });
    }

    const subscription = allSubscriptions[0];
    logStep("Found Stripe subscription", { 
      subscriptionId: subscription.id, 
      status: subscription.status 
    });

    // Determine plan type from price
    const priceId = subscription.items.data[0]?.price?.id;
    let planType = "growth";
    
    // Map price IDs to plan types - Updated to match current Stripe prices
    const businessPriceIds = [
      "price_1SeWL7JoMc2msNl4380r2cSi", // business monthly
      "price_1SeWL9JoMc2msNl4NNQVohgY", // business yearly
    ];
    
    const growthPriceIds = [
      "price_1SeWKzJoMc2msNl4m1z9SDUL", // growth monthly
      "price_1SeWL5JoMc2msNl4j8st2mmO", // growth yearly
    ];
    
    if (priceId && businessPriceIds.includes(priceId)) {
      planType = "business";
    } else if (priceId && growthPriceIds.includes(priceId)) {
      planType = "growth";
    } else if (priceId) {
      logStep("Unknown price ID, defaulting to growth", { priceId });
    }
    logStep("Determined plan type", { planType, priceId });

    // Use admin client to update database
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Upsert subscription data
    const subscriptionData = {
      user_id: user.id,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      plan_type: planType,
      status: subscription.status === "trialing" ? "trialing" : "active",
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      // Clear trial fields if they're now a paying customer
      trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
      trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      amount: subscription.items.data[0]?.price?.unit_amount || null,
      currency: subscription.currency?.toUpperCase() || "USD",
      updated_at: new Date().toISOString(),
    };

    logStep("Upserting subscription data", subscriptionData);

    const { error: upsertError } = await supabaseAdmin
      .from("subscriptions")
      .upsert(subscriptionData, { onConflict: "user_id" });

    if (upsertError) {
      logStep("ERROR upserting subscription", { error: upsertError.message });
      throw new Error(`Failed to update subscription: ${upsertError.message}`);
    }

    logStep("Subscription synced successfully");

    return new Response(JSON.stringify({ 
      synced: true, 
      subscription: {
        plan_type: planType,
        status: subscription.status,
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in sync-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
