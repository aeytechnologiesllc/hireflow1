import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { STAFF_SPLIT_ON, candidateOrigin, hostRedirect, staffOrigin, type HostRole } from "@/lib/hosts";

/**
 * Sends each request to the right front door (src/lib/hosts.ts):
 * staff.hireflownow.com opens on sign-in (or the dashboard when already
 * signed in), candidate pages live on hireflownow.com, and — once
 * VITE_STAFF_SPLIT=on — the hiring team's pages move to the staff host.
 *
 * A cross-host move renders nothing while it happens, so the wrong page never
 * flashes; the path, query and hash travel with it (password-reset and OAuth
 * tokens live there).
 */
export function HostGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();

  const target = hostRedirect(
    {
      hostname: window.location.hostname,
      path: location.pathname,
      rest: `${location.search}${location.hash}`,
      splitOn: STAFF_SPLIT_ON,
      authLoading: loading,
      signedIn: !!user,
      role: (role ?? null) as HostRole,
    },
    { candidate: candidateOrigin(), staff: staffOrigin() },
  );

  useEffect(() => {
    if (!target) return;
    if (target.startsWith("/")) navigate(target, { replace: true });
    else window.location.replace(target);
  }, [target, navigate]);

  if (target && !target.startsWith("/")) return null;
  return <>{children}</>;
}

export default HostGate;
