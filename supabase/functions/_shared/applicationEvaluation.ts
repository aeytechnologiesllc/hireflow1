/**
 * The hiring team's evaluation of an application, kept out of the
 * applicant's own row (2026-10-25,
 * supabase/migrations/20261025235000_application_evaluations.sql;
 * docs/BACKEND-SCHEMA.md).
 *
 * ai_score, ai_analysis, ai_scorecard, phase_ai_analysis and employer_notes
 * live in public.application_evaluations, one row per application. Functions
 * keep WRITING them through applications exactly as before (a trigger moves
 * each value and leaves applications NULL), but must READ them from here:
 * applications always answers NULL for them now.
 *
 *   .from("applications").select("id, status, application_evaluations(ai_score, ai_scorecard)")
 *   const application = withEvaluation(row);   // row.ai_score etc. again
 *
 * (the embed written out in the select's own string: an interpolated one
 * defeats supabase-js's typing of the result), or, with a client that may
 * read the row (the service key) and an id in hand,
 * `readEvaluation(admin, applicationId)`.
 *
 * scripts/guards/staff-evaluation-columns.mjs fails the build if a select on
 * applications names one of the five again. Mirrored for the browser in
 * src/lib/applicationEvaluation.ts (the guard checks the two lists match).
 */

/** The five, in the order the migration lists them. */
export const EVALUATION_FIELDS = ["ai_score", "ai_analysis", "ai_scorecard", "phase_ai_analysis", "employer_notes"] as const;
export type EvaluationField = (typeof EVALUATION_FIELDS)[number];

/** For a select on application_evaluations itself. */
export const EVALUATION_COLUMNS = EVALUATION_FIELDS.join(", ");

export interface ApplicationEvaluation {
  ai_score: number | null;
  ai_analysis: string | null;
  ai_scorecard: unknown;
  phase_ai_analysis: string | null;
  employer_notes: string | null;
}

/**
 * The embedded (or directly read) evaluation in whichever shape it arrives:
 * an object (the one-to-one embed), a one-element array (a client that does
 * not know the relationship is one-to-one), or null (none yet, or the caller
 * may not read it): all five NULL.
 */
export function evaluationOf(embedded: unknown): ApplicationEvaluation {
  const one = Array.isArray(embedded) ? embedded[0] : embedded;
  if (!one || typeof one !== "object") {
    return { ai_score: null, ai_analysis: null, ai_scorecard: null, phase_ai_analysis: null, employer_notes: null };
  }
  const row = one as Record<string, unknown>;
  const score = row.ai_score;
  return {
    ai_score: typeof score === "number"
      ? score
      : typeof score === "string" && score.trim() !== "" && Number.isFinite(Number(score))
      ? Number(score)
      : null,
    ai_analysis: typeof row.ai_analysis === "string" ? row.ai_analysis : null,
    ai_scorecard: row.ai_scorecard ?? null,
    phase_ai_analysis: typeof row.phase_ai_analysis === "string" ? row.phase_ai_analysis : null,
    employer_notes: typeof row.employer_notes === "string" ? row.employer_notes : null,
  };
}

/**
 * The row with its embedded `application_evaluations` laid back onto the
 * five field names, and the embed itself removed. A row selected without
 * the embed comes back with all five NULL, which is what applications holds.
 */
// deno-lint-ignore no-explicit-any
export function withEvaluation<T extends Record<string, any>>(row: T): Omit<T, "application_evaluations"> & ApplicationEvaluation {
  const { application_evaluations: embedded, ...rest } = row as T & { application_evaluations?: unknown };
  return { ...rest, ...evaluationOf(embedded) } as Omit<T, "application_evaluations"> & ApplicationEvaluation;
}

/** The smallest client surface readEvaluation needs (any supabase-js version). */
interface EvaluationReader {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
}

/**
 * One application's evaluation, read directly. Only with a client that may
 * read it (the service key, or the hiring team's own sign-in): with an
 * applicant's sign-in it answers all five NULL, as RLS refuses the row.
 * Never throws: an error reads as "no evaluation".
 */
export async function readEvaluation(client: EvaluationReader, applicationId: string): Promise<ApplicationEvaluation> {
  try {
    const { data, error } = await client
      .from("application_evaluations")
      .select(EVALUATION_COLUMNS)
      .eq("application_id", applicationId)
      .maybeSingle();
    if (error) {
      console.error("[applicationEvaluation] could not read the evaluation:", error.message ?? error);
      return evaluationOf(null);
    }
    return evaluationOf(data);
  } catch (error) {
    console.error("[applicationEvaluation] could not read the evaluation:", error);
    return evaluationOf(null);
  }
}
