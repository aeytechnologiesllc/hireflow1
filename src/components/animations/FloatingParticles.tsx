import { motion } from "framer-motion";
import { useMemo } from "react";

interface FloatingParticlesProps {
  count?: number;
  colors?: string[];
  className?: string;
  intensity?: "subtle" | "medium" | "high";
}

export function FloatingParticles({ 
  count = 15, 
  colors = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--primary) / 0.5)"],
  className = "",
  intensity = "medium"
}: FloatingParticlesProps) {
  const particles = useMemo(() => {
    // Reduce counts for performance
    const actualCount = intensity === "subtle" ? Math.min(count, 8) : 
                        intensity === "high" ? Math.min(count, 15) : 
                        Math.min(count, 12);
    
    return Array.from({ length: actualCount }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: intensity === "subtle" ? 2 + Math.random() * 2 : 
            intensity === "high" ? 3 + Math.random() * 4 : 
            2 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      duration: 5 + Math.random() * 3,
      delay: Math.random() * 2,
    }));
  }, [count, colors, intensity]);

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: particle.size,
            height: particle.size,
            background: particle.color,
            willChange: "transform, opacity",
            transform: "translateZ(0)",
          }}
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 0.7, 0.5, 0.7, 0],
            y: [0, -40, -30, -50, -70],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
}

// Gradient orb variant - optimized with fewer orbs and simpler animations
export function GradientOrbs({ 
  count = 2,
  className = ""
}: { count?: number; className?: string }) {
  const orbs = useMemo(() => {
    // Cap at 2 orbs for performance
    const actualCount = Math.min(count, 2);
    return Array.from({ length: actualCount }, (_, i) => ({
      id: i,
      x: 30 + i * 40,
      y: 30 + i * 20,
      size: 60 + i * 30,
      duration: 8 + i * 2,
    }));
  }, [count]);

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {orbs.map((orb) => (
        <motion.div
          key={orb.id}
          className="absolute rounded-full"
          style={{
            left: `${orb.x}%`,
            top: `${orb.y}%`,
            width: orb.size,
            height: orb.size,
            background: `radial-gradient(circle, hsl(var(--primary) / 0.25) 0%, transparent 70%)`,
            willChange: "opacity",
            transform: "translateZ(0)",
          }}
          initial={{ opacity: 0.3 }}
          animate={{
            opacity: [0.3, 0.45, 0.3],
          }}
          transition={{
            duration: orb.duration,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
}
