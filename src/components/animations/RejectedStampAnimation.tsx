import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface RejectedStampAnimationProps {
  isVisible: boolean;
  onComplete?: () => void;
}

export function RejectedStampAnimation({ isVisible, onComplete }: RejectedStampAnimationProps) {
  const [showSmoke, setShowSmoke] = useState(false);
  const [showGlow, setShowGlow] = useState(false);

  useEffect(() => {
    if (isVisible) {
      // Trigger smoke at moment of impact (150ms)
      const smokeTimer = setTimeout(() => {
        setShowSmoke(true);
        setShowGlow(true);
      }, 150);

      // Call onComplete after full animation
      const completeTimer = setTimeout(() => {
        onComplete?.();
      }, 800);

      return () => {
        clearTimeout(smokeTimer);
        clearTimeout(completeTimer);
      };
    } else {
      setShowSmoke(false);
      setShowGlow(false);
    }
  }, [isVisible, onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none overflow-hidden"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
        >
          {/* Screen shake container */}
          <motion.div
            className="relative flex items-center justify-center w-full h-full"
            animate={{
              x: [0, -6, 6, -4, 4, -2, 0],
              y: [0, 4, -4, 2, -2, 1, 0],
            }}
            transition={{
              duration: 0.25,
              delay: 0.15,
              ease: "easeOut",
            }}
          >
            {/* LEFT Smoke Puff */}
            {showSmoke && (
              <motion.div
                className="absolute rounded-full blur-md"
                style={{
                  width: 80,
                  height: 40,
                  background: "linear-gradient(90deg, hsl(var(--muted-foreground) / 0.4), hsl(var(--muted-foreground) / 0.1))",
                }}
                initial={{ 
                  x: -20, 
                  y: 0, 
                  scale: 0.3,
                  opacity: 0.7 
                }}
                animate={{ 
                  x: -120,
                  y: 10,
                  scale: [0.3, 1.2, 1.5],
                  opacity: [0.7, 0.5, 0],
                }}
                transition={{
                  duration: 0.4,
                  ease: "easeOut",
                }}
              />
            )}

            {/* RIGHT Smoke Puff */}
            {showSmoke && (
              <motion.div
                className="absolute rounded-full blur-md"
                style={{
                  width: 80,
                  height: 40,
                  background: "linear-gradient(-90deg, hsl(var(--muted-foreground) / 0.4), hsl(var(--muted-foreground) / 0.1))",
                }}
                initial={{ 
                  x: 20, 
                  y: 0, 
                  scale: 0.3,
                  opacity: 0.7 
                }}
                animate={{ 
                  x: 120,
                  y: 10,
                  scale: [0.3, 1.2, 1.5],
                  opacity: [0.7, 0.5, 0],
                }}
                transition={{
                  duration: 0.4,
                  ease: "easeOut",
                }}
              />
            )}

            {/* Small dust particles bursting from sides */}
            {showSmoke && (
              <>
                {/* Left particles */}
                {[...Array(4)].map((_, i) => (
                  <motion.div
                    key={`left-${i}`}
                    className="absolute rounded-full bg-muted-foreground/30"
                    style={{
                      width: 6 + i * 2,
                      height: 6 + i * 2,
                    }}
                    initial={{ x: -30, y: -5 + i * 5, scale: 0, opacity: 0.6 }}
                    animate={{ 
                      x: -60 - i * 20,
                      y: -10 + i * 8 + Math.random() * 20,
                      scale: [0, 1, 0.5],
                      opacity: [0.6, 0.4, 0],
                    }}
                    transition={{
                      duration: 0.3 + i * 0.05,
                      delay: i * 0.02,
                      ease: "easeOut",
                    }}
                  />
                ))}
                {/* Right particles */}
                {[...Array(4)].map((_, i) => (
                  <motion.div
                    key={`right-${i}`}
                    className="absolute rounded-full bg-muted-foreground/30"
                    style={{
                      width: 6 + i * 2,
                      height: 6 + i * 2,
                    }}
                    initial={{ x: 30, y: -5 + i * 5, scale: 0, opacity: 0.6 }}
                    animate={{ 
                      x: 60 + i * 20,
                      y: -10 + i * 8 + Math.random() * 20,
                      scale: [0, 1, 0.5],
                      opacity: [0.6, 0.4, 0],
                    }}
                    transition={{
                      duration: 0.3 + i * 0.05,
                      delay: i * 0.02,
                      ease: "easeOut",
                    }}
                  />
                ))}
              </>
            )}

            {/* The REJECTED Stamp */}
            <motion.div
              className="relative"
              initial={{ 
                y: -80,
                opacity: 1,
                rotate: -12,
                scaleY: 1,
              }}
              animate={{ 
                y: [null, 0],
                opacity: 1,
                rotate: -12,
                scaleY: [1, 0.85, 1.02, 1],
              }}
              transition={{
                y: {
                  duration: 0.15,
                  ease: [0.32, 0, 0.67, 0], // Fast ease-in for slam
                },
                scaleY: {
                  duration: 0.2,
                  delay: 0.15,
                  times: [0, 0.4, 0.7, 1],
                  ease: "easeOut",
                },
              }}
            >
              {/* Ink spread glow on impact */}
              {showGlow && (
                <motion.div
                  className="absolute inset-0 rounded-lg"
                  style={{
                    background: "hsl(var(--destructive) / 0.3)",
                    filter: "blur(20px)",
                  }}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ 
                    scale: [0.8, 1.4, 1.2],
                    opacity: [0, 0.8, 0],
                  }}
                  transition={{
                    duration: 0.4,
                    ease: "easeOut",
                  }}
                />
              )}
              
              {/* Main stamp box */}
              <div className="relative border-4 border-destructive rounded-lg px-8 py-3 bg-background/90 backdrop-blur-sm shadow-2xl">
                {/* Inner shadow for depth */}
                <div 
                  className="absolute inset-0 rounded-lg pointer-events-none"
                  style={{
                    boxShadow: "inset 0 2px 4px hsl(var(--destructive) / 0.2)",
                  }}
                />
                <span 
                  className="text-4xl md:text-5xl font-black text-destructive tracking-[0.2em] uppercase select-none"
                  style={{ 
                    textShadow: "2px 2px 0 hsl(var(--destructive) / 0.3), -1px -1px 0 hsl(var(--destructive) / 0.1)",
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
