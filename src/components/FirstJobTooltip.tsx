import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import AvaGlyph from "@/components/AvaGlyph";
import { useState, useEffect } from "react";

interface FirstJobTooltipProps {
  show: boolean;
  onDismiss: () => void;
}

const STORAGE_KEY = "firstJobTooltipDismissed";

export default function FirstJobTooltip({ show, onDismiss }: FirstJobTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed] = useState(() => localStorage.getItem(STORAGE_KEY) === "true");
  
  useEffect(() => {
    if (show && !isDismissed) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 1200);
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

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="w-full"
        >
          <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-left shadow-sm">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
              <AvaGlyph className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Autopilot is active</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Ava reviews, progresses, and notifies candidates automatically. Use <span className="font-medium text-foreground">Take Control</span> anytime if you want to manage this job manually.
              </p>
            </div>
            <button
              onClick={handleDismiss}
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
              aria-label="Dismiss autopilot tip"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
