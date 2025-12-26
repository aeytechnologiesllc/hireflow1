import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useState, useEffect } from "react";
import avaOrb from "@/assets/ava-orb.png";

interface FirstJobTooltipProps {
  show: boolean;
  onDismiss: () => void;
}

const STORAGE_KEY = "firstJobTooltipDismissed";

export default function FirstJobTooltip({ show, onDismiss }: FirstJobTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  
  useEffect(() => {
    // Check localStorage for dismissed state
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed === "true") {
      setIsDismissed(true);
      return;
    }
    
    // Delay showing tooltip for a smooth experience
    if (show && !isDismissed) {
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [show, isDismissed]);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsVisible(false);
    setIsDismissed(true);
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
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="absolute z-50 bottom-full mb-3 left-1/2 -translate-x-1/2"
        >
          {/* Premium dark glass-morphism tooltip */}
          <div className="relative bg-[hsl(220,15%,8%)]/95 backdrop-blur-xl text-white px-5 py-4 rounded-2xl shadow-2xl max-w-[320px] border border-emerald-500/20">
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
                <p className="text-sm leading-relaxed text-gray-200">
                  Your job is currently on <span className="text-emerald-400 font-medium">Autopilot</span>. 
                  Ava handles everything automatically. You can take control anytime by clicking this button.
                </p>
              </div>
              
              <button 
                onClick={handleDismiss}
                className="shrink-0 p-1.5 -mr-1.5 -mt-1 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            
            {/* Arrow pointing down */}
            <div className="absolute w-3 h-3 bg-[hsl(220,15%,8%)]/95 border-emerald-500/20 rotate-45 bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 border-r border-b" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
