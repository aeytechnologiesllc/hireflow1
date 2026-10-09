/**
 * analyticsView.ts: every number on the Analytics page, worked out from the
 * same rows the Applicants list shows (docs/ANALYTICS.md).
 *
 * The owner, 2026-10-08, looking at the old page: "this is the worst
 * analytics and the ugliest analytics I've ever seen. I want to see some
 * premiumness, nice animation, number rolling ... I need to see your best
 * work." He approved a mock-up built from his own totals; this file is where
 * those totals come from in the app.
 *
 * Rules it keeps:
 *  - It counts what the Applicants list counts. A step is "done" when the
 *    list's own dot says so; "waiting for you" is the list's Needs review
 *    tab; "finished" is the list's `finished`. The two pages cannot disagree.
 *  - Nothing is estimated. A section with nothing to count comes back empty
 *    and the page leaves it out.
 *  - Totals only: no name, email or answer leaves this file.
 *
 * Pure: no React, no Supabase. The clock and both time zones are passed in.
 */
// "@/": this file is also loaded as it is by scripts/analytics_view.test.mjs.
import { parseApplicationNotes } from "@/utils/applicationNotes";
import { chatTypingOf } from "@/cockpit/lib/assessmentRecord";

/* ── What it is given ──────────────────────────────────────────────────── */

export interface AnalyticsDot {
  stepId: string;
  stepType: string;
  title: string;
  state: "done" | "below" | "now" | "skipped" | "todo";
}

/** The part of an Applicants-list row this page reads. */
export interface AnalyticsRow {
  id: string;
  jobId: string | null;
  status: string;
  tab: string;
  dots: readonly AnalyticsDot[];
  finished: boolean;
  score: number | null;
  scoreKind: string;
  recommendedAction: string | null;
  appliedAt: string | null;
}

/** The raw application, for what the list row does not carry. */
export interface AnalyticsApp {
  id: string;
  notes?: unknown;
  ai_score?: number | string | null;
  ai_scorecard?: unknown;
}

export interface AnalyticsSession {
  application_id?: string | null;
  step_type: string;
  status: string;
  started_at?: string | null;
  ended_at?: string | null;
}

export interface AnalyticsTrafficDay {
  day: string; // yyyy-mm-dd
  careers_views: number;
  job_views: number;
  apply_views: number;
}

export interface AnalyticsInput {
  rows: readonly AnalyticsRow[];
  apps: readonly AnalyticsApp[];
  sessions: readonly AnalyticsSession[];
  /** The job's own pass mark (jobs.passing_score); 60 when it has none. */
  passingScore?: number | null;
  now: number;
  /** The reader's clock (IANA). */
  viewerZone: string;
  /** The applicants' clock when the job says where it is posted for; null when it does not. */
  applicantZone?: string | null;
  traffic?: readonly AnalyticsTrafficDay[] | null;
}

/* ── What it gives back ────────────────────────────────────────────────── */

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  /** Of everyone who started, 0 to 100, rounded. */
  pct: number;
  /** How many of the stage before have not got this far (0 for the first). */
  lost: number;
}

export interface TestMeter {
  key: "skills" | "typing" | "interview" | "chat" | "reply";
  label: string;
  value: number;
  unit: string;
  /** How full the bar is, 0 to 100. */
  fill: number;
  /** Where the job's own bar sits on it, 0 to 100; null when the job sets none. */
  barAt: number | null;
  /** "The job asks for 40." */
  barWords: string | null;
  note: string | null;
  /** Worse than the job asks (drawn in the warning colour). */
  warn: boolean;
}

