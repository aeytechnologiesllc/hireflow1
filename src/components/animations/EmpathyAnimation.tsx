import { motion } from "framer-motion";
import { FloatingParticles } from "./FloatingParticles";

// Import AVA empathetic
import avaEmpathetic from "@/assets/ava-empathetic.png";

interface EmpathyAnimationProps {
  title: string;
  subtitle?: string;
  score?: number;
  passingScore?: number;
  children?: React.ReactNode;
  className?: string;
}

export function EmpathyAnimation({
  title,
  subtitle,
  score,
  passingScore,
  children,
  className = "",
}: EmpathyAnimationProps) {
  return (
    <motion.div
      className={`relative flex flex-col items-center text-center max-w-md px-6 ${className}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.4 }}
    >
      {/* Soft, muted particles */}
      <FloatingParticles 
        count={10} 
        intensity="subtle" 
        colors={["hsl(var(--muted-foreground) / 0.3)", "hsl(var(--primary) / 0.2)"]}
      />

      {/* AVA empathetic */}
      <motion.div
        className="relative mb-6"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ 
          type: "spring", 
          stiffness: 150, 
          damping: 20,
          delay: 0.2 
        }}
      >
        {/* Soft glow - muted colors */}
        <motion.div
          className="absolute inset-0 rounded-full blur-2xl"
          style={{
            background: `radial-gradient(circle, hsl(var(--muted) / 0.6) 0%, transparent 70%)`,
            transform: "scale(1.8)",
          }}
          animate={{
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* AVA image with gentle breathing animation */}
        <motion.img
          src={avaEmpathetic}
          alt="Ava"
          className="relative w-32 h-32 object-contain"
          animate={{
            scale: [1, 1.02, 1],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </motion.div>

      {/* Title */}
      <motion.h2
        className="text-2xl font-bold text-foreground mb-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
      >
        {title}
      </motion.h2>

      {/* Subtitle - supportive message */}
      {subtitle && (
        <motion.p
          className="text-muted-foreground mb-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          {subtitle}
        </motion.p>
      )}

      {/* Score display - gentle, not harsh */}
      {score !== undefined && passingScore !== undefined && (
        <motion.div
          className="mb-6 p-4 rounded-xl bg-muted/30 border border-border"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4 }}
        >
          <p className="text-sm text-muted-foreground">
            Your score: <span className="font-medium text-foreground">{score}%</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Required: {passingScore}%
          </p>
        </motion.div>
      )}

      {/* Action buttons */}
      {children && (
        <motion.div
          className="w-full"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.4 }}
        >
          {children}
        </motion.div>
      )}
    </motion.div>
  );
}
