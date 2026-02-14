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

      // Wait for session to be established (OAuth redirect brings tokens in URL hash)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        // Session might not be ready yet — listen for auth state change
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (session?.user) {
            subscription.unsubscribe();
            await assignRoleAndRedirect(session.user.id, roleFromUrl);
          }
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          subscription.unsubscribe();
          setError("Authentication timed out. Please try again.");
        }, 10000);
        return;
      }

      await assignRoleAndRedirect(session.user.id, roleFromUrl);
    };

    const assignRoleAndRedirect = async (userId: string, roleFromUrl: string | null) => {
      try {
        // Call the secure RPC to assign role (only inserts if no role exists)
        const { error: rpcError } = await supabase.rpc("assign_user_role", {
          p_role: roleFromUrl === "employer" ? "employer" : "candidate",
        });

        if (rpcError) {
          console.error("Error assigning role:", rpcError);
        }
      } catch (err) {
        console.error("Error in role assignment:", err);
      }

      // Navigate to appropriate dashboard
      if (roleFromUrl === "employer") {
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/apply", { replace: true });
      }
    };

    handleCallback();
  }, [navigate, searchParams]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
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
