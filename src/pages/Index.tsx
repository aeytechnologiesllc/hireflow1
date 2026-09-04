import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export default function Index() {
  const navigate = useNavigate();
  const { session, role, loading } = useAuth();
  const sentToCallback = useRef(false);

  useEffect(() => {
    const iframe = document.getElementById("landing-iframe") as HTMLIFrameElement;
    if (iframe) {
      iframe.src = "/landing.html";
    }
  }, []);

  // Signed in, auth finished, and still no role: this account never had its
  // user_roles row written (an OAuth sign-in that didn't pass through
  // /auth/callback, or a callback that was closed mid-way). Every shell treats
  // a null role as "not one of ours", so the person can't get anywhere.
  // /auth/callback runs the role assignment and routes them. Once only — it
  // navigates away on success and shows its own error on failure, so this
  // cannot ping-pong.
  useEffect(() => {
    if (loading || !session || role !== null || sentToCallback.current) return;
    sentToCallback.current = true;
    navigate("/auth/callback", { replace: true });
  }, [loading, session, role, navigate]);

  return (
    <iframe
      id="landing-iframe"
      src="/landing.html"
      style={{
        width: "100%",
        height: "100vh",
        border: "none",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 50,
      }}
      title="Hireflow Landing Page"
    />
  );
}
