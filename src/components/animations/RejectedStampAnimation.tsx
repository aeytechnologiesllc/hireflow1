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
                  y: 30, 
                  scale: 0.3,
                  opacity: 0.7 
                }}
                animate={{ 
                  x: -120,
                  y: 40,
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
                  y: 30, 
                  scale: 0.3,
                  opacity: 0.7 
                }}
                animate={{ 
                  x: 120,
                  y: 40,
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
                    initial={{ x: -30, y: 25 + i * 5, scale: 0, opacity: 0.6 }}
                    animate={{ 
                      x: -60 - i * 20,
                      y: 20 + i * 8 + Math.random() * 20,
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
                    initial={{ x: 30, y: 25 + i * 5, scale: 0, opacity: 0.6 }}
                    animate={{ 
                      x: 60 + i * 20,
                      y: 20 + i * 8 + Math.random() * 20,
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

            {/* The Full Stamp Assembly (Handle + Base) */}
            <motion.div
              className="relative flex flex-col items-center"
              initial={{ 
                y: -200,
                opacity: 1,
                rotate: -12,
              }}
              animate={{ 
                y: [null, 0, -8, 0],
                opacity: 1,
                rotate: -12,
              }}
              transition={{
                y: {
                  duration: 0.35,
                  times: [0, 0.4, 0.7, 1],
                  ease: [0.32, 0, 0.67, 0], // Fast ease-in for slam, then spring
                },
              }}
            >
              {/* Wooden Handle - Top grip */}
              <motion.div
                className="relative"
                animate={{
                  y: showGlow ? [0, -4, 0] : 0,
                }}
                transition={{
                  y: { duration: 0.2, delay: 0.02 },
                }}
              >
                {/* Main wooden handle body */}
                <div 
                  className="relative rounded-t-lg"
                  style={{
                    width: 70,
                    height: 40,
                    background: "linear-gradient(180deg, #A67C52 0%, #8B5E3C 30%, #6B4423 70%, #5D3A1A 100%)",
                    boxShadow: "inset 0 2px 4px rgba(255,255,255,0.2), inset 0 -3px 6px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.3)",
                    borderRadius: "10px 10px 4px 4px",
                  }}
                >
                  {/* Wood grain texture lines */}
                  <div 
                    className="absolute inset-0 opacity-20"
                    style={{
                      background: `repeating-linear-gradient(
                        0deg,
                        transparent,
                        transparent 4px,
                        rgba(0,0,0,0.1) 4px,
                        rgba(0,0,0,0.1) 5px
                      )`,
                      borderRadius: "10px 10px 4px 4px",
                    }}
                  />
                  {/* Highlight on top edge */}
                  <div 
                    className="absolute top-0 left-0 right-0 h-2 rounded-t-lg"
                    style={{
                      background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 100%)",
                    }}
                  />
                </div>
              </motion.div>

              {/* Metal Band connecting handle to rubber base */}
              <div 
                className="relative"
                style={{
                  width: 60,
                  height: 10,
                  background: "linear-gradient(180deg, #999 0%, #777 40%, #555 100%)",
                  boxShadow: "inset 0 1px 2px rgba(255,255,255,0.3), inset 0 -1px 2px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.2)",
                }}
              >
                {/* Metal shine highlight */}
                <div 
                  className="absolute top-0 left-1/4 right-1/4 h-1"
                  style={{
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                  }}
                />
              </div>

              {/* Rubber/Ink Pad section */}
              <div 
                className="relative"
                style={{
                  width: 56,
                  height: 8,
                  background: "linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)",
                  boxShadow: "inset 0 -1px 2px rgba(0,0,0,0.5)",
                }}
              />

              {/* Ink spread glow on impact */}
              {showGlow && (
                <motion.div
                  className="absolute rounded-lg"
                  style={{
                    bottom: -15,
                    left: -30,
                    right: -30,
                    height: 80,
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
              
              {/* Main stamp text box (the "rubber" part that makes the impression) */}
              <motion.div
                className="relative"
                animate={{
                  scaleY: showGlow ? [1, 0.85, 1.02, 1] : 1,
                }}
                transition={{
                  scaleY: {
                    duration: 0.2,
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
