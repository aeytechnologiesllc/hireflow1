import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface RejectedStampAnimationProps {
  isVisible: boolean;
  onComplete?: () => void;
}

// Generate dust particles
const generateDustParticles = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    angle: (i / count) * 360 + Math.random() * 30,
    distance: 60 + Math.random() * 80,
    size: 4 + Math.random() * 8,
    delay: Math.random() * 0.1,
    duration: 0.4 + Math.random() * 0.3,
  }));
};

export function RejectedStampAnimation({ isVisible, onComplete }: RejectedStampAnimationProps) {
  const [showDust, setShowDust] = useState(false);
  const [dustParticles] = useState(() => generateDustParticles(20));

  useEffect(() => {
    if (isVisible) {
      // Trigger dust particles at the moment of impact
      const dustTimer = setTimeout(() => {
        setShowDust(true);
      }, 250);

      // Call onComplete after full animation
      const completeTimer = setTimeout(() => {
        onComplete?.();
      }, 800);

      return () => {
        clearTimeout(dustTimer);
        clearTimeout(completeTimer);
      };
    } else {
      setShowDust(false);
    }
  }, [isVisible, onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Screen shake container */}
          <motion.div
            className="relative flex items-center justify-center w-full h-full"
            animate={{
              x: [0, -3, 3, -2, 2, 0],
              y: [0, 2, -2, 1, -1, 0],
            }}
            transition={{
              duration: 0.3,
              delay: 0.25,
              ease: "easeOut",
            }}
          >
            {/* Dust/Smoke Particles */}
            {showDust && dustParticles.map((particle) => {
              const angleRad = (particle.angle * Math.PI) / 180;
              const x = Math.cos(angleRad) * particle.distance;
              const y = Math.sin(angleRad) * particle.distance;
              
              return (
                <motion.div
                  key={particle.id}
                  className="absolute rounded-full"
                  style={{
                    width: particle.size,
                    height: particle.size,
                    backgroundColor: `hsl(var(--muted-foreground) / ${0.3 + Math.random() * 0.3})`,
                  }}
                  initial={{ 
                    x: 0, 
                    y: 0, 
                    scale: 0,
                    opacity: 0.8 
                  }}
                  animate={{ 
                    x: x,
                    y: y,
                    scale: [0, 1.5, 0.5],
                    opacity: [0.8, 0.6, 0],
                  }}
                  transition={{
                    duration: particle.duration,
                    delay: particle.delay,
                    ease: "easeOut",
                  }}
                />
              );
            })}

            {/* The REJECTED Stamp */}
            <motion.div
              className="relative"
              initial={{ 
                scale: 3, 
                y: -100,
                opacity: 0,
                rotate: -20,
              }}
              animate={{ 
                scale: [3, 0.9, 1.05, 1],
                y: [-100, 0, -5, 0],
                opacity: [0, 1, 1, 1],
                rotate: [-20, -10, -13, -12],
              }}
              transition={{
                duration: 0.35,
                times: [0, 0.6, 0.8, 1],
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {/* Stamp glow effect on impact */}
              <motion.div
                className="absolute inset-0 bg-destructive/20 blur-xl rounded-lg"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ 
                  scale: [0.8, 1.5, 1],
                  opacity: [0, 0.6, 0],
                }}
                transition={{
                  duration: 0.4,
                  delay: 0.2,
                  ease: "easeOut",
                }}
              />
              
              {/* Main stamp box */}
              <div className="relative border-4 border-destructive rounded-lg px-8 py-3 bg-background/80 backdrop-blur-sm shadow-2xl">
                <span 
                  className="text-4xl md:text-5xl font-black text-destructive tracking-[0.2em] uppercase select-none"
                  style={{ 
                    textShadow: "2px 2px 0 hsl(var(--destructive) / 0.3)",
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
