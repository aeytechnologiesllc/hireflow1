import { motion } from "framer-motion";

interface LiquidBlobLoaderProps {
  size?: number;
  showGlow?: boolean;
  showParticles?: boolean;
  className?: string;
}

// 4 organic blob shapes for morphing
const blobPaths = [
  "M45,0 C70,0 90,20 90,45 C90,70 70,90 45,90 C20,90 0,70 0,45 C0,20 20,0 45,0",
  "M45,5 C75,0 95,25 90,50 C85,75 60,95 35,90 C10,85 -5,55 5,30 C15,5 25,10 45,5",
  "M50,0 C80,10 95,35 85,60 C75,85 45,100 20,85 C-5,70 -5,35 15,15 C35,-5 30,-5 50,0",
  "M40,0 C65,-5 90,15 95,45 C100,75 80,95 50,95 C20,95 -5,75 0,45 C5,15 15,5 40,0",
];

// Gradient color stops that will animate
const gradientColors = [
  { start: "hsl(160, 60%, 45%)", end: "hsl(180, 50%, 35%)" }, // Primary teal
  { start: "hsl(200, 70%, 50%)", end: "hsl(220, 60%, 40%)" }, // Blue accent
  { start: "hsl(260, 50%, 55%)", end: "hsl(280, 45%, 45%)" }, // Violet
  { start: "hsl(320, 50%, 50%)", end: "hsl(340, 55%, 40%)" }, // Magenta
];

export const LiquidBlobLoader = ({
  size = 120,
  showGlow = true,
  showParticles = true,
  className = "",
}: LiquidBlobLoaderProps) => {
  const viewBox = "0 0 90 90";
  
  return (
    <div 
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Outer glow effect */}
      {showGlow && (
        <motion.div
          className="absolute inset-0 rounded-full blur-2xl"
          style={{
            background: "radial-gradient(circle, hsla(160, 60%, 45%, 0.4) 0%, transparent 70%)",
          }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.4, 0.7, 0.4],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}

      {/* Main blob SVG */}
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        className="relative z-10"
      >
        <defs>
          {/* Animated gradient */}
          <motion.linearGradient
            id="blobGradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
            animate={{
              x1: ["0%", "100%", "100%", "0%", "0%"],
              y1: ["0%", "0%", "100%", "100%", "0%"],
              x2: ["100%", "0%", "0%", "100%", "100%"],
              y2: ["100%", "100%", "0%", "0%", "100%"],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "linear",
            }}
          >
            <motion.stop
              offset="0%"
              animate={{
                stopColor: gradientColors.map(c => c.start),
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: "linear",
              }}
            />
            <motion.stop
              offset="100%"
              animate={{
                stopColor: gradientColors.map(c => c.end),
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          </motion.linearGradient>

          {/* Glass highlight gradient */}
          <linearGradient id="glassHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="white" stopOpacity="0.35" />
            <stop offset="50%" stopColor="white" stopOpacity="0.1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>

          {/* Blur filter for inner glow */}
          <filter id="innerGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Main morphing blob */}
        <motion.path
          fill="url(#blobGradient)"
          animate={{
            d: blobPaths,
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
            times: [0, 0.25, 0.5, 0.75, 1],
          }}
          style={{
            filter: "drop-shadow(0 0 8px hsla(160, 60%, 45%, 0.5))",
          }}
        />

        {/* Glass highlight overlay */}
        <motion.path
          fill="url(#glassHighlight)"
          animate={{
            d: blobPaths,
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
            times: [0, 0.25, 0.5, 0.75, 1],
          }}
          style={{
            transform: "scale(0.85) translate(7px, 5px)",
          }}
        />
      </svg>

      {/* Orbiting particles */}
      {showParticles && (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full bg-primary/60"
              style={{
                boxShadow: "0 0 6px hsla(160, 60%, 50%, 0.8)",
              }}
              animate={{
                x: [
                  Math.cos((i * 72 * Math.PI) / 180) * (size * 0.45),
                  Math.cos(((i * 72 + 360) * Math.PI) / 180) * (size * 0.45),
                ],
                y: [
                  Math.sin((i * 72 * Math.PI) / 180) * (size * 0.45),
                  Math.sin(((i * 72 + 360) * Math.PI) / 180) * (size * 0.45),
                ],
                opacity: [0.3, 0.8, 0.3],
                scale: [0.8, 1.2, 0.8],
              }}
              transition={{
                duration: 6,
                repeat: Infinity,
                ease: "linear",
                delay: i * 0.3,
              }}
            />
          ))}
        </>
      )}
    </div>
  );
};

export default LiquidBlobLoader;
