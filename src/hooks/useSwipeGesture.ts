import { useCallback } from "react";
import { PanInfo } from "framer-motion";

export interface SwipeConfig {
  threshold?: number;  // px offset to trigger swipe (default: 50)
  velocity?: number;   // velocity threshold (default: 500)
}

export interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

const DEFAULT_CONFIG: Required<SwipeConfig> = {
  threshold: 50,
  velocity: 500,
};

export function useSwipeGesture(
  handlers: SwipeHandlers,
  config?: SwipeConfig
) {
  const { threshold, velocity } = { ...DEFAULT_CONFIG, ...config };

  const onDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const { offset, velocity: v } = info;

      // Horizontal swipes
      if (Math.abs(offset.x) > Math.abs(offset.y)) {
        if (offset.x < -threshold || v.x < -velocity) {
          handlers.onSwipeLeft?.();
        } else if (offset.x > threshold || v.x > velocity) {
          handlers.onSwipeRight?.();
        }
      } 
      // Vertical swipes
      else {
        if (offset.y < -threshold || v.y < -velocity) {
          handlers.onSwipeUp?.();
        } else if (offset.y > threshold || v.y > velocity) {
          handlers.onSwipeDown?.();
        }
      }
    },
    [handlers, threshold, velocity]
  );

  return {
    onDragEnd,
    drag: true as const,
    dragConstraints: { left: 0, right: 0, top: 0, bottom: 0 },
    dragElastic: 0.2,
  };
}
