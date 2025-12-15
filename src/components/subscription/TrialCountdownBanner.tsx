import { useState, useEffect } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Clock, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export default function TrialCountdownBanner() {
  const { subscription, getTrialTimeRemaining, isTrialing } = useSubscription();
  const navigate = useNavigate();
  const [timeRemaining, setTimeRemaining] = useState(getTrialTimeRemaining());

  useEffect(() => {
    if (!isTrialing) return;
    
    const interval = setInterval(() => {
      setTimeRemaining(getTrialTimeRemaining());
    }, 60000); // Update every minute

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
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-300",
        isCritical
          ? "bg-destructive/20 border border-destructive/30 animate-pulse"
          : isUrgent
          ? "bg-orange-500/20 border border-orange-500/30"
          : "bg-primary/10 border border-primary/20"
      )}
    >
      <Clock
        className={cn(
          "h-4 w-4",
          isCritical
            ? "text-destructive"
            : isUrgent
            ? "text-orange-400"
            : "text-primary"
        )}
      />
      <span
        className={cn(
          "text-sm font-medium",
          isCritical
            ? "text-destructive"
            : isUrgent
            ? "text-orange-400"
            : "text-primary"
        )}
      >
        Trial: {formatTime()} left
      </span>
      <Button
        size="sm"
        variant={isCritical ? "destructive" : "default"}
        className="h-7 gap-1 text-xs"
        onClick={() => navigate("/settings?tab=subscription")}
      >
        <Sparkles className="h-3 w-3" />
        Upgrade
      </Button>
    </div>
  );
}
