import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

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
      const returnUrl = localStorage.getItem("google_oauth_return_url") || "/interviews";

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
        localStorage.setItem("google_access_token", data.access_token);
        localStorage.setItem("google_refresh_token", data.refresh_token);
        localStorage.setItem(
          "google_token_expiry",
          new Date(Date.now() + data.expires_in * 1000).toISOString()
        );

        // Clean up the return URL
        localStorage.removeItem("google_oauth_return_url");

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
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 p-8">
        {status === "loading" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <p className="text-lg text-muted-foreground">{message}</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
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
