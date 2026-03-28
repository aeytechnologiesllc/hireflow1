import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import avaOrb from "@/assets/ava-orb.png";

interface AvaWorkflowGenerationOverlayProps {
  isVisible: boolean;
  jobTitle: string;
  difficulty: string;
  minDuration?: number;
  onComplete?: () => void;
  isApiComplete?: boolean;
  mode?: "workflow" | "full_draft";
}

const OVERLAY_CONFIG = {
  workflow: {
    title: "Creating your screening plan",
    subtitlePrefix: "Designing the candidate journey for",
    minDuration: 10000,
    messages: [
      { text: "Analyzing job role...", until: 2200 },
      { text: "Generating screening questions...", until: 4600 },
      { text: "Designing skill assessments...", until: 7200 },
      { text: "Building hiring workflow...", until: 9800 },
      { text: "Finalizing screening plan...", until: Infinity },
    ],
  },
  full_draft: {
    title: "Creating your job with Ava",
    subtitlePrefix: "Generating the full draft for",
    minDuration: 8500,
    messages: [
      { text: "Reviewing your Ava setup...", until: 2200 },
      { text: "Writing the job description baseline...", until: 4600 },
      { text: "Drafting responsibilities and requirements...", until: 7200 },
      { text: "Generating skills, benefits, and pay guidance...", until: 9500 },
      { text: "Designing the screening plan...", until: Infinity },
    ],
  },
} as const;

