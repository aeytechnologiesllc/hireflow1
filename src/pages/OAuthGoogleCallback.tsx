import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, XCircle } from "lucide-react";
import { StaggeredBarsLoader } from "@/components/animations/StaggeredBarsLoader";

const FIXED_REDIRECT_URI = `${window.location.origin}/oauth/google/callback`;

export default function OAuthGoogleCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Connecting to Google Calendar...");

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error");

      // Get the return URL from localStorage
      const returnUrl = sessionStorage.getItem("google_oauth_return_url") || "/interviews";

      if (error) {
        setStatus("error");
        setMessage(`Google authorization failed: ${error}`);
        localStorage.removeItem("interview_wizard_state");
        setTimeout(() => navigate(returnUrl), 2000);
        return;
      }

      if (!code || state !== "google_calendar_connect") {
        setStatus("error");
        setMessage("Invalid OAuth callback");
        localStorage.removeItem("interview_wizard_state");
        setTimeout(() => navigate(returnUrl), 2000);
        return;
      }

      try {
        setMessage("Exchanging authorization code...");
        
        const { data, error: invokeError } = await supabase.functions.invoke("google-calendar", {
          body: {
            action: "exchange_token",
            code,
            redirectUri: FIXED_REDIRECT_URI,
          },
        });

        if (invokeError) throw invokeError;

        // Store tokens
        sessionStorage.setItem("google_access_token", data.access_token);
        sessionStorage.setItem("google_refresh_token", data.refresh_token);
        sessionStorage.setItem(
          "google_token_expiry",
          new Date(Date.now() + data.expires_in * 1000).toISOString()
        );

        // Clean up the return URL
        sessionStorage.removeItem("google_oauth_return_url");

        setStatus("success");
        setMessage("Google Calendar connected successfully!");
        toast.success("Google Calendar connected!");
        
        // Navigate back with query param to reopen wizard
        const separator = returnUrl.includes("?") ? "&" : "?";
        setTimeout(() => navigate(`${returnUrl}${separator}openWizard=true`), 1000);
      } catch (err: any) {
        console.error("Google OAuth error:", err);
        setStatus("error");
        setMessage(err.message || "Failed to connect Google Calendar");
        localStorage.removeItem("interview_wizard_state");
        toast.error("Failed to connect Google Calendar");
        setTimeout(() => navigate(returnUrl), 2000);
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="dark min-h-[100dvh] flex items-center justify-center bg-background text-white">
      <div className="text-center space-y-4 p-8">
        {status === "loading" && (
          <div className="flex flex-col items-center gap-4">
            <StaggeredBarsLoader size="lg" />
            <p className="text-lg text-muted-foreground">{message}</p>
          </div>
        )}
        {status === "success" && (
          <>
            <CheckCircle className="h-12 w-12 text-success mx-auto" />
            <p className="text-lg text-foreground">{message}</p>
            <p className="text-sm text-muted-foreground">Returning to wizard...</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <p className="text-lg text-foreground">{message}</p>
            <p className="text-sm text-muted-foreground">Redirecting...</p>
          </>
        )}
      </div>
    </div>
  );
}
