import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { hasSubscriptionBypassForUser } from "../_shared/subscriptionBypass.ts";

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

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      throw new Error("Missing bearer token");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      throw new Error("User not authenticated");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Resolve effective account context from roles.
    const { data: roleRows, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    if (roleError) {
      console.error("Error fetching roles:", roleError);
    }

    const roles = new Set((roleRows || []).map((row) => row.role));
    const isCandidateOnly = roles.size > 0 && roles.has("candidate") && !roles.has("employer") && !roles.has("team_member");
    const isTeamMemberRole = roles.has("team_member") && !roles.has("employer");
    let teamAccess = {
      isTeamMember: false,
      status: "none",
      reason: null as "revoked" | null,
      employerId: null as string | null,
    };

    if (isCandidateOnly) {
      console.log("Candidate user detected — returning free access, skipping all subscription logic");
      return new Response(JSON.stringify({
        subscription: {
          id: 'candidate_free',
          user_id: user.id,
          plan_type: 'candidate_free',
          status: 'active',
          onboarding_completed: true,
          trial_end: null,
          trial_start: null,
          current_period_end: null,
          current_period_start: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        usage: { jobs_created: 0, applicants_received: 0, documents_sent: 0, team_members_added: 0, ai_analyses_used: 0, voice_minutes_used: 0 },
        limits: {
          jobs: -1,
          applicants: -1,
          documents: -1,
          teamMembers: -1,
          aiAnalyses: -1,
          voiceMinutes: 0,
          hasAdvancedAnalytics: false,
          hasTeamPortal: false,
          hasDocuments: false,
          hasPrioritySupport: false,
          hasVoiceAssistant: false,
          hasVoiceInterviews: false,
        },
        voiceCredits: { totalMinutesAvailable: 0, credits: [] },
        teamAccess,
        subscriptionBypass: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let effectiveOwnerId = user.id;

    if (isTeamMemberRole) {
      const { data: activeMembership, error: membershipError } = await supabaseAdmin
        .from("team_members")
        .select("employer_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (membershipError) {
        console.error("Error fetching team membership:", membershipError);
      } else if (activeMembership?.employer_id) {
        effectiveOwnerId = activeMembership.employer_id;
        teamAccess = {
          isTeamMember: true,
          status: "active",
          reason: null,
          employerId: activeMembership.employer_id,
        };
      } else {
        const { data: latestMembership, error: latestMembershipError } = await supabaseAdmin
          .from("team_members")
          .select("employer_id, status")
          .eq("user_id", user.id)
          .order("joined_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestMembershipError) {
          console.error("Error fetching latest team membership:", latestMembershipError);
        }

        teamAccess = {
          isTeamMember: true,
          status: "revoked",
          reason: "revoked",
          employerId: latestMembership?.employer_id ?? null,
        };

        return new Response(JSON.stringify({
          subscription: null,
          usage: { jobs_created: 0, applicants_received: 0, documents_sent: 0, team_members_added: 0, ai_analyses_used: 0, voice_minutes_used: 0 },
          limits: getNoAccessLimits(),
          voiceCredits: { totalMinutesAvailable: 0, credits: [] },
          teamAccess,
          subscriptionBypass: false,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const subscriptionBypass = await hasSubscriptionBypassForUser(
      supabaseAdmin,
      effectiveOwnerId,
    );

    // Get subscription — use admin client for consistent reads after sync writes
    const { data: subscription, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", effectiveOwnerId)
      .maybeSingle();

    if (subError) {
      console.error("Error fetching subscription:", subError);
    }
    console.log("Subscription read result:", { status: subscription?.status, plan_type: subscription?.plan_type });

    // Calculate actual usage from tables
    const { count: jobsCount } = await supabaseAdmin
      .from("jobs")
      .select("*", { count: "exact", head: true })
      .eq("employer_id", effectiveOwnerId);

    const { data: userJobs } = await supabaseAdmin
      .from("jobs")
      .select("id")
      .eq("employer_id", effectiveOwnerId);
    
    const jobIds = (userJobs || []).map(j => j.id);
    
    let applicantsCount = 0;
    let documentsCount = 0;
    let aiAnalysesCount = 0;
    
    if (jobIds.length > 0) {
      const { count: appCount } = await supabaseAdmin
        .from("applications")
        .select("*", { count: "exact", head: true })
        .in("job_id", jobIds);
      applicantsCount = appCount || 0;

      // Get applications for document count
      const { data: apps } = await supabaseAdmin
        .from("applications")
        .select("id")
        .in("job_id", jobIds);
      
      const appIds = (apps || []).map(a => a.id);
      if (appIds.length > 0) {
        const { count: generatedDocCount } = await supabaseAdmin
          .from("documents")
          .select("*", { count: "exact", head: true })
          .in("application_id", appIds);
        documentsCount += generatedDocCount || 0;

        // Count AI analyses (applications with ai_score)
        const { count: analysisCount } = await supabaseAdmin
          .from("applications")
          .select("*", { count: "exact", head: true })
          .in("job_id", jobIds)
          .not("ai_score", "is", null);
        aiAnalysesCount = analysisCount || 0;
      }
    }

    const { count: documentRequestCount } = await supabaseAdmin
      .from("document_requests")
      .select("*", { count: "exact", head: true })
      .eq("employer_id", effectiveOwnerId);

    documentsCount += documentRequestCount || 0;

    const { count: teamCount } = await supabaseAdmin
      .from("team_members")
      .select("*", { count: "exact", head: true })
      .eq("employer_id", effectiveOwnerId)
      .eq("status", "active");

    const usage = {
      jobs_created: jobsCount || 0,
      applicants_received: applicantsCount,
      documents_sent: documentsCount,
      team_members_added: teamCount || 0,
      ai_analyses_used: aiAnalysesCount,
      // Voice minutes used is derived from credits (granted - remaining)
      voice_minutes_used: 0,
    };

    // Get voice credits
    // - For UI balance: only ACTIVE, non-expired credits
    // - For usage: include exhausted credits so we can compute used = granted - remaining
    const { data: voiceCreditsForUsage } = await supabaseAdmin
      .from("voice_credits")
      .select("*")
      .eq("user_id", effectiveOwnerId)
      .in("status", ["active", "exhausted"])
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true });

    let { data: voiceCredits } = await supabaseAdmin
      .from("voice_credits")
      .select("*")
      .eq("user_id", effectiveOwnerId)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true });

    // Usage: Used = granted - remaining (bounded to avoid negative)
    const totalVoiceGranted = (voiceCreditsForUsage || []).reduce(
      (sum, credit) => sum + (credit.minutes_granted || 0),
      0
    );

    const totalVoiceRemainingAll = (voiceCreditsForUsage || []).reduce(
      (sum, credit) => sum + (credit.minutes_remaining || 0),
      0
    );

    usage.voice_minutes_used = Math.max(0, totalVoiceGranted - totalVoiceRemainingAll);

    // Balance: total minutes currently available
    let totalVoiceMinutes = (voiceCredits || []).reduce(
      (sum, credit) => sum + (credit.minutes_remaining || 0),
      0
    );

    // AUTO-PROVISION: If user has no active credits, check if they should have some
    const isTrial = !subscriptionBypass && subscription?.status === 'trialing';
    const isPaidVoicePlan = !subscriptionBypass && (subscription?.plan_type === 'business' || subscription?.plan_type === 'enterprise') && subscription?.status === 'active';
    
    // Self-healing: Provision monthly credits for paid plans if balance is unexpectedly 0
    if (isPaidVoicePlan && totalVoiceMinutes <= 0) {
      console.log("Paid voice plan has 0 balance - checking for missing subscription credits");
      
      // Check if a subscription credit for current period already exists (any status)
      const periodEnd = subscription.current_period_end 
        ? new Date(subscription.current_period_end).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const { data: existingPeriodCredit } = await supabaseAdmin
        .from("voice_credits")
        .select("id")
        .eq("user_id", effectiveOwnerId)
        .eq("source", "subscription")
        .eq("expires_at", periodEnd)
        .maybeSingle();
      
      if (!existingPeriodCredit) {
        console.log("No subscription credit found for current period - auto-provisioning 30 minutes");
        
        const { data: insertedCredit, error: insertError } = await supabaseAdmin
          .from("voice_credits")
          .insert({
            user_id: effectiveOwnerId,
            source: 'subscription',
            pack_size: 'monthly',
            minutes_granted: 30,
            minutes_remaining: 30,
            expires_at: periodEnd,
            status: 'active',
          })
          .select("id, minutes_remaining, expires_at")
          .maybeSingle();
        
        if (insertError) {
          console.error("Failed to auto-provision paid plan voice credits", { user_id: effectiveOwnerId, error: insertError });
        } else {
          console.log("Auto-provisioned 30 voice minutes for paid plan user", insertedCredit);
          
          // Re-fetch credits after provisioning
          const { data: refreshedCredits } = await supabaseAdmin
            .from("voice_credits")
            .select("*")
            .eq("user_id", effectiveOwnerId)
            .eq("status", "active")
            .gt("expires_at", new Date().toISOString())
            .order("expires_at", { ascending: true });
          
          voiceCredits = refreshedCredits;
          totalVoiceMinutes = (voiceCredits || []).reduce(
            (sum, credit) => sum + (credit.minutes_remaining || 0),
            0
          );
        }
      } else {
        console.log("Subscription credit exists for period but balance is 0 - credits exhausted or voided");
      }
    }
    
    // Auto-provision for Trial users
    if (isTrial && totalVoiceMinutes <= 0) {
      // Check if trial credits were EVER provisioned (any status, including exhausted)
      const { data: existingTrialCredit } = await supabaseAdmin
        .from("voice_credits")
        .select("id")
        .eq("user_id", effectiveOwnerId)
        .eq("source", "subscription")
        .lte("minutes_granted", 15)
        .maybeSingle();

      if (existingTrialCredit) {
        console.log("Trial credits already provisioned previously - skipping auto-provision");
      } else {
        console.log("Trial user has no active voice credits - auto-provisioning trial allocation");

        const trialEnd = subscription?.trial_end
          ? new Date(subscription.trial_end)
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const { data: insertedCredit, error: insertError } = await supabaseAdmin
          .from("voice_credits")
          .insert({
            user_id: effectiveOwnerId,
            source: 'subscription',
            minutes_granted: 15,
            minutes_remaining: 15,
            expires_at: trialEnd.toISOString(),
            status: 'active',
          })
          .select("id, minutes_remaining, expires_at")
          .maybeSingle();

      if (insertError) {
        console.error("Failed to auto-provision trial voice credits", { user_id: effectiveOwnerId, error: insertError });
      } else {
        console.log("Auto-provisioned 15 voice minutes for Trial user", insertedCredit);

        const { data: refreshedCredits } = await supabaseAdmin
          .from("voice_credits")
          .select("*")
          .eq("user_id", effectiveOwnerId)
          .eq("status", "active")
          .gt("expires_at", new Date().toISOString())
          .order("expires_at", { ascending: true });

        voiceCredits = refreshedCredits;
        totalVoiceMinutes = (voiceCredits || []).reduce(
          (sum, credit) => sum + (credit.minutes_remaining || 0),
          0
        );
        }
      }
    }

    // If no subscription exists, create trial
    if (!subscription && !subscriptionBypass) {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 7);

      const { data: newSub } = await supabaseAdmin.from("subscriptions").insert({
        user_id: effectiveOwnerId,
        plan_type: 'trial',
        status: 'trialing',
        trial_start: new Date().toISOString(),
        trial_end: trialEnd.toISOString(),
      }).select().single();

      // Create usage record
      await supabaseAdmin.from("subscription_usage").insert({
        user_id: effectiveOwnerId,
      });

      // Create initial trial voice credits (15 minutes for ~3 voice interviews)
      await supabaseAdmin.from("voice_credits").insert({
        user_id: effectiveOwnerId,
        source: 'subscription',
        minutes_granted: 15,
        minutes_remaining: 15,
        expires_at: trialEnd.toISOString(),
        status: 'active',
      });

      return new Response(JSON.stringify({
        subscription: newSub,
        usage: { jobs_created: 0, applicants_received: 0, documents_sent: 0, team_members_added: 0, ai_analyses_used: 0, voice_minutes_used: 0 },
        limits: getPlanLimits('trial'),
        voiceCredits: {
          totalMinutesAvailable: 15,
          credits: [{
            id: 'initial',
            source: 'trial',
            minutes_remaining: 15,
            expires_at: trialEnd.toISOString(),
          }],
        },
        teamAccess,
        subscriptionBypass: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if trial expired
    if (!subscriptionBypass && subscription?.status === 'trialing' && subscription.trial_end) {
      const trialEnd = new Date(subscription.trial_end);
      if (trialEnd < new Date()) {
        await supabaseAdmin.from("subscriptions").update({
          status: 'expired',
        }).eq('user_id', effectiveOwnerId);

        // Void all voice credits when trial expires
        await supabaseAdmin.from("voice_credits").update({
          status: 'voided',
        }).eq('user_id', effectiveOwnerId).eq('status', 'active');

        subscription.status = 'expired';
      }
    }

    const effectiveSubscription = subscriptionBypass
      ? {
          ...(subscription || {}),
          id: subscription?.id || `internal_test_${effectiveOwnerId}`,
          user_id: effectiveOwnerId,
          stripe_customer_id: subscription?.stripe_customer_id ?? null,
          stripe_subscription_id: subscription?.stripe_subscription_id ?? null,
          plan_type: 'business',
          status: 'active',
          trial_start: null,
          trial_end: null,
          current_period_start: subscription?.current_period_start ?? null,
          current_period_end: subscription?.current_period_end ?? null,
          cancel_at_period_end: false,
          currency: subscription?.currency ?? 'usd',
          amount: subscription?.amount ?? null,
          onboarding_completed: subscription?.onboarding_completed ?? true,
          created_at: subscription?.created_at ?? new Date().toISOString(),
          updated_at: subscription?.updated_at ?? new Date().toISOString(),
        }
      : subscription;

    return new Response(JSON.stringify({
      subscription: effectiveSubscription,
      usage: usage || { jobs_created: 0, applicants_received: 0, documents_sent: 0, team_members_added: 0, ai_analyses_used: 0, voice_minutes_used: 0 },
      limits: subscriptionBypass
        ? getSubscriptionBypassLimits()
        : getPlanLimits(effectiveSubscription!.plan_type),
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
      teamAccess,
      subscriptionBypass,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error fetching subscription:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    const isAuthError =
      message.toLowerCase().includes("not authenticated") ||
      message.toLowerCase().includes("no authorization header");

    return new Response(JSON.stringify({ error: message }), {
      status: isAuthError ? 401 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getPlanLimits(planType: string) {
  switch (planType) {
    case 'enterprise':
    case 'business':
      return {
        jobs: -1,
        applicants: -1,
        documents: -1,
        teamMembers: -1,
        aiAnalyses: -1,
        voiceMinutes: 30,
        hasAdvancedAnalytics: true,
        hasTeamPortal: true,
        hasDocuments: true,
        hasPrioritySupport: true,
        hasVoiceAssistant: true,
        hasVoiceInterviews: true,
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
    default: // trial - LIMITED to encourage upgrades
      return {
        jobs: 1,
        applicants: 15,
        documents: 10,
        teamMembers: 1,
        aiAnalyses: 15,
        voiceMinutes: 15,
        hasAdvancedAnalytics: false,
        hasTeamPortal: true,
        hasDocuments: true,
        hasPrioritySupport: false,
        hasVoiceAssistant: false,
        hasVoiceInterviews: true,
        hasVoiceTrialAccess: true,
      };
  }
}

function getNoAccessLimits() {
  return {
    jobs: 0,
    applicants: 0,
    documents: 0,
    teamMembers: 0,
    aiAnalyses: 0,
    voiceMinutes: 0,
    hasAdvancedAnalytics: false,
    hasTeamPortal: false,
    hasDocuments: false,
    hasPrioritySupport: false,
    hasVoiceAssistant: false,
    hasVoiceInterviews: false,
  };
}

function getSubscriptionBypassLimits() {
  return {
    jobs: -1,
    applicants: -1,
    documents: -1,
    teamMembers: -1,
    aiAnalyses: -1,
    voiceMinutes: -1,
    hasAdvancedAnalytics: true,
    hasTeamPortal: true,
    hasDocuments: true,
    hasPrioritySupport: true,
    hasVoiceAssistant: true,
    hasVoiceInterviews: true,
  };
}
