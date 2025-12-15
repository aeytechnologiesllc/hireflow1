import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Clock, Sparkles } from "lucide-react";
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

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-3 px-4 py-2 rounded-xl border backdrop-blur-sm transition-all duration-300 ${
        isCritical
          ? "bg-gradient-to-r from-red-500/20 to-orange-500/20 border-red-500/30"
          : isUrgent
          ? "bg-gradient-to-r from-orange-500/20 to-amber-500/20 border-orange-500/30"
          : "bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-500/20"
      }`}
    >
      <motion.div
        animate={isCritical ? { scale: [1, 1.1, 1] } : {}}
        transition={{ duration: 1, repeat: isCritical ? Infinity : 0 }}
      >
        <Clock
          className={`h-4 w-4 ${
            isCritical
              ? "text-red-400"
              : isUrgent
              ? "text-orange-400"
              : "text-emerald-400"
          }`}
        />
      </motion.div>
      <span
        className={`text-sm font-medium ${
          isCritical
            ? "text-red-400"
            : isUrgent
            ? "text-orange-400"
            : "text-emerald-400"
        }`}
      >
        Trial: {formatTime()} left
      </span>
      <Button
        size="sm"
        className={`h-7 gap-1 text-xs ${
          isCritical
            ? "bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600"
            : "bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500"
        } text-white shadow-lg`}
        onClick={() => navigate("/settings?tab=subscription")}
      >
        <Sparkles className="h-3 w-3" />
        Upgrade
      </Button>
    </motion.div>
  );
}
