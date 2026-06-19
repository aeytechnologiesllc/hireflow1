import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PremiumOrb } from "./PremiumOrb";

interface PremiumCelebrationProps {
  name: string;
  jobTitle?: string;
  onComplete?: () => void;
  enableSound?: boolean;
}

// Rising sparkle particles (not falling confetti)
const RisingSparkles = ({ count = 40 }: { count?: number }) => {
  const sparkles = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 1.5,
      duration: 2 + Math.random() * 2,
      size: 3 + Math.random() * 6,
      opacity: 0.4 + Math.random() * 0.6,
      blur: Math.random() > 0.7 ? 1 : 0,
    }));
  }, [count]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {sparkles.map((sparkle) => (
        <motion.div
          key={sparkle.id}
          className="absolute rounded-full"
          style={{
            left: `${sparkle.x}%`,
            bottom: "-10%",
            width: sparkle.size,
            height: sparkle.size,
            background: `radial-gradient(circle, rgba(26,160,106,${sparkle.opacity}) 0%, rgba(26,160,106,0) 70%)`,
            filter: sparkle.blur ? "blur(1px)" : "none",
          }}
          initial={{ y: 0, opacity: 0, scale: 0 }}
          animate={{
            y: [0, -window.innerHeight * 1.2],
            opacity: [0, sparkle.opacity, sparkle.opacity, 0],
            scale: [0, 1, 1, 0.5],
          }}
          transition={{
            duration: sparkle.duration,
            delay: 0.5 + sparkle.delay,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
};

// Golden light rays burst
const GoldenLightRays = () => {
  const rays = useMemo(() => {
    return Array.from({ length: 8 }).map((_, i) => ({
      id: i,
      angle: (i * 360) / 8,
    }));
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {rays.map((ray) => (
        <motion.div
          key={ray.id}
          className="absolute origin-center"
          style={{
            width: "200%",
            height: "4px",
            background: "linear-gradient(90deg, transparent 0%, rgba(26,160,106,0.6) 30%, rgba(26,160,106,0) 100%)",
            transform: `rotate(${ray.angle}deg)`,
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{
            scaleX: [0, 1, 1.2, 0],
            opacity: [0, 0.8, 0.4, 0],
          }}
          transition={{
            duration: 1.5,
            delay: 0.3,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
};

// Achievement ring that fills
const AchievementRing = () => {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <svg
        width="280"
        height="280"
        viewBox="0 0 280 280"
        className="absolute"
      >
        {/* Background ring */}
        <circle
          cx="140"
          cy="140"
          r="120"
          fill="none"
          stroke="rgba(26,160,106,0.1)"
          strokeWidth="8"
        />
        {/* Animated fill ring */}
        <motion.circle
          cx="140"
          cy="140"
          r="120"
          fill="none"
          stroke="url(#goldGradient)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={2 * Math.PI * 120}
          initial={{ strokeDashoffset: 2 * Math.PI * 120 }}
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: 1.2, delay: 0.4, ease: "easeOut" }}
          style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
        />
        <defs>
          <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1aa06a" />
            <stop offset="50%" stopColor="#1aa06a" />
            <stop offset="100%" stopColor="#0c1c14" />
          </linearGradient>
        </defs>
      </svg>
    </motion.div>
  );
};

// Typewriter text effect
const TypewriterText = ({ text, delay = 0 }: { text: string; delay?: number }) => {
  const [displayedText, setDisplayedText] = useState("");
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => {
      let index = 0;
      const interval = setInterval(() => {
        if (index <= text.length) {
          setDisplayedText(text.slice(0, index));
          index++;
        } else {
          clearInterval(interval);
          setTimeout(() => setShowCursor(false), 500);
        }
      }, 50);

      return () => clearInterval(interval);
    }, delay * 1000);

    return () => clearTimeout(timeout);
  }, [text, delay]);

  return (
    <span>
      {displayedText}
      {showCursor && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
          className="inline-block w-0.5 h-[1em] bg-primary ml-0.5 align-text-bottom"
        />
      )}
    </span>
  );
};

// Play subtle achievement sound
const playAchievementSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create a pleasant chord
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    
    notes.forEach((freq, i) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = freq;
      oscillator.type = "sine";
      
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.08, audioContext.currentTime + 0.05 + i * 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.8);
      
      oscillator.start(audioContext.currentTime + i * 0.08);
      oscillator.stop(audioContext.currentTime + 1);
    });
  } catch (e) {
    /* Celebration sound effect is non-critical; audio may be unsupported or blocked by browser autoplay policy */
  }
};

export default function PremiumCelebration({
  name,
  jobTitle,
  onComplete,
  enableSound = true,
}: PremiumCelebrationProps) {
  const [phase, setPhase] = useState<"anticipation" | "climax" | "resolution">("anticipation");
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Phase transitions
    const climaxTimer = setTimeout(() => {
      setPhase("climax");
      if (enableSound) {
        playAchievementSound();
      }
    }, 300);

    const resolutionTimer = setTimeout(() => {
      setPhase("resolution");
    }, 1100);

    const completeTimer = setTimeout(() => {
      setIsVisible(false);
      onComplete?.();
    }, 4500);

    return () => {
      clearTimeout(climaxTimer);
      clearTimeout(resolutionTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete, enableSound]);

  const firstName = name.split(" ")[0];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Backdrop with vignette */}
          <motion.div
            className="absolute inset-0 bg-background"
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: phase === "anticipation" ? 0.8 : 0.95,
              background: phase === "climax"
                ? "radial-gradient(circle at center, var(--background) 0%, hsl(157 35% 6%) 100%)"
                : "var(--background)"
            }}
            transition={{ duration: 0.5 }}
          />

          {/* Warm glow */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: phase !== "anticipation" ? 1 : 0,
            }}
            transition={{ duration: 0.5 }}
          >
            <div 
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(26,160,106,0.15) 0%, transparent 70%)",
              }}
            />
          </motion.div>

          {/* Light rays */}
          {phase !== "anticipation" && <GoldenLightRays />}

          {/* Achievement ring */}
          {phase !== "anticipation" && <AchievementRing />}

          {/* Rising sparkles */}
          {phase !== "anticipation" && <RisingSparkles count={50} />}

          {/* Content container */}
          <div className="relative z-10 flex flex-col items-center text-center px-6">
            {/* Premium Orb */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0, y: 20 }}
              animate={{
                scale: phase === "climax" ? [0.5, 1.15, 1] : 1,
                opacity: 1,
                y: 0,
              }}
              transition={{
                duration: phase === "climax" ? 0.6 : 0.3,
                ease: [0.34, 1.56, 0.64, 1],
              }}
              className="relative mb-8"
            >
              <PremiumOrb 
                mode="celebration" 
                size={128}
                showIcon={true}
              />
            </motion.div>

            {/* Welcome text with typewriter */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: phase !== "anticipation" ? 1 : 0, y: phase !== "anticipation" ? 0 : 20 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="space-y-3"
            >
              <h1 className="text-3xl md:text-4xl font-bold text-foreground">
                {phase === "resolution" ? (
                  <TypewriterText text={`Welcome, ${firstName}!`} delay={0} />
                ) : (
                  <span className="opacity-0">Welcome, {firstName}!</span>
                )}
              </h1>
              
              {jobTitle && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: phase === "resolution" ? 1 : 0 }}
                  transition={{ delay: 1.8 }}
                  className="text-lg text-muted-foreground"
                >
                  Your job is ready to attract talent
                </motion.p>
              )}
            </motion.div>

            {/* Continue button */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ 
                opacity: phase === "resolution" ? 1 : 0, 
                y: phase === "resolution" ? 0 : 20 
              }}
              transition={{ delay: 2.5, duration: 0.5 }}
              onClick={() => {
                setIsVisible(false);
                onComplete?.();
              }}
              className="mt-8 px-8 py-3 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-primary-foreground font-semibold rounded-full shadow-lg shadow-primary/25 transition-all duration-300 hover:scale-105"
            >
              <motion.span
                animate={{ opacity: [1, 0.7, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                Continue to Dashboard
              </motion.span>
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
