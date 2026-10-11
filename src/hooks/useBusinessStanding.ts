import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { trustApi, type BusinessStanding } from "@/lib/trustApi";

/**
 * The standing of the business the signed-in person hires for (their own,
 * or their team's): new, approved or suspended, and whether it may ask for
 * ID papers yet (docs/BUSINESS-TRUST.md). The database refuses an ID request
 * from a business it has not approved; this only lets a screen say so first.
 * Unknown (still loading, or the call failed) locks nothing.
 */
export function useBusinessStanding(enabled = true): BusinessStanding | null {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["business-standing", user?.id],
    enabled: enabled && !!user,
    staleTime: 60_000,
    queryFn: () => trustApi.standing(),
  });
  return data ?? null;
}

/** ID papers wait for approval; a paused business can ask for nothing. */
export function requestLocks(standing: BusinessStanding | null): { idsLocked: boolean; allLocked: boolean } {
  if (!standing) return { idsLocked: false, allLocked: false };
  return { idsLocked: !standing.can_request_ids, allLocked: standing.status === "suspended" };
}
