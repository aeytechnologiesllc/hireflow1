import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId } = await req.json();
    
    if (!sessionId) {
      throw new Error("Missing session ID");
    }

    console.log("Verifying voice credits purchase for session:", sessionId);

    // Get authenticated user
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

    // Initialize Stripe and retrieve the session
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    console.log("Retrieved session:", { 
      id: session.id, 
      payment_status: session.payment_status,
      metadata: session.metadata 
    });

    // Verify this is a voice_credits purchase
    if (session.metadata?.type !== 'voice_credits') {
      throw new Error("Invalid session type - not a voice credits purchase");
    }

    // Verify payment was successful
    if (session.payment_status !== 'paid') {
      throw new Error("Payment not completed");
    }

    // Verify user matches
    if (session.metadata?.user_id !== user.id) {
      throw new Error("Session does not belong to authenticated user");
    }

    // Use admin client for database operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Check if credits were already granted for this payment (prevent duplicates)
    const paymentIntentId = typeof session.payment_intent === 'string' 
      ? session.payment_intent 
      : session.payment_intent?.id;

    const { data: existingCredits } = await supabaseAdmin
      .from("voice_credits")
      .select("id")
      .eq("stripe_payment_id", paymentIntentId)
      .limit(1);

    if (existingCredits && existingCredits.length > 0) {
      console.log("Credits already granted for payment:", paymentIntentId);
      return new Response(JSON.stringify({ 
        success: true, 
        already_granted: true,
        message: "Credits were already added" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate expiry (1 month from now)
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const minutes = parseInt(session.metadata.minutes);
    const packSize = session.metadata.pack_size;

    // Insert the voice credits
    const { error: insertError } = await supabaseAdmin
      .from("voice_credits")
      .insert({
        user_id: user.id,
        source: 'purchase',
        pack_size: packSize,
        minutes_granted: minutes,
        minutes_remaining: minutes,
        expires_at: expiresAt.toISOString(),
        stripe_payment_id: paymentIntentId,
        status: 'active',
      });

    if (insertError) {
      console.error("Error inserting voice credits:", insertError);
      throw new Error("Failed to add voice credits");
    }

    console.log("Voice credits granted successfully:", { 
      user_id: user.id, 
      minutes, 
      pack_size: packSize 
    });

    return new Response(JSON.stringify({ 
      success: true, 
      already_granted: false,
      minutes_added: minutes,
      message: `${minutes} voice minutes added successfully` 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error verifying voice credits purchase:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
