import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useState, useEffect } from "react";
import { FloatingParticles, GradientOrbs } from "./FloatingParticles";
import { StaggeredBarsLoader } from "./StaggeredBarsLoader";
import { useIsMobile } from "@/hooks/use-mobile";
import { AvaOrb } from "@/components/ava/AvaOrb";
import { ORB_SIZE } from "@/components/ava/orbSizes";

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
  const isMobile = useIsMobile();
  const reduceMotion = useReducedMotion();
  const messages = variant === "employer" ? employerMessages : candidateMessages;
  const isEmployer = variant === "employer";

  const displayMessage = message || messages[messageIndex];

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [messages.length]);

  if (isEmployer) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
        style={{ background: "#0a2019", color: "#eef6f1" }}
      >
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
        />
        <div
          className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(238,246,241,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(238,246,241,0.5) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-[#1f9e77]/15 rounded-full blur-[120px] pointer-events-none" />

        <motion.div
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="relative z-10 flex flex-col items-center px-6"
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          <AvaOrb size={ORB_SIZE.md} reflection={false} />
          <div className="mt-8 h-8 overflow-hidden relative">
            <AnimatePresence mode="wait">
              <motion.p
                key={message ? "custom" : messageIndex}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -12 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                className="text-base font-medium text-center"
                style={{ color: "rgba(238,246,241,0.75)" }}
              >
                {displayMessage}
              </motion.p>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="dark fixed inset-0 bg-[hsl(220,18%,10%)] z-50 flex items-center justify-center overflow-hidden">
      {!isMobile && (
        <div className="absolute inset-0">
          <GradientOrbs count={4} />
          <FloatingParticles count={30} intensity="subtle" />
        </div>
      )}

      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />

      <motion.div
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className="relative z-10 flex flex-col items-center"
      >
        <div className="mb-8">
          <StaggeredBarsLoader size="lg" />
        </div>
        <div className="h-8 overflow-hidden relative">
          <AnimatePresence mode="wait">
            <motion.p
              key={message ? "custom" : messageIndex}
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -12 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
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
