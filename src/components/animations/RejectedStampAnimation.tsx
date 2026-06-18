import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface RejectedStampAnimationProps {
  isVisible: boolean;
  onComplete?: () => void;
}

export function RejectedStampAnimation({ isVisible, onComplete }: RejectedStampAnimationProps) {
  const [showEffects, setShowEffects] = useState(false);

  useEffect(() => {
    if (isVisible) {
      // Trigger effects immediately on stamp appearance
      const effectsTimer = setTimeout(() => {
        setShowEffects(true);
      }, 50);

      // Call onComplete after full animation
      const completeTimer = setTimeout(() => {
        onComplete?.();
      }, 600);

      return () => {
        clearTimeout(effectsTimer);
        clearTimeout(completeTimer);
      };
    } else {
      setShowEffects(false);
    }
  }, [isVisible, onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none overflow-hidden"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
        >
          {/* Screen shake container */}
          <motion.div
            className="relative flex items-center justify-center"
            animate={{
              x: [0, -6, 6, -3, 3, 0],
              y: [0, 3, -3, 2, -1, 0],
            }}
            transition={{
              duration: 0.2,
              ease: "easeOut",
            }}
          >
            {/* Ink flash burst - appears instantly */}
            <motion.div
              className="absolute rounded-lg"
              style={{
                width: 320,
                height: 120,
                background: "radial-gradient(ellipse, color-mix(in oklab, var(--destructive) 60%, transparent), transparent 60%)",
                filter: "blur(30px)",
              }}
              initial={{ scale: 0.3, opacity: 1 }}
              animate={{ 
                scale: [0.3, 1.8],
                opacity: [1, 0],
              }}
              transition={{
                duration: 0.25,
                ease: "easeOut",
              }}
            />

            {/* Simple radial smoke burst */}
            {showEffects && (
              <>
                {[0, 1, 2, 3].map((i) => {
                  const angle = (i / 4) * Math.PI * 2 - Math.PI / 4;
                  const distance = 100;
                  return (
                    <motion.div
                      key={i}
                      className="absolute rounded-full blur-xl"
                      style={{
                        width: 80,
                        height: 50,
                        background: "radial-gradient(ellipse, color-mix(in oklab, var(--muted-foreground) 40%, transparent), transparent 70%)",
                      }}
                      initial={{ 
                        x: 0, 
                        y: 0, 
                        scale: 0.3,
                        opacity: 0.7 
                      }}
                      animate={{ 
                        x: Math.cos(angle) * distance,
                        y: Math.sin(angle) * distance,
                        scale: 1.5,
                        opacity: 0,
                      }}
                      transition={{
                        duration: 0.3,
                        ease: "easeOut",
                      }}
                    />
                  );
                })}
              </>
            )}

            {/* The Stamp - appears IN PLACE with squish */}
            <motion.div
              className="relative"
              initial={{ 
                opacity: 0,
                scale: 1,
                scaleY: 1.15,
                scaleX: 0.92,
                rotate: -12,
              }}
              animate={{ 
                opacity: 1,
                scale: 1,
                scaleY: [1.15, 0.92, 1.02, 1],
                scaleX: [0.92, 1.08, 0.98, 1],
                rotate: -12,
              }}
              transition={{
                opacity: { duration: 0.02 },
                scaleY: {
                  duration: 0.15,
                  times: [0, 0.4, 0.7, 1],
                  ease: "easeOut",
                },
                scaleX: {
                  duration: 0.15,
                  times: [0, 0.4, 0.7, 1],
                  ease: "easeOut",
                },
              }}
            >
              <div className="relative border-4 border-destructive rounded-lg px-8 py-3 bg-background/90 backdrop-blur-sm shadow-2xl">
                {/* Inner shadow for depth */}
                <div 
                  className="absolute inset-0 rounded-lg pointer-events-none"
                  style={{
                    boxShadow: "inset 0 2px 4px color-mix(in oklab, var(--destructive) 20%, transparent)",
                  }}
                />
                <span 
                  className="text-4xl md:text-5xl font-black text-destructive tracking-[0.2em] uppercase select-none"
                  style={{ 
                    textShadow: "2px 2px 0 color-mix(in oklab, var(--destructive) 30%, transparent), -1px -1px 0 color-mix(in oklab, var(--destructive) 10%, transparent)",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                  }}
                >
                  REJECTED
                </span>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
