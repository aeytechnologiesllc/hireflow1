import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { User, ArrowRight, X } from "lucide-react";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/useProfile";
import { calculateProfileCompleteness } from "@/components/ProfileCompleteness";

export function ProfileCompletionCard() {
  const { data: profile, isLoading } = useProfile();
  const [isDismissed, setIsDismissed] = useState(false);

  // Check localStorage for dismissed state
  useEffect(() => {
    const dismissed = localStorage.getItem("profile-completion-dismissed");
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      // Re-show after 7 days
      if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) {
        setIsDismissed(true);
      }
    }
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem("profile-completion-dismissed", Date.now().toString());
  };

  if (isLoading || isDismissed) return null;

  const { percentage, missingFields } = calculateProfileCompleteness(profile);

  // Don't show if profile is >= 80% complete
  if (percentage >= 80) return null;

  const strokeWidth = 4;
  const size = 52;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const getColor = () => {
    if (percentage >= 75) return "var(--primary)";
    if (percentage >= 50) return "hsl(142.1 76.2% 36.3%)";
    if (percentage >= 25) return "hsl(45.4 93.4% 47.5%)";
    return "var(--destructive)";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="bg-gradient-to-br from-accent/10 via-primary/5 to-card border-accent/20 relative overflow-hidden">
        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors z-10"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        <CardContent className="p-4 md:p-6">
          <div className="flex items-center gap-4">
            {/* Progress Ring */}
            <div className="relative shrink-0" style={{ width: size, height: size }}>
              <svg width={size} height={size} className="transform -rotate-90">
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke="var(--muted)"
                  strokeWidth={strokeWidth}
                />
                <motion.circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={getColor()}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <User className="h-5 w-5 text-accent" />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground text-sm md:text-base">
                Stand Out to Employers
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
                {percentage}% complete • Employers can see your profile when reviewing applications
              </p>
              {missingFields.length > 0 && missingFields.length <= 4 && (
                <p className="text-xs text-muted-foreground/70 mt-1 truncate">
                  Missing: {missingFields.slice(0, 3).join(", ")}
                  {missingFields.length > 3 && ` +${missingFields.length - 3} more`}
                </p>
              )}
            </div>

            {/* Action Button */}
            <Button size="sm" variant="secondary" className="shrink-0 gap-1" asChild>
              <Link to="/profile">
                Complete Profile
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default ProfileCompletionCard;
