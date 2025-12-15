import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface SubscriptionData {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_type: 'trial' | 'growth' | 'business';
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
}

export interface PlanLimits {
  jobs: number;
  applicants: number;
  documents: number;
  teamMembers: number;
  aiAnalyses: number;
  hasAdvancedAnalytics: boolean;
  hasTeamPortal: boolean;
  hasDocuments: boolean;
  hasPrioritySupport: boolean;
}

export interface SubscriptionState {
  subscription: SubscriptionData | null;
  usage: UsageData;
  limits: PlanLimits;
}

export function useSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['subscription', user?.id],
    queryFn: async (): Promise<SubscriptionState> => {
      const { data, error } = await supabase.functions.invoke('get-subscription');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 60000, // 1 minute
  });

  const createCheckoutSession = useMutation({
    mutationFn: async ({ planType, countryCode, interval = 'monthly' }: { planType: 'growth' | 'business'; countryCode: string; interval?: 'monthly' | 'yearly' }) => {
      const { data, error } = await supabase.functions.invoke('stripe-checkout', {
        body: {
          planType,
          countryCode,
          interval,
          successUrl: `${window.location.origin}/settings?subscription=success`,
          cancelUrl: `${window.location.origin}/settings?subscription=canceled`,
        },
      });
      if (error) throw error;
      return data;
    },
  });

  const createBillingPortal = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('create-billing-portal', {
        body: {
          returnUrl: `${window.location.origin}/settings`,
        },
      });
      if (error) throw error;
      return data;
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

  // Calculate trial time remaining
  const getTrialTimeRemaining = () => {
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
    if (!data?.limits) return false;
    return data.limits[feature] === true || data.limits[feature] === -1 || (typeof data.limits[feature] === 'number' && data.limits[feature] > 0);
  };

  // Check if usage is within limits
  const isWithinLimit = (limitKey: 'jobs' | 'applicants' | 'documents' | 'teamMembers', currentCount?: number) => {
    if (!data?.limits) return true;
    const limit = data.limits[limitKey];
    if (limit === -1) return true; // Unlimited
    const usage = currentCount ?? (data.usage[`${limitKey.replace('Members', '_members_added').replace('jobs', 'jobs_created').replace('applicants', 'applicants_received').replace('documents', 'documents_sent')}` as keyof UsageData] || 0);
    return usage < limit;
  };

  return {
    subscription: data?.subscription ?? null,
    usage: data?.usage ?? { jobs_created: 0, applicants_received: 0, documents_sent: 0, team_members_added: 0, ai_analyses_used: 0 },
    limits: data?.limits ?? { jobs: 1, applicants: 10, documents: 5, teamMembers: 0, aiAnalyses: 20, hasAdvancedAnalytics: false, hasTeamPortal: false, hasDocuments: true, hasPrioritySupport: false },
    isLoading,
    error,
    refetch,
    createCheckoutSession,
    createBillingPortal,
    completeOnboarding,
    getTrialTimeRemaining,
    hasFeature,
    isWithinLimit,
    isPaid: data?.subscription?.status === 'active',
    isTrialing: data?.subscription?.status === 'trialing',
    isExpired: data?.subscription?.status === 'expired',
    needsOnboarding: data?.subscription && !data.subscription.onboarding_completed,
  };
}
