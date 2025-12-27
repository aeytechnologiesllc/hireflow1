import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[VERIFY-BLUEPRINT-PURCHASE] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    // Create Supabase client with service role for inserting purchase record
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Create anon client for auth
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user?.id) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    // Get session_id from request body
    const { sessionId, applicationId } = await req.json();
    if (!sessionId) throw new Error("sessionId is required");
    if (!applicationId) throw new Error("applicationId is required");
    logStep("Session ID received", { sessionId, applicationId });

    // Initialize Stripe and verify session
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    logStep("Stripe session retrieved", { 
      status: session.payment_status,
      metadata: session.metadata 
    });

    // Verify payment was successful
    if (session.payment_status !== "paid") {
      throw new Error("Payment not completed");
    }

    // Verify the session metadata matches
    if (session.metadata?.applicationId !== applicationId) {
      throw new Error("Application ID mismatch");
    }

    if (session.metadata?.userId !== user.id) {
      throw new Error("User ID mismatch");
    }

    // Check if purchase already recorded (idempotency)
    const { data: existingPurchase } = await supabaseAdmin
      .from("blueprint_purchases")
      .select("id")
      .eq("stripe_session_id", sessionId)
      .single();

    if (existingPurchase) {
      logStep("Purchase already recorded", { purchaseId: existingPurchase.id });
      return new Response(JSON.stringify({ 
        success: true, 
        alreadyRecorded: true,
        purchaseId: existingPurchase.id 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Record the purchase
    const { data: purchase, error: insertError } = await supabaseAdmin
      .from("blueprint_purchases")
      .insert({
        user_id: user.id,
        application_id: applicationId,
        stripe_session_id: sessionId,
        amount_paid: session.amount_total || 199,
      })
      .select()
      .single();

    if (insertError) {
      logStep("Error inserting purchase", { error: insertError.message });
      throw new Error(`Failed to record purchase: ${insertError.message}`);
    }

    logStep("Purchase recorded successfully", { purchaseId: purchase.id });

    return new Response(JSON.stringify({ 
      success: true, 
      purchaseId: purchase.id 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in verify-blueprint-purchase", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
