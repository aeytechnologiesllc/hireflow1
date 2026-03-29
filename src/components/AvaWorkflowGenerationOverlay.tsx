import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import avaOrb from "@/assets/ava-orb.png";

export type OverlayGenerationStage = "drafting" | "screening" | "finalizing";

export interface OverlayGenerationSummary {
  sectionsGenerated?: number;
  applicationQuestions?: number;
  quizQuestions?: number;
  workflowSteps?: number;
}

interface AvaWorkflowGenerationOverlayProps {
  isVisible: boolean;
  jobTitle: string;
  difficulty: string;
  isApiComplete?: boolean;
  mode?: "workflow" | "full_draft";
  stage?: OverlayGenerationStage;
  summary?: OverlayGenerationSummary | null;
}

const OVERLAY_CONFIG = {
  workflow: {
    title: "Creating your screening plan",
    subtitlePrefix: "Designing the candidate journey for",
  },
  full_draft: {
    title: "Creating your job with Ava",
    subtitlePrefix: "Generating the full draft for",
  },
} as const;

const INITIAL_PROGRESS = {
  workflow: 12,
  full_draft: 8,
} as const;

const STAGE_PROGRESS_MODEL = {
  workflow: {
    drafting: { entry: 12, settle: 32, drift: 42, easeMs: 2200, driftMs: 2600 },
    screening: { entry: 18, settle: 84, drift: 90, easeMs: 3600, driftMs: 3600 },
    finalizing: { entry: 84, settle: 97, drift: 99.2, easeMs: 2200, driftMs: 2200 },
  },
  full_draft: {
    drafting: { entry: 8, settle: 54, drift: 62, easeMs: 3400, driftMs: 3200 },
    screening: { entry: 54, settle: 88, drift: 93.5, easeMs: 3600, driftMs: 3000 },
    finalizing: { entry: 88, settle: 97, drift: 99.2, easeMs: 2200, driftMs: 2200 },
  },
} as const;

const STAGE_MESSAGES: Record<"workflow" | "full_draft", Record<OverlayGenerationStage, string[]>> = {
  workflow: {
    drafting: [],
    screening: [
      "Reviewing the role and candidate expectations...",
      "Generating application prompts and fit checks...",
      "Selecting the right assessments for this role...",
      "Balancing phase count against candidate drop-off...",
    ],
    finalizing: [
      "Counting questions, assessments, and screening phases...",
      "Packaging the plan for review and publish...",
    ],
  },
  full_draft: {
    drafting: [
      "Reviewing your Ava setup and hiring goals...",
      "Writing the role summary and description...",
      "Drafting responsibilities and requirements...",
      "Generating skills, benefits, and pay guidance...",
    ],
    screening: [
      "Turning the draft into application prompts...",
      "Designing assessments and role-fit checks...",
      "Shaping the screening plan around candidate effort...",
    ],
    finalizing: [
      "Locking the draft and screening plan together...",
      "Preparing your review-ready job draft...",
    ],
  },
};

interface OverlayActivityItem {
  label: string;
  state: "done" | "active" | "upcoming";
}

