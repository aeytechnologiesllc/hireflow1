import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { FloatingParticles, GradientOrbs } from "./FloatingParticles";
import { AnimatedProgressRing } from "./AnimatedProgressRing";

// Import AVA poses
import avaThinking from "@/assets/ava-thinking.png";
import avaSpeaking from "@/assets/ava-speaking.png";

export type AvaExpression = "thinking" | "speaking";

interface StorytellingLoaderProps {
  messages: string[];
  avaExpression?: AvaExpression;
  messageInterval?: number;
  className?: string;
  showProgress?: boolean;
  title?: string;
}

const avaImages: Record<AvaExpression, string> = {
  thinking: avaThinking,
  speaking: avaSpeaking,
};

export function StorytellingLoader({
  messages,
  avaExpression = "thinking",
  messageInterval = 2500,
  className = "",
  showProgress = true,
  title = "Processing...",
}: StorytellingLoaderProps) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  useEffect(() => {
    if (messages.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % messages.length);
    }, messageInterval);

    return () => clearInterval(interval);
  }, [messages, messageInterval]);

  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`}>
      {/* Background effects */}
      <GradientOrbs count={3} />
      <FloatingParticles count={15} intensity="subtle" />

      {/* AVA with glow */}
      <motion.div
        className="relative mb-8"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {/* Glow behind AVA */}
        <motion.div
          className="absolute inset-0 rounded-full blur-2xl"
          style={{
            background: `radial-gradient(circle, hsl(var(--primary) / 0.3) 0%, transparent 70%)`,
            transform: "scale(1.5)",
          }}
          animate={{
            opacity: [0.4, 0.6, 0.4],
            scale: [1.4, 1.6, 1.4],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* AVA image */}
        <motion.img
          src={avaImages[avaExpression]}
          alt="Ava"
          className="relative w-32 h-32 object-contain"
          animate={{
            y: [0, -5, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Progress ring around AVA */}
        {showProgress && (
          <div className="absolute -inset-4">
            <AnimatedProgressRing size={160} strokeWidth={3} />
          </div>
        )}
      </motion.div>

      {/* Title */}
      <motion.h2
        className="text-xl font-semibold text-foreground mb-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {title}
      </motion.h2>

      {/* Rotating messages */}
      <div className="h-8 relative">
        <AnimatePresence mode="wait">
          <motion.p
            key={currentMessageIndex}
            className="text-muted-foreground text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {messages[currentMessageIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Subtle progress dots */}
      <div className="flex gap-2 mt-6">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-primary/60"
            animate={{
              opacity: [0.3, 1, 0.3],
              scale: [0.8, 1.2, 0.8],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </div>
  );
}
