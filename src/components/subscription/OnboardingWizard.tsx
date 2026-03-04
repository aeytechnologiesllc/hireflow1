import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSubscription } from "@/hooks/useSubscription";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sparkles,
  Briefcase,
  Trophy,
  ChevronRight,
  Check,
  ArrowRight,
  User,
} from "lucide-react";

const STEPS = [
  {
    icon: Briefcase,
    title: "Post a Job",
    description:
      "Create a job in seconds. AVA automatically generates screening questions and assessments for the role.",
  },
  {
    icon: Sparkles,
    title: "AVA Screens Candidates",
    description:
      "Applicants complete assessments, skill tests, and optional voice interviews. AVA evaluates and ranks every candidate automatically.",
  },
  {
    icon: Trophy,
    title: "Interview Only the Best",
    description:
      "Review top candidates, compare scores, and interview only the most qualified applicants.",
  },
];

/* ── Glass card wrapper ──────────────────────────────────────── */

function GlassCard({ children, isMobile }: { children: React.ReactNode; isMobile: boolean }) {
  return (
    <div
      className={
        isMobile
          ? "bg-card/80 border border-white/[0.06] rounded-xl p-4 shadow-lg"
          : "bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
      }
    >
      {children}
    </div>
  );
}

/* ── Step visuals ─────────────────────────────────────────────── */

function JobCardVisual({ isMobile }: { isMobile: boolean }) {
  return (
    <GlassCard isMobile={isMobile}>
      <div className="w-full max-w-[260px] mx-auto space-y-3">
        {/* Title line */}
        <motion.div
          className="h-3 w-24 rounded bg-primary/30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        />
        {/* Description lines */}
        <motion.div
          className="h-2 w-40 rounded bg-muted/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.3 }}
        />
        <motion.div
          className="h-2 w-32 rounded bg-muted/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.3 }}
        />
        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-muted/20 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-primary/50"
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ delay: 0.6, duration: 0.6, ease: "easeOut" }}
          />
        </div>
        {/* Checkmark + text */}
        <div className="flex items-center gap-2 pt-1">
          <motion.div
            className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.2, type: "spring", stiffness: 400, damping: 15 }}
          >
            <Check className="h-3 w-3 text-primary" />
          </motion.div>
          <motion.span
            className="text-xs text-primary font-medium"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, textShadow: ["0 0 0px transparent", "0 0 8px hsl(var(--primary) / 0.6)", "0 0 0px transparent"] }}
            transition={{ opacity: { delay: 1.3, duration: 0.3 }, textShadow: { delay: 1.3, duration: 1, ease: "easeOut" } }}
          >
            Workflow generated
          </motion.span>
        </div>
      </div>
    </GlassCard>
  );
}

