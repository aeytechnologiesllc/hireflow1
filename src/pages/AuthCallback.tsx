import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AuthLoadingScreen } from "@/components/animations/AuthLoadingScreen";
import { resolvePostAuthDestination } from "@/lib/authRouting";

/**
 * Supabase reports a failed link in the URL, not as an exception:
 *   #error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
 * (implicit flow puts it in the hash; some paths put it in the query). This
 * page used to look only for access_token, so an expired link meant a
 * fifteen-second spinner and then "Authentication timed out" — with a link to
 * the employer door, whoever you were.
 */
function readAuthError(): { code: string | null; description: string | null } | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const pick = (key: string) => hash.get(key) ?? query.get(key);

  const error = pick("error");
  const code = pick("error_code");
  const description = pick("error_description");

  if (!error && !code && !description) return null;
  return { code, description };
}

function describeAuthError(code: string | null, description: string | null): string {
  const text = `${code ?? ""} ${description ?? ""}`.toLowerCase();

  if (text.includes("otp_expired") || text.includes("expired")) {
    return "That link has expired. Request a new one.";
  }
  if (text.includes("access_denied") || text.includes("invalid")) {
    return "That link isn't valid anymore. Request a new one.";
  }
  return "We couldn't finish signing you in. Please try again.";
}

/** Only same-origin paths; anything that could leave the site is ignored. */
function safeRedirect(value: string | null): string | null {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshRole } = useAuth();
  const roleFromUrl = searchParams.get("role");
  const portalRole = roleFromUrl === "candidate" ? "candidate" : "employer";
  const signInPath = portalRole === "candidate" ? "/candidate/auth" : "/auth";

  // Read once, synchronously, so a failed link is answered on first paint —
  // not after a spinner that was never going to resolve.
  const [error, setError] = useState<string | null>(() => {
    const authError = readAuthError();
    return authError ? describeAuthError(authError.code, authError.description) : null;
  });

  useEffect(() => {
    if (error) return;

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let subscription: { unsubscribe: () => void } | undefined;

    const assignRoleAndRedirect = async (userId: string) => {
      try {
        const { role, route } = await resolvePostAuthDestination({ userId, portalRole });

        // resolvePostAuthDestination may have just written the user_roles row.
        // The AuthProvider fetched the role when the session appeared — before
        // that row existed — so re-read it now or the person lands in the
        // shell for a role of null until the next token refresh.
        await refreshRole();

        const requested = safeRedirect(searchParams.get("redirect"));
        navigate(requested && role === portalRole ? requested : route, { replace: true });
      } catch (err) {
        console.error("Error in auth callback routing:", err);
        setError("We couldn't finish signing you in. Please try again.");
      }
    };

    const handleCallback = async () => {
      // If tokens are in the URL hash (OAuth redirect), extract and set the session
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (accessToken && refreshToken) {
        const { data, error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (setSessionError || !data.session) {
          setError("We couldn't finish signing you in. Please try again.");
          return;
        }

        await assignRoleAndRedirect(data.session.user.id);
        return;
      }

      // Fallback: check if session already exists
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        await assignRoleAndRedirect(session.user.id);
        return;
      }

      // Last resort: listen for auth state change
      const listener = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
        if (nextSession?.user) {
          subscription?.unsubscribe();
          if (timeout) clearTimeout(timeout);
          await assignRoleAndRedirect(nextSession.user.id);
        }
      });
      subscription = listener.data.subscription;

      timeout = setTimeout(() => {
        subscription?.unsubscribe();
        setError("That took too long. Please sign in again.");
      }, 15000);
    };

    void handleCallback();

    return () => {
      subscription?.unsubscribe();
      if (timeout) clearTimeout(timeout);
    };
    // Deliberately not keyed on refreshRole (a new function every provider
    // render) or on searchParams/portalRole (fixed for the life of this page):
    // this must run once per page load, not once per parent re-render, or the
    // session would be set and the role assigned several times over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, error]);

  if (error) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm text-center space-y-5">
          <p className="text-base text-foreground">{error}</p>
          <a
            href={signInPath}
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  return <AuthLoadingScreen variant={portalRole} />;
}
