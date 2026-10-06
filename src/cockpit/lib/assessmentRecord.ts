/**
 * assessmentRecord.ts — what the applicant actually sent, test by test.
 *
 * The owner, 2026-10-05, after his own test run: the applicant panel showed one
 * tile ("SKILLS CHECK 10/10") and the full profile showed none of what the
 * person had written, typed or said. Everything below is read straight off the
 * application row the cockpit already loads (`useEmployerApplications` selects
 * `*, jobs!inner(*)`), so no new query and no new table: one entry per step the
 * job GIVES this applicant, in the order the job gives them, each saying
 * whether it is done, what the number was, and what was submitted.
 *
 * Steps and their order come from `buildCandidateJourney` and "done" from
 * `stepHasResult` — the same two functions the journey rail, "Let them take the
 * next test" and the candidate's own screens use — so the list can never
 * disagree with the rail beside it.
 *
 * Honesty rules this file keeps:
 *  - Nothing is inferred. A transcript, a passage or a timing that was never
 *    stored is reported as not kept, never reconstructed.
 *  - Both stored shapes of the written interview are read: the AI-ended one
 *    (everything nested under `.evaluation`, transcript kept) and the
 *    End-button one (fields flat, no transcript). `CondensedAIAnalysis` read
 *    only the flat one and showed the AI-ended interview as unscored.
 *  - Correct quiz answers are never in notes (candidates can read their own
 *    notes). They come from `get_job_quiz_keys`, on demand, and
 *    `correctOptionsFor` below is how they are matched to each question.
 *
 * Wave 2 (2026-10-06) adds the server's own record beside the notes: one
 * `assessment_sessions` row per attempt (status, progress, the last thing
 * the applicant did, grading, the integrity tally) and its append-only
 * `assessment_events` (both sides of each chat, every quiz view and pick with
 * the server's time, typing snapshots, every switch away with how long). The
 * contract is docs/ASSESSMENT-RECORD.md. Sessions are passed to the builder
 * when they are loaded (`buildAssessmentRecord(app, { sessions, now })`);
 * a sheet that has loaded one attempt's events folds them in with
 * `withSessionEvents`. Without either, everything reads exactly as before.
 *
 * Pure and display-only: no React, no Supabase, no dates formatted here
 * (only durations: "1m 12s", "25 min ago"), so
 * `scripts/assessment_record.test.mjs` runs it under plain Node.
 */
import { buildCandidateJourney, positionFor, titleFor, DECISION_STAGE_ID } from "@/lib/candidateJourney";
import type { CandidateJourneyStep, WorkflowStepLike } from "@/lib/candidateJourney";
import { isRetakeOpen, stepHasResult } from "@/lib/journeyProgress";
import { parseApplicationNotes } from "@/lib/applicationNotes";

/* ── Shapes ────────────────────────────────────────────────────────────── */

/** The slice of an application row this file reads. Every field is optional:
 *  showcase rows and half-written rows must degrade, never throw. */
export interface AssessmentAppInput {
  id?: string;
  status?: string | null;
  phase?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  notes?: string | null;
  resume_url?: string | null;
  cover_letter?: string | null;
  voice_interview_transcript?: unknown;
  voice_interview_result?: unknown;
  voice_interview_recording_url?: string | null;
  ai_scorecard?: unknown;
  jobs?: {
    id?: string | null;
    workflow_steps?: unknown;
    quiz_questions?: unknown;
    passing_score?: number | null;
    required_wpm?: number | null;
    application_questions?: unknown;
  } | null;
}

export type AssessmentKind =
  | "application"
  | "resume"
  | "quiz"
  | "equipment_check"
  | "typing_test"
  | "chat_simulation"
  | "chat_interview"
  | "sales_simulation"
  | "voice_interview"
  | "video_intro"
  | "portfolio_upload"
  | "integrity"
  | "other";

export type AssessmentStatus = "not_started" | "in_progress" | "done";

/** jade = cleared, amber = below the bar or flagged, ink = neutral, muted = nothing yet. */
export type AssessmentTone = "jade" | "amber" | "ink" | "muted";

/** The cockpit colour token for a tone. */
export function toneColor(tone: AssessmentTone): string {
  switch (tone) {
    case "jade":
      return "var(--jade)";
    case "amber":
      return "var(--amber-fg)";
    case "ink":
      return "var(--ink)";
    default:
      return "var(--ink-3)";
  }
}

export interface IntegrityEvent {
  type: string;
  /** In plain words: "Left the window", "Tried to paste". */
  label: string;
  at: string | null;
  detail: string | null;
  /** Kept on the list but never a flag (a right-click, a blocked Ctrl+P). */
  recordedOnly?: boolean;
}

export interface IntegrityTally {
  /** What counts as a flag: every alerting event, never a sub-second blip or
   *  a right-click (those are on the timeline, recorded only). */
  total: number;
  tabSwitches: number;
  copyPaste: number;
  other: number;
  /** Each event with its time, when the test kept them. */
  events: IntegrityEvent[];
  /** True when only counts were kept (chat practice keeps no event list). */
  countsOnly: boolean;
  /** Time away in all (ms), when the server timed each switch. */
  awayMs?: number;
  /** Switches away under a second: on the timeline, never counted. */
  shortAway?: number;
  /** Kept but never a flag (a right-click, anything unrecognised). */
  recordedOnly?: number;
  /** The owner's bell-card words, in its order: "left the window 3 times
   *  (1m 12s away)", "paste attempt ×1". */
  parts?: string[];
  /** True when the counts are the server's (assessment_sessions.integrity_summary). */
  fromSession?: boolean;
  /** The server's flag counts by kind (away = switches of a second or more),
   *  so tallies from several tests can be added up in the card's words. */
  counts?: Record<string, number>;
}

export interface RecordTurn {
  /** "candidate" = the applicant; "other" = the interviewer or the practice player. */
  role: "candidate" | "other";
  text: string;
  at: string | null;
}

export interface AnswerItem {
  id: string;
  question: string;
  /** The readable answer, as stored ("Daytime; Weekends" for a pick-several). */
  answer: string;
  /** Every option picked, for a pick-several question. */
  selected: string[] | null;
  type: string | null;
  /** An uploaded file (a screenshot, a resume): its stored path, plus the
   *  page images a PDF was turned into. Opened through applicant-file-url,
   *  never shown as a raw path. */
  file: { path: string; pages: string[] } | null;
}

/** One file the applicant attached to the form (notes.fileUploads). */
export interface UploadItem {
  questionId: string;
  question: string;
  path: string;
  /** Page images (a PDF turned into PNGs), when made. */
  pages: string[];
  isResume: boolean;
}

export interface QuizItem {
  /** The id job_quiz_keys files this question under: its own id, else `__idx_<n>`. */
  id: string;
  index: number;
  question: string;
  category: string | null;
  type: "multiple_choice" | "multi_select" | "text" | "fit";
  /** Every option the job offers for it, when the job still has the question. */
  options: string[];
  /** Indexes into `options` of what they picked. */
  picked: number[];
  /** What they picked, as the record stored it — survives an edited job. */
  pickedText: string[];
  textAnswer: string | null;
  isCorrect: boolean | null;
  partial: boolean;
  /** Seconds on the question, from the server's clock; null when not recorded. */
  seconds: number | null;
  /** The time is the page's or an estimate, not the server's own. */
  approximate: boolean;
  /** How many times they changed their pick. */
  changes: number;
  /** The right answer(s) filed with THIS attempt's grading, when kept. */
  correctTexts: string[] | null;
  /** On their screen right now (a skills check in progress). */
  onScreen: boolean;
}

/** A question as the job holds it, for a skills check still in progress. */
export interface QuizQuestionRef {
  id: string;
  index: number;
  question: string;
  category: string | null;
  options: string[];
  type: QuizItem["type"];
}

/** One word of the typing test, against the passage at the same position
 *  (the grader's own rule: word i typed vs word i of the passage). */
export interface TypingWord {
  text: string;
  /** ok · wrong (typed, but not the passage's word) · extra (past the end
   *  of the passage) · missed (a passage word they never reached). */
  state: "ok" | "wrong" | "extra" | "missed";
  /** The passage's word, beside a wrong one. */
  expected: string | null;
}

export type EquipmentBar = "download" | "upload" | "latency";

/** The three bars a connection is judged against; null where the job set none. */
export interface EquipmentBars {
  minDownload: number | null;
  minUpload: number | null;
  maxLatency: number | null;
}

/** One row of the device table: "Screen" / "1920×1080". */
export interface EquipmentDeviceRow {
  label: string;
  value: string;
}

export interface Inconsistency {
  claim: string;
  evidence: string;
  assessment: string;
}

export type AssessmentDetail =
  | {
      kind: "application";
      answers: AnswerItem[];
      coverLetter: string | null;
      hasResume: boolean;
      flags: string[];
      /** Files attached to the form. */
      uploads: UploadItem[];
      /** Not sent yet: the answers saved as they typed (save_application_draft). */
      draft: { savedAt: string | null; answered: number | null; total: number | null } | null;
    }
  | { kind: "resume" }
  | {
      kind: "quiz";
      correct: number | null;
      total: number | null;
      score: number | null;
      passed: boolean | null;
      items: QuizItem[];
      /** The step_id its answer keys are filed under in job_quiz_keys. */
      keyStepId: string;
      /** The job's questions, to place picks made before the quiz is sent. */
      questions: QuizQuestionRef[];
      /** Still being answered: picks so far, nothing marked right or wrong. */
      live: boolean;
    }
  | {
      kind: "typing_test";
      wpm: number | null;
      accuracy: number | null;
      score: number | null;
      passed: boolean | null;
      requiredWpm: number | null;
      requiredAccuracy: number | null;
      passage: string | null;
      typed: string | null;
      seconds: number | null;
      /** Word by word, against the passage (when both are on file). */
      words: { typed: TypingWord[]; passage: TypingWord[]; wrong: number } | null;
      /** How many runs ("Try again") before they sent it. */
      runs: number | null;
      /** Typed so far: the test is not sent yet. */
      live: boolean;
    }
  | {
      /** The computer and connection check (docs/EQUIPMENT-CHECK.md §6):
       *  every figure was timed by our server, never by the browser. */
      kind: "equipment_check";
      download: number | null;
      upload: number | null;
      latencyMs: number | null;
      jitterMs: number | null;
      /** The job's own numbers (the result's snapshot, else the step's config). */
      bars: EquipmentBars;
      /** Which bars the figures miss, in the order download, upload, latency. */
      below: EquipmentBar[];
      /** Null until every bar and figure is known. */
      meetsBars: boolean | null;
      /** Plain words, each one its own line: "Ran on a phone", "Sent after 3 runs". */
      flags: string[];
      /** The answer to the computer question. "no" only while the check is
       *  still open: they were told to open it on the computer they'll work
       *  from, and it has not been run there yet. */
      usingThisComputer: "yes" | "no_switched" | "ran_here_anyway" | "no" | null;
      deviceKind: "computer" | "phone" | "tablet" | null;
      /** What the browser reported, as table rows (OS, browser, screen, …). */
      device: EquipmentDeviceRow[];
      /** How many runs the page counted when this one was sent (the page's
       *  own count: the server cannot count runs). */
      runs: number | null;
      /** "server" only when the server recorded it (its `_trusted` marker,
       *  which no candidate write can produce), never from the stored field. */
      measuredBy: "server" | null;
      measuredAt: string | null;
      /** Where the result was sent from. Staff-only: it lives in the
       *  attempt's grading, which only the job's staff may read. */
      ip: string | null;
      /** Every address the test's own requests came from, same place. */
      testIps: string[] | null;
      /** The browser's own line, from the same place. */
      userAgent: string | null;
      /** What happened, in order, from the attempt's events (withSessionEvents). */
      timeline: TimelineItem[] | null;
      /** Still being taken: nothing is timed until a run is sent. */
      live: boolean;
      /** While it is being taken: the screen they are on (the page's hint). */
      liveScreen: "computer" | "test" | "result" | "failed" | null;
    }
  | {
      kind: "chat_simulation";
      scenario: string | null;
      customerName: string | null;
      scores: Array<{ label: string; value: number }>;
      strengths: string[];
      improvements: string[];
      feedback: string | null;
      messageCount: number | null;
      transcript: RecordTurn[] | null;
      /** The conversation is still going. */
      live: boolean;
    }
  | {
      kind: "chat_interview";
      score: number | null;
      recommendation: string | null;
      credibility: string | null;
      summary: string | null;
      strengths: string[];
      concerns: string[];
      inconsistencies: Inconsistency[];
      duration: string | null;
      questionCount: number | null;
      messageCount: number | null;
      transcript: RecordTurn[] | null;
      /** The interview is still going. */
      live: boolean;
    }
  | {
      kind: "voice_interview";
      score: number | null;
      minutes: number | null;
      summary: string | null;
      recordingUrl: string | null;
      transcript: RecordTurn[] | null;
    }
  | {
      kind: "generic";
      facts: Array<{ label: string; value: string }>;
      lists: Array<{ label: string; items: string[] }>;
      summary: string | null;
      transcript: RecordTurn[] | null;
    }
  | {
      kind: "integrity";
      groups: Array<{ key: string; title: string; tally: IntegrityTally; sessionId: string | null; timeline: TimelineItem[] | null }>;
    };

export interface AssessmentEntry {
  /** The journey step id (stable per job), or `resume` / `integrity` / `extra-<type>`. */
  key: string;
  kind: AssessmentKind;
  /** The raw step type ("typing_test"…), for picking an icon. */
  stepType: string;
  title: string;
  status: AssessmentStatus;
  /** "Done" / "Sent", "Filling in the form", "In progress", "Not started yet",
   *  "Not taken", or "No result on file" for a step they went past without one. */
  statusLabel: string;
  /** The number that matters, set as a number: "10 / 10", "38 WPM", "25 / 100". */
  headline: string | null;
  tone: AssessmentTone;
  /** A judgment, when the record makes one: "Passed", "Below the 45 WPM bar", "No Hire". */
  verdict: string | null;
  /** Secondary facts: "85% accurate", "Empathy 15 · Problem solving 12". */
  subline: string | null;
  /** The journey rail's short receipt under this step's gem. */
  receipt: string | null;
  completedAt: string | null;
  integrity: IntegrityTally;
  /** True when tapping the row has something to show. */
  openable: boolean;
  detail: AssessmentDetail | null;
  /** The attempt the server keeps for this step, when there is one. */
  session: EntrySession | null;
  /** Every switch away, paste and marker with its time — once the attempt's
   *  events are loaded (withSessionEvents). */
  timeline: TimelineItem[] | null;
  /** "open": the hiring team handed this step back for a retake and the new
   *  attempt has not started; the row opens on the earlier result. */
  retake?: "open" | null;
  /** The staff hand-back behind a retake (assessment_step_reopens): when, and
   *  how many times. Null unless the step really was handed back. */
  reopen?: { at: string | null; count: number | null } | null;
  /** Earlier attempts of this step that raised flags (a retake, a replaced
   *  attempt): their own tallies, never added into this attempt's. */
  earlierIntegrity?: EarlierAttemptFlags[];
}

export interface EarlierAttemptFlags {
  sessionId: string;
  attempt: number;
  tally: IntegrityTally;
}

export interface EntrySession {
  id: string;
  attempt: number;
  status: string;
  /** Where they are now, by the lazy "left" rule; null once superseded. */
  live: LiveStatus | null;
  /** Attempts on file before this one (a step staff reopened). */
  earlierAttempts: number;
}

export interface AssessmentRecord {
  entries: AssessmentEntry[];
  /** Ava's own flags (ai_scorecard.riskFlags), verbatim, in her order. */
  riskFlags: string[];
  /** Still on the application form: Apply Now was pressed, nothing is sent yet. */
  fillingInForm: boolean;
  integrityTotal: number;
  jobId: string | null;
  /** What they are doing right now (the most recent unfinished attempt), or null. */
  live: LiveStatus | null;
}

/* ── Small readers ─────────────────────────────────────────────────────── */

type Obj = Record<string, unknown>;

function obj(value: unknown): Obj | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
}

