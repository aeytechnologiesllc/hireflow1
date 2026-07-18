import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useSchemaMode } from "./useSchemaMode";

export interface SubscriptionData {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_type: 'trial' | 'growth' | 'business' | 'enterprise';
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
  trial_start: string | null;
  trial_end: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  currency: string;
  amount: number | null;
  onboarding_completed: boolean;
}

export interface UsageData {
  jobs_created: number;
  applicants_received: number;
  documents_sent: number;
  team_members_added: number;
  ai_analyses_used: number;
  voice_minutes_used: number;
}

export interface PlanLimits {
  jobs: number;
  applicants: number;
  documents: number;
  teamMembers: number;
  aiAnalyses: number;
  voiceMinutes: number;
  hasAdvancedAnalytics: boolean;
  hasTeamPortal: boolean;
  hasDocuments: boolean;
  hasPrioritySupport: boolean;
  hasVoiceAssistant: boolean;
  hasVoiceInterviews: boolean;
}

export interface VoiceCredit {
  id: string;
  source: 'subscription' | 'purchase';
  pack_size?: string;
  minutes_remaining: number;
  minutes_granted: number;
  expires_at: string;
  granted_at: string;
}

export interface VoiceCreditsData {
  totalMinutesAvailable: number;
  credits: VoiceCredit[];
}

export interface TeamAccessState {
  isTeamMember: boolean;
  status: 'active' | 'revoked' | 'none';
  reason: 'revoked' | null;
  employerId: string | null;
}

export interface SubscriptionState {
  subscription: SubscriptionData | null;
  usage: UsageData;
  limits: PlanLimits;
  voiceCredits: VoiceCreditsData;
  teamAccess: TeamAccessState;
  subscriptionBypass: boolean;
}

const defaultTeamAccess: TeamAccessState = {
  isTeamMember: false,
  status: 'none',
  reason: null,
  employerId: null,
};

// Defensive fallback used when the `get-subscription` Edge Function is
// unreachable (not deployed, network failure, cold-start error, etc.).
// Without this, `AppLayout` blocks the ENTIRE employer app behind
// `subLoading` and the user is stuck on "Preparing your dashboard..."
// forever. Returning a usable trial state lets the app render instead of
// hanging; the real subscription is picked up automatically on the next
// successful fetch.
function buildFallbackSubscriptionState(userId: string | undefined): SubscriptionState {
  const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return {
    subscription: {
      id: 'fallback_trial',
      user_id: userId ?? 'unknown',
      stripe_customer_id: null,
      stripe_subscription_id: null,
      plan_type: 'trial',
      status: 'trialing',
      trial_start: new Date().toISOString(),
      trial_end: trialEnd,
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      currency: 'usd',
      amount: null,
      // Skip onboarding so the employer reaches the dashboard rather than
      // being trapped behind an onboarding wizard that also needs the backend.
      onboarding_completed: true,
    },
    usage: { jobs_created: 0, applicants_received: 0, documents_sent: 0, team_members_added: 0, ai_analyses_used: 0, voice_minutes_used: 0 },
    limits: { jobs: 1, applicants: 15, documents: 10, teamMembers: 1, aiAnalyses: 15, voiceMinutes: 15, hasAdvancedAnalytics: false, hasTeamPortal: true, hasDocuments: true, hasPrioritySupport: false, hasVoiceAssistant: false, hasVoiceInterviews: true },
    voiceCredits: { totalMinutesAvailable: 0, credits: [] },
    teamAccess: defaultTeamAccess,
    subscriptionBypass: false,
  };
}

