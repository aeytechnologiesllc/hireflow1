/**
 * applicantProfile.ts — the rules the full profile (/applicants/:id) shares
 * with the Applicants list (docs/APPLICANTS-LIST.md §2 and §4). Pure: no
 * React, no Supabase, so scripts/applicant_profile.test.mjs runs them as they
 * are and the list can import the same rules instead of writing its own.
 *
 * The journey dots are decided by the RECORD (buildAssessmentRecord's entry
 * for each step: status, tone, statusLabel), never by position. Position is
 * how the old rail drew a check and "Completed" on a step the job gained after
 * the applicant had passed it, while the record beside it said "No result on
 * file". A step like that is Skipped.
 */
// Through "@/": the Node test runner resolves only that spelling (a value import, unlike the type-only one below).
import { chatTypingNeedsALook } from "@/cockpit/lib/assessmentRecord";
import type { AssessmentEntry, AssessmentRecord, AssessmentSessionRow, LiveState, LiveStatus } from "./assessmentRecord";
import { DECISION_STAGE_ID, titleFor } from "@/lib/candidateJourney";

/* ── The journey dots ──────────────────────────────────────────────────── */

/**
 * - done: finished, at or over the job's bar (jade, check).
 * - below: finished, below the job's bar (brass, check). The record's tone
 *   says it: a done step is amber only when it fell short (a failed quiz, a
 *   typing speed or connection under the bar, a score under the pass mark, a
 *   "No Hire" interview). Flags never colour a step.
 * - now: on it now (ring).
 * - skipped: they went past it and no result is on file (dashed ring).
 * - not_reached: everything else, including "Not taken" by someone decided
 *   before they got there (empty).
 */
export type JourneyDotState = "done" | "below" | "now" | "skipped" | "not_reached";

export interface JourneyDot {
  /** The journey step id, or "decision". */
  id: string;
  title: string;
  /** The step type ("typing_test"…), or "decision". */
  type: string;
  state: JourneyDotState;
  /** On it now, but gone from the test (the record's live state is "left"):
   *  still their step, drawn as a quiet ring. */
  left: boolean;
  /** The record's entry for this step; null for the Decision dot. */
  entry: AssessmentEntry | null;
}

/** A decision is made: the closing stage is behind them. */
export const DECIDED_STATUSES: ReadonlySet<string> = new Set(["rejected", "interview", "offered", "hired"]);

export function isDecided(status: string | null | undefined): boolean {
  return DECIDED_STATUSES.has(status ?? "");
}

/** The record's own entries for the job's journey steps, in its order: not the
 *  resume row, the integrity row or a result the job no longer lists. */
export function journeyEntries(entries: readonly AssessmentEntry[]): AssessmentEntry[] {
  return entries.filter((e) => e.kind !== "resume" && e.kind !== "integrity" && !e.key.startsWith("extra-"));
}

/** The words the record uses for a step they went past without a result
 *  (buildAssessmentRecord). That, and only that, is a skipped dot. */
const NO_RESULT_ON_FILE = "No result on file";

function stepDot(entry: AssessmentEntry, live: AssessmentRecord["live"] | null | undefined): JourneyDot {
  const state: JourneyDotState =
    entry.status === "done"
      ? entry.tone === "amber"
        ? "below"
        : "done"
      : entry.status === "in_progress"
        ? "now"
        : entry.statusLabel === NO_RESULT_ON_FILE
          ? "skipped"
          : "not_reached";
  return {
    id: entry.key,
    title: entry.title,
    type: entry.stepType,
    state,
    // The record's one live attempt (the one they touched last) decides it,
    // as on the list's row.
    left: state === "now" && live?.stepId === entry.key && live.state === "left",
    entry,
  };
}

/**
 * One dot per journey step of THIS applicant's job (Application, the Skills
 * check if the job has one, each workflow step), then Decision.
 *
 * Decision: done once the application is decided (declined, interview, offer,
 * hired); on it now when no step is in progress and every step is done or
 * skipped; otherwise not reached. Empty when the record has no steps (a
 * showcase row): there is no journey to draw.
 */
export function journeyDots(
  record: Pick<AssessmentRecord, "entries" | "live"> | null | undefined,
  status: string | null | undefined,
): JourneyDot[] {
  const steps = journeyEntries(record?.entries ?? []).map((e) => stepDot(e, record?.live));
  if (steps.length === 0) return [];
  const finished = steps.every((d) => d.state === "done" || d.state === "below" || d.state === "skipped");
  const decision: JourneyDot = {
    id: DECISION_STAGE_ID,
    title: titleFor(DECISION_STAGE_ID),
    type: DECISION_STAGE_ID,
    state: isDecided(status) ? "done" : finished ? "now" : "not_reached",
    left: false,
    entry: null,
  };
  return [...steps, decision];
}

/** Every journey step done or skipped. The Decision dot is the hiring team's,
 *  not a test, so it never counts. */
export function finishedEveryTest(dots: readonly JourneyDot[]): boolean {
  const steps = dots.filter((d) => d.id !== DECISION_STAGE_ID);
  return steps.length > 0 && steps.every((d) => d.state === "done" || d.state === "below" || d.state === "skipped");
}

/** "Needs review": finished every test and not decided, so it is waiting on
 *  the hiring team. The list's tab and the profile's pill are this one rule. */
export function needsReview(dots: readonly JourneyDot[], status: string | null | undefined): boolean {
  return finishedEveryTest(dots) && !isDecided(status);
}

/**
 * Where the traveller sits on the rail: the step they are on now (the one
 * they touched last when two are open), else the Decision once decided, else
 * the furthest step behind them. Never a step they have not reached.
 */
export function railIndex(dots: readonly JourneyDot[], liveStepId?: string | null): number {
  if (dots.length === 0) return 0;
  const live = liveStepId ? dots.findIndex((d) => d.id === liveStepId && d.state === "now") : -1;
  if (live >= 0) return live;
  const now = dots.findIndex((d) => d.state === "now");
  if (now >= 0) return now;
  const last = dots.length - 1;
  if (dots[last].id === DECISION_STAGE_ID && dots[last].state === "done") return last;
  for (let i = last; i >= 0; i -= 1) {
    if (dots[i].state === "done" || dots[i].state === "below" || dots[i].state === "skipped") return i;
  }
  return 0;
}

/** The status chip beside the name (list row and profile header alike). */
export interface ApplicantChip {
  label: "Needs review" | "Interview" | "Offer" | "Hired" | "Declined";
  tone: "amber" | "jade" | "crit";
}