/** 9.5 stays 9.5 (a pick-several earns half), 10 stays 10. */
export function formatCount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function fmtDuration(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  const secs = num(value);
  if (secs == null || secs <= 0) return null;
  const s = Math.round(secs);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function toMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function turnsOf(value: unknown): RecordTurn[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const turns: RecordTurn[] = [];
  for (const raw of value) {
    const t = obj(raw);
    if (!t) continue;
    const text = str(t.content) ?? str(t.text) ?? str(t.message);
    if (!text) continue;
    const role = str(t.role) ?? str(t.speaker) ?? "";
    const at = typeof t.timestamp === "number" ? new Date(t.timestamp).toISOString() : str(t.timestamp) ?? str(t.at);
    turns.push({ role: /^(user|candidate|applicant)$/i.test(role) ? "candidate" : "other", text, at });
  }
  return turns.length > 0 ? turns : null;
}

/* ── Integrity ─────────────────────────────────────────────────────────── */

const INTEGRITY_LABELS: Record<string, string> = {
  tab_switch: "Left the window",
  copy_attempt: "Tried to copy",
  paste_attempt: "Tried to paste",
  cut_attempt: "Tried to cut",
  right_click: "Right-clicked",
  keyboard_shortcut: "Used a blocked shortcut",
  screenshot: "Pressed the screenshot key",
  screenshot_attempt: "Pressed the screenshot key",
  devtools: "Opened developer tools",
};

export function integrityLabel(type: string): string {
  return INTEGRITY_LABELS[type] ?? type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

const EMPTY_TALLY: IntegrityTally = { total: 0, tabSwitches: 0, copyPaste: 0, other: 0, events: [], countsOnly: false };

/** Old-list types that are kept but never a flag — the same rule as the
 *  page's own counter (useTestIntegrity), the server's tally and the bell:
 *  a right-click, a blocked shortcut, and the server's catch-all `other`. */
const RECORDED_ONLY_TYPES = new Set(["right_click", "keyboard_shortcut", "other"]);

/**
 * Every integrity count a test result carries, whichever shape it kept:
 * `violations` / `antiCheatViolations` (an event list with times — quiz,
 * typing, the AI-ended interview), or `antiCheatSummary` (counts only — chat
 * practice and the End-button interview). Derived counts that sit beside an
 * event list (typing's `tabSwitches`, the quiz's `totalViolations`) count the
 * SAME events, so they are only used when there is no list.
 */
export function integrityOf(result: unknown): IntegrityTally {
  const r = obj(result);
  if (!r) return EMPTY_TALLY;
  const list = [r.violations, r.antiCheatViolations].find((v) => Array.isArray(v) && v.length > 0) as unknown[] | undefined;
  if (list) {
    const events: IntegrityEvent[] = [];
    for (const raw of list) {
      const v = obj(raw);
      const type = str(v?.type) ?? "unknown";
      const event: IntegrityEvent = { type, label: integrityLabel(type), at: str(v?.timestamp) ?? str(v?.at), detail: str(v?.details) ?? str(v?.detail) };
      if (RECORDED_ONLY_TYPES.has(type)) event.recordedOnly = true;
      events.push(event);
    }
    const counted = events.filter((e) => !e.recordedOnly);
    const tabSwitches = counted.filter((e) => e.type === "tab_switch").length;
    const copyPaste = counted.filter((e) => /^(copy|paste|cut)_attempt$/.test(e.type)).length;
    const tally: IntegrityTally = {
      total: counted.length,
      tabSwitches,
      copyPaste,
      other: counted.length - tabSwitches - copyPaste,
      events,
      countsOnly: false,
    };
    if (counted.length < events.length) tally.recordedOnly = events.length - counted.length;
    return tally;
  }
  const summary = obj(r.antiCheatSummary);
  if (summary) {
    const total = num(summary.violationCount) ?? 0;
    const tabSwitches = num(summary.tabSwitches) ?? 0;
    const copyPaste = num(summary.copyPasteAttempts) ?? 0;
    if (total > 0 || tabSwitches > 0 || copyPaste > 0) {
      const sum = Math.max(total, tabSwitches + copyPaste);
      return { total: sum, tabSwitches, copyPaste, other: Math.max(0, sum - tabSwitches - copyPaste), events: [], countsOnly: true };
    }
    return EMPTY_TALLY;
  }
  const tabSwitches = num(r.tabSwitches) ?? 0;
  const total = Math.max(num(r.totalViolations) ?? 0, tabSwitches);
  if (total > 0) return { total, tabSwitches, copyPaste: 0, other: total - tabSwitches, events: [], countsOnly: true };
  return EMPTY_TALLY;
}

/** "Left the window 2× · 1 copy or paste" — the row's flag line. With the
 *  server's counts it reads like the owner's bell card: "Left the window
 *  3 times (1m 12s away) · paste attempt ×1". */
export function integritySummary(t: IntegrityTally): string | null {
  if (t.total === 0) return null;
  let parts: string[];
  if (t.parts && t.parts.length > 0) {
    parts = t.parts;
  } else {
    parts = [];
    if (t.tabSwitches > 0) {
      parts.push(`left the window ${t.tabSwitches}×${t.awayMs && t.awayMs >= 1000 ? ` (${durationText(t.awayMs)} away)` : ""}`);
    }
    if (t.copyPaste > 0) parts.push(`${t.copyPaste} copy or paste`);
    if (t.other > 0) parts.push(`${t.other} other`);
  }
  const line = parts.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/* ── The server's record: sessions and events ──────────────────────────── */
// docs/ASSESSMENT-RECORD.md. Staff read both tables under RLS; nothing here
// fetches. Every reader below takes rows as the documented selects return
// them and degrades on anything missing.

/** One attempt (`assessment_sessions`), as the staff selects return it. */
export interface AssessmentSessionRow {
  id: string;
  application_id?: string | null;
  job_id?: string | null;
  step_id: string;
  step_type: string;
  attempt?: number | null;
  /** active · grading · completed · failed · abandoned · superseded */
  status: string;
  end_reason?: string | null;
  started_at?: string | null;
  last_activity_at?: string | null;
  last_heartbeat_at?: string | null;
  hidden_at?: string | null;
  ended_at?: string | null;
  progress?: unknown;
  context?: unknown;
  grading?: unknown;
  draft?: unknown;
  integrity_summary?: unknown;
  updated_at?: string | null;
}

/** One event (`assessment_events`). */
export interface AssessmentEventRow {
  session_id?: string | null;
  seq: number;
  /** candidate_turn · assistant_turn · quiz_shown · quiz_answer · typing_snapshot · integrity · system */
  kind: string;
  content?: string | null;
  detail?: unknown;
  duration_ms?: number | null;
  client_at?: string | null;
  created_at: string;
}

/** An active attempt this quiet reads as "left" (the lazy rule; no sweep needed). */
export const LEFT_AFTER_MS = 10 * 60 * 1000;
/** A switch away shorter than this is a blip: on the timeline, never a flag. */
export const SHORT_AWAY_MS = 1000;

/** "1m 12s", "45s", "under 1s", "1h 5m" — the same words the owner's bell
 *  card uses (public.assessment_duration_text). */
export function durationText(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 1000) return "under 1s";
  const total = Math.floor(ms);
  if (total < 60_000) return `${Math.floor(total / 1000)}s`;
  if (total < 3_600_000) {
    const secs = Math.floor((total % 60_000) / 1000);
    return `${Math.floor(total / 60_000)}m${secs > 0 ? ` ${secs}s` : ""}`;
  }
  const mins = Math.floor((total % 3_600_000) / 60_000);
  return `${Math.floor(total / 3_600_000)}h${mins > 0 ? ` ${mins}m` : ""}`;
}

/** "just now", "1 min ago", "25 min ago", "2 h ago", "3 days ago". */
export function agoText(ms: number): string {
  if (!Number.isFinite(ms) || ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** "under a minute", "3 min", "2 h", "3 days" — how long something has lasted. */
function lastedText(ms: number): string {
  if (!Number.isFinite(ms) || ms < 60_000) return "under a minute";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export type LiveState = "doing" | "away" | "left" | "checking" | "finished" | "failed";

/** The colour of a live line: amber once they have gone from the test. */
export function liveTone(state: LiveState | null | undefined): string {
  return state === "left" || state === "away" ? "var(--amber-fg)" : state === "failed" ? "var(--crit)" : "var(--ink-3)";
}

/** Where an attempt stands, in the owner's words. */
export interface LiveStatus {
  state: LiveState;
  /** The row's line: "Answering question 3 of 10 · active 1 min ago". */
  text: string;
  /** The same for a line about the PERSON, naming the test when the words
   *  alone do not: "Written interview: in the conversation · 4 replies · active 1 min ago". */
  summary: string;
  /** The journey rail's short receipt: "Question 3 of 10", "Left". */
  receipt: string;
  stepId: string;
  stepType: string;
  /** The applicant's last move (ISO), for ordering. */
  lastActivityAt: string | null;
}

/** The connection check page's own hint: `progress.client`, where
 *  touch_assessment_session puts it (a flat `progress` is read too). */
function connectionHint(session: AssessmentSessionRow): Obj {
  const p = obj(session.progress) ?? {};
  return obj(p.client) ?? p;
}

function progressOf(session: AssessmentSessionRow): { answered: number | null; total: number | null; index: number | null; turns: number } {
  const p = obj(session.progress) ?? {};
  return {
    answered: num(p.answered),
    total: num(p.total),
    index: num(p.current_index),
    turns: num(p.candidate_turns) ?? 0,
  };
}

const CHAT_STEPS = new Set(["chat_simulation", "chat_interview", "sales_simulation"]);

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The live label for one attempt — the contract's lazy "left" rule
 * (docs/ASSESSMENT-RECORD.md §5.3), in this order:
 *
 *   active & quiet ≥ 10 min  → "Left <where> · last active <quiet ago>"
 *   abandoned                → the same "Left …" label
 *   active & hidden_at set   → "Away from the test for <how long>"
 *   active                   → "<doing> · active <quiet ago>"
 *   grading                  → "Checking the answers"
 *   completed                → "Finished <ago>"
 *   failed                   → "Checking failed. Retrying"
 *   superseded               → null (a newer attempt exists)
 */
export function sessionLiveStatus(session: AssessmentSessionRow, now: number, title?: string | null): LiveStatus | null {
  const type = session.step_type === "video_message" ? "video_intro" : session.step_type;
  const { answered, total, index, turns } = progressOf(session);
  const lastAt = toMillis(session.last_activity_at) ?? toMillis(session.started_at);
  const quiet = lastAt != null ? Math.max(0, now - lastAt) : 0;
  const base = { stepId: session.step_id, stepType: type, lastActivityAt: session.last_activity_at ?? session.started_at ?? null };
  const named = (text: string) =>
    type === "application" || type === "quiz" || !title ? text : `${title}: ${lowerFirst(text)}`;
  const make = (state: LiveState, text: string, receipt: string): LiveStatus => ({ ...base, state, text, summary: named(text), receipt });

  // The connection check's three screens (docs/EQUIPMENT-CHECK.md §3): which
  // computer, the test, the result. The page's own hint (`progress.client`,
  // docs/ASSESSMENT-RECORD.md §2.5) names the screen they are on and the run
  // (`run` while one is under way, `runs_done` on the result); a page that
  // wrote neither is on the test. A run that did not finish (`failed`) leaves
  // them on its "Try again" screen, not in a test that is running.
  const connection = (() => {
    const p = connectionHint(session);
    const screen = str(p.screen);
    const run = num(p.run) ?? num(p.runs_done);
    const runText = run != null && run > 1 ? ` · run ${run}` : "";
    if (screen === "which" || screen === "computer" || screen === "device") return { doing: "Choosing the computer", receipt: "Which computer", where: "before the speed test" };
    if (p.failed === true) return { doing: `The speed test did not finish${run != null ? ` · run ${run}` : ""}`, receipt: "Did not finish", where: "after a speed test that did not finish" };
    if (screen === "result") return { doing: `Looking at the result${runText}`, receipt: run != null && run > 1 ? `Run ${run} done` : "Result", where: "at the result" };
    return { doing: `Running the speed test${runText}`, receipt: run != null && run > 1 ? `Run ${run}` : "Speed test", where: "during the speed test" };
  })();

  const doing = (() => {
    if (type === "application") {
      return total != null && total > 0 ? `Filling in the form · ${answered ?? 0} of ${total} answered` : "Filling in the form";
    }
    if (type === "quiz") {
      if (index == null) return "Starting the skills check";
      return `Answering question ${index + 1}${total != null && total > 0 ? ` of ${total}` : ""}`;
    }
    if (CHAT_STEPS.has(type)) return turns > 0 ? `In the conversation · ${plural(turns, "reply", "replies")}` : "In the conversation";
    if (type === "typing_test") return "Typing";
    if (type === "equipment_check") return connection.doing;
    return "Taking the test";
  })();
  const doingReceipt = (() => {
    if (type === "application") return total != null && total > 0 ? `${answered ?? 0} of ${total} answered` : "Filling in";
    if (type === "quiz") return index == null ? "Started" : `Question ${index + 1}${total != null && total > 0 ? ` of ${total}` : ""}`;
    if (CHAT_STEPS.has(type)) return turns > 0 ? plural(turns, "reply", "replies") : "Started";
    if (type === "typing_test") return "Typing";
    if (type === "equipment_check") return connection.receipt;
    return "In progress";
  })();
  const where = (() => {
    if (type === "application") return total != null && total > 0 ? `the form at ${answered ?? 0} of ${total}` : "the form";
    if (type === "quiz") return index == null ? "at the start" : `at question ${index + 1}`;
    if (CHAT_STEPS.has(type)) return turns > 0 ? `after ${plural(turns, "reply", "replies")}` : "before replying";
    if (type === "typing_test") return "during the typing test";
    if (type === "equipment_check") return connection.where;
    return "part-way";
  })();
  const left = () => make("left", `Left ${where} · last active ${agoText(quiet)}`, "Left");

  switch (session.status) {
    case "superseded":
      return null;
    case "grading":
      return make("checking", "Checking the answers", "Checking");
    case "failed":
      return make("failed", "Checking failed. Retrying", "Checking failed");
    case "completed": {
      const ended = toMillis(session.ended_at) ?? toMillis(session.updated_at);
      return make("finished", ended != null ? `Finished ${agoText(Math.max(0, now - ended))}` : "Finished", "Finished");
    }
    case "abandoned":
      return left();
    case "active": {
      if (quiet >= LEFT_AFTER_MS) return left();
      const hiddenAt = toMillis(session.hidden_at);
      if (hiddenAt != null) return make("away", `Away from the test for ${lastedText(Math.max(0, now - hiddenAt))}`, "Away");
      return make("doing", `${doing} · active ${agoText(quiet)}`, doingReceipt);
    }
    default:
      return null;
  }
}

const LIVE_STATUSES = new Set(["active", "grading"]);

/** The attempt to show for a step: the live one, else the latest that was not
 *  replaced. Null when there is none (or only replaced ones). */
export function sessionForStep(sessions: readonly AssessmentSessionRow[] | null | undefined, stepId: string): AssessmentSessionRow | null {
  const mine = (sessions ?? []).filter((s) => s && s.step_id === stepId && s.status !== "superseded");
  if (mine.length === 0) return null;
  const live = mine.find((s) => LIVE_STATUSES.has(s.status));
  if (live) return live;
  return mine.reduce((a, b) => ((b.attempt ?? 1) > (a.attempt ?? 1) ? b : a));
}

function attemptNo(s: AssessmentSessionRow): number {
  return s.attempt ?? 1;
}

/** Sent, and the result is on file or owed: the attempt a result belongs to. */
const SENT_STATUSES = new Set(["completed", "grading", "failed"]);

/**
 * The attempts of one step, read against what the notes say. Notes decide
 * what is DONE; this decides WHICH attempt a row shows, so one attempt's
 * transcript, grading or flags are never laid over another's result:
 *
 *  - `rechecking`: a newer attempt was sent and is still being checked while
 *    an earlier one's result is on file (a retake, after the server moved
 *    the phase on). Until it lands, the step reads "Checking the answers".
 *  - `result`: the attempt whose result is on file — the latest that was
 *    sent, never an attempt opened after it; with none sent, the latest
 *    (a result recorded by a path that never closed its attempt).
 *  - `retake`: the attempt of a step handed back for a retake — only one
 *    opened after the last finished one; null until it starts.
 */
export function stepAttempts(
  sessions: readonly AssessmentSessionRow[] | null | undefined,
  stepId: string,
): { all: AssessmentSessionRow[]; result: AssessmentSessionRow | null; retake: AssessmentSessionRow | null; lastCompleted: AssessmentSessionRow | null; rechecking: boolean } {
  const all = (sessions ?? []).filter((s) => s && s.step_id === stepId).sort((a, b) => attemptNo(a) - attemptNo(b));
  const current = all.filter((s) => s.status !== "superseded");
  const latest = current[current.length - 1] ?? null;
  const lastCompleted = [...current].reverse().find((s) => s.status === "completed") ?? null;
  const newer = !!latest && !!lastCompleted && attemptNo(latest) > attemptNo(lastCompleted);
  const rechecking = newer && (latest!.status === "grading" || latest!.status === "failed");
  const result = rechecking
    ? lastCompleted
    : [...current].reverse().find((s) => SENT_STATUSES.has(s.status)) ?? sessionForStep(current, stepId);
  const retake = latest && latest.status !== "completed" && (!lastCompleted || newer) ? latest : null;
  return { all, result, retake, lastCompleted, rechecking };
}

/* ── A step handed back for a retake (assessment_step_reopens) ─────────── */

/** One staff hand-back (`public.assessment_step_reopens`, contract §2.8): one
 *  row per application + step, the latest hand-back. Written only by the
 *  server's trigger when a write that is not the applicant's own puts the
 *  application back on a finished step; staff of the job may read it. */
export interface StepReopenRow {
  application_id?: string | null;
  step_id: string;
  job_id?: string | null;
  /** The latest hand-back, database time. */
  reopened_at?: string | null;
  /** The staff member, or null for the service role / SQL editor. */
  reopened_by?: string | null;
  reopen_count?: number | null;
}

/** Attempts as the staff hooks hand them over: the rows, with the
 *  application's reopen markers riding along (see `withReopens`). */
export type SessionList = readonly AssessmentSessionRow[] & { readonly reopens?: readonly StepReopenRow[] | null };

/**
 * The attempts with the reopen markers attached, so a caller that passes
 * `{ sessions }` to the builder hands it both. A fresh array every call: the
 * markers are never stored inside a cached list (a cache merge copies only
 * the rows and would drop them).
 */
export function withReopens(
  sessions: readonly AssessmentSessionRow[] | null | undefined,
  reopens: readonly StepReopenRow[] | null | undefined,
): SessionList | undefined {
  if (!sessions && !reopens) return undefined;
  const list = [...(sessions ?? [])] as AssessmentSessionRow[] & { reopens?: readonly StepReopenRow[] | null };
  list.reopens = reopens ?? [];
  return list;
}

/**
 * The staff hand-back that makes a finished step theirs to take again, or
 * null. The same rule as the server's `assessment_step_completion`: status
 * `pending` with `phase` on the step (what every phase page shows as a
 * retake, `isRetakeOpen`) AND a reopen marker newer than the result on file
 * — the later of `notes._trusted[step].completedAt` (only the server writes
 * it) and the step's last completed attempt; a result with neither time is
 * older than any marker. Status and phase alone are never proof: the
 * applicant can set their own status to `pending`. The form and the quiz
 * are never reopened this way (a quiz retake is staff clearing its result).
 */
export function retakeMarker(
  app: { phase?: string | null; status?: string | null },
  step: Pick<CandidateJourneyStep, "id" | "type">,
  notes: Obj | null | undefined,
  sessions: readonly AssessmentSessionRow[] | null | undefined,
  reopens: readonly StepReopenRow[] | null | undefined,
): StepReopenRow | null {
  if (step.type === "application" || step.type === "quiz") return null;
  if (!isRetakeOpen({ phase: app.phase, status: app.status }, step)) return null;
  const marker = (reopens ?? []).find((r) => r && r.step_id === step.id) ?? null;
  const markedAt = toMillis(marker?.reopened_at);
  if (!marker || markedAt == null) return null;
  const trusted = toMillis(obj(obj(notes?._trusted)?.[step.id])?.completedAt);
  const ended = (sessions ?? [])
    .filter((s) => s && s.step_id === step.id && s.status === "completed")
    .map((s) => toMillis(s.ended_at))
    .filter((ms): ms is number => ms != null);
  const times = [trusted, ...ended].filter((ms): ms is number => ms != null);
  const resultAt = times.length > 0 ? Math.max(...times) : null;
  return resultAt == null || markedAt > resultAt ? marker : null;
}

/** The bell card's words for a set of flag counts, in its order. */
export function integrityParts(counts: Record<string, number>, awayMs: number): string[] {
  const n = (k: string) => Math.max(0, counts[k] ?? 0);
  const parts: string[] = [];
  if (n("away") > 0) {
    parts.push(`left the window ${plural(n("away"), "time", "times")}${awayMs >= 1000 ? ` (${durationText(awayMs)} away)` : ""}`);
  }
  if (n("paste") > 0) parts.push(`paste attempt ×${n("paste")}`);
  if (n("bulk_insert") > 0) parts.push(`pasted-in text ×${n("bulk_insert")}`);
  if (n("copy") > 0) parts.push(`copy attempt ×${n("copy")}`);
  if (n("screenshot_key") > 0) parts.push(`screenshot attempt ×${n("screenshot_key")}`);
  if (n("screenshot_suspected") > 0) parts.push(`possible screenshot ×${n("screenshot_suspected")}`);
  if (n("devtools") > 0) parts.push(`developer tools opened ×${n("devtools")}`);
  if (n("page_closed") > 0) parts.push(`closed the test page ×${n("page_closed")}`);
  return parts;
}

/** Counts in the order and the words of the owner's bell card
 *  (public.assessment_integrity_alert), from `integrity_summary`. Null when
 *  the server has recorded nothing for the attempt. */
export function integrityFromSummary(summary: unknown): IntegrityTally | null {
  const s = obj(summary);
  if (!s) return null;
  const counts = obj(s.counts) ?? {};
  const c = (k: string) => Math.max(0, num(counts[k]) ?? 0);
  const shortAway = Math.max(0, num(s.short_away) ?? 0);
  const away = Math.max(0, c("tab_hidden") + c("window_blur") - shortAway);
  const awayMs = Math.max(0, num(s.away_ms) ?? 0);
  const paste = c("paste");
  const bulk = c("bulk_insert");
  const copy = c("copy") + c("cut");
  const shot = c("screenshot_key");
  const maybeShot = c("screenshot_suspected");
  const devtools = c("devtools");
  const closed = c("page_closed");
  const recordedOnly = c("right_click") + c("other");
  if (away + paste + bulk + copy + shot + maybeShot + devtools + closed + recordedOnly + shortAway === 0) return null;

  const parts = integrityParts({ away, paste, bulk_insert: bulk, copy, screenshot_key: shot, screenshot_suspected: maybeShot, devtools, page_closed: closed }, awayMs);

  const copyPaste = paste + bulk + copy;
  const other = shot + maybeShot + devtools + closed;
  return {
    counts: { away, paste, bulk_insert: bulk, copy, screenshot_key: shot, screenshot_suspected: maybeShot, devtools, page_closed: closed },
    total: away + copyPaste + other,
    tabSwitches: away,
    copyPaste,
    other,
    events: [],
    countsOnly: false,
    awayMs,
    shortAway,
    recordedOnly,
    parts,
    fromSession: true,
  };
}

/* ── Events: transcripts, typing, quiz timing, the integrity timeline ──── */

/** Both sides of a chat, in the order the server stored them. */
export function transcriptFromEvents(events: readonly AssessmentEventRow[] | null | undefined): RecordTurn[] | null {
  const turns: RecordTurn[] = [];
  for (const e of [...(events ?? [])].sort((a, b) => a.seq - b.seq)) {
    if (e.kind !== "candidate_turn" && e.kind !== "assistant_turn") continue;
    const text = typeof e.content === "string" ? e.content.trim() : "";
    if (!text) continue;
    turns.push({ role: e.kind === "candidate_turn" ? "candidate" : "other", text, at: e.created_at ?? null });
  }
  return turns.length > 0 ? turns : null;
}

const wordsOf = (text: string) => text.trim().split(/\s+/).filter((w) => w.length > 0);

/**
 * What they typed against the passage, word by word — the grader's own rule
 * (submit-typing-test calculateResults: typed word i against passage word i),
 * so every word marked wrong here is one the accuracy figure counted wrong.
 */
export function typingWords(typed: string, passage: string): { typed: TypingWord[]; passage: TypingWord[]; wrong: number } {
  const t = wordsOf(typed);
  const p = wordsOf(passage);
  let wrong = 0;
  const typedOut: TypingWord[] = t.map((w, i) => {
    if (i >= p.length) {
      wrong += 1;
      return { text: w, state: "extra", expected: null };
    }
    if (w === p[i]) return { text: w, state: "ok", expected: null };
    wrong += 1;
    return { text: w, state: "wrong", expected: p[i] };
  });
  const passageOut: TypingWord[] = p.map((w, i) => ({
    text: w,
    state: i >= t.length ? "missed" : t[i] === w ? "ok" : "wrong",
    expected: null,
  }));
  return { typed: typedOut, passage: passageOut, wrong };
}

export interface QuizTiming {
  seconds: number | null;
  approximate: boolean;
  changes: number;
  /** The latest pick, as the page held it (an index or the option's text). */
  answer: unknown;
}

/** Time on each question, from the latest `quiz_answer` per question (the
 *  server's clock; `timing_source` other than "server" is marked approximate). */
export function quizTimings(events: readonly AssessmentEventRow[] | null | undefined): Map<string, QuizTiming> {
  const out = new Map<string, QuizTiming>();
  for (const e of [...(events ?? [])].sort((a, b) => a.seq - b.seq)) {
    if (e.kind !== "quiz_answer") continue;
    const d = obj(e.detail) ?? {};
    const id = str(d.question_id);
    if (!id) continue;
    const prev = out.get(id);
    const seconds = num(d.seconds_on_question) ?? (num(e.duration_ms) != null ? Math.round(num(e.duration_ms)! / 1000) : null);
    // Every save is stored (a retried send, a written answer saved after
    // each pause in typing), and the server's own `changed` only says an
    // earlier save exists. A change is a DIFFERENT answer from the last one.
    const changed = !!prev && answerKey(prev.answer) !== answerKey(d.answer);
    out.set(id, {
      seconds,
      approximate: str(d.timing_source) != null && d.timing_source !== "server",
      changes: (prev?.changes ?? 0) + (changed ? 1 : 0),
      answer: d.answer,
    });
  }
  return out;
}

/** One answer as a comparable string: picks in any order are the same picks. */
function answerKey(answer: unknown): string {
  const one = (v: unknown) => (typeof v === "string" ? JSON.stringify(v.trim()) : JSON.stringify(v ?? null));
  return Array.isArray(answer) ? `[${answer.map(one).sort().join(",")}]` : one(answer);
}

/** One line of the integrity timeline: a flag, a blip, or a neutral marker. */
export interface TimelineItem {
  /** When it happened: the page's time when it sent one, else the server's. */
  at: string | null;
  /** The same moment on the server's clock, for placing it among the
   *  conversation's turns (which carry the server's times): the page's time
   *  moved by how far that page's clock is off, else the server's own. */
  serverAt: string | null;
  /** The integrity kind (tab_hidden, paste…) or `system:<what>`. */
  kind: string;
  /** In plain words: "Left the window", "Tried to paste", "Started the test". */
  label: string;
  /** Time away, for a switch away (or a "came back"). */
  awayMs: number | null;
  /** A switch away under a second: shown, never counted. */
  short: boolean;
  /** Arrived from a closing tab after the test was sent. */
  afterEnd: boolean;
  /** True for something that counts as a flag; false for markers and recorded-only lines. */
  flag: boolean;
  /** Extra words: "dropped in", "Ctrl+P". */
  note: string | null;
}

const TIMELINE_LABELS: Record<string, string> = {
  tab_hidden: "Left the window",
  window_blur: "Clicked out of the window",
  paste: "Tried to paste",
  bulk_insert: "Text appeared without typing",
  copy: "Tried to copy",
  cut: "Tried to cut",
  screenshot_key: "Pressed the screenshot key",
  screenshot_suspected: "Possible screenshot",
  devtools: "Opened developer tools",
  page_closed: "Closed or reloaded the test page",
  right_click: "Right-clicked",
  other: "Something else was blocked",
};
const RECORDED_ONLY = new Set(["right_click", "other"]);

const SYSTEM_LABELS: Record<string, string> = {
  started: "Started the test",
  reloaded: "Reloaded the page",
  came_back: "Came back",
  submitted: "Sent it",
  marked_left: "Marked as left",
};

/** The integrity record of one attempt, in order: every switch away with how
 *  long, every blocked paste or screenshot, and the start / reload / return
 *  markers that explain the gaps. */
/**
 * How far the page's clock is behind the server's (ms), from one attempt's
 * integrity events. Each is stored at least as late as it happened: an away
 * episode is sent on return (its `client_at` is when they left, so its
 * duration comes off), anything else as it happens or from the retry queue.
 * The smallest gap is the closest to the clock offset itself (a queued send
 * only ever adds to it). Null when no event carries both times.
 */
export function pageClockOffsetMs(events: readonly AssessmentEventRow[] | null | undefined): number | null {
  let best: number | null = null;
  for (const e of events ?? []) {
    if (e.kind !== "integrity") continue;
    const client = toMillis(e.client_at);
    const server = toMillis(e.created_at);
    if (client == null || server == null) continue;
    const d = obj(e.detail) ?? {};
    const kind = str(d.kind);
    const awayMs = kind === "tab_hidden" || kind === "window_blur" ? num(e.duration_ms) ?? num(d.duration_ms) ?? 0 : 0;
    const gap = server - (client + awayMs);
    if (best == null || gap < best) best = gap;
  }
  return best;
}

export function integrityTimeline(events: readonly AssessmentEventRow[] | null | undefined): TimelineItem[] {
  const out: TimelineItem[] = [];
  // Per attempt: a timeline across tests mixes pages, each with its own clock.
  const offsets = new Map<string | null, number | null>();
  const offsetFor = (sessionId: string | null | undefined) => {
    const key = sessionId ?? null;
    if (!offsets.has(key)) offsets.set(key, pageClockOffsetMs((events ?? []).filter((x) => (x.session_id ?? null) === key)));
    return offsets.get(key) ?? null;
  };
  for (const e of [...(events ?? [])].sort((a, b) => a.seq - b.seq)) {
    const d = obj(e.detail) ?? {};
    if (e.kind === "integrity") {
      const kind = str(d.kind) ?? "other";
      const awayKind = kind === "tab_hidden" || kind === "window_blur";
      const awayMs = awayKind ? num(e.duration_ms) ?? num(d.duration_ms) : null;
      const short = awayKind && awayMs != null && awayMs < SHORT_AWAY_MS;
      let note: string | null = null;
      if (kind === "bulk_insert" && d.via === "drop") note = "dropped in";
      else if (kind === "other") note = str(d.key) ? `${str(d.what) ?? "shortcut"} ${str(d.key)}` : str(d.reported_kind) ?? str(d.what);
      const client = toMillis(e.client_at);
      const offset = offsetFor(e.session_id);
      out.push({
        at: e.client_at ?? e.created_at ?? null,
        serverAt: client != null && offset != null ? new Date(client + offset).toISOString() : e.created_at ?? e.client_at ?? null,
        kind,
        label: TIMELINE_LABELS[kind] ?? integrityLabel(kind),
        awayMs,
        short,
        afterEnd: d.after_end === true,
        flag: !short && !RECORDED_ONLY.has(kind),
        note,
      });
    } else if (e.kind === "system") {
      const what = str(d.what) ?? "other";
      if (!(what in SYSTEM_LABELS)) continue;
      const attempt = num(d.attempt);
      out.push({
        at: e.created_at ?? null,
        serverAt: e.created_at ?? null,
        kind: `system:${what}`,
        label: what === "started" && attempt != null && attempt > 1 ? `Started attempt ${attempt}` : SYSTEM_LABELS[what],
        awayMs: what === "came_back" ? num(d.away_ms) : null,
        short: false,
        afterEnd: false,
        flag: false,
        note: null,
      });
    }
  }
  return out;
}

/** "Left the window for 1m 7s", "Tried to paste", "Came back after 25m". */
export function timelineText(item: TimelineItem): string {
  if (item.awayMs != null && item.kind.startsWith("system:")) return `${item.label} after ${durationText(item.awayMs)}`;
  if (item.awayMs != null) return `${item.label} for ${durationText(item.awayMs)}`;
  return item.label;
}

/** A timeline item's tags: "not counted" (a blip), "recorded only", "after sending". */
export function timelineTags(item: TimelineItem): string[] {
  const tags: string[] = [];
  // The duration already says "under 1s"; the tag says what that means.
  if (item.short) tags.push("not counted");
  if (!item.flag && !item.short && !item.kind.startsWith("system:")) tags.push("recorded only");
  if (item.afterEnd) tags.push("after sending");
  if (item.note) tags.push(item.note);
  return tags;
}

/* ── Quiz answer keys ──────────────────────────────────────────────────── */

export interface QuizKeyRow {
  step_id: string;
  question_id: string;
  key: unknown;
}

/** The legacy top-level quiz's step id in job_quiz_keys (see quizAnswerKeys.ts). */
export const QUIZ_QUESTIONS_KEY_STEP = "__quiz_questions__";

/** Keys for one quiz, by question id. */
export function quizKeyMap(rows: readonly QuizKeyRow[] | null | undefined, keyStepId: string): Map<string, Obj> {
  const map = new Map<string, Obj>();
  for (const row of rows ?? []) {
    const key = obj(row?.key);
    if (row?.step_id === keyStepId && key) map.set(row.question_id, key);
  }
  return map;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * The right option(s) for one question, from its answer key — the same three
 * key spellings `submit_quiz_attempt` grades against: `correctAnswer` (an
 * index), `correct_answer` (an index or the option's text) and
 * `correct_answers` (texts, for pick-several). Null when the key holds no
 * answer (a text or fit question has none).
 */
export function correctOptionsFor(item: QuizItem, key: Obj | null | undefined): { indexes: number[]; texts: string[] } | null {
  if (!key) return null;
  const byIndex = (i: number) => (Number.isInteger(i) && i >= 0 && i < item.options.length ? { indexes: [i], texts: [item.options[i]] } : null);
  const byTexts = (texts: string[]) => {
    const indexes = texts.map((t) => item.options.findIndex((o) => norm(o) === norm(t))).filter((i) => i >= 0);
    return { indexes, texts };
  };
  const many = strList(key.correct_answers);
  if (many.length > 0) return byTexts(many);
  const idx = num(key.correctAnswer);
  if (idx != null) return byIndex(idx);
  const single = key.correct_answer;
  if (typeof single === "number") return byIndex(single);
  if (typeof single === "string" && single.trim()) return byTexts([single]);
  return null;
}

/* ── Applicant triage (the Applicants page's tabs) ─────────────────────── */

export type ApplicantBucket = "sealed" | "reading" | "started" | "passed";

/** Still on the application form: the row exists (Apply Now inserts it as
 *  `in_progress`) but nothing has been sent. */
export function isFillingInForm(status: string | null | undefined): boolean {
  return status === "in_progress";
}

/** Which tab a person sits on. Someone still filling in the form is never
 *  "being read": Ava has nothing of theirs yet. */
export function applicantBucket(c: { stage: string; analyzed: boolean; fillingInForm?: boolean }): ApplicantBucket {
  if (c.stage === "Rejected") return "passed";
  if (c.fillingInForm) return "started";
  return c.analyzed ? "sealed" : "reading";
}

/** The tab to open on until the owner picks one: the first that has anyone
 *  on it, so a lone applicant who has just pressed Apply is on screen, not
 *  behind an empty "Sealed · 0". */
export function defaultApplicantBucket(counts: Record<ApplicantBucket, number>): ApplicantBucket {
  const order: ApplicantBucket[] = ["sealed", "reading", "started", "passed"];
  return order.find((b) => counts[b] > 0) ?? "sealed";
}

/** The tab the Applicants page shows.
 *
 *  `chosen` is the tab the owner picked for this job (or a link asked for),
 *  else the data picks one. `onScreen` is the tab of the person on screen, if
 *  they are still listed. That person leads when they move forward — the form
 *  is sent, Ava seals them — so a live move never swaps them for a stranger.
 *  A Pass is not followed (the owner's or a teammate's): the tab stays where
 *  it is and the next person shows, so triage is never pulled onto
 *  "Didn't make it". */
export function applicantTab(input: {
  counts: Record<ApplicantBucket, number>;
  chosen: ApplicantBucket | null;
  onScreen: ApplicantBucket | null;
}): ApplicantBucket {
  const base = input.chosen ?? defaultApplicantBucket(input.counts);
  if (input.onScreen == null) return base;
  if (input.onScreen === "passed" && base !== "passed") return base;
  return input.onScreen;
}

/** `?tab=` on /applicants: the Dashboard's "see who is applying" lands on the
 *  Applying tab instead of wherever the data would open. */
export function applicantTabParam(value: string | null | undefined): ApplicantBucket | null {
  switch (value) {
    case "applying":
    case "started":
      return "started";
    case "sealed":
    case "reading":
    case "passed":
      return value;
    default:
      return null;
  }
}

/* ── The builder ───────────────────────────────────────────────────────── */

const DECIDED_STATUSES = new Set(["rejected", "hired", "offered", "interview"]);

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function kindFor(type: string): AssessmentKind {
  switch (type) {
    case "application":
    case "quiz":
    case "equipment_check":
    case "typing_test":
    case "chat_simulation":
    case "chat_interview":
    case "sales_simulation":
    case "voice_interview":
    case "portfolio_upload":
      return type;
    case "video_intro":
    case "video_message":
      return "video_intro";
    default:
      return "other";
  }
}

interface BuildContext {
  app: AssessmentAppInput;
  notes: Obj;
  rawSteps: Obj[];
  passing: number;
  riskFlags: string[];
}

interface Built {
  headline: string | null;
  tone: AssessmentTone;
  verdict: string | null;
  subline: string | null;
  receipt: string | null;
  completedAt: string | null;
  integrity: IntegrityTally;
  detail: AssessmentDetail | null;
}

function scoreTone(score: number | null, passing: number): AssessmentTone {
  if (score == null) return "ink";
  return score >= passing ? "jade" : "amber";
}

function completedAtFor(ctx: BuildContext, stepId: string, record: Obj | null): string | null {
  const trusted = obj(obj(ctx.notes._trusted)?.[stepId]);
  return str(trusted?.completedAt) ?? str(record?.completedAt) ?? null;
}

/** Files attached to the form, by question (notes.fileUploads: `{ url,
 *  imageUrls, isResume }`, the shape ApplicationFormPhase writes). */
function uploadsOf(ctx: BuildContext): Map<string, { path: string; pages: string[]; isResume: boolean }> {
  const map = new Map<string, { path: string; pages: string[]; isResume: boolean }>();
  const raw = obj(ctx.notes.fileUploads);
  if (!raw) return map;
  for (const [questionId, value] of Object.entries(raw)) {
    const u = obj(value);
    const pages = strList(u?.imageUrls);
    const path = str(u?.url) ?? str(u?.fileUrl) ?? pages[0] ?? null;
    if (path) map.set(questionId, { path, pages, isResume: u?.isResume === true });
  }
  return map;
}

function buildApplication(ctx: BuildContext): Built {
  const answers: AnswerItem[] = [];
  const files = uploadsOf(ctx);
  const raw = Array.isArray(ctx.notes.applicationAnswers) ? (ctx.notes.applicationAnswers as unknown[]) : [];
  raw.forEach((value, i) => {
    const a = obj(value);
    if (!a) return;
    const selected = strList(a.selected).length > 0 ? strList(a.selected) : Array.isArray(a.answer) ? strList(a.answer) : null;
    const answer = typeof a.answer === "string" ? a.answer : selected ? selected.join("; ") : a.answer == null ? "" : String(a.answer);
    const id = str(a.questionId) ?? `answer-${i}`;
    const upload = files.get(id);
    const type = str(a.type);
    answers.push({
      id,
      question: str(a.question) ?? `Question ${i + 1}`,
      answer,
      selected: selected && selected.length > 0 ? selected : null,
      type,
      file: upload
        ? { path: upload.path, pages: upload.pages }
        : type === "file" && answer.trim() && !/^https?:\/\//i.test(answer.trim())
          ? { path: answer.trim(), pages: [] }
          : null,
    });
  });
  const uploads: UploadItem[] = [...files.entries()].map(([questionId, u]) => ({
    questionId,
    question: answers.find((a) => a.id === questionId)?.question ?? (u.isResume ? "Resume" : "Attached file"),
    path: u.path,
    pages: u.pages,
    isResume: u.isResume,
  }));
  const coverLetter = str(ctx.app.cover_letter);
  // Ava's deal-breaker line belongs above the answers it is about.
  const flags = ctx.riskFlags.filter((f) => /deal[- ]?breaker|non[- ]?negotiable/i.test(f));
  const headline = answers.length > 0 ? `${answers.length} ${answers.length === 1 ? "answer" : "answers"}` : "Sent";
  return {
    headline,
    tone: "ink",
    verdict: null,
    // The resume has its own row, right below.
    subline: coverLetter ? "Cover letter" : null,
    receipt: answers.length > 0 ? headline : null,
    completedAt: null,
    integrity: integrityOf(ctx.notes.applicationIntegrity),
    detail: { kind: "application", answers, coverLetter, hasResume: !!ctx.app.resume_url, flags, uploads, draft: null },
  };
}

interface QuizSource {
  record: Obj | null;
  questions: Obj[];
  keyStepId: string;
}

/** Where this job keeps its quiz, mirroring `submit_quiz_attempt`: a
 *  workflow step of type quiz with its own questions wins (keys under that
 *  step's id, record at notes[step.id]); otherwise the job's top-level
 *  quiz_questions (keys under `__quiz_questions__`, record at notes.quiz). */
function quizSource(ctx: BuildContext): QuizSource {
  const index = ctx.rawSteps.findIndex((s) => s.type === "quiz" && Array.isArray(obj(s.config)?.questions));
  if (index >= 0) {
    const step = ctx.rawSteps[index];
    const keyStepId = str(step.id) ?? `__step_${index}`;
    return {
      record: obj(ctx.notes[keyStepId]) ?? obj(ctx.notes.quiz),
      questions: ((obj(step.config)?.questions as unknown[]) ?? []).map((q) => obj(q) ?? {}),
      keyStepId,
    };
  }
  const top = ctx.app.jobs?.quiz_questions;
  return {
    record: obj(ctx.notes.quiz),
    questions: Array.isArray(top) ? top.map((q) => obj(q) ?? {}) : [],
    keyStepId: QUIZ_QUESTIONS_KEY_STEP,
  };
}

function quizQuestionRefs(questions: Obj[]): QuizQuestionRef[] {
  return questions.map((q, i) => ({
    id: str(q.id) ?? `__idx_${i}`,
    index: i,
    question: str(q.question) ?? `Question ${i + 1}`,
    category: str(q.category),
    options: strList(q.options),
    type: quizItemType(null, q),
  }));
}

function quizItemType(stored: string | null, q: Obj | null): QuizItem["type"] {
  if (stored === "multi_select" || stored === "text" || stored === "fit") return stored;
  const type = str(q?.type);
  if (type === "multi_select") return "multi_select";
  if (type && ["personality", "situational", "work_style"].includes(type)) return "fit";
  if (type && ["text", "open_ended", "short_answer", "long_answer"].includes(type)) return "text";
  return "multiple_choice";
}

function buildQuiz(ctx: BuildContext): Built {
  const { record, questions, keyStepId } = quizSource(ctx);
  const aggregate = obj(ctx.notes.quizResult);
  const correct = num(record?.correct) ?? num(aggregate?.correct);
  const total = num(record?.total) ?? num(aggregate?.total);
  const score = num(record?.score) ?? num(aggregate?.score);
  const passedRaw = record?.passed ?? aggregate?.passed;
  const passed = typeof passedRaw === "boolean" ? passedRaw : null;

  const answers = Array.isArray(record?.answers) ? (record!.answers as unknown[]) : [];
  const items: QuizItem[] = answers.map((value, i) => {
    const a = obj(value) ?? {};
    const storedId = str(a.questionId);
    const qIndex = storedId ? questions.findIndex((q, qi) => (str(q.id) ?? `__idx_${qi}`) === storedId) : i;
    const q = qIndex >= 0 ? questions[qIndex] ?? null : null;
    const options = strList(q?.options);
    const type = quizItemType(str(a.questionType), q);
    const pickedText =
      type === "multi_select"
        ? strList(a.selectedAnswers)
        : typeof a.selectedAnswerText === "string" && a.selectedAnswerText !== "Not answered"
          ? [a.selectedAnswerText]
          : [];
    // The stored index points into the options as they were when the quiz was
    // taken. If the job's options have been reordered or edited since, the
    // stored text is the truth: the index is used only when the option now at
    // that index still says what they picked (or when no text was kept).
    let picked: number[] = [];
    const selectedIndex = num(a.selectedAnswer);
    const indexStillTheirs =
      selectedIndex != null &&
      Number.isInteger(selectedIndex) &&
      selectedIndex >= 0 &&
      selectedIndex < options.length &&
      (pickedText.length === 0 || norm(options[selectedIndex]) === norm(pickedText[0]));
    if (type !== "multi_select" && indexStillTheirs) picked = [selectedIndex];
    else picked = pickedText.map((t) => options.findIndex((o) => norm(o) === norm(t))).filter((x) => x >= 0);
    return {
      id: storedId ?? (str(q?.id) ?? `__idx_${i}`),
      index: i,
      question: str(a.question) ?? str(q?.question) ?? `Question ${i + 1}`,
      category: str(q?.category),
      type,
      options,
      picked,
      pickedText,
      textAnswer: type === "text" ? str(a.textAnswer) ?? str(a.selectedAnswerText) : null,
      isCorrect: typeof a.isCorrect === "boolean" ? a.isCorrect : null,
      partial: a.isPartialCredit === true,
      seconds: null,
      approximate: false,
      changes: 0,
      correctTexts: null,
      onScreen: false,
    };
  });

  const headline = correct != null && total != null ? `${formatCount(correct)} / ${formatCount(total)}` : score != null ? `${Math.round(score)}%` : null;
  return {
    headline,
    tone: passed === true ? "jade" : passed === false ? "amber" : "ink",
    verdict: passed === true ? "Passed" : passed === false ? "Did not pass" : null,
    subline: null,
    receipt: headline
      ? `${headline.replace(/ \/ /g, "/")}${passed === true ? " · passed" : passed === false ? " · did not pass" : ""}`
      : null,
    completedAt: str(record?.completedAt) ?? completedAtFor(ctx, "quiz", null),
    integrity: integrityOf(record),
    detail: { kind: "quiz", correct, total, score, passed, items, keyStepId, questions: quizQuestionRefs(questions), live: false },
  };
}

function stepConfig(ctx: BuildContext, stepId: string): Obj | null {
  return obj(ctx.rawSteps.find((s) => s.id === stepId)?.config);
}

function buildTyping(ctx: BuildContext, step: CandidateJourneyStep): Built {
  const r = obj(ctx.notes.typingTestResult) ?? obj(ctx.notes[step.id]);
  const config = stepConfig(ctx, step.id);
  const wpm = num(r?.wpm);
  const accuracy = num(r?.accuracy);
  const score = num(r?.score);
  const passed = typeof r?.passed === "boolean" ? (r.passed as boolean) : null;
  const requiredWpm = num(r?.requiredWpm) ?? num(config?.min_wpm) ?? num(ctx.app.jobs?.required_wpm);
  const requiredAccuracy = num(r?.requiredAccuracy) ?? num(config?.min_accuracy_percent);
  const elapsed = num(r?.elapsedMs);

  // The server never decides typing on its own: submit-typing-test stores
  // `passed: false` for EVERY run (Ava weighs it with the rest), so a stored
  // false is not a fail. The job's own bars decide what this row says.
  const meetsSpeed = wpm != null && requiredWpm != null ? wpm >= requiredWpm : null;
  const meetsAccuracy = accuracy != null && requiredAccuracy != null ? accuracy >= requiredAccuracy : null;
  let verdict: string | null = null;
  if (passed === true) verdict = "Passed";
  else if (meetsSpeed === false) verdict = `Below the ${requiredWpm} WPM bar`;
  else if (meetsAccuracy === false) verdict = `Below ${requiredAccuracy}% accuracy`;
  else if (meetsSpeed === true) verdict = "Meets the bar";
  const below = meetsSpeed === false || meetsAccuracy === false;

  const headline = wpm != null ? `${Math.round(wpm)} WPM` : null;
  return {
    headline,
    tone: passed === true || (meetsSpeed === true && !below) ? "jade" : below ? "amber" : "ink",
    verdict,
    subline: accuracy != null ? `${Math.round(accuracy)}% accurate` : null,
    receipt: headline
      ? `${headline}${passed === true ? " · passed" : wpm != null && requiredWpm != null && wpm < requiredWpm ? ` · under ${requiredWpm}` : ""}`
      : null,
    completedAt: completedAtFor(ctx, step.id, obj(ctx.notes[step.id]) ?? r),
    integrity: integrityOf(r),
    detail: {
      kind: "typing_test",
      wpm,
      accuracy,
      score,
      passed,
      requiredWpm,
      requiredAccuracy,
      passage: str(r?.targetText) ?? str(r?.passage),
      typed: typeof r?.typedText === "string" && r.typedText.length > 0 ? r.typedText : null,
      seconds: elapsed != null ? Math.round(elapsed / 1000) : num(r?.seconds),
      words: null,
      runs: null,
      live: false,
    },
  };
}

/* ── The computer and connection check ─────────────────────────────────── */
// docs/EQUIPMENT-CHECK.md. The result (`notes.equipmentCheckResult`, §5) is
// written only by the connection-test function: every figure in it was timed
// by our server from its own clock, which is why the sheet says so under the
// numbers. The job's bars decide the verdict here, the way buildTyping judges
// by the job's bars: the stored `meetsBars` is read, never trusted alone.

const EQUIPMENT_BAR_ORDER: EquipmentBar[] = ["download", "upload", "latency"];

/** A figure to one decimal, rounded DOWN (2.69 → "2.6", 1.2 → "1.2", 24 → "24"). */
function mbpsDecimal(value: number): string {
  const one = Math.floor(value * 10 + 1e-9) / 10;
  return Number.isInteger(one) ? String(one) : one.toFixed(1);
}

/**
 * A figure as the row's number shows it: whole Mbps, rounded DOWN (28.4 →
 * "28"), so a figure never reads as reaching a whole-number bar it missed;
 * one decimal under 1 Mbps (never "0") and for a figure under its bar (2.6
 * against 3 reads "2.6", never "3").
 */
function headlineMbps(value: number, missed: boolean): string {
  return missed || value < 1 ? mbpsDecimal(value) : String(Math.floor(value));
}

/** The job's bars: the result's own snapshot first (the job may have been
 *  edited since), then the step's config `{min_download_mbps, …}`. */
function equipmentBarsOf(result: Obj | null, config: Obj | null): EquipmentBars {
  const snap = obj(result?.bars);
  const positive = (v: unknown) => {
    const n = num(v);
    return n != null && n > 0 ? n : null;
  };
  return {
    minDownload: positive(snap?.minDownloadMbps) ?? positive(config?.min_download_mbps),
    minUpload: positive(snap?.minUploadMbps) ?? positive(config?.min_upload_mbps),
    maxLatency: positive(snap?.maxLatencyMs) ?? positive(config?.max_latency_ms),
  };
}

/** Which bars a set of figures misses; a bar or a figure that is unknown is skipped. */
function equipmentBelow(f: { download: number | null; upload: number | null; latencyMs: number | null }, bars: EquipmentBars): EquipmentBar[] {
  const below: EquipmentBar[] = [];
  if (f.download != null && bars.minDownload != null && f.download < bars.minDownload) below.push("download");
  if (f.upload != null && bars.minUpload != null && f.upload < bars.minUpload) below.push("upload");
  if (f.latencyMs != null && bars.maxLatency != null && f.latencyMs > bars.maxLatency) below.push("latency");
  return below;
}

function usingThisComputerOf(value: unknown): "yes" | "no_switched" | "ran_here_anyway" | null {
  return value === "yes" || value === "no_switched" || value === "ran_here_anyway" ? value : null;
}

/** The same, plus a plain "no" (said on a check that is still open). */
function computerAnswerOf(value: unknown): "yes" | "no_switched" | "ran_here_anyway" | "no" | null {
  return value === "no" ? "no" : usingThisComputerOf(value);
}

/** Where the test ran against where it was sent from (the result's `source`). */
interface EquipmentSource {
  oneAddress: boolean | null;
  sameAddress: boolean | null;
  sameBrowser: boolean | null;
}

function equipmentSourceOf(value: unknown): EquipmentSource {
  const o = obj(value);
  const flag = (x: unknown) => (typeof x === "boolean" ? x : null);
  return { oneAddress: flag(o?.oneAddress), sameAddress: flag(o?.sameAddress), sameBrowser: flag(o?.sameBrowser) };
}

/** Whether the server recorded a connection check here: recordStepResult's
 *  `_trusted` marker, which no candidate write can produce. */
function serverRecordedEquipment(notes: Obj): boolean {
  const markers = obj(notes._trusted);
  return !!markers && Object.values(markers).some((m) => obj(m)?.stepType === "equipment_check");
}

function deviceKindOf(value: unknown): "computer" | "phone" | "tablet" | null {
  return value === "computer" || value === "phone" || value === "tablet" ? value : null;
}

/** The flags the hiring team sees, in the contract's words (§6) — the same
 *  lines, in the same order, as connectionFlags in
 *  supabase/functions/_shared/connectionStamps.ts, so the two never disagree.
 *  A switch to the right computer is what the page asked for, never a flag:
 *  the answer says it in neutral words. */
function equipmentFlags(input: { usingThisComputer: string | null; deviceKind: string | null; runs: number | null; source?: EquipmentSource | null }): string[] {
  const flags: string[] = [];
  if (input.usingThisComputer === "ran_here_anyway") flags.push("Not the computer they'll work from (ran here anyway)");
  if (input.deviceKind === "phone") flags.push("Ran on a phone");
  else if (input.deviceKind === "tablet") flags.push("Ran on a tablet");
  if (input.runs != null && input.runs >= 3) flags.push(`Sent after ${input.runs} runs`);
  if (input.source?.sameAddress === false) flags.push("Sent from a different network than the test ran on");
  else if (input.source?.oneAddress === false) flags.push("The test ran from more than one network");
  if (input.source?.sameBrowser === false) flags.push("Sent from a different browser than the test ran in");
  return flags;
}

/** The device as table rows, in a fixed order. A fact the browser did not
 *  report (Safari gives no memory and no connection type) is said so, never
 *  dropped: the gap is itself something staff should see. */
function deviceRows(device: Obj | null): EquipmentDeviceRow[] {
  if (!device) return [];
  const none = "Not reported";
  const os = [str(device.os), str(device.osVersion)].filter(Boolean).join(" ");
  const browser = [str(device.browser), str(device.browserVersion)].filter(Boolean).join(" ");
  const dpr = num(device.dpr);
  const screen = str(device.screen);
  const cores = num(device.cores);
  const memory = num(device.memoryGb);
  const rows: EquipmentDeviceRow[] = [
    { label: "Operating system", value: os || none },
    { label: "Browser", value: browser || none },
    { label: "Screen", value: screen ? `${screen}${dpr != null && dpr !== 1 ? ` at ${dpr}×` : ""}` : none },
    { label: "Processor cores", value: cores != null ? String(cores) : none },
    { label: "Memory", value: memory != null ? `${memory} GB` : none },
    { label: "Touch screen", value: typeof device.touch === "boolean" ? (device.touch ? "Yes" : "No") : none },
    { label: "Language", value: str(device.language) ?? none },
    { label: "Time zone", value: str(device.timezone) ?? none },
    { label: "Connection type", value: str(device.connectionType) ?? none },
  ];
  const model = str(device.model);
  if (model) rows.push({ label: "Model", value: model });
  return rows;
}

function buildEquipment(ctx: BuildContext, step: CandidateJourneyStep): Built {
  const r = obj(ctx.notes.equipmentCheckResult) ?? obj(ctx.notes[step.id]);
  const bars = equipmentBarsOf(r, stepConfig(ctx, step.id));
  const download = num(r?.downloadMbps);
  const upload = num(r?.uploadMbps);
  const latencyMs = num(r?.latencyMs);
  const jitterMs = num(r?.jitterMs);
  const runs = num(r?.runs);
  const usingThisComputer = usingThisComputerOf(r?.usingThisComputer);
  const deviceKind = deviceKindOf(r?.deviceKind);
  const flags = equipmentFlags({ usingThisComputer, deviceKind, runs, source: equipmentSourceOf(r?.source) });

  // The job's bars decide, from the figures on file; the stored list only
  // stands in when a figure is missing. Nothing is judged without a bar.
  const figures = { download, upload, latencyMs };
  const judged = download != null && upload != null && latencyMs != null && bars.minDownload != null && bars.minUpload != null && bars.maxLatency != null;
  const storedBelow = Array.isArray(r?.below) ? (r!.below as unknown[]).filter((b): b is EquipmentBar => b === "download" || b === "upload" || b === "latency") : null;
  const below = judged ? equipmentBelow(figures, bars) : storedBelow ?? equipmentBelow(figures, bars);
  const meetsBars = judged ? below.length === 0 : storedBelow ? storedBelow.length === 0 : null;

  // "Below the bar: upload 1.2 Mbps" — the figure that missed, with its
  // decimals, rounded down so it never reads as the bar it missed.
  const shortfall = (bar: EquipmentBar) =>
    bar === "download" ? `download ${mbpsDecimal(download!)} Mbps` : bar === "upload" ? `upload ${mbpsDecimal(upload!)} Mbps` : `latency ${Math.round(latencyMs!)} ms`;
  const missed = below.filter((b) => (b === "latency" ? latencyMs : b === "download" ? download : upload) != null).map(shortfall);
  const verdict = meetsBars === true ? "Meets the bar" : meetsBars === false ? (missed.length > 0 ? `Below the bar: ${missed.join(", ")}` : "Below the bar") : null;
  const headline =
    download != null && upload != null
      ? `↓ ${headlineMbps(download, below.includes("download"))} · ↑ ${headlineMbps(upload, below.includes("upload"))} Mbps`
      : null;

  return {
    headline,
    tone: meetsBars === true ? "jade" : meetsBars === false ? "amber" : "ink",
    verdict,
    // No joined second line: the flags are each their own line, under the
    // verdict, from detail.flags (AssessmentRecordList draws them; §6).
    subline: null,
    // The gem's receipt, in typing's idiom ("38 WPM · under 45"): the figures,
    // and which bar was missed, against what the job asks for.
    receipt: headline
      ? `${headline}${
          meetsBars === false && below.length > 0
            ? ` · ${below.map((b) => (b === "download" ? `download under ${bars.minDownload}` : b === "upload" ? `upload under ${bars.minUpload}` : `latency over ${bars.maxLatency}`)).join(", ")}`
            : ""
        }`
      : null,
    completedAt: completedAtFor(ctx, step.id, obj(ctx.notes[step.id]) ?? r),
    integrity: integrityOf(r),
    detail: {
      kind: "equipment_check",
      download,
      upload,
      latencyMs,
      jitterMs,
      bars,
      below,
      meetsBars,
      flags,
      usingThisComputer,
      deviceKind,
      device: deviceRows(obj(r?.device)),
      runs,
      // Never from the stored field alone: only a result with the server's
      // own marker is said to be timed by our server.
      measuredBy: r?.measuredBy === "server" && serverRecordedEquipment(ctx.notes) ? "server" : null,
      measuredAt: str(r?.measuredAt),
      ip: null,
      testIps: null,
      userAgent: null,
      timeline: null,
      live: false,
      liveScreen: null,
    },
  };
}

function buildChatSimulation(ctx: BuildContext, step: CandidateJourneyStep): Built {
  const r = obj(ctx.notes.chatSimulationResult) ?? obj(ctx.notes[step.id]);
  const scenario = str(r?.scenario);
  // The result keeps the scenario's text; the job's config knows who the player was.
  const scenarios = Array.isArray(stepConfig(ctx, step.id)?.scenarios) ? (stepConfig(ctx, step.id)!.scenarios as unknown[]) : [];
  const match = scenario ? scenarios.map(obj).find((s) => s && norm(str(s.scenario) ?? "") === norm(scenario)) : null;
  const customerName = str(r?.customerName) ?? str(match?.customerName);
  const score = num(r?.score);
  const scores: Array<{ label: string; value: number }> = [];
  for (const [label, field] of [
    ["Empathy", "empathy"],
    ["Problem solving", "problemSolving"],
    ["Communication", "communication"],
    ["Professionalism", "professionalism"],
  ] as const) {
    const v = num(r?.[field]);
    if (v != null) scores.push({ label, value: v });
  }
  const transcript = turnsOf(r?.messages ?? r?.transcript ?? r?.conversation);
  const headline = score != null ? `${Math.round(score)} / 100` : null;
  return {
    headline,
    tone: scoreTone(score, ctx.passing),
    verdict: null,
    subline: scores.slice(0, 2).map((s) => `${s.label} ${Math.round(s.value)}`).join(" · ") || null,
    receipt: score != null ? `${Math.round(score)}/100` : null,
    completedAt: completedAtFor(ctx, step.id, r),
    integrity: integrityOf(r),
    detail: {
      kind: "chat_simulation",
      scenario,
      customerName,
      scores,
      strengths: strList(r?.strengths),
      improvements: strList(r?.improvements),
      feedback: str(r?.overallFeedback) ?? str(r?.feedback),
      messageCount: num(r?.messageCount) ?? transcript?.length ?? null,
      transcript,
      live: false,
    },
  };
}

function buildChatInterview(ctx: BuildContext, step: CandidateJourneyStep): Built {
  const r = obj(ctx.notes.chatInterviewResult) ?? obj(ctx.notes[step.id]);
  // The AI-ended interview nests its grading under .evaluation; the End-button
  // one writes the same fields flat. Read both, flat first.
  const ev = obj(r?.evaluation) ?? {};
  const score = num(r?.score) ?? num(ev.score);
  const recommendation = str(r?.recommendation) ?? str(ev.recommendation);
  const transcript = turnsOf(r?.messages ?? r?.transcript);
  const inconsistencies: Inconsistency[] = (Array.isArray(ev.inconsistencies) ? ev.inconsistencies : Array.isArray(r?.inconsistencies) ? (r!.inconsistencies as unknown[]) : [])
    .map(obj)
    .filter((x): x is Obj => !!x)
    .map((x) => ({ claim: str(x.claim) ?? "", evidence: str(x.evidence) ?? "", assessment: str(x.assessment) ?? "" }))
    .filter((x) => x.claim || x.evidence || x.assessment);
  const questionCount = num(r?.questionCount);
  const duration = fmtDuration(r?.duration);
  const headline = score != null ? `${Math.round(score)} / 100` : null;
  const declined = recommendation != null && /\bno\b|not|reject|decline/i.test(recommendation);
  return {
    headline,
    tone: recommendation ? (declined ? "amber" : /hire|yes|advance|strong/i.test(recommendation) ? "jade" : scoreTone(score, ctx.passing)) : scoreTone(score, ctx.passing),
    verdict: recommendation,
    subline: [questionCount != null ? `${questionCount} ${questionCount === 1 ? "question" : "questions"}` : null, duration].filter(Boolean).join(" · ") || null,
    // The rail's receipt stays a number: the recommendation is on the row.
    receipt: score != null ? `${Math.round(score)}/100` : null,
    completedAt: completedAtFor(ctx, step.id, r),
    integrity: integrityOf(r),
    detail: {
      kind: "chat_interview",
      score,
      recommendation,
      credibility: str(ev.credibilityRating) ?? str(r?.credibilityRating),
      summary: str(ev.summary) ?? str(r?.summary),
      strengths: strList(r?.strengths).length > 0 ? strList(r?.strengths) : strList(ev.strengths),
      concerns: strList(r?.concerns).length > 0 ? strList(r?.concerns) : strList(ev.concerns),
      inconsistencies,
      duration,
      questionCount,
      messageCount: num(r?.messageCount) ?? transcript?.length ?? null,
      transcript,
      live: false,
    },
  };
}

function buildVoice(ctx: BuildContext, step: CandidateJourneyStep): Built {
  const r = obj(ctx.app.voice_interview_result);
  const transcript = turnsOf(ctx.app.voice_interview_transcript);
  const score = num(r?.overall_score) ?? num(r?.overallScore) ?? num(r?.score);
  const first = toMillis(transcript?.[0]?.at);
  const last = toMillis(transcript?.[transcript.length - 1]?.at);
  const minutes = first != null && last != null && last > first ? Math.max(1, Math.round((last - first) / 60000)) : null;
  const headline = score != null ? `${Math.round(score)} / 100` : minutes != null ? `${minutes} min` : null;
  return {
    headline,
    tone: scoreTone(score, ctx.passing),
    verdict: str(r?.recommendation),
    subline: minutes != null && score != null ? `${minutes} min` : transcript ? "Transcript kept" : null,
    receipt: minutes != null ? `${minutes} min · transcript ready` : score != null ? `${Math.round(score)}/100` : null,
    completedAt: completedAtFor(ctx, step.id, r),
    integrity: integrityOf(r),
    detail: {
      kind: "voice_interview",
      score,
      minutes,
      summary: str(r?.summary) ?? str(r?.overall_assessment),
      recordingUrl: str(ctx.app.voice_interview_recording_url),
      transcript,
    },
  };
}

/** Sales practice, portfolio, video intro and anything newer: the numbers and
 *  lists the result holds, labelled, without guessing at their meaning. */
function buildGeneric(ctx: BuildContext, step: CandidateJourneyStep, result: Obj | null): Built {
  const r = result ?? {};
  const inner = obj(r.aiAnalysis) ?? obj(r.evaluation) ?? {};
  const score = num(r.score) ?? num(inner.score) ?? num(r.overallScore);
  const facts: Array<{ label: string; value: string }> = [];
  const lists: Array<{ label: string; items: string[] }> = [];
  for (const [label, value] of [
    ["Score", score != null ? `${Math.round(score)} / 100` : null],
    ["Messages", num(r.messageCount) != null ? String(num(r.messageCount)) : null],
    ["Duration", fmtDuration(r.duration)],
    ["Recommendation", str(r.recommendation) ?? str(inner.recommendation)],
  ] as const) {
    if (value) facts.push({ label, value });
  }
  for (const [label, value] of [
    ["Strengths", r.strengths ?? inner.strengths],
    ["What to improve", r.improvements ?? inner.improvements],
    ["Concerns", r.concerns ?? inner.concerns],
  ] as const) {
    const items = strList(value);
    if (items.length > 0) lists.push({ label, items });
  }
  const recorded = step.type === "video_intro" || step.type === "video_message";
  const headline = score != null ? `${Math.round(score)} / 100` : recorded ? "Recorded" : "Done";
  return {
    headline,
    tone: scoreTone(score, ctx.passing),
    verdict: str(r.recommendation) ?? str(inner.recommendation),
    subline: null,
    receipt: score != null ? `${Math.round(score)}/100` : null,
    completedAt: completedAtFor(ctx, step.id, r),
    integrity: integrityOf(r),
    detail: {
      kind: "generic",
      facts,
      lists,
      summary: str(r.summary) ?? str(inner.summary) ?? str(r.feedback),
      transcript: turnsOf(r.messages ?? r.transcript),
    },
  };
}

function resultForGeneric(ctx: BuildContext, step: CandidateJourneyStep): Obj | null {
  switch (step.type) {
    case "sales_simulation":
      return obj(ctx.notes.salesSimulationResult) ?? obj(ctx.notes[step.id]);
    case "portfolio_upload":
      return obj(ctx.notes.portfolioResult) ?? obj(ctx.notes[step.id]);
    case "video_intro":
    case "video_message":
      return obj(ctx.notes[step.id]) ?? (ctx.notes.videoIntroUrl ? { videoUrl: ctx.notes.videoIntroUrl } : null);
    default:
      return obj(ctx.notes[step.id]);
  }
}

function buildStep(ctx: BuildContext, step: CandidateJourneyStep): Built {
  switch (step.type) {
    case "application":
      return buildApplication(ctx);
    case "quiz":
      return buildQuiz(ctx);
    case "equipment_check":
      return buildEquipment(ctx, step);
    case "typing_test":
      return buildTyping(ctx, step);
    case "chat_simulation":
      return buildChatSimulation(ctx, step);
    case "chat_interview":
      return buildChatInterview(ctx, step);
    case "voice_interview":
      return buildVoice(ctx, step);
    default:
      return buildGeneric(ctx, step, resultForGeneric(ctx, step));
  }
}

/** Results this application holds for a step type its job no longer lists
 *  (the job was edited after they took it). Still theirs, still shown. */
const EXTRA_RESULT_KEYS: Array<{ type: string; present: (ctx: BuildContext) => boolean }> = [
  { type: "equipment_check", present: (c) => !!obj(c.notes.equipmentCheckResult) },
  { type: "typing_test", present: (c) => !!obj(c.notes.typingTestResult) },
  { type: "chat_simulation", present: (c) => !!obj(c.notes.chatSimulationResult) },
  { type: "chat_interview", present: (c) => !!obj(c.notes.chatInterviewResult) },
  { type: "sales_simulation", present: (c) => !!obj(c.notes.salesSimulationResult) },
  { type: "portfolio_upload", present: (c) => !!obj(c.notes.portfolioResult) },
  { type: "voice_interview", present: (c) => !!c.app.voice_interview_result || !!turnsOf(c.app.voice_interview_transcript) },
];

/* ── What the server's record adds to a step ───────────────────────────── */

const SCORE_FIELDS = [
  ["Empathy", "empathy"],
  ["Problem solving", "problemSolving"],
  ["Communication", "communication"],
  ["Professionalism", "professionalism"],
] as const;

/** The right answer(s) a grading kept for one question, as option texts. */
function correctTextsFrom(value: unknown, options: string[]): string[] | null {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 && value < options.length ? [options[value]] : null;
  if (typeof value === "string" && value.trim()) return [value.trim()];
  const list = strList(value);
  return list.length > 0 ? list : null;
}

/** A finished step, with what the server kept beside the notes: the full
 *  grading (chat practice's communication, professionalism and feedback are
 *  computed but never put in notes), the pinned inputs (the scenario, the
 *  typing passage), and the quiz's seconds per question and right answers. */
function enrichFromSession(detail: AssessmentDetail | null, session: AssessmentSessionRow): AssessmentDetail | null {
  if (!detail) return detail;
  // grading = {graded_at, model, prompt_version, fallback, result, …the step's
  // own extras at the top level} (gradingRecord in _shared/assessmentSession.ts).
  const top = obj(session.grading) ?? {};
  const g = obj(top.result) ?? {};
  const c = obj(session.context) ?? {};
  switch (detail.kind) {
    case "chat_simulation": {
      const scores = SCORE_FIELDS.flatMap(([label, field]) => {
        const have = detail.scores.find((x) => x.label === label);
        if (have) return [have];
        const v = num(g[field]);
        return v != null ? [{ label, value: v }] : [];
      });
      const graded = obj(top.scenario);
      return {
        ...detail,
        scenario: detail.scenario ?? str(c.scenario) ?? str(graded?.scenario),
        customerName: detail.customerName ?? str(c.customer_name) ?? str(graded?.customer_name),
        scores,
        strengths: detail.strengths.length > 0 ? detail.strengths : strList(g.strengths),
        improvements: detail.improvements.length > 0 ? detail.improvements : strList(g.improvements),
        feedback: detail.feedback ?? str(g.overallFeedback),
      };
    }
    case "chat_interview": {
      const inconsistencies =
        detail.inconsistencies.length > 0
          ? detail.inconsistencies
          : (Array.isArray(g.inconsistencies) ? g.inconsistencies : [])
              .map(obj)
              .filter((x): x is Obj => !!x)
              .map((x) => ({ claim: str(x.claim) ?? "", evidence: str(x.evidence) ?? "", assessment: str(x.assessment) ?? "" }))
              .filter((x) => x.claim || x.evidence || x.assessment);
      return {
        ...detail,
        score: detail.score ?? num(g.score),
        recommendation: detail.recommendation ?? str(g.recommendation),
        credibility: detail.credibility ?? str(g.credibilityRating),
        summary: detail.summary ?? str(g.summary),
        strengths: detail.strengths.length > 0 ? detail.strengths : strList(g.strengths),
        concerns: detail.concerns.length > 0 ? detail.concerns : strList(g.concerns),
        inconsistencies,
        questionCount: detail.questionCount ?? num(top.question_count),
        duration: detail.duration ?? fmtDuration(top.duration_seconds),
      };
    }
    case "typing_test": {
      const passage = detail.passage ?? str(c.target_text);
      return {
        ...detail,
        passage,
        wpm: detail.wpm ?? num(g.wpm),
        accuracy: detail.accuracy ?? num(g.accuracy),
        requiredWpm: detail.requiredWpm ?? num(g.requiredWpm) ?? num(c.required_wpm),
        seconds: detail.seconds ?? (num(top.elapsed_ms) != null ? Math.round(num(top.elapsed_ms)! / 1000) : null),
        words: detail.typed && passage ? typingWords(detail.typed, passage) : detail.words,
      };
    }
    case "equipment_check": {
      // The attempt's grading is staff-only (docs/EQUIPMENT-CHECK.md §5): the
      // stamps, the IP the test came from and the browser's own line. The
      // bars pinned at the start of the attempt fill in for an older result
      // that kept none.
      const pinned = equipmentBarsOf(null, obj(c.bars));
      return {
        ...detail,
        bars: {
          minDownload: detail.bars.minDownload ?? pinned.minDownload,
          minUpload: detail.bars.minUpload ?? pinned.minUpload,
          maxLatency: detail.bars.maxLatency ?? pinned.maxLatency,
        },
        ip: detail.ip ?? str(top.ip),
        testIps: detail.testIps ?? (Array.isArray(top.testIps) ? top.testIps.map(str).filter((x): x is string => !!x) : null),
        userAgent: detail.userAgent ?? str(top.userAgent) ?? str(top.user_agent),
      };
    }
    case "quiz": {
      const graded = new Map<string, Obj>();
      for (const raw of Array.isArray(g.answers) ? g.answers : []) {
        const a = obj(raw);
        const id = str(a?.question_id);
        if (a && id) graded.set(id, a);
      }
      if (graded.size === 0) return detail;
      return {
        ...detail,
        items: detail.items.map((item) => {
          const a = graded.get(item.id);
          if (!a) return item;
          return {
            ...item,
            seconds: item.seconds ?? num(a.seconds_on_question),
            correctTexts: item.correctTexts ?? correctTextsFrom(a.correct_answer, item.options),
          };
        }),
      };
    }
    default:
      return detail;
  }
}

/** The answers saved as they typed (save_application_draft), in the job's
 *  question order. Nothing has been sent yet. */
function draftDetail(ctx: BuildContext, session: AssessmentSessionRow): AssessmentDetail {
  const draft = obj(session.draft) ?? {};
  const codes = obj(draft._phoneCountryCodes) ?? {};
  const files = uploadsOf(ctx);
  const questions = (Array.isArray(ctx.app.jobs?.application_questions) ? (ctx.app.jobs!.application_questions as unknown[]) : [])
    .map(obj)
    .filter((q): q is Obj => !!q);
  const answers: AnswerItem[] = [];
  const push = (id: string, question: string, type: string | null, value: unknown) => {
    let answer = "";
    let selected: string[] | null = null;
    if (Array.isArray(value)) {
      const list = strList(value);
      answer = list.join("; ");
      selected = list.length > 0 ? list : null;
    } else if (typeof value === "string") {
      answer = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      answer = String(value);
    }
    const code = str(codes[id]);
    if (code && answer.trim() && (type === "phone" || type === "tel")) answer = `${code} ${answer}`;
    const upload = files.get(id);
    answers.push({
      id,
      question,
      answer,
      selected,
      type,
      file: upload ? { path: upload.path, pages: upload.pages } : type === "file" && answer.trim() ? { path: answer.trim(), pages: [] } : null,
    });
  };
  if (questions.length > 0) {
    questions.forEach((q, i) => {
      const id = str(q.id) ?? `q-${i}`;
      push(id, str(q.question) ?? `Question ${i + 1}`, str(q.type), draft[id]);
    });
  } else {
    for (const [key, value] of Object.entries(draft)) if (!key.startsWith("_")) push(key, key, null, value);
  }
  const p = obj(session.progress) ?? {};
  return {
    kind: "application",
    answers,
    coverLetter: str(draft._coverLetter),
    hasResume: !!ctx.app.resume_url,
    flags: [],
    uploads: [],
    draft: { savedAt: str(p.draft_saved_at) ?? session.last_activity_at ?? null, answered: num(p.answered), total: num(p.total) },
  };
}

/** What a step still being taken can show before its events load: the
 *  server-pinned inputs and how far they are. Events fill in the rest. */
function liveDetail(ctx: BuildContext, step: CandidateJourneyStep, session: AssessmentSessionRow): AssessmentDetail | null {
  const c = obj(session.context) ?? {};
  const p = obj(session.progress) ?? {};
  const turns = (num(p.candidate_turns) ?? 0) + (num(p.assistant_turns) ?? 0);
  switch (step.type) {
    case "application":
      return draftDetail(ctx, session);
    case "quiz": {
      const source = quizSource(ctx);
      return {
        kind: "quiz",
        correct: null,
        total: num(p.total) ?? (source.questions.length || null),
        score: null,
        passed: null,
        items: [],
        keyStepId: source.keyStepId,
        questions: quizQuestionRefs(source.questions),
        live: true,
      };
    }
    case "typing_test": {
      const config = stepConfig(ctx, step.id);
      const elapsed = num(p.elapsed_ms);
      return {
        kind: "typing_test",
        wpm: null,
        accuracy: null,
        score: null,
        passed: null,
        requiredWpm: num(c.required_wpm) ?? num(config?.min_wpm) ?? num(ctx.app.jobs?.required_wpm),
        requiredAccuracy: num(config?.min_accuracy_percent),
        passage: str(c.target_text),
        typed: null,
        seconds: elapsed != null ? Math.round(elapsed / 1000) : null,
        words: null,
        runs: null,
        live: true,
      };
    }
    case "equipment_check": {
      // Nothing is timed until a run is sent: the bars the attempt was opened
      // with, which run they are on, and what the page's hint says about the
      // device and the answer. The events fill in the rest once the sheet
      // loads them.
      const pinned = equipmentBarsOf(null, obj(c.bars) ?? stepConfig(ctx, step.id));
      const hint = connectionHint(session);
      const hintKind = deviceKindOf(hint.device_kind);
      // A plain "no" is kept too: the check is open, waiting on the right computer.
      const hintAnswer = computerAnswerOf(hint.answer);
      const hintScreen = str(hint.screen);
      const liveScreen: "computer" | "test" | "result" | "failed" =
        hintScreen === "which" || hintScreen === "computer" || hintScreen === "device"
          ? "computer"
          : hint.failed === true
            ? "failed"
            : hintScreen === "result"
              ? "result"
              : "test";
      return {
        kind: "equipment_check",
        download: null,
        upload: null,
        latencyMs: null,
        jitterMs: null,
        bars: pinned,
        below: [],
        meetsBars: null,
        flags: equipmentFlags({ usingThisComputer: hintAnswer, deviceKind: hintKind, runs: null }),
        usingThisComputer: hintAnswer,
        deviceKind: hintKind,
        device: [],
        runs: num(hint.run) ?? num(hint.runs_done),
        measuredBy: null,
        measuredAt: null,
        ip: null,
        testIps: null,
        userAgent: null,
        timeline: null,
        live: true,
        liveScreen,
      };
    }
    case "chat_simulation":
      return {
        kind: "chat_simulation",
        scenario: str(c.scenario),
        customerName: str(c.customer_name),
        scores: [],
        strengths: [],
        improvements: [],
        feedback: null,
        messageCount: turns || null,
        transcript: null,
        live: true,
      };
    case "chat_interview":
      return {
        kind: "chat_interview",
        score: null,
        recommendation: null,
        credibility: null,
        summary: null,
        strengths: [],
        concerns: [],
        inconsistencies: [],
        duration: null,
        questionCount: num(p.question_count),
        messageCount: turns || null,
        transcript: null,
        live: true,
      };
    default:
      return { kind: "generic", facts: [], lists: [], summary: null, transcript: null };
  }
}

/** Options for the builder: the server's attempts when loaded, and "now". */
export interface BuildOptions {
  /** `assessment_sessions` rows for this application (any order). The staff
   *  hooks hand them over with the reopen markers attached (`withReopens`). */
  sessions?: SessionList | null;
  /** The application's staff reopen markers (`assessment_step_reopens`).
   *  Defaults to the ones riding on `sessions`. Without a marker no step
   *  reads "Reopened for a retake", whatever status and phase say. */
  reopens?: readonly StepReopenRow[] | null;
  /** Milliseconds since the epoch, for the live labels; defaults to Date.now(). */
  now?: number;
}

/**
 * One entry per step the job gives this applicant, in the job's order, then
 * any result the job no longer lists, the resume (when one is on file) right
 * after the application, and a closing integrity row when anything was
 * flagged. A showcase row (no notes, no job) has no record to show: [].
 *
 * With `sessions`, a step still being taken reads live ("Answering question 3
 * of 10 · active 1 min ago", "Left at question 3 · last active 25 min ago")
 * and opens on what is there so far; a finished step adds what the server
 * kept beside the notes. Notes still decide what is DONE: a result on file
 * is done whatever an attempt row says.
 */
export function buildAssessmentRecord(app: AssessmentAppInput | null | undefined, options: BuildOptions = {}): AssessmentRecord {
  const empty: AssessmentRecord = { entries: [], riskFlags: [], fillingInForm: false, integrityTotal: 0, jobId: null, live: null };
  if (!app) return empty;
  const fillingInForm = isFillingInForm(app.status);
  const scorecard = obj(app.ai_scorecard);
  const riskFlags = strList(scorecard?.riskFlags);
  if (app.notes == null && app.jobs == null && !fillingInForm) return { ...empty, riskFlags };

  const sessions = (options.sessions ?? []).filter((x): x is AssessmentSessionRow => !!x && typeof x.step_id === "string");
  // Only this application's markers (a job-wide list may carry others').
  const reopens = (options.reopens ?? options.sessions?.reopens ?? []).filter(
    (r): r is StepReopenRow => !!r && typeof r.step_id === "string" && (!r.application_id || !app.id || r.application_id === app.id),
  );
  const now = options.now ?? Date.now();
  const notes = parseApplicationNotes(app.notes ?? null);
  const rawSteps = (Array.isArray(app.jobs?.workflow_steps) ? (app.jobs!.workflow_steps as unknown[]) : []).map((s) => obj(s) ?? {});
  const ctx: BuildContext = {
    app,
    notes,
    rawSteps,
    passing: num(app.jobs?.passing_score) ?? 60,
    riskFlags,
  };

  const quiz = quizSource(ctx);
  const hasQuiz = quiz.questions.length > 0 || !!quiz.record || !!obj(notes.quizResult);
  const journey = buildCandidateJourney(rawSteps as unknown as WorkflowStepLike[], { hasQuiz }).filter((s) => s.id !== DECISION_STAGE_ID);
  const position = positionFor([...journey, { id: DECISION_STAGE_ID, type: DECISION_STAGE_ID, title: titleFor(DECISION_STAGE_ID) }], {
    phase: app.phase,
    status: app.status,
  });
  const decided = DECIDED_STATUSES.has(app.status ?? "");

  const entries: AssessmentEntry[] = [];
  const earlierGroups: Array<{ key: string; title: string; tally: IntegrityTally; sessionId: string; attempt: number }> = [];
  journey.forEach((step, i) => {
    let resultOnFile: boolean;
    if (step.type === "application") {
      const answers = notes.applicationAnswers;
      resultOnFile = !fillingInForm && ((Array.isArray(answers) && answers.length > 0) || !!app.status);
    } else if (step.type === "quiz") {
      resultOnFile = !!quiz.record || !!obj(notes.quizResult) || stepHasResult(notes, app.voice_interview_result, step);
    } else {
      resultOnFile = stepHasResult(notes, app.voice_interview_result, step);
    }
    const attempts = stepAttempts(sessions, step.id);
    // Handed back for a retake: status pending with phase on the step AND a
    // staff reopen marker newer than the result on file — the server's own
    // rule (assessment_step_completion). The applicant can set their own
    // status to pending, so status and phase alone never reopen a step. The
    // old result stays in notes, but the step is theirs to take again.
    const marker = resultOnFile && !decided ? retakeMarker(app, step, notes, sessions, reopens) : null;
    const retakeOpen = marker != null;
    const done = resultOnFile && !retakeOpen && !(attempts.rechecking && !decided);
    // Reopened, and the new attempt has not started: the row opens on the
    // earlier result, said plainly.
    const retakeWaiting = retakeOpen && resultOnFile && !attempts.retake;
    const session = done
      ? attempts.result
      : retakeOpen
        ? attempts.retake ?? (retakeWaiting ? attempts.lastCompleted : null)
        : sessionForStep(sessions, step.id);
    // Live only while it is still theirs to finish: a result on file, or a
    // decision, ends it whatever the attempt row says.
    const live = session && !done && !decided && !retakeWaiting ? sessionLiveStatus(session, now, step.title) : null;
    const inProgress = !done && !decided && (live != null || retakeOpen || (step.type === "application" ? fillingInForm : i === position.index));
    const status: AssessmentStatus = done ? "done" : inProgress ? "in_progress" : "not_started";
    const built = done || retakeWaiting ? buildStep(ctx, step) : null;
    let detail: AssessmentDetail | null = built?.detail ?? null;
    if ((done || retakeWaiting) && session) detail = enrichFromSession(detail, session);
    if (!done && !retakeWaiting && inProgress && session) detail = liveDetail(ctx, step, session);

    // The server's tally whenever it has one for the attempt shown, even at
    // zero: it is what the bell and the timeline say. The notes' shapes
    // (written by older pages, and still kept for them) only without one, and
    // only for the attempt whose result they are. The form step never
    // alerts: leaving it is normal, so it raises no flag here either.
    const notesTally = built?.integrity ?? EMPTY_TALLY;
    const serverTally = session && step.type !== "application" ? integrityFromSummary(session.integrity_summary) : null;
    const integrity = serverTally ?? notesTally;
    // Every other attempt of this step that raised flags keeps its own tally.
    const earlierIntegrity: EarlierAttemptFlags[] =
      step.type === "application"
        ? []
        : attempts.all
            .filter((a) => a.id !== session?.id)
            .map((a) => ({ sessionId: a.id, attempt: attemptNo(a), tally: integrityFromSummary(a.integrity_summary) }))
            .filter((a): a is EarlierAttemptFlags => !!a.tally && a.tally.total > 0);
    for (const e of earlierIntegrity) {
      earlierGroups.push({ key: `${step.id}#${e.attempt}`, title: `${step.title} · attempt ${e.attempt}`, tally: e.tally, sessionId: e.sessionId, attempt: e.attempt });
    }

    entries.push({
      key: step.id,
      kind: kindFor(step.type),
      stepType: step.type,
      title: step.title,
      status,
      statusLabel: done
        ? step.type === "application"
          ? "Sent"
          : "Done"
        : retakeWaiting
          ? "Reopened for a retake"
        : inProgress
          ? live?.text ?? (retakeOpen ? "Reopened for a retake" : step.type === "application" ? "Filling in the form" : "In progress")
          : i < position.index
            ? // The record says they went past it, but no result is on file
              // (an older application, or a result that was never saved).
              "No result on file"
            : decided
              ? "Not taken"
              : "Not started yet",
      headline: built?.headline ?? null,
      tone: done ? built!.tone : "muted",
      verdict: built?.verdict ?? null,
      subline: built?.subline ?? null,
      receipt: done ? built?.receipt ?? null : live?.receipt ?? null,
      completedAt: built?.completedAt ?? (done ? session?.ended_at ?? null : null),
      integrity,
      openable: detail != null && (done || retakeWaiting || (inProgress && session != null)),
      detail,
      session: session
        ? {
            id: session.id,
            attempt: session.attempt ?? 1,
            status: session.status,
            live: retakeWaiting ? null : live ?? sessionLiveStatus(session, now, step.title),
            earlierAttempts: attempts.all.filter((s) => s.id !== session.id).length,
          }
        : null,
      timeline: null,
      retake: retakeWaiting ? "open" : null,
      reopen: marker ? { at: marker.reopened_at ?? null, count: num(marker.reopen_count) } : null,
      earlierIntegrity: earlierIntegrity.length > 0 ? earlierIntegrity : undefined,
    });

    // The resume sits with the application it came in on.
    if (step.type === "application" && str(app.resume_url)) {
      entries.push({
        key: "resume",
        kind: "resume",
        stepType: "resume",
        title: "Resume",
        status: "done",
        statusLabel: "On file",
        headline: "On file",
        tone: "ink",
        verdict: null,
        subline: null,
        receipt: null,
        completedAt: null,
        integrity: EMPTY_TALLY,
        openable: true,
        detail: { kind: "resume" },
        session: null,
        timeline: null,
      });
    }
  });

  const journeyTypes = new Set(journey.map((s) => (s.type === "video_message" ? "video_intro" : s.type)));
  for (const extra of EXTRA_RESULT_KEYS) {
    if (journeyTypes.has(extra.type) || !extra.present(ctx)) continue;
    const step: CandidateJourneyStep = { id: `extra-${extra.type}`, type: extra.type, title: titleFor(extra.type) };
    const built = buildStep(ctx, step);
    entries.push({
      key: step.id,
      kind: kindFor(extra.type),
      stepType: extra.type,
      title: step.title,
      status: "done",
      statusLabel: "Done",
      ...built,
      openable: built.detail != null,
      session: null,
      timeline: null,
    });
  }

  // One group per flagged attempt, in the job's order and then attempt by
  // attempt. When a test was taken more than once, every group says which.
  const groups: Array<{ key: string; title: string; tally: IntegrityTally; sessionId: string | null }> = [];
  for (const e of entries) {
    const others = earlierGroups.filter((g) => g.key.startsWith(`${e.key}#`));
    const attempt = e.session?.attempt ?? 1;
    const own =
      e.integrity.total > 0
        ? [{ key: e.key, title: others.length > 0 || attempt > 1 ? `${e.title} · attempt ${attempt}` : e.title, tally: e.integrity, sessionId: e.session?.id ?? null, attempt }]
        : [];
    for (const g of [...own, ...others].sort((a, b) => a.attempt - b.attempt)) {
      groups.push({ key: g.key, title: g.title, tally: g.tally, sessionId: g.sessionId });
    }
  }
  const flaggedTests = new Set(groups.map((g) => g.key.split("#")[0])).size;
  const integrityTotal = groups.reduce((n, g) => n + g.tally.total, 0);
  if (integrityTotal > 0) {
    const all: IntegrityTally = groups.reduce<IntegrityTally>(
      (acc, g) => ({
        total: acc.total + g.tally.total,
        tabSwitches: acc.tabSwitches + g.tally.tabSwitches,
        copyPaste: acc.copyPaste + g.tally.copyPaste,
        other: acc.other + g.tally.other,
        events: [...acc.events, ...g.tally.events],
        countsOnly: acc.countsOnly || g.tally.countsOnly,
        awayMs: (acc.awayMs ?? 0) + (g.tally.awayMs ?? 0),
      }),
      EMPTY_TALLY,
    );
    // Every flagged attempt counted by the server: add the counts up and say
    // them in the card's words ("possible screenshot ×1", not "1 other").
    if (groups.every((g) => g.tally.counts)) {
      const counts: Record<string, number> = {};
      for (const g of groups) for (const [k, v] of Object.entries(g.tally.counts!)) counts[k] = (counts[k] ?? 0) + v;
      all.counts = counts;
      all.parts = integrityParts(counts, all.awayMs ?? 0);
      all.fromSession = true;
    }
    entries.push({
      key: "integrity",
      kind: "integrity",
      stepType: "integrity",
      title: "Integrity checks",
      status: "done",
      statusLabel: "Flagged",
      headline: `${integrityTotal} ${integrityTotal === 1 ? "flag" : "flags"}`,
      tone: "amber",
      verdict: `in ${flaggedTests} ${flaggedTests === 1 ? "test" : "tests"}`,
      subline: integritySummary(all),
      receipt: null,
      completedAt: null,
      integrity: all,
      openable: true,
      detail: {
        kind: "integrity",
        groups: groups.map((g) => ({ ...g, timeline: null })),
      },
      session: null,
      timeline: null,
    });
  }

  // What they are doing right now: the unfinished attempt they touched last.
  const live =
    entries
      .filter((e) => e.status === "in_progress" && e.session?.live && e.session.live.state !== "finished")
      .map((e) => e.session!.live!)
      .sort((a, b) => (toMillis(b.lastActivityAt) ?? 0) - (toMillis(a.lastActivityAt) ?? 0))[0] ?? null;

  return { entries, riskFlags, fillingInForm, integrityTotal, jobId: str(app.jobs?.id) ?? null, live };
}

/* ── Folding in one attempt's events (the record sheet) ────────────────── */

function pickedFrom(answer: unknown, options: string[]): { picked: number[]; pickedText: string[]; text: string | null } {
  const one = (v: unknown): { index: number | null; text: string | null } => {
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < options.length) return { index: v, text: options[v] };
    if (typeof v === "string" && v.trim()) {
      const i = options.findIndex((o) => norm(o) === norm(v));
      return { index: i >= 0 ? i : null, text: v.trim() };
    }
    return { index: null, text: null };
  };
  const list = Array.isArray(answer) ? answer : answer == null ? [] : [answer];
  const parts = list.map(one);
  const picked = parts.map((p) => p.index).filter((x): x is number => x != null);
  const pickedText = parts.map((p) => p.text).filter((x): x is string => !!x);
  const text = parts.length === 1 && parts[0].index == null ? parts[0].text : null;
  return { picked, pickedText, text };
}

/** The words for a refused run, by the server's reason code (connection-test
 *  `record_refused`; the codes are _shared/connectionStamps.ts's). */
function refusalWords(reason: string | null): string {
  switch (reason) {
    case "stale":
    case "future":
      return "the run was more than 20 minutes old";
    case "foreign":
      return "the run was made under another sign-in";
    case "too_few_steps":
      return "the run did not finish every part";
    case "unmeasurable":
      return "the run did not measure every figure";
    default:
      return "the record did not add up";
  }
}

/** "↓ 24.1 · ↑ 7.8 Mbps · 51 ms" from an event's snake_case figures: the
 *  figures exactly as recorded, to one decimal, so two runs can be compared. */
function figuresWords(d: Obj): string | null {
  const down = num(d.download_mbps);
  const up = num(d.upload_mbps);
  const ms = num(d.latency_ms);
  const jitter = num(d.jitter_ms);
  if (down == null && up == null && ms == null) return null;
  const exact = (v: number) => String(Math.round(v * 10) / 10);
  const parts = [
    down != null ? `↓ ${exact(down)}` : null,
    up != null ? `↑ ${exact(up)} Mbps` : null,
    ms != null ? `${Math.round(ms)} ms${jitter != null ? ` ±${Math.round(jitter)}` : ""}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

/**
 * The connection check's own story, from the attempt's `system` events
 * (docs/EQUIPMENT-CHECK.md §3): the device read, the answer to the computer
 * question, every run started and finished with the page's estimate, every
 * run the server timed, a refused send, and the send itself. While the check
 * is still being taken, the device and the answer come from here too.
 */
function mergeConnectionEvents(detail: Extract<AssessmentDetail, { kind: "equipment_check" }>, events: readonly AssessmentEventRow[]): AssessmentDetail {
  const timeline: TimelineItem[] = [];
  let device: EquipmentDeviceRow[] | null = null;
  let deviceKind = detail.deviceKind;
  // The last answer the events give (a "No" on one device, then "Yes" on
  // another, reads as the Yes); the recorded result, or a live page's own
  // hint, stays the authority when it has one.
  let lastAnswer: Extract<AssessmentDetail, { kind: "equipment_check" }>["usingThisComputer"] = null;
  let runs = 0;
  let sent = false;
  // Which run was sent: the `submitted` marker names it. The test_run the
  // page's own test_finished wrote first never carries `sent` (record's copy
  // is a no-op on the same key), so the run is matched by number.
  const sentRuns = new Set<number>();
  for (const e of events) {
    const d = e.kind === "system" ? obj(e.detail) : null;
    const run = num(d?.run);
    if (d && str(d.what) === "submitted" && run != null) sentRuns.add(run);
  }
  const marker = (e: AssessmentEventRow, label: string, note: string | null = null, kind = "system:other"): TimelineItem => ({
    at: e.created_at ?? null,
    serverAt: e.created_at ?? null,
    kind,
    label,
    awayMs: null,
    short: false,
    afterEnd: false,
    flag: false,
    note,
  });
  for (const e of events) {
    if (e.kind !== "system") continue;
    const d = obj(e.detail) ?? {};
    const what = str(d.what);
    const run = num(d.run);
    const runLabel = run != null ? `Run ${run}` : "A run";
    switch (what) {
      case "started": {
        const attempt = num(d.attempt);
        timeline.push(marker(e, attempt != null && attempt > 1 ? `Opened the check again (attempt ${attempt})` : "Opened the check", null, "system:started"));
        break;
      }
      case "device_read": {
        const kind = deviceKindOf(d.device_kind);
        const facts = [str(d.os), str(d.browser), str(d.screen)].filter((x): x is string => !!x);
        // The recorded result is the authority; the event only fills a gap
        // (a check still being taken, or an older result that kept less).
        if (kind && deviceKind == null) deviceKind = kind;
        if (facts.length > 0 && detail.device.length === 0) {
          device = [
            ...(str(d.os) ? [{ label: "Operating system", value: str(d.os)! }] : []),
            ...(str(d.browser) ? [{ label: "Browser", value: str(d.browser)! }] : []),
            ...(str(d.screen) ? [{ label: "Screen", value: str(d.screen)! }] : []),
          ];
        }
        timeline.push(marker(e, kind === "phone" ? "Read the device: looks like a phone" : kind === "tablet" ? "Read the device: looks like a tablet" : "Read the computer", facts.join(" · ") || null));
        break;
      }
      case "computer_answer": {
        const said = str(d.answer);
        if (said === "yes") {
          lastAnswer = "yes";
          timeline.push(marker(e, "Said this is the computer they'll work from"));
        } else if (said === "ran_here_anyway") {
          lastAnswer = "ran_here_anyway";
          timeline.push(marker(e, "Chose to run it here anyway"));
        } else if (said === "no_switched") {
          lastAnswer = "no_switched";
          timeline.push(marker(e, "Came back on the computer they'll work from"));
        } else if (said === "no") {
          lastAnswer = "no";
          timeline.push(marker(e, "Said this is not the computer they'll work from"));
        } else {
          timeline.push(marker(e, "Answered the computer question", said));
        }
        break;
      }
      case "test_started":
        runs = Math.max(runs, run ?? runs + 1);
        timeline.push(marker(e, `${runLabel} started`));
        break;
      case "test_finished":
        runs = Math.max(runs, run ?? runs);
        timeline.push(marker(e, `${runLabel} finished`, figuresWords(d) ? `the page's estimate: ${figuresWords(d)}` : null));
        break;
      case "test_run":
        runs = Math.max(runs, run ?? runs);
        timeline.push(marker(e, `${runLabel} timed by our server`, [figuresWords(d), run != null && sentRuns.has(run) ? "the run that was sent" : null].filter(Boolean).join(" · ") || null));
        break;
      case "record_refused":
        timeline.push(marker(e, "A sent run was refused", refusalWords(str(d.reason))));
        break;
      case "submitted":
        sent = true;
        timeline.push(marker(e, run != null ? `Sent run ${run}` : "Sent it", null, "system:submitted"));
        break;
      case "reloaded":
        timeline.push(marker(e, SYSTEM_LABELS.reloaded, null, "system:reloaded"));
        break;
      case "came_back": {
        const item = marker(e, SYSTEM_LABELS.came_back, null, "system:came_back");
        item.awayMs = num(d.away_ms);
        timeline.push(item);
        break;
      }
      case "marked_left":
        timeline.push(marker(e, SYSTEM_LABELS.marked_left, null, "system:marked_left"));
        break;
      default:
        break;
    }
  }
  if (timeline.length === 0) return detail;
  // A plain "no" only stands while the check is open: a sent result always
  // carries its own answer.
  const answer = detail.usingThisComputer ?? (detail.live ? lastAnswer : lastAnswer === "no" ? null : lastAnswer);
  const flags = detail.live ? equipmentFlags({ usingThisComputer: answer, deviceKind, runs: null }) : detail.flags;
  return {
    ...detail,
    device: device ?? detail.device,
    deviceKind,
    usingThisComputer: answer,
    flags,
    runs: detail.runs ?? (runs > 0 ? runs : null),
    timeline,
    live: detail.live && !sent,
  };
}

function mergeEventsIntoDetail(detail: AssessmentDetail, events: readonly AssessmentEventRow[]): AssessmentDetail {
  switch (detail.kind) {
    case "chat_simulation":
    case "chat_interview": {
      const transcript = transcriptFromEvents(events);
      return transcript ? { ...detail, transcript, messageCount: transcript.length } : detail;
    }
    case "generic": {
      const transcript = transcriptFromEvents(events);
      return transcript ? { ...detail, transcript } : detail;
    }
    case "equipment_check":
      return mergeConnectionEvents(detail, events);
    case "typing_test": {
      const snaps = events.filter((e) => e.kind === "typing_snapshot");
      if (snaps.length === 0) return detail;
      const final = [...snaps].reverse().find((e) => obj(e.detail)?.final === true) ?? null;
      const latest = final ?? snaps[snaps.length - 1];
      const d = obj(latest.detail) ?? {};
      const typed = typeof d.typed_text === "string" && d.typed_text.length > 0 ? d.typed_text : detail.typed;
      const passage = str(d.target_text) ?? detail.passage;
      const elapsed = num(d.elapsed_ms);
      const runs = snaps.reduce((n, e) => Math.max(n, num(obj(e.detail)?.attempt_run) ?? 1), 1);
      return {
        ...detail,
        typed,
        passage,
        wpm: detail.wpm ?? num(d.wpm),
        accuracy: detail.accuracy ?? num(d.accuracy),
        seconds: elapsed != null ? Math.round(elapsed / 1000) : detail.seconds,
        words: typed && passage ? typingWords(typed, passage) : detail.words,
        runs: runs > 1 ? runs : detail.runs,
        live: detail.live && !final,
      };
    }
    case "quiz": {
      const timings = quizTimings(events);
      const shownOrder: string[] = [];
      for (const e of events) {
        const id = e.kind === "quiz_shown" || e.kind === "quiz_answer" ? str(obj(e.detail)?.question_id) : null;
        if (id && !shownOrder.includes(id)) shownOrder.push(id);
      }
      const lastShown = [...events].reverse().find((e) => e.kind === "quiz_shown");
      const onScreenId = lastShown ? str(obj(lastShown.detail)?.question_id) : null;
      if (detail.items.length > 0) {
        return {
          ...detail,
          items: detail.items.map((item) => {
            const t = timings.get(item.id);
            // A written answer is saved as they type: its edits are not changes of mind.
            return t ? { ...item, seconds: t.seconds ?? item.seconds, approximate: t.approximate, changes: item.type === "text" ? 0 : t.changes } : item;
          }),
        };
      }
      if (!detail.live || shownOrder.length === 0) return detail;
      // Still being answered: every question they have seen, in the job's
      // order, with the pick so far and the time on it. Nothing is marked
      // right or wrong until the quiz is sent and graded.
      const items: QuizItem[] = detail.questions
        .filter((q) => shownOrder.includes(q.id))
        .map((q) => {
          const t = timings.get(q.id);
          const picks = t ? pickedFrom(t.answer, q.options) : { picked: [], pickedText: [], text: null };
          return {
            id: q.id,
            index: q.index,
            question: q.question,
            category: q.category,
            type: q.type,
            options: q.options,
            picked: picks.picked,
            pickedText: picks.pickedText,
            textAnswer: q.type === "text" ? picks.text : null,
            isCorrect: null,
            partial: false,
            seconds: t?.seconds ?? null,
            approximate: t?.approximate ?? false,
            changes: q.type === "text" ? 0 : t?.changes ?? 0,
            correctTexts: null,
            onScreen: q.id === onScreenId && !t,
          };
        });
      return { ...detail, items };
    }
    default:
      return detail;
  }
}

/**
 * One entry with its attempt's events folded in: the conversation from the
 * server's turns, what they typed against the passage, the seconds on each
 * question, and the timeline of every switch away and paste. The notes'
 * versions stay where the events have nothing to add.
 */
export function withSessionEvents(entry: AssessmentEntry, events: readonly AssessmentEventRow[] | null | undefined): AssessmentEntry {
  if (!events || events.length === 0) return entry;
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  if (entry.detail?.kind === "integrity") {
    return {
      ...entry,
      detail: {
        ...entry.detail,
        groups: entry.detail.groups.map((g) => {
          if (!g.sessionId) return g;
          const timeline = integrityTimeline(sorted.filter((e) => e.session_id === g.sessionId));
          return { ...g, timeline: timeline.length > 0 ? timeline : g.timeline };
        }),
      },
    };
  }
  const timeline = integrityTimeline(sorted);
  const detail = entry.detail ? mergeEventsIntoDetail(entry.detail, sorted) : null;
  return { ...entry, detail, timeline: timeline.length > 0 ? timeline : entry.timeline };
}

/* ── The owner's integrity card (notifications, type "integrity") ─────── */

export interface IntegrityCard {
  applicationId: string;
  stepId: string;
  /** The test's own title, from "During <title>: …". */
  during: string | null;
  /** "left the window 3 times (1m 12s away)", "paste attempt ×1". */
  parts: string[];
  /** Opens the applicant's full profile on that test's record. */
  link: string;
}

/** Each part of the card, in its order (assessment_integrity_alert): the
 *  words it starts with, and how a toast says that one more happened. */
const CARD_KINDS: ReadonlyArray<{ key: string; start: string; did: string }> = [
  { key: "away", start: "left the window", did: "left the window" },
  { key: "paste", start: "paste attempt", did: "tried to paste" },
  { key: "bulk_insert", start: "pasted-in text", did: "put in pasted text" },
  { key: "copy", start: "copy attempt", did: "tried to copy" },
  { key: "screenshot_key", start: "screenshot attempt", did: "tried to take a screenshot" },
  { key: "screenshot_suspected", start: "possible screenshot", did: "may have taken a screenshot" },
  { key: "devtools", start: "developer tools opened", did: "opened developer tools" },
  { key: "page_closed", start: "closed the test page", did: "closed the test page" },
];
/** The words each part of the card starts with (assessment_integrity_alert). */
const CARD_PART_STARTS = CARD_KINDS.map((k) => k.start);
const CARD_MESSAGE = new RegExp(`^During (.+?): ((?:${CARD_PART_STARTS.join("|")})\\b.*)$`);

/**
 * Reads one grouped integrity card (public.assessment_integrity_alert:
 * group_key `integrity:<application_id>:<step_id>`, message "During <step
 * title>: <part>, <part>"). Null for any other notification.
 */
export function parseIntegrityCard(n: { type?: string | null; group_key?: string | null; message?: string | null; link?: string | null }): IntegrityCard | null {
  const key = n.group_key ?? "";
  const m = key.match(/^integrity:([0-9a-fA-F-]{36}):(.+)$/);
  if (!m) return null;
  const [, applicationId, stepId] = m;
  const msg = (n.message ?? "").trim();
  // The test's title is the job's own and may hold ": " itself, so the split
  // is anchored on the card's first part, which is always one of these words.
  const said = msg.match(CARD_MESSAGE);
  const parts = (said ? said[2] : msg)
    .split(/,\s+/)
    .map((p) => p.trim().replace(/ x(\d+)$/, " ×$1"))
    .filter(Boolean);
  return {
    applicationId,
    stepId,
    during: said ? said[1] : null,
    parts,
    link: `/applicants/${applicationId}?record=${encodeURIComponent(stepId)}&focus=integrity`,
  };
}

/* ── A live toast for every new flag on the card ───────────────────────── */
// The owner: told EVERY time an applicant copies, pastes, tries a screenshot
// or switches windows. The server keeps ONE card per applicant per test and
// rewrites it on each new batch of events (new tally, unread again,
// created_at = now()), so after the first event the bell sees UPDATEs, not
// INSERTs. These turn each counted-up card into one toast — once per batch,
// never for the same update twice, never for a "mark as read".

/** The slice of a `notifications` row the toast reads. */
export interface IntegrityCardRow {
  id?: string | null;
  type?: string | null;
  group_key?: string | null;
  title?: string | null;
  message?: string | null;
  link?: string | null;
  is_read?: boolean | null;
  created_at?: string | null;
}

export interface IntegrityToast {
  /** One id per card update: the same update is one toast however often it arrives. */
  id: string;
  /** "Robin Okafor left the window during Player chat practice (3rd time)". */
  title: string;
  /** The running tally in the card's words: "So far: left the window 3 times (1m 12s away) · paste attempt ×1". */
  description: string;
  /** That test's timeline on the applicant's profile. */
  link: string;
}

/** The card's counts by part ("left the window 3 times" → away: 3,
 *  "paste attempt ×1" → paste: 1). Parts it does not know are skipped. */
export function integrityCardCounts(parts: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const raw of parts) {
    const part = raw.trim();
    const kind = CARD_KINDS.find((k) => part.startsWith(k.start));
    if (!kind) continue;
    const n =
      kind.key === "away"
        ? Number(part.match(/^left the window (\d+) times?\b/)?.[1] ?? NaN)
        : Number(part.match(/[×x](\d+)\s*$/)?.[1] ?? NaN);
    if (Number.isFinite(n) && n > 0) counts[kind.key] = (counts[kind.key] ?? 0) + n;
  }
  return counts;
}

/** "Robin Okafor" from "Integrity — Robin Okafor" (the server's own fallback
 *  when there is no name is "A candidate"). */
function cardPerson(title: string | null | undefined): string {
  const t = (title ?? "").trim();
  const m = t.match(/^Integrity\s+[—–-]\s+(.+)$/);
  return (m ? m[1].trim() : "") || "A candidate";
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

function andList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The id one update of a card toasts under: the card and the time of its update. */
export function integrityToastId(row: IntegrityCardRow): string {
  return `integrity:${row.group_key ?? row.id ?? ""}:${row.created_at ?? ""}`;
}

/**
 * The toast for one write of the owner's integrity card, or null when it
 * says nothing new. `prev` is the card as it was last seen: `null` when the
 * card is new (everything on it is new), `undefined` when it was never seen
 * (an update whose earlier counts are unknown: said without a count).
 */
export function integrityCardToast(prev: IntegrityCardRow | null | undefined, next: IntegrityCardRow): IntegrityToast | null {
  const card = parseIntegrityCard(next);
  if (!card) return null;
  const now = integrityCardCounts(card.parts);
  if (Object.keys(now).length === 0) return null;
  const person = cardPerson(next.title);
  const during = card.during ? ` during ${card.during}` : "";
  const base = {
    id: integrityToastId(next),
    description: `So far: ${card.parts.join(" · ")}`,
    link: card.link,
  };
  if (prev === undefined) return { ...base, title: `${person} was flagged again${during}` };

  const before = prev ? integrityCardCounts(parseIntegrityCard(prev)?.parts ?? []) : {};
  const grew = CARD_KINDS.filter((k) => (now[k.key] ?? 0) > (before[k.key] ?? 0));
  if (grew.length === 0) return null;
  if (grew.length > 1) return { ...base, title: `${person} ${andList(grew.map((k) => k.did))}${during}` };

  const kind = grew[0];
  const total = now[kind.key];
  const added = total - (before[kind.key] ?? 0);
  const title =
    added === 1
      ? `${person} ${kind.did}${during}${total > 1 ? ` (${ordinal(total)} time)` : ""}`
      : added === total
        ? `${person} ${kind.did} ${total} times${during}`
        : `${person} ${kind.did} ${added} more times${during} (${total} in all)`;
  return { ...base, title };
}

/**
 * Decides, for each realtime write of a notification, whether it is a new
 * flag to toast. One per tab (module scope in the toast host), so two mounts
 * or a re-delivered message can never toast the same update twice.
 *
 *  - `seed(rows)`: the cards as fetched (on subscribe and after a reconnect),
 *    so the next update is compared with what the card said.
 *  - `consider(event, row)`: a toast, or null for anything that is not an
 *    integrity card, is read (a mark-as-read, here or on another device),
 *    is older than what was seen, or adds nothing.
 */
export function createIntegrityToastGate(limit = 500) {
  type Seen = { row: IntegrityCardRow; at: number | null; fromSeed: boolean };
  const cards = new Map<string, Seen>();
  const shown = new Set<string>();
  const keyOf = (row: IntegrityCardRow) => row.group_key ?? row.id ?? "";
  const trim = <T,>(set: Set<T> | Map<T, unknown>) => {
    while (set.size > limit) {
      const first = set.keys().next().value as T;
      set.delete(first);
    }
  };
  const isCard = (row: IntegrityCardRow | null | undefined): row is IntegrityCardRow => !!row && parseIntegrityCard(row) != null;

  return {
    seed(rows: readonly (IntegrityCardRow | null | undefined)[] | null | undefined) {
      for (const row of rows ?? []) {
        if (!isCard(row)) continue;
        const at = toMillis(row.created_at);
        const held = cards.get(keyOf(row));
        // Never step back over a newer write the channel already delivered.
        if (held && (held.at == null || (at != null && held.at >= at))) continue;
        cards.set(keyOf(row), { row: { ...row }, at, fromSeed: true });
      }
      trim(cards);
    },
    consider(event: "INSERT" | "UPDATE", row: IntegrityCardRow | null | undefined): IntegrityToast | null {
      if (!isCard(row)) return null;
      const key = keyOf(row);
      const at = toMillis(row.created_at);
      const held = cards.get(key);
      // A write older than the one already seen changes nothing.
      if (held && held.at != null && at != null && at < held.at) return null;
      cards.set(key, { row: { ...row }, at, fromSeed: false });
      trim(cards);
      if (row.is_read === true) return null;
      const id = integrityToastId(row);
      if (shown.has(id)) return null;
      const same = !!held && held.row.created_at === row.created_at && held.row.message === row.message;
      // Delivered before (or marked unread again): nothing new happened.
      if (same && !held!.fromSeed) return null;
      // Compared with the card as last seen. A new card: everything on it is
      // new. An update of a card never seen — or seen only by the seed, which
      // read this very write before its message arrived — grew by an unknown
      // part, so it is said without a count.
      const prev: IntegrityCardRow | null | undefined = held && !same ? held.row : event === "INSERT" ? null : undefined;
      const toast = integrityCardToast(prev, row);
      if (toast) {
        shown.add(id);
        trim(shown);
      }
      return toast;
    },
  };
}

/** What Ava had in hand, for her letterhead's "…, weighed against the job"
 *  line: up to three things by name ("application, skills check and resume"),
 *  past that a count, so the line stays one line on a phone. */
export function weighedPhrase(entries: readonly AssessmentEntry[]): string | null {
  const steps = entries.filter((e) => e.kind !== "integrity" && e.kind !== "resume");
  const done = entries.filter((e) => e.status === "done" && e.kind !== "integrity");
  if (done.length === 0) return null;
  if (done.length <= 3) {
    const parts = done.map((e) => lowerFirst(e.title));
    return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  }
  const doneSteps = steps.filter((e) => e.status === "done").length;
  return doneSteps === steps.length ? `all ${doneSteps} steps` : `${doneSteps} of ${steps.length} steps`;
}
