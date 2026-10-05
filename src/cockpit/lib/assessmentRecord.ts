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
 * Pure and display-only: no React, no Supabase, no dates formatted here, so
 * `scripts/assessment_record.test.mjs` runs it under plain Node.
 */
import { buildCandidateJourney, positionFor, titleFor, DECISION_STAGE_ID } from "@/lib/candidateJourney";
import type { CandidateJourneyStep, WorkflowStepLike } from "@/lib/candidateJourney";
import { stepHasResult } from "@/lib/journeyProgress";
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
  } | null;
}

export type AssessmentKind =
  | "application"
  | "resume"
  | "quiz"
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
}

export interface IntegrityTally {
  total: number;
  tabSwitches: number;
  copyPaste: number;
  other: number;
  /** Each event with its time, when the test kept them. */
  events: IntegrityEvent[];
  /** True when only counts were kept (chat practice keeps no event list). */
  countsOnly: boolean;
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
}

export interface Inconsistency {
  claim: string;
  evidence: string;
  assessment: string;
}

export type AssessmentDetail =
  | { kind: "application"; answers: AnswerItem[]; coverLetter: string | null; hasResume: boolean; flags: string[] }
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
  | { kind: "integrity"; groups: Array<{ key: string; title: string; tally: IntegrityTally }> };

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
}

export interface AssessmentRecord {
  entries: AssessmentEntry[];
  /** Ava's own flags (ai_scorecard.riskFlags), verbatim, in her order. */
  riskFlags: string[];
  /** Still on the application form: Apply Now was pressed, nothing is sent yet. */
  fillingInForm: boolean;
  integrityTotal: number;
  jobId: string | null;
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
      events.push({ type, label: integrityLabel(type), at: str(v?.timestamp) ?? str(v?.at), detail: str(v?.details) ?? str(v?.detail) });
    }
    const tabSwitches = events.filter((e) => e.type === "tab_switch").length;
    const copyPaste = events.filter((e) => /^(copy|paste|cut)_attempt$/.test(e.type)).length;
    return { total: events.length, tabSwitches, copyPaste, other: events.length - tabSwitches - copyPaste, events, countsOnly: false };
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

