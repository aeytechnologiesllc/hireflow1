import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Regional pricing configuration
const regionalPricing = {
  // Tier 1 - Full Price (USD base)
  US: { currency: 'usd', growth: 4900, business: 9900 },
  CA: { currency: 'cad', growth: 6500, business: 13000 },
  GB: { currency: 'gbp', growth: 3900, business: 7900 },
  AU: { currency: 'aud', growth: 7500, business: 15000 },
  
  // Tier 2 - Europe (EUR)
  DE: { currency: 'eur', growth: 4500, business: 9000 },
  FR: { currency: 'eur', growth: 4500, business: 9000 },
  IT: { currency: 'eur', growth: 4500, business: 9000 },
  ES: { currency: 'eur', growth: 4500, business: 9000 },
  NL: { currency: 'eur', growth: 4500, business: 9000 },
  
  // Tier 3 - Reduced pricing for emerging markets
  IN: { currency: 'inr', growth: 99900, business: 199900 },
  BR: { currency: 'brl', growth: 9900, business: 19900 },
  MX: { currency: 'mxn', growth: 49900, business: 99900 },
  
  // Tier 4 - SEA/Africa (further reduced)
  PH: { currency: 'usd', growth: 1900, business: 3900 },
  NG: { currency: 'usd', growth: 1900, business: 3900 },
  KE: { currency: 'usd', growth: 1900, business: 3900 },
  
  // Default fallback
  DEFAULT: { currency: 'usd', growth: 4900, business: 9900 },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { planType, successUrl, cancelUrl, countryCode } = await req.json();
    
    console.log("Creating checkout session for plan:", planType, "country:", countryCode);

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

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Get regional pricing
    const pricing = regionalPricing[countryCode as keyof typeof regionalPricing] || regionalPricing.DEFAULT;
    const amount = planType === 'business' ? pricing.business : pricing.growth;

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

    // Create a price for the subscription
    const price = await stripe.prices.create({
      unit_amount: amount,
      currency: pricing.currency,
      recurring: { interval: 'month' },
      product_data: {
        name: `HireFlow ${planType === 'business' ? 'Business' : 'Growth'} Plan`,
      },
    });

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: price.id, quantity: 1 }],
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        user_id: user.id,
        plan_type: planType,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan_type: planType,
        },
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
