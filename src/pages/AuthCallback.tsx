import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuthLoadingScreen } from "@/components/animations/AuthLoadingScreen";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const roleFromUrl = searchParams.get("role");

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
          setError("Failed to establish session. Please try again.");
          return;
        }

        await assignRoleAndRedirect(data.session.user.id, roleFromUrl);
        return;
      }

      // Fallback: check if session already exists
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        await assignRoleAndRedirect(session.user.id, roleFromUrl);
        return;
      }

      // Last resort: listen for auth state change
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          subscription.unsubscribe();
          await assignRoleAndRedirect(session.user.id, roleFromUrl);
        }
      });

      // Timeout after 15 seconds
      setTimeout(() => {
        subscription.unsubscribe();
        setError("Authentication timed out. Please try again.");
      }, 15000);
    };

    const assignRoleAndRedirect = async (userId: string, roleFromUrl: string | null) => {
      const role = roleFromUrl === "candidate" ? "candidate" : "employer";

      try {
        const { error: rpcError } = await supabase.rpc("assign_user_role", {
          p_role: role,
        });

        if (rpcError) {
          console.error("Error assigning role:", rpcError);
        }
      } catch (err) {
        console.error("Error in role assignment:", err);
      }

      // Navigate to appropriate dashboard
      if (role === "employer") {
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/apply", { replace: true });
      }
    };

    handleCallback();
  }, [navigate, searchParams]);

  if (error) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-destructive">{error}</p>
          <a href="/auth" className="text-primary hover:underline">
            Back to Sign In
          </a>
        </div>
      </div>
    );
  }

  return <AuthLoadingScreen variant="employer" />;
}