export function applicantChip(status: string | null | undefined, finished: boolean): ApplicantChip | null {
  switch (status) {
    case "rejected":
      return { label: "Declined", tone: "crit" };
    case "hired":
      return { label: "Hired", tone: "jade" };
    case "offered":
      return { label: "Offer", tone: "jade" };
    case "interview":
      return { label: "Interview", tone: "jade" };
    default:
      return finished ? { label: "Needs review", tone: "amber" } : null;
  }
}

/** The outcome stamped on a decided applicant's Decision seal. */
export function decisionWord(status: string | null | undefined): string | null {
  switch (status) {
    case "rejected":
      return "Declined";
    case "hired":
      return "Hired";
    case "offered":
      return "Offer";
    case "interview":
      return "Interview";
    default:
      return null;
  }
}

/** The short word under a gem: the record's own receipt when it has one. */
export function dotReceipt(dot: JourneyDot): string | null {
  if (dot.id === DECISION_STAGE_ID) return null; // the caller says the decision in its own words
  switch (dot.state) {
    case "done":
    case "below":
      return dot.entry?.receipt ?? (dot.state === "below" ? "Below the bar" : "Done");
    case "now":
      if (dot.entry?.receipt) return dot.entry.receipt;
      if (dot.type === "application") return "Filling in";
      // Theirs to take, and nothing on file for it yet.
      return dot.entry?.session ? null : "Not started";
    case "skipped":
      return "Skipped";
    default:
      return null;
  }
}

/** The dot's state in words, for its tooltip and accessible name. */
export function dotStateWords(dot: JourneyDot): string {
  switch (dot.state) {
    case "done":
      return "Done";
    case "below":
      return "Done, below the job's bar";
    case "now":
      return dot.left ? "Left it part-way" : "On it now";
    case "skipped":
      return "Skipped: no result on file";
    default:
      return "Not reached";
  }
}

/* ── The one line under the dots (the list's row and the profile's rail) ── */

/** A colour by meaning for one run of the line; the list maps it onto the
 *  cockpit's tokens (TONE_VAR in applicantList.ts). */
export type LineTone = "jade" | "amber" | "soft" | "muted";

export interface LineRun {
  text: string;
  tone: LineTone;
}

/** A grading claim nothing has written to for this long belongs to a request
 *  that died: the server's own stale-claim limit (assessment_expire_stale_claim,
 *  on updated_at). The next start or heartbeat turns it into `failed`. */
export const STALE_CLAIM_MS = 7 * 60 * 1000;

type LineSession = Pick<AssessmentSessionRow, "id"> & Partial<Pick<AssessmentSessionRow, "progress" | "updated_at" | "last_activity_at">>;

/** What the line reads beyond the dots. Every field is optional: without them
 *  the line still names the step and where it sits. */
export interface JourneyLineContext {
  /** The record's live attempt (record.live): the one they touched last. */
  live?: LiveStatus | null;
  /** The applicant's attempts (any columns that include progress and
   *  updated_at): which question, how many replies, how long it has been checking. */
  sessions?: readonly LineSession[] | null;
  /** ai_scorecard.recommendedAction: "Ava suggests: …" after "Finished every test". */
  recommendedAction?: string | null;
  /** The clock the record was read against. */
  now?: number;
}

function numberOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/** Where they are inside one attempt: answers sent, the question on screen, replies. */
function progressOf(session: LineSession | null | undefined): { answered: number | null; total: number | null; index: number | null; turns: number } {
  const raw = session?.progress;
  const p = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return { answered: numberOf(p.answered), total: numberOf(p.total), index: numberOf(p.current_index), turns: numberOf(p.candidate_turns) ?? 0 };
}

/**
 * The live state as the list and the profile use it: the record's own, except
 * that a claim being checked past the server's stale-claim limit is read the
 * way the server will treat it on their next move, as `failed`. Nothing sweeps
 * those (there is no cron), so without this a dead request would keep someone
 * on "Taking tests now" for good.
 */
export function effectiveLiveState(live: LiveStatus | null | undefined, session: LineSession | null | undefined, now: number | undefined): LiveState | null {
  if (!live) return null;
  if (live.state !== "checking" || now == null) return live.state;
  const touched = Date.parse(session?.updated_at ?? session?.last_activity_at ?? live.lastActivityAt ?? "");
  return Number.isFinite(touched) && now - touched > STALE_CLAIM_MS ? "failed" : "checking";
}

/** The states that count as taking a test right now: the list's "Taking tests
 *  now" tab, the jade "Active …" and the profile's "live". */
export const LIVE_NOW_STATES: ReadonlySet<LiveState> = new Set<LiveState>(["doing", "away", "checking"]);

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * The step the line is about (0-based, into the dots before Decision): the
 * attempt they touched last, else the step that is theirs now, else (parked
 * on a finished step) the first one not reached. -1 when none is.
 */
export function lineStepIndex(dots: readonly JourneyDot[], liveStepId?: string | null): number {
  const steps = dots.filter((d) => d.id !== DECISION_STAGE_ID);
  const live = liveStepId ? steps.findIndex((d) => d.id === liveStepId) : -1;
  if (live >= 0) return live;
  const now = steps.findIndex((d) => d.state === "now");
  if (now >= 0) return now;
  return steps.findIndex((d) => d.state === "not_reached");
}

/**
 * The one line under the dots, run by run, for the list's row AND the
 * profile's rail, so the two always say the same thing (contract §2):
 * "Typing test · step 4 of 7 · live", "Skills check · question 6 of 10 ·
 * step 2 of 7 · live", "Left at player chat practice, reply 3", "Away from
 * the test for 3 min", "Finished every test · Ava suggests: decline",
 * "Moved to interview", "Computer and connection · step 3 of 7 · not started"
 * (theirs to take), "… · not opened yet" (parked: the next test waits on the
 * hiring team), "Filling in the form · 3 of 11 answered · live", "Waiting to
 * continue on a computer · Typing test · step 4 of 7" (opened on a phone).
 * Null when there is no journey to describe.
 */
