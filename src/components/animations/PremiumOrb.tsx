import { motion } from "framer-motion";
import { Check, Trophy, Sparkles, Heart } from "lucide-react";

export type OrbMode = "success" | "processing" | "empathy" | "celebration";

interface PremiumOrbProps {
  mode: OrbMode;
  size?: number;
  showIcon?: boolean;
  className?: string;
}

const modeConfig = {
  success: {
    gradient: "from-emerald-400 via-teal-400 to-cyan-400",
    glowColor: "rgba(16, 185, 129, 0.4)",
    accentColor: "rgba(251, 191, 36, 0.6)",
    icon: Check,
    pulseIntensity: 1.15,
  },
  celebration: {
    gradient: "from-amber-400 via-yellow-400 to-orange-400",
    glowColor: "rgba(251, 191, 36, 0.5)",
    accentColor: "rgba(245, 158, 11, 0.7)",
    icon: Trophy,
    pulseIntensity: 1.2,
  },
  processing: {
    gradient: "from-violet-400 via-purple-400 to-indigo-400",
    glowColor: "rgba(139, 92, 246, 0.4)",
    accentColor: "rgba(99, 102, 241, 0.5)",
    icon: Sparkles,
    pulseIntensity: 1.05,
  },
  empathy: {
    gradient: "from-slate-400 via-purple-300 to-violet-300",
    glowColor: "rgba(148, 163, 184, 0.3)",
    accentColor: "rgba(139, 92, 246, 0.3)",
    icon: Heart,
    pulseIntensity: 1.03,
  },
};

export function PremiumOrb({ 
  mode, 
  size = 140, 
  showIcon = true,
  className = "" 
}: PremiumOrbProps) {
  const config = modeConfig[mode];
  const Icon = config.icon;
  const iconSize = size * 0.35;
  
  const isIntense = mode === "celebration" || mode === "success";

  return (
    <div 
      className={`relative ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Outer glow */}
      <motion.div
        className="absolute inset-0 rounded-full blur-3xl"
        style={{
          background: config.glowColor,
          transform: "scale(1.8)",
        }}
        animate={{
          opacity: [0.3, 0.6, 0.3],
          scale: [1.6, 2, 1.6],
        }}
        transition={{
          duration: mode === "empathy" ? 4 : 2.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Concentric rings for success/celebration */}
      {isIntense && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute inset-0 rounded-full"
              style={{
                border: `2px solid ${config.accentColor}`,
              }}
              initial={{ scale: 0.5, opacity: 0.8 }}
              animate={{ scale: 2.5, opacity: 0 }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                delay: i * 0.5,
                ease: "easeOut",
              }}
            />
          ))}
        </>
      )}

      {/* Orbiting particles for processing */}
      {mode === "processing" && (
        <motion.div
          className="absolute inset-0"
          animate={{ rotate: 360 }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 rounded-full bg-primary/60"
              style={{
                top: "50%",
                left: "50%",
                marginTop: -4,
                marginLeft: -4,
                transform: `rotate(${i * 90}deg) translateX(${size * 0.55}px)`,
              }}
              animate={{
                scale: [0.8, 1.2, 0.8],
                opacity: [0.4, 1, 0.4],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.2,
              }}
            />
          ))}
        </motion.div>
      )}

      {/* Main orb */}
      <motion.div
        className={`absolute inset-0 rounded-full bg-gradient-to-br ${config.gradient} shadow-2xl`}
        style={{
          boxShadow: `0 0 60px ${config.glowColor}, inset 0 -10px 30px rgba(0,0,0,0.2)`,
        }}
        animate={{
          scale: [1, config.pulseIntensity, 1],
        }}
        transition={{
          duration: mode === "empathy" ? 4 : 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        {/* Inner highlight */}
        <div 
          className="absolute top-[15%] left-[20%] w-[30%] h-[20%] rounded-full bg-white/40 blur-sm"
        />
        
        {/* Secondary highlight */}
        <div 
          className="absolute top-[25%] left-[25%] w-[15%] h-[10%] rounded-full bg-white/60 blur-[2px]"
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
            animate={mode === "celebration" ? {
              rotate: [0, -5, 5, -5, 0],
              y: [0, -3, 0],
            } : {}}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <Icon 
              size={iconSize} 
              className="text-white drop-shadow-lg" 
              strokeWidth={2.5}
            />
          </motion.div>
        </motion.div>
      )}

      {/* Rising sparkles for celebration */}
      {mode === "celebration" && (
        <div className="absolute inset-0 overflow-visible pointer-events-none">
          {Array.from({ length: 8 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full bg-amber-300"
              style={{
                left: `${20 + Math.random() * 60}%`,
                bottom: "20%",
              }}
              animate={{
                y: [-20, -100 - Math.random() * 50],
                x: [0, (Math.random() - 0.5) * 40],
                opacity: [0, 1, 0],
                scale: [0, 1, 0.5],
              }}
              transition={{
                duration: 1.5 + Math.random() * 0.5,
                repeat: Infinity,
                delay: i * 0.2,
                ease: "easeOut",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
