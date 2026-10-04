import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useSchemaMode } from "./useSchemaMode";

/**
 * Account state for the signed-in employer / team member.
 *
 * This is Zulu's own hiring tool now (2026-10-04): there is no Stripe, no
 * plan, no trial and no usage limit anywhere in the product. The hook keeps
 * its name so the many callers stay untouched, but everything it answers
 * is now about ACCESS, not billing:
 *
 *   - needsOnboarding / completeOnboarding — the first-run welcome screen
 *     (a flag on the account's `subscriptions` row, which is just where the
 *     flag has always lived)
 *   - teamAccess — whether a team member's membership is active or revoked
 *   - voice minutes — the Ava voice assistant's remaining minutes, which is
 *     a real cost (OpenAI realtime + ElevenLabs) and stays metered
 *
 * `get-subscription` is the edge function that resolves all three from the
 * server, and it needs no payment keys to do so.
 */
export interface SubscriptionData {
  id: string;
  user_id: string;
  plan_type: string;
  status: string;
  trial_end: string | null;
  onboarding_completed: boolean;
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
// unreachable (network failure, cold-start error, etc.). Without this,
// `AppLayout` blocks the ENTIRE employer app behind `subLoading` and the user
// is stuck on "Preparing your dashboard..." forever. The real state is
// picked up automatically on the next successful fetch.
function buildFallbackState(userId: string | undefined): SubscriptionState {
  return {
    subscription: {
      id: 'fallback',
      user_id: userId ?? 'unknown',
      plan_type: 'internal',
      status: 'active',
      trial_end: null,
      // Skip onboarding so the employer reaches the dashboard rather than
      // being trapped behind a welcome screen that also needs the backend.
      onboarding_completed: true,
    },
    voiceCredits: { totalMinutesAvailable: 0, credits: [] },
    teamAccess: defaultTeamAccess,
    subscriptionBypass: false,
  };
}

export function useSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: schemaMode } = useSchemaMode();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['subscription', user?.id],
    queryFn: async (): Promise<SubscriptionState> => {
      if (schemaMode === "showcase") {
        return buildFallbackState(user?.id);
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error("Your session expired. Please sign in again.");
      }

      try {
        const { data: state, error: fnError } = await supabase.functions.invoke('get-subscription', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (fnError) throw fnError;
        return state as SubscriptionState;
      } catch (err) {
        // A genuine "session expired" should still surface so the user is
        // signed out; anything else (function unreachable, network) must NOT
        // leave the app hung on the loading screen.
        const message = err instanceof Error ? err.message : String(err);
        if (/session expired/i.test(message)) {
          throw err;
        }
        console.debug("[useSubscription] get-subscription unavailable — using fallback state.");
        return buildFallbackState(user?.id);
      }
    },
    enabled: !!user && schemaMode !== undefined,
    staleTime: 30000,
    retry: 1,
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

  // Keep the Ava voice minute count live while a session is running.
  useEffect(() => {
    if (!user?.id || schemaMode === "showcase") return;

    const voiceCreditsChannel = supabase
      .channel(`subscription-voice-credits-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'voice_credits', filter: `user_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['subscription', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(voiceCreditsChannel);
    };
  }, [user?.id, queryClient, schemaMode]);

  const getVoiceMinutesRemaining = () => {
    return data?.voiceCredits?.totalMinutesAvailable || 0;
  };

  /** 'full' while minutes remain (or the account is an internal bypass
   *  account), 'exhausted' once they are used up. There is no locked or
   *  expired state any more. */
  const getVoiceAccessState = (): 'full' | 'exhausted' => {
    if (data?.subscriptionBypass) return 'full';
    return getVoiceMinutesRemaining() > 0 ? 'full' : 'exhausted';
  };

  // Low balance warning (show when <= 15 minutes)
  const showLowBalanceWarning = () => {
    if (data?.subscriptionBypass) return false;
    const remaining = getVoiceMinutesRemaining();
    return remaining <= 15 && remaining > 0;
  };

  return {
    subscription: data?.subscription ?? null,
    voiceCredits: data?.voiceCredits ?? { totalMinutesAvailable: 0, credits: [] },
    teamAccess: data?.teamAccess ?? defaultTeamAccess,
    subscriptionBypass: data?.subscriptionBypass ?? false,
    isLoading,
    error,
    refetch,
    completeOnboarding,
    needsOnboarding: data?.subscription && !data.subscription.onboarding_completed,
    hasVoiceAccess: () => getVoiceAccessState() === 'full',
    getVoiceMinutesRemaining,
    getVoiceAccessState,
    showLowBalanceWarning,
  };
}
