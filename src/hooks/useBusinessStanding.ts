import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { trustApi, type BusinessStanding } from "@/lib/trustApi";

/**
 * The standing of the business the signed-in person hires for (their own,
 * or their team's): open ('approved', from sign-up since 2026-10-11) or
 * paused ('suspended', by you or by three reports), and whether it may ask
 * for ID papers (docs/BUSINESS-TRUST.md). The database decides; this only
 * lets a screen say so first. Unknown (still loading, or the call failed)
 * locks nothing.
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

/** A paused business can ask for nothing; ID papers follow the database. */
export function requestLocks(standing: BusinessStanding | null): { idsLocked: boolean; allLocked: boolean } {
  if (!standing) return { idsLocked: false, allLocked: false };
  return { idsLocked: !standing.can_request_ids, allLocked: standing.status === "suspended" };
}
