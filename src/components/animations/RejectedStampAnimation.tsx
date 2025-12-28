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
      // Trigger smoke at moment of impact (100ms - faster for direct slam)
      const smokeTimer = setTimeout(() => {
        setShowSmoke(true);
        setShowGlow(true);
      }, 100);

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
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none overflow-hidden"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
        >
          {/* Screen shake container */}
          <motion.div
            className="relative flex items-center justify-center w-full h-full"
            animate={{
              x: [0, -8, 8, -5, 5, -2, 0],
              y: [0, 5, -5, 3, -3, 1, 0],
            }}
            transition={{
              duration: 0.3,
              delay: 0.1,
              ease: "easeOut",
            }}
          >
            {/* Smoke puffs that burst outward on impact */}
            {showSmoke && (
              <>
                {/* LEFT Smoke Puff - main cloud */}
                <motion.div
                  className="absolute rounded-full blur-xl"
                  style={{
                    width: 100,
                    height: 60,
                    background: "radial-gradient(ellipse, hsl(var(--muted-foreground) / 0.5), transparent 70%)",
                  }}
                  initial={{ 
                    x: 0, 
                    y: 0, 
                    scale: 0.2,
                    opacity: 0.8 
                  }}
                  animate={{ 
                    x: -140,
                    y: 10,
                    scale: [0.2, 1.5, 2],
                    opacity: [0.8, 0.5, 0],
                  }}
                  transition={{
                    duration: 0.5,
                    ease: "easeOut",
                  }}
                />

                {/* RIGHT Smoke Puff - main cloud */}
                <motion.div
                  className="absolute rounded-full blur-xl"
                  style={{
                    width: 100,
                    height: 60,
                    background: "radial-gradient(ellipse, hsl(var(--muted-foreground) / 0.5), transparent 70%)",
                  }}
                  initial={{ 
                    x: 0, 
                    y: 0, 
                    scale: 0.2,
                    opacity: 0.8 
                  }}
                  animate={{ 
                    x: 140,
                    y: 10,
                    scale: [0.2, 1.5, 2],
                    opacity: [0.8, 0.5, 0],
                  }}
                  transition={{
                    duration: 0.5,
                    ease: "easeOut",
                  }}
                />

                {/* TOP-LEFT Smoke wisp */}
                <motion.div
                  className="absolute rounded-full blur-lg"
                  style={{
                    width: 60,
                    height: 40,
                    background: "radial-gradient(ellipse, hsl(var(--muted-foreground) / 0.4), transparent 70%)",
                  }}
                  initial={{ x: 0, y: 0, scale: 0.1, opacity: 0.7 }}
                  animate={{ 
                    x: -100,
                    y: -50,
                    scale: [0.1, 1, 1.3],
                    opacity: [0.7, 0.4, 0],
                  }}
                  transition={{ duration: 0.4, ease: "easeOut", delay: 0.02 }}
                />

                {/* TOP-RIGHT Smoke wisp */}
                <motion.div
                  className="absolute rounded-full blur-lg"
                  style={{
                    width: 60,
                    height: 40,
                    background: "radial-gradient(ellipse, hsl(var(--muted-foreground) / 0.4), transparent 70%)",
                  }}
                  initial={{ x: 0, y: 0, scale: 0.1, opacity: 0.7 }}
                  animate={{ 
                    x: 100,
                    y: -50,
                    scale: [0.1, 1, 1.3],
                    opacity: [0.7, 0.4, 0],
                  }}
                  transition={{ duration: 0.4, ease: "easeOut", delay: 0.02 }}
                />

                {/* BOTTOM-LEFT Smoke wisp */}
                <motion.div
                  className="absolute rounded-full blur-lg"
                  style={{
                    width: 50,
                    height: 35,
                    background: "radial-gradient(ellipse, hsl(var(--muted-foreground) / 0.35), transparent 70%)",
                  }}
                  initial={{ x: 0, y: 0, scale: 0.1, opacity: 0.6 }}
                  animate={{ 
                    x: -80,
                    y: 60,
                    scale: [0.1, 1.2, 1.5],
                    opacity: [0.6, 0.3, 0],
                  }}
                  transition={{ duration: 0.45, ease: "easeOut", delay: 0.03 }}
                />

                {/* BOTTOM-RIGHT Smoke wisp */}
                <motion.div
                  className="absolute rounded-full blur-lg"
                  style={{
                    width: 50,
                    height: 35,
                    background: "radial-gradient(ellipse, hsl(var(--muted-foreground) / 0.35), transparent 70%)",
                  }}
                  initial={{ x: 0, y: 0, scale: 0.1, opacity: 0.6 }}
                  animate={{ 
                    x: 80,
                    y: 60,
                    scale: [0.1, 1.2, 1.5],
                    opacity: [0.6, 0.3, 0],
                  }}
                  transition={{ duration: 0.45, ease: "easeOut", delay: 0.03 }}
                />
              </>
            )}

            {/* Dust particles bursting from center */}
            {showSmoke && (
              <>
                {/* Particles bursting in all directions */}
                {[...Array(8)].map((_, i) => {
                  const angle = (i / 8) * Math.PI * 2;
                  const distance = 80 + Math.random() * 40;
                  return (
                    <motion.div
                      key={`particle-${i}`}
                      className="absolute rounded-full bg-muted-foreground/40"
                      style={{
                        width: 4 + Math.random() * 4,
                        height: 4 + Math.random() * 4,
                      }}
                      initial={{ x: 0, y: 0, scale: 0, opacity: 0.7 }}
                      animate={{ 
                        x: Math.cos(angle) * distance,
                        y: Math.sin(angle) * distance,
                        scale: [0, 1.5, 0.5],
                        opacity: [0.7, 0.5, 0],
                      }}
                      transition={{
                        duration: 0.35,
                        delay: i * 0.01,
                        ease: "easeOut",
                      }}
                    />
                  );
                })}
              </>
            )}

            {/* The Stamp Impression - Direct slam effect */}
            <motion.div
              className="relative flex flex-col items-center"
              initial={{ 
                scale: 1.4,
                opacity: 0,
                rotate: -12,
              }}
              animate={{ 
                scale: [1.4, 0.92, 1.02, 1],
                opacity: 1,
                rotate: -12,
              }}
              transition={{
                scale: {
                  duration: 0.25,
                  times: [0, 0.5, 0.75, 1],
                  ease: [0.22, 1, 0.36, 1], // Custom ease for impact feel
                },
                opacity: {
                  duration: 0.08,
                },
              }}
            >
              {/* Ink spread glow on impact */}
              {showGlow && (
                <motion.div
                  className="absolute rounded-lg"
                  style={{
                    top: -20,
                    bottom: -20,
                    left: -40,
                    right: -40,
                    background: "hsl(var(--destructive) / 0.35)",
                    filter: "blur(25px)",
                  }}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ 
                    scale: [0.5, 1.5, 1.3],
                    opacity: [0, 0.9, 0],
                  }}
                  transition={{
                    duration: 0.45,
                    ease: "easeOut",
                  }}
                />
              )}
              
              {/* Main stamp text box */}
              <motion.div
                className="relative"
                animate={{
                  scaleY: showGlow ? [1, 0.88, 1.03, 1] : 1,
                  scaleX: showGlow ? [1, 1.04, 0.98, 1] : 1,
                }}
                transition={{
                  duration: 0.2,
                  times: [0, 0.4, 0.7, 1],
                  ease: "easeOut",
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
