import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useSchemaMode } from "./useSchemaMode";
import { readBillingState, type BillingState } from "@/lib/billing";

/**
 * Account state for the signed-in employer / team member, from
 * get-subscription (pricing v9, 2026-10-31; docs/BILLING.md):
 *
 *   - teamAccess — whether a team member's membership is active or revoked;
 *   - billing — the business's billing (src/lib/billing.ts reads it):
 *     billingEnabled, exempt, plan, freeJobAvailable, Unlimited's period and
 *     each job's pass. While billing is off it says only that, and every
 *     screen then shows nothing about billing. Null when unknown (the
 *     function unreachable, or an applicant), which every screen treats as
 *     off: an unknown state never shows a price.
 *
 * The old answer's trial row, usage, limits and voice minutes are gone
 * (nothing read them; voice stays for platform_admins only).
 */
export interface TeamAccessState {
  isTeamMember: boolean;
  status: "active" | "revoked" | "none";
  reason: "revoked" | null;
  employerId: string | null;
}

export interface SubscriptionState {
  teamAccess: TeamAccessState;
  billing: BillingState | null;
}

const defaultTeamAccess: TeamAccessState = {
  isTeamMember: false,
  status: "none",
  reason: null,
  employerId: null,
};

// Used when get-subscription is unreachable (network failure, cold start):
// without it AppLayout would hold a team member on the loading screen. The
// real state is picked up on the next successful fetch.
const FALLBACK_STATE: SubscriptionState = { teamAccess: defaultTeamAccess, billing: null };

function readTeamAccess(raw: unknown): TeamAccessState {
  if (!raw || typeof raw !== "object") return defaultTeamAccess;
  const r = raw as Partial<TeamAccessState>;
  return {
    isTeamMember: r.isTeamMember === true,
    status: r.status === "active" || r.status === "revoked" ? r.status : "none",
    reason: r.reason === "revoked" ? "revoked" : null,
    employerId: typeof r.employerId === "string" ? r.employerId : null,
  };
}

export function useSubscription() {
  const { user } = useAuth();
  const { data: schemaMode } = useSchemaMode();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["subscription", user?.id],
    queryFn: async (): Promise<SubscriptionState> => {
      if (schemaMode === "showcase") return FALLBACK_STATE;

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error("Your session expired. Please sign in again.");
      }

      try {
        const { data: state, error: fnError } = await supabase.functions.invoke("get-subscription", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (fnError) throw fnError;
        const raw = (state ?? {}) as { teamAccess?: unknown; billing?: unknown };
        return { teamAccess: readTeamAccess(raw.teamAccess), billing: readBillingState(raw.billing) };
      } catch (err) {
        // A genuine "session expired" still surfaces so the user is signed
        // out; anything else (function unreachable, network) must not leave
        // the app hung on the loading screen.
        const message = err instanceof Error ? err.message : String(err);
        if (/session expired/i.test(message)) {
          throw err;
        }
        console.debug("[useSubscription] get-subscription unavailable — using fallback state.");
        return FALLBACK_STATE;
      }
    },
    enabled: !!user && schemaMode !== undefined,
    staleTime: 30000,
    retry: 1,
  });

  return {
    teamAccess: data?.teamAccess ?? defaultTeamAccess,
    billing: data?.billing ?? null,
    isLoading,
    error,
    refetch,
  };
}

/** The business's billing (null while unknown, which every screen treats as off). */
export function useBilling() {
  const { billing, isLoading, refetch } = useSubscription();
  return { billing, isLoading, refetch };
}
