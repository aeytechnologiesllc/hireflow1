/**
 * passByScore.ts: passing on everyone under a score, in one go, from the
 * applicants list (docs/APPLICANTS-LIST.md, "Pass by score").
 *
 * The owner, 2026-10-09, with about seventy finished applicants waiting on a
 * decision: "there should be a way for us to pretty much reject applicants in
 * bulk. You could maybe select a score ... it'll show like a clear
 * transparency how many people will be and ask me to confirm and then that's
 * it ... and then they would be notified. Otherwise ... they'd be waiting ...
 * it's not good."
 *
 * A bulk Pass already exists (lib/bulkPass.ts), but it works on rows picked
 * by hand, a page at a time. This is the same Pass (declined in his name, the
 * same polite note to each, one at a time) reached from a score instead:
 * pick the line, see exactly who is under it and who is left alone, confirm.
 *
 * Who it reaches, and who it never does:
 *  - only people who FINISHED every step and have a FINAL score. Someone
 *    still testing, or whose score is only "so far", has no score to judge
 *    by and is not waiting on him: they are counted and left alone;
 *  - only people still waiting on a decision. Someone invited to interview,
 *    holding an offer, hired, already declined or blocked is never touched;
 *  - never someone on the shortlist: he put them there himself. They are
 *    counted, so he can see it.
 *
 * Pure: who it reaches, the picture of the scores, and the words. The
 * sending is hooks/useBulkPass.ts, unchanged.
 */
// "@/": this file is also loaded as it is by scripts/pass_by_score.test.mjs.
import { bulkPassPlan, type BulkPassPlan, type PassableRow } from "@/cockpit/lib/bulkPass";

/** What the list knows about a row that this needs. */
export interface ScoreRow extends PassableRow {
  /** The final score out of 100, or null. */
  score: number | null;
  /** "final", "so_far" or "none". */
  scoreKind: string;
  shortlisted?: boolean;
  blocked?: boolean;
}

/** Where the line starts. */
export const PASS_BY_SCORE_DEFAULT = 50;
export const PASS_BY_SCORE_MIN = 1;
export const PASS_BY_SCORE_MAX = 100;

/** The statuses that mean "finished and waiting on a decision". */
const WAITING = ["pending", "reviewing"];

export function clampScoreLine(value: number): number {
  if (!Number.isFinite(value)) return PASS_BY_SCORE_DEFAULT;
  return Math.min(PASS_BY_SCORE_MAX, Math.max(PASS_BY_SCORE_MIN, Math.round(value)));
}

export interface PassByScorePlan {
  /** The line: everyone who scored UNDER this. */
  under: number;
  /** The Pass it would run (lib/bulkPass.ts): the people, and the job the note names. */
  pass: BulkPassPlan;
  /** The same people with their scores, lowest first. */
  reached: Array<{ id: string; name: string; score: number }>;
  /** Under the line, and left as they are. */
  kept: { shortlisted: number; interview: number };
  /** Finished, waiting, with a final score at or above the line: they stay. */
  staying: number;
  /** Still being decided on, with no final score (still testing, or scored only "so far"). */
  noFinalScore: number;
  /** Every finished, waiting applicant's final score (shortlisted included), for the picture. */
  scores: number[];
}

/** Who a Pass under this score would reach, out of everyone on the list. */
export function passByScorePlan(rows: readonly ScoreRow[], line: number): PassByScorePlan {
  const under = clampScoreLine(line);
  const seen = new Set<string>();
  const targets: ScoreRow[] = [];
  const kept = { shortlisted: 0, interview: 0 };
  let staying = 0;
  let noFinalScore = 0;
  const scores: number[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (row.blocked || row.tab === "blocked") continue;
    const scored = row.finished && row.scoreKind === "final" && typeof row.score === "number";
    if (row.status === "interview") {
      if (scored && (row.score as number) < under) kept.interview += 1;
      continue;
    }
    if (row.status === "in_progress" || (WAITING.includes(row.status) && !scored)) {
      noFinalScore += 1;
      continue;
    }
    if (!WAITING.includes(row.status)) continue; // offered, hired, declined: not his to decide here
    const score = row.score as number;
    scores.push(score);
    if (score >= under) {
      staying += 1;
    } else if (row.shortlisted) {
      kept.shortlisted += 1;
    } else {
      targets.push(row);
    }
  }
  targets.sort((a, b) => (a.score as number) - (b.score as number) || a.name.localeCompare(b.name));
  return {
    under,
    pass: bulkPassPlan(targets),
    reached: targets.map((t) => ({ id: t.id, name: t.name, score: t.score as number })),
    kept,
    staying,
    noFinalScore,
    scores,
  };
}

/** Ten bars, 0-9 up to 90-100: how many scores fall in each. */
export function scoreBars(scores: readonly number[]): number[] {
  const bars = Array.from({ length: 10 }, () => 0);
  for (const score of scores) {
    if (!Number.isFinite(score)) continue;
    bars[Math.min(9, Math.max(0, Math.floor(score / 10)))] += 1;
  }
  return bars;
}

const people = (n: number) => `${n} applicant${n === 1 ? "" : "s"}`;

/** The dialog's words for a plan. Nothing here is a guess: every number is a count of rows. */
export function passByScoreWords(plan: PassByScorePlan): { headline: string; effect: string; left: string[]; arm: string; confirm: string; warning: string } {
  const n = plan.pass.targets.length;
  const left: string[] = [];
  if (plan.kept.shortlisted > 0) {
    const k = plan.kept.shortlisted;
    left.push(`${k} under ${plan.under} ${k === 1 ? "is" : "are"} on your shortlist: left as ${k === 1 ? "it is" : "they are"}.`);
  }
  if (plan.kept.interview > 0) {
    const k = plan.kept.interview;
    left.push(`${k} under ${plan.under} ${k === 1 ? "is" : "are"} already invited to interview: left as ${k === 1 ? "it is" : "they are"}.`);
  }
  if (plan.staying > 0) left.push(`${plan.staying} scored ${plan.under} or more and stay${plan.staying === 1 ? "s" : ""} on your list.`);
  if (plan.noFinalScore > 0) {
    const m = plan.noFinalScore;
    left.push(`${m} ${m === 1 ? "has" : "have"} not finished the tests, so there is no final score yet: not included.`);
  }
  return {
    headline: n === 0 ? `Nobody who has finished scored under ${plan.under}.` : `${people(n)} scored under ${plan.under}.`,
    effect: n === 0 ? "Move the line to see who it would reach." : `${n === 1 ? "They are" : "Each is"} declined in your name, comes off your list, and gets this note by email:`,
    left,
    arm: `Pass on ${n}`,
    confirm: `Yes, pass on ${n} and email ${n === 1 ? "them" : "each one"}`,
    warning: `This emails ${people(n)} and cannot be undone.`,
  };
}