export interface AnalyticsView {
  started: number;
  /** When the first of them applied (ms), or null. */
  firstAt: number | null;
  /** Applications per day on the reader's clock, oldest first; empty under two days. */
  days: { key: string; label: string; count: number }[];
  finished: number;
  finishedPct: number;
  waiting: number;
  /** Minutes Ava spent in chat practice and interviews that ended. */
  avaMinutes: number;
  funnel: FunnelStage[];
  /** Index into `funnel` of the stage that lost the most, or null. */
  biggestDrop: number | null;
  after: { waiting: number; declined: number; forward: number };
  scores: {
    /** Finished applicants with a final score. */
    of: number;
    /** Ten buckets: 0-9, 10-19 ... 90-100. */
    buckets: number[];
    median: number | null;
    average: number | null;
    top: number | null;
    bar: number;
    atBar: number;
  };
  advice: { look: number; decline: number } | null;
  tests: TestMeter[];
  reasons: { label: string; count: number }[];
  /** How many finished: the people the marks are counted over (the "of 62"). */
  reasonsOf: number;
  hours: {
    /** By hour of the day, 0 to 23, on `zone`. */
    counts: number[];
    peakHour: number | null;
    peakCount: number;
    /** Whose clock the hours are on. */
    zone: string;
    theirs: boolean;
    /** Hours to add to an hour on `zone` to get the reader's hour (signed: -12 is the same hour the evening before, half a day back); null when they are the same clock. */
    readerShift: number | null;
    /** How many applied in the busiest two hours in a row, and when that starts. */
    rush: { from: number; count: number } | null;
  };
  ava: { scored: number; skills: number; chats: number; interviews: number; replies: number };
  visits: { careers: number; job: number; apply: number; days: { key: string; label: string; count: number }[] } | null;
  speed: { of: number; medianMinutes: number | null; withinDay: number; withinTwoHours: number };
}

/* ── Small readers ─────────────────────────────────────────────────────── */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}
const ms = (v: unknown): number | null => {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Year, month, day, weekday and hour of a moment on one clock. */
function clockParts(at: number, zone: string): { key: string; weekday: string; hour: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const hour = Number(get("hour"));
    if (!Number.isFinite(hour)) return null;
    return { key: `${get("year")}-${get("month")}-${get("day")}`, weekday: get("weekday"), hour: hour % 24 };
  } catch {
    return null;
  }
}

