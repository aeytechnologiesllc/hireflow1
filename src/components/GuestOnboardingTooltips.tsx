import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useState, useEffect } from "react";
import avaOrb from "@/assets/ava-orb.png";

interface GuestOnboardingTooltipsProps {
  step: "title" | "difficulty" | "publish";
  onDismiss: () => void;
}

const TOOLTIPS = {
  title: {
    message: "AVA learns from this — the more specific, the better your screening workflow",
    position: "right" as const,
  },
  difficulty: {
    message: "This controls how rigorous AVA screens applicants before they reach you",
    position: "top" as const,
  },
  publish: {
    message: "Your job goes live instantly — applicants can start applying right away",
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
    
    // Delay showing tooltip for a smooth experience
    const timer = setTimeout(() => setIsVisible(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    const newDismissed = [...dismissed, step];
    setDismissed(newDismissed);
    localStorage.setItem("guestTooltipsDismissed", JSON.stringify(newDismissed));
    setIsVisible(false);
    onDismiss();
  };

  // Auto-dismiss after 6 seconds
  useEffect(() => {
    if (isVisible && !dismissed.includes(step)) {
      const timer = setTimeout(handleDismiss, 6000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, step, dismissed]);

  if (dismissed.includes(step)) return null;

  const tooltip = TOOLTIPS[step];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: tooltip.position === "top" ? 8 : 0, x: tooltip.position === "right" ? -8 : 0, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className={`absolute z-50 ${
            tooltip.position === "right" ? "left-full ml-4 top-1/2 -translate-y-1/2" :
            tooltip.position === "top" ? "bottom-full mb-4 left-1/2 -translate-x-1/2" :
            "top-full mt-4 left-1/2 -translate-x-1/2"
          }`}
        >
          {/* Premium dark glass-morphism tooltip */}
          <div className="relative bg-[hsl(220,15%,8%)]/95 backdrop-blur-xl text-white px-5 py-4 rounded-2xl shadow-2xl max-w-[280px] border border-emerald-500/20">
            {/* Subtle glow effect */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
            
            <div className="relative flex items-start gap-3">
              {/* AVA orb icon */}
              <motion.img 
                src={avaOrb} 
                alt="" 
                className="w-7 h-7 shrink-0 mt-0.5"
                animate={{ 
                  scale: [1, 1.05, 1],
                  opacity: [0.85, 1, 0.85]
                }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              />
              
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-relaxed text-gray-200">{tooltip.message}</p>
              </div>
              
              <button 
                onClick={handleDismiss}
                className="shrink-0 p-1.5 -mr-1.5 -mt-1 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            
            {/* Arrow with matching style */}
            <div 
              className={`absolute w-3 h-3 bg-[hsl(220,15%,8%)]/95 border-emerald-500/20 rotate-45 ${
                tooltip.position === "right" ? "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 border-l border-b" :
                tooltip.position === "top" ? "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 border-r border-b" :
                "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 border-l border-t"
              }`}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
