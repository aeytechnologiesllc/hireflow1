import { motion, AnimatePresence } from "framer-motion";
import { memo, useEffect, useState } from "react";
import { FloatingParticles, GradientOrbs } from "./FloatingParticles";
import { StaggeredBarsLoader } from "./StaggeredBarsLoader";

interface StorytellingLoaderProps {
  messages: string[];
  messageInterval?: number;
  className?: string;
  showProgress?: boolean;
  title?: string;
}

const StoryBackdrop = memo(function StoryBackdrop() {
  return (
    <>
      <GradientOrbs count={2} className="opacity-80" />
      <FloatingParticles count={8} intensity="subtle" />
    </>
  );
});

const StoryLoaderMark = memo(function StoryLoaderMark() {
  return (
    <motion.div
      className="relative mb-8"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <StaggeredBarsLoader size="lg" />
    </motion.div>
  );
});

export function StorytellingLoader({
  messages,
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
      <StoryBackdrop />
      <StoryLoaderMark />

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