/** The day after a yyyy-mm-dd key. */
function nextDay(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekdayOf = (key: string) => WEEKDAYS[new Date(`${key}T12:00:00Z`).getUTCDay()];

/* ── The steps ─────────────────────────────────────────────────────────── */

const isDecision = (dot: AnalyticsDot) => dot.stepType === "decision" || dot.stepId === "decision";
const passed = (dot: AnalyticsDot | undefined) => !!dot && (dot.state === "done" || dot.state === "below");

/** Got through step `i`: its own dot says so, or a later step's does (a step with no result on file that they went past). */
function wentPast(tests: readonly AnalyticsDot[], i: number): boolean {
  if (passed(tests[i])) return true;
  if (tests[i]?.state !== "skipped") return false;
  for (let k = i + 1; k < tests.length; k += 1) if (passed(tests[k]) || tests[k].state === "now") return true;
  return false;
}

function stageLabel(dot: AnalyticsDot): string {
  return dot.stepType === "application" ? "Sent the form" : dot.title;
}

/* ── What holds them back ──────────────────────────────────────────────── */

/**
 * One of Ava's "why down" lines, as a kind of mark: the numbers that make
 * each applicant's line their own are taken out, so the same mark on fifty
 * people counts as one line with fifty beside it.
 */
export function reasonLabel(line: string): string | null {
  let text = line.replace(/\s+/g, " ").trim();
  if (!text) return null;
  // "Interview: little evidence of ..." is the same mark, seen in the interview.
  text = text.replace(/^interview:\s*/i, "");
  // A requirement quoted from the job post: every job words its own.
  if (/^the job (asks for|requires)\b/i.test(text)) return "A requirement in the job post not met";
  // The measured ones, whatever the figures: each is one mark.
  if (/^slow repl/i.test(text)) return "Slow replies in the chat";
  if (/^typ(ed|ing)\b.*\bwpm\b/i.test(text)) return "Typing below the job's bar";
  // "(1/5)", "(latency)": the score or the detail in brackets.
  text = text.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  // "Escalated chat practice 40/100": a test and its score.
  const scored = /^(.+?)\s+\d+\s*\/\s*\d+$/.exec(text);
  if (scored) text = `Low score: ${scored[1].charAt(0).toLowerCase()}${scored[1].slice(1)}`;
  // "Slow replies: median 164 s; the job asks for 90 s": what, before the figures.
  else if (/\d/.test(text)) {
    const before = text.split(/\d/)[0].replace(/[\s:;,.(–—-]+$/, "").replace(/\s+(median|of|at|to|in|is|was)$/i, "").replace(/[\s:;,]+$/, "");
    text = before.length >= 8 ? before : text.replace(/\d+([.,]\d+)?/g, "").replace(/\s+/g, " ").trim();
  }
  text = text.replace(/[\s:;,.]+$/, "");
  if (!text) return null;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* ── The view ──────────────────────────────────────────────────────────── */

const SESSION_CAP_MIN = 180;
const AVA_STEPS = new Set(["chat_simulation", "chat_interview", "voice_interview", "sales_simulation"]);

export function buildAnalyticsView(input: AnalyticsInput): AnalyticsView {
  const { rows, now, viewerZone } = input;
  const appsById = new Map(input.apps.map((a) => [a.id, a] as const));
  const ids = new Set(rows.map((r) => r.id));
  const sessions = input.sessions.filter((s) => !!s.application_id && ids.has(s.application_id));
  const bar = typeof input.passingScore === "number" && input.passingScore > 0 ? Math.round(input.passingScore) : 60;

  const started = rows.length;
  const finishedRows = rows.filter((r) => r.finished);
  const finished = finishedRows.length;

  /* When they applied: by day on the reader's clock, by hour on theirs. */
  const appliedMs = rows.map((r) => ms(r.appliedAt)).filter((t): t is number => t != null);
  const firstAt = appliedMs.length ? Math.min(...appliedMs) : null;
  const byDay = new Map<string, number>();
  const hourZone = input.applicantZone || viewerZone;
  const counts = Array.from({ length: 24 }, () => 0);
  for (const at of appliedMs) {
    const mine = clockParts(at, viewerZone);
    if (mine) byDay.set(mine.key, (byDay.get(mine.key) ?? 0) + 1);
    const theirs = clockParts(at, hourZone);
    if (theirs) counts[theirs.hour] += 1;
  }
  let days: AnalyticsView["days"] = [];
  const todayKey = clockParts(now, viewerZone)?.key ?? null;
  if (byDay.size > 0 && todayKey) {
    const keys = [...byDay.keys()].sort();
    // Up to today while the last applicant is recent; otherwise up to their day.
    let end = keys[keys.length - 1];
    let reach = end;
    for (let i = 0; i < 6 && reach < todayKey; i += 1) reach = nextDay(reach);
    if (reach >= todayKey) end = todayKey;
    const out: AnalyticsView["days"] = [];
    for (let key = keys[0]; key <= end && out.length < 400; key = nextDay(key)) out.push({ key, label: weekdayOf(key), count: byDay.get(key) ?? 0 });
    // A long-open role shows its last fourteen days. A trailing empty today is dropped: the day has only begun.
    days = out.slice(-14);
    if (days.length > 2 && days[days.length - 1].count === 0 && days[days.length - 1].key === todayKey) days = days.slice(0, -1);
    if (days.length < 2) days = [];
  }
  const peakCount = Math.max(...counts, 0);
  const peakHour = peakCount > 0 ? counts.indexOf(peakCount) : null;
  let rush: AnalyticsView["hours"]["rush"] = null;
  if (peakCount > 0) {
    let best = -1;
    let from = 0;
    for (let h = 0; h < 24; h += 1) {
      const two = counts[h] + counts[(h + 1) % 24];
      if (two > best) { best = two; from = h; }
    }
    rush = { from, count: best };
  }
  let readerShift: number | null = null;
  if (input.applicantZone && input.applicantZone !== viewerZone) {
    const mine = clockParts(now, viewerZone);
    const theirs = clockParts(now, input.applicantZone);
    if (mine && theirs) {
      // Signed: New York is 12 hours behind Manila, so the reader's hour is their hour minus 12.
      const dayGap = mine.key === theirs.key ? 0 : mine.key < theirs.key ? -24 : 24;
      const shift = mine.hour - theirs.hour + dayGap;
      readerShift = shift === 0 ? null : shift;
    }
  }

  /* How far they got. */
  const funnel: FunnelStage[] = [{ key: "started", label: "Started", count: started, pct: started ? 100 : 0, lost: 0 }];
  const template = rows.reduce<readonly AnalyticsDot[]>((best, r) => (r.dots.length > best.length ? r.dots : best), []).filter((d) => !isDecision(d));
  template.forEach((dot, i) => {
    const count = rows.filter((r) => {
      const tests = r.dots.filter((d) => !isDecision(d));
      const at = tests.findIndex((d) => d.stepId === dot.stepId);
      return at >= 0 && wentPast(tests, at);
    }).length;
    const before = funnel[funnel.length - 1].count;
    // A funnel only narrows: a step added to the job later cannot show more people than the one before it.
    const kept = Math.min(count, before);
    funnel.push({ key: dot.stepId || `step-${i}`, label: stageLabel(dot), count: kept, pct: pct(kept, started), lost: before - kept });
  });
  let biggestDrop: number | null = null;
  funnel.forEach((stage, i) => {
    if (stage.lost > 0 && (biggestDrop == null || stage.lost > funnel[biggestDrop].lost)) biggestDrop = i;
  });

  const after = {
    waiting: finishedRows.filter((r) => r.tab === "needs-review").length,
    declined: finishedRows.filter((r) => r.status === "rejected").length,
    forward: finishedRows.filter((r) => r.status === "interview" || r.status === "offered" || r.status === "hired").length,
  };
  const waiting = rows.filter((r) => r.tab === "needs-review").length;

  /* How good they are: the final score of the ones who finished. */
  const finals = finishedRows.filter((r) => r.score != null && r.scoreKind === "final").map((r) => r.score as number);
  const buckets = Array.from({ length: 10 }, () => 0);
  for (const s of finals) buckets[clamp(Math.floor(s / 10), 0, 9)] += 1;
  const mid = median(finals);
  const scores: AnalyticsView["scores"] = {
    of: finals.length,
    buckets,
    median: mid == null ? null : Math.round(mid),
    average: finals.length ? Math.round(finals.reduce((a, b) => a + b, 0) / finals.length) : null,
    top: finals.length ? Math.max(...finals) : null,
    bar,
    atBar: finals.filter((s) => s >= bar).length,
  };
  const advised = finishedRows.filter((r) => r.recommendedAction === "advance" || r.recommendedAction === "review" || r.recommendedAction === "reject");
  const advice = advised.length ? { look: advised.filter((r) => r.recommendedAction !== "reject").length, decline: advised.filter((r) => r.recommendedAction === "reject").length } : null;

  /* Test by test, and Ava's marks, from each application's own results. */
  const quiz: number[] = [];
  const chat: number[] = [];
  const interview: number[] = [];
  const wpm: number[] = [];
  const reply: number[] = [];
  let wpmBar: number | null = null;
  let replyBar: number | null = null;
  let scored = 0;
  let skills = 0;
  const marks = new Map<string, number>();
  let marked = 0;
  for (const row of rows) {
    const app = appsById.get(row.id);
    if (!app) continue;
    if (num(app.ai_score) != null) scored += 1;
    const notes = parseApplicationNotes(app.notes) as Obj;
    const quizScore = num(obj(notes.quizResult)?.score);
    if (quizScore != null) { quiz.push(clamp(quizScore, 0, 100)); skills += 1; }
    const sim = obj(notes.chatSimulationResult);
    const simScore = num(sim?.score);
    if (simScore != null) chat.push(clamp(simScore, 0, 100));
    const typing = sim ? chatTypingOf(sim.typing) : null;
    if (typing) {
      if (typing.wpm != null) { wpm.push(typing.wpm); wpmBar = typing.minWpm; }
      if (typing.medianReplySeconds != null) { reply.push(typing.medianReplySeconds); replyBar = typing.maxMedianReplySeconds; }
    }
    const ivScore = num(obj(obj(notes.chatInterviewResult)?.evaluation)?.score);
    if (ivScore != null) interview.push(clamp(ivScore, 0, 100));

    if (!row.finished) continue;
    const lines = obj(app.ai_scorecard)?.whyDown;
    if (!Array.isArray(lines)) continue;
    const own = new Set<string>();
    for (const line of lines) {
      const label = typeof line === "string" ? reasonLabel(line) : null;
      if (label) own.add(label);
    }
    if (own.size) marked += 1;
    for (const label of own) marks.set(label, (marks.get(label) ?? 0) + 1);
  }
  const avg = (list: readonly number[]) => Math.round(list.reduce((a, b) => a + b, 0) / list.length);
  // Each test under the name this job gives it.
  const named = (types: readonly string[], fallback: string) => template.find((d) => types.includes(d.stepType))?.title || fallback;
  const tests: TestMeter[] = [];
  if (quiz.length) tests.push({ key: "skills", label: named(["quiz"], "Skills check"), value: avg(quiz), unit: "% average", fill: avg(quiz), barAt: null, barWords: null, note: null, warn: false });
  if (wpm.length) {
    const value = Math.round(median(wpm) as number);
    const top = Math.max(80, (wpmBar ?? 0) * 2);
    const made = wpmBar != null ? wpm.filter((w) => w >= (wpmBar as number)).length : null;
    tests.push({
      key: "typing", label: "Typing in the chat", value, unit: "words a minute", fill: clamp((value / top) * 100, 0, 100),
      barAt: wpmBar != null ? clamp((wpmBar / top) * 100, 0, 100) : null,
      barWords: wpmBar != null ? `The job asks for ${wpmBar}.` : null,
      note: made != null ? `${made} of ${wpm.length} reached it.` : null,
      warn: wpmBar != null && value < wpmBar,
    });
  }
  if (interview.length) tests.push({ key: "interview", label: named(["chat_interview"], "Written interview"), value: avg(interview), unit: "of 100 average", fill: avg(interview), barAt: null, barWords: null, note: `${interview.filter((s) => s >= bar).length} of ${interview.length} scored ${bar} or more.`, warn: false });
  if (chat.length) tests.push({ key: "chat", label: named(["chat_simulation"], "Chat practice"), value: avg(chat), unit: "of 100 average", fill: avg(chat), barAt: null, barWords: null, note: `${chat.filter((s) => s >= bar).length} of ${chat.length} scored ${bar} or more.`, warn: false });
  if (reply.length) {
    const value = Math.round(median(reply) as number);
    const top = Math.max(240, (replyBar ?? 0) * 2.5);
    const made = replyBar != null ? reply.filter((s) => s <= (replyBar as number)).length : null;
    tests.push({
      key: "reply", label: "Time to reply in the chat", value, unit: "seconds, middle", fill: clamp((value / top) * 100, 0, 100),
      barAt: replyBar != null ? clamp((replyBar / top) * 100, 0, 100) : null,
      barWords: replyBar != null ? `The job asks for ${replyBar} seconds.` : null,
      note: made != null ? `${made === 0 ? "None" : made < reply.length / 2 ? `Only ${made}` : made} of ${reply.length} made it.` : null,
      warn: replyBar != null && value > replyBar,
    });
  }
  const reasons = [...marks.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 7);

  /* Ava's work, and how fast it moves, from the attempts on file. */
  let avaMinutes = 0;
  let chats = 0;
  let interviews = 0;
  const lastEnd = new Map<string, number>();
  for (const s of sessions) {
    const startedAt = ms(s.started_at);
    const endedAt = ms(s.ended_at);
    if (s.status !== "completed" || startedAt == null || endedAt == null || endedAt < startedAt) continue;
    const id = s.application_id as string;
    lastEnd.set(id, Math.max(lastEnd.get(id) ?? 0, endedAt));
    if (!AVA_STEPS.has(s.step_type)) continue;
    avaMinutes += Math.min((endedAt - startedAt) / 60_000, SESSION_CAP_MIN);
    if (s.step_type === "chat_simulation" || s.step_type === "sales_simulation") chats += 1;
    else interviews += 1;
  }
  const spans: number[] = [];
  for (const row of finishedRows) {
    const from = ms(row.appliedAt);
    const to = lastEnd.get(row.id);
    if (from != null && to != null && to >= from) spans.push((to - from) / 60_000);
  }
  const middle = median(spans);

  /* People looking at the role. */
  let visits: AnalyticsView["visits"] = null;
  const traffic = (input.traffic ?? []).filter((d) => d && typeof d.day === "string");
  const seen = traffic.reduce((sum, d) => sum + d.careers_views + d.job_views + d.apply_views, 0);
  if (seen > 0) {
    const sorted = [...traffic].sort((a, b) => a.day.localeCompare(b.day));
    const firstBusy = sorted.findIndex((d) => d.careers_views + d.job_views + d.apply_views > 0);
    const shown = sorted.slice(Math.max(firstBusy, sorted.length - 7));
    visits = {
      careers: traffic.reduce((s, d) => s + d.careers_views, 0),
      job: traffic.reduce((s, d) => s + d.job_views, 0),
      apply: traffic.reduce((s, d) => s + d.apply_views, 0),
      days: shown.map((d) => ({ key: d.day, label: weekdayOf(d.day), count: d.careers_views + d.job_views + d.apply_views })),
    };
  }

  return {
    started,
    firstAt,
    days,
    finished,
    finishedPct: pct(finished, started),
    waiting,
    avaMinutes: Math.round(avaMinutes),
    funnel,
    biggestDrop,
    after,
    scores,
    advice,
    tests,
    // No marks on anyone: nothing to rank.
    reasons: marked > 0 ? reasons : [],
    reasonsOf: finished,
    hours: { counts, peakHour, peakCount, zone: hourZone, theirs: !!input.applicantZone && input.applicantZone !== viewerZone, readerShift, rush },
    ava: { scored, skills, chats, interviews, replies: rows.filter((r) => r.status === "rejected").length },
    visits,
    speed: {
      of: spans.length,
      medianMinutes: middle == null ? null : Math.round(middle),
      withinDay: spans.filter((m) => m <= 24 * 60).length,
      withinTwoHours: spans.filter((m) => m <= 120).length,
    },
  };
}

/* ── Words ─────────────────────────────────────────────────────────────── */

/** 8 → "8:00 AM", 20 → "8:00 PM". */
export function hourWords(hour: number): string {
  const h = ((Math.round(hour) % 24) + 24) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;
}

/** 102 → { hours: 1, minutes: 42 }; under an hour → { hours: 0, minutes }. */
export function spanParts(minutes: number): { days: number; hours: number; minutes: number } {
  const total = Math.max(0, Math.round(minutes));
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 };
}

/** The hero's one sentence. Only the parts there is something to say about. */
export function heroStory(view: AnalyticsView): { finished: number; atBar: number | null; bar: number; waiting: number } {
  return { finished: view.finished, atBar: view.scores.of > 0 ? view.scores.atBar : null, bar: view.scores.bar, waiting: view.waiting };
}

/** Ava's line under the marks: the most common one, said plainly. */
export function reasonsLine(view: AnalyticsView): { label: string; count: number; of: number } | null {
  const top = view.reasons[0];
  if (!top || view.reasonsOf < 3) return null;
  return { label: top.label.charAt(0).toLowerCase() + top.label.slice(1), count: top.count, of: view.reasonsOf };
}
