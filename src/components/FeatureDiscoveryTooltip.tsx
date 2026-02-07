import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FeatureDiscoveryTooltipProps {
  /** Unique ID for localStorage tracking (e.g., "ai_shortlist", "job_code") */
  featureId: string;
  /** Title of the feature */
  title: string;
  /** Description explaining what the feature does */
  description: string;
  /** Position relative to the child element */
  position?: "top" | "bottom" | "left" | "right";
  /** The element to wrap */
  children: React.ReactNode;
  /** Optional icon to show */
  icon?: React.ReactNode;
  /** Auto-dismiss after this many milliseconds (default: 8000, 0 to disable) */
  autoDismissMs?: number;
  /** Additional class names for the tooltip */
  className?: string;
  /** Delay before showing tooltip in milliseconds */
  delayMs?: number;
}

const STORAGE_KEY_PREFIX = "feature_discovery_";

/**
 * A one-time feature discovery tooltip that helps users understand new features.
 * Shows only once per feature (tracked via localStorage).
 */
export function FeatureDiscoveryTooltip({
  featureId,
  title,
  description,
  position = "bottom",
  children,
  icon,
  autoDismissMs = 8000,
  className,
  delayMs = 500,
}: FeatureDiscoveryTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const storageKey = `${STORAGE_KEY_PREFIX}${featureId}`;

  // Check if already dismissed
  useEffect(() => {
    const alreadyDismissed = localStorage.getItem(storageKey) === "dismissed";
    if (!alreadyDismissed) {
      // Show after delay
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, delayMs);
      return () => clearTimeout(timer);
    }
  }, [storageKey, delayMs]);

  // Auto-dismiss after timeout
  useEffect(() => {
    if (isVisible && autoDismissMs > 0) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, autoDismissMs);
      return () => clearTimeout(timer);
    }
  }, [isVisible, autoDismissMs]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    localStorage.setItem(storageKey, "dismissed");
  }, [storageKey]);

  // Position-based styling
  const positionStyles = {
    top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
    bottom: "top-full mt-2 left-1/2 -translate-x-1/2",
    left: "right-full mr-2 top-1/2 -translate-y-1/2",
    right: "left-full ml-2 top-1/2 -translate-y-1/2",
  };

  const arrowStyles = {
    top: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45",
    bottom: "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45",
    left: "right-0 top-1/2 -translate-y-1/2 translate-x-1/2 rotate-45",
    right: "left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 rotate-45",
  };

  return (
    <div className="relative inline-block">
      {children}
      
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "absolute z-50 w-64 p-3 rounded-lg shadow-lg",
              "bg-card border border-primary/30",
              "backdrop-blur-sm",
              positionStyles[position],
              className
            )}
          >
            {/* Arrow */}
            <div
              className={cn(
                "absolute w-3 h-3 bg-card border-l border-t border-primary/30",
                arrowStyles[position]
              )}
            />

            {/* Content */}
            <div className="relative">
              <div className="flex items-start gap-2">
                {icon && (
                  <span className="text-primary shrink-0 mt-0.5">{icon}</span>
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-foreground text-sm mb-1">
                    {title}
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {description}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 -mt-1 -mr-1 text-muted-foreground hover:text-foreground"
                  onClick={handleDismiss}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* "Got it" button */}
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3 h-7 text-xs"
                onClick={handleDismiss}
              >
                Got it
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Reset a specific feature discovery tooltip (for testing/debugging)
 */
export function resetFeatureDiscovery(featureId: string) {
  localStorage.removeItem(`${STORAGE_KEY_PREFIX}${featureId}`);
}

/**
 * Reset all feature discovery tooltips
 */
export function resetAllFeatureDiscoveries() {
  const keys = Object.keys(localStorage);
  keys.forEach((key) => {
    if (key.startsWith(STORAGE_KEY_PREFIX)) {
      localStorage.removeItem(key);
    }
  });
}

export default FeatureDiscoveryTooltip;