export function journeyLineRuns(dots: readonly JourneyDot[], status: string | null | undefined, ctx: JourneyLineContext = {}): LineRun[] | null {
  if (dots.length === 0) return null;
  const runs: LineRun[] = [];
  const push = (text: string, tone: LineTone) => runs.push({ text, tone });
  switch (status) {
    case "rejected":
      return [{ text: "Declined", tone: "soft" }];
    case "hired":
      return [{ text: "Hired", tone: "soft" }];
    case "offered":
      return [{ text: "Offer made", tone: "soft" }];
    case "interview":
      return [{ text: "Moved to interview", tone: "soft" }];
  }
  if (finishedEveryTest(dots)) {
    push("Finished every test", "soft");
    if (ctx.recommendedAction === "reject") push(" · Ava suggests: decline", "amber");
    else if (ctx.recommendedAction === "advance") push(" · Ava suggests: interview", "jade");
    return runs;
  }

  const steps = dots.filter((d) => d.id !== DECISION_STAGE_ID);
  // No record-wide live attempt given: the step they are on says its own.
  const live = ctx.live !== undefined ? ctx.live : steps.find((d) => d.state === "now" && d.entry?.session?.live && d.entry.session.live.state !== "finished")?.entry?.session?.live ?? null;
  const at = lineStepIndex(dots, live?.stepId);
  if (at < 0) return null;
  const dot = steps[at];
  const stepOf = `step ${at + 1} of ${dots.length}`;
  const session = dot.entry?.session ? (ctx.sessions ?? []).find((s) => s?.id === dot.entry!.session!.id) ?? null : null;
  const state = live && live.stepId === dot.id ? effectiveLiveState(live, session, ctx.now) : null;
  const p = progressOf(session);

  if (state === "left") {
    const where =
      dot.type === "application"
        ? p.total
          ? `Left the form at ${p.answered ?? 0} of ${p.total}`
          : "Left the form"
        : dot.type === "quiz"
          ? `Left at ${lowerFirst(dot.title)}${p.index != null ? `, question ${p.index + 1}` : ""}`
          : /chat|sales/.test(dot.type) && p.turns > 0
            ? `Left at ${lowerFirst(dot.title)}, reply ${p.turns}`
            : `Left at ${lowerFirst(dot.title)}`;
    push(where, "amber");
  } else if (state === "away") {
    // The form is not a test: "Away from the form", not "from the test".
    push(dot.type === "application" ? live!.text.replace(/^Away from the test\b/, "Away from the form") : live!.text, "amber");
  } else if (state === "waiting") {
    // Opened on a phone or a tablet, at "Continue on your computer", and
    // nothing since (docs/COMPUTER-ONLY-TESTS.md): not "not started".
    push("Waiting to continue on a computer", "amber");
    push(` · ${dot.title} · ${stepOf}`, "muted");
  } else if (dot.type === "application") {
    push("Filling in the form", "soft");
    if (state && p.total) push(` · ${p.answered ?? 0} of ${p.total} answered`, "muted");
    if (state === "doing") {
      push(" · ", "muted");
      push("live", "jade");
    }
  } else if (state) {
    push(dot.title, "soft");
    if (dot.type === "quiz" && state === "doing" && p.index != null) push(` · question ${p.index + 1}${p.total ? ` of ${p.total}` : ""}`, "soft");
    if (state === "checking") push(" · checking the answers", "muted");
    push(` · ${stepOf}`, "muted");
    if (state === "doing") {
      push(" · ", "muted");
      push("live", "jade");
    } else if (state === "failed") {
      push(" · checking failed, retrying", "amber");
    }
  } else {
    push(dot.title, "soft");
    // Theirs to take now, or parked: what they took is in and the next test
    // waits on the hiring team to open it (the step gate will not let them in).
    const how = dot.state === "now" ? (dot.entry?.retake === "open" ? "retake not started" : "not started") : "not opened yet";
    push(` · ${stepOf} · ${how}`, "muted");
  }
  return runs;
}

/** The same line as plain text (the rail's summary, a tooltip). */
export function journeyLine(dots: readonly JourneyDot[], status: string | null | undefined, ctx: JourneyLineContext = {}): string | null {
  const runs = journeyLineRuns(dots, status, ctx);
  return runs ? runs.map((r) => r.text).join("") : null;
}

/* ── Long words on a narrow rail ───────────────────────────────────────── */

const VOWEL = /[aeiouy]/i;
const LETTER = /\p{L}/u;

/** One word with a soft hyphen (U+00AD) at the syllable-ish break nearest its
 *  middle: between two consonants after a vowel ("Inter|view", "Connec|tion"),
 *  else before a consonant after a vowel ("Appli|cation", "Deci|sion"). Both
 *  halves keep three letters or more. */
function hyphenateWord(word: string): string {
  if (word.length < 8 || ![...word].every((ch) => LETTER.test(ch))) return word;
  let best = -1;
  const middle = word.length / 2;
  for (let i = 3; i <= word.length - 3; i += 1) {
    const a = word[i - 1];
    const b = word[i];
    const c = word[i + 1] ?? "";
    const consonantPair = !VOWEL.test(a) && !VOWEL.test(b) && VOWEL.test(word[i - 2]) && VOWEL.test(c);
    const beforeConsonant = VOWEL.test(a) && !VOWEL.test(b) && VOWEL.test(c);
    if ((consonantPair || beforeConsonant) && (best < 0 || Math.abs(i - middle) < Math.abs(best - middle))) best = i;
  }
  return best < 0 ? word : `${word.slice(0, best)}\u00ad${word.slice(best)}`;
}

/**
 * Soft hyphens in the long words of a rail label or receipt. On a phone each
 * of seven gems has about 42px, and a browser will not hyphenate a word that
 * starts with a capital ("Application", "Interview"), so CSS alone cut them
 * at any letter ("Applicat|ion"). A soft hyphen is invisible unless the word
 * actually breaks there.
 */
export function softHyphenate(text: string): string {
  return text.replace(/\p{L}+/gu, hyphenateWord);
}

/* ── The score, the way the list says it ──────────────────────────────── */

export interface ApplicantScore {
  /** `applications.ai_score`, rounded; null when Ava has not scored them. Never
   *  a quiz percentage standing in for it. */
  value: number | null;
  /** Ava is still waiting on tests (ai_scorecard.decisionState = needs_more_evidence). */
  soFar: boolean;
  /** jade at 70 and up, brass 50–69, ink under 50. */
  band: "hi" | "mid" | "lo" | null;
}

export function applicantScore(app: { ai_score?: unknown; ai_scorecard?: unknown } | null | undefined): ApplicantScore {
  const raw = app?.ai_score;
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  const card = app?.ai_scorecard && typeof app.ai_scorecard === "object" ? (app.ai_scorecard as Record<string, unknown>) : null;
  if (!Number.isFinite(n)) return { value: null, soFar: false, band: null };
  const value = Math.round(n);
  return { value, soFar: card?.decisionState === "needs_more_evidence", band: value >= 70 ? "hi" : value >= 50 ? "mid" : "lo" };
}

