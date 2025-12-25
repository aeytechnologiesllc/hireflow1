import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";

export type AvaExpression = "neutral" | "listening" | "thinking" | "speaking" | "encouraging";

interface AvaAvatarProps {
  /** Current expression state */
  expression: AvaExpression;
  /** Audio levels array (5 values) for speaking animation intensity */
  audioLevels?: number[];
  /** Size of the avatar container */
  size?: "sm" | "md" | "lg" | "xl";
  /** Optional className for additional styling */
  className?: string;
  /** Show status indicator badge */
  showStatus?: boolean;
  /** Status text to display */
  statusText?: string;
}

const sizeConfig = {
  sm: { container: "w-24 h-24", barHeight: 32, barWidth: 4, gap: 3 },
  md: { container: "w-32 h-32", barHeight: 48, barWidth: 5, gap: 4 },
  lg: { container: "w-40 h-40", barHeight: 64, barWidth: 6, gap: 5 },
  xl: { container: "w-56 h-56", barHeight: 96, barWidth: 8, gap: 6 },
};

const expressionColors: Record<AvaExpression, { primary: string; glow: string; bg: string }> = {
  neutral: { 
    primary: "from-muted-foreground/40 to-muted-foreground/60", 
    glow: "bg-muted-foreground/20",
    bg: "from-muted/30 to-muted/50"
  },
  listening: { 
    primary: "from-blue-400 to-blue-600", 
    glow: "bg-blue-500/30",
    bg: "from-blue-500/10 to-blue-600/20"
  },
  thinking: { 
    primary: "from-amber-400 to-amber-600", 
    glow: "bg-amber-500/30",
    bg: "from-amber-500/10 to-amber-600/20"
  },
  speaking: { 
    primary: "from-emerald-400 to-emerald-600", 
    glow: "bg-emerald-500/30",
    bg: "from-emerald-500/10 to-emerald-600/20"
  },
  encouraging: { 
    primary: "from-emerald-300 to-teal-500", 
    glow: "bg-teal-500/40",
    bg: "from-teal-500/10 to-emerald-600/20"
  },
};

const statusColors: Record<AvaExpression, string> = {
  neutral: "bg-muted-foreground/50",
  listening: "bg-blue-500",
  thinking: "bg-amber-500",
  speaking: "bg-emerald-500",
  encouraging: "bg-teal-500",
};

const statusLabels: Record<AvaExpression, string> = {
  neutral: "Ready",
  listening: "Listening...",
  thinking: "Thinking...",
  speaking: "Speaking",
  encouraging: "Great!",
};

