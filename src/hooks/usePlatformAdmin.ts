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

/**
 * Whether this account is the platform admin's at all, whatever this
 * session's sign-in level (is_platform_admin_account). Once the admin has
 * turned on two-step sign-in, a session that has not entered the code is not
 * an admin (usePlatformAdmin is false) but is still the admin's account: the
 * menu keeps the Admin link, and the Admin page asks for the code.
 */
export function usePlatformAdminAccount(): boolean {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["platform-admin-account", user?.id],
    enabled: !!user,
    staleTime: 10 * 60_000,
    queryFn: () => trustApi.isPlatformAdminAccount(),
  });
  return data === true;
}
