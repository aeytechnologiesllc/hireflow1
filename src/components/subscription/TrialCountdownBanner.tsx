import { useState, useEffect } from "react";
import { useSubscription } from "@/hooks/useSubscription";
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
    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
      <span className={`${isCritical ? "text-destructive" : isUrgent ? "text-amber-500" : ""}`}>
        {formatTimeCompact()} left
      </span>
      <button
        onClick={() => navigate("/settings?tab=subscription")}
        className="text-primary hover:text-primary/80 transition-colors"
      >
        Upgrade
      </button>
    </div>
  );
}
