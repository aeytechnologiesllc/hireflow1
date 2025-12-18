import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle, ArrowRight, Clock } from "lucide-react";

interface EvaluationScreenProps {
  state: "evaluating" | "passed" | "failed";
  onStartNextPhase?: () => void;
  onDoLater?: () => void;
  nextPhaseName?: string;
  score?: number;
  passingScore?: number;
}

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
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="text-center space-y-8 max-w-md px-6"
          >
            {/* Animated loader */}
            <motion.div
              className="relative mx-auto w-32 h-32"
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            >
              <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary" />
              <motion.div 
                className="absolute inset-4 rounded-full bg-gradient-to-br from-primary/20 to-primary/5"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
            </motion.div>

            {/* Messages */}
            <div className="space-y-3">
              <motion.h2
                className="text-2xl font-bold text-foreground"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                We're reviewing your submission
              </motion.h2>
              <motion.p
                className="text-muted-foreground"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                This will only take a moment...
              </motion.p>
            </div>

            {/* Progress dots */}
            <div className="flex justify-center gap-2">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-2 h-2 rounded-full bg-primary"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    delay: i * 0.2,
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}

        {state === "passed" && (
          <motion.div
            key="passed"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="max-w-md px-6"
          >
            <Card className="bg-card border-success/30 overflow-hidden">
              <CardContent className="pt-8 pb-6 px-6 text-center space-y-6">
                {/* Success icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                  className="mx-auto w-20 h-20 rounded-full bg-success/20 flex items-center justify-center"
                >
                  <CheckCircle className="h-10 w-10 text-success" />
                </motion.div>

                {/* Text */}
                <div className="space-y-2">
                  <motion.h2
                    className="text-2xl font-bold text-foreground"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    Great job!
                  </motion.h2>
                  <motion.p
                    className="text-muted-foreground"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    {nextPhaseName && onStartNextPhase 
                      ? "You've successfully completed this phase and can move on to the next step."
                      : "You've completed all candidate phases! The employer will review your application and may invite you to an Ava Interview."}
                  </motion.p>
                  {score !== undefined && (
                    <motion.p
                      className="text-sm text-success font-medium"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                    >
                      Your score: {score}%
                    </motion.p>
                  )}
                </div>

                {/* Actions */}
                <motion.div
                  className="space-y-3 pt-2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
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
                </motion.div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {state === "failed" && (
          <motion.div
            key="failed"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="max-w-md px-6"
          >
            <Card className="bg-card border-destructive/30 overflow-hidden">
              <CardContent className="pt-8 pb-6 px-6 text-center space-y-6">
                {/* Failed icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                  className="mx-auto w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center"
                >
                  <XCircle className="h-10 w-10 text-destructive" />
                </motion.div>

                {/* Text */}
                <div className="space-y-2">
                  <motion.h2
                    className="text-2xl font-bold text-foreground"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    Application Unsuccessful
                  </motion.h2>
                  <motion.p
                    className="text-muted-foreground"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    Unfortunately, you didn't meet the requirements for this position. We encourage you to apply for other opportunities that match your skills.
                  </motion.p>
                  {score !== undefined && passingScore !== undefined && (
                    <motion.p
                      className="text-sm text-destructive font-medium"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                    >
                      Your score: {score}% (Required: {passingScore}%)
                    </motion.p>
                  )}
                </div>

                {/* Action */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  {onDoLater && (
                    <Button 
                      variant="outline" 
                      onClick={onDoLater}
                      className="w-full"
                    >
                      Back to My Applications
                    </Button>
                  )}
                </motion.div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
