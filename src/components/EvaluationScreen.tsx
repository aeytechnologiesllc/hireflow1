import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle, Clock } from "lucide-react";
import { StaggeredBarsLoader } from "@/components/animations/StaggeredBarsLoader";
import { MilestoneAnimation } from "@/components/animations/MilestoneAnimation";
import { EmpathyAnimation } from "@/components/animations/EmpathyAnimation";
import { FloatingParticles, GradientOrbs } from "@/components/animations/FloatingParticles";

interface EvaluationScreenProps {
  /**
   * evaluating — the step was sent; waiting for the next one to open.
   * passed     — the next step is open; `nextPhaseName` + `onStartNextPhase` go straight into it.
   * finished   — that was the last step; nothing is left for the candidate to do.
   * failed     — a server-confirmed rejection (never decided here).
   */
  state: "evaluating" | "passed" | "finished" | "failed";
  /** The step's own result is stored on the server — only then may this
   *  screen say "your answers are saved". */
  saved?: boolean;
  onStartNextPhase?: () => void;
  onDoLater?: () => void;
  nextPhaseName?: string;
}

// Rule 1: nothing here may reveal that a machine is involved. "Analyzing your
// responses" was the tell — people review and read; they do not analyse your
// responses in four seconds while you watch a progress bar. Every line below
// is something a person could truthfully be doing.
//
// Rule 2 (2026-10-05): say what is actually happening. The old screen rotated
// "Almost there… Just a moment…" for 40 seconds, so the owner could not tell a
// slow step from a stuck one. The wait now names the stage it is at, how long
// it can take, and — only once the server holds the result — that nothing is
// lost.
export function EvaluationScreen({
  state,
  saved = false,
  onStartNextPhase,
  onDoLater,
  nextPhaseName,
}: EvaluationScreenProps) {
  const hasNext = !!(nextPhaseName && onStartNextPhase);

  return (
    // Was a hardcoded near-black ground — rgba(8,12,20), the retired cobalt,
    // not --ground — with an emerald-500 glow that is not jade either. The
    // children paint with text-foreground, which in Day is #141F1B: near-black
    // text on a near-black rectangle, about 1.1:1. So anyone on the Day theme
    // saw a blank black box after submitting EVERY step, including the screen
    // that tells them they are finished. --gradient-bg already composes the
    // ambient tints over --ground and is correct in both themes.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      style={{ background: "var(--gradient-bg)" }}
    >
      <AnimatePresence mode="wait">
        {state === "evaluating" && (
          <motion.div
            key="evaluating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative flex h-full w-full items-center justify-center"
          >
            <GradientOrbs count={2} className="opacity-80" />
            <FloatingParticles count={8} intensity="subtle" />

            <div
              className="relative flex w-full max-w-sm flex-col items-center px-6 text-center"
              role="status"
              aria-live="polite"
            >
              <StaggeredBarsLoader size="lg" className="mb-8" />
              <h2 className="text-xl font-semibold text-foreground">
                {saved ? "Checking your answers" : "Sending your answers"}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {saved ? "This can take up to two minutes." : "Keep this page open for a moment."}
              </p>
              {saved && (
                <p className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <CheckCircle className="h-4 w-4 shrink-0 text-[var(--jade)]" aria-hidden="true" />
                  Your answers are saved.
                </p>
              )}
            </div>
          </motion.div>
        )}

        {state === "passed" && (
          <MilestoneAnimation
            key="passed"
            type="celebration"
            intensity="major"
            title={hasNext ? "Saved — you can move on" : "Saved"}
            subtitle={
              hasNext
                ? `Next up: ${nextPhaseName}.`
                // Candidate-facing: never name Ava. See rule 1.
                : "Your answers are saved. Your next step will be waiting on your application."
            }
          >
            <div className="space-y-3 pt-2">
              {hasNext && (
                <Button onClick={onStartNextPhase} className="w-full gap-2" size="lg">
                  Start {nextPhaseName}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant={hasNext ? "ghost" : "default"}
                onClick={onDoLater}
                className={hasNext ? "min-h-[44px] w-full gap-2 text-muted-foreground" : "w-full gap-2"}
              >
                {hasNext ? (
                  <>
                    <Clock className="h-4 w-4" />
                    I'll do it later
                  </>
                ) : (
                  "Back to my application"
                )}
              </Button>
            </div>
          </MilestoneAnimation>
        )}

        {state === "finished" && (
          <MilestoneAnimation
            key="finished"
            type="completion"
            intensity="major"
            title="You've finished every step"
            subtitle="Sent — you can close this page. The hiring team will review your application and get back to you."
          >
            <div className="pt-2">
              <Button onClick={onDoLater} className="w-full gap-2" size="lg">
                Back to my application
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
            className="w-full h-full flex items-center justify-center"
          >
            <GradientOrbs count={3} />
            <FloatingParticles count={10} intensity="subtle" />

            <EmpathyAnimation
              title="This one wasn't the right fit"
              subtitle="We encourage you to apply for other opportunities that match your skills. Every application is a step forward."
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
