import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { FloatingParticles, GradientOrbs } from "./FloatingParticles";
import { StaggeredBarsLoader } from "./StaggeredBarsLoader";
import { useIsMobile } from "@/hooks/use-mobile";

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

export function AuthLoadingScreen({ variant = "employer", message }: AuthLoadingScreenProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const messages = variant === "employer" ? employerMessages : candidateMessages;
  
  // If a custom message is provided, show only that message
  const displayMessage = message || messages[messageIndex];

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div className="dark fixed inset-0 bg-[hsl(220,18%,10%)] z-50 flex items-center justify-center overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0">
        <GradientOrbs count={4} />
        <FloatingParticles count={30} intensity="subtle" />
      </div>

      {/* Subtle grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }}
      />

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative z-10 flex flex-col items-center"
      >
        {/* Staggered Bars Loader */}
        <div className="mb-8">
          <StaggeredBarsLoader size="lg" />
        </div>
        {/* Rotating messages or custom message */}
        <div className="h-8 overflow-hidden relative">
          <AnimatePresence mode="wait">
            <motion.p
              key={message ? "custom" : messageIndex}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="text-lg font-medium text-foreground text-center"
            >
              {displayMessage}
            </motion.p>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}