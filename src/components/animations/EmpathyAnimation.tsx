import { motion } from "framer-motion";
import { FloatingParticles } from "./FloatingParticles";
import { PremiumOrb } from "./PremiumOrb";

interface EmpathyAnimationProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  className?: string;
}

export function EmpathyAnimation({
  title,
  subtitle,
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

      {/* Premium Orb - empathy mode */}
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
        <PremiumOrb 
          mode="empathy" 
          size={128}
          showIcon={true}
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
