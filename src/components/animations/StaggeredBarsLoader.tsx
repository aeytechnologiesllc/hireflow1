import { motion } from "framer-motion";

interface StaggeredBarsLoaderProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeConfig = {
  sm: { height: 24, barWidth: 3, gap: 3 },
  md: { height: 36, barWidth: 4, gap: 4 },
  lg: { height: 48, barWidth: 5, gap: 5 },
};

const barColors = [
  "var(--primary)",
  "color-mix(in oklab, var(--primary) 85%, transparent)",
  "var(--accent)",
  "color-mix(in oklab, var(--primary) 85%, transparent)",
  "var(--primary)",
];

export function StaggeredBarsLoader({ size = "md", className = "" }: StaggeredBarsLoaderProps) {
  const config = sizeConfig[size];
  const totalWidth = config.barWidth * 5 + config.gap * 4;

  return (
    <div 
      className={`flex items-center justify-center gap-[${config.gap}px] ${className}`}
      style={{ height: config.height, width: totalWidth, gap: config.gap }}
    >
      {[0, 1, 2, 3, 4].map((index) => (
        <motion.div
          key={index}
          className="rounded-sm"
          layout={false}
          style={{
            width: config.barWidth,
            backgroundColor: barColors[index],
            originY: 0.5,
            willChange: "transform",
            transform: "translateZ(0)",
          }}
          animate={{
            scaleY: [0.2, 1, 0.2],
          }}
          transition={{
            duration: 1.0,
            repeat: Infinity,
            ease: [0.45, 0.05, 0.55, 0.95],
            delay: index * 0.08,
          }}
          initial={{ scaleY: 0.2, height: config.height }}
        />
      ))}
    </div>
  );
}
