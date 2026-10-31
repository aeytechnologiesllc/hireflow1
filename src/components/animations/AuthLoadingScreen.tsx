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

/** When this page load's first AuthLoadingScreen came up (ms), so the
 *  messages carry on from one loader to the next instead of starting over. */
let messagesFrom: number | null = null;

/**
 * The wait between sign-in and the app. One brand moment for both audiences —
 * BrandLoader presses the green seal; only the cycling copy differs. The old
 * version was a WebGL orb on hardcoded pre-design green for employers and a
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
  const messages = variant === "employer" ? employerMessages : candidateMessages;
  // One message every 2 s, counted from the first loader of this page load,
  // and it stays on "Almost there..." rather than starting over.
  const indexNow = () => Math.min(messages.length - 1, Math.floor((Date.now() - (messagesFrom ?? Date.now())) / 2000));
  const [messageIndex, setMessageIndex] = useState(() => {
    messagesFrom ??= Date.now();
    return indexNow();
  });

  useEffect(() => {
    const interval = setInterval(() => setMessageIndex(indexNow()), 500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "var(--ground, #DEE3D5)" }}
    >
      <BrandLoader message={message || messages[messageIndex]} />
    </div>,
    document.body,
  );
}

export default AuthLoadingScreen;
