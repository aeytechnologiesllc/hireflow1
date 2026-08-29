import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import BrandLoader from "@/components/BrandLoader";

interface AuthLoadingScreenProps {
  variant?: "employer" | "candidate";
  message?: string;
}

const employerMessages = [
  "Connecting your account...",
  "Setting up your workspace...",
  "Preparing your dashboard...",
  "Almost there...",
];

const candidateMessages = [
  "Connecting your account...",
  "Preparing your portal...",
  "Loading your applications...",
  "Almost there...",
];

/**
 * The wait between sign-in and the app. One brand moment for both audiences —
 * BrandLoader draws the rising line; only the cycling copy differs. The old
 * version was a WebGL orb on hardcoded pre-design jade for employers and a
 * particle field for candidates, neither of which followed the theme.
 *
 * Rendered via a portal to document.body: this screen gets mounted from many
 * call sites (AppLayout, Auth, CreateJob, DeveloperLayout, ...), some nested
 * inside containers with a CSS transform/filter — which silently turns
 * `position: fixed` into "fixed relative to that ancestor" instead of the
 * viewport, so the screen renders as a small cramped fragment wherever that
 * ancestor happens to be (reported: top-left of an empty viewport). Portaling
 * to <body> guarantees the fixed box is always positioned against the real
 * viewport, and the inline styles (not just Tailwind classes) are a second
 * belt-and-braces guard so centering never depends on the stylesheet having
 * loaded yet.
 */
export function AuthLoadingScreen({ variant = "employer", message }: AuthLoadingScreenProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const messages = variant === "employer" ? employerMessages : candidateMessages;

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [messages.length]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100dvh", zIndex: 50 }}
    >
      <BrandLoader message={message || messages[messageIndex]} />
    </div>,
    document.body,
  );
}

export default AuthLoadingScreen;
