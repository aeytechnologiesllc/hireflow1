import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Play,
  ExternalLink,
  MessageSquare,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import AvaSeal from "@/components/ava/AvaSeal";
import CkAvatar from "../components/Avatar";
import { ActionDialog } from "../components/ActionDialog";
import { ShareKitDialog } from "../components/ShareKitDialog";
import { CountUp } from "../components/CountUp";
import { HiringDocumentPromptDialog } from "@/components/HiringDocumentPromptDialog";
import InterviewSchedulingWizard from "@/components/InterviewSchedulingWizard";
import { SearchInput, FilterSelect, type FilterOption } from "../components/controls";
import {
  useCockpitCandidates,
  useCockpitJobsData,
  useCockpitActions,
  nextAdvanceStatus,
  advanceTargetLabel,
  avaAdvanceRec,
} from "../hooks/useCockpitData";
import { getInitials, parseApplicationNotes } from "../lib/mappers";
import { candidateApplyUrl } from "@/lib/showcaseApply";
import { clearDraft } from "@/lib/avaEngine/draft";
import type { Candidate, CandidateStage } from "../data";

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
 * rather than filled in.
 */

/** Real wax never sits square. A stable per-row tilt, so it does not jitter. */
const TILTS = [-6, 4, -3, 5, -4];

const PAGE_SIZE = 8;

/** The stage filter offers everything except Rejected — the tabs own that split. */
const STAGES: CandidateStage[] = ["Application", "Quiz", "Voice", "Shortlist", "Hired"];

/** Which side of the job a person is on. "reading" only exists while Ava works. */
type Bucket = "sealed" | "reading" | "passed";

/* ── Reading the real record ───────────────────────────────────────────────
   `applications` carries either a live hireflow row or a showcase row, so every
   field below is optional and read defensively. Nothing is inferred. */

interface AppRecord {
  id: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  notes?: string | null;
  resume_url?: string | null;
  voice_interview_recording_url?: string | null;
  voice_interview_transcript?: unknown;
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

interface QuizResult {
  correct?: number;
  total?: number;
  passed?: boolean;
}

function quizResultOf(app?: AppRecord): QuizResult | null {
  const notes = parseApplicationNotes(app?.notes ?? null);
  const result = notes.quizResult as QuizResult | undefined;
  if (!result || typeof result.total !== "number" || typeof result.correct !== "number") return null;
  return result;
}

/** A candidate has real screening signal once any score exists; until then we don't fake strengths. */
function isAnalyzed(c: Candidate): boolean {
  return (c.overall ?? 0) > 0 || c.quiz != null || c.voice != null;
}

function bucketOf(c: Candidate): Bucket {
  if (c.stage === "Rejected") return "passed";
  return isAnalyzed(c) ? "sealed" : "reading";
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
  const why = clip(avaProse(candidate.readFull) || candidate.read, 64);

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
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-[1.3]" style={{ color: "var(--ink)" }}>
          {candidate.name}
        </span>
        {why && (
          <span
            className="mt-[2px] hidden truncate text-[11px] min-[1160px]:block"
            style={{ color: "var(--ink-3)" }}
          >
            {why}
          </span>
        )}
      </span>

      <span
        className="ck-num ml-auto min-w-[34px] shrink-0 text-right text-[18px] font-semibold"
        style={{ color: analyzed ? "var(--jade)" : "var(--ink-3)" }}
      >
        {analyzed ? candidate.overall : "—"}
      </span>
    </button>
  );
}