export function scoreColor(band: ApplicantScore["band"]): string {
  // The list's ScoreCell colours (TONE_VAR in applicantList.ts): ink, not a
  // softer grey, under 50 (docs/APPLICANTS-LIST.md §2).
  return band === "hi" ? "var(--jade)" : band === "mid" ? "var(--brass)" : band === "lo" ? "var(--ink)" : "var(--ink-3)";
}

/* ── "3 of 64": the list's order, carried to the profile ─────────────── */

/** The list writes the ids it is showing, in its order (tab, filters, sort),
 *  here in sessionStorage; the profile pages through them. */
export const APPLICANT_ORDER_KEY = "applicantList.order.v1";

export function parseApplicantOrder(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const ids = parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}

type ReadStore = Pick<Storage, "getItem">;
type WriteStore = Pick<Storage, "setItem">;

function sessionStore(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null; // blocked storage (private mode, a sandboxed frame)
  }
}

export function readApplicantOrder(store: ReadStore | null = sessionStore()): string[] | null {
  try {
    return parseApplicantOrder(store?.getItem(APPLICANT_ORDER_KEY) ?? null);
  } catch {
    return null;
  }
}

export function writeApplicantOrder(ids: readonly string[], store: WriteStore | null = sessionStore()): void {
  try {
    store?.setItem(APPLICANT_ORDER_KEY, JSON.stringify(ids));
  } catch {
    // Full or blocked storage: the profile simply shows no pager.
  }
}

export interface ApplicantPager {
  /** 1-based, for "3 of 64". */
  position: number;
  total: number;
  prevId: string | null;
  nextId: string | null;
}

/** Null (no pager) when the profile was opened from a link, when this person
 *  is not in the list's order, or when they are the only one in it. */
export function pagerFor(order: readonly string[] | null | undefined, id: string | null | undefined): ApplicantPager | null {
  if (!order || !id) return null;
  const at = order.indexOf(id);
  if (at < 0 || order.length < 2) return null;
  return {
    position: at + 1,
    total: order.length,
    prevId: at > 0 ? order[at - 1] : null,
    nextId: at < order.length - 1 ? order[at + 1] : null,
  };
}

/* ── The phone's action bar ────────────────────────────────────────────── */

/** At most `max` buttons on a phone: all of them when they fit, else the first
 *  `max - 1` and a "More" that holds the rest, in order. */
export function splitActionBar<T>(actions: readonly T[], max = 3): { shown: T[]; more: T[] } {
  if (actions.length <= max) return { shown: [...actions], more: [] };
  const keep = Math.max(1, max - 1);
  return { shown: actions.slice(0, keep), more: actions.slice(keep) };
}

/* ── The timeline: applied, each test, the decision ───────────────────── */

export interface TimelineMoment {
  key: string;
  label: string;
  /** ISO time. */
  at: string;
  kind: "applied" | "step" | "decision";
}

/**
 * Only moments the record can date: when they applied (or pressed Apply, while
 * still on the form), each test they finished with its finishing time, then
 * the decision. `updated_at` is when the row last changed — the best date the
 * record has for a decision, and used for nothing else (Ava's own analysis
 * moves it too, so it is never a test's time).
 */
