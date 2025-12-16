import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    const signature = req.headers.get("stripe-signature");
    const body = await req.text();
    
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    
    let event: Stripe.Event;
    
    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } else {
      event = JSON.parse(body);
    }

    console.log("Webhook event received:", event.type);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const sessionType = session.metadata?.type;

        // Handle voice credits purchase
        if (sessionType === "voice_credits" && userId) {
          const packSize = session.metadata?.pack_size;
          const minutes = parseInt(session.metadata?.minutes || "0", 10);
          
          // Calculate expiration date (6 months from now)
          const expiresAt = new Date();
          expiresAt.setMonth(expiresAt.getMonth() + 6);

          // Insert voice credits
          const { error: creditsError } = await supabaseAdmin.from("voice_credits").insert({
            user_id: userId,
            source: 'purchase',
            pack_size: packSize,
            minutes_granted: minutes,
            minutes_remaining: minutes,
            expires_at: expiresAt.toISOString(),
            stripe_payment_id: session.payment_intent as string,
          });

          if (creditsError) {
            console.error("Error inserting voice credits:", creditsError);
          } else {
            console.log("Voice credits added for user:", userId, "minutes:", minutes);
          }
          break;
        }

        // Handle subscription checkout
        if (userId && session.subscription) {
          const planType = session.metadata?.plan_type;
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          
          await supabaseAdmin.from("subscriptions").upsert({
            user_id: userId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            plan_type: planType || 'growth',
            status: 'active',
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            amount: subscription.items.data[0]?.price?.unit_amount,
            currency: subscription.items.data[0]?.price?.currency?.toUpperCase(),
          }, { onConflict: 'user_id' });

          // If upgrading to Enterprise, grant initial 150 minutes
          if (planType === 'enterprise') {
            const expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + 6);

            await supabaseAdmin.from("voice_credits").insert({
              user_id: userId,
              source: 'subscription',
              minutes_granted: 150,
              minutes_remaining: 150,
              expires_at: expiresAt.toISOString(),
            });
            console.log("Initial Enterprise voice credits granted for user:", userId);
          }

          console.log("Subscription activated for user:", userId);
        }
        break;
      }

      case "invoice.paid": {
        // Handle subscription renewal - grant new monthly credits for Enterprise
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription && invoice.billing_reason === 'subscription_cycle') {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          const userId = subscription.metadata?.user_id;
          const planType = subscription.metadata?.plan_type;

          if (userId && planType === 'enterprise') {
            const expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + 6);

            await supabaseAdmin.from("voice_credits").insert({
              user_id: userId,
              source: 'subscription',
              minutes_granted: 150,
              minutes_remaining: 150,
              expires_at: expiresAt.toISOString(),
            });
            console.log("Monthly Enterprise voice credits granted for user:", userId);
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.user_id;
        const newPlanType = subscription.metadata?.plan_type;

        if (userId) {
          // Get current subscription to check for downgrade
          const { data: currentSub } = await supabaseAdmin
            .from("subscriptions")
            .select("plan_type")
            .eq("user_id", userId)
            .single();

          // Check if downgrading from Enterprise
          if (currentSub?.plan_type === 'enterprise' && newPlanType !== 'enterprise') {
            // Void all voice credits on downgrade
            await supabaseAdmin.from("voice_credits").update({
              status: 'voided',
            }).eq('user_id', userId).eq('status', 'active');
            console.log("Voice credits voided due to Enterprise downgrade for user:", userId);
          }

          await supabaseAdmin.from("subscriptions").update({
            status: subscription.status,
            plan_type: newPlanType || 'growth',
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
          }).eq('user_id', userId);

          console.log("Subscription updated for user:", userId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.user_id;

        if (userId) {
          // Void all voice credits when subscription is canceled
          await supabaseAdmin.from("voice_credits").update({
            status: 'voided',
          }).eq('user_id', userId).eq('status', 'active');

          await supabaseAdmin.from("subscriptions").update({
            status: 'canceled',
            plan_type: 'trial',
          }).eq('user_id', userId);

          console.log("Subscription canceled and credits voided for user:", userId);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
        const userId = subscription.metadata?.user_id;

        if (userId) {
          await supabaseAdmin.from("subscriptions").update({
            status: 'past_due',
          }).eq('user_id', userId);

          console.log("Payment failed for user:", userId);
        }
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