function FunnelVisual({ isMobile }: { isMobile: boolean }) {
  const allDots = [0, 1, 2, 3, 4];
  const fadedOut = [1, 2, 4]; // indices that disappear
  const kept = [0, 3]; // indices that stay

  return (
    <GlassCard isMobile={isMobile}>
      <div className="flex flex-col items-center gap-3 py-2">
        {/* All 5 candidates */}
        <div className="flex gap-3">
          {allDots.map((i) => (
            <motion.div
              key={i}
              className="w-7 h-7 rounded-full flex items-center justify-center"
              initial={{ opacity: 0, y: -12, scale: 1, backgroundColor: "hsl(var(--muted) / 0.6)", borderColor: "transparent", borderWidth: 0 }}
              animate={{
                opacity: fadedOut.includes(i) ? [0, 1, 1, 0] : 1,
                y: 0,
                scale: fadedOut.includes(i) ? [1, 1, 1, 0.5] : 1,
                borderWidth: kept.includes(i) ? [0, 0, 0, 2] : 0,
                borderColor: kept.includes(i) ? ["transparent", "transparent", "transparent", "hsl(var(--primary))"] : "transparent",
                boxShadow: kept.includes(i) ? ["0 0 0px transparent", "0 0 0px transparent", "0 0 0px transparent", "0 0 12px hsl(var(--primary) / 0.4)"] : "none",
              }}
              transition={{
                opacity: fadedOut.includes(i)
                  ? { delay: 0.2 + i * 0.08, duration: 1.2, times: [0, 0.3, 0.7, 1] }
                  : { delay: 0.2 + i * 0.08, duration: 0.4 },
                y: { delay: 0.2 + i * 0.08, duration: 0.4 },
                scale: fadedOut.includes(i)
                  ? { delay: 0.2 + i * 0.08, duration: 1.2, times: [0, 0.3, 0.7, 1] }
                  : undefined,
                borderWidth: { delay: 1.2, duration: 0.3 },
                borderColor: { delay: 1.2, duration: 0.3 },
                boxShadow: { delay: 1.2, duration: 0.4, times: [0, 0, 0, 1] },
              }}
              style={{ backgroundColor: "hsl(var(--muted) / 0.6)" }}
            >
              <User className="h-3.5 w-3.5 text-muted-foreground" />
            </motion.div>
          ))}
        </div>

        {/* AVA spark */}
        <motion.div
          className="flex items-center gap-2"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: [0, 1, 1], scale: [0.5, 1.3, 1] }}
          transition={{ delay: 0.7, duration: 0.5, times: [0, 0.5, 1] }}
        >
          <div className="h-px w-8 bg-primary/40" />
          <Sparkles className="h-4 w-4 text-primary" />
          <div className="h-px w-8 bg-primary/40" />
        </motion.div>
      </div>
    </GlassCard>
  );
}

function LeaderboardVisual({ isMobile }: { isMobile: boolean }) {
  const bars = [
    { score: 94, w: "85%", highlight: true },
    { score: 82, w: "70%", highlight: false },
    { score: 71, w: "58%", highlight: false },
  ];
  return (
    <GlassCard isMobile={isMobile}>
      <div className="w-full max-w-[260px] mx-auto space-y-2.5">
        {bars.map((bar, i) => (
          <motion.div
            key={i}
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 + i * 0.12, duration: 0.4 }}
          >
            <span className={`text-xs font-bold w-5 text-right ${bar.highlight ? "text-primary" : "text-muted-foreground"}`}>
              #{i + 1}
            </span>
            <div className="flex-1 h-6 rounded-md bg-muted/30 overflow-hidden">
              <motion.div
                className={`h-full rounded-md ${bar.highlight ? "bg-primary/60" : "bg-muted/50"}`}
                initial={{ width: 0 }}
                animate={{ width: bar.w }}
                transition={{ delay: 0.4 + i * 0.12, duration: 0.5, ease: "easeOut" }}
                style={bar.highlight ? { boxShadow: "0 0 12px hsl(var(--primary) / 0.4)" } : {}}
              />
            </div>
            <span className={`text-xs font-semibold w-8 ${bar.highlight ? "text-primary" : "text-muted-foreground"}`}>
              {bar.score}%
            </span>
            {/* Check icon for #1 */}
            {bar.highlight && (
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.0, type: "spring", stiffness: 400, damping: 15 }}
              >
                <Check className="h-3.5 w-3.5 text-primary" />
              </motion.div>
            )}
          </motion.div>
        ))}
      </div>
    </GlassCard>
  );
}

const STEP_VISUALS = [JobCardVisual, FunnelVisual, LeaderboardVisual];

/* ── Main component ──────────────────────────────────────────── */

interface OnboardingWizardProps {
  onComplete: () => void;
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const { completeOnboarding } = useSubscription();
  const isMobile = useIsMobile();

  const totalSteps = 4; // 3 content + 1 CTA
  const contentSteps = 3;

  const handleSwipeLeft = useCallback(() => {
    if (step < totalSteps - 1) setStep((s) => s + 1);
  }, [step]);

