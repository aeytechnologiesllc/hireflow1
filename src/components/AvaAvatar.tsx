import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Import all AVA expression images
import avaNeutral from "@/assets/ava-neutral.png";
import avaListening from "@/assets/ava-listening.png";
import avaThinking from "@/assets/ava-thinking.png";
import avaSpeaking from "@/assets/ava-speaking.png";
import avaEncouraging from "@/assets/ava-encouraging.png";

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

const expressionImages: Record<AvaExpression, string> = {
  neutral: avaNeutral,
  listening: avaListening,
  thinking: avaThinking,
  speaking: avaSpeaking,
  encouraging: avaEncouraging,
};

const sizeClasses = {
  sm: "w-24 h-24",
  md: "w-32 h-32",
  lg: "w-40 h-40",
  xl: "w-56 h-56",
};

const statusColors: Record<AvaExpression, string> = {
  neutral: "bg-muted",
  listening: "bg-blue-500",
  thinking: "bg-amber-500",
  speaking: "bg-green-500",
  encouraging: "bg-emerald-500",
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
  const [currentImage, setCurrentImage] = useState(expressionImages[expression]);
  const [isBlinking, setIsBlinking] = useState(false);

  // Calculate average audio level for animation intensity
  const audioIntensity = useMemo(() => {
    const avg = audioLevels.reduce((a, b) => a + b, 0) / audioLevels.length;
    return Math.min(1, (avg - 8) / 24); // Normalize to 0-1
  }, [audioLevels]);

  // Update image when expression changes
  useEffect(() => {
    setCurrentImage(expressionImages[expression]);
  }, [expression]);

  // Blinking animation - random intervals for natural feel
  useEffect(() => {
    const scheduleNextBlink = () => {
      const delay = 2000 + Math.random() * 4000; // 2-6 seconds
      return setTimeout(() => {
        if (expression !== "speaking") {
          setIsBlinking(true);
          setTimeout(() => setIsBlinking(false), 150);
        }
        scheduleNextBlink();
      }, delay);
    };

    const blinkTimeout = scheduleNextBlink();
    return () => clearTimeout(blinkTimeout);
  }, [expression]);

  // Subtle breathing animation
  const breathingAnimation = {
    scale: [1, 1.02, 1],
    y: [0, -2, 0],
  };

  // Speaking animation - more pronounced when audio is active
  const speakingAnimation = {
    scale: [1, 1 + audioIntensity * 0.03, 1],
    y: [0, -1 - audioIntensity * 2, 0],
  };

  // Thinking animation - gentle side-to-side
  const thinkingAnimation = {
    x: [0, 3, 0, -3, 0],
    rotate: [0, 1, 0, -1, 0],
  };

  // Listening animation - subtle nod
  const listeningAnimation = {
    y: [0, 2, 0],
    rotate: [0, 2, 0],
  };

  // Get animation based on current expression
  const getAnimation = () => {
    switch (expression) {
      case "speaking":
        return speakingAnimation;
      case "thinking":
        return thinkingAnimation;
      case "listening":
        return listeningAnimation;
      default:
        return breathingAnimation;
    }
  };

  // Get animation duration based on expression
  const getAnimationDuration = () => {
    switch (expression) {
      case "speaking":
        return 0.3 + (1 - audioIntensity) * 0.2; // Faster when audio is intense
      case "thinking":
        return 2;
      case "listening":
        return 1.5;
      default:
        return 4;
    }
  };

  return (
    <div className={`relative inline-flex flex-col items-center ${className}`}>
      {/* Glow effect behind avatar */}
      <motion.div
        className={`absolute inset-0 rounded-full blur-2xl opacity-30 ${
          expression === "speaking"
            ? "bg-green-500"
            : expression === "listening"
            ? "bg-blue-500"
            : expression === "thinking"
            ? "bg-amber-500"
            : "bg-primary/20"
        }`}
        animate={{
          scale: expression === "speaking" ? [1, 1.1 + audioIntensity * 0.1, 1] : [1, 1.05, 1],
          opacity: expression === "speaking" ? [0.3, 0.4 + audioIntensity * 0.2, 0.3] : [0.2, 0.3, 0.2],
        }}
        transition={{
          duration: expression === "speaking" ? 0.5 : 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Avatar container */}
      <motion.div
        className={`relative ${sizeClasses[size]} rounded-full overflow-hidden bg-gradient-to-br from-background to-muted border-4 border-background shadow-xl`}
        animate={getAnimation()}
        transition={{
          duration: getAnimationDuration(),
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        {/* Avatar image with crossfade */}
        <AnimatePresence mode="wait">
          <motion.img
            key={expression}
            src={currentImage}
            alt={`Ava - ${expression}`}
            className="w-full h-full object-cover"
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: isBlinking ? 0.7 : 1,
              scale: isBlinking ? 0.98 : 1,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        </AnimatePresence>

        {/* Speaking audio bars overlay */}
        {expression === "speaking" && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-end gap-0.5 h-4">
            {audioLevels.map((level, i) => (
              <motion.div
                key={i}
                className="w-1 bg-white/80 rounded-full"
                animate={{ height: Math.max(4, level / 2) }}
                transition={{ duration: 0.1 }}
              />
            ))}
          </div>
        )}

        {/* Thinking indicator */}
        {expression === "thinking" && (
          <motion.div
            className="absolute top-2 right-2 flex gap-1"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1.5 h-1.5 bg-amber-400 rounded-full"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </motion.div>
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
              scale: expression === "speaking" ? [1, 1.3, 1] : [1, 1.1, 1],
              opacity: expression === "neutral" ? 0.6 : 1,
            }}
            transition={{
              duration: expression === "speaking" ? 0.3 : 1,
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