function formatItemCount(count: number | undefined, singular: string, plural = `${singular}s`) {
  if (!count || count <= 0) return null;
  return `${count} ${count === 1 ? singular : plural}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function getStageDesiredProgress(
  mode: "workflow" | "full_draft",
  stage: OverlayGenerationStage,
  stageElapsedMs: number,
  isApiComplete: boolean,
) {
  if (isApiComplete) {
    return 100;
  }

  const model = STAGE_PROGRESS_MODEL[mode][stage];
  const settleProgress = clamp(stageElapsedMs / model.easeMs, 0, 1);
  const settledValue = model.entry + (model.settle - model.entry) * easeOutCubic(settleProgress);

  if (stageElapsedMs <= model.easeMs) {
    return settledValue;
  }

  const driftElapsed = stageElapsedMs - model.easeMs;
  const driftProgress = 1 - Math.exp(-driftElapsed / model.driftMs);
  return model.settle + (model.drift - model.settle) * driftProgress;
}

function buildActivityItems(
  mode: "workflow" | "full_draft",
  stage: OverlayGenerationStage,
  summary: OverlayGenerationSummary | null,
): OverlayActivityItem[] {
  if (mode === "full_draft") {
    const draftedSectionsLabel = summary?.sectionsGenerated
      ? `Drafted ${summary.sectionsGenerated} core job sections`
      : "Drafting the core job details";

    const screeningCounts = [
      formatItemCount(summary?.applicationQuestions, "application prompt"),
      formatItemCount(summary?.quizQuestions, "assessment"),
    ].filter(Boolean).join(" and ");

    const screeningLabel = screeningCounts
      ? `Built ${screeningCounts}`
      : "Generating application prompts and assessments";

    const phaseLabel = summary?.workflowSteps
      ? `Finalizing ${summary.workflowSteps} screening ${summary.workflowSteps === 1 ? "phase" : "phases"}`
      : "Finalizing the candidate journey";

    if (stage === "drafting") {
      return [
        { label: "Reviewing your setup and writing the job draft", state: "active" },
        { label: "Generating skills, benefits, and pay guidance", state: "upcoming" },
        { label: "Building the screening plan", state: "upcoming" },
      ];
    }

    if (stage === "screening") {
      return [
        { label: draftedSectionsLabel, state: "done" },
        { label: "Generating application prompts and assessments", state: "active" },
        { label: "Preparing the candidate journey preview", state: "upcoming" },
      ];
    }

    return [
      { label: draftedSectionsLabel, state: "done" },
      { label: screeningLabel, state: "done" },
      { label: phaseLabel, state: "active" },
    ];
  }

  const screeningCounts = [
    formatItemCount(summary?.applicationQuestions, "application prompt"),
    formatItemCount(summary?.quizQuestions, "assessment"),
  ].filter(Boolean).join(" and ");

  const screeningLabel = screeningCounts
    ? `Built ${screeningCounts}`
    : "Generating application prompts and role-fit checks";

  const phaseLabel = summary?.workflowSteps
    ? `Finalizing ${summary.workflowSteps} screening ${summary.workflowSteps === 1 ? "phase" : "phases"}`
    : "Finalizing the screening plan";

  if (stage === "finalizing") {
    return [
      { label: screeningLabel, state: "done" },
      { label: phaseLabel, state: "active" },
      { label: "Preparing the review-ready candidate journey", state: "upcoming" },
    ];
  }

  return [
    { label: "Reviewing the role and hiring goals", state: "done" },
    { label: "Generating application prompts and assessments", state: "active" },
    { label: "Preparing the candidate journey preview", state: "upcoming" },
  ];
}

export default function AvaWorkflowGenerationOverlay({ 
  isVisible, 
  jobTitle, 
  difficulty,
  isApiComplete = false,
  mode = "workflow",
  stage = mode === "full_draft" ? "drafting" : "screening",
  summary = null,
}: AvaWorkflowGenerationOverlayProps) {
  const config = OVERLAY_CONFIG[mode];
  const [progressRing, setProgressRing] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const progressFrameRef = useRef<number | null>(null);
  const stageStartedAtRef = useRef<number>(Date.now());
  const stageKeyRef = useRef<string>("");

  // Particles - reduced to 20
  const particles = useMemo(() => 
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.5 + 1,
      duration: Math.random() * 5 + 4,
      delay: Math.random() * 3,
      color: Math.random() > 0.5 ? "primary" : "accent",
    }))
  , []);

  // Reset on show
  useEffect(() => {
    if (isVisible) {
      stageStartedAtRef.current = Date.now();
      stageKeyRef.current = `${mode}:${stage}`;
      setProgressRing(INITIAL_PROGRESS[mode]);
      setMessageIndex(0);
    }

    return () => {
      if (progressFrameRef.current !== null) {
        window.cancelAnimationFrame(progressFrameRef.current);
        progressFrameRef.current = null;
      }
    };
  }, [isVisible, mode]);

  useEffect(() => {
    if (!isVisible) return;

    const nextStageKey = `${mode}:${stage}`;
    if (stageKeyRef.current !== nextStageKey) {
      stageKeyRef.current = nextStageKey;
      stageStartedAtRef.current = Date.now();
      setMessageIndex(0);
    }
  }, [isVisible, mode, stage]);

  const messages = STAGE_MESSAGES[mode][stage];
  const activityItems = useMemo(
    () => buildActivityItems(mode, stage, summary),
    [mode, stage, summary],
  );
  const difficultyLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
  const progressContext =
    stage === "drafting"
      ? "Drafting the role"
      : stage === "screening"
        ? "Building the candidate journey"
        : "Wrapping up the review handoff";

  // Continuously glide forward within each stage instead of parking at fixed stage milestones.
  useEffect(() => {
    if (!isVisible) return;

    const animateProgress = () => {
      const stageElapsedMs = Date.now() - stageStartedAtRef.current;
      const desiredProgress = getStageDesiredProgress(mode, stage, stageElapsedMs, isApiComplete);

      setProgressRing((previous) => {
        const boundedDesired = isApiComplete ? 100 : Math.max(desiredProgress, previous);
        const gap = boundedDesired - previous;
        if (Math.abs(gap) < 0.08) {
          return boundedDesired;
        }

        const easedStep = clamp(
          Math.abs(gap) * (isApiComplete ? 0.2 : 0.11),
          isApiComplete ? 0.9 : 0.12,
          isApiComplete ? 3.8 : 0.9,
        );
        const next = previous + Math.sign(gap) * easedStep;
        return clamp(next, 0, boundedDesired);
      });

      progressFrameRef.current = window.requestAnimationFrame(animateProgress);
    };

    progressFrameRef.current = window.requestAnimationFrame(animateProgress);

    return () => {
      if (progressFrameRef.current !== null) {
        window.cancelAnimationFrame(progressFrameRef.current);
        progressFrameRef.current = null;
      }
    };
  }, [isApiComplete, isVisible, mode, stage]);

  // Rotate the active status copy within the current stage.
  useEffect(() => {
    if (!isVisible || messages.length <= 1) return;

    setMessageIndex(0);
    const interval = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % messages.length);
    }, 1800);

    return () => window.clearInterval(interval);
  }, [isVisible, messages]);

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8 }}
        className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      >
        {/* Deep backdrop */}
        <div className="absolute inset-0 bg-[hsl(220,20%,2%)]" />

        {/* Atmospheric gradients */}
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [0.15, 0.3, 0.15] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full blur-[200px]"
          style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.4), transparent)" }}
        />
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.25, 0.1] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 3 }}
          className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full blur-[180px]"
          style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.4), transparent)" }}
        />

        {/* Subtle particles */}
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            style={{
              width: p.size,
              height: p.size,
              left: `${p.x}%`,
              top: `${p.y}%`,
              background: p.color === "primary" 
                ? "hsl(var(--primary) / 0.5)" 
                : "hsl(var(--accent) / 0.5)",
            }}
            animate={{
              y: [-10, -80],
              opacity: [0, 0.6, 0],
            }}
            transition={{
              duration: p.duration,
              repeat: Infinity,
              delay: p.delay,
              ease: "easeOut",
            }}
          />
        ))}

        {/* Main container */}
        <div className="relative z-10 flex flex-col items-center px-4">
          {/* Orb container - fixed height */}
          <div className="relative w-[200px] h-[200px] flex items-center justify-center">
            {/* Single rotating orbit ring */}
            <motion.div
              className="absolute inset-0 rounded-full border border-primary/20"
              style={{ width: 180, height: 180, left: 10, top: 10 }}
              animate={{ rotate: 360 }}
              transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            >
              <div
                className="absolute w-2 h-2 rounded-full bg-primary/80 shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
                style={{ top: -4, left: "50%", marginLeft: -4 }}
              />
            </motion.div>

            {/* Progress ring */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="85" fill="none" stroke="hsl(var(--border) / 0.2)" strokeWidth="2" />
              <motion.circle
                cx="100" cy="100" r="85"
                fill="none"
                stroke="url(#overlayProgressGrad)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={534}
                strokeDashoffset={534 - (534 * progressRing) / 100}
                transform="rotate(-90 100 100)"
              />
              <defs>
                <linearGradient id="overlayProgressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="hsl(var(--primary))" />
                  <stop offset="100%" stopColor="hsl(var(--accent))" />
                </linearGradient>
              </defs>
            </svg>

            {/* Glow behind orb */}
            <motion.div
              className="absolute rounded-full"
              style={{
                width: 120, height: 120,
                left: 40, top: 40,
                background: "radial-gradient(circle, hsl(var(--primary) / 0.35), transparent 70%)",
              }}
              animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* AVA orb */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1, type: "spring", bounce: 0.3 }}
            >
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="relative w-20 h-20">
                  <img
                    src={avaOrb}
                    alt="AVA"
                    className="w-full h-full object-contain drop-shadow-[0_0_25px_hsl(var(--primary)/0.5)]"
                  />
                </div>
              </motion.div>
            </motion.div>
          </div>

          {/* Title section - explicit spacing from orb */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="text-center mt-10 mb-3"
          >
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-1">
              {config.title}
            </h2>
            <p className="text-muted-foreground text-sm">
              {config.subtitlePrefix}{" "}
              <span className="text-primary font-medium">{jobTitle}</span>
            </p>
            <p className="text-xs text-muted-foreground/60 mt-2">
              {difficultyLabel} rigor
            </p>
          </motion.div>

          {/* Smart status messages */}
          <div className="h-8 flex items-center justify-center mt-3">
            <AnimatePresence mode="wait">
              <motion.p
                key={`${stage}-${messageIndex}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4 }}
                className="text-sm text-muted-foreground/80"
              >
                {messages[Math.min(messageIndex, Math.max(messages.length - 1, 0))] ?? "Finalizing your draft..."}
              </motion.p>
            </AnimatePresence>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.05, duration: 0.5 }}
            className="mt-6 w-full max-w-md rounded-2xl border border-border/30 bg-card/25 px-4 py-4 backdrop-blur-xl"
          >
            <div className="space-y-3">
              {activityItems.map((item, index) => (
                <motion.div
                  key={`${item.label}-${item.state}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.15 + index * 0.08, duration: 0.35 }}
                  className="flex items-center gap-3"
                >
                  {item.state === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-300 shrink-0" />
                  ) : item.state === "active" ? (
                    <Loader2 className="h-4 w-4 text-primary shrink-0 animate-spin" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                  )}
                  <span
                    className={
                      item.state === "done"
                        ? "text-sm text-foreground/85"
                        : item.state === "active"
                          ? "text-sm text-foreground"
                          : "text-sm text-muted-foreground/70"
                    }
                  >
                    {item.label}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Bottom progress pill */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="mt-8"
          >
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-card/40 border border-border/30">
              <motion.div
                className="w-2 h-2 rounded-full bg-primary"
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span className="text-sm text-muted-foreground">
                {Math.round(progressRing)}% complete · {progressContext}
              </span>
            </div>
          </motion.div>
        </div>

        {/* Completion burst */}
        <AnimatePresence>
          {progressRing >= 95 && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.3), transparent 70%)" }}
                initial={{ width: 100, height: 100, opacity: 0 }}
                animate={{ width: 800, height: 800, opacity: [0, 0.4, 0] }}
                transition={{ duration: 2, ease: "easeOut" }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
