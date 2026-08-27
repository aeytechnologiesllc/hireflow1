import { motion } from "framer-motion";
import { Check, Trophy, Heart, Loader2 } from "lucide-react";

export type OrbMode = "success" | "processing" | "empathy" | "celebration";

interface PremiumOrbProps {
  mode: OrbMode;
  size?: number;
  showIcon?: boolean;
  className?: string;
}

/**
 * The orb is retired. What renders here now is the wax-seal language —
 * a pressed disc, not a glowing sphere — using the same --seal-* / jade /
 * brass tokens as AvaSeal, recoloured per mode instead of per gradient.
 */
const modeConfig = {
  success: {
    disc: "var(--seal-disc)",
    ring: "var(--seal-ring)",
    glow: "var(--jade)",
    icon: Check,
    pulseIntensity: 1.06,
  },
  celebration: {
    disc: "var(--brass)",
    ring: "var(--brass-line)",
    glow: "var(--brass)",
    icon: Trophy,
    pulseIntensity: 1.08,
  },
  processing: {
    disc: "var(--seal-disc)",
    ring: "var(--seal-ring)",
    glow: "var(--jade)",
    icon: Loader2,
    pulseIntensity: 1.03,
  },
  empathy: {
    disc: "var(--ink-3)",
    ring: "var(--seal-ring)",
    glow: "var(--ink-3)",
    icon: Heart,
    pulseIntensity: 1.02,
  },
};

export function PremiumOrb({
  mode,
  size = 140,
  showIcon = true,
  className = "",
}: PremiumOrbProps) {
  const config = modeConfig[mode];
  const Icon = config.icon;
  const iconSize = size * 0.32;

  const isIntense = mode === "celebration" || mode === "success";

  return (
    <div
      className={`relative ${className}`}
      style={{
        width: size,
        height: size,
        willChange: "transform",
        transform: "translateZ(0)",
      }}
    >
      {/* Outer glow - simplified, no blur filter */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, color-mix(in srgb, ${config.glow} 35%, transparent) 0%, transparent 70%)`,
          transform: "scale(2)",
          willChange: "opacity",
        }}
        animate={{
          opacity: [0.4, 0.7, 0.4],
        }}
        transition={{
          duration: mode === "empathy" ? 4 : 3,
          repeat: Infinity,
          ease: "linear",
        }}
      />

      {/* Concentric rings - reduced from 3 to 2 */}
      {isIntense && (
        <>
          {[0, 1].map((i) => (
            <motion.div
              key={i}
              className="absolute inset-0 rounded-full"
              style={{
                border: `2px solid ${config.ring}`,
                willChange: "transform, opacity",
              }}
              initial={{ scale: 0.5, opacity: 0.7 }}
              animate={{ scale: 2.2, opacity: 0 }}
              transition={{
                duration: 2.8,
                repeat: Infinity,
                delay: i * 0.7,
                ease: "linear",
              }}
            />
          ))}
        </>
      )}

      {/* Main seal disc */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: config.disc,
          boxShadow: `0 1px 2px var(--seal-shadow), 0 10px 26px -12px color-mix(in srgb, ${config.glow} 55%, transparent)`,
          willChange: "transform",
        }}
        animate={{
          scale: [1, config.pulseIntensity, 1],
        }}
        transition={{
          duration: mode === "empathy" ? 4 : 2.5,
          repeat: Infinity,
          ease: "linear",
        }}
      >
        {/* The pressed ring, the same double-ring the seal always carries */}
        <div
          className="absolute rounded-full"
          style={{
            inset: "18%",
            border: `2px solid ${config.ring}`,
            opacity: 0.85,
          }}
        />
      </motion.div>

      {/* Icon */}
      {showIcon && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 15,
            delay: 0.3,
          }}
        >
          <motion.div
            animate={
              mode === "celebration"
                ? { rotate: [0, -3, 3, -3, 0], y: [0, -2, 0] }
                : mode === "processing"
                ? { rotate: 360 }
                : {}
            }
            transition={{
              duration: mode === "processing" ? 1.4 : 2,
              repeat: Infinity,
              ease: mode === "processing" ? "linear" : "linear",
            }}
          >
            <Icon
              size={iconSize}
              style={{ color: "var(--seal-ring)" }}
              strokeWidth={2.5}
            />
          </motion.div>
        </motion.div>
      )}

      {/* Rising motes for celebration */}
      {mode === "celebration" && (
        <div className="absolute inset-0 overflow-visible pointer-events-none">
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full"
              style={{
                left: `${25 + i * 15}%`,
                bottom: "20%",
                background: "var(--brass-line)",
                willChange: "transform, opacity",
              }}
              animate={{
                y: [-20, -80],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.4,
                ease: "linear",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