  const handleSwipeRight = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  const swipeProps = useSwipeGesture(
    { onSwipeLeft: handleSwipeLeft, onSwipeRight: handleSwipeRight },
    { threshold: 60, velocity: 400 },
  );

  const handleComplete = async () => {
    await completeOnboarding.mutateAsync();
    onComplete();
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-background ${
        isMobile ? "h-[100dvh] overflow-hidden" : "overflow-y-auto"
      }`}
    >
      {/* Background grid */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(to right, hsl(var(--primary)) 1px, transparent 1px),
              linear-gradient(to bottom, hsl(var(--primary)) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />
        {!isMobile && (
          <motion.div
            className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
            initial={{ top: "-10%" }}
            animate={{ top: "110%" }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          />
        )}
      </div>

      {/* Radial focus glow */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          width: isMobile ? 300 : 600,
          height: isMobile ? 300 : 600,
          background: "radial-gradient(ellipse at center, hsl(var(--primary) / 0.08) 0%, transparent 70%)",
        }}
      />

      {/* Ambient orbs */}
      {isMobile ? (
        <>
          <div
            className="absolute top-[10%] right-[15%] w-[200px] h-[200px] rounded-full bg-primary/20 blur-[120px] opacity-[0.25]"
            style={{ willChange: "transform", transform: "translateZ(0)" }}
          />
          <div
            className="absolute bottom-[10%] left-[10%] w-[150px] h-[150px] rounded-full bg-accent/15 blur-[100px] opacity-[0.12]"
            style={{ willChange: "transform", transform: "translateZ(0)" }}
          />
        </>
      ) : (
        <>
          <motion.div
            className="absolute top-[10%] right-[15%] w-[400px] h-[400px] rounded-full bg-primary/20 blur-[120px]"
            animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.3, 0.2] }}
            transition={{ duration: 8, repeat: Infinity }}
          />
          <motion.div
            className="absolute bottom-[10%] left-[10%] w-[350px] h-[350px] rounded-full bg-accent/15 blur-[100px]"
            animate={{ scale: [1.2, 1, 1.2], opacity: [0.15, 0.25, 0.15] }}
            transition={{ duration: 6, repeat: Infinity }}
          />
        </>
      )}

      {/* Main content */}
      <motion.div
        className={`relative z-10 w-full max-w-2xl mx-auto flex flex-col touch-pan-y ${
          isMobile ? "flex-1 px-5 pt-4 pb-3" : "px-6 py-10 items-center justify-center min-h-screen"
        }`}
        style={{ willChange: "transform" }}
        {...(isMobile ? swipeProps : {})}
      >
        {/* Progress */}
        {step < contentSteps && (
          <div className={`w-full max-w-xs mx-auto ${isMobile ? "mb-6" : "mb-8"}`}>
            <p className="text-center text-xs text-muted-foreground font-medium mb-2">
              Step {step + 1} of {contentSteps}
            </p>
            <Progress
              value={((step + 1) / contentSteps) * 100}
              className="h-1 bg-muted/30"
            />
          </div>
        )}

        {/* Step content */}
        <div className={`${isMobile ? "flex-1 flex flex-col min-h-0" : ""}`}>
          <AnimatePresence mode="wait">
            {/* Steps 0-2 */}
            {step < contentSteps && (() => {
              const s = STEPS[step];
              const Icon = s.icon;
              const Visual = STEP_VISUALS[step];
              return (
                <motion.div
                  key={`step-${step}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.25 }}
                  style={{ willChange: "transform" }}
                  className={`flex flex-col items-center text-center ${
                    isMobile ? "flex-1 justify-center" : ""
                  }`}
                >
                  {/* Icon orb with outer glow ring */}
                  <div className="relative">
                    {/* Glow ring */}
                    <div
                      className={`absolute inset-0 rounded-full ${
                        isMobile ? "-inset-1" : "-inset-2"
                      }`}
                      style={{
                        background: "radial-gradient(circle, hsl(var(--primary) / 0.2) 0%, transparent 70%)",
                      }}
                    />
                    <div
                      className={`relative rounded-full flex items-center justify-center ${
                        isMobile ? "w-16 h-16 mb-3" : "w-24 h-24 mb-5"
                      }`}
                      style={{
                        background:
                          "linear-gradient(135deg, hsl(var(--primary)), hsl(280, 85%, 65%))",
                        boxShadow: "0 0 40px hsl(var(--primary) / 0.4)",
                      }}
                    >
                      <Icon className={`text-white ${isMobile ? "h-7 w-7" : "h-10 w-10"}`} />
                    </div>
                  </div>

                  {/* Title */}
                  <h2
                    className={`font-bold text-foreground ${
                      isMobile ? "text-2xl mb-1.5" : "text-4xl mb-2"
                    }`}
                  >
                    {s.title}
                  </h2>

                  {/* Description */}
                  <p
                    className={`text-muted-foreground max-w-md mx-auto leading-relaxed ${
                      isMobile ? "text-base mb-4" : "text-lg mb-6"
                    }`}
                  >
                    {s.description}
                  </p>

                  {/* Visual */}
                  <Visual isMobile={isMobile} />

                  {/* Next button */}
                  <div className={isMobile ? "mt-auto pt-4 w-full flex justify-center" : "mt-6"}>
                    <Button
                      size="lg"
                      onClick={() => setStep(step + 1)}
                      className="group px-8 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25"
                    >
                      Next
                      <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </div>
                </motion.div>
              );
            })()}

            {/* Step 3: Final CTA */}
            {step === 3 && (
              <motion.div
                key="cta"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.25 }}
                className={`flex flex-col items-center text-center ${
                  isMobile ? "flex-1 justify-center" : ""
                }`}
              >
                {/* Celebratory orb */}
                <div
                  className={`rounded-full flex items-center justify-center ${
                    isMobile ? "w-20 h-20 mb-6" : "w-28 h-28 mb-10"
                  }`}
                  style={{
                    background:
                      "linear-gradient(135deg, hsl(var(--primary)), hsl(280, 85%, 65%))",
                    boxShadow: "0 0 60px hsl(var(--primary) / 0.5)",
                  }}
                >
                  <Sparkles className={`text-white ${isMobile ? "h-9 w-9" : "h-12 w-12"}`} />
                </div>

                <h2
                  className={`font-bold text-foreground ${
                    isMobile ? "text-2xl mb-2" : "text-4xl mb-3"
                  }`}
                >
                  You're Ready
                </h2>
                <p
                  className={`text-muted-foreground max-w-md mx-auto leading-relaxed ${
                    isMobile ? "text-base mb-8" : "text-lg mb-12"
                  }`}
                >
                  Post a job, let AVA handle screening, and interview only the best candidates.
                </p>

                <div className={isMobile ? "mt-auto w-full flex flex-col items-center gap-3" : "flex flex-col items-center gap-4"}>
                  <Button
                    size="lg"
                    onClick={handleComplete}
                    disabled={completeOnboarding.isPending}
                    className={`group bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl font-semibold shadow-lg shadow-primary/30 ${
                      isMobile ? "px-8 py-5 text-base h-auto w-full max-w-xs" : "px-12 py-7 text-lg h-auto"
                    }`}
                  >
                    {completeOnboarding.isPending ? "Setting up..." : "Create Your First Job with AVA"}
                    {!completeOnboarding.isPending && (
                      <ChevronRight className="h-5 w-5 ml-2 group-hover:translate-x-1 transition-transform" />
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Takes less than 2 minutes. No credit card required.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {isMobile && step < contentSteps && (
          <p className="text-center text-xs text-muted-foreground pt-1">
            Swipe to navigate
          </p>
        )}
      </motion.div>
    </div>
  );
}
