import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Clock, CheckCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateRemainingTime, phaseDurationEstimates } from "@/lib/phaseDurations";

interface Phase {
  id: string;
  title: string;
  type: string;
  icon?: any;
}

interface CandidateJourneyProgressProps {
  /** All phases in the workflow */
  phases: Phase[];
  /** Index of the current active phase */
  currentPhaseIndex: number;
  /** Indexes of completed phases */
  completedPhases: number[];
  /** Whether this is displayed inline (smaller) or as a card */
  variant?: "card" | "inline";
  /** Additional class names */
  className?: string;
}

/**
 * Shows the candidate's overall progress through the application journey
 * with step indicators and estimated time remaining.
 */
export function CandidateJourneyProgress({
  phases,
  currentPhaseIndex,
  completedPhases,
  variant = "card",
  className,
}: CandidateJourneyProgressProps) {
  // Calculate progress percentage
  const totalPhases = phases.length;
  const completedCount = completedPhases.length;
  const progressPercentage = Math.round((completedCount / Math.max(totalPhases - 1, 1)) * 100);

  // Calculate remaining time for incomplete phases
  const remainingTime = calculateRemainingTime(
    phases.map((p) => ({ id: p.id, type: p.type })),
    completedPhases,
    currentPhaseIndex
  );

  // Find if "hired" is a phase and if we've reached it
  const isComplete = phases[currentPhaseIndex]?.type === "hired" || 
                     phases[currentPhaseIndex]?.id === "hired" ||
                     completedPhases.includes(phases.length - 1);

  if (variant === "inline") {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Step {Math.min(currentPhaseIndex + 1, totalPhases)} of {totalPhases}
          </span>
          {!isComplete && remainingTime.maxMinutes > 0 && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {remainingTime.label} remaining
            </span>
          )}
        </div>
        <Progress value={progressPercentage} className="h-2" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={className}
    >
      <Card className="bg-card/50 border-primary/20">
        <CardContent className="p-4 sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Your Application Journey</h3>
            {!isComplete && remainingTime.maxMinutes > 0 && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{remainingTime.label} remaining</span>
              </div>
            )}
            {isComplete && (
              <div className="flex items-center gap-1.5 text-sm text-success">
                <CheckCircle className="h-4 w-4" />
                <span>Complete!</span>
              </div>
            )}
          </div>

          {/* Progress bar with step indicator */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-medium text-foreground">
                Step {Math.min(currentPhaseIndex + 1, totalPhases)} of {totalPhases}
              </span>
              <span className="text-muted-foreground">{progressPercentage}% complete</span>
            </div>
            
            <Progress value={progressPercentage} className="h-2.5" />
          </div>

          {/* Mini step visualization - only show on larger screens or when few phases */}
          {phases.length <= 8 && (
            <div className="mt-4 flex items-center justify-between overflow-x-auto gap-1 pb-1">
              {phases.map((phase, index) => {
                const isCompleted = completedPhases.includes(index);
                const isCurrent = index === currentPhaseIndex;
                const isPending = index > currentPhaseIndex && !isCompleted;

                return (
                  <div
                    key={phase.id}
                    className="flex flex-col items-center min-w-0 flex-1"
                  >
                    {/* Step indicator */}
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center transition-all",
                        isCompleted && "bg-success text-success-foreground",
                        isCurrent && "bg-primary text-primary-foreground ring-2 ring-primary/30",
                        isPending && "bg-muted text-muted-foreground"
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : isCurrent ? (
                        <span className="text-xs font-medium">{index + 1}</span>
                      ) : (
                        <Circle className="h-3 w-3" />
                      )}
                    </div>
                    
                    {/* Phase name - hidden on mobile for space */}
                    <span
                      className={cn(
                        "text-[10px] mt-1 text-center truncate max-w-[60px] hidden sm:block",
                        isCompleted && "text-success",
                        isCurrent && "text-primary font-medium",
                        isPending && "text-muted-foreground"
                      )}
                    >
                      {phase.title}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Connecting lines between steps */}
          {phases.length <= 8 && (
            <div className="relative -mt-12 sm:-mt-[3.25rem] mx-3 h-0">
              <div className="absolute top-3 left-0 right-0 flex">
                {phases.slice(0, -1).map((_, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex-1 h-0.5 mx-0.5",
                      completedPhases.includes(index) ? "bg-success" : "bg-muted"
                    )}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
