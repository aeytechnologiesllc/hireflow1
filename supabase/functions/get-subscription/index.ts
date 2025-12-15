import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

    // Get subscription
    const { data: subscription, error: subError } = await supabaseClient
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // Get usage
    const { data: usage, error: usageError } = await supabaseClient
      .from("subscription_usage")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // If no subscription exists, create trial
    if (!subscription) {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 7);

      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      const { data: newSub } = await supabaseAdmin.from("subscriptions").insert({
        user_id: user.id,
        plan_type: 'trial',
        status: 'trialing',
        trial_start: new Date().toISOString(),
        trial_end: trialEnd.toISOString(),
      }).select().single();

      // Create usage record
      await supabaseAdmin.from("subscription_usage").insert({
        user_id: user.id,
      });

      return new Response(JSON.stringify({
        subscription: newSub,
        usage: { jobs_created: 0, applicants_received: 0, documents_sent: 0, team_members_added: 0 },
        limits: getPlanLimits('trial'),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if trial expired
    if (subscription.status === 'trialing' && subscription.trial_end) {
      const trialEnd = new Date(subscription.trial_end);
      if (trialEnd < new Date()) {
        const supabaseAdmin = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );
        
        await supabaseAdmin.from("subscriptions").update({
          status: 'expired',
        }).eq('user_id', user.id);

        subscription.status = 'expired';
      }
    }

    return new Response(JSON.stringify({
      subscription,
      usage: usage || { jobs_created: 0, applicants_received: 0, documents_sent: 0, team_members_added: 0 },
      limits: getPlanLimits(subscription.plan_type),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error fetching subscription:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getPlanLimits(planType: string) {
  switch (planType) {
    case 'enterprise':
      return {
        jobs: -1,
        applicants: -1,
        documents: -1,
        teamMembers: -1,
        aiAnalyses: -1,
        voiceMinutes: 500,
        hasAdvancedAnalytics: true,
        hasTeamPortal: true,
        hasDocuments: true,
        hasPrioritySupport: true,
        hasVoiceAssistant: true,
        hasVoiceInterviews: true,
      };
    case 'business':
      return {
        jobs: -1,
        applicants: -1,
        documents: -1,
        teamMembers: -1,
        aiAnalyses: -1,
        voiceMinutes: 0,
        hasAdvancedAnalytics: true,
        hasTeamPortal: true,
        hasDocuments: true,
        hasPrioritySupport: true,
        hasVoiceAssistant: false,
        hasVoiceInterviews: false,
      };
    case 'growth':
      return {
        jobs: 3,
        applicants: 50,
        documents: 20,
        teamMembers: 0,
        aiAnalyses: 100,
        voiceMinutes: 0,
        hasAdvancedAnalytics: false,
        hasTeamPortal: false,
        hasDocuments: true,
        hasPrioritySupport: false,
        hasVoiceAssistant: false,
        hasVoiceInterviews: false,
      };
    default: // trial
      return {
        jobs: 1,
        applicants: 10,
        documents: 5,
        teamMembers: 0,
        aiAnalyses: 20,
        voiceMinutes: 5, // 5 minutes trial for voice features
        hasAdvancedAnalytics: false,
        hasTeamPortal: false,
        hasDocuments: true,
        hasPrioritySupport: false,
        hasVoiceAssistant: false, // Keep false to differentiate from Enterprise
        hasVoiceInterviews: false,
        hasVoiceTrialAccess: true, // Special flag for trial voice access
      };
  }
}
