import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { trustApi } from "@/lib/trustApi";

/**
 * Whether the signed-in person runs HireFlow (public.platform_admins): only
 * they see Admin. The database decides; every admin function checks again
 * on its own, so this only hides a link.
 */
export function usePlatformAdmin(): boolean {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["platform-admin", user?.id],
    enabled: !!user,
    staleTime: 10 * 60_000,
    queryFn: () => trustApi.isPlatformAdmin(),
  });
  return data === true;
}
