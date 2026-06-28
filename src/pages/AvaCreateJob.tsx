/**
 * AvaCreateJob — REAL create-job flow (Ava Engine MVP slice 1).
 * Route: /jobs/create (full-screen, auth required).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CalendarClock,
  Check,
  ClipboardList,
  Code2,
  Copy,
  DollarSign,
  FileText,
  Loader2,
  MapPin,
  MessageSquare,
  Mic,
  Pencil,
  QrCode,
  Share2,
  ShieldCheck,
  Timer,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AvaOrb } from "@/components/ava/AvaOrb";
import { AvaGlyph } from "@/components/ava/AvaGlyph";
import { HeroBackground } from "@/components/ava/HeroBackground";
import { CountUp } from "@/cockpit/components/CountUp";
import { AuthLoadingScreen } from "@/components/animations/AuthLoadingScreen";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import {
  BuildStep,
  DISPLAY,
  FOCUS_CSS,
  PhaseRow,
  StepRail,
  STEPS,
  useWide,
  type ReviewPhaseCard,
} from "@/components/ava/createFlow/shared";
import {
  PLAYBOOKS,
  RIGOR_OPTIONS,
  briefFromForm,
  chipAnswersToBriefAnswers,
  clearDraft,
  withRemoteFollowUps,
  detectFamily,
  generateJobFlow,
  loadDraft,
  saveDraft,
  type JobFlow,
  type Rigor,
} from "@/lib/avaEngine";
import { candidateApplyUrl } from "@/lib/showcaseApply";
import { createJobFromFlow } from "@/lib/jobFromFlow";
import TalkToAva from "@/components/ava/createFlow/TalkToAva";
import type { LucideIcon } from "lucide-react";

const KIND_ICON: Record<string, { icon: LucideIcon; accent: ReviewPhaseCard["accent"] }> = {
  application: { icon: FileText, accent: "jade" },
  quiz: { icon: Timer, accent: "mint" },
  simulation: { icon: MessageSquare, accent: "brass" },
  voice_interview: { icon: Mic, accent: "mint" },
  coding_test: { icon: Code2, accent: "mint" },
  shortlist: { icon: Trophy, accent: "brass" },
};

function flowToReviewCards(flow: JobFlow): ReviewPhaseCard[] {
  const post: ReviewPhaseCard = {
    id: "job-post",
    kind: "Job post",
    icon: ClipboardList,
    accent: "brass",
    title: flow.jobPost.title,
    candidate: flow.jobPost.summary,
    rationale: "I wrote a clear listing so the right people self-select in.",
    count: "Ready to post",
    duration: "Public",
  };
  const phases = flow.phases.map((p) => {
    const meta = KIND_ICON[p.kind] ?? { icon: FileText, accent: "jade" as const };
    return {
      id: p.id,
      kind: p.kind.replace(/_/g, " "),
      icon: meta.icon,
      accent: meta.accent,
      title: p.title,
      candidate: p.candidateDescription,
      rationale: p.rationale,
      count: p.countLabel ?? "—",
      duration: p.durationLabel ?? "—",
    };
  });
  return [post, ...phases];
}

function applyReviewEdits(flow: JobFlow, cards: ReviewPhaseCard[]): JobFlow {
  const post = cards.find((c) => c.id === "job-post");
  const jobPost = { ...flow.jobPost, title: post?.title ?? flow.jobPost.title, summary: post?.candidate ?? flow.jobPost.summary };
  // The cards are the source of truth for which phases ship AND their order — so removing or
  // reordering a card (by hand or by voice) actually changes the published flow. Rebuild phases
  // from the card order, dropping any card whose phase no longer exists.
  const byId = new Map(flow.phases.map((p) => [p.id, p]));
  const phases = cards
    .filter((c) => c.id !== "job-post" && byId.has(c.id))
    .map((c) => {
      const p = byId.get(c.id)!;
      return { ...p, title: c.title, candidateDescription: c.candidate };
    });
  return { ...flow, jobPost, phases };
}

const DRAFT_SESSION_KEY = "ava-create-active";

export default function AvaCreateJob() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const { limits } = useSubscription();
  const hasVoiceInterviews = limits?.hasVoiceInterviews ?? false;
  const wide = useWide();
  const reduceMotion = useReducedMotion();

  const resumeDraft = typeof window !== "undefined" && sessionStorage.getItem(DRAFT_SESSION_KEY) === "1";
  const saved = resumeDraft ? loadDraft() : null;
  const [step, setStep] = useState(0);
  const [inputMode, setInputMode] = useState<"voice" | "form">("voice");
  const [fuIndex, setFuIndex] = useState(0);
  const [chipAnswers, setChipAnswers] = useState<Record<string, number>>(saved?.chipAnswers ?? {});
  const [rigor, setRigor] = useState<Rigor>(saved?.rigor ?? "standard");
  const [rigorTouched, setRigorTouched] = useState(saved?.rigorTouched ?? false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [briefFields, setBriefFields] = useState(
    saved?.briefFields ?? {
      role: "",
      location: "",
      type: "Full-time · On-site",
      pay: "",
      start: "Within a few weeks",
      work: "",
      openings: 1,
    },
  );
  const [flow, setFlow] = useState<JobFlow | null>(saved?.flow ?? null);
  const [reviewCards, setReviewCards] = useState<ReviewPhaseCard[]>(() => (saved?.flow ? flowToReviewCards(saved.flow) : []));
  const [generating, setGenerating] = useState(false);
  const [genSource, setGenSource] = useState<"openai" | "template" | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedCode, setPublishedCode] = useState<string | null>(null);
  const [publishedRoleId, setPublishedRoleId] = useState<string | null>(null);
  // True once the Review-plan cards have actually finished animating in (real render signal) —
  // gates Ava's "here's your plan" so she never announces it while the build loader is still up.
  const [planVisible, setPlanVisible] = useState(false);
  const advanceBuildRef = useRef(false);

  useEffect(() => {
    if (step !== 4) setPlanVisible(false);
  }, [step]);

  const family = useMemo(() => detectFamily(briefFromForm({ ...briefFields, followUps: [] })), [briefFields]);
  const playbook = PLAYBOOKS[family];
  const workMode = useMemo(() => briefFromForm({ ...briefFields, followUps: [] }).workMode, [briefFields]);
  const followUps = useMemo(() => withRemoteFollowUps(playbook.followUps(chipAnswers), workMode), [playbook, chipAnswers, workMode]);
  const rigorLabel = RIGOR_OPTIONS.find((o) => o.id === rigor)?.label ?? "Standard";

  const setBrief = (k: string, v: string) => setBriefFields((b) => ({ ...b, [k]: v }));

  useEffect(() => {
    if (!rigorTouched) setRigor(playbook.rigor.recommended);
  }, [family, playbook.rigor.recommended, rigorTouched]);

  useEffect(() => {
    sessionStorage.setItem(DRAFT_SESSION_KEY, "1");
  }, []);

  useEffect(() => {
    saveDraft({ briefFields, chipAnswers, rigor, rigorTouched, flow });
  }, [briefFields, chipAnswers, rigor, rigorTouched, flow]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true, state: { from: "/jobs/create" } });
  }, [authLoading, user, navigate]);

  const runGeneration = useCallback(async () => {
    setGenerating(true);
    setGenSource(null);
    const followUpDefs = withRemoteFollowUps(playbook.followUps(chipAnswers), briefFromForm({ ...briefFields, followUps: [] }).workMode);
    const brief = briefFromForm({
      ...briefFields,
      followUps: chipAnswersToBriefAnswers(followUpDefs, chipAnswers),
    });
    try {
      const result = await generateJobFlow({
        brief,
        rigor,
        rigorRecommendation: { recommended: playbook.rigor.recommended, chosen: rigor, rationale: playbook.rigor.rationale },
      });
      setFlow(result.flow);
      setReviewCards(flowToReviewCards(result.flow));
      setGenSource(result.source);
    } catch {
      toast.error("Could not build flow — try again.");
    } finally {
      setGenerating(false);
    }
  }, [briefFields, chipAnswers, playbook, rigor]);

  useEffect(() => {
    if (step === 3) {
      advanceBuildRef.current = false;
      void runGeneration();
    }
  }, [step, runGeneration]);

  const handlePublish = async () => {
    if (!flow || publishing) return;
    setPublishing(true);
    try {
      const edited = applyReviewEdits(flow, reviewCards);
      const brief = briefFromForm({
        ...briefFields,
        followUps: chipAnswersToBriefAnswers(followUps, chipAnswers),
      });
      const created = await createJobFromFlow(edited, brief, { status: "published", voiceInterview: hasVoiceInterviews });
      clearDraft();
      sessionStorage.removeItem(DRAFT_SESSION_KEY);
      setPublishedCode(created.job_code);
      setPublishedRoleId(created.id);
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["showcase-jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["showcase-dashboard"] });
      setStep(5);
      toast.success("Role published");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  // Real-time voice editing of the plan (Ava calls these via TalkToAva on the review step).
  // These mutate the SAME reviewCards the manual buttons do — one source of truth.
  const onEditPhase = useCallback((id: string, field: "title" | "candidate", value: string) => {
    setReviewCards((arr) => arr.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
  }, []);
  const onRemovePhase = useCallback((id: string) => {
    setReviewCards((arr) => arr.filter((x) => x.id !== id));
  }, []);
  const onReorderPhases = useCallback((ids: string[]) => {
    setReviewCards((arr) => {
      const jobPost = arr.filter((x) => x.id === "job-post");
      const rest = arr.filter((x) => x.id !== "job-post");
      const ordered = ids.map((id) => rest.find((x) => x.id === id)).filter((x): x is ReviewPhaseCard => Boolean(x));
      const remaining = rest.filter((x) => !ids.includes(x.id));
      return [...jobPost, ...ordered, ...remaining];
    });
  }, []);

  // Voice flow keeps Ava mounted across intake (0) → build (3) → review (4), so she's never cut off.
  const voiceLed = inputMode === "voice" && !publishedCode && (step === 0 || step === 3 || step === 4);

  const canContinueBrief = briefFields.role.trim().length > 1 && briefFields.location.trim() && briefFields.pay.trim() && briefFields.work.trim();

  const handleNext = () => {
    if (step === 0 && !canContinueBrief) {
      toast.message("Add role, location, pay, and what they'll do.");
      return;
    }
    if (step === 1 && fuIndex < followUps.length - 1) {
      setFuIndex((i) => i + 1);
      return;
    }
    if (step < STEPS.length - 1) setStep((s) => s + 1);
  };

  const handleBack = () => {
    if (step === 1 && fuIndex > 0) {
      setFuIndex((i) => i - 1);
      return;
    }
    if (step > 0) {
      if (step === 4) {
        setStep(2);
        setFuIndex(followUps.length - 1);
      } else {
        setStep((s) => s - 1);
      }
    }
  };

  useEffect(() => {
    if (step === 1) setFuIndex(0);
  }, [step]);

  const nextLabel = useMemo(() => {
    if (step === 0) return "Continue";
    if (step === 1) return fuIndex < followUps.length - 1 ? "Next question" : "Looks right";
    if (step === 2) return "Build my flow";
    if (step === 4) return publishing ? "Publishing…" : "Publish role";
    return "Continue";
  }, [step, fuIndex, followUps.length, publishing]);

  if (authLoading || !user) return <AuthLoadingScreen variant="employer" />;

  const applyLink = publishedCode ? candidateApplyUrl(publishedCode) : "";

  return (
    <div
      className="ava-flow scroll-perf relative flex h-[100dvh] flex-col overflow-hidden"
      style={{ background: "radial-gradient(ellipse 90% 60% at 50% -10%, hsl(152 40% 14% / 0.5) 0%, transparent 60%), hsl(var(--background))", color: "hsl(var(--foreground))" }}
    >
      <style>{FOCUS_CSS}</style>
      <HeroBackground />

      <header className="relative z-10 flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link to="/jobs" className="inline-flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-100" style={{ color: "hsl(var(--muted-foreground))" }}>
          <ArrowLeft className="h-3.5 w-3.5" /> Jobs
        </Link>
        {!(step === 0 && inputMode === "voice") && <div className="hidden flex-1 sm:block"><StepRail step={step} /></div>}
        {genSource && (
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: genSource === "openai" ? "hsl(var(--ck-mint))" : "hsl(var(--muted-foreground))" }}>
            {genSource === "openai" ? "AI generated" : "Template fallback"}
          </span>
        )}
      </header>

      {!(step === 0 && inputMode === "voice") && <div className="relative z-10 px-4 pb-2 sm:hidden"><StepRail step={step} /></div>}

      <main className="relative z-10 flex min-h-0 flex-1 justify-center overflow-y-auto px-4 py-6 sm:px-6 sm:py-10">
        <div className="my-auto w-full max-w-5xl">
          {/* Persistent voice presence — stays mounted across intake → build → review so Ava is
              never cut off and can refine the plan with the employer by voice in real time. */}
          {voiceLed && (
            <TalkToAva
              step={step}
              planVisible={planVisible}
              brief={briefFields}
              reviewCards={reviewCards}
              onBriefPatch={(patch) => setBriefFields((b) => ({ ...b, ...patch }))}
              onComplete={(payload) => {
                // Voice confirmed → skip Follow-ups + Rigor: map the brief, auto-pick the
                // recommended rigor for the detected role family, and jump straight into the
                // existing "Ava is building" step (which auto-runs generateJobFlow).
                const merged = { ...briefFields, ...payload };
                setBriefFields(merged);
                const fam = detectFamily(briefFromForm({ ...merged, followUps: [] }));
                setRigor(PLAYBOOKS[fam].rigor.recommended);
                setRigorTouched(true);
                setStep(3);
              }}
              onPreferType={() => setInputMode("form")}
              onEditPhase={onEditPhase}
              onRemovePhase={onRemovePhase}
              onReorderPhases={onReorderPhases}
              onConfirmPublish={() => void handlePublish()}
            />
          )}
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduceMotion ? undefined : { opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.4, 0, 0.2, 1] }} onAnimationComplete={() => { if (step === 4) setPlanVisible(true); }}>
              {step === 0 && inputMode === "form" && (
                <div className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
                  <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
                    <AvaOrb size={240} reflection={false} />
                    <span className="mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ borderColor: "hsl(var(--primary) / 0.3)", color: "hsl(var(--ck-brass))" }}>
                      <AvaGlyph size={12} /> Ava · Hiring assistant
                    </span>
                    <h1 className="mt-4 text-3xl leading-[1.1] sm:text-4xl" style={{ fontFamily: DISPLAY, fontWeight: 500 }}>Tell Ava what you're<br className="hidden sm:block" /> hiring for.</h1>
                    <p className="mt-3 max-w-sm text-sm leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                      A few details is all I need. I'll ask follow-ups, recommend screening rigor, then build your whole hiring flow.
                    </p>
                    <button type="button" onClick={() => setInputMode("voice")} className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: "hsl(var(--ck-brass))" }}>
                      <Mic className="h-3.5 w-3.5" /> Talk to Ava instead
                    </button>
                  </div>
                  <div className="rounded-2xl p-5 sm:p-6" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "var(--shadow-lg)" }}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--muted-foreground))" }}><Briefcase className="mr-1 inline h-3.5 w-3.5" style={{ color: "hsl(var(--ck-brass))" }} /> Role title</label>
                        <input value={briefFields.role} onChange={(e) => setBrief("role", e.target.value)} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: "hsl(var(--ck-surface-2))", border: "1px solid hsl(var(--border))" }} placeholder="Barista, Line cook, Frontend Developer…" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--muted-foreground))" }}><MapPin className="mr-1 inline h-3.5 w-3.5" style={{ color: "hsl(var(--ck-brass))" }} /> Location</label>
                        <input value={briefFields.location} onChange={(e) => setBrief("location", e.target.value)} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: "hsl(var(--ck-surface-2))", border: "1px solid hsl(var(--border))" }} placeholder="City, State — or 'Remote'" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--muted-foreground))" }}><Briefcase className="mr-1 inline h-3.5 w-3.5" style={{ color: "hsl(var(--ck-brass))" }} /> Type</label>
                        <input value={briefFields.type} onChange={(e) => setBrief("type", e.target.value)} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: "hsl(var(--ck-surface-2))", border: "1px solid hsl(var(--border))" }} placeholder="Full-time · On-site / Hybrid / Remote" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--muted-foreground))" }}><DollarSign className="mr-1 inline h-3.5 w-3.5" style={{ color: "hsl(var(--ck-brass))" }} /> Pay</label>
                        <input value={briefFields.pay} onChange={(e) => setBrief("pay", e.target.value)} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: "hsl(var(--ck-surface-2))", border: "1px solid hsl(var(--border))" }} placeholder="e.g. $22/hr or $90k–$110k" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--muted-foreground))" }}><CalendarClock className="mr-1 inline h-3.5 w-3.5" style={{ color: "hsl(var(--ck-brass))" }} /> Start</label>
                        <input value={briefFields.start} onChange={(e) => setBrief("start", e.target.value)} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: "hsl(var(--ck-surface-2))", border: "1px solid hsl(var(--border))" }} placeholder="ASAP, within a few weeks, or flexible" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--muted-foreground))" }}><FileText className="mr-1 inline h-3.5 w-3.5" style={{ color: "hsl(var(--ck-brass))" }} /> What they'll do</label>
                        <textarea value={briefFields.work} onChange={(e) => setBrief("work", e.target.value)} rows={2} className="mt-1.5 w-full resize-none rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: "hsl(var(--ck-surface-2))", border: "1px solid hsl(var(--border))" }} placeholder="2–3 sentences in your own words: the day-to-day, who they work with, and what success looks like." />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 1 && (() => {
                const fu = followUps[Math.min(fuIndex, Math.max(0, followUps.length - 1))];
                if (!fu) return null;
                const picked = chipAnswers[fu.id] ?? fu.def;
                return (
                  <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
                    <AvaOrb size={wide ? 248 : 208} reflection={false} amp={0.26} flow={0.72} />
                    <span className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "hsl(var(--ck-brass))" }}>Ava · Question {fuIndex + 1} of {followUps.length}</span>
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold" style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--ck-mint))", border: "1px solid hsl(var(--primary) / 0.22)" }}>
                      <AvaGlyph size={11} /> Tailored to a {playbook.label} role
                    </span>
                    <h2 className="mt-4 text-2xl sm:text-3xl" style={{ fontFamily: DISPLAY, fontWeight: 500 }}>{fu.question}</h2>
                    <div className="mt-7 flex flex-wrap justify-center gap-2.5">
                      {fu.chips.map((chip, ci) => {
                        const on = picked === ci;
                        return (
                          <button key={chip} type="button" onClick={() => setChipAnswers((a) => ({ ...a, [fu.id]: ci }))} className="inline-flex items-center rounded-full px-4 py-2.5 text-sm transition-all" style={on ? { background: "linear-gradient(180deg, hsl(38 56% 58% / 0.22) 0%, hsl(38 56% 50% / 0.10) 100%), hsl(var(--ck-surface-2))", color: "hsl(var(--ck-brass-bright))", border: "1px solid hsl(var(--primary) / 0.7)", fontWeight: 600 } : { background: "hsl(var(--ck-surface-2))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))" }}>
                            {on && <Check className="mr-2 h-4 w-4" />}{chip}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {step === 2 && (
                <div className="mx-auto max-w-3xl text-center">
                  <AvaOrb size={wide ? 224 : 184} reflection={false} amp={0.24} flow={0.7} />
                  <h2 className="mt-4 text-2xl sm:text-3xl" style={{ fontFamily: DISPLAY, fontWeight: 500 }}>How thoroughly should I screen?</h2>
                  <div className="mx-auto mt-5 flex max-w-xl items-start gap-3 rounded-2xl p-4 text-left" style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.3)" }}>
                    <AvaGlyph size={16} className="mt-1 shrink-0" />
                    <p className="text-sm leading-relaxed">I'd screen this at <strong style={{ color: "hsl(var(--ck-brass-bright))" }}>{RIGOR_OPTIONS.find((o) => o.id === playbook.rigor.recommended)?.label}</strong>. {playbook.rigor.rationale}</p>
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    {RIGOR_OPTIONS.map((opt) => {
                      const active = rigor === opt.id;
                      const isRec = opt.id === playbook.rigor.recommended;
                      return (
                        <button key={opt.id} type="button" onClick={() => { setRigor(opt.id); setRigorTouched(true); }} className="relative rounded-2xl p-5 text-left" style={{ background: active ? "hsl(var(--primary) / 0.1)" : "hsl(var(--card))", border: active ? "1px solid hsl(var(--primary) / 0.6)" : "1px solid hsl(var(--border))" }}>
                          {isRec && <span className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: "hsl(var(--ck-jade))", color: "hsl(var(--primary-foreground))" }}>Ava picks</span>}
                          <span className="text-lg font-bold" style={{ fontFamily: DISPLAY, color: active ? "hsl(var(--ck-brass-bright))" : "hsl(var(--foreground))" }}>{opt.label}</span>
                          <p className="mt-1.5 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{opt.blurb}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 3 && (
                <BuildStep
                  role={briefFields.role}
                  rigorLabel={rigorLabel}
                  reasoning={playbook.reasoning}
                  generating={generating}
                  onDone={() => {
                    if (advanceBuildRef.current || !flow) return;
                    advanceBuildRef.current = true;
                    setStep(4);
                  }}
                />
              )}

              {step === 4 && (
                <div className="mx-auto max-w-2xl">
                  <div className="text-center">
                    <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ borderColor: "hsl(var(--ck-jade) / 0.4)", color: "hsl(var(--ck-mint))" }}>
                      <Check className="h-3 w-3" /> {genSource === "openai" ? "Built with AI" : "Built from playbook"}
                    </span>
                    <h2 className="mt-3 text-2xl sm:text-3xl" style={{ fontFamily: DISPLAY, fontWeight: 500 }}>Here's your hiring plan.</h2>
                    <p className="mt-2 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Reorder, tweak, or remove anything — then publish.</p>
                  </div>
                  <div className="mt-7">
                    {reviewCards.map((p, i) => (
                      <PhaseRow
                        key={p.id}
                        phase={p}
                        index={i}
                        total={reviewCards.length}
                        editing={editingId === p.id}
                        onEdit={() => setEditingId(editingId === p.id ? null : p.id)}
                        onRemove={() => setReviewCards((arr) => arr.filter((x) => x.id !== p.id))}
                        onMove={(dir) => setReviewCards((arr) => {
                          const idx = arr.findIndex((x) => x.id === p.id);
                          const j = idx + dir;
                          if (idx < 0 || j < 0 || j >= arr.length) return arr;
                          const next = [...arr];
                          [next[idx], next[j]] = [next[j], next[idx]];
                          return next;
                        })}
                        onField={(field, value) => setReviewCards((arr) => arr.map((x) => (x.id === p.id ? { ...x, [field === "title" ? "title" : "candidate"]: value } : x)))}
                      />
                    ))}
                  </div>
                </div>
              )}

              {step === 5 && publishedCode && (
                <div className="mx-auto flex max-w-md flex-col items-center text-center">
                  <AvaOrb size={248} reflection={false} amp={0.26} flow={0.7} />
                  <span className="mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ background: "hsl(var(--ck-jade) / 0.16)", color: "hsl(var(--ck-mint))" }}>
                    <Check className="h-3 w-3" /> Your role is live
                  </span>
                  <h2 className="mt-4 text-3xl sm:text-4xl" style={{ fontFamily: DISPLAY, fontWeight: 500 }}>Share your role.</h2>
                  <div className="mt-6 w-full rounded-2xl p-5" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "var(--shadow-lg)" }}>
                    <span className="flex items-center gap-1.5 text-left text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "hsl(var(--muted-foreground))" }}><Share2 className="h-3 w-3" /> Apply link</span>
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-xl px-3.5 py-3" style={{ background: "hsl(var(--ck-surface-2))", border: "1px solid hsl(var(--border))" }}>
                      <span className="truncate text-sm font-medium">{applyLink.replace(/^https?:\/\//, "")}</span>
                      <button type="button" onClick={() => void navigator.clipboard.writeText(applyLink).then(() => toast.success("Link copied"))} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </button>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl" style={{ background: "hsl(var(--ck-surface-2))", border: "1px solid hsl(var(--border))" }}><QrCode className="h-9 w-9" /></span>
                      <div className="text-left">
                        <span className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>Job code</span>
                        <button type="button" onClick={() => void navigator.clipboard.writeText(publishedCode).then(() => toast.success("Code copied"))} className="mt-1 flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-xs font-semibold tracking-wider" style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--ck-brass-bright))", border: "1px solid hsl(var(--primary) / 0.3)" }}>
                          {publishedCode} <Copy className="h-3 w-3 opacity-70" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <p className="mt-5 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                    <CountUp value={reviewCards.length} /> screening steps · applicants can apply at <code className="text-[11px]">/candidate/apply?code={publishedCode}</code>
                  </p>
                  {publishedRoleId && (
                    <Link to="/jobs" className="mt-4 text-sm font-medium" style={{ color: "hsl(var(--ck-brass))" }}>View in Jobs →</Link>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {step !== 3 && step !== 5 && !(step === 0 && inputMode === "voice") && (
        <footer className="relative z-10 flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <button type="button" onClick={handleBack} disabled={step === 0} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-30" style={{ background: "hsl(var(--secondary))", border: "1px solid hsl(var(--border))" }}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <button
            type="button"
            disabled={publishing || (step === 4 && !flow)}
            onClick={() => {
              if (step === 2) setStep(3);
              else if (step === 4) void handlePublish();
              else handleNext();
            }}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
            style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", boxShadow: "0 0 28px hsl(var(--primary) / 0.22)" }}
          >
            {publishing && <Loader2 className="h-4 w-4 animate-spin" />}
            {nextLabel}
            {step === 2 ? <AvaGlyph size={16} /> : <ArrowRight className="h-4 w-4" />}
          </button>
        </footer>
      )}
    </div>
  );
}
