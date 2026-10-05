import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Play,
  ExternalLink,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Mail,
  ListChecks,
  Keyboard,
  MessageCircle,
  AudioLines,
  Video,
  FileText,
} from "lucide-react";
import AvaSeal from "@/components/ava/AvaSeal";
import CkAvatar from "../components/Avatar";
import { ActionDialog } from "../components/ActionDialog";
import { ShareKitDialog } from "../components/ShareKitDialog";
import { CountUp } from "../components/CountUp";
import { HiringDocumentPromptDialog } from "@/components/HiringDocumentPromptDialog";
import { DocumentPreviewDialog } from "../components/DocumentPreviewDialog";
import InterviewSchedulingWizard from "@/components/InterviewSchedulingWizard";
import { SearchInput, FilterSelect, type FilterOption } from "../components/controls";
import { CockpitErrorCard } from "../components/ErrorCard";
import {
  useCockpitCandidates,
  useCockpitJobsData,
  useCockpitActions,
  nextAdvanceStatus,
  advanceTargetLabel,
  avaAdvanceRec,
} from "../hooks/useCockpitData";
import { getInitials, parseApplicationNotes } from "../lib/mappers";
import { GemRail } from "@/components/rail/GemRail";
import { candidateApplyUrl } from "@/lib/showcaseApply";
import { stepHasResult } from "@/lib/journeyProgress";
import { clearDraft } from "@/lib/avaEngine/draft";
import {
  buildCandidateJourney,
  nextJourneyStep,
  positionFor,
  DECISION_STAGE_ID,
  type WorkflowStepLike,
  type CandidateJourneyStep,
} from "@/lib/candidateJourney";
import type { Candidate, CandidateStage } from "../data";
import { candidateOrigin } from "@/lib/hosts";
import { ShareJobCompact } from "../components/ShareJobCard";
import { AssessmentRecordList } from "../components/AssessmentRecordList";
import { AssessmentRecordSheet } from "../components/AssessmentRecordSheet";
import {
  applicantBucket,
  applicantTab,
  applicantTabParam,
  buildAssessmentRecord,
  weighedPhrase,
  type ApplicantBucket,
  type AssessmentEntry,
  type AssessmentRecord,
} from "../lib/assessmentRecord";

/**
 * The people, and Ava's read on them.
 *
 * Two columns: on the left the field — everyone who applied to this job, each
 * one line, sealed ones first. On the right the person you picked, on Ava's
 * letterhead: the score she gave, their own words from the interview, the
 * evidence behind it, and where they are. Pass, or set up the interview.
 *
 * Every value on this screen comes off the application record. Where the record
 * is silent — no transcript, no quiz, no resume — the element is left out
 * rather than filled in. What they submitted, test by test, is one list
 * (AssessmentRecordList) built by one reader (lib/assessmentRecord.ts); each
 * finished test opens its full record in AssessmentRecordSheet.
 */

/** Real wax never sits square. A stable per-row tilt, so it does not jitter. */
const TILTS = [-6, 4, -3, 5, -4];

const PAGE_SIZE = 8;

/** The stage filter offers everything except Rejected — the tabs own that split. */
const STAGES: CandidateStage[] = ["Application", "Quiz", "Voice", "Shortlist", "Hired"];

/** Which side of the job a person is on. "reading" only exists while Ava works;
 *  "started" only while someone is still on the application form. */
type Bucket = ApplicantBucket;

/* ── Reading the real record ───────────────────────────────────────────────
   `applications` carries either a live hireflow row or a showcase row, so every
   field below is optional and read defensively. Nothing is inferred. */

interface AppRecord {
  id: string;
  status?: string;
  /** Real step id (or a pre-journey literal) once the candidate is mid-workflow —
   *  the most specific signal `positionFor` reads to place them on the strip. */
  phase?: string | null;
  created_at?: string;
  updated_at?: string;
  notes?: string | null;
  resume_url?: string | null;
  voice_interview_recording_url?: string | null;
  voice_interview_transcript?: unknown;
  voice_interview_result?: unknown;
  /** The job this application belongs to — already joined by `useEmployerApplications`
   *  (`jobs!inner(*)`), so `workflow_steps`/`quiz_questions` ride along for free.
   *  Absent in showcase mode, where the journey strip degrades to Application → Decision. */
  jobs?: { id?: string | null; workflow_steps?: unknown; quiz_questions?: unknown; passing_score?: number | null } | null;
  cover_letter?: string | null;
  ai_scorecard?: unknown;
}

interface TranscriptTurn {
  role?: string;
  content?: string;
  timestamp?: number | string;
}

