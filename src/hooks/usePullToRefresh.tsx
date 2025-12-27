import { useState, useCallback, useRef, useEffect } from "react";
import { hapticMedium } from "@/lib/haptics";
import { Loader2, ArrowDown } from "lucide-react";

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

  // Check if scroll is at top
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
  }, [isRefreshing]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (isRefreshing || startY.current === null || !isAtTop.current) return;

    currentY.current = e.touches[0].clientY;
    const delta = currentY.current - startY.current;

    // Only track downward pulls
    if (delta > 0) {
      const progress = Math.min(delta / maxPull, 1);
      setPullProgress(progress);
    }
  }, [isRefreshing, maxPull]);

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

    // Reset
    startY.current = null;
    currentY.current = null;
    setPullProgress(0);
  }, [isRefreshing, threshold, onRefresh]);

  const PullIndicator: React.FC = () => {
    if (pullProgress === 0 && !isRefreshing) return null;

    const translateY = isRefreshing ? 40 : pullProgress * 60;
    const rotation = isRefreshing ? 0 : pullProgress * 180;
    const scale = 0.5 + pullProgress * 0.5;
    const opacity = pullProgress > 0.1 || isRefreshing ? 1 : 0;

    return (
      <div
        className="fixed top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-opacity duration-150"
        style={{ opacity }}
      >
        <div
          className="w-10 h-10 rounded-full bg-background border border-border shadow-lg flex items-center justify-center transition-transform duration-150"
          style={{
            transform: `translateY(${translateY}px) scale(${scale})`,
          }}
        >
          {isRefreshing ? (
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          ) : (
            <ArrowDown 
              className="w-5 h-5 text-primary transition-transform"
              style={{ transform: `rotate(${rotation}deg)` }}
            />
          )}
        </div>
      </div>
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
