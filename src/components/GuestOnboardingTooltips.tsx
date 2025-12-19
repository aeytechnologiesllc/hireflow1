import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";

interface GuestOnboardingTooltipsProps {
  step: "title" | "difficulty" | "publish";
  onDismiss: () => void;
}

const TOOLTIPS = {
  title: {
    message: "AVA uses the job title to understand what skills to screen for",
    position: "right" as const,
  },
  difficulty: {
    message: "Higher difficulty = more thorough screening, fewer unqualified applicants reaching you",
    position: "top" as const,
  },
  publish: {
    message: "Publishing makes your job live and starts accepting applications immediately",
    position: "top" as const,
  },
};

export default function GuestOnboardingTooltips({ step, onDismiss }: GuestOnboardingTooltipsProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  
  useEffect(() => {
    // Check localStorage for dismissed tooltips
    const storedDismissed = localStorage.getItem("guestTooltipsDismissed");
    if (storedDismissed) {
      setDismissed(JSON.parse(storedDismissed));
    }
    
    // Delay showing tooltip
    const timer = setTimeout(() => setIsVisible(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    const newDismissed = [...dismissed, step];
    setDismissed(newDismissed);
    localStorage.setItem("guestTooltipsDismissed", JSON.stringify(newDismissed));
    setIsVisible(false);
    onDismiss();
  };

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    if (isVisible && !dismissed.includes(step)) {
      const timer = setTimeout(handleDismiss, 8000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, step, dismissed]);

  if (dismissed.includes(step)) return null;

  const tooltip = TOOLTIPS[step];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: tooltip.position === "top" ? 10 : 0, x: tooltip.position === "right" ? -10 : 0 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className={`absolute z-50 ${
            tooltip.position === "right" ? "left-full ml-4 top-1/2 -translate-y-1/2" :
            tooltip.position === "top" ? "bottom-full mb-4 left-1/2 -translate-x-1/2" :
            "top-full mt-4 left-1/2 -translate-x-1/2"
          }`}
        >
          <div className="bg-gradient-to-br from-purple-600/90 to-fuchsia-600/90 backdrop-blur-sm text-white px-4 py-3 rounded-xl shadow-2xl max-w-[250px] border border-white/20">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-purple-200" />
              <p className="text-sm leading-relaxed">{tooltip.message}</p>
              <button 
                onClick={handleDismiss}
                className="shrink-0 p-0.5 hover:bg-white/20 rounded transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            
            {/* Arrow */}
            <div 
              className={`absolute w-3 h-3 bg-gradient-to-br from-purple-600/90 to-fuchsia-600/90 rotate-45 ${
                tooltip.position === "right" ? "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2" :
                tooltip.position === "top" ? "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2" :
                "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2"
              }`}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
