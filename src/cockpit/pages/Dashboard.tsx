import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, isSameDay, startOfDay } from "date-fns";
import {
  ChevronRight,
  Check,
  Copy,
  Video,
  AlertCircle,
  Clock,
  Users,
  MessageSquare,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { clearDraft } from "@/lib/avaEngine/draft";
import { candidateApplyUrl } from "@/lib/showcaseApply";
import AvaSeal from "@/components/ava/AvaSeal";
import { useInterviews } from "@/hooks/useInterviews";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import CkAvatar from "../components/Avatar";
import { CountUp } from "../components/CountUp";
import { ActionDialog } from "../components/ActionDialog";
import {
  useCockpitAccount,
  useCockpitCandidates,
  useCockpitActions,
  useCockpitJobsData,
  advanceTargetLabel,
  avaAdvanceRec,
} from "../hooks/useCockpitData";
import { buildJourneyPipeline, type JourneyPipelineStage } from "../lib/mappers";
import { gemPosition } from "../lib/gemRail";
import type { Candidate } from "../data";

/**
 * The morning read.
 *
 * This screen answers one question: who is worth your time today. Ava says what
 * she did overnight in one line, then the people she sealed, each with the one
 * piece of evidence behind the score and the only two decisions that matter —
 * pass, or talk to them. Everything else is a link away.
 *
 * No hero graphic: the greeting carries the page.
 */

/** Real wax never sits square. A stable per-row tilt, so it does not jitter on re-render. */
const TILTS = [-6, 4, -3, 5, -4];

/** A dashboard-local read of one `interviews` row — just the fields "What
 *  needs you today" cares about (see interviewNeeds below). */
interface DashInterviewNeed {
  id: string;
  applicationId: string | null;
  name: string;
  role: string;
  at: Date;
  status: string;
  response: "confirmed" | "reschedule_requested" | "awaiting_pick" | "pending";
  meetingProvider: string | null;
  meetingLink: string | null;
}

/**
 * A person is only "sealed" once Ava has real screening signal on them. Until
 * then there is no seal, no number and no place on this page — the same test
 * the Applicants list uses to decide who gets a score and who gets a dash.
 */
function isAnalyzed(c: Candidate): boolean {
  return (c.overall ?? 0) > 0 || c.quiz != null || c.voice != null;
}

/**
 * Ava files her report with section headers and markdown emphasis. The employer
 * should read her sentences, not the scaffolding, so the marks are stripped and
 * the bare headers dropped. Display only — the stored record is untouched.
 */
function avaProse(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .split(/\n+/)
    .map((line) => line.replace(/\*\*/g, "").replace(/^[-–—•*]+\s*/, "").trim())
    .filter((line) => line.length > 2 && !/^[A-Z0-9 ,/&'()-]+:?$/.test(line))
    .join(" ")
    .trim();
}

/** Cut at a sentence end where there is one, a word boundary otherwise — never mid-word. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (sentence > max * 0.45) return cut.slice(0, sentence + 1).trim();
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 0 ? space : max).trimEnd()}…`;
}

function greeting(now: Date) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Greet a person by their first name; greet a business by its whole name.
 * Splitting on the first word turns "Ridgeway Garage" into "Ridgeway" — wrong
 * but survivable — and the generic "Your business" placeholder into "Your",
 * which reads as broken. Returns null when we have nothing worth saying.
 */
function greetingName(fullName: string | null | undefined, company: string) {
  const person = fullName?.trim();
  if (person) return person.split(/\s+/)[0];
  const business = company.trim();
  if (!business || /^your business$/i.test(business)) return null;
  return business;
}

function SealedRow({
  candidate,
  index,
  showRole,
  advanceLabel,
  onPass,
  onAdvance,
  onOpen,
  busy,
}: {
  candidate: Candidate;
  index: number;
  /** The role only earns the meta line when the sealed three span more than one job. */
  showRole: boolean;
  /** The stage this person lands in, so the button never says something vague. */
  advanceLabel: string | null;
  onPass: () => void;
  onAdvance: () => void;
  onOpen: () => void;
  busy: boolean;
}) {
  // One finished sentence of Ava's evidence — never her raw report.
  const why = clip(avaProse(candidate.readFull) || candidate.read, 120);

  return (
    <div className="ck-card ck-reveal px-4 py-3" style={{ ["--ck-i" as string]: 2 + index }}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {/* who */}
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-3 text-left min-[621px]:flex-none min-[621px]:basis-[210px]"
        >
          <span className="relative shrink-0">
            <CkAvatar who={candidate.name} size={40} />
            {/* The stamp comes DOWN — overshoot into the paper, settle. Rows
                seal one after the next, which is the whole product in 1.5s. */}
            <span
              className="ck-seal ck-seal-press absolute"
              style={{ right: -6, bottom: -6, ["--press-delay" as string]: `${350 + index * 260}ms` }}
            >
              <AvaSeal size={20} tilt={TILTS[index % TILTS.length]} />
            </span>
          </span>
          <span className="min-w-0">
            <span
              className="block truncate text-[14px] font-semibold leading-[1.3]"
              style={{ color: "var(--hf-text)" }}
            >
              {candidate.name}
            </span>
            {/* What tells these three apart — not the role they all applied to. */}
            <span
              className="block truncate text-[12px] leading-[1.35]"
              style={{ color: "var(--hf-text-muted)" }}
            >
              {showRole ? `${candidate.role} · ${candidate.appliedAgo}` : candidate.appliedAgo}
            </span>
          </span>
        </button>

        {/* why — Ava's evidence. On a phone it sits above the decision, never under it. */}
        <p
          className="min-w-0 flex-1 border-l-2 pl-[14px] text-[13px] leading-[1.5] max-[620px]:order-3 max-[620px]:basis-full max-[620px]:border-l-0 max-[620px]:pl-0"
          style={{ color: "var(--hf-text-soft)", borderColor: "var(--hf-gold-border)" }}
        >
          {why}
        </p>

        {/* the score — Ava's verdict, and the one jade thing on the row */}
        <div className="min-w-[58px] shrink-0 text-right">
          <div
            className="ck-num font-semibold"
            style={{ fontSize: 38, lineHeight: 0.85, color: "var(--jade)" }}
          >
            <CountUp value={candidate.overall} duration={700} delay={350 + index * 260} />
          </div>
          <div
            className="mt-[5px] text-[10px] font-bold uppercase leading-[1.2] tracking-[0.08em]"
            style={{ color: "var(--hf-text-muted)" }}
          >
            Sealed
          </div>
        </div>

        {/* the only two decisions */}
        <div className="flex shrink-0 items-center gap-2 max-[620px]:order-4 max-[620px]:w-full max-[620px]:justify-end">
          <button className="ck-btn ck-btn-outline !py-2 !text-[13px]" onClick={onPass} disabled={busy}>
            Pass
          </button>
          {advanceLabel && (
            <button className="ck-btn ck-btn-primary !py-2 !text-[13px]" onClick={onAdvance} disabled={busy}>
              {advanceLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The very first thing a new owner sees on this screen, ever. No morning
 * read exists yet — there is nothing to read. So the whole content area
 * becomes one letterhead-style moment: Ava's mark, her voice, one door in.
 * Nothing else on the page competes for the click.
 */
function FirstJobGuide({ onStart }: { onStart: () => void }) {
  return (
    <section
      className="ck-card ck-reveal flex flex-col items-start gap-5 p-8 text-left md:p-12"
      style={{ ["--ck-i" as string]: 1, borderTop: "3px solid var(--hf-gold-border)" }}
    >
      <span className="ck-seal-breathe">
        <AvaSeal size={48} />
      </span>
      <div className="max-w-[56ch]">
        <h2
          className="font-display"
          style={{ fontSize: "clamp(22px, 2.6vw, 30px)", lineHeight: 1.2, color: "var(--hf-text)", fontWeight: 500 }}
        >
          Let&rsquo;s post your first job.
        </h2>
        <p className="mt-3 text-[15px] leading-[1.6]" style={{ color: "var(--hf-text-soft)" }}>
          Tell me who you need and I&rsquo;ll handle the rest — writing the posting, screening every
          applicant, and sealing the ones worth your time right here.
        </p>
      </div>
      <button className="ck-btn ck-btn-primary !px-6 !py-3 !text-[15px]" onClick={onStart}>
        Post your first job
        <ChevronRight className="h-4 w-4" />
      </button>
    </section>
  );
}

/**
 * A job exists but nobody has applied yet — the in-between moment. The
 * owner's one job here is to get the link in front of people; Ava's is to
 * wait. One primary action (copy the link), one natural next step (see it
 * the way a candidate would).
 */
function LiveJobGuide({
  job,
  onView,
}: {
  job: { id: string; title: string; roleCode: string | null };
  onView: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const applyUrl = job.roleCode ? candidateApplyUrl(job.roleCode) : `${window.location.origin}/candidate/job/${job.id}`;

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(applyUrl);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  }, [applyUrl]);

  return (
    <section
      className="ck-card ck-reveal flex flex-col items-start gap-5 p-8 text-left md:p-12"
      style={{ ["--ck-i" as string]: 1, borderTop: "3px solid var(--hf-gold-border)" }}
    >
      <span className="ck-seal-breathe">
        <AvaSeal size={48} />
      </span>
      <div className="max-w-[56ch]">
        <h2
          className="font-display"
          style={{ fontSize: "clamp(22px, 2.6vw, 30px)", lineHeight: 1.2, color: "var(--hf-text)", fontWeight: 500 }}
        >
          {job.title} is live.
        </h2>
        <p className="mt-3 text-[15px] leading-[1.6]" style={{ color: "var(--hf-text-soft)" }}>
          Share this link anywhere people will see it. The moment someone applies, I read them and
          seal them right here — scored, with the evidence behind it.
        </p>
      </div>
      <div
        className="flex w-full max-w-[56ch] flex-wrap items-center gap-3 rounded-[10px] px-4 py-3"
        style={{ background: "var(--hf-surface-strong)", border: "1px solid var(--line)" }}
      >
        <span
          className="min-w-0 flex-1 truncate text-[13px]"
          style={{ color: "var(--hf-text)", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}
        >
          {applyUrl}
        </span>
        <button className="ck-btn ck-btn-primary shrink-0 !py-2 !text-[13px]" onClick={() => void copy()}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <button
        type="button"
        className="text-[13px] font-semibold transition-opacity hover:opacity-75"
        style={{ color: "var(--hf-gold)" }}
        onClick={onView}
      >
        See it the way a candidate does →
      </button>
    </section>
  );
}

/* ── What needs you today ──────────────────────────────────────────────
   The single most valuable thing this page can do: a short, honest checklist
   of the real things waiting on the employer right now — never a projection,
   never an invented suggestion. Each row is real data, and each row's action
   goes straight to the thing. */

type NeedTone = "jade" | "brass" | "muted";

const NEED_TONE_COLOR: Record<NeedTone, string> = {
  jade: "var(--jade)",
  brass: "var(--brass)",
  muted: "var(--hf-text-muted)",
};

function NeedsRow({
  icon: Icon,
  tone,
  title,
  meta,
  actionLabel,
  onOpen,
  onAction,
  index,
}: {
  icon: typeof Video;
  tone: NeedTone;
  title: string;
  meta?: string;
  actionLabel?: string;
  onOpen: () => void;
  /** Defaults to `onOpen` when the action button does the same thing as the row. */
  onAction?: () => void;
  index: number;
}) {
  return (
    <div
      className="ck-card ck-reveal flex flex-wrap items-center gap-3 p-4"
      style={{ ["--ck-i" as string]: index }}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{ background: `color-mix(in srgb, ${NEED_TONE_COLOR[tone]} 14%, transparent)` }}
      >
        <Icon className="h-4 w-4" style={{ color: NEED_TONE_COLOR[tone] }} aria-hidden />
      </span>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block text-[14px] font-semibold" style={{ color: "var(--hf-text)" }}>
          {title}
        </span>
        {meta && (
          <span className="block text-[12.5px]" style={{ color: "var(--hf-text-muted)" }}>
            {meta}
          </span>
        )}
      </button>
      {actionLabel && (
        <button
          className="ck-btn ck-btn-primary !py-2 !text-[13px]"
          onClick={onAction ?? onOpen}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/**
 * The very first applicant an employer's account has ever had, once — a
 * quiet, dismissible moment, not a confetti cannon. Shown only while there is
 * exactly one applicant ever recorded, and never again once dismissed
 * (remembered per-applicant in localStorage, same pattern Interviews.tsx uses
 * for its own once-only "picked" state).
 */
function FirstApplicantMoment({
  candidate,
  analyzed,
  onOpen,
  onDismiss,
}: {
  candidate: Candidate;
  analyzed: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <section
      className="ck-card ck-reveal relative flex flex-col items-start gap-4 p-6 text-left md:p-8"
      style={{ ["--ck-i" as string]: 0, borderTop: "3px solid var(--hf-gold-border)" }}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full transition-opacity hover:opacity-70"
        style={{ color: "var(--hf-text-muted)" }}
      >
        <X className="h-4 w-4" />
      </button>
      <span className="ck-seal-breathe">
        <AvaSeal size={40} />
      </span>
      <div className="max-w-[56ch] pr-8">
        <h2
          className="font-display"
          style={{ fontSize: "clamp(20px, 2.4vw, 26px)", lineHeight: 1.25, color: "var(--hf-text)", fontWeight: 500 }}
        >
          Your first applicant is in.
        </h2>
        <p className="mt-2 text-[14.5px] leading-[1.6]" style={{ color: "var(--hf-text-soft)" }}>
          {analyzed
            ? `${candidate.name} applied to ${candidate.role} — and I've already read them. Here's what I found.`
            : `${candidate.name} just applied to ${candidate.role}. I'm reading them now — the moment I'm done, you'll see them here.`}
        </p>
      </div>
      <button className="ck-btn ck-btn-primary !px-5 !py-2.5 !text-[14px]" onClick={onOpen}>
        {analyzed ? `See ${candidate.name.split(/\s+/)[0]}` : "View their application"}
        <ChevronRight className="h-4 w-4" />
      </button>
    </section>
  );
}

/**
 * "Pipeline at a glance" — a compact, aggregate miniature of the applicant
 * journey rail (see JourneyStrip in Applicants.tsx): every real phase from
 * `buildJourneyPipeline`, in order, each a small gem node holding its real
 * count. An occupied phase (count > 0) lights up at its position on the
 * jade→mint→teal→gold spectrum; an empty one stays hollow and quiet — still
 * drawn, because "nobody's here yet" is real information. Counts only — no
 * percentage, which would read as a conversion rate against total applicants
 * when it is really just a share of current occupants, a different and
 * misleading thing. Nodes flex evenly so the whole track is always visible
 * at any width, never clipped or scrolled.
 */
function MiniJourneyRail({ stages }: { stages: JourneyPipelineStage[] }) {
  const total = stages.length;
  // Nodes are evenly-flexed columns, so node i's dot sits at the CENTER of
  // its column — (i + 0.5) / total of the rail's width, not at its edge. A
  // fixed-pixel inset overshoots past the first/last dot as soon as there
  // are only a few, widely-spaced nodes (exactly the bug the design review
  // caught). Inset by that same fraction instead, so the track always runs
  // from the first dot's center to the last dot's, whatever `total` is.
  const inset = total > 0 ? `${(50 / total).toFixed(3)}%` : "50%";
  return (
    <div className="ck-mini-rail">
      <div className="ck-mini-rail-track" style={{ left: inset, right: inset }} aria-hidden />
      <div className="ck-mini-rail-nodes">
        {stages.map((stage, i) => {
          const active = stage.count > 0;
          const { color, ink } = gemPosition(i, total);
          return (
            <div key={stage.key} className={`ck-mini-rail-node${active ? " is-active" : ""}`}>
              <div
                className="ck-mini-rail-dot"
                style={active ? { ["--node-color" as string]: color, ["--node-ink" as string]: ink } : undefined}
              >
                {stage.count}
              </div>
              <div className="ck-mini-rail-label">{stage.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CockpitDashboard() {
  const navigate = useNavigate();
  const { account, profile } = useCockpitAccount();
  const { candidates, applications, isLoading } = useCockpitCandidates();
  const { advance, reject, isUpdating } = useCockpitActions();
  const { jobs, isLoading: jobsLoading } = useCockpitJobsData();
  const { data: interviewRows = [] } = useInterviews();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();

  /* Both decisions reach the candidate by email. This is the screen an owner
     skims half-awake, so neither one goes through on a single stray click —
     same confirm, same words, as the Applicants page. */
  const [actionDialog, setActionDialog] = useState<{ type: "pass" | "advance"; cand: Candidate } | null>(null);

  const liveJob = jobs.find((j) => j.status === "live") ?? null;
  const liveJobsCount = useMemo(() => jobs.filter((j) => j.status === "live").length, [jobs]);

  // No jobs at all vs. a job with nobody in it yet are two different first
  // moments — the first needs Ava's pitch, the second needs the link.
  const featuredJob = liveJob ?? jobs[0] ?? null;
  const hasNoJobs = !jobsLoading && jobs.length === 0;
  const hasJobsNoApplicants = !jobsLoading && jobs.length > 0 && candidates.length === 0;

  const now = useMemo(() => new Date(), []);
  const startOfToday = useMemo(() => startOfDay(now), [now]);
  const who = greetingName(profile?.full_name, account.name);

  /* ── Interview needs, read off the real rows the same way Interviews.tsx
     does: `candidate_response` tells you whether a scheduled slot is
     confirmed, still waiting on the candidate to pick, or the candidate
     asked for a different time; a 'scheduled' row whose day has already
     passed needs its outcome marked. Only a confirmed, Daily-hosted slot
     within 15 minutes of start is actually joinable. */
  const interviewNeeds = useMemo(() => {
    const rows: DashInterviewNeed[] = interviewRows.map((row) => {
      const profile = row.applications?.profiles;
      const v2 = row as unknown as { meeting_provider?: string | null };
      const response =
        row.candidate_response === "confirmed"
          ? ("confirmed" as const)
          : row.candidate_response === "reschedule_requested"
            ? ("reschedule_requested" as const)
            : row.candidate_response === "awaiting_pick"
              ? ("awaiting_pick" as const)
              : ("pending" as const);
      return {
        id: row.id,
        applicationId: row.applications?.id ?? null,
        name: profile?.full_name?.trim() || profile?.email || "Candidate",
        role: row.applications?.jobs?.title ?? "Role",
        at: new Date(row.scheduled_at),
        status: row.status,
        response,
        meetingProvider: v2.meeting_provider ?? null,
        meetingLink: row.meeting_link ?? null,
      };
    });

    const scheduled = rows.filter((r) => r.status === "scheduled");
    return {
      today: scheduled
        .filter((r) => r.response === "confirmed" && isSameDay(r.at, now))
        .sort((a, b) => a.at.getTime() - b.at.getTime()),
      overdue: scheduled.filter((r) => r.at < startOfToday),
      awaitingPick: scheduled.filter((r) => r.response === "awaiting_pick"),
      reschedule: scheduled.filter((r) => r.response === "reschedule_requested"),
    };
  }, [interviewRows, now, startOfToday]);

  const canJoinDaily = useCallback(
    (r: DashInterviewNeed) => r.meetingProvider === "daily" && r.at.getTime() - now.getTime() <= 15 * 60 * 1000,
    [now],
  );

  /** The real pipeline status, so Advance moves them one stage — not back to the start. */
  const statusById = useMemo(() => {
    const m: Record<string, string> = {};
    applications.forEach((a) => {
      m[a.id] = (a as { status?: string }).status ?? "";
    });
    return m;
  }, [applications]);
  const statusOf = (id: string) => statusById[id] || undefined;

  const { sealed, awaitingDecision, passedOver, readCount, hired, stillReading, multiRole } = useMemo(() => {
    // Only people Ava has actually finished get ranked, sealed or counted.
    const analyzed = candidates.filter(isAnalyzed);
    // A decision you have already made is not one waiting on you today, so
    // people who are hired or passed do not belong in the shortlist.
    const live = analyzed.filter((c) => c.stage !== "Rejected" && c.stage !== "Hired");
    const top = [...live].sort((a, b) => b.overall - a.overall).slice(0, 3);
    return {
      sealed: top,
      awaitingDecision: live.length,
      passedOver: candidates.filter((c) => c.stage === "Rejected").length,
      readCount: analyzed.length,
      hired: candidates.filter((c) => c.stage === "Hired").length,
      stillReading: candidates.filter((c) => !isAnalyzed(c) && c.stage !== "Rejected").length,
      multiRole: new Set(top.map((c) => c.role)).size > 1,
    };
  }, [candidates]);

  // Pipeline at a glance — the exact same journey vocabulary and position
  // logic the Applicants panel's journey strip uses (src/lib/candidateJourney.ts),
  // never a separate hand-picked set of stage names.
  const pipelineNodes = useMemo(() => buildJourneyPipeline(applications), [applications]);

  // The very first applicant this account has ever had, once. Dismissed
  // permanently (per-applicant) in localStorage — the same once-only pattern
  // Interviews.tsx uses for its "picked" state — so it never comes back once
  // closed, and never re-triggers once a second applicant arrives.
  const firstApplicant = candidates.length === 1 ? candidates[0] : null;
  const [firstApplicantDismissed, setFirstApplicantDismissed] = useState(true);
  useEffect(() => {
    if (!firstApplicant) return;
    try {
      setFirstApplicantDismissed(!!window.localStorage.getItem(`ck-first-applicant-seen:${firstApplicant.id}`));
    } catch {
      setFirstApplicantDismissed(false);
    }
  }, [firstApplicant?.id]);
  const dismissFirstApplicant = () => {
    if (firstApplicant) {
      try {
        window.localStorage.setItem(`ck-first-applicant-seen:${firstApplicant.id}`, "1");
      } catch {
        // Private mode / storage blocked — it just won't remember across a reload.
      }
    }
    setFirstApplicantDismissed(true);
  };

  const startRole = () => {
    clearDraft();
    sessionStorage.removeItem("ava-create-active");
    navigate("/jobs/create");
  };

  const confirmPass = async (reason?: string) => {
    if (!actionDialog) return;
    await reject(actionDialog.cand.id, reason);
    setActionDialog(null);
  };
  const confirmAdvance = async () => {
    if (!actionDialog) return;
    await advance(actionDialog.cand.id, statusOf(actionDialog.cand.id));
    setActionDialog(null);
  };

  if (isLoading || jobsLoading) {
    return (
      <div className="space-y-4">
        <div className="ck-reveal h-[52px] rounded-xl" style={{ background: "var(--hf-surface)", opacity: 0.55 }} />
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="ck-card ck-reveal h-[66px]"
              style={{ ["--ck-i" as string]: i, opacity: 0.55 }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── The greeting carries the page ─────────────────── */}
      <header className="ck-rise flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1
            className="font-display ck-ink"
            style={{ fontSize: "clamp(26px, 3.2vw, 38px)", lineHeight: 1.1, color: "var(--hf-text)", fontWeight: 500 }}
          >
            {greeting(now)}{who ? `, ${who}` : ""}.
          </h1>
          <span className="text-[14px]" style={{ color: "var(--hf-text-muted)" }}>
            {format(now, "EEEE, MMM d")}
          </span>
        </div>
        {!hasNoJobs && (
          <button className="ck-btn ck-btn-primary !py-2 !text-[13.5px]" onClick={startRole}>
            + New job
          </button>
        )}
      </header>

      {/* ── The first applicant an account has ever had, once. ── */}
      {firstApplicant && !firstApplicantDismissed && (
        <FirstApplicantMoment
          candidate={firstApplicant}
          analyzed={isAnalyzed(firstApplicant)}
          onOpen={() => navigate(`/applicants/${firstApplicant.id}`)}
          onDismiss={dismissFirstApplicant}
        />
      )}

      {hasNoJobs ? (
        /* ── The very first moment. One door in, nothing else asking. ── */
        <FirstJobGuide onStart={startRole} />
      ) : hasJobsNoApplicants && featuredJob ? (
        /* ── The job is out there. Ava is just waiting on the world. ── */
        <LiveJobGuide job={featuredJob} onView={() => navigate(`/candidate/job/${featuredJob.id}`)} />
      ) : (
        <>
          {/* ── What needs you today — the single most valuable thing this
              page can do. Real items only; a truthful, warm line when there
              genuinely is nothing. ── */}
          {(() => {
            const rows: Array<{ key: string; node: JSX.Element }> = [];
            let i = 0;

            if (interviewNeeds.today.length === 1) {
              const r = interviewNeeds.today[0];
              const joinable = canJoinDaily(r);
              const external = r.response === "confirmed" && r.meetingProvider !== "daily" && !!r.meetingLink;
              rows.push({
                key: "today",
                node: (
                  <NeedsRow
                    icon={Video}
                    tone="jade"
                    title={`${format(r.at, "h:mm a")} — ${r.name}`}
                    meta={`${r.role} · today`}
                    actionLabel={joinable || external ? "Join" : "View"}
                    onOpen={() => navigate("/interviews")}
                    onAction={() => {
                      if (joinable) navigate(`/interviews/${r.id}/room`);
                      else if (external) window.open(r.meetingLink as string, "_blank", "noopener,noreferrer");
                      else navigate("/interviews");
                    }}
                    index={i++}
                  />
                ),
              });
            } else if (interviewNeeds.today.length > 1) {
              rows.push({
                key: "today",
                node: (
                  <NeedsRow
                    icon={Video}
                    tone="jade"
                    title={`${interviewNeeds.today.length} interviews today`}
                    meta={`starting at ${format(interviewNeeds.today[0].at, "h:mm a")}`}
                    actionLabel="View"
                    onOpen={() => navigate("/interviews")}
                    index={i++}
                  />
                ),
              });
            }

            if (interviewNeeds.overdue.length > 0) {
              rows.push({
                key: "overdue",
                node: (
                  <NeedsRow
                    icon={AlertCircle}
                    tone="brass"
                    title={`${interviewNeeds.overdue.length} ${interviewNeeds.overdue.length === 1 ? "interview needs" : "interviews need"} an outcome marked`}
                    meta="Past their scheduled time — say what happened"
                    actionLabel="Review"
                    onOpen={() => navigate("/interviews")}
                    index={i++}
                  />
                ),
              });
            }

            if (interviewNeeds.reschedule.length > 0) {
              rows.push({
                key: "reschedule",
                node: (
                  <NeedsRow
                    icon={Clock}
                    tone="brass"
                    title={`${interviewNeeds.reschedule.length} ${interviewNeeds.reschedule.length === 1 ? "candidate asked" : "candidates asked"} for a different time`}
                    meta="Your held slot is still open — pick a new one"
                    actionLabel="Review"
                    onOpen={() => navigate("/interviews")}
                    index={i++}
                  />
                ),
              });
            }

            if (awaitingDecision > 0) {
              rows.push({
                key: "decision",
                node: (
                  <NeedsRow
                    icon={Users}
                    tone="jade"
                    title={`${awaitingDecision} ${awaitingDecision === 1 ? "applicant is" : "applicants are"} waiting on your decision`}
                    meta="Sealed and ranked — pass, or move them forward"
                    actionLabel="Review"
                    onOpen={() => navigate("/applicants")}
                    index={i++}
                  />
                ),
              });
            }

            if (interviewNeeds.awaitingPick.length > 0) {
              rows.push({
                key: "awaiting-pick",
                node: (
                  <NeedsRow
                    icon={Clock}
                    tone="muted"
                    title={`${interviewNeeds.awaitingPick.length} interview ${interviewNeeds.awaitingPick.length === 1 ? "time is" : "times are"} waiting on the candidate`}
                    meta="You'll hear the moment they pick a time"
                    actionLabel="View"
                    onOpen={() => navigate("/interviews")}
                    index={i++}
                  />
                ),
              });
            }

            if (unreadMessages > 0) {
              rows.push({
                key: "messages",
                node: (
                  <NeedsRow
                    icon={MessageSquare}
                    tone="jade"
                    title={`${unreadMessages} unread ${unreadMessages === 1 ? "message" : "messages"}`}
                    meta="From candidates you're talking with"
                    actionLabel="Open"
                    onOpen={() => navigate("/messages")}
                    index={i++}
                  />
                ),
              });
            }

            return (
              <section>
                <h2 className="font-display mb-2 text-[16px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
                  What needs you today
                </h2>
                {rows.length > 0 ? (
                  <div className="flex flex-col gap-2">{rows.map((r) => <div key={r.key}>{r.node}</div>)}</div>
                ) : (
                  <div className="ck-card-flat ck-reveal flex items-center gap-3 px-4 py-3">
                    <AvaSeal size={22} />
                    <p className="text-[13.5px]" style={{ color: "var(--hf-text-soft)" }}>
                      <span style={{ color: "var(--hf-text)", fontWeight: 600 }}>Nothing needs you right now.</span>{" "}
                      I&rsquo;m still reading and watching — anything that needs a decision will show up here the
                      moment it does.
                    </p>
                  </div>
                )}
              </section>
            );
          })()}

          {/* ── Pipeline at a glance — the real journey vocabulary, real
              counts. Only worth a section once there is a live pipeline to
              show. ── */}
          {pipelineNodes.length > 0 && (
            <section className="ck-card ck-reveal p-4 md:p-5">
              <h2 className="font-display text-[16px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
                Pipeline at a glance
              </h2>
              {liveJobsCount > 0 && (
                <p className="mt-1 text-[13px]" style={{ color: "var(--hf-text-muted)" }}>
                  {liveJobsCount} live {liveJobsCount === 1 ? "role" : "roles"} open. Every applicant gets read,
                  scored, and sealed here the moment they apply — nobody sits waiting to be noticed.
                </p>
              )}
              <div className="mt-3">
                <MiniJourneyRail stages={pipelineNodes} />
              </div>
            </section>
          )}

          {/* ── What Ava did, in one line. Only once she has read someone. ── */}
          {readCount > 0 && (
            <section
              className="ck-rise flex items-center gap-3 rounded-[10px] px-[15px] py-[11px]"
              style={{
                background: "var(--slab)",
                color: "var(--slab-ink)",
                /* In Night the slab sits ~1.2:1 off the ground — the shadow's inset
                   hairline is the only thing that draws the panel's top edge. */
                boxShadow: "var(--shadow-md)",
                border: "1px solid transparent",
              }}
            >
              <span className="ck-seal-breathe shrink-0">
                <AvaSeal size={26} />
              </span>
              <p
                className="min-w-0 flex-1 text-[13px] min-[901px]:truncate max-[900px]:line-clamp-2 max-[900px]:text-[12px] max-[900px]:leading-[1.35]"
                style={{ color: "var(--slab-ink-2)" }}
              >
                <span className="font-semibold" style={{ color: "var(--slab-ink)" }}>
                  Ava has been working.
                </span>{" "}
                Read{" "}
                <span className="ck-num font-semibold" style={{ color: "var(--jade-bright)" }}>
                  {readCount}
                </span>{" "}
                {readCount === 1 ? "applicant" : "applicants"}
                {sealed.length > 0 && (
                  <>
                    {" · sealed "}
                    <span className="ck-num font-semibold" style={{ color: "var(--jade-bright)" }}>
                      {sealed.length}
                    </span>
                  </>
                )}
                {" — none of your time, nobody left waiting."}
              </p>
              {/* One tick per person read — lighting up in sequence, then a
                  slow idle shimmer. Ava never reads as past-tense. */}
              <span className="ck-ticker ml-auto hidden shrink-0 min-[901px]:flex" aria-hidden>
                {Array.from({ length: Math.min(readCount, 28) }, (_, i) => (
                  <i key={i} style={{ ["--i" as string]: i }} />
                ))}
              </span>
            </section>
          )}

          {/* ── The people worth your time — one tight, ranked list ───────── */}
          {sealed.length > 0 ? (
            <div className="flex flex-col gap-2">
              {sealed.map((c, i) => (
                <SealedRow
                  key={c.id}
                  candidate={c}
                  index={i}
                  showRole={multiRole}
                  advanceLabel={advanceTargetLabel(statusOf(c.id))}
                  busy={isUpdating}
                  onOpen={() => navigate(`/applicants/${c.id}`)}
                  onPass={() => setActionDialog({ type: "pass", cand: c })}
                  onAdvance={() => setActionDialog({ type: "advance", cand: c })}
                />
              ))}
            </div>
          ) : (
            stillReading > 0 && (
              /* Applicants are in, but none are finished. No seal, no number, no rank. */
              <section className="ck-card ck-reveal p-6 md:p-8" style={{ ["--ck-i" as string]: 1 }}>
                <h2 className="font-display text-[20px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
                  I&rsquo;m still reading.
                </h2>
                <p className="mt-2 max-w-[52ch] text-[14px]" style={{ color: "var(--hf-text-soft)" }}>
                  {stillReading} {stillReading === 1 ? "person is" : "people are"} in the queue. The moment
                  I finish one, they land here with a score and the evidence behind it.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button className="ck-btn ck-btn-outline" onClick={() => navigate("/applicants")}>
                    See everyone who applied
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </section>
            )
          )}

          {passedOver > 0 && (
            <div className="ck-card-flat ck-reveal flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <p className="text-[13.5px]" style={{ color: "var(--hf-text-soft)" }}>
                <span style={{ color: "var(--hf-text)", fontWeight: 600 }}>
                  {passedOver} {passedOver === 1 ? "looks" : "look"} like a pass to Ava
                </span>{" "}
                — your call. The moment you confirm, a polite reply goes out in your name.
              </p>
              <button
                className="text-[13px]"
                style={{ color: "var(--hf-gold)" }}
                onClick={() => navigate("/applicants")}
              >
                Review them →
              </button>
            </div>
          )}


          {/* ── The record, only when there is one ─────────── */}
          {hired > 0 && (
            <div className="ck-card-flat flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <p className="text-[13.5px]" style={{ color: "var(--hf-text-soft)" }}>
                <span style={{ color: "var(--hf-text)", fontWeight: 600 }}>Your record:</span>{" "}
                {hired} {hired === 1 ? "hire" : "hires"} made through HireFlow.
              </p>
              <button
                className="text-[13px]"
                style={{ color: "var(--hf-gold)" }}
                onClick={() => navigate("/analytics")}
              >
                See analytics →
              </button>
            </div>
          )}
        </>
      )}

      {actionDialog?.type === "advance" && (() => {
        const cand = actionDialog.cand;
        const label = advanceTargetLabel(statusOf(cand.id));
        const rec = avaAdvanceRec(cand.overall ?? 0, isAnalyzed(cand));
        return (
          <ActionDialog
            open
            title={`Advance ${cand.name}?`}
            description={label ? `This moves ${cand.name} into your ${label} stage and notifies them of the progress.` : `This moves ${cand.name} forward in your pipeline.`}
            confirmLabel={label ? `Move to ${label}` : "Advance"}
            tone="brass"
            busy={isUpdating}
            note={rec.text}
            noteTone={rec.tone}
            onConfirm={() => void confirmAdvance()}
            onClose={() => setActionDialog(null)}
          />
        );
      })()}
      <ActionDialog
        open={actionDialog?.type === "pass"}
        title={
          actionDialog
            ? statusOf(actionDialog.cand.id) === "offered"
              ? `Decline offer to ${actionDialog.cand.name}?`
              : `Pass on ${actionDialog.cand.name}?`
            : ""
        }
        description={
          actionDialog && statusOf(actionDialog.cand.id) === "offered"
            ? "This withdraws the offer and notifies the candidate. Add a short note for your records (optional)."
            : "This removes the candidate from your active pipeline and notifies them. Add a short note for your records (optional)."
        }
        confirmLabel={actionDialog && statusOf(actionDialog.cand.id) === "offered" ? "Decline offer" : "Pass candidate"}
        tone="danger"
        busy={isUpdating}
        withReason
        reasonLabel="Reason (optional, private to you)"
        reasonPlaceholder="e.g. Strong, but went with someone with more weekend availability."
        onConfirm={(reason) => void confirmPass(reason)}
        onClose={() => setActionDialog(null)}
      />
    </div>
  );
}
