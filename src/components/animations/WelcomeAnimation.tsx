import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { FloatingParticles, GradientOrbs } from "./FloatingParticles";

// Import AVA waving
import avaWaving from "@/assets/ava-waving.png";

interface WelcomeAnimationProps {
  name?: string;
  onComplete?: () => void;
  duration?: number;
}

export function WelcomeAnimation({
  name,
  onComplete,
  duration = 2500,
}: WelcomeAnimationProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    // Show text after AVA appears
    const textTimer = setTimeout(() => setShowText(true), 400);
    
    // Auto-hide after duration
    const hideTimer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onComplete?.(), 400);
    }, duration);

    return () => {
      clearTimeout(textTimer);
      clearTimeout(hideTimer);
    };
  }, [duration, onComplete]);

  const welcomeText = name ? `Welcome, ${name}!` : "Welcome to HireFlow!";

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/98 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          {/* Background effects */}
          <GradientOrbs count={4} />
          <FloatingParticles count={25} intensity="medium" />

          <div className="relative flex flex-col items-center text-center">
            {/* AVA waving */}
            <motion.div
              className="relative mb-8"
              initial={{ scale: 0, rotate: -20, y: 50 }}
              animate={{ scale: 1, rotate: 0, y: 0 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 15,
              }}
            >
              {/* Glow effect */}
              <motion.div
                className="absolute inset-0 rounded-full blur-3xl"
                style={{
                  background: `radial-gradient(circle, hsl(var(--primary) / 0.4) 0%, transparent 60%)`,
                  transform: "scale(2.5)",
                }}
                animate={{
                  opacity: [0.3, 0.6, 0.3],
                  scale: [2.2, 2.8, 2.2],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />

              {/* Gentle wave animation for AVA */}
              <motion.img
                src={avaWaving}
                alt="Ava waving"
                className="relative w-40 h-40 object-contain"
                animate={{
                  rotate: [0, 2, -2, 0],
                }}
                transition={{
                  duration: 0.5,
                  repeat: 3,
                  ease: "easeInOut",
                }}
              />
            </motion.div>

            {/* Welcome text with typewriter effect feel */}
            <AnimatePresence>
              {showText && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 200,
                    damping: 20,
                  }}
                >
                  <motion.h1
                    className="text-3xl font-bold text-foreground mb-3"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                  >
                    {welcomeText}
                  </motion.h1>
                  
                  <motion.p
                    className="text-muted-foreground"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    Let's find your next opportunity
                  </motion.p>

                  {/* Subtle brand touch */}
                  <motion.div
                    className="mt-6 flex items-center justify-center gap-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.6 }}
                    transition={{ delay: 0.5 }}
                  >
                    <div className="w-8 h-0.5 bg-gradient-to-r from-transparent to-primary/50" />
                    <div className="w-2 h-2 rounded-full bg-primary/50" />
                    <div className="w-8 h-0.5 bg-gradient-to-l from-transparent to-primary/50" />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