/** What the record holds on this person, three facts at a time. */
function EvidenceTiles({
  candidate,
  app,
  className,
}: {
  candidate: Candidate;
  app?: AppRecord;
  className: string;
}) {
  const turns = transcriptOf(app);
  const minutes = interviewMinutes(turns);
  const quiz = quizResultOf(app);
  const resumeUrl = app?.resume_url ?? null;

  // A voice score with no saved transcript has nothing to show — the tile
  // used to render anyway and read "Completed — No transcript saved", which
  // looks like something broke. Only show the tile when there's a real
  // transcript to point to.
  const hasVoice = turns.length > 0;
  const hasQuiz = quiz != null || candidate.quiz != null;
  if (!hasVoice && !hasQuiz && !resumeUrl) return null;

  const tile = "rounded-[10px] border px-[14px] py-3";
  const tileStyle = {
    borderColor: "var(--line-soft)",
    background: "var(--surface)",
    boxShadow: "var(--hf-shadow-soft)",
  };

  return (
    <div className={className}>
      {hasVoice && (
        <div className={tile} style={tileStyle}>
          <Label color="var(--ink-3)">Voice interview</Label>
          <div className="ck-num mt-1.5 text-[20px] font-semibold leading-[1.15]" style={{ color: "var(--ink)" }}>
            {minutes != null ? `${minutes} min` : "Completed"}
          </div>
          <div className="mt-[3px] text-[11px]" style={{ color: "var(--ink-3)" }}>
            Transcript ready
          </div>
        </div>
      )}

      {hasQuiz && (
        <div className={tile} style={tileStyle}>
          <Label color="var(--ink-3)">Skills check</Label>
          <div className="ck-num mt-1.5 text-[20px] font-semibold leading-[1.15]" style={{ color: "var(--jade)" }}>
            {quiz ? `${quiz.correct} / ${quiz.total}` : `${candidate.quiz}%`}
          </div>
          <div className="mt-[3px] text-[11px]" style={{ color: "var(--ink-3)" }}>
            {quiz?.passed === true ? "Passed" : quiz?.passed === false ? "Did not pass" : "Scored"}
          </div>
        </div>
      )}

      {resumeUrl && (
        <div className={tile} style={tileStyle}>
          <Label color="var(--ink-3)">Resume</Label>
          <div className="ck-num mt-1.5 text-[20px] font-semibold leading-[1.15]" style={{ color: "var(--ink)" }}>
            On file
          </div>
          <a
            href={resumeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-[3px] inline-block text-[11px] font-semibold hover:underline"
            style={{ color: "var(--brass)" }}
          >
            Open
          </a>
        </div>
      )}
    </div>
  );
}

/** Ava's letterhead: brass rule, her mark, the score, and her working. */
function AvasRead({ candidate, app }: { candidate: Candidate; app?: AppRecord }) {
  const analyzed = isAnalyzed(candidate);
  const turns = transcriptOf(app);
  const minutes = interviewMinutes(turns);
  const quote = pullQuote(turns);
  const recording = app?.voice_interview_recording_url ?? null;
  const prose = avaProse(candidate.readFull) || candidate.read;

  // Say what she actually weighed — nothing more than the record holds.
  const weighed = [
    turns.length > 0 || candidate.voice != null
      ? minutes != null
        ? `${minutes}-minute voice interview`
        : "voice interview"
      : null,
    quizResultOf(app) != null || candidate.quiz != null ? "skills check" : null,
    app?.resume_url ? "resume" : null,
  ].filter(Boolean) as string[];

  // A middling or weak score is the one thing worth raising before you commit.
  const worthAsking =
    analyzed && candidate.risk.level !== "Low"
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
            {weighed.length > 0
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

      {!analyzed ? (
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

  const stageTone =
    candidate.stage === "Rejected"
      ? "var(--crit)"
      : candidate.stage === "Hired" || candidate.stage === "Shortlist"
        ? "var(--jade-soft-fg)"
        : "var(--amber-fg)";
  const stageWord =
    candidate.stage === "Rejected"
      ? "Passed"
      : candidate.stage === "Hired"
        ? "Hired"
        : candidate.stage === "Shortlist"
          ? "Shortlisted"
          : candidate.stage;

  const steps: React.ReactNode[] = [];
  if (applied) steps.push(<b key="applied" style={{ color: "var(--ink)" }}>Applied {applied}</b>);
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

export default function CockpitApplicants() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const roleIdFilter = searchParams.get("roleId");
  const { candidates, applications, isLoading } = useCockpitCandidates();
  const { jobs } = useCockpitJobsData();
  const { advance, hire, reject, isUpdating } = useCockpitActions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bucket, setBucket] = useState<Bucket>("sealed");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [scoreFilter, setScoreFilter] = useState("");
  const [page, setPage] = useState(1);
  const [actionDialog, setActionDialog] = useState<{ type: "hire" | "reject" | "advance"; cand: Candidate } | null>(null);
  const [hirePrompt, setHirePrompt] = useState<Candidate | null>(null);
  const [scheduleCand, setScheduleCand] = useState<Candidate | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

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
  const appRoleId = (a: (typeof applications)[number]): string | null =>
    ((a as { role_id?: string | null }).role_id ?? (a as { job_id?: string | null }).job_id) ?? null;

  // Role-scoped set — the job's own totals, never touched by search or filters.
  const roleScoped = useMemo(() => {
    if (!roleIdFilter) return candidates;
    const appIds = new Set(applications.filter((a) => appRoleId(a) === roleIdFilter).map((a) => a.id));
    return candidates.filter((c) => appIds.has(c.id));
  }, [candidates, applications, roleIdFilter]);

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
    const c = { sealed: 0, reading: 0, passed: 0 };
    scoped.forEach((cand) => { c[bucketOf(cand)] += 1; });
    return c;
  }, [scoped]);

  // Strongest first — the point of the page is who is worth your time.
  const listCandidates = useMemo(
    () => scoped.filter((c) => bucketOf(c) === bucket).sort((a, b) => b.overall - a.overall),
    [scoped, bucket],
  );

  // Reset to page 1 whenever the filters or the tab change.
  useEffect(() => { setPage(1); }, [search, stageFilter, scoreFilter, roleIdFilter, bucket]);
  // A selection from another tab is not on this one.
  useEffect(() => { setSelectedId(null); }, [bucket, roleIdFilter]);

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
  }, [applications, candidates]);

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

  /** Move through the whole filtered list, pulling the page along with it. */
  const goTo = (index: number) => {
    const next = listCandidates[index];
    if (!next) return;
    setSelectedId(next.id);
    setPage(Math.floor(index / PAGE_SIZE) + 1);
  };

  const statusOf = (id: string) => statusById[id] || undefined;
  const openAdvance = (c: Candidate) => setActionDialog({ type: "advance", cand: c });
  const openHire = (c: Candidate) => setActionDialog({ type: "hire", cand: c });
  const openReject = (c: Candidate) => setActionDialog({ type: "reject", cand: c });
  const confirmAdvance = async () => {
    if (!actionDialog) return;
    await advance(actionDialog.cand.id, statusOf(actionDialog.cand.id));
    setActionDialog(null);
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
    await reject(actionDialog.cand.id, reason);
    setActionDialog(null);
  };
  const setRole = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("roleId", value); else next.delete("roleId");
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
      : `${window.location.origin}/candidate/job/${shareJob.id}`
    : "";

  const activeFilters = [search.trim(), stageFilter, scoreFilter].filter(Boolean).length;
  const sealedTotal = roleScoped.filter((c) => bucketOf(c) === "sealed").length;

  /* ── While the record loads ───────────────────────────────────────────
     Shaped like the page it becomes — head, tab strip, then the list column
     beside the inspector — so nothing slides sideways at the moment the data
     lands. Ava's seal breathes at the head so the blocks read as pending
     rather than as cards that failed to paint. */
  if (isLoading) {
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

  /* ── Nothing has come in yet ─────────────────────────────────────────── */
  if (candidates.length === 0) {
    return (
      <div className="space-y-4">
        <header className="ck-rise">
          <h1
            className="font-display text-[30px] font-semibold leading-[1.15]"
            style={{ color: "var(--ink)", letterSpacing: "-0.025em" }}
          >
            Nobody has applied yet.
          </h1>
        </header>
        <section className="ck-card ck-reveal p-6 md:p-8">
          <p className="max-w-[52ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            Publish a role and share its link. The moment someone applies I read them, score them
            against the job, and they show up here — already sealed, with my working shown.
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
        </section>
      </div>
    );
  }

  const tabs: Array<{ key: Bucket; label: string; count: number }> = [
    { key: "sealed", label: "Sealed", count: counts.sealed },
    ...(counts.reading > 0 || bucket === "reading"
      ? [{ key: "reading" as const, label: "Still reading", count: counts.reading }]
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
          {roleScoped.length} applied ·{" "}
          <span style={{ color: "var(--jade)", fontWeight: 600 }}>{sealedTotal} sealed</span>
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
        <div className="ck-reveal flex flex-wrap items-center gap-2.5">
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
                onClick={() => setBucket(t.key)}
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
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-md disabled:opacity-30"
                  style={{ color: "var(--ink-2)" }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={pageClamped === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-md disabled:opacity-30"
                  style={{ color: "var(--ink-2)" }}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </span>
            </div>
          )}

          {selected && (
            <EvidenceTiles
              candidate={selected}
              app={appById[selected.id]}
              className="mt-3 hidden grid-cols-1 gap-2.5 min-[1160px]:grid"
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
                      {nextAdvanceStatus(statusById[selected.id]) && (
                        <button
                          className="ck-btn ck-btn-outline !py-2 !text-[12.5px]"
                          disabled={isUpdating}
                          onClick={() => openAdvance(selected)}
                        >
                          Move to {advanceTargetLabel(statusById[selected.id])}
                        </button>
                      )}
                      <button
                        className="ck-btn ck-btn-primary !py-2 !text-[12.5px]"
                        onClick={() => setScheduleCand(selected)}
                      >
                        Set up interview
                      </button>
                    </>
                  )}
                </div>
              </div>

              <AvasRead key={selected.id} candidate={selected} app={appById[selected.id]} />
              <Timeline candidate={selected} app={appById[selected.id]} />

              <EvidenceTiles
                candidate={selected}
                app={appById[selected.id]}
                className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3 min-[1160px]:hidden"
              />

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
        const rec = avaAdvanceRec(cand.overall ?? 0, isAnalyzed(cand));
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
