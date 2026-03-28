import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Clock, CheckCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateRemainingTime } from "@/lib/phaseDurations";

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
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm">
          <span className="min-w-0 break-words text-muted-foreground [overflow-wrap:anywhere]">
            Step {Math.min(currentPhaseIndex + 1, totalPhases)} of {totalPhases}
          </span>
          {!isComplete && remainingTime.maxMinutes > 0 && (
            <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{remainingTime.label} remaining</span>
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
          <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <h3 className="min-w-0 break-words font-semibold text-foreground [overflow-wrap:anywhere]">
              Application Overview
            </h3>
            {!isComplete && remainingTime.maxMinutes > 0 && (
              <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground sm:justify-end">
                <Clock className="h-4 w-4" />
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{remainingTime.label} remaining</span>
              </div>
            )}
            {isComplete && (
              <div className="flex items-center gap-1.5 text-sm text-success sm:justify-end">
                <CheckCircle className="h-4 w-4" />
                <span>Complete!</span>
              </div>
            )}
          </div>

          {/* Progress bar with step indicator */}
          <div className="space-y-3">
            <div className="mb-1 flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 break-words font-medium text-foreground [overflow-wrap:anywhere]">
                Step {Math.min(currentPhaseIndex + 1, totalPhases)} of {totalPhases}
              </span>
              <span className="shrink-0 text-muted-foreground">{progressPercentage}% complete</span>
            </div>
            
            <Progress value={progressPercentage} className="h-2.5" />
          </div>

          {/* Mini step visualization - only show on larger screens or when few phases */}
          {phases.length <= 8 && (
            <div className="mt-4 overflow-x-auto pb-1">
              <div className="inline-flex min-w-max items-start gap-3 px-2">
              {phases.map((phase, index) => {
                const isCompleted = completedPhases.includes(index);
                const isCurrent = index === currentPhaseIndex;
                const isPending = index > currentPhaseIndex && !isCompleted;
                const showConnector = index < phases.length - 1;

                return (
                  <div
                    key={phase.id}
                    className="relative flex w-[112px] shrink-0 justify-center pt-1"
                  >
                    {showConnector && (
                      <div
                        className={cn(
                          "absolute top-4 h-px rounded-full",
                          completedPhases.includes(index) ? "bg-success/60" : "bg-muted"
                        )}
                        style={{ left: "calc(50% + 14px)", right: "-calc(50% - 14px)" }}
                      />
                    )}

                    <div className="relative z-10 flex flex-col items-center gap-2 px-1">
                      <div
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-full transition-all",
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

                      <div
                        className={cn(
                          "hidden min-h-[2.75rem] max-w-[96px] text-center text-[11px] leading-tight break-words [overflow-wrap:anywhere] sm:block",
                          isCompleted && "text-success",
                          isCurrent && "font-medium text-primary",
                          isPending && "text-muted-foreground"
                        )}
                      >
                        {phase.title}
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
