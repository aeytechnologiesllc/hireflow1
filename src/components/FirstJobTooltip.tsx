import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

interface FirstJobTooltipProps {
  show: boolean;
  onDismiss: () => void;
}

const STORAGE_KEY = "firstJobTooltipDismissed";

export default function FirstJobTooltip({ show, onDismiss }: FirstJobTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed] = useState(() => localStorage.getItem(STORAGE_KEY) === "true");
  const isMobile = useIsMobile();
  
  useEffect(() => {
    if (show && !isDismissed) {
      const timer = setTimeout(() => {
        setIsVisible(true);
        localStorage.setItem(STORAGE_KEY, "true");
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [show, isDismissed]);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsVisible(false);
    onDismiss();
  };

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(handleDismiss, 8000);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  if (isDismissed || !show) return null;

  // Mobile: centered fixed overlay (prevents clipping)
  if (isMobile) {
    return (
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
            <div className="absolute inset-0 bg-black/30" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="relative w-[calc(100vw-48px)] max-w-[300px] bg-card/95 backdrop-blur-xl text-foreground px-4 py-3 rounded-2xl shadow-2xl shadow-black/40 border border-primary/15"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Your job is on <span className="text-primary font-medium">Autopilot</span>. 
                    Ava handles everything automatically. Take control anytime with this button.
                  </p>
                </div>
                <button 
                  onClick={handleDismiss}
                  className="shrink-0 p-1 -mr-1 -mt-0.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Desktop: absolute positioned tooltip
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="absolute z-50 bottom-full mb-3 right-0 w-[calc(100vw-48px)] max-w-[300px]"
        >
          <div className="relative bg-card/95 backdrop-blur-sm text-foreground px-4 py-3 rounded-xl shadow-lg border border-border">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Your job is on <span className="text-primary font-medium">Autopilot</span>. 
                  Ava handles everything automatically. Take control anytime with this button.
                </p>
              </div>
              <button 
                onClick={handleDismiss}
                className="shrink-0 p-1 -mr-1 -mt-0.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="absolute w-2.5 h-2.5 bg-card rotate-45 bottom-0 right-6 translate-y-1/2 border-r border-b border-border" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
