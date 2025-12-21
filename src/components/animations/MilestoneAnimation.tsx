import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { FloatingParticles, GradientOrbs } from "./FloatingParticles";
import { PremiumOrb } from "./PremiumOrb";

export type MilestoneType = "success" | "celebration" | "completion" | "encouragement";
export type MilestoneIntensity = "subtle" | "medium" | "major";

interface MilestoneAnimationProps {
  type: MilestoneType;
  intensity?: MilestoneIntensity;
  title: string;
  subtitle?: string;
  onComplete?: () => void;
  autoHide?: boolean;
  autoHideDelay?: number;
  className?: string;
  children?: React.ReactNode;
}

const orbModeByType = {
  success: "success",
  celebration: "celebration",
  completion: "success",
  encouragement: "celebration",
} as const;

export function MilestoneAnimation({
  type,
  intensity = "medium",
  title,
  subtitle,
  onComplete,
  autoHide = false,
  autoHideDelay = 3000,
  className = "",
  children,
}: MilestoneAnimationProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (autoHide) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onComplete?.(), 300);
      }, autoHideDelay);
      return () => clearTimeout(timer);
    }
  }, [autoHide, autoHideDelay, onComplete]);

  const particleCount = intensity === "subtle" ? 10 : intensity === "major" ? 30 : 20;
  const showOrbs = intensity !== "subtle";
  const orbMode = orbModeByType[type];
  const orbSize = intensity === "major" ? 160 : 140;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm ${className}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Background effects */}
          {showOrbs && <GradientOrbs count={4} />}
          <FloatingParticles 
            count={particleCount} 
            intensity={intensity === "major" ? "high" : intensity} 
          />

          <motion.div
            className="relative flex flex-col items-center text-center max-w-md px-6"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ 
              type: "spring", 
              stiffness: 200, 
              damping: 20,
              delay: 0.1 
            }}
          >
            {/* Premium Orb */}
            <motion.div
              className="relative mb-6"
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ 
                type: "spring", 
                stiffness: 200, 
                damping: 15,
                delay: 0.2 
              }}
            >
              <PremiumOrb 
                mode={orbMode} 
                size={orbSize}
                showIcon={true}
              />
            </motion.div>

            {/* Title with stagger */}
            <motion.h2
              className="text-2xl font-bold text-foreground mb-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.4 }}
            >
              {title}
            </motion.h2>

            {/* Subtitle */}
            {subtitle && (
              <motion.p
                className="text-muted-foreground mb-6"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.4 }}
              >
                {subtitle}
              </motion.p>
            )}

            {/* Action buttons (children) */}
            {children && (
              <motion.div
                className="w-full"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.4 }}
              >
                {children}
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
