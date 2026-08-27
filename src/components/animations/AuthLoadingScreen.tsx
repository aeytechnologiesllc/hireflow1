import { useEffect, useState } from "react";
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

  return (
    <div className="fixed inset-0 z-50">
      <BrandLoader message={message || messages[messageIndex]} />
    </div>
  );
}

export default AuthLoadingScreen;