export function AvaAvatar({
  expression,
  audioLevels = [8, 8, 8, 8, 8],
  size = "lg",
  className = "",
  showStatus = true,
  statusText,
}: AvaAvatarProps) {
  const config = sizeConfig[size];
  const colors = expressionColors[expression];
  
  // Normalize audio levels to 0-1 range for animation
  const normalizedLevels = useMemo(() => {
    return audioLevels.map(level => {
      const normalized = Math.min(1, Math.max(0, (level - 5) / 30));
      return normalized;
    });
  }, [audioLevels]);

  // Calculate overall audio intensity
  const audioIntensity = useMemo(() => {
    const avg = normalizedLevels.reduce((a, b) => a + b, 0) / normalizedLevels.length;
    return avg;
  }, [normalizedLevels]);

  // Generate bar heights based on expression and audio
  const getBarHeight = (index: number): number => {
    const baseHeight = 0.3; // Minimum height as fraction
    const centerIndex = 2;
    const distanceFromCenter = Math.abs(index - centerIndex);
    const centerBias = 1 - (distanceFromCenter * 0.15); // Center bars slightly taller

    switch (expression) {
      case "speaking":
        // Dynamic height based on actual audio levels
        const audioLevel = normalizedLevels[index] || 0;
        return baseHeight + (audioLevel * 0.7 * centerBias);
      case "listening":
        // Gentle pulse pattern
        return baseHeight + 0.2 * centerBias;
      case "thinking":
        // Wave pattern (will be animated)
        return baseHeight + 0.3 * centerBias;
      case "encouraging":
        // Celebratory burst
        return baseHeight + 0.5 * centerBias;
      default:
        // Subtle breathing
        return baseHeight + 0.1 * centerBias;
    }
  };

  // Animation variants for different expressions
  const getBarAnimation = (index: number) => {
    const delay = index * 0.05;
    
    switch (expression) {
      case "speaking":
        return {
          scaleY: [getBarHeight(index), getBarHeight(index) * 1.3, getBarHeight(index)],
          transition: {
            duration: 0.15,
            repeat: Infinity,
            repeatType: "reverse" as const,
            delay,
            ease: "easeInOut" as const,
          }
        };
      case "listening":
        return {
          scaleY: [0.3, 0.5, 0.3],
          transition: {
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut" as const,
            delay: delay * 3,
          }
        };
      case "thinking":
        return {
          scaleY: [0.3, 0.6, 0.3],
          transition: {
            duration: 0.8,
            repeat: Infinity,
            ease: "easeInOut" as const,
            delay: index * 0.15,
          }
        };
      case "encouraging":
        return {
          scaleY: [0.4, 0.9, 0.4],
          transition: {
            duration: 0.5,
            repeat: Infinity,
            ease: "easeOut" as const,
            delay: delay * 2,
          }
        };
      default:
        return {
          scaleY: [0.3, 0.4, 0.3],
          transition: {
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut" as const,
            delay,
          }
        };
    }
  };

  return (
    <div className={`relative inline-flex flex-col items-center ${className}`}>
      {/* Glow effect behind visualization */}
      <motion.div
        className={`absolute inset-0 rounded-full blur-3xl ${colors.glow}`}
        animate={{
          scale: expression === "speaking" ? [1, 1.15 + audioIntensity * 0.1, 1] : [1, 1.08, 1],
          opacity: expression === "speaking" ? [0.4, 0.6 + audioIntensity * 0.2, 0.4] : [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: expression === "speaking" ? 0.3 : 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Main visualization container */}
      <motion.div
        className={`relative ${config.container} rounded-full overflow-hidden bg-gradient-to-br ${colors.bg} border-2 border-border/30 backdrop-blur-sm shadow-xl flex items-center justify-center`}
        animate={{
          scale: expression === "encouraging" ? [1, 1.05, 1] : 1,
        }}
        transition={{
          duration: 0.6,
          repeat: expression === "encouraging" ? Infinity : 0,
          ease: "easeInOut",
        }}
      >
        {/* Inner glow ring */}
        <motion.div 
          className={`absolute inset-2 rounded-full bg-gradient-to-br ${colors.bg} opacity-50`}
          animate={{
            opacity: expression === "speaking" ? [0.3, 0.6, 0.3] : [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: expression === "speaking" ? 0.4 : 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Audio bars */}
        <div 
          className="relative flex items-center justify-center"
          style={{ gap: config.gap }}
        >
          {[0, 1, 2, 3, 4].map((index) => (
            <motion.div
              key={index}
              className={`rounded-full bg-gradient-to-t ${colors.primary}`}
              style={{
                width: config.barWidth,
                height: config.barHeight,
                originY: 0.5,
              }}
              animate={getBarAnimation(index)}
              initial={{ scaleY: 0.3 }}
            />
          ))}
        </div>

        {/* Thinking dots overlay */}
        {expression === "thinking" && (
          <motion.div
            className="absolute bottom-3 flex gap-1.5"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1.5 h-1.5 bg-amber-400 rounded-full"
                animate={{ y: [0, -3, 0] }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </motion.div>
        )}

        {/* Listening indicator - subtle ring pulse */}
        {expression === "listening" && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-blue-400/50"
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.5, 0.2, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}
      </motion.div>

      {/* Status indicator */}
      {showStatus && (
        <motion.div
          className="mt-3 flex items-center gap-2"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <motion.div
            className={`w-2 h-2 rounded-full ${statusColors[expression]}`}
            animate={{
              scale: expression === "speaking" ? [1, 1.3, 1] : [1, 1.15, 1],
              opacity: expression === "neutral" ? 0.6 : 1,
            }}
            transition={{
              duration: expression === "speaking" ? 0.3 : 1.5,
              repeat: Infinity,
            }}
          />
          <span className="text-sm font-medium text-muted-foreground">
            {statusText || statusLabels[expression]}
          </span>
        </motion.div>
      )}
    </div>
  );
}

// Hook to determine expression from voice hook state
export function useAvaExpression({
  isSpeaking,
  isListening,
  isProcessing,
  isConnected,
  justFinishedSpeaking,
}: {
  isSpeaking: boolean;
  isListening: boolean;
  isProcessing: boolean;
  isConnected: boolean;
  justFinishedSpeaking?: boolean;
}): AvaExpression {
  // Encouraging expression briefly after user finishes speaking
  if (justFinishedSpeaking && isProcessing) {
    return "encouraging";
  }

  if (isSpeaking) {
    return "speaking";
  }

  if (isProcessing) {
    return "thinking";
  }

  if (isListening && isConnected) {
    return "listening";
  }

  return "neutral";
}

export default AvaAvatar;
