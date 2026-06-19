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
    <button
      type="button"
      onClick={() => navigate("/settings?tab=subscription")}
      title={`Trial ends in ${formatTime()}. Open subscription settings.`}
      className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-primary/10"
    >
      <span className="hidden text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70 xl:inline">
        Trial
      </span>
      <span className={`font-medium ${isCritical ? "text-destructive" : isUrgent ? "text-warning" : "text-foreground"}`}>
        {formatTimeCompact()} left
      </span>
      <span className="hidden font-medium text-primary 2xl:inline">Upgrade</span>
    </button>
  );
}
