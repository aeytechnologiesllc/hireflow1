/**
 * AvaCreateJob — REAL create-job flow (Ava Engine MVP slice 1).
 * Route: /jobs/create (full-screen, auth required).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  ExternalLink,
  FileText,
  Gauge,
  Loader2,
  MapPin,
  MessageSquare,
  MessageSquareText,
  Pencil,
  Share2,
  ShieldCheck,
  Timer,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { useQueryClient } from "@tanstack/react-query";
import { AvaSeal } from "@/components/ava/AvaSeal";
import { HeroBackground } from "@/components/ava/HeroBackground";
import { CountUp } from "@/cockpit/components/CountUp";
import { AuthLoadingScreen } from "@/components/animations/AuthLoadingScreen";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useUpdateProfile } from "@/hooks/useProfile";
import { useTeamMemberPermissions } from "@/hooks/useTeamMemberPermissions";
import {
  BuildStep,
  BuildStuckNotice,
  PhaseRow,
  StepRail,
  type ReviewPhaseCard,
} from "@/components/ava/createFlow/shared";
import { DISPLAY, FOCUS_CSS, STEPS, useWide } from "@/components/ava/createFlow/sharedAtoms";
import {
  PLAYBOOKS,
  RIGOR_OPTIONS,
  briefFromForm,
  chipAnswersToBriefAnswers,
  clearDraft,
  withRemoteFollowUps,
  generateJobFlow,
  CHAT_AGENT_KIND,
  JOB_KIND_ID,
  loadDraft,
  saveDraft,
  type JobFlow,
  type Rigor,
} from "@/lib/avaEngine";
import { candidateApplyUrl } from "@/lib/showcaseApply";
import { createJobFromFlow, fetchEmployerCompanyName } from "@/lib/jobFromFlow";
import { EmailCheckDialog } from "@/components/business/EmailCheckDialog";
import { isEmailNotVerifiedError, OWNER_MUST_CONFIRM_EMAIL } from "@/lib/emailCheck";
import { PublishPaymentDialog } from "@/components/billing/PublishPaymentDialog";
import { isPaymentRequiredError, PUBLISH_PAYMENT_WORDS } from "@/lib/billing";
import { geocodePlace } from "@/lib/geocode";
import { placeNamesNothing } from "@/lib/jobLocation";
import {
  PAY_EXAMPLE,
  PLACE_PICKS,
  REMOTE_JOB_TYPE,
  START_PICKS,
  exampleWork,
  payPicks,
  pickedPlace,
  placeForOfficePick,
  readPay,
  readPlace,
  typeForPlace,
  type PlacePickId,
} from "@/lib/briefPicks";
import type { LucideIcon } from "lucide-react";
import { candidateOrigin } from "@/lib/hosts";
import { jobPageUrl, jobShareUrl } from "@/lib/jobLinks";
import { useOwnBusiness } from "@/hooks/useBusinessPage";
import { claimSuggestedSlug } from "@/lib/jobSlugAvailability";

const KIND_ICON: Record<string, { icon: LucideIcon; accent: ReviewPhaseCard["accent"] }> = {
  application: { icon: FileText, accent: "good" },
  quiz: { icon: Timer, accent: "goodSoft" },
  // The computer and connection check (docs/EQUIPMENT-CHECK.md), a remote role's first step.
  equipment_check: { icon: Gauge, accent: "goodSoft" },
  simulation: { icon: MessageSquare, accent: "brass" },
  // Written, not spoken: see KIND_LABEL below.
  voice_interview: { icon: MessageSquareText, accent: "goodSoft" },
  coding_test: { icon: Code2, accent: "goodSoft" },
  shortlist: { icon: Trophy, accent: "brass" },
};

/** The card's kind line, in the words the business reads everywhere else,
 *  never the engine's own names (the run-through of 2026-10-31: "SCENARIO
 *  QUESTIONS", "EQUIPMENT CHECK" and "APPLICATION" over friendly titles). Its
 *  interview phase is still called "voice_interview", but voice is off for
 *  every business (hasVoiceInterviews below), so it is saved as a typed chat
 *  interview. A card whose title already says the same shows only its mark
 *  (PhaseRow). */
const KIND_LABEL: Record<string, string> = {
  application: "application form",
  quiz: "skills check",
  equipment_check: "computer check",
  simulation: "chat practice",
  voice_interview: "written interview",
  coding_test: "coding test",
  shortlist: "shortlist",
};

