import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Timer, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function TrialCountdownBanner() {
  const { getTrialTimeRemaining, isTrialing } = useSubscription();
  const navigate = useNavigate();
  const [timeRemaining, setTimeRemaining] = useState(getTrialTimeRemaining());

  useEffect(() => {
    if (!isTrialing) return;
    
    const interval = setInterval(() => {
      setTimeRemaining(getTrialTimeRemaining());
    }, 60000);

    return () => clearInterval(interval);
  }, [isTrialing, getTrialTimeRemaining]);

  if (!isTrialing || !timeRemaining) return null;

  const isUrgent = timeRemaining.days === 0 && timeRemaining.hours < 24;
  const isCritical = timeRemaining.days === 0 && timeRemaining.hours < 6;

  const formatTime = () => {
    if (timeRemaining.days > 0) {
      return `${timeRemaining.days}d ${timeRemaining.hours}h`;
    }
    if (timeRemaining.hours > 0) {
      return `${timeRemaining.hours}h ${timeRemaining.minutes}m`;
    }
    return `${timeRemaining.minutes}m`;
  };

  const formatTimeCompact = () => {
    if (timeRemaining.days > 0) {
      return `${timeRemaining.days}d`;
    }
    if (timeRemaining.hours > 0) {
      return `${timeRemaining.hours}h`;
    }
    return `${timeRemaining.minutes}m`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-1.5 md:gap-3 px-2 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl border backdrop-blur-sm transition-all duration-300 flex-shrink-0 whitespace-nowrap ${
        isCritical
          ? "bg-gradient-to-r from-red-500/20 to-orange-500/20 border-red-500/30"
          : isUrgent
          ? "bg-gradient-to-r from-orange-500/20 to-amber-500/20 border-orange-500/30"
          : "bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-500/20"
      }`}
    >
      <Timer
        className={`h-3.5 w-3.5 md:h-4 md:w-4 flex-shrink-0 ${
          isCritical
            ? "text-red-400"
            : isUrgent
            ? "text-orange-400"
            : "text-emerald-400"
        }`}
      />
      <span
        className={`text-[11px] md:text-sm font-medium flex-shrink-0 ${
          isCritical
            ? "text-red-400"
            : isUrgent
            ? "text-orange-400"
            : "text-emerald-400"
        }`}
      >
        <span className="hidden md:inline">{formatTime()}</span>
        <span className="md:hidden">Trial {formatTimeCompact()}</span>
      </span>
      <Button
        size="sm"
        className={`h-6 md:h-7 gap-1 text-[10px] md:text-xs px-2 md:px-3 flex-shrink-0 ${
          isCritical
            ? "bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600"
            : "bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500"
        } text-white shadow-lg`}
        onClick={() => navigate("/settings?tab=subscription")}
      >
        <span>Upgrade</span>
        <ArrowRight className="h-3 w-3" />
      </Button>
    </motion.div>
  );
}
