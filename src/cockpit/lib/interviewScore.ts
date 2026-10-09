/**
 * interviewScore.ts: the owner's interview rating of an applicant, as one
 * number that can be shown outside the interview guide
 * (docs/INTERVIEWS.md, "The rating, outside the guide").
 *
 * The owner rates each answer from 1 to 10 in the guide and writes notes
 * (hooks/useInterviewRatings.ts). Until 2026-10-09 that stayed inside the
 * guide: to compare two people he had interviewed he had to open each guide
 * in turn. This is the number for the profile, the applicants list and the
 * Interviews page.
 *
 * One rule, used everywhere including the guide's own "Your average": the
 * average of every answer he scored for that person. The marks that are not
 * answers ("How they speak") are left out, as the guide leaves them out. An
 * answer rated under a question he later replaced still counts: it is still
 * his rating of that person.
 *
 * Pure: no React, no Supabase.
 */
// "@/": this file is also loaded as it is by scripts/interview_score.test.mjs.
import { readGuideRatings, type GuideRatings } from "@/lib/interviewGuide";

export interface InterviewScore {
  /** To one decimal, or null when nothing has a score. */
  average: number | null;
  /** How many answers have a score. */
  rated: number;
  /** True when a note was written (on an answer, or the overall note). */
  hasNotes: boolean;
}

const MARK_PREFIX = "mark:";

/** Every score given to an answer (not to a mark). */
function answerScores(ratings: GuideRatings): number[] {
  return Object.entries(ratings.answers)
    .filter(([key, rating]) => !key.startsWith(MARK_PREFIX) && typeof rating.score === "number")
    .map(([, rating]) => rating.score as number);
}

const mean = (scores: number[]) => (scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null);

/** One person's rating, from one set of ratings. */
export function interviewScore(ratings: GuideRatings): InterviewScore {
  const scores = answerScores(ratings);
  const hasNotes = ratings.overallNote.trim().length > 0 || Object.values(ratings.answers).some((r) => r.note.trim().length > 0);
  return { average: mean(scores), rated: scores.length, hasNotes };
}

export interface StoredRatingRow {
  application_id: string;
  answers: unknown;
  overall_note?: unknown;
}

/**
 * Every applicant's rating, from the stored rows. Two people on the hiring
 * team can each rate the same applicant: their scores are pooled, so the
 * number is the average of every answer anyone scored.
 */
export function interviewScores(rows: readonly StoredRatingRow[]): Map<string, InterviewScore> {
  const pooled = new Map<string, { scores: number[]; hasNotes: boolean }>();
  for (const row of rows) {
    if (!row || typeof row.application_id !== "string" || !row.application_id) continue;
    const ratings = readGuideRatings(row.answers, row.overall_note);
    const one = interviewScore(ratings);
    const entry = pooled.get(row.application_id) ?? { scores: [], hasNotes: false };
    entry.scores.push(...answerScores(ratings));
    entry.hasNotes = entry.hasNotes || one.hasNotes;
    pooled.set(row.application_id, entry);
  }
  const out = new Map<string, InterviewScore>();
  for (const [id, entry] of pooled) {
    // Opening the guide and writing nothing saves nothing; a row with neither a score nor a note is not a rating.
    if (entry.scores.length === 0 && !entry.hasNotes) continue;
    out.set(id, { average: mean(entry.scores), rated: entry.scores.length, hasNotes: entry.hasNotes });
  }
  return out;
}

/** "7.8", always with its decimal, so 8 and 8.4 line up in a column. */
export function scoreFigure(score: InterviewScore): string {
  return score.average === null ? "" : score.average.toFixed(1);
}

/** The words for a rating, wherever it is shown. Null when there is nothing to say. */
export function interviewScoreWords(score: InterviewScore | null | undefined): { chip: string; title: string; detail: string } | null {
  if (!score) return null;
  if (score.average === null) {
    return score.hasNotes ? { chip: "Interview notes", title: "You wrote interview notes", detail: "No answers are scored yet. Your notes are in the interview guide." } : null;
  }
  const answers = `${score.rated} answer${score.rated === 1 ? "" : "s"}`;
  return {
    chip: `Interview ${scoreFigure(score)}`,
    title: `You rated the interview ${scoreFigure(score)} out of 10`,
    detail: `The average of the ${answers} you scored.${score.hasNotes ? " Your notes are in the interview guide." : ""}`,
  };
}