/** A skills question's area as words ("fee_math" reads "Fee math"). */
function areaLabel(category: unknown): string | null {
  if (typeof category !== "string" || !category.trim()) return null;
  const words = category.trim().replace(/[_-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** What a step's card opens to before Publish: its questions, cases or bars, read from the plan itself. */
function phaseDetails(p: JobFlow["phases"][number]): ReviewPhaseCard["details"] {
  const cfg = p.config as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const many = (n: number, one: string, more: string) => (n === 1 ? one : more.replace("#", String(n)));
  if (p.kind === "application") {
    const qs = (Array.isArray(cfg.questions) ? cfg.questions : [])
      .map((q) => text(typeof q === "string" ? q : (q as { question?: unknown; text?: unknown } | null)?.question ?? (q as { text?: unknown } | null)?.text))
      .filter(Boolean);
    return qs.length ? { toggle: many(qs.length, "See the question", "See the # questions"), items: qs.map((q) => ({ text: q })) } : null;
  }
  if (p.kind === "quiz") {
    const items = (Array.isArray(cfg.items) ? cfg.items : []) as { scenario?: unknown; options?: unknown; correctAnswer?: unknown; category?: unknown; good?: unknown }[];
    const list = items
      .map((q) => ({
        text: text(q.scenario),
        label: areaLabel(q.category),
        options: Array.isArray(q.options) ? q.options.map(text).filter(Boolean) : undefined,
        answer: text(q.correctAnswer) || null,
      }))
      .filter((q) => q.text);
    return list.length
      ? { toggle: many(list.length, "See the question", "See the # questions"), note: list.some((q) => q.answer) ? "The right answer is ticked. Applicants never see it." : null, items: list }
      : null;
  }
  if (p.kind === "simulation") {
    const cases = (Array.isArray(cfg.scenarios) ? cfg.scenarios : []) as { prompt?: unknown; title?: unknown; customerName?: unknown }[];
    const list = cases.map((c) => ({ text: text(c.prompt), label: text(c.customerName) || text(c.title) || null })).filter((c) => c.text);
    const email = cfg.channel === "email";
    return list.length
      ? {
          toggle: many(list.length, "See the case", "See the # cases"),
          note: list.length > 1 ? `Each applicant gets one of these, and ${email ? "the customer writes to them by email" : "the customer messages them first"}.` : null,
          items: list,
        }
      : null;
  }
  if (p.kind === "voice_interview") {
    const qs = (Array.isArray(cfg.questions) ? cfg.questions : []) as { prompt?: unknown }[];
    const list = qs.map((q) => ({ text: text(typeof q === "string" ? q : q.prompt) })).filter((q) => q.text);
    return list.length ? { toggle: many(list.length, "See the question", "See the # questions"), items: list } : null;
  }
  if (p.kind === "equipment_check") {
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const down = n(cfg.minDownloadMbps), up = n(cfg.minUploadMbps), ping = n(cfg.maxLatencyMs);
    const items = [
      down != null ? { text: `Download speed of at least ${down} Mbps` } : null,
      up != null ? { text: `Upload speed of at least ${up} Mbps` } : null,
      ping != null ? { text: `A delay (ping) of no more than ${ping} ms` } : null,
    ].filter((x): x is { text: string } => !!x);
    return items.length ? { toggle: "See what it checks", items } : null;
  }
  return null;
}

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
    const meta = KIND_ICON[p.kind] ?? { icon: FileText, accent: "good" as const };
    // An email agent's practice says so on its card too (its title and "1 email" come from the plan).
    const emailPractice = p.kind === "simulation" && (p.config as { channel?: unknown }).channel === "email";
    return {
      id: p.id,
      kind: KIND_LABEL[p.kind] ?? p.kind.replace(/_/g, " "),
      ...(emailPractice ? { kind: "email practice" } : {}),
      icon: meta.icon,
      accent: meta.accent,
      title: p.title,
      candidate: p.candidateDescription,
      rationale: p.rationale,
      count: p.countLabel ?? "—",
      duration: p.durationLabel ?? "—",
      details: phaseDetails(p),
    };
  });
  return [post, ...phases];
}

/** The review's edits as the draft keeps them (a card's icon is a component, never stored). */
type ReviewEdit = { id: string; title: string; candidate: string };

/** The cards for a saved plan with the business's own renames, order and removals put back. */
function restoreReviewCards(flow: JobFlow, edits: ReviewEdit[] | undefined): ReviewPhaseCard[] {
  const cards = flowToReviewCards(flow);
  if (!Array.isArray(edits) || edits.length === 0) return cards;
  const byId = new Map(cards.map((c) => [c.id, c]));
  const restored = edits
    .filter((e) => e && typeof e.id === "string" && byId.has(e.id))
    .map((e) => ({ ...byId.get(e.id)!, title: typeof e.title === "string" ? e.title : byId.get(e.id)!.title, candidate: typeof e.candidate === "string" ? e.candidate : byId.get(e.id)!.candidate }));
  return restored.length ? restored : cards;
}

/** Where a saved draft picks up: the review when it has a plan, a question step as it was, else the brief.
 *  Never the build (it would build again) or the published screen. */
function restoredStep(saved: { step?: number; flow: JobFlow | null } | null): number {
  const at = saved?.step;
  if (typeof at !== "number") return 0;
  if (at >= 3 && saved?.flow) return 4;
  if (at === 1 || at === 2) return at;
  return 0;
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

// The brief's fields: one look for every label and box.
const FIELD_LABEL = "block text-xs font-semibold uppercase tracking-[0.14em]";
const FIELD_INPUT = "mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none";
const FIELD_STYLE = { background: "hsl(var(--ck-surface-2))", border: "1px solid hsl(var(--border))" } as const;

/** A quick pick under a brief field: a real button, the follow-up chips' look
 *  (the jade when chosen, never brass), smaller. */
function BriefPick({ label, on, icon, onPick }: { label: string; on?: boolean; icon?: ReactNode; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on === undefined ? undefined : on}
      className="inline-flex min-h-[30px] items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] leading-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--action)]"
      style={on ? { background: "var(--action-soft)", color: "var(--action-soft-fg)", border: "1px solid var(--action)", fontWeight: 600 } : { background: "hsl(var(--ck-surface-2))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))" }}
    >
      {on ? <Check className="h-3.5 w-3.5" aria-hidden /> : icon}
      {label}
    </button>
  );
}

/** The line under a field that says what the post will show: the jade with a check when it is read, else quiet words
 *  (never an error's tone: nothing the business typed is wrong). */
