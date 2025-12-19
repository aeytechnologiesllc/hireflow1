import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { FloatingParticles, GradientOrbs } from "./FloatingParticles";

interface AuthLoadingScreenProps {
  variant?: "employer" | "candidate";
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

export function AuthLoadingScreen({ variant = "employer" }: AuthLoadingScreenProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const messages = variant === "employer" ? employerMessages : candidateMessages;

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div className="fixed inset-0 bg-background z-50 flex items-center justify-center overflow-hidden">
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
        {/* Animated ring */}
        <div className="relative mb-8">
          {/* Outer glow ring */}
          <motion.div
            className="absolute -inset-4 rounded-full"
            style={{
              background: `radial-gradient(circle, hsl(var(--primary) / 0.2) 0%, transparent 70%)`,
            }}
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.4, 0.7, 0.4],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Spinning progress ring */}
          <svg 
            width={100} 
            height={100} 
            style={{ transform: 'rotate(-90deg)' }}
          >
            {/* Background ring */}
            <circle
              cx={50}
              cy={50}
              r={44}
              fill="none"
              stroke="hsl(var(--primary) / 0.1)"
              strokeWidth={3}
            />
            {/* Animated ring */}
            <motion.circle
              cx={50}
              cy={50}
              r={44}
              fill="none"
              stroke="url(#authLoadingGradient)"
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={44 * 2 * Math.PI}
              strokeDashoffset={44 * 2 * Math.PI * 0.7}
              animate={{ rotate: 360 }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "linear",
              }}
              style={{ transformOrigin: "center" }}
            />
            <defs>
              <linearGradient id="authLoadingGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="hsl(var(--primary))" />
                <stop offset="50%" stopColor="hsl(var(--accent))" />
                <stop offset="100%" stopColor="hsl(var(--primary))" />
              </linearGradient>
            </defs>
          </svg>

          {/* Center pulsing dot */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
          >
            <motion.div
              className="w-3 h-3 rounded-full bg-primary"
              animate={{
                scale: [1, 1.4, 1],
                opacity: [0.6, 1, 0.6],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </motion.div>
        </div>

        {/* Rotating messages */}
        <div className="h-8 overflow-hidden relative">
          <AnimatePresence mode="wait">
            <motion.p
              key={messageIndex}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="text-lg font-medium text-foreground text-center"
            >
              {messages[messageIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}