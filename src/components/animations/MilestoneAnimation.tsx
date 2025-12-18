import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { FloatingParticles, GradientOrbs } from "./FloatingParticles";
import { AnimatedProgressRing } from "./AnimatedProgressRing";

// Import AVA poses
import avaCelebrating from "@/assets/ava-celebrating.png";
import avaProud from "@/assets/ava-proud.png";
import avaEncouraging from "@/assets/ava-encouraging.png";

export type MilestoneType = "success" | "celebration" | "completion" | "encouragement";
export type MilestoneIntensity = "subtle" | "medium" | "major";

interface MilestoneAnimationProps {
  type: MilestoneType;
  intensity?: MilestoneIntensity;
  title: string;
  subtitle?: string;
  score?: number;
  passingScore?: number;
  onComplete?: () => void;
  autoHide?: boolean;
  autoHideDelay?: number;
  className?: string;
  children?: React.ReactNode;
}

const avaImagesByType: Record<MilestoneType, string> = {
  success: avaCelebrating,
  celebration: avaCelebrating,
  completion: avaProud,
  encouragement: avaEncouraging,
};

export function MilestoneAnimation({
  type,
  intensity = "medium",
  title,
  subtitle,
  score,
  passingScore,
  onComplete,
  autoHide = false,
  autoHideDelay = 3000,
  className = "",
  children,
}: MilestoneAnimationProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [scoreAnimationComplete, setScoreAnimationComplete] = useState(false);

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
  const avaImage = avaImagesByType[type];

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
            {/* AVA celebration */}
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
              {/* Glow effect */}
              <motion.div
                className="absolute inset-0 rounded-full blur-3xl"
                style={{
                  background: `radial-gradient(circle, hsl(var(--primary) / 0.4) 0%, transparent 60%)`,
                  transform: "scale(2)",
                }}
                animate={{
                  opacity: [0.4, 0.7, 0.4],
                  scale: [1.8, 2.2, 1.8],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />

              {/* Celebration pulse rings */}
              {intensity === "major" && (
                <>
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="absolute inset-0 rounded-full border-2 border-primary/30"
                      initial={{ scale: 0.8, opacity: 0.8 }}
                      animate={{ scale: 2.5, opacity: 0 }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        delay: i * 0.4,
                        ease: "easeOut",
                      }}
                    />
                  ))}
                </>
              )}

              {/* AVA image */}
              <motion.img
                src={avaImage}
                alt="Ava celebrating"
                className="relative w-36 h-36 object-contain"
                animate={{
                  y: [0, -8, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </motion.div>

            {/* Score reveal (if provided) */}
            {score !== undefined && (
              <motion.div
                className="mb-4"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
              >
                <div className="relative">
                  <AnimatedProgressRing 
                    size={100} 
                    strokeWidth={6} 
                    progress={scoreAnimationComplete ? score : 0} 
                  />
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    onAnimationComplete={() => setScoreAnimationComplete(true)}
                  >
                    <span className="text-2xl font-bold text-foreground">
                      {score}%
                    </span>
                  </motion.div>
                </div>
                {passingScore && (
                  <motion.p
                    className="text-sm text-muted-foreground mt-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1 }}
                  >
                    Passing: {passingScore}%
                  </motion.p>
                )}
              </motion.div>
            )}

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
