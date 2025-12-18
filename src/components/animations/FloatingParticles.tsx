import { motion } from "framer-motion";
import { useMemo } from "react";

interface FloatingParticlesProps {
  count?: number;
  colors?: string[];
  className?: string;
  intensity?: "subtle" | "medium" | "high";
}

export function FloatingParticles({ 
  count = 20, 
  colors = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--primary) / 0.5)"],
  className = "",
  intensity = "medium"
}: FloatingParticlesProps) {
  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: intensity === "subtle" ? 2 + Math.random() * 3 : 
            intensity === "high" ? 4 + Math.random() * 8 : 
            3 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      duration: 4 + Math.random() * 4,
      delay: Math.random() * 2,
      blur: intensity === "subtle" ? 0 : Math.random() > 0.7 ? 1 : 0,
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
            filter: particle.blur ? `blur(${particle.blur}px)` : undefined,
            boxShadow: `0 0 ${particle.size * 2}px ${particle.color}`,
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 0.8, 0.6, 0.8, 0],
            scale: [0.5, 1, 0.8, 1, 0.5],
            y: [0, -30, -20, -40, -60],
            x: [0, 10, -5, 15, 0],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// Gradient orb variant for more premium feel
export function GradientOrbs({ 
  count = 5,
  className = ""
}: { count?: number; className?: string }) {
  const orbs = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: 20 + Math.random() * 60,
      y: 20 + Math.random() * 60,
      size: 40 + Math.random() * 80,
      duration: 6 + Math.random() * 4,
      delay: Math.random() * 2,
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
            background: `radial-gradient(circle, hsl(var(--primary) / 0.3) 0%, transparent 70%)`,
          }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{
            opacity: [0.3, 0.5, 0.3],
            scale: [0.8, 1.2, 0.8],
            x: [0, 20, -10, 20, 0],
            y: [0, -15, 10, -20, 0],
          }}
          transition={{
            duration: orb.duration,
            delay: orb.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