export function useSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: schemaMode } = useSchemaMode();

  const invokeAuthedFunction = async <TData = unknown>(
    functionName: string,
    body?: Record<string, unknown>,
  ) => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;

    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      throw new Error("Your session expired. Please sign in again.");
    }

    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (error) throw error;
    return data as TData;
  };

  // All hooks declared first in consistent order
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['subscription', user?.id],
    queryFn: async (): Promise<SubscriptionState> => {
      // Showcase deploy has no billing edge fn — use trial fallback immediately (no 404 noise).
      if (schemaMode === "showcase") {
        return buildFallbackSubscriptionState(user?.id);
      }

      try {
        return await invokeAuthedFunction<SubscriptionState>('get-subscription');
      } catch (err) {
        // A genuine "session expired" should still surface so the user is
        // signed out; anything else (function missing/unreachable, network)
        // must NOT leave the app hung on the loading screen.
        const message = err instanceof Error ? err.message : String(err);
        if (/session expired/i.test(message)) {
          throw err;
        }
        console.debug(
          "[useSubscription] get-subscription unavailable — using fallback trial state.",
        );
        return buildFallbackSubscriptionState(user?.id);
      }
    },
    enabled: !!user && schemaMode !== undefined,
    staleTime: 30000,
    // Keep retries short so the fallback (and the dashboard) appear quickly
    // instead of stretching the spinner across the global 3x/30s backoff.
    retry: 1,
  });

  const createCheckoutSession = useMutation({
    mutationFn: async ({ planType, countryCode, interval = 'monthly' }: { planType: 'growth' | 'business'; countryCode: string; interval?: 'monthly' | 'yearly' }) => {
      return invokeAuthedFunction<{ clientSecret: string }>('stripe-checkout', {
          planType,
          countryCode,
          interval,
          successUrl: `${window.location.origin}/dashboard?subscription=success`,
      });
    },
  });

  const createBillingPortal = useMutation({
    mutationFn: async () => {
      return invokeAuthedFunction('create-billing-portal', {
        returnUrl: `${window.location.origin}/settings`,
      });
    },
  });

  const purchaseVoiceCredits = useMutation({
    mutationFn: async ({ packSize }: { packSize?: string } = {}) => {
      return invokeAuthedFunction('purchase-voice-credits', {
          packSize: packSize || 'standard',
          successUrl: `${window.location.origin}/settings?tab=subscription&voice_credits=success`,
          cancelUrl: `${window.location.origin}/settings?tab=subscription&voice_credits=canceled`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
    },
  });

  const completeOnboarding = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('subscriptions')
        .update({ onboarding_completed: true })
        .eq('user_id', user?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
    },
  });

  const syncSubscription = useMutation({
    mutationFn: async () => {
      return invokeAuthedFunction('sync-subscription');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
    },
  });

  // Real-time subscription for usage updates - useEffect comes after all hooks
  useEffect(() => {
    if (!user?.id || schemaMode === "showcase") return;

    const jobsChannel = supabase
      .channel(`subscription-jobs-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs', filter: `employer_id=eq.${user.id}` },
        () => queryClient.invalidateQueries({ queryKey: ['subscription', user.id] })
      )
      .subscribe();

    const applicationsChannel = supabase
      .channel(`subscription-apps-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'applications' },
        () => queryClient.invalidateQueries({ queryKey: ['subscription', user.id] })
      )
      .subscribe();

    const documentsChannel = supabase
      .channel(`subscription-docs-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documents' },
        () => queryClient.invalidateQueries({ queryKey: ['subscription', user.id] })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'document_requests' },
        () => queryClient.invalidateQueries({ queryKey: ['subscription', user.id] })
      )
      .subscribe();

    // CRITICAL: Subscribe to voice_credits changes for realtime voice minutes updates
    const voiceCreditsChannel = supabase
      .channel(`subscription-voice-credits-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'voice_credits', filter: `user_id=eq.${user.id}` },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['subscription', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(jobsChannel);
      supabase.removeChannel(applicationsChannel);
      supabase.removeChannel(documentsChannel);
      supabase.removeChannel(voiceCreditsChannel);
    };
  }, [user?.id, queryClient, schemaMode]);

  // Calculate trial time remaining
  const getTrialTimeRemaining = () => {
    if (data?.subscriptionBypass) return null;
    if (!data?.subscription?.trial_end || data.subscription.status !== 'trialing') {
      return null;
    }
    const trialEnd = new Date(data.subscription.trial_end);
    const now = new Date();
    const diff = trialEnd.getTime() - now.getTime();
    
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, expired: true };
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return { days, hours, minutes, expired: false };
  };

  // Check if a feature is available
  const hasFeature = (feature: keyof PlanLimits) => {
    if (data?.subscriptionBypass) return true;
    if (!data?.limits) return false;
    return data.limits[feature] === true || data.limits[feature] === -1 || (typeof data.limits[feature] === 'number' && data.limits[feature] > 0);
  };

  // Check if usage is within limits
  const isWithinLimit = (limitKey: 'jobs' | 'applicants' | 'documents' | 'teamMembers', currentCount?: number) => {
    if (data?.subscriptionBypass) return true;
    if (!data?.limits) return true;
    const limit = data.limits[limitKey];
    if (limit === -1) return true; // Unlimited
    const usage = currentCount ?? (data.usage[`${limitKey.replace('Members', '_members_added').replace('jobs', 'jobs_created').replace('applicants', 'applicants_received').replace('documents', 'documents_sent')}` as keyof UsageData] || 0);
    return usage < limit;
  };

  // Voice credits helpers
  const getVoiceMinutesRemaining = () => {
    return data?.voiceCredits?.totalMinutesAvailable || 0;
  };

  const hasVoiceAccess = () => {
    if (data?.subscriptionBypass) return true;
    if (!data?.subscription) return false;
    const hasVoicePlan = ['business', 'enterprise'].includes(data.subscription.plan_type) && data.subscription.status === 'active';
    const isTrial = data.subscription.status === 'trialing';
    const voiceMinutesRemaining = getVoiceMinutesRemaining();
    return (hasVoicePlan || isTrial) && voiceMinutesRemaining > 0;
  };

  const getVoiceAccessState = (): 'full' | 'trial' | 'trial_exhausted' | 'exhausted' | 'locked' | 'expired' => {
    if (data?.subscriptionBypass) return 'full';
    if (!data?.subscription) return 'locked';
    if (data.subscription.status === 'expired') return 'expired';
    
    const hasVoicePlan = ['business', 'enterprise'].includes(data.subscription.plan_type) && data.subscription.status === 'active';
    const isTrial = data.subscription.status === 'trialing';
    const voiceMinutesRemaining = getVoiceMinutesRemaining();
    
    if (hasVoicePlan) {
      return voiceMinutesRemaining > 0 ? 'full' : 'exhausted';
    }
    if (isTrial) {
      // Trial users: never show "exhausted" amber state - show trial_exhausted which displays premium orb
      return voiceMinutesRemaining > 0 ? 'trial' : 'trial_exhausted';
    }
    return 'locked'; // Growth
  };

  // Low balance warning (show when <= 15 minutes)
  const showLowBalanceWarning = () => {
    if (data?.subscriptionBypass) return false;
    const state = getVoiceAccessState();
    if (state === 'locked' || state === 'expired') return false;
    return getVoiceMinutesRemaining() <= 15 && getVoiceMinutesRemaining() > 0;
  };

  return {
    subscription: data?.subscription ?? null,
    usage: data?.usage ?? { jobs_created: 0, applicants_received: 0, documents_sent: 0, team_members_added: 0, ai_analyses_used: 0, voice_minutes_used: 0 },
    limits: data?.limits ?? { jobs: 1, applicants: 10, documents: 5, teamMembers: 0, aiAnalyses: 20, voiceMinutes: 0, hasAdvancedAnalytics: false, hasTeamPortal: false, hasDocuments: true, hasPrioritySupport: false, hasVoiceAssistant: false, hasVoiceInterviews: false },
    voiceCredits: data?.voiceCredits ?? { totalMinutesAvailable: 0, credits: [] },
    teamAccess: data?.teamAccess ?? defaultTeamAccess,
    subscriptionBypass: data?.subscriptionBypass ?? false,
    isLoading,
    error,
    refetch,
    createCheckoutSession,
    createBillingPortal,
    purchaseVoiceCredits,
    completeOnboarding,
    syncSubscription,
    getTrialTimeRemaining,
    hasFeature,
    isWithinLimit,
    isPaid: data?.subscriptionBypass || data?.subscription?.status === 'active',
    isTrialing: !data?.subscriptionBypass && data?.subscription?.status === 'trialing',
    isExpired: !data?.subscriptionBypass && data?.subscription?.status === 'expired',
    needsOnboarding: data?.subscription && !data.subscription.onboarding_completed,
    // Voice helpers
    hasVoiceAccess,
    getVoiceMinutesRemaining,
    getVoiceAccessState,
    showLowBalanceWarning,
  };
}
