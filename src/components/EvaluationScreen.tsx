import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Clock } from "lucide-react";
import { StorytellingLoader } from "@/components/animations/StorytellingLoader";
import { MilestoneAnimation } from "@/components/animations/MilestoneAnimation";
import { EmpathyAnimation } from "@/components/animations/EmpathyAnimation";
import { FloatingParticles, GradientOrbs } from "@/components/animations/FloatingParticles";

interface EvaluationScreenProps {
  state: "evaluating" | "passed" | "failed";
  onStartNextPhase?: () => void;
  onDoLater?: () => void;
  nextPhaseName?: string;
  score?: number;
  passingScore?: number;
}

const evaluatingMessages = [
  "Reviewing your submission...",
  "Analyzing your responses...",
  "Almost there...",
  "Just a moment...",
];

export function EvaluationScreen({
  state,
  onStartNextPhase,
  onDoLater,
  nextPhaseName,
  score,
  passingScore = 60,
}: EvaluationScreenProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <AnimatePresence mode="wait">
        {state === "evaluating" && (
          <motion.div
            key="evaluating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full h-full flex items-center justify-center"
          >
            <StorytellingLoader
              messages={evaluatingMessages}
              avaExpression="thinking"
              title="We're reviewing your submission"
              showProgress={true}
            />
          </motion.div>
        )}

        {state === "passed" && (
          <MilestoneAnimation
            key="passed"
            type="celebration"
            intensity="major"
            title="Great job!"
            subtitle={
              nextPhaseName && onStartNextPhase 
                ? "You've successfully completed this phase and can move on to the next step."
                : "You've completed all candidate phases! The employer will review your application and may invite you to an Ava Interview."
            }
            score={score}
            passingScore={passingScore}
          >
            <div className="space-y-3 pt-2">
              {nextPhaseName && onStartNextPhase && (
                <Button 
                  onClick={onStartNextPhase} 
                  className="w-full gap-2"
                  size="lg"
                >
                  Start {nextPhaseName}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              <Button 
                variant={nextPhaseName && onStartNextPhase ? "ghost" : "default"}
                onClick={onDoLater}
                className={nextPhaseName && onStartNextPhase ? "w-full gap-2 text-muted-foreground" : "w-full gap-2"}
              >
                {nextPhaseName && onStartNextPhase ? (
                  <>
                    <Clock className="h-4 w-4" />
                    I'll do it later
                  </>
                ) : (
                  "Back to My Applications"
                )}
              </Button>
            </div>
          </MilestoneAnimation>
        )}

        {state === "failed" && (
          <motion.div
            key="failed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full h-full flex items-center justify-center bg-background/95 backdrop-blur-sm"
          >
            <GradientOrbs count={3} />
            <FloatingParticles count={10} intensity="subtle" />
            
            <EmpathyAnimation
              title="This one wasn't the right fit"
              subtitle="We encourage you to apply for other opportunities that match your skills. Every application is a step forward."
              score={score}
              passingScore={passingScore}
            >
              {onDoLater && (
                <Button 
                  variant="outline" 
                  onClick={onDoLater}
                  className="w-full"
                >
                  Explore Other Opportunities
                </Button>
              )}
            </EmpathyAnimation>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