function ReadBack({ tone, children }: { tone: "found" | "plain" | "hint"; children: ReactNode }) {
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] leading-snug" style={{ color: tone === "found" ? "hsl(var(--ck-action-bright))" : "hsl(var(--muted-foreground))" }}>
      {tone === "found" && <Check className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export default function AvaCreateJob() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const { data: teamPermissions, isLoading: teamPermissionsLoading } = useTeamMemberPermissions();
  // Text-only screening (owner decision, 2026-10-04): no voice interview step.
  const hasVoiceInterviews = false;
  const wide = useWide();
  const reduceMotion = useReducedMotion();

  const resumeDraft = typeof window !== "undefined" && sessionStorage.getItem(DRAFT_SESSION_KEY) === "1";
  const saved = resumeDraft ? loadDraft() : null;
  // Dev-preview-only seam (src/dev-preview/): lets the /__preview picker land
  // directly on a given step instead of
  // requiring a click-through. `import.meta.env.DEV` is statically `false` in
  // production, so this never reads real query params there.
  const previewParams =
    import.meta.env.DEV && typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  // A draft picks up where it was left (the walkthrough of 2026-10-31: the
  // email check's Help link, then Back, restarted at the brief and built the
  // plan again, losing every rename and removal on the review).
  const [step, setStep] = useState(() => {
    const raw = previewParams?.get("__previewStep");
    return raw != null && !Number.isNaN(Number(raw)) ? Number(raw) : restoredStep(saved);
  });
  // No talking to Ava (the owner, 2026-10-29): every business, the
  // platform's own account included, tells her about the role in writing.
  const [fuIndex, setFuIndex] = useState(0);
  const [chipAnswers, setChipAnswers] = useState<Record<string, number>>(saved?.chipAnswers ?? {});
  const [rigor, setRigor] = useState<Rigor>(saved?.rigor ?? "standard");
  const [rigorTouched, setRigorTouched] = useState(saved?.rigorTouched ?? false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [briefFields, setBriefFields] = useState(
    saved?.briefFields ?? {
      role: "",
      location: "",
      // The Type starts remote, as most chat and email agents work (2026-10-31), and follows Where they'll work
      // (typeForPlace, below) until the business types in it: a place in a city puts it back on the builder's default,
      // DEFAULT_JOB_TYPE, which the title and What they do may overrule; once the business types in it, its own on-site
      // decides (briefFromForm; the seventeenth Phase 4 review).
      type: REMOTE_JOB_TYPE,
      typeChosen: false,
      atOffice: false,
      pay: "",
      start: "Within a few weeks",
      work: "",
      openings: 1,
      benefits: [] as string[],
    },
  );
  const [geoPreview, setGeoPreview] = useState<import("@/lib/geocode").GeoPlace | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [flow, setFlow] = useState<JobFlow | null>(saved?.flow ?? null);
  const [reviewCards, setReviewCards] = useState<ReviewPhaseCard[]>(() => (saved?.flow ? restoreReviewCards(saved.flow, saved.reviewEdits) : []));
  const [generating, setGenerating] = useState(false);
  const [genSource, setGenSource] = useState<"openai" | "template" | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedCode, setPublishedCode] = useState<string | null>(null);
  const [publishedRoleId, setPublishedRoleId] = useState<string | null>(null);
  // The new job's short link name (hireflownow.com/<slug>), when one was free.
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  // The business's careers name: the link is /c/<business>/<job>.
  const { data: ownBusiness } = useOwnBusiness();
  // Publishing with no business name on file is what a job silently drops out
  // of the aggregator feed for and shows "Confidential" to candidates. Catch
  // it right here rather than losing the plan the employer just built.
  const [showCompanyNamePrompt, setShowCompanyNamePrompt] = useState(false);
  // A business confirms its email at its first publish (src/lib/emailCheck.ts);
  // the publish that was waiting carries on once it has.
  const [emailCheckOpen, setEmailCheckOpen] = useState(false);
  const emailCheckRetryRef = useRef<{ companyNameOverride?: string } | null>(null);
  // With billing on, a business whose free job is used pays to put a job live
  // (pricing v9, src/lib/billing.ts): the job is saved as a draft first, then
  // paid for. Never while billing is off (the database never refuses then).
  const [paymentJob, setPaymentJob] = useState<{ id: string; title: string } | null>(null);
  const [companyNameDraft, setCompanyNameDraft] = useState("");
  const [savingCompanyName, setSavingCompanyName] = useState(false);
  const advanceBuildRef = useRef(false);
  // Belt-and-suspenders for the build screen itself: `generating` is meant to always settle
  // (flowGenerator.ts now bounds its own network call and falls back to a template on any
  // stall), but nothing upstream of this component can promise that forever — a future
  // regression there must not leave the employer staring at "Building your hiring plan…"
  // with no way out.
  const [buildStuck, setBuildStuck] = useState(false);

  useEffect(() => {
    if (step !== 3) setBuildStuck(false);
  }, [step]);

  useEffect(() => {
    if (step !== 3 || !generating) return;
    const t = window.setTimeout(() => setBuildStuck(true), 25000);
    return () => window.clearTimeout(t);
  }, [step, generating]);

  const formBrief = useMemo(() => briefFromForm({ ...briefFields, followUps: [] }), [briefFields]);
  // Every job Ava builds is a chat or message agent's (the owner,
  // 2026-10-29): the kind of job is not asked, and CHAT_AGENT_KIND carries it
  // in the brief (an answer left from an older draft is not read).
  const playbook = PLAYBOOKS.customer_service;
  const workMode = formBrief.workMode;
  // The brief lets a follow-up start on what the business's own words point to (a dental office starts on "Dental office"),
  // and its name when the role's words name no kind of business ("Bright Smile Dental").
  const businessName = profile?.company_name ?? null;
  const followUps = useMemo(
    () => withRemoteFollowUps(playbook.followUps(chipAnswers, { ...formBrief, businessName }), workMode),
    [playbook, chipAnswers, workMode, formBrief, businessName],
  );
  const briefAnswers = useCallback(
    (defs: typeof followUps) => chipAnswersToBriefAnswers([CHAT_AGENT_KIND, ...defs], { ...chipAnswers, [JOB_KIND_ID]: 0 }),
    [chipAnswers],
  );
  const rigorLabel = RIGOR_OPTIONS.find((o) => o.id === rigor)?.label ?? "Standard";

  const setBrief = (k: string, v: string) => setBriefFields((b) => ({ ...b, [k]: v }));
  const placeInputRef = useRef<HTMLInputElement>(null);
  const workInputRef = useRef<HTMLTextAreaElement>(null);
  const atOffice = !!briefFields.atOffice;

  // The Type follows Where they'll work while the business has not typed in it (typeChosen false; an older draft
  // with no record keeps what it has).
  useEffect(() => {
    if (briefFields.typeChosen !== false) return;
    const next = typeForPlace(briefFields.location, { atOffice, role: briefFields.role });
    if (next !== briefFields.type) setBriefFields((b) => ({ ...b, type: next }));
  }, [briefFields.typeChosen, briefFields.location, briefFields.role, briefFields.type, atOffice]);

  // What the post will say about the place and the pay, by Publish's own rules (src/lib/briefPicks.ts).
  const placeReading = useMemo(
    () => readPlace(briefFields.location, { workMode, atOffice, geo: geoPreview }),
    [briefFields.location, workMode, atOffice, geoPreview],
  );
  const payReading = useMemo(
    () => readPay(briefFields.pay, { remote: workMode === "remote", countryCode: placeReading?.countryCode ?? null }),
    [briefFields.pay, workMode, placeReading?.countryCode],
  );
  const placePicked = pickedPlace(briefFields.location, atOffice);
  const pickPlace = (id: PlacePickId, value: string) => {
    setGeoPreview(null);
    if (id === "office") {
      // An office is a city to type: a remote place's words go, anything already typed for an office stays.
      setBriefFields((b) => ({ ...b, atOffice: true, location: placeForOfficePick(b.location) }));
      window.requestAnimationFrame(() => placeInputRef.current?.focus());
      return;
    }
    setBriefFields((b) => ({ ...b, atOffice: false, location: value }));
  };

  // The geocoder is asked only about a place the builder cannot place itself (a country, a well-known city and
  // "Remote, anywhere" are known here), and its answer counts only for the words it was asked about.
  const latestPlaceRef = useRef(briefFields.location);
  useEffect(() => {
    latestPlaceRef.current = briefFields.location;
  }, [briefFields.location]);
  const resolveLocation = useCallback(async () => {
    const q = (briefFields.location ?? "").trim();
    if (q.length < 2 || placeNamesNothing(q) || !readPlace(q, { workMode, atOffice, geo: null })?.lookUp) { setGeoPreview(null); return; }
    setGeoLoading(true);
    const p = await geocodePlace(q);
    setGeoLoading(false);
    if (latestPlaceRef.current.trim() === q) setGeoPreview(p);
  }, [briefFields.location, workMode, atOffice]);

  useEffect(() => {
    if (!rigorTouched) setRigor(playbook.rigor.recommended);
  }, [playbook.rigor.recommended, rigorTouched]);

  useEffect(() => {
    sessionStorage.setItem(DRAFT_SESSION_KEY, "1");
  }, []);

  useEffect(() => {
    // Published: the draft was cleared and stays cleared.
    if (publishedCode) return;
    saveDraft({
      briefFields,
      chipAnswers,
      rigor,
      rigorTouched,
      flow,
      step,
      reviewEdits: reviewCards.map(({ id, title, candidate }) => ({ id, title, candidate })),
    });
  }, [briefFields, chipAnswers, rigor, rigorTouched, flow, step, reviewCards, publishedCode]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?redirect=createJob", { replace: true });
  }, [authLoading, user, navigate]);

  const runGeneration = useCallback(async () => {
    setGenerating(true);
    setGenSource(null);
    const brief = briefFromForm({
      ...briefFields,
      followUps: briefAnswers(withRemoteFollowUps(playbook.followUps(chipAnswers, { ...formBrief, businessName }), formBrief.workMode)),
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
      toast.error("Could not build the plan. Try again.");
    } finally {
      setGenerating(false);
    }
  }, [briefFields, chipAnswers, playbook, rigor, formBrief, briefAnswers, businessName]);

  useEffect(() => {
    if (step === 3) {
      advanceBuildRef.current = false;
      void runGeneration();
    }
  }, [step, runGeneration]);

  // Screening cards only — the job-post card is the listing, not a step. With none
  // left there is nothing for Ava to read, so the job must not go live like that.
  // Every count of steps the business reads is this one (the run-through of
  // 2026-10-31: "6 phases" and "6 screening steps" counted the job post).
  const screeningCardCount = reviewCards.filter((c) => c.id !== "job-post").length;
  const NO_SCREENING_NOTE = "Keep at least one screening step — with none, Ava has nothing to read and no one to shortlist.";

  const handlePublish = async (companyNameOverride?: string) => {
    if (!flow || publishing) return;

    if (screeningCardCount === 0) {
      toast.error(NO_SCREENING_NOTE);
      return;
    }

    // A team member publishes under the account owner, so the business name that
    // candidates and job boards see is the OWNER's — not the member's own profile,
    // which usually has none. They can't edit the owner's profile either, so the
    // ask goes to the owner instead of into the inline prompt below.
    const ownerId = teamPermissions?.isTeamMember && teamPermissions.employerId ? teamPermissions.employerId : null;
    if (ownerId) {
      let ownerCompanyName: string | null = null;
      try {
        ownerCompanyName = await fetchEmployerCompanyName(ownerId);
      } catch {
        toast.error("Couldn't check the business name on file. Please try again.");
        return;
      }
      if (!ownerCompanyName) {
        toast.error("The account owner hasn't added a business name yet. Ask them to add it on their Profile page, then publish.");
        return;
      }
    } else {
      const effectiveCompanyName = companyNameOverride ?? profile?.company_name;
      if (!effectiveCompanyName?.trim()) {
        setCompanyNameDraft(profile?.company_name ?? "");
        setShowCompanyNamePrompt(true);
        return;
      }
    }

    setPublishing(true);
    const edited = applyReviewEdits(flow, reviewCards);
    const brief = briefFromForm({
      ...briefFields,
      followUps: briefAnswers(followUps),
    });
    try {
      const created = await createJobFromFlow(edited, brief, { status: "published", voiceInterview: hasVoiceInterviews });
      clearDraft();
      sessionStorage.removeItem(DRAFT_SESSION_KEY);
      setPublishedCode(created.job_code);
      setPublishedRoleId(created.id);
      // The link to share is the short one (docs/SHORT-JOB-LINKS.md): name the
      // job after its title, the editor's own suggestion. Never in the way of
      // publishing; without one the job keeps its longer link.
      setPublishedSlug(await claimSuggestedSlug(created.id, created.title).catch(() => null));
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["showcase-jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["showcase-dashboard"] });
      setStep(5);
      toast.success("Job published");
    } catch (err) {
      // The database asks a business to confirm its email before its first job
      // goes live (20261025100000_business_email_check.sql). The owner gets the
      // code screen; a team member cannot confirm the owner's address.
      if (isEmailNotVerifiedError(err)) {
        if (ownerId) {
          toast.error(OWNER_MUST_CONFIRM_EMAIL);
        } else {
          emailCheckRetryRef.current = { companyNameOverride };
          setEmailCheckOpen(true);
        }
        return;
      }
      // Billing on and the free job used (jobs_publish_needs_pass, HINT
      // payment_required): nothing was saved, so the job is kept as a draft
      // and offered for payment.
      if (isPaymentRequiredError(err)) {
        try {
          const draft = await createJobFromFlow(edited, brief, { status: "draft", voiceInterview: hasVoiceInterviews });
          clearDraft();
          sessionStorage.removeItem(DRAFT_SESSION_KEY);
          await queryClient.invalidateQueries({ queryKey: ["jobs"] });
          setPaymentJob({ id: draft.id, title: draft.title });
        } catch (saveErr) {
          toast.error(saveErr instanceof Error ? saveErr.message : "Couldn't save the job. Please try again.");
        }
        return;
      }
      toast.error(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  // Save the business name captured inline from the publish-blocked state,
  // then continue straight into the publish that was waiting on it — passed
  // through directly rather than relying on the profile query to refetch in
  // time, so there is no race and the plan is never lost.
  const handleSaveCompanyNameAndPublish = async () => {
    const trimmed = companyNameDraft.trim();
    if (!trimmed) {
      toast.error("Enter your business name to continue.");
      return;
    }
    setSavingCompanyName(true);
    try {
      await updateProfile.mutateAsync({ company_name: trimmed });
      setShowCompanyNamePrompt(false);
      await handlePublish(trimmed);
    } catch {
      toast.error("Couldn't save your business name. Please try again.");
    } finally {
      setSavingCompanyName(false);
    }
  };

  // The chip that rides the rail is the job being built — initials of the job
  // title the employer typed, the same way the applicant rail carries a candidate's.
  // Empty until there is a role, so the chip never shows a placeholder.
  const travelerInitials = briefFields.role
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  // What each gem has to show for itself so far. Only real state — an empty
  // receipt is honest, an invented one is not.
  const stepReceipts = {
    // The job title is already the traveller chip; a long title here wraps the rail.
    "Brief": briefFields.role.trim() ? "Set" : null,
    "Follow-ups": followUps.length ? `${Object.keys(chipAnswers).length} of ${followUps.length}` : null,
    "How strict": rigorTouched || step > 2 ? RIGOR_OPTIONS.find((o) => o.id === rigor)?.label ?? null : null,
    // The applicant's steps only: the job post is the listing, not a step.
    "Ava builds": reviewCards.length ? `${screeningCardCount} ${screeningCardCount === 1 ? "step" : "steps"}` : null,
    "Review plan": step > 4 ? "Approved" : null,
    "Publish": publishedCode ? "Live" : null,
  };

  const canContinueBrief = briefFields.role.trim().length > 1 && briefFields.location.trim() && briefFields.pay.trim() && briefFields.work.trim();
  const teamCreateBlocked = teamPermissions?.isTeamMember && !teamPermissions.canCreateJobs;
  const createBlockedReason = teamCreateBlocked
    ? "Your team role does not include permission to create jobs."
    : null;

  const handleNext = () => {
    if (step === 0 && !canContinueBrief) {
      toast.message("Add the job title, where they'll work, the pay, and what they'll do.");
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
    if (step === 2) return "Build my hiring plan";
    if (step === 4) return publishing ? "Publishing…" : "Publish job";
    return "Continue";
  }, [step, fuIndex, followUps.length, publishing]);

  if (authLoading || !user || teamPermissionsLoading) return <AuthLoadingScreen variant="employer" />;

  if (createBlockedReason) {
    return (
      <div className="min-h-screen overflow-hidden" style={{ background: "hsl(var(--ck-bg))", color: "hsl(var(--foreground))" }}>
        <HeroBackground />
        <main className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-5 py-10 text-center">
          <div className="rounded-3xl p-8 shadow-2xl" style={{ background: "hsl(var(--ck-surface))", border: "1px solid hsl(var(--border))" }}>
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "hsl(var(--ck-brass) / 0.14)", color: "hsl(var(--ck-brass-bright))" }}>
              <ShieldCheck className="h-7 w-7" />
            </span>
            <h1 className="mt-5 text-2xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>Job creation is locked</h1>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
              {createBlockedReason}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link to="/jobs" className="ck-btn ck-btn-primary">
                Back to Jobs
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const applyLink = publishedCode
    ? publishedSlug && publishedRoleId
      ? jobShareUrl({ id: publishedRoleId, slug: publishedSlug, business_slug: ownBusiness?.slug ?? null })
      : publishedRoleId && typeof window !== "undefined"
        ? `${candidateOrigin()}/candidate/job/${publishedRoleId}`
        : candidateApplyUrl(publishedCode)
    : "";

  return (
    <div
      // The shell's frame, not a screen: the cockpit gives this route a main
      // with no padding that never scrolls (FILLS_FRAME_ROUTES in
      // src/cockpit/Shell.tsx). A screen tall inside the padded main, the end
      // of the plan scrolled the shell 58px and cut the step rail off.
      className="ava-flow scroll-perf relative flex h-full min-h-0 flex-col overflow-hidden"
      style={{ background: "radial-gradient(ellipse 90% 60% at 50% -10%, color-mix(in srgb, var(--hf-action-soft) 50%, transparent) 0%, transparent 60%), hsl(var(--background))", color: "hsl(var(--foreground))" }}
    >
      <style>{FOCUS_CSS}</style>
      <HeroBackground />

      <header className="relative z-10 flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link to="/jobs" className="inline-flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-100" style={{ color: "hsl(var(--muted-foreground))" }}>
          <ArrowLeft className="h-3.5 w-3.5" /> Jobs
        </Link>
        <div className="hidden min-w-0 flex-1 sm:block"><StepRail step={step} traveler={travelerInitials} receipts={stepReceipts} /></div>
        {/* Once published it is live: the header said "Draft" over "Your role is live". */}
        {genSource && (
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: publishedCode || genSource === "openai" ? "hsl(var(--ck-action-bright))" : "hsl(var(--muted-foreground))" }}>
            {publishedCode ? "Live" : "Draft"}
          </span>
        )}
      </header>

      <div className="relative z-10 px-4 pb-2 sm:hidden"><StepRail step={step} traveler={travelerInitials} receipts={stepReceipts} /></div>

      {/* The builder's own scroller holds the wheel at its ends, so reaching
          the end of the plan never moves anything behind it (the shell's main
          does not scroll on this route; scripts/guards/no-scroll-traps.mjs). */}
      <main className="relative z-10 flex min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-10" style={{ overscrollBehaviorY: "contain" }}>
        <div className="mx-auto my-auto w-full min-w-0 max-w-6xl">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduceMotion ? undefined : { opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.4, 0, 0.2, 1] }}>
              {step === 0 && (
                <div className="grid items-center gap-6 sm:gap-8 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] xl:gap-12">
                  <div className="flex min-w-0 flex-col items-center text-center xl:items-start xl:text-left">
                    <span className="mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ borderColor: "hsl(var(--primary) / 0.3)", color: "hsl(var(--ck-brass))" }}>
                      <AvaSeal size={12} /> Ava · Hiring assistant
                    </span>
                    <h1 className="mt-4 text-3xl leading-[1.1] sm:text-4xl" style={{ fontFamily: DISPLAY, fontWeight: 500 }}>Tell Ava about the<br className="hidden sm:block" /> chat agent you need.</h1>
                    <p className="mt-3 max-w-sm text-sm leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                      A few details about the job, then a few quick questions about your customers. I'll draft the job post and the tests that fit your business.
                    </p>
                  </div>
                  <div className="mx-auto w-full min-w-0 max-w-2xl rounded-2xl p-5 sm:p-6 xl:max-w-none" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "var(--shadow-lg)" }}>
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                      <div className="min-w-0 sm:col-span-2">
                        <label htmlFor="brief-role" className={FIELD_LABEL} style={{ color: "hsl(var(--muted-foreground))" }}><Briefcase className="mr-1 inline h-3.5 w-3.5" style={{ color: "hsl(var(--ck-brass))" }} /> Job title</label>
                        <input id="brief-role" value={briefFields.role} onChange={(e) => setBrief("role", e.target.value)} className={FIELD_INPUT} style={FIELD_STYLE} placeholder="Chat support agent, Email support, Patient messaging…" />
                      </div>

                      {/* Where they'll work, not where the business is (the owner, 2026-10-31: "location I'm hiring
                          from or location where they're going to be working in"). The picks fill what the post and
                          the job feeds need; the line under it says what the post will show (src/lib/briefPicks.ts). */}
                      <div className="min-w-0 sm:col-span-2">
                        <label htmlFor="brief-place" className={FIELD_LABEL} style={{ color: "hsl(var(--muted-foreground))" }}><MapPin className="mr-1 inline h-3.5 w-3.5" style={{ color: "hsl(var(--ck-brass))" }} /> Where they'll work</label>
                        <p id="brief-place-hint" className="mt-1 text-[12.5px]" style={{ color: "hsl(var(--muted-foreground))" }}>Most chat and email agents work from home.</p>
                        <input
                          id="brief-place"
                          ref={placeInputRef}
                          value={briefFields.location}
                          onChange={(e) => { const location = e.target.value; setBriefFields((b) => ({ ...b, location })); setGeoPreview(null); }}
                          onBlur={resolveLocation}
                          aria-describedby="brief-place-hint brief-place-read"
                          className={FIELD_INPUT}
                          style={FIELD_STYLE}
                          placeholder={briefFields.atOffice ? "Your office's city, like Makati or Austin, TX" : "Remote, a country, or your office's city"}
                        />
                        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Quick picks for where they'll work">
                          {PLACE_PICKS.map((pick) => (
                            <BriefPick key={pick.id} label={pick.label} on={placePicked === pick.id} onPick={() => pickPlace(pick.id, pick.value)} />
                          ))}
                        </div>
                        <div id="brief-place-read" aria-live="polite">
                          {geoLoading ? (
                            <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Looking up that place…
                            </p>
                          ) : placeReading ? (
                            <ReadBack tone={placeReading.tone}>{placeReading.text}</ReadBack>
                          ) : null}
                        </div>
                      </div>

                      {/* Pay stays free text, made plain: picks for the place and a read-back by Publish's own rule. */}
                      <div className="min-w-0 sm:col-span-2">
                        <label htmlFor="brief-pay" className={FIELD_LABEL} style={{ color: "hsl(var(--muted-foreground))" }}><DollarSign className="mr-1 inline h-3.5 w-3.5" style={{ color: "hsl(var(--ck-brass))" }} /> Pay</label>
                        <input id="brief-pay" value={briefFields.pay} onChange={(e) => setBrief("pay", e.target.value)} aria-describedby="brief-pay-read" className={FIELD_INPUT} style={FIELD_STYLE} placeholder={`The amount and how often, like ${PAY_EXAMPLE}`} />
                        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Quick picks for pay">
                          {payPicks(placeReading?.countryCode).map((pick) => (
                            <BriefPick key={pick} label={pick} on={briefFields.pay.trim() === pick} onPick={() => setBrief("pay", pick)} />
                          ))}
                        </div>
                        <div id="brief-pay-read" aria-live="polite">
                          {payReading && <ReadBack tone={payReading.tone}>{payReading.text}</ReadBack>}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <label htmlFor="brief-type" className={FIELD_LABEL} style={{ color: "hsl(var(--muted-foreground))" }}><Briefcase className="mr-1 inline h-3.5 w-3.5" style={{ color: "hsl(var(--ck-brass))" }} /> Type</label>
                        <input id="brief-type" value={briefFields.type} onChange={(e) => { const type = e.target.value; setBriefFields((b) => ({ ...b, type, typeChosen: true })); }} className={FIELD_INPUT} style={FIELD_STYLE} placeholder="Full-time · Remote / Hybrid / On-site" />
                        {briefFields.typeChosen === false && (
                          <p className="mt-1.5 text-[12.5px] leading-snug" style={{ color: "hsl(var(--muted-foreground))" }}>Follows where they'll work until you edit it.</p>
                        )}
                      </div>
                      <div className="min-w-0">
                        <label htmlFor="brief-start" className={FIELD_LABEL} style={{ color: "hsl(var(--muted-foreground))" }}><CalendarClock className="mr-1 inline h-3.5 w-3.5" style={{ color: "hsl(var(--ck-brass))" }} /> Start</label>
                        <input id="brief-start" value={briefFields.start} onChange={(e) => setBrief("start", e.target.value)} className={FIELD_INPUT} style={FIELD_STYLE} placeholder="As soon as possible, within a few weeks, or flexible" />
                        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Quick picks for the start">
                          {START_PICKS.map((pick) => (
                            <BriefPick key={pick} label={pick} on={briefFields.start.trim().toLowerCase() === pick.toLowerCase()} onPick={() => setBrief("start", pick)} />
                          ))}
                        </div>
                      </div>

                      <div className="min-w-0 sm:col-span-2">
                        <label htmlFor="brief-work" className={FIELD_LABEL} style={{ color: "hsl(var(--muted-foreground))" }}><FileText className="mr-1 inline h-3.5 w-3.5" style={{ color: "hsl(var(--ck-brass))" }} /> What they'll do</label>
                        <textarea id="brief-work" ref={workInputRef} value={briefFields.work} onChange={(e) => setBrief("work", e.target.value)} rows={3} className={`${FIELD_INPUT} min-h-[5rem] max-h-60 resize-none [field-sizing:content]`} style={FIELD_STYLE} placeholder="2–3 sentences in your own words: what your customers write in about, and what a great reply does for them." />
                        {/* Nobody faces an empty box: two sentences from the title and the business, to edit (no AI call). */}
                        {!briefFields.work.trim() && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <BriefPick
                              label="Start from an example"
                              icon={<Pencil className="h-3 w-3" aria-hidden />}
                              onPick={() => {
                                setBrief("work", exampleWork(briefFields.role, businessName));
                                window.requestAnimationFrame(() => workInputRef.current?.focus());
                              }}
                            />
                          </div>
                        )}
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
                    <span className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "hsl(var(--ck-brass))" }}>Ava · Question {fuIndex + 1} of {followUps.length}</span>
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold" style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--ck-action-bright))", border: "1px solid hsl(var(--primary) / 0.22)" }}>
                      <AvaSeal size={11} /> {playbook.label === "this role" ? "Tailored to this job" : `Tailored to ${/^[aeiou]/i.test(playbook.label) ? "an" : "a"} ${playbook.label} job`}
                    </span>
                    <h2 className="mt-4 text-2xl sm:text-3xl" style={{ fontFamily: DISPLAY, fontWeight: 500 }}>{fu.question}</h2>
                    <div className="mt-7 flex flex-wrap justify-center gap-2.5">
                      {fu.chips.map((chip, ci) => {
                        const on = picked === ci;
                        return (
                          <button key={chip} type="button" onClick={() => setChipAnswers((a) => ({ ...a, [fu.id]: ci }))} className="inline-flex items-center rounded-full px-4 py-2.5 text-sm transition-all" style={on ? { background: "var(--action-soft)", color: "var(--action-soft-fg)", border: "1px solid var(--action)", fontWeight: 600 } : { background: "hsl(var(--ck-surface-2))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))" }}>
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
                  <h2 className="mt-4 text-2xl sm:text-3xl" style={{ fontFamily: DISPLAY, fontWeight: 500 }}>How strict should I be?</h2>
                  <div className="mx-auto mt-5 flex max-w-xl items-start gap-3 rounded-2xl p-4 text-left" style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.3)" }}>
                    <AvaSeal size={16} className="mt-1 shrink-0" />
                    <p className="text-sm leading-relaxed">I'd screen this at <strong style={{ color: "hsl(var(--ck-brass-bright))" }}>{RIGOR_OPTIONS.find((o) => o.id === playbook.rigor.recommended)?.label}</strong>. {playbook.rigor.rationale}</p>
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    {RIGOR_OPTIONS.map((opt) => {
                      const active = rigor === opt.id;
                      const isRec = opt.id === playbook.rigor.recommended;
                      return (
                        <button key={opt.id} type="button" onClick={() => { setRigor(opt.id); setRigorTouched(true); }} className="relative rounded-2xl p-5 text-left" style={{ background: active ? "hsl(var(--primary) / 0.1)" : "hsl(var(--card))", border: active ? "1px solid hsl(var(--primary) / 0.6)" : "1px solid hsl(var(--border))" }}>
                          {isRec && <span className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: "hsl(var(--ck-action))", color: "hsl(var(--primary-foreground))" }}>Recommended</span>}
                          <span className="text-lg font-bold" style={{ fontFamily: DISPLAY, color: active ? "hsl(var(--ck-brass-bright))" : "hsl(var(--foreground))" }}>{opt.label}</span>
                          <p className="mt-1.5 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{opt.blurb}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 3 && (
                buildStuck ? (
                  <BuildStuckNotice
                    onRetry={() => {
                      setBuildStuck(false);
                      advanceBuildRef.current = false;
                      void runGeneration();
                    }}
                    onBack={() => setStep(2)}
                  />
                ) : (
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
                )
              )}

              {step === 4 && (
                <div className="mx-auto max-w-2xl">
                  <div className="text-center">
                    <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ borderColor: "hsl(var(--ck-action) / 0.4)", color: "hsl(var(--ck-action-bright))" }}>
                      <Check className="h-3 w-3" /> {"Draft · not published yet"}
                    </span>
                    <h2 className="mt-3 text-2xl sm:text-3xl" style={{ fontFamily: DISPLAY, fontWeight: 500 }}>Here's your hiring plan.</h2>
                    <p className="mt-2 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Reorder, tweak, or remove anything — then publish.</p>
                    {/* The template stood in for the writer (it took too long or
                        failed): say so, the post is a plain first draft (the
                        Phase 7 product audit: only the header's colour told). */}
                    {genSource === "template" && (
                      <p className="mx-auto mt-3 max-w-md text-[13px]" style={{ color: "hsl(var(--ck-brass))" }}>
                        The job post is a short first draft this time. After you publish, read it on the job page and edit the wording from Jobs.
                      </p>
                    )}
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
                  {screeningCardCount === 0 && (
                    <p className="mt-4 text-center text-[13px]" style={{ color: "hsl(var(--ck-brass))" }}>
                      {NO_SCREENING_NOTE} Go back and I&rsquo;ll build the plan again.
                    </p>
                  )}
                </div>
              )}

              {step === 5 && publishedCode && (
                <div className="mx-auto flex max-w-md flex-col items-center text-center">
                  <span className="mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ background: "hsl(var(--ck-action) / 0.16)", color: "hsl(var(--ck-action-bright))" }}>
                    <Check className="h-3 w-3" /> Your job is live
                  </span>
                  <h2 className="mt-4 text-3xl sm:text-4xl" style={{ fontFamily: DISPLAY, fontWeight: 500 }}>Share your job.</h2>
                  <div className="mt-6 w-full rounded-2xl p-5" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "var(--shadow-lg)" }}>
                    <span className="flex items-center gap-1.5 text-left text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "hsl(var(--muted-foreground))" }}><Share2 className="h-3 w-3" /> Job page link</span>
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-xl px-3.5 py-3" style={{ background: "hsl(var(--ck-surface-2))", border: "1px solid hsl(var(--border))" }}>
                      <span className="truncate text-sm font-medium">{applyLink.replace(/^https?:\/\//, "")}</span>
                      <button type="button" onClick={() => void navigator.clipboard.writeText(applyLink).then(() => toast.success("Link copied"))} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </button>
                    </div>
                    <div className="mt-3 flex items-center gap-3.5">
                      {/* A real code for the same link (the run-through of 2026-10-31: a QR icon here looked scannable
                          and was not). Dark on paper in either theme, so a phone can read it. */}
                      <span className="shrink-0 rounded-xl p-1.5" style={{ background: "#F7F4EA", border: "1px solid hsl(var(--border))" }} data-done-qr>
                        <QRCodeSVG value={applyLink} size={84} bgColor="#F7F4EA" fgColor="#17150F" level="M" role="img" aria-label="QR code for the job page link" />
                      </span>
                      <div className="min-w-0 text-left">
                        <span className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>Job code</span>
                        <button type="button" onClick={() => void navigator.clipboard.writeText(publishedCode).then(() => toast.success("Code copied"))} className="mt-1 flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-xs font-semibold tracking-wider" style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--ck-action-bright))", border: "1px solid hsl(var(--primary) / 0.3)" }}>
                          {publishedCode} <Copy className="h-3 w-3 opacity-70" />
                        </button>
                        {/* What the code is for: the applicants' "Enter job code" page opens the job by it (ApplyWithCode). */}
                        <p className="mt-1.5 text-[12px] leading-snug" style={{ color: "hsl(var(--muted-foreground))" }} data-job-code-help>
                          For someone without the link: they type this code at {candidateOrigin().replace(/^https?:\/\//, "")}/candidate/apply to open this job.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex w-full flex-col gap-2.5">
                    {publishedRoleId && (
                      <a
                        href={jobPageUrl({ id: publishedRoleId, slug: publishedSlug, business_slug: ownBusiness?.slug ?? null })}
                        target="_blank"
                        // noopener, not noreferrer: the team's own look must
                        // say it came from the staff site, which the page
                        // counts leave out (the third growth review).
                        rel="noopener"
                        className="ck-btn ck-btn-primary w-full !text-[13px]"
                      >
                        See your job in action <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  <p className="mt-5 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                    <CountUp value={screeningCardCount} /> {screeningCardCount === 1 ? "step" : "steps"} for applicants · they apply at <code className="text-[11px]">{applyLink.replace(/^https?:\/\//, "")}</code>
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

      <PublishPaymentDialog
        open={!!paymentJob}
        onOpenChange={(open) => {
          if (open || !paymentJob) return;
          const id = paymentJob.id;
          setPaymentJob(null);
          toast(PUBLISH_PAYMENT_WORDS.saved);
          navigate(`/jobs/${id}`);
        }}
        jobId={paymentJob?.id ?? null}
        jobTitle={paymentJob?.title}
        justSaved
        onPublishInstead={() => {
          const id = paymentJob?.id;
          setPaymentJob(null);
          if (id) navigate(`/jobs/edit/${id}`);
        }}
      />

      <EmailCheckDialog
        open={emailCheckOpen}
        onOpenChange={setEmailCheckOpen}
        email={user?.email}
        onConfirmed={() => {
          setEmailCheckOpen(false);
          const retry = emailCheckRetryRef.current;
          emailCheckRetryRef.current = null;
          void handlePublish(retry?.companyNameOverride);
        }}
      />

      {/* Business name required before publishing. Never a dead end — the
          plan Ava just built stays exactly as it is, and publishing
          continues the moment this is saved. */}
      {showCompanyNamePrompt && step === 4 && (
        <div className="relative z-10 px-4 pb-2 sm:px-6">
          <div className="ck-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center" style={{ borderTop: "3px solid hsl(var(--ck-brass) / 0.5)" }}>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                One more thing before this goes live
              </p>
              <p className="mt-0.5 text-[13px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                Your business name isn't on file — it's what candidates see instead of you.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={companyNameDraft}
                onChange={(e) => setCompanyNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSaveCompanyNameAndPublish();
                  }
                }}
                placeholder="e.g. Ridgeway Garage"
                autoFocus
                className="ck-input h-11 w-full px-3.5 sm:w-56"
              />
              <button
                type="button"
                onClick={() => void handleSaveCompanyNameAndPublish()}
                disabled={savingCompanyName || !companyNameDraft.trim()}
                className="ck-btn ck-btn-primary shrink-0 !px-4 !text-[13px]"
              >
                {savingCompanyName && <Loader2 className="h-4 w-4 animate-spin" />}
                Save &amp; publish
              </button>
            </div>
          </div>
        </div>
      )}

      {step !== 3 && step !== 5 && (
        <footer className="relative z-10 flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <button type="button" onClick={handleBack} disabled={step === 0} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-30" style={{ background: "hsl(var(--secondary))", border: "1px solid hsl(var(--border))" }}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <button
            type="button"
            disabled={publishing || (step === 4 && (!flow || screeningCardCount === 0))}
            title={step === 4 && flow && screeningCardCount === 0 ? NO_SCREENING_NOTE : undefined}
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
            {step === 2 ? <AvaSeal size={16} /> : <ArrowRight className="h-4 w-4" />}
          </button>
        </footer>
      )}
    </div>
  );
}