/** "Left the window 2× · 1 copy or paste" — the row's flag line. */
export function integritySummary(t: IntegrityTally): string | null {
  if (t.total === 0) return null;
  const parts: string[] = [];
  if (t.tabSwitches > 0) parts.push(`left the window ${t.tabSwitches}×`);
  if (t.copyPaste > 0) parts.push(`${t.copyPaste} copy or paste`);
  if (t.other > 0) parts.push(`${t.other} other`);
  const line = parts.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
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

function buildApplication(ctx: BuildContext): Built {
  const answers: AnswerItem[] = [];
  const raw = Array.isArray(ctx.notes.applicationAnswers) ? (ctx.notes.applicationAnswers as unknown[]) : [];
  raw.forEach((value, i) => {
    const a = obj(value);
    if (!a) return;
    const selected = strList(a.selected).length > 0 ? strList(a.selected) : Array.isArray(a.answer) ? strList(a.answer) : null;
    const answer = typeof a.answer === "string" ? a.answer : selected ? selected.join("; ") : a.answer == null ? "" : String(a.answer);
    answers.push({
      id: str(a.questionId) ?? `answer-${i}`,
      question: str(a.question) ?? `Question ${i + 1}`,
      answer,
      selected: selected && selected.length > 0 ? selected : null,
      type: str(a.type),
    });
  });
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
    detail: { kind: "application", answers, coverLetter, hasResume: !!ctx.app.resume_url, flags },
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
    detail: { kind: "quiz", correct, total, score, passed, items, keyStepId },
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

  let verdict: string | null = null;
  if (passed === true) verdict = "Passed";
  else if (wpm != null && requiredWpm != null && wpm < requiredWpm) verdict = `Below the ${requiredWpm} WPM bar`;
  else if (accuracy != null && requiredAccuracy != null && accuracy < requiredAccuracy) verdict = `Below ${requiredAccuracy}% accuracy`;
  else if (passed === false) verdict = "Did not pass";

  const headline = wpm != null ? `${Math.round(wpm)} WPM` : null;
  return {
    headline,
    tone: passed === true ? "jade" : passed === false ? "amber" : "ink",
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
  { type: "typing_test", present: (c) => !!obj(c.notes.typingTestResult) },
  { type: "chat_simulation", present: (c) => !!obj(c.notes.chatSimulationResult) },
  { type: "chat_interview", present: (c) => !!obj(c.notes.chatInterviewResult) },
  { type: "sales_simulation", present: (c) => !!obj(c.notes.salesSimulationResult) },
  { type: "portfolio_upload", present: (c) => !!obj(c.notes.portfolioResult) },
  { type: "voice_interview", present: (c) => !!c.app.voice_interview_result || !!turnsOf(c.app.voice_interview_transcript) },
];

/**
 * One entry per step the job gives this applicant, in the job's order, then
 * any result the job no longer lists, the resume (when one is on file) right
 * after the application, and a closing integrity row when anything was
 * flagged. A showcase row (no notes, no job) has no record to show: [].
 */
export function buildAssessmentRecord(app: AssessmentAppInput | null | undefined): AssessmentRecord {
  const empty: AssessmentRecord = { entries: [], riskFlags: [], fillingInForm: false, integrityTotal: 0, jobId: null };
  if (!app) return empty;
  const fillingInForm = isFillingInForm(app.status);
  const scorecard = obj(app.ai_scorecard);
  const riskFlags = strList(scorecard?.riskFlags);
  if (app.notes == null && app.jobs == null && !fillingInForm) return { ...empty, riskFlags };

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
  journey.forEach((step, i) => {
    let done: boolean;
    if (step.type === "application") {
      const answers = notes.applicationAnswers;
      done = !fillingInForm && ((Array.isArray(answers) && answers.length > 0) || !!app.status);
    } else if (step.type === "quiz") {
      done = !!quiz.record || !!obj(notes.quizResult) || stepHasResult(notes, app.voice_interview_result, step);
    } else {
      done = stepHasResult(notes, app.voice_interview_result, step);
    }
    const inProgress = !done && !decided && (step.type === "application" ? fillingInForm : i === position.index);
    const status: AssessmentStatus = done ? "done" : inProgress ? "in_progress" : "not_started";
    const built = done ? buildStep(ctx, step) : null;
    const detail = built?.detail ?? null;
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
        : inProgress
          ? step.type === "application"
            ? "Filling in the form"
            : "In progress"
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
      receipt: built?.receipt ?? null,
      completedAt: built?.completedAt ?? null,
      integrity: built?.integrity ?? EMPTY_TALLY,
      openable: done && detail != null,
      detail,
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
    });
  }

  const flagged = entries.filter((e) => e.integrity.total > 0);
  const integrityTotal = flagged.reduce((n, e) => n + e.integrity.total, 0);
  if (integrityTotal > 0) {
    const all: IntegrityTally = flagged.reduce<IntegrityTally>(
      (acc, e) => ({
        total: acc.total + e.integrity.total,
        tabSwitches: acc.tabSwitches + e.integrity.tabSwitches,
        copyPaste: acc.copyPaste + e.integrity.copyPaste,
        other: acc.other + e.integrity.other,
        events: [...acc.events, ...e.integrity.events],
        countsOnly: acc.countsOnly || e.integrity.countsOnly,
      }),
      EMPTY_TALLY,
    );
    entries.push({
      key: "integrity",
      kind: "integrity",
      stepType: "integrity",
      title: "Integrity checks",
      status: "done",
      statusLabel: "Flagged",
      headline: `${integrityTotal} ${integrityTotal === 1 ? "flag" : "flags"}`,
      tone: "amber",
      verdict: `in ${flagged.length} ${flagged.length === 1 ? "test" : "tests"}`,
      subline: integritySummary(all),
      receipt: null,
      completedAt: null,
      integrity: all,
      openable: true,
      detail: { kind: "integrity", groups: flagged.map((e) => ({ key: e.key, title: e.title, tally: e.integrity })) },
    });
  }

  return { entries, riskFlags, fillingInForm, integrityTotal, jobId: str(app.jobs?.id) ?? null };
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
