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

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

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

    // Get active voice credits (not expired, not voided)
    const { data: voiceCredits } = await supabaseAdmin
      .from("voice_credits")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true });

    // Calculate total voice minutes available
    const totalVoiceMinutes = (voiceCredits || []).reduce(
      (sum, credit) => sum + (credit.minutes_remaining || 0),
      0
    );

    // If no subscription exists, create trial
    if (!subscription) {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 7);

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

      // Create initial trial voice credits (5 minutes, expires with trial)
      await supabaseAdmin.from("voice_credits").insert({
        user_id: user.id,
        source: 'subscription',
        minutes_granted: 5,
        minutes_remaining: 5,
        expires_at: trialEnd.toISOString(),
      });

      return new Response(JSON.stringify({
        subscription: newSub,
        usage: { jobs_created: 0, applicants_received: 0, documents_sent: 0, team_members_added: 0, ai_analyses_used: 0, voice_minutes_used: 0 },
        limits: getPlanLimits('trial'),
        voiceCredits: {
          totalMinutesAvailable: 5,
          credits: [{
            id: 'initial',
            source: 'subscription',
            minutes_remaining: 5,
            expires_at: trialEnd.toISOString(),
          }],
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if trial expired
    if (subscription.status === 'trialing' && subscription.trial_end) {
      const trialEnd = new Date(subscription.trial_end);
      if (trialEnd < new Date()) {
        await supabaseAdmin.from("subscriptions").update({
          status: 'expired',
        }).eq('user_id', user.id);

        // Void all voice credits when trial expires
        await supabaseAdmin.from("voice_credits").update({
          status: 'voided',
        }).eq('user_id', user.id).eq('status', 'active');

        subscription.status = 'expired';
      }
    }

    return new Response(JSON.stringify({
      subscription,
      usage: usage || { jobs_created: 0, applicants_received: 0, documents_sent: 0, team_members_added: 0, ai_analyses_used: 0, voice_minutes_used: 0 },
      limits: getPlanLimits(subscription.plan_type),
      voiceCredits: {
        totalMinutesAvailable: totalVoiceMinutes,
        credits: (voiceCredits || []).map(c => ({
          id: c.id,
          source: c.source,
          pack_size: c.pack_size,
          minutes_remaining: c.minutes_remaining,
          minutes_granted: c.minutes_granted,
          expires_at: c.expires_at,
          granted_at: c.granted_at,
        })),
      },
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
        voiceMinutes: 150, // Changed from 500 to 150
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
        voiceMinutes: 5,
        hasAdvancedAnalytics: false,
        hasTeamPortal: false,
        hasDocuments: true,
        hasPrioritySupport: false,
        hasVoiceAssistant: false,
        hasVoiceInterviews: false,
        hasVoiceTrialAccess: true,
      };
  }
}
