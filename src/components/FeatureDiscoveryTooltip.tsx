import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";

interface FeatureDiscoveryTooltipProps {
  featureId: string;
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
  icon?: React.ReactNode;
  autoDismissMs?: number;
  className?: string;
  delayMs?: number;
}

const STORAGE_KEY_PREFIX = "feature_discovery_";

const positionToSide = {
  top: "top",
  bottom: "bottom",
  left: "left",
  right: "right",
} as const;

function TooltipCard({
  title,
  description,
  icon,
  onDismiss,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="flex items-start gap-2.5">
        {icon && (
          <span className="text-primary shrink-0 mt-0.5">{icon}</span>
        )}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-foreground text-sm mb-1">
            {title}
          </h4>
          <p className="text-xs text-muted-foreground/75 leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full mt-3 h-8 text-xs"
        onClick={onDismiss}
      >
        Got it
      </Button>
    </motion.div>
  );
}

export function FeatureDiscoveryTooltip({
  featureId,
  title,
  description,
  position = "bottom",
  children,
  icon,
  autoDismissMs = 8000,
  delayMs = 500,
}: FeatureDiscoveryTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const isMobile = useIsMobile();
  const storageKey = `${STORAGE_KEY_PREFIX}${featureId}`;

  useEffect(() => {
    const alreadyDismissed = localStorage.getItem(storageKey) === "dismissed";
    if (!alreadyDismissed) {
      const timer = setTimeout(() => setIsVisible(true), delayMs);
      return () => clearTimeout(timer);
    }
  }, [storageKey, delayMs]);

  useEffect(() => {
    if (isVisible && autoDismissMs > 0) {
      const timer = setTimeout(() => handleDismiss(), autoDismissMs);
      return () => clearTimeout(timer);
    }
  }, [isVisible, autoDismissMs]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    localStorage.setItem(storageKey, "dismissed");
  }, [storageKey]);

  // Mobile: centered fixed overlay
  if (isMobile) {
    return (
      <>
        {children}
        <AnimatePresence>
          {isVisible && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-50 flex items-center justify-center"
              onClick={handleDismiss}
            >
              {/* Backdrop */}
              <div className="absolute inset-0 bg-black/30" />
              {/* Card */}
              <div
                className="relative w-[calc(100vw-48px)] max-w-[320px] p-4 rounded-2xl border border-primary/15 bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/40"
                onClick={(e) => e.stopPropagation()}
              >
                <TooltipCard
                  title={title}
                  description={description}
                  icon={icon}
                  onDismiss={handleDismiss}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  // Desktop: Radix Popover with collision detection
  return (
    <Popover open={isVisible} onOpenChange={(open) => { if (!open) handleDismiss(); }}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent
        side={positionToSide[position]}
        collisionPadding={16}
        className="w-64 p-4 rounded-2xl border-primary/15 bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/40 animate-in fade-in-0 zoom-in-[0.96] duration-[180ms]"
      >
        <TooltipCard
          title={title}
          description={description}
          icon={icon}
          onDismiss={handleDismiss}
        />
      </PopoverContent>
    </Popover>
  );
}

export function resetFeatureDiscovery(featureId: string) {
  localStorage.removeItem(`${STORAGE_KEY_PREFIX}${featureId}`);
}

export function resetAllFeatureDiscoveries() {
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith(STORAGE_KEY_PREFIX)) {
      localStorage.removeItem(key);
    }
  });
}

export default FeatureDiscoveryTooltip;
