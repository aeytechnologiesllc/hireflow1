import { useEffect, useState } from "react";
import { motion, useSpring, useTransform } from "framer-motion";

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  className?: string;
}

export function AnimatedCounter({ value, duration = 1.5, className = "" }: AnimatedCounterProps) {
  const [hasAnimated, setHasAnimated] = useState(false);
  
  const spring = useSpring(0, {
    stiffness: 50,
    damping: 20,
    duration: duration * 1000,
  });
  
  const display = useTransform(spring, (current) => Math.round(current));
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!hasAnimated && value > 0) {
      spring.set(value);
      setHasAnimated(true);
    } else if (hasAnimated) {
      spring.set(value);
    }
  }, [value, spring, hasAnimated]);

  useEffect(() => {
    const unsubscribe = display.on("change", (latest) => {
      setDisplayValue(latest);
    });
    return unsubscribe;
  }, [display]);

  // If value is 0, just show 0 without animation
  if (value === 0) {
    return <span className={className}>0</span>;
  }

  return (
    <motion.span className={className}>
      {displayValue}
    </motion.span>
  );
}
