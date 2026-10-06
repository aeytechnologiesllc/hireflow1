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