export function timelineMoments(
  app: { status?: string | null; created_at?: string | null; updated_at?: string | null } | null | undefined,
  record: Pick<AssessmentRecord, "entries" | "fillingInForm"> | null | undefined,
): TimelineMoment[] {
  const out: TimelineMoment[] = [];
  const valid = (iso: string | null | undefined): iso is string => !!iso && !Number.isNaN(Date.parse(iso));
  if (valid(app?.created_at)) {
    out.push({ key: "applied", label: record?.fillingInForm ? "Started" : "Applied", at: app!.created_at!, kind: "applied" });
  }
  // In the order they happened: a retake finishes after the steps that follow it.
  // Every result on file, a step the job no longer lists included (an older
  // voice interview is still a moment); not the resume or the flags.
  const steps = (record?.entries ?? [])
    .filter((e) => e.kind !== "resume" && e.kind !== "integrity" && e.stepType !== "application" && e.status === "done" && valid(e.completedAt))
    .map((e): TimelineMoment => ({ key: e.key, label: e.title, at: e.completedAt!, kind: "step" }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  out.push(...steps);
  const decided = decisionWord(app?.status);
  if (decided && valid(app?.updated_at)) {
    const label = app!.status === "interview" ? "Moved to interview" : app!.status === "offered" ? "Offer made" : decided;
    out.push({ key: "decision", label, at: app!.updated_at!, kind: "decision" });
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   The profile on a desktop (docs/APPLICANT-PROFILE.md): the header band, the
   test tiles, "In their words", "At a glance". Read off the same record and
   the same stored answers as everything above; nothing here is inferred.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── The list's tab, for "Back to applicants · Needs review" ───────────── */

/** The list writes the tab it is on beside its order (the tab's key, e.g.
 *  "needs-review"); the profile says it in words next to Back. */
export const APPLICANT_TAB_KEY = "applicantList.tab.v1";

export function writeApplicantTab(tab: string, store: WriteStore | null = sessionStore()): void {
  try {
    store?.setItem(APPLICANT_TAB_KEY, tab);
  } catch {
    // Full or blocked storage: Back simply says "Back to applicants".
  }
}

export function readApplicantTab(store: ReadStore | null = sessionStore()): string | null {
  try {
    const raw = store?.getItem(APPLICANT_TAB_KEY) ?? null;
    return raw && /^[a-z-]{1,40}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

/* ── Small readers ─────────────────────────────────────────────────────── */

type Obj = Record<string, unknown>;

function asObj(value: unknown): Obj | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter((v): v is string => !!v) : [];
}

/** Quotes, spacing and case taken out, the way the server compares form
 *  answers to flag_options (formFlagsFrom in supabase/functions/_shared/autopilot.ts). */
function normalizeAnswer(value: string): string {
  return value.replace(/[‘’‛′]/g, "'").replace(/[“”‟″]/g, '"').trim().replace(/\s+/g, " ").toLowerCase();
}

/* ── Ava's reasons, as the scorecard keeps them ───────────────────────── */

/** ai_scorecard.whyUp / whyDown (2026-10-06): what pushed the score up and
 *  what pulled it down, each a short phrase from the evidence. Empty on a
 *  scorecard written before they existed. */
export function scorecardWhy(scorecard: unknown): { up: string[]; down: string[] } {
  const card = asObj(scorecard);
  const clean = (value: unknown) => [...new Set(textList(value))].slice(0, 6);
  return { up: clean(card?.whyUp), down: clean(card?.whyDown) };
}

/** "Ava suggests", in words: jade to move them on, amber to look closer,
 *  crit to decline. Null once a person has decided, while they are still on
 *  the form, and before she has a recommendation. */
export interface AvaSuggestion {
  tone: "jade" | "amber" | "crit";
  text: string;
}

export function avaSuggests(scorecard: unknown, status: string | null | undefined, advanceLabel: string | null | undefined): AvaSuggestion | null {
  if (isDecided(status) || status === "in_progress") return null;
  const card = asObj(scorecard);
  const action = text(card?.recommendedAction);
  const requirements = text(card?.hardRequirementStatus);
  if (action === "advance") {
    const target = advanceLabel ? advanceLabel.toLowerCase() : "the next stage";
    return { tone: "jade", text: `Move to ${target}.${requirements === "met" ? " Every requirement met." : ""}` };
  }
  if (action === "review") {
    const why = requirements === "mixed" ? " Some requirements are mixed." : requirements === "at_risk" ? " A requirement is at risk." : "";
    return { tone: "amber", text: `Take a closer look.${why}` };
  }
  if (action === "reject") {
    const reason = text(card?.hardRejectReason);
    return { tone: "crit", text: reason ? `Decline. ${reason.replace(/\s*$/, "")}` : "Decline." };
  }
  return null;
}

/* ── The header's live line ────────────────────────────────────────────── */

export interface HeaderLine {
  text: string;
  tone: "jade" | "amber" | "crit" | "muted";
}

/**
 * The one line beside the name, from the list's own row (listRowFor), so the
 * header and the row it was opened from say the same thing:
 * - decided: the row's "Decided Mon" (the chip already names the decision)
 * - a live attempt: the record's own summary ("Written interview: in the
 *   conversation · 4 replies · active 1 min ago"), amber once they have gone
 *   from it or are waiting on a computer
 * - finished every test: "Finished every test 40 min ago"
 * - otherwise where they are on the journey ("Typing test · step 4 of 7 · not started")
 */
export function headerLine(
  row: {
    decided: boolean;
    finished: boolean;
    liveState: LiveState | null;
    lastActiveAt: string | null;
    activeWords: string;
    lineText: string;
  },
  live: Pick<LiveStatus, "summary"> | null | undefined,
  agoWords: (ms: number | null, now: number) => string,
  now: number,
): HeaderLine | null {
  if (row.decided) return row.activeWords ? { text: row.activeWords, tone: "muted" } : null;
  if (live && row.liveState) {
    const tone: HeaderLine["tone"] =
      row.liveState === "left" || row.liveState === "away" || row.liveState === "waiting" ? "amber" : row.liveState === "failed" ? "crit" : "jade";
    return { text: live.summary, tone };
  }
  if (row.finished) {
    const at = row.lastActiveAt ? Date.parse(row.lastActiveAt) : NaN;
    return { text: `Finished every test ${agoWords(Number.isFinite(at) ? at : null, now)}`, tone: "jade" };
  }
  return row.lineText ? { text: row.lineText, tone: "muted" } : null;
}

/* ── The application's questions ───────────────────────────────────────── */

/** Pick-one and pick-several question types, as the form normalises them
 *  (normalizeQuestionType in src/pages/ApplicationFormPhase.tsx). */
const PICK_ONE = new Set(["select", "dropdown", "radio"]);
const PICK_SEVERAL = new Set(["multi_select", "multiselect", "multi-select", "multiple_select", "checkbox", "checkboxes"]);
const LONG_TEXT = new Set(["textarea", "long_text", "multi_line", "paragraph"]);
const PHONE_TYPES = new Set(["tel", "phone", "telephone", "mobile"]);
const NOT_WORDS = new Set([...PICK_ONE, ...PICK_SEVERAL, ...PHONE_TYPES, "email", "file", "file_upload", "upload", "date", "number", "url"]);

interface StoredAnswer {
  questionId: string | null;
  question: string | null;
  type: string | null;
  answer: string;
  selected: string[] | null;
}

function storedAnswers(answers: unknown): StoredAnswer[] {
  if (!Array.isArray(answers)) return [];
  const out: StoredAnswer[] = [];
  for (const raw of answers) {
    const a = asObj(raw);
    if (!a) continue;
    const selected = textList(a.selected).length > 0 ? textList(a.selected) : Array.isArray(a.answer) ? textList(a.answer) : null;
    const answer = typeof a.answer === "string" ? a.answer.trim() : selected ? selected.join("; ") : "";
    out.push({ questionId: text(a.questionId), question: text(a.question), type: text(a.type)?.toLowerCase() ?? null, answer, selected });
  }
  return out;
}

function questionList(questions: unknown): Obj[] {
  return (Array.isArray(questions) ? questions : []).map(asObj).filter((q): q is Obj => !!q);
}

/** The stored answer to one question: by its id, else (an answer stored
 *  before ids were kept) by the question's own words. */
function answerFor(question: Obj, answers: readonly StoredAnswer[]): StoredAnswer | null {
  const id = text(question.id);
  const byId = id ? answers.find((a) => a.questionId === id) : undefined;
  if (byId) return byId;
  const words = text(question.question);
  if (!words) return null;
  const key = normalizeAnswer(words);
  return answers.find((a) => !a.questionId && a.question && normalizeAnswer(a.question) === key) ?? null;
}

/** A short name for a question, for a label → value row: the question's own
 *  `label` when the job gives one, else its words up to the question mark,
 *  without a trailing note in brackets ("Phone number (WhatsApp if you have
 *  it)" → "Phone number"). Never rewritten beyond that: a label that guessed
 *  at the question's meaning could misstate it. */
export function questionLabel(question: { label?: unknown; short_label?: unknown; shortLabel?: unknown; question?: unknown }): string {
  const own = text(question.label) ?? text(question.short_label) ?? text(question.shortLabel);
  if (own) return own;
  const words = text(question.question) ?? "";
  const head = (words.split("?")[0] ?? words).replace(/\s*\([^)]*\)\s*$/, "").replace(/[\s.:;,-]+$/, "").trim();
  return head || words;
}

function pickType(question: Obj, stored: StoredAnswer | null): "one" | "several" | null {
  const type = (text(question.type) ?? stored?.type ?? "").toLowerCase();
  const options = textList(question.options);
  if (options.length === 0) return null;
  if (PICK_SEVERAL.has(type)) return "several";
  if (PICK_ONE.has(type)) return "one";
  return null;
}

/* ── "At a glance" ─────────────────────────────────────────────────────── */

export interface GlanceRow {
  id: string;
  label: string;
  /** Each pick on its own: a pick-several answer is never re-joined with
   *  commas (its options carry commas of their own). */
  values: Array<{ text: string; flagged: boolean }>;
  /** The owner's flag_label for a flagged pick, else null. */
  flag: string | null;
}

/**
 * The job's quick-pick questions (select and pick-several, with options) as
 * label → value rows, in the job's order, each answered one only. A pick the
 * question lists in `flag_options` is flagged (amber), matched the way the
 * server matches it, so the row and Ava's flag can never disagree.
 */
export function atAGlance(questions: unknown, answers: unknown): GlanceRow[] {
  const stored = storedAnswers(answers);
  const rows: GlanceRow[] = [];
  for (const question of questionList(questions)) {
    const answer = answerFor(question, stored);
    const kind = pickType(question, answer);
    if (!kind || !answer) continue;
    const picks =
      answer.selected && answer.selected.length > 0
        ? answer.selected
        : kind === "several"
          ? answer.answer.split(/;\s*/).map((s) => s.trim()).filter(Boolean)
          : answer.answer
            ? [answer.answer]
            : [];
    if (picks.length === 0) continue;
    const flagOptions = new Set(textList(question.flag_options).map(normalizeAnswer));
    const values = picks.map((pick) => ({ text: pick, flagged: flagOptions.has(normalizeAnswer(pick)) }));
    rows.push({
      id: text(question.id) ?? `q-${rows.length}`,
      label: questionLabel(question),
      values,
      flag: values.some((v) => v.flagged) ? text(question.flag_label) : null,
    });
  }
  return rows;
}

/** Their phone and email for "At a glance": the phone from the form (a phone
 *  question, or one that names a phone or WhatsApp), the email from their
 *  account, else from the form. Shown with Copy, never as a tel: link. */
export function contactFacts(answers: unknown, accountEmail: string | null | undefined): { phone: string | null; email: string | null } {
  const stored = storedAnswers(answers);
  const phone =
    stored.find((a) => a.type && PHONE_TYPES.has(a.type) && a.answer)?.answer ??
    stored.find((a) => (!a.type || a.type === "text") && a.question && /\b(phone|whats\s?app|mobile)\b/i.test(a.question) && /\d{6,}/.test(a.answer.replace(/\D/g, "")))?.answer ??
    null;
  const email = text(accountEmail) ?? stored.find((a) => a.type === "email" && /@/.test(a.answer))?.answer ?? null;
  return { phone, email };
}

/* ── "In their words" ──────────────────────────────────────────────────── */

export interface WordsPick {
  id: string;
  question: string;
  answer: string;
}

export interface InTheirWords {
  /** The two (or one) answers to quote, in the order shown. */
  picks: WordsPick[];
  /** The job is a lead's and both of its answers were found. */
  forLead: boolean;
  /** Every answer on the form, for "All N answers". */
  total: number;
}

/** A job that leads people: "Chat Support Team Leader", "Shift supervisor". */
export function isLeadJob(title: string | null | undefined): boolean {
  return !!title && /\b(team lead(er)?|lead|leader|supervisor|manager)\b/i.test(title);
}

const LED_A_TEAM = /\b(led|lead|leading|coach(ed|ing)?|train(ed|ing)?|manag(ed|ing)|supervis(ed|ing))\b/i;
const SUDDEN_CHANGE = /\b(sudden(ly)?|chang(e|ed|es|ing)|unexpected(ly)?)\b/i;

/**
 * The two written answers that matter most (docs/APPLICANT-PROFILE.md): for
 * a lead, the team they led and the sudden change; otherwise, or when the
 * form has no such question, the first long answers in the order they were
 * written. A long answer is a long-text question's (or a free-text one of
 * 160 characters and more); picks, phone, email and files never are.
 */
export function inTheirWords(questions: unknown, answers: unknown, jobTitle: string | null | undefined): InTheirWords {
  const stored = storedAnswers(answers);
  const asked = questionList(questions);
  const typeOf = (a: StoredAnswer) => {
    const q = a.questionId ? asked.find((x) => text(x.id) === a.questionId) : undefined;
    return (text(q?.type) ?? a.type ?? "").toLowerCase();
  };
  const long = stored
    .map((a, i) => ({ a, i, type: typeOf(a) }))
    .filter(({ a, type }) => !!a.answer && !NOT_WORDS.has(type) && (LONG_TEXT.has(type) || a.answer.length >= 160))
    .map(({ a, i }) => ({ id: a.questionId ?? `answer-${i}`, question: a.question ?? "Their answer", answer: a.answer }));
  const picks: WordsPick[] = [];
  let forLead = false;
  if (isLeadJob(jobTitle)) {
    const led = long.find((w) => LED_A_TEAM.test(w.question));
    const change = long.find((w) => w !== led && SUDDEN_CHANGE.test(w.question));
    if (led) picks.push(led);
    if (change) picks.push(change);
    forLead = !!led && !!change;
  }
  for (const w of long) {
    if (picks.length >= 2) break;
    if (!picks.includes(w)) picks.push(w);
  }
  return { picks, forLead, total: stored.length };
}

/* ── The test tiles ────────────────────────────────────────────────────── */

export interface TestTileRow {
  label: string;
  value: string;
  /** A pick-several answer's picks, each on its own (value is them joined). */
  values?: string[];
  tone?: "jade" | "amber" | "ink" | "muted";
}

export interface TestTile {
  key: string;
  entry: AssessmentEntry;
  /** done: the result; live: being taken, or handed back; none: not taken,
   *  not started, or gone past with no result on file. */
  state: "done" | "live" | "none";
  /** The number that matters, set as a figure with its unit beside it. */
  big: { value: string; unit: string | null } | null;
  verdict: { text: string; tone: "jade" | "amber" | "ink" | "muted" } | null;
  /** Up to two label → value rows. */
  rows: TestTileRow[];
  /** Lines that must never be cut: the connection check's flags, the chat
   *  practice's typing. */
  notes: Array<{ text: string; tone: "amber" | "muted"; kind: "flag" | "typing" }>;
  /** Integrity flags on this attempt. */
  flags: number;
}

/** The order the tiles read in (the approved mockup): the scored tests
 *  first, the measured ones next, the form last. */
const TILE_RANK: Record<string, number> = {
  quiz: 0,
  chat_simulation: 1,
  sales_simulation: 1,
  chat_interview: 2,
  voice_interview: 3,
  typing_test: 4,
  equipment_check: 5,
  video_intro: 6,
  portfolio_upload: 7,
  other: 8,
  application: 9,
  resume: 10,
};

/** "9 / 10" → 9 and "/10"; "38 WPM" → 38 and "WPM"; "↓ 28 · ↑ 9 Mbps" → "28 · 9" and "Mbps". */
export function splitHeadline(headline: string | null | undefined): { value: string; unit: string | null } | null {
  const h = text(headline);
  if (!h) return null;
  const mbps = /^↓\s*(\S+)\s*·\s*↑\s*(\S+)\s*Mbps$/.exec(h);
  if (mbps) return { value: `${mbps[1]} · ${mbps[2]}`, unit: "Mbps" };
  const ratio = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(h);
  if (ratio) return { value: ratio[1], unit: `/${ratio[2]}` };
  const pct = /^(\d+(?:\.\d+)?)%$/.exec(h);
  if (pct) return { value: pct[1], unit: "%" };
  const unit = /^(\d+(?:\.\d+)?)\s+(.+)$/.exec(h);
  if (unit) return { value: unit[1], unit: unit[2] };
  return { value: h, unit: null };
}

/** "money_rules" → "Money rules". */
function areaWords(category: string): string {
  const words = category.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The categories the server treats as must-pass when a question does not
 *  say (MUST_PASS_QUIZ_CATEGORIES in supabase/functions/_shared/autopilot.ts). */
const MUST_PASS_AREAS = new Set(["integrity", "money_rules"]);

function quizRows(entry: AssessmentEntry, quizQuestions: unknown): TestTileRow[] {
  const d = entry.detail;
  if (d?.kind !== "quiz" || d.items.length === 0) return [];
  const marked = d.items.filter((i) => i.isCorrect != null);
  if (marked.length === 0) return [];
  const areaOf = (i: (typeof marked)[number]) => (i.category ? areaWords(i.category) : `Question ${i.index + 1}`);
  // A must-pass area (the job's must_pass questions, else integrity and
  // money rules): right or missed, as the server weighs it.
  const raw = questionList(quizQuestions);
  const mustPass = (item: (typeof marked)[number]) => {
    const q = raw.find((x) => text(x.id) === item.id);
    return q?.must_pass === true || (q?.must_pass !== false && !!item.category && MUST_PASS_AREAS.has(item.category));
  };
  const area = marked.find((i) => mustPass(i) && i.category)?.category ?? null;
  const areaRight = area ? marked.filter((i) => i.category === area && mustPass(i)).every((i) => i.isCorrect === true) : true;
  // The area has its own row, so "Missed" does not say it again
  // ("Missed: Accounts, Security" and "Money rules: Missed", not both).
  const missed = [...new Set(marked.filter((i) => i.isCorrect === false).map(areaOf))].filter((w) => areaRight || !area || w !== areaWords(area));
  const rows: TestTileRow[] = [];
  if (missed.length > 0 || areaRight) rows.push({ label: "Missed", value: missed.length > 0 ? missed.join(", ") : "None", tone: missed.length > 0 ? "amber" : "jade" });
  if (area) rows.push({ label: areaWords(area), value: areaRight ? "Right" : "Missed", tone: areaRight ? "jade" : "amber" });
  return rows.slice(0, 2);
}

function equipmentComputer(entry: AssessmentEntry): TestTileRow[] {
  const d = entry.detail;
  if (d?.kind !== "equipment_check") return [];
  const rows: TestTileRow[] = [];
  const os = d.device.find((r) => r.label === "Operating system")?.value;
  const browser = d.device.find((r) => r.label === "Browser")?.value;
  const parts = [os, browser?.replace(/\s+[\d.]+$/, "")].filter((v): v is string => !!v && v !== "Not reported");
  if (parts.length > 0) rows.push({ label: d.deviceKind === "computer" || !d.deviceKind ? "Computer" : d.deviceKind === "phone" ? "Phone" : "Tablet", value: parts.join(" · ") });
  const answer =
    d.usingThisComputer === "yes"
      ? "Yes"
      : d.usingThisComputer === "no_switched"
        ? "Switched to it"
        : d.usingThisComputer === "ran_here_anyway"
          ? "No, ran here anyway"
          : d.usingThisComputer === "no"
            ? "Not yet"
            : null;
  if (answer) rows.push({ label: "Their work computer", value: answer, tone: d.usingThisComputer === "ran_here_anyway" ? "amber" : undefined });
  return rows;
}

function applicationVerdict(entry: AssessmentEntry, questions: unknown): TestTile["verdict"] {
  const d = entry.detail;
  if (d?.kind !== "application") return null;
  // "Cover letter" (the record's subline) is said beside the verdict, as the
  // phone's row says it.
  const withSubline = (words: string) => (entry.subline ? `${words} · ${entry.subline}` : words);
  const required = questionList(questions).filter((q) => q.required === true && text(q.id));
  if (required.length === 0) return entry.subline ? { text: entry.subline, tone: "muted" } : null;
  const given = d.answers.filter((a) => a.answer.trim() || a.file);
  // By the question's id; an answer saved before ids were kept (the record
  // names it answer-<n>) by the question's own words, the way At a glance
  // matches it.
  const answered = (q: Obj) => {
    const qid = text(q.id)!;
    if (given.some((a) => a.id === qid)) return true;
    const words = text(q.question);
    if (!words) return false;
    const key = normalizeAnswer(words);
    return given.some((a) => a.id.startsWith("answer-") && normalizeAnswer(a.question) === key);
  };
  const missing = required.filter((q) => !answered(q)).length;
  return missing === 0
    ? { text: withSubline("All required answered"), tone: "jade" }
    : { text: withSubline(`${missing} required ${missing === 1 ? "answer" : "answers"} missing`), tone: "amber" };
}

/** A row label longer than this is a question's own words, not a label. */
export const SHORT_LABEL_MAX = 28;

/** Two of the form's quick picks for the Application tile: a flagged one
 *  first, then single picks (short) before pick-several ones. A pick whose
 *  label is the whole question (no short `label` on the job) only when it is
 *  flagged: it does not fit a tile's row, and At a glance beside the tiles
 *  lists every pick in full. */
function applicationRows(questions: unknown, answers: unknown): TestTileRow[] {
  const rows = atAGlance(questions, answers).filter((r) => r.label.length <= SHORT_LABEL_MAX || r.values.some((v) => v.flagged));
  const rank = (r: GlanceRow) => (r.values.some((v) => v.flagged) ? 0 : r.values.length === 1 ? 1 : 2);
  return [...rows].sort((a, b) => rank(a) - rank(b)).slice(0, 2).map((r) => ({
    label: r.label,
    value: r.values.map((v) => v.text).join("; "),
    values: r.values.length > 1 ? r.values.map((v) => v.text) : undefined,
    tone: r.values.some((v) => v.flagged) ? "amber" : undefined,
  }));
}

/**
 * One tile per test on the record (not the integrity row: that is the right
 * column's), in TILE_RANK order: the figure, the verdict in its tone, up to
 * two rows, and the lines that must never be cut. A test not finished says
 * where it stands instead, in the record's own words.
 */
export function testTiles(
  entries: readonly AssessmentEntry[],
  ctx: { passing?: number | null; questions?: unknown; answers?: unknown; quizQuestions?: unknown } = {},
): TestTile[] {
  const passing = ctx.passing ?? 60;
  const tiles = entries
    .filter((e) => e.kind !== "integrity")
    .map((entry, index): TestTile & { index: number } => {
      const base = { key: entry.key, entry, flags: entry.kind === "application" ? 0 : entry.integrity.total, index };
      if (entry.status !== "done") {
        return { ...base, state: entry.status === "in_progress" ? "live" : "none", big: null, verdict: null, rows: [], notes: [] };
      }
      const d = entry.detail;
      const tone = (t: AssessmentEntry["tone"]) => t;
      let verdict: TestTile["verdict"] = entry.verdict ? { text: entry.verdict, tone: tone(entry.tone) } : null;
      let rows: TestTileRow[] = [];
      const notes: TestTile["notes"] = [];
      switch (d?.kind) {
        case "quiz":
          rows = quizRows(entry, ctx.quizQuestions);
          break;
        case "typing_test":
          if (entry.verdict === "Meets the bar" && d.requiredWpm != null) verdict = { text: `Meets the ${d.requiredWpm} WPM bar`, tone: tone(entry.tone) };
          if (d.accuracy != null) rows.push({ label: "Accuracy", value: `${Math.round(d.accuracy)}%`, tone: d.requiredAccuracy != null && d.accuracy < d.requiredAccuracy ? "amber" : undefined });
          if (d.runs != null) rows.push({ label: "Runs", value: String(d.runs) });
          else if (d.seconds != null) rows.push({ label: "Time", value: `${Math.floor(d.seconds / 60)}:${String(d.seconds % 60).padStart(2, "0")}` });
          break;
        case "equipment_check":
          if (verdict && d.measuredBy === "server") verdict = { ...verdict, text: `${verdict.text} · timed by our server` };
          rows = equipmentComputer(entry);
          for (const flag of d.flags) notes.push({ text: flag, tone: "amber", kind: "flag" });
          break;
        case "chat_simulation":
          verdict =
            d.belowPassMark === true
              ? { text: `Below the ${passing} pass mark`, tone: "amber" }
              : d.belowPassMark === false
                ? { text: `Meets the ${passing} pass mark`, tone: "jade" }
                : null;
          rows = d.scores.slice(0, 2).map((s) => ({ label: s.label, value: String(Math.round(s.value)) }));
          if (d.typing) notes.push({ text: d.typing.line, tone: chatTypingNeedsALook(d.typing) ? "amber" : "muted", kind: "typing" });
          break;
        case "chat_interview":
          if (d.credibility) rows.push({ label: "Credibility", value: d.credibility });
          // The count and the length on one row, so the two-row cap never
          // drops the length ("4 in 5:28": four questions in five minutes).
          if (d.questionCount != null && d.duration) rows.push({ label: "Questions", value: `${d.questionCount} in ${d.duration}` });
          else if (d.questionCount != null) rows.push({ label: "Questions", value: String(d.questionCount) });
          else if (d.duration) rows.push({ label: "Length", value: d.duration });
          break;
        case "voice_interview":
          if (d.minutes != null) rows.push({ label: "Length", value: `${d.minutes} min` });
          rows.push({ label: "Transcript", value: d.transcript ? "Kept" : "Not kept" });
          break;
        case "application":
          verdict = applicationVerdict(entry, ctx.questions);
          rows = applicationRows(ctx.questions, ctx.answers);
          break;
        case "generic":
          rows = d.facts.filter((f) => f.label !== "Score" && f.label !== "Recommendation").map((f) => ({ label: f.label, value: f.value }));
          break;
        default:
          break;
      }
      return { ...base, state: "done", big: splitHeadline(entry.headline), verdict, rows: rows.slice(0, 2), notes };
    });
  // What was not taken goes last: the page says it in one quiet line under
  // the tiles (notTakenGroups), not as a box in the middle of the grid.
  // Those keep the record's (the rail's) order; the tiles take TILE_RANK's.
  const quiet = (t: TestTile) => (t.state === "none" && !t.entry.openable ? 1 : 0);
  const rank = (t: TestTile) => (quiet(t) ? 0 : TILE_RANK[t.entry.kind] ?? 8);
  return tiles
    .sort((a, b) => quiet(a) - quiet(b) || rank(a) - rank(b) || a.index - b.index)
    .map(({ index, ...tile }) => tile);
}

/** The tests not taken, in the rail's own words: "Skipped" for a step they
 *  went past with no result on file, "Not taken" once the application is
 *  decided, "Not reached yet" otherwise. One line each, in the record's order. */
export function notTakenGroups(tiles: readonly TestTile[]): Array<{ words: string; titles: string[] }> {
  const groups = new Map<string, string[]>();
  for (const t of tiles) {
    if (t.state !== "none" || t.entry.openable) continue;
    const words = t.entry.statusLabel === NO_RESULT_ON_FILE ? "Skipped" : t.entry.statusLabel === "Not taken" ? "Not taken" : "Not reached yet";
    groups.set(words, [...(groups.get(words) ?? []), t.entry.title]);
  }
  return [...groups].map(([words, titles]) => ({ words, titles }));
}
