import { useState, useCallback, useRef, useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { hapticLight, hapticMedium } from "@/lib/haptics";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  maxPull?: number;
}

interface UsePullToRefreshReturn {
  isRefreshing: boolean;
  pullProgress: number;
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
  PullIndicator: React.FC;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  maxPull = 120,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const startY = useRef<number | null>(null);
  const currentY = useRef<number | null>(null);
  const isAtTop = useRef(true);
  const crossedThreshold = useRef(false);

  const checkScrollPosition = useCallback(() => {
    isAtTop.current = window.scrollY <= 0;
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", checkScrollPosition, { passive: true });
    checkScrollPosition();
    return () => window.removeEventListener("scroll", checkScrollPosition);
  }, [checkScrollPosition]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (isRefreshing || !isAtTop.current) return;
    startY.current = e.touches[0].clientY;
    currentY.current = startY.current;
    crossedThreshold.current = false;
  }, [isRefreshing]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (isRefreshing || startY.current === null || !isAtTop.current) return;

    currentY.current = e.touches[0].clientY;
    const delta = currentY.current - startY.current;

    if (delta > 0) {
      const progress = Math.min(delta / maxPull, 1);
      setPullProgress(progress);

      // Haptic when crossing threshold
      const thresholdProgress = threshold / maxPull;
      if (progress >= thresholdProgress && !crossedThreshold.current) {
        crossedThreshold.current = true;
        hapticLight();
      } else if (progress < thresholdProgress && crossedThreshold.current) {
        crossedThreshold.current = false;
      }
    }
  }, [isRefreshing, maxPull, threshold]);

  const onTouchEnd = useCallback(async () => {
    if (isRefreshing || startY.current === null) return;

    const delta = (currentY.current || 0) - startY.current;

    if (delta >= threshold) {
      hapticMedium();
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }

    startY.current = null;
    currentY.current = null;
    setPullProgress(0);
  }, [isRefreshing, threshold, onRefresh]);

  const PullIndicator: React.FC = () => {
    const motionProgress = useMotionValue(pullProgress);
    const springY = useSpring(motionProgress, { stiffness: 400, damping: 30 });
    const translateY = useTransform(springY, [0, 1], [0, 60]);
    const scale = useTransform(springY, [0, 0.3, 1], [0.3, 0.6, 1]);
    const opacity = useTransform(springY, [0, 0.08, 0.15], [0, 0, 1]);

    useEffect(() => {
      motionProgress.set(pullProgress);
    }, [pullProgress, motionProgress]);

    const thresholdRatio = threshold / maxPull;
    const pastThreshold = pullProgress >= thresholdRatio;

    // SVG ring
    const ringSize = 28;
    const strokeWidth = 2;
    const radius = (ringSize - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const ringProgress = Math.min(pullProgress / thresholdRatio, 1);
    const dashOffset = circumference - ringProgress * circumference;

    if (pullProgress === 0 && !isRefreshing) return null;

    return (
      <motion.div
        className="fixed top-16 left-1/2 z-50 pointer-events-none"
        style={{
          x: "-50%",
          y: translateY,
          scale,
          opacity: isRefreshing ? 1 : opacity,
        }}
      >
        <div className="relative flex items-center justify-center" style={{ width: ringSize, height: ringSize }}>
          {/* Glow */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle, hsl(var(--primary) / ${pastThreshold || isRefreshing ? 0.5 : 0.25}) 0%, transparent 70%)`,
              transform: "scale(2.5)",
            }}
            animate={isRefreshing ? { opacity: [0.4, 0.8, 0.4] } : undefined}
            transition={isRefreshing ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : undefined}
          />

          {/* Progress ring */}
          <svg
            width={ringSize}
            height={ringSize}
            className="absolute inset-0 -rotate-90"
          >
            {/* Track */}
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke="hsl(var(--primary) / 0.15)"
              strokeWidth={strokeWidth}
            />
            {/* Fill */}
            <motion.circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={isRefreshing ? 0 : dashOffset}
              animate={isRefreshing ? { rotate: 360 } : undefined}
              transition={isRefreshing ? { duration: 1.2, repeat: Infinity, ease: "linear" } : undefined}
              style={{ transformOrigin: "center" }}
            />
          </svg>

          {/* Core orb */}
          <motion.div
            className="rounded-full bg-primary"
            style={{ width: 8, height: 8 }}
            animate={
              isRefreshing
                ? { scale: [1, 1.3, 1], opacity: [0.8, 1, 0.8] }
                : { scale: pastThreshold ? 1.2 : 1, opacity: pastThreshold ? 1 : 0.7 }
            }
            transition={
              isRefreshing
                ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
                : { type: "spring", stiffness: 300, damping: 20 }
            }
          />
        </div>
      </motion.div>
    );
  };

  return {
    isRefreshing,
    pullProgress,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
    PullIndicator,
  };
}
