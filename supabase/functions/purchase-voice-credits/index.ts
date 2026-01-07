import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Voice credit pack configurations
const VOICE_CREDIT_PACKS = {
  small: {
    minutes: 50,
    priceId: "price_1Sf3ZfJoMc2msNl4YoYccDUy",
  },
  medium: {
    minutes: 150,
    priceId: "price_1Sf3ZgJoMc2msNl4n7D8gzMl",
  },
  large: {
    minutes: 500,
    priceId: "price_1Sf3ZhJoMc2msNl49h4FHU8t",
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { packSize, successUrl, cancelUrl } = await req.json();
    
    console.log("Creating voice credits checkout for pack:", packSize);

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

    // Verify user has Business or Enterprise subscription
    const { data: subscription } = await supabaseClient
      .from("subscriptions")
      .select("plan_type, status")
      .eq("user_id", user.id)
      .single();

    if (!subscription || !['business', 'enterprise'].includes(subscription.plan_type) || subscription.status !== 'active') {
      throw new Error("Voice credits require an active Business subscription");
    }

    // Get pack configuration
    const pack = VOICE_CREDIT_PACKS[packSize as keyof typeof VOICE_CREDIT_PACKS];
    if (!pack) {
      throw new Error(`Invalid pack size: ${packSize}. Valid options: small, medium, large`);
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

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

    // Create checkout session for one-time payment
    // Note: {CHECKOUT_SESSION_ID} is a Stripe template variable that gets replaced with actual session ID
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: pack.priceId, quantity: 1 }],
      mode: "payment",
      success_url: successUrl || `${req.headers.get("origin")}/settings?tab=subscription&voice_credits=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${req.headers.get("origin")}/settings?tab=subscription&voice_credits=canceled`,
      metadata: {
        user_id: user.id,
        type: "voice_credits",
        pack_size: packSize,
        minutes: pack.minutes.toString(),
      },
    });

    console.log("Voice credits checkout session created:", session.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error creating voice credits checkout:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