function toMillis(value: number | string | undefined): number | null {
  if (value == null) return null;
  const ms = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function transcriptOf(app?: AppRecord): TranscriptTurn[] {
  const raw = app?.voice_interview_transcript;
  return Array.isArray(raw) ? (raw as TranscriptTurn[]) : [];
}

/** Measured length of the interview — the transcript's own clock, not a setting. */
function interviewMinutes(turns: TranscriptTurn[]): number | null {
  const first = toMillis(turns[0]?.timestamp);
  const last = toMillis(turns[turns.length - 1]?.timestamp);
  if (first == null || last == null || last <= first) return null;
  return Math.max(1, Math.round((last - first) / 60000));
}

function stampLabel(ms: number): string {
  const secs = Math.round(ms / 1000);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

/** Ava talks to the employer about a person, not a record — so she uses the
 *  name they'd say out loud. Same helper the other cockpit pages carry. */
function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (sentence > max * 0.45) return cut.slice(0, sentence + 1).trim();
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 0 ? space : max).trimEnd()}…`;
}

/**
 * Ava's full resume report (`ai_analysis`) is a structured document built for
 * the scoring engine — bold section headers, then mostly machine-readable
 * "Label: Value" diagnostic lines (`Status: VALID_RESUME`, `Confidence: 100%`,
 * `Name Match: MATCH`…). None of that is meant for an employer to read; the
 * report carries exactly two passages actually written as prose — the
 * "Summary:" line and the "SCORE EXPLANATION" section — so prefer those when
 * they're present. Anything else (a short decline note, a phase blurb) is
 * already plain prose and just needs markdown/bullet/header stripped.
 * Display only — the stored record is untouched.
 */
function extractLabeledLine(raw: string, label: string): string {
  const m = raw.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, "im"));
  return m ? m[1].replace(/\*\*/g, "").trim() : "";
}

function extractReportSection(raw: string, header: string): string {
  const m = raw.match(new RegExp(`\\*\\*${header}\\*\\*[^\\n]*\\n([\\s\\S]*?)(?:\\n\\*\\*|\\n---|$)`, "i"));
  if (!m) return "";
  return m[1]
    .split(/\n+/)
    .map((l) => l.replace(/\*\*/g, "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function avaProse(raw: string | null | undefined): string {
  if (!raw) return "";

  const summary = extractLabeledLine(raw, "Summary");
  const explanation = extractReportSection(raw, "SCORE EXPLANATION");
  const structuredProse = [summary, explanation].filter(Boolean).join(" ").trim();
  if (structuredProse) return structuredProse;

  // Not the structured resume-report template — it's already prose (a decline
  // note, a phase blurb). Just strip markdown emphasis, bullets, and any bare
  // ALL-CAPS section headers.
  return raw
    .split(/\n+/)
    .map((line) => line.replace(/\*\*/g, "").replace(/^[-–—•*]+\s*/, "").trim())
    .filter((line) => line.length > 2 && !/^[A-Z0-9 ,/&'()-]+:?$/.test(line))
    .join(" ")
    .trim();
}

/** The candidate's own words: their longest answer, quoted whole. */
function pullQuote(turns: TranscriptTurn[]): { text: string; at: string | null } | null {
  const answers = turns.filter(
    (t) => t.role === "user" && typeof t.content === "string" && t.content.trim().length > 40,
  );
  if (answers.length === 0) return null;
  const best = answers.reduce((a, b) => ((b.content?.length ?? 0) > (a.content?.length ?? 0) ? b : a));
  const start = toMillis(turns[0]?.timestamp);
  const spoken = toMillis(best.timestamp);
  return {
    text: clip(best.content!.trim().replace(/\s+/g, " "), 190),
    at: start != null && spoken != null && spoken >= start ? stampLabel(spoken - start) : null,
  };
}

/** A candidate has real screening signal once any score exists; until then we don't fake strengths.
 *  `candidate.analyzed` is the single source of truth for this (computed once in
 *  `mapCandidate`) — it must never be re-derived from `overall > 0` here, because a
 *  genuine finished score of 0 is a real result and has to read as one. */
function isAnalyzed(c: Candidate): boolean {
  return c.analyzed;
}

/** The rule itself lives in lib/assessmentRecord.ts, beside the one that picks
 *  the opening tab, so both are tested together. */
function bucketOf(c: Candidate): Bucket {
  return applicantBucket(c);
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

/** The 10px all-caps rule the spec uses for every small label. */
function Label({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="block text-[10px] font-bold uppercase leading-[1.2] tracking-[0.1em]"
      style={{ color }}
    >
      {children}
    </span>
  );
}

/** One person, one line: who, why, and the number. */
function PersonRow({
  candidate,
  index,
  selected,
  onSelect,
}: {
  candidate: Candidate;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const analyzed = isAnalyzed(candidate);
  // Ava's own decline recommendation, not the score, decides whether this row
  // reads as clean — a name mismatch behind an 85 must never look identical
  // to a genuine 85 in a list an employer is scanning fast.
  const needsReview = candidate.recommendedAction === "reject";
  // Someone on the application form has sent nothing yet: say that, and when
  // they started, rather than "Applied" or a screening line.
  const filling = !!candidate.fillingInForm;
  const why = filling
    ? `Filling in the form · ${lowerFirst(candidate.appliedAgo)}`
    : needsReview
      ? clip(candidate.hardRejectReason ? `Needs review — ${candidate.hardRejectReason}` : "Needs review", 64)
      : clip(avaProse(candidate.readFull) || candidate.read, 64);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={[
        "ck-reveal group flex w-[228px] shrink-0 items-center gap-[11px] rounded-[10px] border p-3 text-left",
        "transition-colors duration-150",
        selected
          ? ""
          : "border-[var(--line-soft)] bg-[var(--surface)] hover:border-[var(--hair)] min-[1160px]:border-transparent min-[1160px]:bg-transparent min-[1160px]:hover:border-[var(--line-soft)] min-[1160px]:hover:bg-[var(--surface)]",
        "min-[1160px]:w-auto",
      ].join(" ")}
      style={{
        ["--ck-i" as string]: index,
        ...(selected
          ? {
              borderColor: "var(--hair)",
              background: "var(--surface)",
              boxShadow: "var(--hf-shadow-raised)",
            }
          : {}),
      }}
    >
      <span className="relative shrink-0">
        <CkAvatar who={candidate.name} initials={getInitials(candidate.name)} size={36} />
        {analyzed && (
          <span className="absolute -bottom-[7px] -right-[7px] block transition-transform duration-150 group-hover:scale-[1.18]">
            <AvaSeal size={20} tilt={TILTS[index % TILTS.length]} />
          </span>
        )}
        {/* Quiet caution cue on the avatar itself — the one part of the row
            that reads at a glance even before the score or subtext do, and
            the only cue that survives on narrow widths where the subtext
            below is hidden. */}
        {needsReview && (
          <span
            aria-hidden
            className="absolute -top-[1px] -right-[1px] block h-[9px] w-[9px] rounded-full border"
            style={{ background: "var(--amber-fg)", borderColor: "var(--brass-line)" }}
          />
        )}
        {/* On the form right now — a live dot where the seal will land, the
            one cue that survives on a phone, where the line below is hidden. */}
        {filling && (
          <span aria-hidden className="ck-dot ck-dot-live absolute -bottom-[1px] -right-[1px] border-2" style={{ borderColor: "var(--surface)", width: 11, height: 11 }} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-[1.3]" style={{ color: "var(--ink)" }}>
          {candidate.name}
        </span>
        {needsReview && <span className="sr-only">Needs review</span>}
        {filling && <span className="sr-only">Filling in the form</span>}
        {why && (
          <span
            className="mt-[2px] hidden truncate text-[11px] min-[1160px]:block"
            style={{ color: needsReview ? "var(--amber-fg)" : "var(--ink-3)" }}
          >
            {why}
          </span>
        )}
      </span>

      <span
        className="ck-num ml-auto min-w-[34px] shrink-0 text-right text-[18px] font-semibold"
        style={{ color: needsReview ? "var(--amber-fg)" : analyzed ? "var(--jade)" : "var(--ink-3)" }}
      >
        {analyzed ? candidate.overall : "—"}
      </span>
    </button>
  );
}

/** How many of Ava's flags show before "Show all". */
const FLAGS_SHOWN = 3;

/** Ava's letterhead: brass rule, her mark, the score, and her working. */
function AvasRead({ candidate, app, record }: { candidate: Candidate; app?: AppRecord; record: AssessmentRecord | null }) {
  const analyzed = isAnalyzed(candidate);
  const turns = transcriptOf(app);
  const minutes = interviewMinutes(turns);
  const quote = pullQuote(turns);
  const recording = app?.voice_interview_recording_url ?? null;
  const prose = avaProse(candidate.readFull) || candidate.read;
  const [allFlags, setAllFlags] = useState(false);

  // Say what she actually weighed — everything this person has finished, read
  // off the same record the list below shows. Showcase rows carry no record;
  // they keep the old three-fact line.
  const finished = record ? weighedPhrase(record.entries) : null;
  const weighed = finished
    ? [finished]
    : ([
        turns.length > 0 || candidate.voice != null
          ? minutes != null
            ? `${minutes}-minute voice interview`
            : "voice interview"
          : null,
        candidate.quiz != null ? "skills check" : null,
        app?.resume_url ? "resume" : null,
      ].filter(Boolean) as string[]);

  // Every flag she raised, in her words — the deal-breaker line above already
  // carries one of them, so it is not said twice.
  const flags = (record?.riskFlags ?? candidate.riskFlags).filter((f) => f !== candidate.hardRejectReason);
  const shownFlags = allFlags ? flags : flags.slice(0, FLAGS_SHOWN);

  // Ava's own decline recommendation always surfaces here, in her own words,
  // no matter what the number says — a flagged candidate must never read as
  // clean just because the score looks good. Anything softer (no hard-reject
  // reason, just a middling or weak score) still gets the score-based nudge.
  const worthAsking =
    analyzed && candidate.recommendedAction === "reject"
      ? candidate.hardRejectReason
        ? `Ava recommends declining — ${candidate.hardRejectReason}`
        : "Ava recommends declining this one — the evidence collected so far is below the bar for this role."
      : analyzed && candidate.risk.level !== "Low"
        ? candidate.risk.level === "Medium"
          ? `${candidate.overall} puts them in the middle of your field — worth asking about the gaps`
          : `${candidate.overall} is below the people I sealed — worth asking before you spend an hour`
        : null;

  return (
    <div className="ck-card relative px-5 pb-4 pt-4">
      {/* the brass rule across the head of the letterhead */}
      <span
        aria-hidden
        className="absolute left-5 right-5 top-[9px] h-[2px] rounded-[1px]"
        style={{ background: "var(--brass-line)" }}
      />

      <div className="mt-1.5 flex items-center gap-[11px]">
        <span className="ck-seal ck-seal-press">
          <AvaSeal size={24} />
        </span>
        <span className="min-w-0">
          <Label color="var(--jade-soft-fg)">Ava&rsquo;s read</Label>
          <span className="mt-[3px] block text-[11px]" style={{ color: "var(--ink-3)" }}>
            {candidate.fillingInForm
              ? "Nothing sent yet"
              : weighed.length > 0
                ? `${weighed.join(", ")}, weighed against the job`
                : "Weighed against the job"}
          </span>
        </span>
        {analyzed && (
          <span
            className="ck-num ml-auto shrink-0 text-[38px] font-semibold leading-[0.85]"
            style={{ color: "var(--jade)" }}
          >
            <CountUp value={candidate.overall} duration={700} delay={150} />
            <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
              /100
            </span>
          </span>
        )}
      </div>

      {candidate.fillingInForm ? (
        <p className="mt-3.5 text-[13px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
          {firstName(candidate.name)} is filling in the application form right now. Nothing is sent until
          they submit it — the moment they do, I read it, and their answers land here.
        </p>
      ) : !analyzed ? (
        <p className="mt-3.5 text-[13px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
          I&rsquo;m still reading this one. The score and the evidence land here the moment
          screening finishes — you don&rsquo;t have to wait on the page.
        </p>
      ) : (
        <>
          {quote && (
            <figure className="mt-3.5">
              <blockquote
                className="font-display text-[20px] italic leading-[1.35]"
                style={{ color: "var(--ink)", letterSpacing: "-0.01em" }}
              >
                &ldquo;{quote.text}&rdquo;
              </blockquote>
              <figcaption className="mt-2 flex items-center gap-[9px]">
                {recording && (
                  <a
                    href={recording}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Play ${candidate.name}'s voice interview`}
                    className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full transition-transform duration-150 hover:scale-[1.08]"
                    style={{ background: "var(--jade-soft)", color: "var(--jade-soft-fg)" }}
                  >
                    <Play className="h-[11px] w-[11px]" fill="currentColor" strokeWidth={0} />
                  </a>
                )}
                <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                  {recording ? "Hear it — " : "From the "}
                  voice interview{quote.at ? `, ${quote.at}` : ""}
                </span>
              </figcaption>
            </figure>
          )}

          {prose && (
            <p className="mt-3 text-[13px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
              {clip(prose, 320)}
            </p>
          )}

          {/* Her working is said once, above, in full sentences — re-splitting
              it into a checklist here just repeated the same insight. What's
              worth a second callout is the one thing the paragraph doesn't
              already say: whether the score itself is worth raising. */}
          {worthAsking && (
            <>
              <div className="my-3 h-px" style={{ background: "var(--line-soft)" }} />
              <ul className="flex flex-col gap-2">
                <li
                  className="flex items-start gap-2.5 text-[13px] leading-[1.45]"
                  style={{ color: "var(--ink-2)" }}
                >
                  <AlertCircle
                    className="mt-[2px] h-3.5 w-3.5 shrink-0"
                    strokeWidth={2.3}
                    style={{ color: "var(--amber-fg)" }}
                    aria-hidden
                  />
                  <span>{worthAsking}</span>
                </li>
              </ul>
            </>
          )}

          {/* Everything else she flagged (ai_scorecard.riskFlags), verbatim —
              for the owner to weigh, never a stop on its own. */}
          {flags.length > 0 && (
            <>
              <div className="my-3 h-px" style={{ background: "var(--line-soft)" }} />
              <Label color="var(--ink-3)">What I flagged · {flags.length}</Label>
              <ul className="mt-2 flex flex-col gap-1.5">
                {shownFlags.map((flag) => (
                  <li key={flag} className="flex items-start gap-2.5 text-[12.5px] leading-[1.45]" style={{ color: "var(--ink-2)" }}>
                    <span aria-hidden className="mt-[6px] block h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "var(--amber-fg)" }} />
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
              {flags.length > FLAGS_SHOWN && (
                <button
                  type="button"
                  className="mt-2 text-[12px] font-semibold hover:underline"
                  style={{ color: "var(--brass)" }}
                  aria-expanded={allFlags}
                  onClick={() => setAllFlags((v) => !v)}
                >
                  {allFlags ? "Show fewer" : `Show all ${flags.length}`}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Where they have been, left to right. Only moments the record can date. */
function Timeline({ candidate, app }: { candidate: Candidate; app?: AppRecord }) {
  const when = (iso?: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : format(d, "EEE h:mm a");
  };

  const applied = when(app?.created_at);
  const interviewStart = toMillis(transcriptOf(app)[0]?.timestamp);
  const voice = interviewStart != null ? format(new Date(interviewStart), "EEE h:mm a") : null;
  // updated_at is when the row last changed — the best date the record has for
  // the state it is in now.
  const settled = when(app?.updated_at);

  // A decline recommendation overrides the stage word here too — "Shortlisted"
  // in jade next to a candidate Ava is warning about reads as the page
  // disagreeing with itself. Terminal outcomes (Hired/Rejected) are a human's
  // completed decision, not a pending recommendation, so they're left alone.
  const needsReview = candidate.recommendedAction === "reject" && candidate.stage !== "Hired" && candidate.stage !== "Rejected";

  const stageTone = needsReview
    ? "var(--amber-fg)"
    : candidate.stage === "Rejected"
      ? "var(--crit)"
      : candidate.stage === "Hired" || candidate.stage === "Shortlist"
        ? "var(--jade-soft-fg)"
        : "var(--amber-fg)";
  const stageWord = needsReview
    ? "Needs review"
    : candidate.stage === "Rejected"
      ? "Passed"
      : candidate.stage === "Hired"
        ? "Hired"
        : candidate.stage === "Shortlist"
          ? "Shortlisted"
          : candidate.stage;

  const steps: React.ReactNode[] = [];
  // Apply Now creates the row before the form is sent — that moment is when
  // they started, not when they applied.
  if (applied)
    steps.push(
      <b key="applied" style={{ color: "var(--ink)" }}>
        {candidate.fillingInForm ? "Started" : "Applied"} {applied}
      </b>,
    );
  if (voice) steps.push(<span key="voice">Voice interview {voice}</span>);
  // "Application" is the state they arrive in — the first step already said so.
  if (settled && candidate.stage !== "Application")
    steps.push(
      <span key="stage" style={{ color: stageTone, fontWeight: 600 }}>
        {stageWord} {settled}
      </span>,
    );

  if (steps.length === 0) return null;

  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-2 rounded-[10px] px-[14px] py-[9px] text-[11px]"
      style={{ background: "var(--ground-2)", color: "var(--ink-2)" }}
    >
      {steps.map((step, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && (
            <span aria-hidden style={{ color: "var(--ink-3)" }}>
              →
            </span>
          )}
          {step}
        </span>
      ))}
    </div>
  );
}

/* ── Gemline rail — visual mapping only ──────────────────────────────────
   Every step's glyph is still fixed to its type (unchanged), but the *color*
   is no longer per-type — it's read straight off the step's position on the
   track: index 0 sits at the deep-jade end, the last step (Decision) sits at
   the gold end, and everything between is interpolated along the same
   curated spectrum the flowing track fill draws from. This is the ONE
   colorful thing in the applicant panel — the --gem-* tokens live in
   cockpit.css and are never reused elsewhere in the cockpit. Decision
   doesn't get a fill of its own: it's the brass wax seal, and the gold end
   of the gradient hands off into it naturally. */
const RAIL_ICON_BY_TYPE: Record<string, typeof Mail> = {
  application: Mail,
  quiz: ListChecks,
  typing_test: Keyboard,
  portfolio_upload: FileText,
  video_intro: Video,
  video_message: Video,
  chat_simulation: MessageCircle,
  chat_interview: MessageCircle,
  sales_simulation: MessageCircle,
  voice_interview: AudioLines,
};
const railIcon = (type: string): typeof Mail => RAIL_ICON_BY_TYPE[type] ?? Mail;

/** The curated jade → mint → teal → gold spectrum every gem node draws its
 *  fill from — shared with the Dashboard's "Pipeline at a glance" miniature.
 *  See `../lib/gemRail.ts` for the interpolation itself. */

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Which phase she's on, and what's left — the job's real steps plus the
 * closing "Decision" stage, built the same way the candidate side builds
 * them (`buildCandidateJourney` off `jobs.workflow_steps`, positioned with
 * `positionFor`), so the two sides never disagree about where someone stands.
 *
 * Sits above Ava's letterhead on purpose: this is context, not a verdict —
 * one row of nodes, one line summarizing them. The score still does the
 * talking below it.
 */
/** The job's journey for this applicant, built exactly as JourneyStrip and
 *  the candidate's own screens build it. */
function journeyFor(candidate: Candidate, app?: AppRecord): CandidateJourneyStep[] {
  const workflowSteps = app?.jobs?.workflow_steps as WorkflowStepLike[] | undefined;
  const quizQuestions = app?.jobs?.quiz_questions as unknown[] | undefined;
  const hasQuiz = (Array.isArray(quizQuestions) && quizQuestions.length > 0) || candidate.quiz != null;
  return buildCandidateJourney(workflowSteps, { hasQuiz });
}

/** The step "Let them take the next test" would open — only while the
 *  candidate is parked: the application is in the hiring team's hands
 *  (submitted or held), the step they stand on is done (its result is on
 *  file, so there is nothing left for them to do there), and a real step
 *  comes next. Never while a step is still theirs to take — that would be a
 *  way to skip a test nobody took — and never once the application is decided. */
function nextStepFor(candidate: Candidate, app?: AppRecord): CandidateJourneyStep | null {
  if (!app) return null;
  if (app.status !== "pending" && app.status !== "reviewing") return null;
  const steps = journeyFor(candidate, app);
  const where = { phase: app.phase, status: app.status };
  const current = positionFor(steps, where).current;
  if (!stepHasResult(parseApplicationNotes(app.notes), app.voice_interview_result, current)) return null;
  return nextJourneyStep(steps, where);
}

function JourneyStrip({ candidate, app, record }: { candidate: Candidate; app?: AppRecord; record: AssessmentRecord | null }) {
  const workflowSteps = app?.jobs?.workflow_steps as WorkflowStepLike[] | undefined;
  const quizQuestions = app?.jobs?.quiz_questions as unknown[] | undefined;
  // The job's own config decides whether there's a quiz stage at all — not
  // whether this particular candidate happened to take one.
  const hasQuiz = (Array.isArray(quizQuestions) && quizQuestions.length > 0) || candidate.quiz != null;

  const steps = buildCandidateJourney(workflowSteps, { hasQuiz });
  const position = positionFor(steps, { phase: app?.phase, status: app?.status });
  const decided = candidate.stage === "Hired" || candidate.stage === "Rejected";
  const outcome = candidate.stage === "Hired" ? "Hired" : candidate.stage === "Rejected" ? "Passed" : null;
  // What the buttons in the action row above actually do right now — the
  // Decision node's tooltip names it, so the strip and the buttons agree.
  const advanceLabel = advanceTargetLabel(app?.status);

  // Each gem's receipt is the same figure its row in "What they submitted"
  // shows — "38 WPM · under 45", "25/100 · No Hire" — never just "Completed"
  // when the record holds the number.
  const entryFor = (stepId: string) => record?.entries.find((e) => e.key === stepId) ?? null;

  const nodeState = (i: number): "completed" | "current" | "upcoming" => {
    if (steps[i].id === DECISION_STAGE_ID && decided) return "completed";
    if (i < position.index) return "completed";
    if (i === position.index) return "current";
    return "upcoming";
  };

  // The result behind a step, when the record has one — quiz score, interview
  // length, the outcome of the decision. Only ever what's actually on file.
  const resultFor = (step: CandidateJourneyStep, state: "completed" | "current" | "upcoming"): string | null => {
    if (step.id === DECISION_STAGE_ID) {
      if (outcome) return outcome;
      if (state !== "current") return null;
      if (app?.status === "offered") return "Hire, or take back the offer";
      return advanceLabel ? `Pass, or move to ${advanceLabel}` : "Pass, or move forward";
    }
    if (state === "upcoming") return null;
    const entry = entryFor(step.id);
    if (entry?.status === "done" && entry.receipt) return entry.receipt;
    if (entry?.status === "in_progress" && candidate.fillingInForm) return "Filling in";
    // Showcase rows carry no record; their quiz figure is on the candidate.
    if (step.type === "quiz" && candidate.quiz != null) return `${candidate.quiz}%`;
    return state === "completed" ? "Completed" : null; // "current" with no result yet isn't done
  };

  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const phrase = (step: CandidateJourneyStep) => (step.id === DECISION_STAGE_ID ? "your decision" : `the ${lower(step.title)}`);
  const summary =
    decided && outcome
      ? `Completed every phase · decision: ${outcome}`
      : candidate.fillingInForm
        ? `Filling in the application form · ${lowerFirst(candidate.appliedAgo)}`
        : (() => {
          // At index 0 they're sitting on the Application stage itself — the
          // very existence of this application record means they already did
          // it, so "next" means the stage after it, not the application again.
          const atStart = position.index === 0;
          const prev = atStart ? null : steps[position.index - 1];
          const next = atStart ? steps[1] : position.current;
          return prev
            ? `Completed the ${lower(prev.title)} · next: ${phrase(next)}`
            : next
              ? `Just applied · next: ${phrase(next)}`
              : "Just applied";
        })();

  // The rail itself is <GemRail> — the one shared renderer, also used by the
  // create-job flow's StepRail and mirrored by the landing hero. Everything
  // above stays here, because it is candidate logic: which phases this job has,
  // where she actually is, and what each gem's receipt says. The component owns
  // only the drawing, the measuring and the walk.
  const initials = getInitials(candidate.name);

  const railNodes = steps.map((step, i) => {
    const state = nodeState(i);
    const isDecision = step.id === DECISION_STAGE_ID;
    const rejected = isDecision && candidate.stage === "Rejected";
    const result = resultFor(step, state);
    const tag = state === "current" ? (isDecision ? "She's here — your call" : "She's here") : null;
    return {
      id: step.id,
      label: step.title,
      icon: railIcon(step.type),
      receipt: result,
      // the pill treatment is the seal's own stamp ("92 · Hired") — reserved for
      // the actual verdict, not the call-to-action shown while she's waiting
      sealed: Boolean(isDecision && outcome),
      decision: isDecision,
      sealTilt: rejected ? -4 : 0,
      color: isDecision ? "var(--brass)" : undefined,
      tooltip: [step.title, tag, result].filter(Boolean).join(" · "),
    };
  });

  return (
    <GemRail
      nodes={railNodes}
      current={position.index}
      traveler={initials}
      summary={summary}
      ariaLabel="Where they are in the job's process"
      focusable
    />
  );
}

export default function CockpitApplicants() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const roleIdFilter = searchParams.get("roleId");
  const { candidates, applications, isLoading, isError, refetch } = useCockpitCandidates();
  const { jobs, isLoading: jobsLoading } = useCockpitJobsData();
  const { advance, hire, reject, letContinue, isUpdating } = useCockpitActions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The tab the owner picked, if any, and the job he picked it on — another
  // job's people start over from their own data. Until then the page opens on
  // whichever tab has people (see `bucket` below), so a lone applicant who has
  // just pressed Apply is on screen instead of behind an empty "Sealed · 0".
  const [bucketChoice, setBucketChoice] = useState<{ roleId: string | null; bucket: Bucket } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [scoreFilter, setScoreFilter] = useState("");
  const [page, setPage] = useState(1);
  const [actionDialog, setActionDialog] = useState<{ type: "hire" | "reject" | "advance" | "continue"; cand: Candidate } | null>(null);
  const [hirePrompt, setHirePrompt] = useState<Candidate | null>(null);
  const [scheduleCand, setScheduleCand] = useState<Candidate | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [resumePreview, setResumePreview] = useState<Candidate | null>(null);
  // The guided moment after a move to Interview — "want to propose times now?"
  // — scoped to the candidate it belongs to, so it never survives a different
  // selection.
  const [interviewMoment, setInterviewMoment] = useState<Candidate | null>(null);
  // A brief pulse on "Set up interview" after "Later" — the visible hint for
  // where scheduling lives, without forcing the wizard on anyone.
  const [scheduleHintId, setScheduleHintId] = useState<string | null>(null);
  // The test whose full record is open, by its key in the selected person's
  // record — looked up fresh each render, so a live update reaches the sheet.
  const [recordOpen, setRecordOpen] = useState<{ candidateId: string; key: string } | null>(null);

  // Map application id → the live record (candidate.id === application.id in
  // both schema modes), so the read can quote the transcript it came from.
  const appById = useMemo(() => {
    const m: Record<string, AppRecord> = {};
    applications.forEach((a) => {
      m[a.id] = a as AppRecord;
    });
    return m;
  }, [applications]);

  const statusById = useMemo(() => {
    const m: Record<string, string> = {};
    applications.forEach((a) => {
      m[a.id] = (a as { status?: string }).status ?? "";
    });
    return m;
  }, [applications]);

  // The role identifier differs by schema: showcase apps carry `role_id`, hireflow1 apps carry
  // `job_id`. Support both so the Role filter + the Jobs "View" deep-link (?roleId=<jobId>) work.
  const appRoleId = useCallback(
    (a: (typeof applications)[number]): string | null =>
      ((a as { role_id?: string | null }).role_id ?? (a as { job_id?: string | null }).job_id) ?? null,
    [],
  );

  // Role-scoped set — the job's own totals, never touched by search or filters.
  const roleScoped = useMemo(() => {
    if (!roleIdFilter) return candidates;
    const appIds = new Set(applications.filter((a) => appRoleId(a) === roleIdFilter).map((a) => a.id));
    return candidates.filter((c) => appIds.has(c.id));
  }, [candidates, applications, roleIdFilter, appRoleId]);

  // Everything the search + filters allow through, before the tab split.
  const scoped = useMemo(() => {
    let list = roleScoped;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || c.role.toLowerCase().includes(q));
    if (stageFilter) list = list.filter((c) => c.stage === stageFilter);
    if (scoreFilter) {
      list = list.filter((c) => {
        const s = c.overall ?? 0;
        if (scoreFilter === "80") return s >= 80;
        if (scoreFilter === "50") return s >= 50 && s < 80;
        if (scoreFilter === "lt") return s > 0 && s < 50;
        if (scoreFilter === "none") return s === 0;
        return true;
      });
    }
    return list;
  }, [roleScoped, search, stageFilter, scoreFilter]);

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { sealed: 0, reading: 0, started: 0, passed: 0 };
    scoped.forEach((cand) => { c[bucketOf(cand)] += 1; });
    return c;
  }, [scoped]);

  // The person on screen leads when they move forward live (the form is
  // sent, Ava seals them): the page moves with them instead of swapping them
  // for whoever is first on the old tab. A Pass is not followed. Otherwise the
  // owner's tab for this job, a `?tab=` link, else the first tab with anyone
  // on it. The rule itself is `applicantTab`, tested on its own.
  const selectedPerson = selectedId ? scoped.find((c) => c.id === selectedId) ?? null : null;
  const tabParam = applicantTabParam(searchParams.get("tab"));
  const chosenTab = bucketChoice && bucketChoice.roleId === roleIdFilter ? bucketChoice.bucket : tabParam;
  const bucket: Bucket = applicantTab({
    counts,
    chosen: chosenTab,
    onScreen: selectedPerson ? bucketOf(selectedPerson) : null,
  });

  // Strongest first — the point of the page is who is worth your time.
  const listCandidates = useMemo(
    () => scoped.filter((c) => bucketOf(c) === bucket).sort((a, b) => b.overall - a.overall),
    [scoped, bucket],
  );

  // Reset to page 1 whenever the filters change. (A tab the owner picks resets
  // it in chooseBucket; a tab the page follows someone to keeps them in view.)
  useEffect(() => { setPage(1); }, [search, stageFilter, scoreFilter, roleIdFilter]);
  // Another job's people are not this one's: start over from the data. (The
  // tab choice is kept per job — see `chosenTab` — so it needs no reset, and
  // the first render under the new job already opens on that job's own tab.)
  useEffect(() => {
    setSelectedId(null);
    setInterviewMoment(null);
    setScheduleHintId(null);
  }, [roleIdFilter]);
  // When the page follows someone to another tab, open it at their page.
  useEffect(() => {
    if (!selectedId) return;
    const index = listCandidates.findIndex((c) => c.id === selectedId);
    if (index >= 0) setPage(Math.floor(index / PAGE_SIZE) + 1);
    // Only on a change of tab: paging by hand must not snap back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket]);

  /** A tab picked by hand: a fresh look, from the top of that tab. */
  const chooseBucket = (next: Bucket) => {
    setBucketChoice({ roleId: roleIdFilter, bucket: next });
    setSelectedId(null);
    setInterviewMoment(null);
    setScheduleHintId(null);
    setPage(1);
  };

  // The hint pulse is a moment, not a standing state — it fades on its own.
  useEffect(() => {
    if (!scheduleHintId) return;
    const t = setTimeout(() => setScheduleHintId(null), 5600);
    return () => clearTimeout(t);
  }, [scheduleHintId]);

  const totalPages = Math.max(1, Math.ceil(listCandidates.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const pageStart = (pageClamped - 1) * PAGE_SIZE;
  const paged = listCandidates.slice(pageStart, pageStart + PAGE_SIZE);

  const roleOptions = useMemo<FilterOption[]>(() => {
    const map = new Map<string, string>();
    for (const a of applications) {
      const rid = appRoleId(a);
      const c = candidates.find((x) => x.id === a.id);
      if (rid && c?.role) map.set(rid, c.role);
    }
    return [{ label: "All roles", value: "" }, ...[...map].map(([value, label]) => ({ label, value }))];
  }, [applications, candidates, appRoleId]);

  const stageOptions: FilterOption[] = [{ label: "All stages", value: "" }, ...STAGES.map((s) => ({ label: s, value: s }))];
  const scoreOptions: FilterOption[] = [
    { label: "All scores", value: "" },
    { label: "80% and up", value: "80" },
    { label: "50–79%", value: "50" },
    { label: "Below 50%", value: "lt" },
    { label: "Not yet scored", value: "none" },
  ];

  const selected = listCandidates.find((c) => c.id === selectedId) ?? paged[0] ?? null;
  const selectedIndex = selected ? listCandidates.findIndex((c) => c.id === selected.id) : -1;
  // Hold on to whoever is on screen, picked or shown first, so the tab can
  // follow them when their record changes underneath the page. When the one
  // held is no longer on screen (passed on, filtered out, withdrawn) the hold
  // hands over to whoever is shown in their place.
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selectedId, selected]);
  // What they submitted, test by test — the list, the rail's receipts and
  // Ava's "weighed" line all read this one record.
  const selectedApp = selected ? appById[selected.id] : undefined;
  const selectedRecord = useMemo(() => (selectedApp ? buildAssessmentRecord(selectedApp) : null), [selectedApp]);
  const openEntry =
    recordOpen && selected && recordOpen.candidateId === selected.id
      ? selectedRecord?.entries.find((e) => e.key === recordOpen.key) ?? null
      : null;
  const openRecord = (entry: AssessmentEntry) => {
    if (!selected) return;
    // The resume has its own viewer; everything else opens its record.
    if (entry.kind === "resume") setResumePreview(selected);
    else setRecordOpen({ candidateId: selected.id, key: entry.key });
  };
  // Ava's own decline recommendation, not the score, decides how loud the
  // panel's action row gets — the human still decides, but the page can't be
  // nudging toward the one thing Ava just warned against. Same rule as the
  // Advance button on the full profile page.
  const selectedNeedsReview = selected?.recommendedAction === "reject";
  // The step the candidate would take next if the team lets them — null once
  // every real step is done (then the row's own Move/Hire/Pass buttons apply).
  const selectedNextStep = selected ? nextStepFor(selected, appById[selected.id]) : null;

  /** Move through the whole filtered list, pulling the page along with it. */
  const goTo = (index: number) => {
    const next = listCandidates[index];
    if (!next) return;
    setSelectedId(next.id);
    setPage(Math.floor(index / PAGE_SIZE) + 1);
  };
  /** Turning the page shows that page's first person, so the panel is always
   *  someone on the page you are looking at. */
  const goToPage = (next: number) => {
    const target = Math.min(Math.max(1, next), totalPages);
    goTo((target - 1) * PAGE_SIZE);
  };

  const statusOf = (id: string) => statusById[id] || undefined;
  const openAdvance = (c: Candidate) => setActionDialog({ type: "advance", cand: c });
  const openHire = (c: Candidate) => setActionDialog({ type: "hire", cand: c });
  const openReject = (c: Candidate) => setActionDialog({ type: "reject", cand: c });
  const openContinue = (c: Candidate) => setActionDialog({ type: "continue", cand: c });
  const confirmContinue = async () => {
    if (!actionDialog) return;
    const cand = actionDialog.cand;
    const step = nextStepFor(cand, appById[cand.id]);
    if (step) await letContinue(cand.id, step.id, step.title);
    setActionDialog(null);
  };
  const confirmAdvance = async () => {
    if (!actionDialog) return;
    const cand = actionDialog.cand;
    // Read the target stage before advancing — status flips the moment the
    // mutation lands, so this is the last point it's still knowable.
    const movingToInterview = advanceTargetLabel(statusOf(cand.id)) === "Interview";
    await advance(cand.id, statusOf(cand.id));
    setActionDialog(null);
    if (movingToInterview) setInterviewMoment(cand);
  };
  const confirmHire = async () => {
    if (!actionDialog) return;
    const c = actionDialog.cand;
    await hire(c.id);
    setActionDialog(null);
    setHirePrompt(c);
  };
  const confirmReject = async (reason?: string) => {
    if (!actionDialog) return;
    // Passing on someone keeps the owner on the tab he is working through and
    // shows the next person on it. Fix the tab first, so a tab the data chose
    // does not jump when its count changes underneath it.
    setBucketChoice({ roleId: roleIdFilter, bucket });
    await reject(actionDialog.cand.id, reason);
    setActionDialog(null);
  };
  const setRole = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("roleId", value); else next.delete("roleId");
    // A `?tab=` link was about the job it was sent for.
    next.delete("tab");
    setSearchParams(next);
  };
  const clearFilters = () => {
    setSearch("");
    setStageFilter("");
    setScoreFilter("");
  };
  /** Same entry point the dashboard uses — a fresh brief, never a stale draft. */
  const startRole = () => {
    clearDraft();
    sessionStorage.removeItem("ava-create-active");
    navigate("/jobs/create");
  };

  const shareJob = roleIdFilter ? jobs.find((j) => j.id === roleIdFilter) ?? null : null;
  // A job with no applicants yet has no candidate to borrow a title from.
  const roleName = roleIdFilter
    ? roleOptions.find((o) => o.value === roleIdFilter)?.label ?? shareJob?.title ?? null
    : null;
  const applyUrl = shareJob
    ? shareJob.roleCode
      ? candidateApplyUrl(shareJob.roleCode)
      : `${candidateOrigin()}/candidate/job/${shareJob.id}`
    : "";

  const activeFilters = [search.trim(), stageFilter, scoreFilter].filter(Boolean).length;
  // Ava's "sealed" (analyzed) triage count for the header line.
  const sealedTotal = roleScoped.filter((c) => bucketOf(c) === "sealed").length;
  // Pressed Apply, still on the form: counted apart from "applied", because
  // they have not sent anything yet.
  const applyingTotal = roleScoped.filter((c) => bucketOf(c) === "started").length;
  // The same people inside the search and filters, for the line that names
  // them while another tab is open.
  const applyingNow = scoped.filter((c) => bucketOf(c) === "started");
  /** "See" on that line: their tab, and the one person on it when there is one. */
  const seeApplying = () => {
    chooseBucket("started");
    if (applyingNow.length === 1) setSelectedId(applyingNow[0].id);
  };

  /* ── While the record loads ───────────────────────────────────────────
     Shaped like the page it becomes — head, tab strip, then the list column
     beside the inspector — so nothing slides sideways at the moment the data
     lands. Ava's seal breathes at the head so the blocks read as pending
     rather than as cards that failed to paint. */
  if (isLoading || jobsLoading) {
    return (
      <div className="space-y-4">
        <header className="ck-rise flex flex-wrap items-center gap-x-3.5 gap-y-2">
          <span className="ck-seal-breathe">
            <AvaSeal size={22} title="I'm pulling up your applicants" />
          </span>
          <div className="h-[26px] w-[200px] rounded-lg" style={{ background: "var(--surface)", opacity: 0.55 }} />
          <div className="h-[13px] w-[104px] rounded" style={{ background: "var(--surface)", opacity: 0.4 }} />
          <div className="ml-auto flex gap-2">
            <div className="h-[34px] w-[72px] rounded-lg" style={{ background: "var(--surface)", opacity: 0.55 }} />
            <div className="h-[34px] w-[92px] rounded-lg" style={{ background: "var(--surface)", opacity: 0.55 }} />
          </div>
        </header>

        <div className="flex flex-col items-stretch gap-3.5 min-[1160px]:flex-row">
          {/* left — where the field will be, at the width it settles at */}
          <div className="flex w-full shrink-0 flex-col min-[1160px]:w-[clamp(280px,32%,360px)]">
            <div className="mb-3 flex gap-4 pb-2">
              {[62, 84, 74].map((w, i) => (
                <div
                  key={w}
                  className="ck-reveal h-[13px] rounded"
                  style={{ ["--ck-i" as string]: i, width: w, background: "var(--surface)", opacity: 0.5 }}
                />
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="ck-reveal h-[60px] rounded-[10px]"
                  style={{ ["--ck-i" as string]: i + 1, background: "var(--surface)", opacity: 0.55 }}
                />
              ))}
            </div>
          </div>
          {/* right — the letterhead */}
          <div className="min-w-0 flex-1">
            <div
              className="ck-reveal h-[420px] rounded-xl"
              style={{ ["--ck-i" as string]: 2, background: "var(--surface)", opacity: 0.55 }}
            />
          </div>
        </div>
      </div>
    );
  }

  // A failed load must never read as "nobody has applied yet" — that is a
  // claim about the pipeline, not the network.
  if (isError) {
    return <CockpitErrorCard message="We couldn't load your applicants just now." onRetry={refetch} />;
  }

  /* ── Nothing has come in yet ───────────────────────────────────────────
     With a live role this page used to say "Publish a role… Post your first
     job" (2026-10-05, the owner: "the dashboard says there's a job, but then
     the job says there is no job"). Now: the role it was opened for (or the
     first live one), and its link. "Post your first job" only when there
     genuinely is no role. */
  if (candidates.length === 0) {
    const emptyJob = shareJob ?? jobs.find((j) => j.status === "live") ?? null;
    return (
      <div className="space-y-4">
        <header className="ck-rise">
          <h1
            className="font-display text-[30px] font-semibold leading-[1.15]"
            style={{ color: "var(--ink)", letterSpacing: "-0.025em" }}
          >
            {shareJob ? `Nobody has applied to ${shareJob.title} yet.` : "Nobody has applied yet."}
          </h1>
        </header>
        <section className="ck-card ck-reveal p-6 md:p-8">
          {emptyJob ? (
            <>
              <p className="max-w-[56ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                The moment someone applies I read them, score them against the job, and they show up here,
                already sealed, with my working shown.
              </p>
              <div className="mt-5">
                <ShareJobCompact job={emptyJob} lead={shareJob ? "It's live. Share its link:" : undefined} />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button className="ck-btn ck-btn-outline !py-2 !text-[12.5px]" onClick={() => navigate("/jobs")}>
                  See your jobs
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="max-w-[52ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                Publish a role and share its link. The moment someone applies I read them, score them
                against the job, and they show up here, already sealed, with my working shown.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button className="ck-btn ck-btn-primary !py-2 !text-[12.5px]" onClick={startRole}>
                  Post your first job
                </button>
                <button className="ck-btn ck-btn-outline !py-2 !text-[12.5px]" onClick={() => navigate("/jobs")}>
                  See your jobs
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    );
  }

  const tabs: Array<{ key: Bucket; label: string; count: number }> = [
    { key: "sealed", label: "Sealed", count: counts.sealed },
    ...(counts.reading > 0 || bucket === "reading"
      ? [{ key: "reading" as const, label: "Still reading", count: counts.reading }]
      : []),
    ...(counts.started > 0 || bucket === "started"
      ? [{ key: "started" as const, label: "Applying", count: counts.started }]
      : []),
    { key: "passed", label: "Didn't make it", count: counts.passed },
  ];

  const emptyNote =
    roleIdFilter && roleScoped.length === 0
      ? "Nobody has applied to this job yet."
      : activeFilters > 0
        ? "Nobody matches these filters."
        : bucket === "sealed"
          ? "I haven't sealed anyone here yet."
          : bucket === "reading"
            ? "I'm not reading anyone right now — everyone who applied has a score."
            : bucket === "started"
              ? "Nobody is filling in the form right now."
              : "You haven't passed on anyone here.";

  return (
    <div className="space-y-4">
      {/* ── The job is the page head ──────────────────────────────────── */}
      <header className="ck-rise flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <h1
          className={`font-display text-[30px] font-semibold leading-[1.15] ${roleName ? "" : "hidden md:block"}`}
          style={{ color: "var(--ink)", letterSpacing: "-0.025em" }}
        >
          {roleName ?? "All applicants"}
        </h1>
        <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
          {roleScoped.length > applyingTotal && (
            <>
              {roleScoped.length - applyingTotal} applied ·{" "}
              <span style={{ color: "var(--jade)", fontWeight: 600 }}>{sealedTotal} sealed</span>
            </>
          )}
          {applyingTotal > 0 && `${roleScoped.length > applyingTotal ? " · " : ""}${applyingTotal} filling in the form`}
          {activeFilters > 0 && ` · ${scoped.length} match your filters`}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            className="ck-btn ck-btn-outline !py-2 !text-[12.5px]"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((o) => !o)}
          >
            Filter
            {activeFilters > 0 && <span className="ck-dot ck-dot-live" aria-hidden />}
          </button>
          {shareJob && (
            <button
              type="button"
              className="ck-btn ck-btn-outline !py-2 !text-[12.5px]"
              onClick={() => setShareOpen(true)}
            >
              Share job
            </button>
          )}
        </div>
      </header>

      {filtersOpen && (
        /* Its own layer above the field: ck-reveal's transform makes this row a
           stacking context, which trapped the menus' z-50 under the rail below. */
        <div className="ck-reveal relative z-20 flex flex-wrap items-center gap-2.5">
          <SearchInput placeholder="Search applicants…" className="min-w-[160px] flex-1" value={search} onChange={setSearch} />
          <FilterSelect label="Job" value={roleIdFilter ?? ""} options={roleOptions} onChange={setRole} />
          <FilterSelect label="Stage" value={stageFilter} options={stageOptions} onChange={setStageFilter} />
          <FilterSelect label="Score" value={scoreFilter} options={scoreOptions} onChange={setScoreFilter} />
          {activeFilters > 0 && (
            <button className="ck-btn ck-btn-ghost !py-2 !text-[12.5px]" onClick={clearFilters}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* ── The field, and the one you picked ─────────────────────────── */}
      <div className="flex flex-col items-stretch gap-3.5 min-[1160px]:flex-row">
        {/* left — everyone */}
        <div className="flex w-full shrink-0 flex-col min-[1160px]:w-[clamp(280px,32%,360px)]">
          <div className="mb-3 flex gap-4" role="tablist" aria-label="Applicant groups">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={bucket === t.key}
                aria-controls="ck-applicant-list"
                onClick={() => chooseBucket(t.key)}
                className={`pb-2 text-[12px] transition-colors${t.key === "reading" ? " ck-reading-pulse" : ""}`}
                style={
                  bucket === t.key
                    ? { color: "var(--ink)", fontWeight: 700, boxShadow: "inset 0 -2px 0 var(--jade)" }
                    : { color: "var(--ink-3)", fontWeight: 500 }
                }
              >
                {t.label} · {t.count}
              </button>
            ))}
          </div>

          {/* Someone on the form while another tab is open: named here, one tap
              away, so a new applicant is never only a number on a tab. */}
          {bucket !== "started" && applyingNow.length > 0 && (
            <button
              type="button"
              onClick={seeApplying}
              className="-mt-1 mb-2.5 flex min-h-[32px] w-full max-w-[520px] items-start gap-2 py-1 text-left text-[12px] leading-[1.45]"
              style={{ color: "var(--ink-2)" }}
            >
              <span className="ck-dot ck-dot-live mt-[5px] shrink-0" aria-hidden />
              {/* Wraps rather than cutting the time off on a phone. */}
              <span className="min-w-0 flex-1 line-clamp-2">
                {applyingNow.length === 1 ? (
                  <>
                    <span style={{ color: "var(--ink)", fontWeight: 600 }}>{applyingNow[0].name}</span>
                    {" is filling in the form · "}
                    {applyingNow[0].appliedAgo.charAt(0).toLowerCase() + applyingNow[0].appliedAgo.slice(1)}
                  </>
                ) : (
                  `${applyingNow.length} people are filling in the form`
                )}
              </span>
              <span className="shrink-0 font-semibold" style={{ color: "var(--jade)" }}>
                See
              </span>
            </button>
          )}

          <div id="ck-applicant-list" role="tabpanel">
            {paged.length === 0 ? (
              <div
                className="rounded-[10px] border border-dashed px-4 py-5 text-[12.5px]"
                style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
              >
                {emptyNote}
              </div>
            ) : (
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 min-[1160px]:flex-col min-[1160px]:overflow-visible min-[1160px]:pb-0">
                {paged.map((c, i) => (
                  <PersonRow
                    key={c.id}
                    candidate={c}
                    index={i}
                    selected={selected?.id === c.id}
                    onSelect={() => setSelectedId(c.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="mt-2.5 flex items-center justify-between text-[11px]" style={{ color: "var(--ink-3)" }}>
              <span>
                {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, listCandidates.length)} of {listCandidates.length}
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={pageClamped === 1}
                  onClick={() => goToPage(pageClamped - 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md disabled:opacity-30"
                  style={{ color: "var(--ink-2)" }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={pageClamped === totalPages}
                  onClick={() => goToPage(pageClamped + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md disabled:opacity-30"
                  style={{ color: "var(--ink-2)" }}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </span>
            </div>
          )}

          {/* ≥1160px: the record sits under the field, beside the letterhead.
              Below that it moves under the timeline (the second mount below) —
              the two are one list in two places, never two lists. */}
          {selected && selectedRecord && (
            <AssessmentRecordList
              entries={selectedRecord.entries}
              onOpen={openRecord}
              className="mt-4 hidden min-[1160px]:block"
            />
          )}
        </div>

        {/* right — the person, on Ava's letterhead */}
        <div className="min-w-0 flex-1">
          {selected ? (
            <>
              <div className="mb-3 flex flex-wrap items-start gap-3.5">
                <div className="min-w-0">
                  <div
                    className="font-display text-[20px] font-semibold leading-[1.15]"
                    style={{ color: "var(--ink)", letterSpacing: "-0.02em" }}
                  >
                    {selected.name}
                  </div>
                  <div className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {selected.appliedAgo} · {selected.role}
                  </div>
                  {/* Same amber "Needs review" treatment as the full profile page —
                      a decline recommendation must be visible right here, next to
                      the name, not only buried in the buttons below. Left alone
                      once a human has actually settled it (Hired/Rejected). */}
                  {selectedNeedsReview && selected.stage !== "Hired" && selected.stage !== "Rejected" && (
                    <div className="mt-1.5">
                      <span
                        className="ck-pill"
                        style={{ color: "var(--amber-fg)", background: "var(--amber-bg)", borderColor: "var(--brass-line)" }}
                      >
                        Needs review
                      </span>
                    </div>
                  )}
                  {/* Pressed Apply, still on the form — live, not "applied". */}
                  {selected.fillingInForm && selected.stage !== "Rejected" && (
                    <div className="mt-1.5">
                      <span className="ck-pill ck-pill-stage-neutral">
                        <span className="ck-dot ck-dot-live" aria-hidden />
                        Filling in the form
                      </span>
                    </div>
                  )}
                </div>

                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {listCandidates.length > 1 && (
                    <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
                      <button
                        type="button"
                        aria-label="Previous applicant"
                        disabled={selectedIndex <= 0}
                        onClick={() => goTo(selectedIndex - 1)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border disabled:opacity-30"
                        style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink-2)" }}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      {selectedIndex + 1} of {listCandidates.length}
                      <button
                        type="button"
                        aria-label="Next applicant"
                        disabled={selectedIndex >= listCandidates.length - 1}
                        onClick={() => goTo(selectedIndex + 1)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border disabled:opacity-30"
                        style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink-2)" }}
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}

                  {selected.stage === "Hired" || selected.stage === "Rejected" ? (
                    <span
                      className="ck-pill"
                      style={
                        selected.stage === "Hired"
                          ? { color: "var(--jade-soft-fg)", background: "var(--jade-soft)" }
                          : { color: "var(--crit)", background: "var(--crit-bg)" }
                      }
                    >
                      {selected.stage === "Hired" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                      {selected.stage === "Hired" ? "Hired" : "Passed"}
                    </span>
                  ) : statusById[selected.id] === "offered" ? (
                    <>
                      <button
                        className="ck-btn ck-btn-outline !py-2 !text-[12.5px]"
                        disabled={isUpdating}
                        onClick={() => openReject(selected)}
                      >
                        {/* Same words as the dialog it opens, so the decision reads the same twice. */}
                        Take back offer
                      </button>
                      <button
                        className="ck-btn ck-btn-primary !py-2 !text-[12.5px]"
                        disabled={isUpdating}
                        onClick={() => openHire(selected)}
                      >
                        Hire
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="ck-btn ck-btn-outline !py-2 !text-[12.5px]"
                        disabled={isUpdating}
                        onClick={() => openReject(selected)}
                      >
                        Pass
                      </button>
                      {/* Opens the candidate's next STEP (quiz, typing test, chat
                          practice…) — the thing Ava holds back when she recommends
                          declining. Distinct from "Move to …", which only changes
                          the pipeline stage. */}
                      {selectedNextStep && (
                        <button
                          className="ck-btn ck-btn-outline !py-2 !text-[12.5px]"
                          disabled={isUpdating}
                          onClick={() => openContinue(selected)}
                        >
                          Let them take the next test
                        </button>
                      )}
                      {nextAdvanceStatus(statusById[selected.id]) && (
                        <button
                          className="ck-btn ck-btn-outline !py-2 !text-[12.5px]"
                          disabled={isUpdating}
                          onClick={() => openAdvance(selected)}
                        >
                          Move to {advanceTargetLabel(statusById[selected.id])}
                        </button>
                      )}
                      {/* The human still decides — this stays fully live, never
                          disabled or hidden. But when Ava is recommending against
                          this candidate, it drops from the filled primary button
                          to the same outline weight as Pass, so the panel isn't
                          nudging toward the one thing she just warned about. */}
                      <button
                        className={`ck-btn ${selectedNeedsReview ? "ck-btn-outline" : "ck-btn-primary"} !py-2 !text-[12.5px]${
                          scheduleHintId === selected.id ? " ck-node-pulse" : ""
                        }`}
                        onClick={() => setScheduleCand(selected)}
                      >
                        Set up interview
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* the guided next step after a move to Interview — introduces
                  the wizard in Ava's voice, or dismisses to a quiet hint on
                  the button above */}
              {interviewMoment?.id === selected.id && (
                <div
                  className="ck-reveal mb-3 flex flex-wrap items-center gap-3 rounded-[10px] border px-4 py-3"
                  style={{ borderColor: "var(--jade-soft-fg)", background: "var(--jade-soft)" }}
                >
                  <span className="ck-seal ck-seal-press shrink-0">
                    <AvaSeal size={22} />
                  </span>
                  <p className="min-w-0 flex-1 text-[13px] leading-[1.5]" style={{ color: "var(--jade-soft-fg)" }}>
                    Moved to interviews. Want to propose times to {firstName(selected.name)} now?
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      className="ck-btn ck-btn-primary !py-1.5 !text-[12px]"
                      onClick={() => {
                        setScheduleCand(selected);
                        setInterviewMoment(null);
                      }}
                    >
                      Propose times
                    </button>
                    <button
                      type="button"
                      className="ck-btn ck-btn-ghost !py-1.5 !text-[12px]"
                      onClick={() => {
                        setInterviewMoment(null);
                        setScheduleHintId(selected.id);
                      }}
                    >
                      Later
                    </button>
                  </div>
                </div>
              )}

              {/* keyed distinctly from the sibling `key={selected.id}` below (AvasRead) —
                  two siblings sharing one key value is a React key collision, not a
                  harmless coincidence, and it broke reconciliation between candidates */}
              <JourneyStrip key={`journey-${selected.id}`} candidate={selected} app={selectedApp} record={selectedRecord} />
              <AvasRead key={selected.id} candidate={selected} app={selectedApp} record={selectedRecord} />
              <Timeline candidate={selected} app={appById[selected.id]} />

              {selectedRecord && (
                <AssessmentRecordList
                  entries={selectedRecord.entries}
                  onOpen={openRecord}
                  layout="grid"
                  className="mt-4 min-[1160px]:hidden"
                />
              )}

              <div className="mt-3 flex flex-wrap gap-4 text-[12px]">
                <button
                  className="inline-flex items-center gap-1.5 hover:underline"
                  style={{ color: "var(--brass)" }}
                  onClick={() => navigate(`/applicants/${selected.id}`)}
                >
                  View full profile
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
                <button
                  className="inline-flex items-center gap-1.5 hover:underline"
                  style={{ color: "var(--brass)" }}
                  onClick={() => navigate(`/messages?candidate=${selected.avatar}`)}
                >
                  Message them
                  <MessageSquare className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          ) : (
            <div className="ck-card p-6">
              <p className="text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                {emptyNote}{" "}
                {activeFilters > 0
                  ? "Clear the filters to see everyone again."
                  : bucket === "sealed"
                    ? "The moment I finish reading someone, they land here with a score and my working."
                    : ""}
              </p>
              {activeFilters > 0 && (
                <button className="ck-btn ck-btn-outline mt-4 !py-2 !text-[12.5px]" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {actionDialog?.type === "advance" && (() => {
        const cand = actionDialog.cand;
        const st = statusById[cand.id];
        const label = advanceTargetLabel(st);
        const rec = avaAdvanceRec(cand.overall ?? 0, isAnalyzed(cand), cand.recommendedAction, cand.hardRejectReason);
        const who = firstName(cand.name);
        /* Ava asks in the same words as the button that opened this, and says
           what she will actually do next. Never "advance", "stage", "pipeline"
           or "the candidate" — this is a person, by name. */
        const ask =
          label === "Shortlist"
            ? { title: `Move ${who} to your shortlist?`, body: `I'll let ${who} know they've moved on, and keep them near the top of your list.` }
            : label === "Interview"
              ? { title: `Take ${who} to interview?`, body: `I'll tell ${who} you'd like to meet. You can pick the time straight after this.` }
              : label === "Offer"
                ? { title: `Make ${who} an offer?`, body: `I'll let ${who} know an offer is on its way from you, so nothing goes quiet while you write it.` }
                : { title: `Move ${who} forward?`, body: `I'll move ${who} on to the next step and let them know.` };
        return (
          <ActionDialog
            open
            title={ask.title}
            description={ask.body}
            confirmLabel={label ? `Move to ${label}` : "Move forward"}
            tone="brass"
            busy={isUpdating}
            note={rec.text}
            noteTone={rec.tone}
            onConfirm={() => void confirmAdvance()}
            onClose={() => setActionDialog(null)}
          />
        );
      })()}
      {actionDialog?.type === "continue" && (() => {
        const cand = actionDialog.cand;
        const step = nextStepFor(cand, appById[cand.id]);
        const who = firstName(cand.name);
        return (
          <ActionDialog
            open
            title={step ? `Let ${who} take the ${step.title}?` : `Let ${who} continue?`}
            description={
              step
                ? `I'll open the ${step.title} for ${who} and let them know. Nothing else changes — their score so far and your other options stay as they are.`
                : `${who} has finished every step already.`
            }
            confirmLabel={step ? `Open the ${step.title}` : "Close"}
            tone="brass"
            busy={isUpdating}
            onConfirm={() => void confirmContinue()}
            onClose={() => setActionDialog(null)}
          />
        );
      })()}
      <ActionDialog
        open={actionDialog?.type === "hire"}
        title={actionDialog ? `Hire ${firstName(actionDialog.cand.name)}?` : ""}
        description={actionDialog ? `I'll mark ${firstName(actionDialog.cand.name)} as hired for ${actionDialog.cand.role} and let them know today. You can send the offer letter next.` : ""}
        confirmLabel="Confirm hire"
        tone="brass"
        busy={isUpdating}
        onConfirm={() => void confirmHire()}
        onClose={() => setActionDialog(null)}
      />
      <ActionDialog
        open={actionDialog?.type === "reject"}
        title={actionDialog ? (statusById[actionDialog.cand.id] === "offered" ? `Take back ${firstName(actionDialog.cand.name)}'s offer?` : `Pass on ${firstName(actionDialog.cand.name)}?`) : ""}
        description={
          actionDialog && statusById[actionDialog.cand.id] === "offered"
            ? `I'll let ${firstName(actionDialog.cand.name)} know the offer is no longer open, in your name and kindly.`
            : actionDialog
              ? `${firstName(actionDialog.cand.name)} comes off your list and I send a polite note in your name.`
              : ""
        }
        confirmLabel={actionDialog && statusById[actionDialog.cand.id] === "offered" ? "Take back offer" : "Pass"}
        tone="danger"
        busy={isUpdating}
        withReason
        reasonLabel="Why, in a line? Only you see this."
        reasonPlaceholder="e.g. Strong, but went with someone with more weekend availability."
        onConfirm={(reason) => void confirmReject(reason)}
        onClose={() => setActionDialog(null)}
      />
      {hirePrompt && (
        <HiringDocumentPromptDialog
          open={!!hirePrompt}
          onOpenChange={(o) => { if (!o) setHirePrompt(null); }}
          candidateName={hirePrompt.name}
          jobTitle={hirePrompt.role}
          applicationId={hirePrompt.id}
          onSkip={() => setHirePrompt(null)}
        />
      )}
      <AssessmentRecordSheet
        open={!!openEntry}
        entry={openEntry}
        candidateName={selected?.name ?? ""}
        jobId={selectedRecord?.jobId ?? null}
        onClose={() => setRecordOpen(null)}
        onOpenResume={() => {
          // One modal at a time: the resume viewer takes over from the sheet.
          setRecordOpen(null);
          if (selected) setResumePreview(selected);
        }}
      />
      <DocumentPreviewDialog
        open={!!resumePreview}
        sourceUrl={resumePreview ? (appById[resumePreview.id]?.resume_url ?? null) : null}
        candidateName={resumePreview?.name ?? ""}
        label="Resume"
        onClose={() => setResumePreview(null)}
      />
      {scheduleCand && (
        <InterviewSchedulingWizard
          open={!!scheduleCand}
          onOpenChange={(o) => { if (!o) setScheduleCand(null); }}
          applicationId={scheduleCand.id}
          candidateName={scheduleCand.name}
          candidateEmail={scheduleCand.email ?? undefined}
          jobTitle={scheduleCand.role}
        />
      )}
      {shareJob && (
        <ShareKitDialog open={shareOpen} job={shareJob} applyUrl={applyUrl} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}