export default function AvaWorkflowGenerationOverlay({ 
  isVisible, 
  jobTitle, 
  difficulty,
  minDuration,
  onComplete,
  isApiComplete = false,
  mode = "workflow",
}: AvaWorkflowGenerationOverlayProps) {
  const config = OVERLAY_CONFIG[mode];
  const [progressRing, setProgressRing] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const startTimeRef = useRef<number>(0);
  const completionTimerRef = useRef<number | null>(null);

  // Particles - reduced to 20
  const particles = useMemo(() => 
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.5 + 1,
      duration: Math.random() * 5 + 4,
      delay: Math.random() * 3,
      color: Math.random() > 0.5 ? "primary" : "accent",
    }))
  , []);

  // Reset on show
  useEffect(() => {
    if (isVisible) {
      startTimeRef.current = Date.now();
      setProgressRing(0);
      setMessageIndex(0);
    }

    return () => {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
    };
  }, [isVisible]);

  // Progress + message index
  useEffect(() => {
    if (!isVisible) return;
    const overlayDuration = minDuration ?? config.minDuration;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const progress = Math.min((elapsed / overlayDuration) * 100, 96);
      setProgressRing(progress);

      // Update message index based on elapsed time
      const newIndex = config.messages.findIndex(m => elapsed < m.until);
      setMessageIndex(newIndex === -1 ? config.messages.length - 1 : newIndex);
    }, 50);
    return () => clearInterval(interval);
  }, [config.messages, config.minDuration, isVisible, minDuration]);

  // Hold below 100% until the API is done, then finish and dismiss quickly.
  useEffect(() => {
    if (!isVisible || !isApiComplete) return;

    const overlayDuration = minDuration ?? config.minDuration;
    const elapsed = Date.now() - startTimeRef.current;
    const remaining = Math.max(overlayDuration - elapsed, 0);

    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
    }

    completionTimerRef.current = window.setTimeout(() => {
      setMessageIndex(config.messages.length - 1);
      setProgressRing(100);

      if (onComplete) {
        completionTimerRef.current = window.setTimeout(() => {
          onComplete();
          completionTimerRef.current = null;
        }, 220);
      } else {
        completionTimerRef.current = null;
      }
    }, remaining);

    return () => {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
    };
  }, [config.messages.length, config.minDuration, isApiComplete, isVisible, minDuration, onComplete]);

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8 }}
        className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      >
        {/* Deep backdrop */}
        <div className="absolute inset-0 bg-[hsl(220,20%,2%)]" />

        {/* Atmospheric gradients */}
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [0.15, 0.3, 0.15] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full blur-[200px]"
          style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.4), transparent)" }}
        />
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.25, 0.1] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 3 }}
          className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full blur-[180px]"
          style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.4), transparent)" }}
        />

        {/* Subtle particles */}
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            style={{
              width: p.size,
              height: p.size,
              left: `${p.x}%`,
              top: `${p.y}%`,
              background: p.color === "primary" 
                ? "hsl(var(--primary) / 0.5)" 
                : "hsl(var(--accent) / 0.5)",
            }}
            animate={{
              y: [-10, -80],
              opacity: [0, 0.6, 0],
            }}
            transition={{
              duration: p.duration,
              repeat: Infinity,
              delay: p.delay,
              ease: "easeOut",
            }}
          />
        ))}

        {/* Main container */}
        <div className="relative z-10 flex flex-col items-center px-4">
          {/* Orb container - fixed height */}
          <div className="relative w-[200px] h-[200px] flex items-center justify-center">
            {/* Single rotating orbit ring */}
            <motion.div
              className="absolute inset-0 rounded-full border border-primary/20"
              style={{ width: 180, height: 180, left: 10, top: 10 }}
              animate={{ rotate: 360 }}
              transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            >
              <div
                className="absolute w-2 h-2 rounded-full bg-primary/80 shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
                style={{ top: -4, left: "50%", marginLeft: -4 }}
              />
            </motion.div>

            {/* Progress ring */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="85" fill="none" stroke="hsl(var(--border) / 0.2)" strokeWidth="2" />
              <motion.circle
                cx="100" cy="100" r="85"
                fill="none"
                stroke="url(#overlayProgressGrad)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={534}
                strokeDashoffset={534 - (534 * progressRing) / 100}
                transform="rotate(-90 100 100)"
              />
              <defs>
                <linearGradient id="overlayProgressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="hsl(var(--primary))" />
                  <stop offset="100%" stopColor="hsl(var(--accent))" />
                </linearGradient>
              </defs>
            </svg>

            {/* Glow behind orb */}
            <motion.div
              className="absolute rounded-full"
              style={{
                width: 120, height: 120,
                left: 40, top: 40,
                background: "radial-gradient(circle, hsl(var(--primary) / 0.35), transparent 70%)",
              }}
              animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* AVA orb */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1, type: "spring", bounce: 0.3 }}
            >
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="relative w-20 h-20">
                  <img
                    src={avaOrb}
                    alt="AVA"
                    className="w-full h-full object-contain drop-shadow-[0_0_25px_hsl(var(--primary)/0.5)]"
                  />
                </div>
              </motion.div>
            </motion.div>
          </div>

          {/* Title section - explicit spacing from orb */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="text-center mt-10 mb-3"
          >
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-1">
              {config.title}
            </h2>
            <p className="text-muted-foreground text-sm">
              {config.subtitlePrefix}{" "}
              <span className="text-primary font-medium">{jobTitle}</span>
            </p>
          </motion.div>

          {/* Smart status messages */}
          <div className="h-8 flex items-center justify-center mt-3">
            <AnimatePresence mode="wait">
              <motion.p
                key={messageIndex}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4 }}
                className="text-sm text-muted-foreground/80"
              >
                {config.messages[messageIndex].text}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Bottom progress pill */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="mt-8"
          >
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-card/40 border border-border/30">
              <motion.div
                className="w-2 h-2 rounded-full bg-primary"
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span className="text-sm text-muted-foreground">
                {Math.round(progressRing)}% complete
              </span>
            </div>
          </motion.div>
        </div>

        {/* Completion burst */}
        <AnimatePresence>
          {progressRing >= 95 && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.3), transparent 70%)" }}
                initial={{ width: 100, height: 100, opacity: 0 }}
                animate={{ width: 800, height: 800, opacity: [0, 0.4, 0] }}
                transition={{ duration: 2, ease: "easeOut" }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
