/**
 * The hiring team's evaluation of an application, kept out of the
 * applicant's own row (2026-10-25,
 * supabase/migrations/20261025230000_application_evaluations.sql;
 * docs/BACKEND-SCHEMA.md).
 *
 * Five columns used to sit on public.applications, where the applicant could
 * read them: Ava's score, report and scorecard, the graders' summary and the
 * team's notes. They live in public.application_evaluations now (one row per
 * application; the job's business and its team read it, the applicant never).
 * Everything still WRITES them through applications (a trigger moves them);
 * applications itself always answers NULL for them.
 *
 * Staff screens read them from applications_staff_list (the view joins them
 * back in) or by embedding the table:
 *   .from("applications").select("id, ..., application_evaluations(ai_scorecard)")
 * and `withEvaluation(row)` puts the embedded values back under the names
 * every screen already uses. scripts/guards/staff-evaluation-columns.mjs
 * fails the build if a select on applications names one of the five again.
 *
 * Mirrored for the edge functions in
 * supabase/functions/_shared/applicationEvaluation.ts (the guard checks the
 * two lists match).
 */
import type { Json } from "@/integrations/supabase/types";

/** The five, in the order the migration lists them. */
export const EVALUATION_FIELDS = ["ai_score", "ai_analysis", "ai_scorecard", "phase_ai_analysis", "employer_notes"] as const;
export type EvaluationField = (typeof EVALUATION_FIELDS)[number];

export interface ApplicationEvaluation {
  ai_score: number | null;
  ai_analysis: string | null;
  ai_scorecard: Json | null;
  phase_ai_analysis: string | null;
  employer_notes: string | null;
}

const EMPTY: ApplicationEvaluation = {
  ai_score: null,
  ai_analysis: null,
  ai_scorecard: null,
  phase_ai_analysis: null,
  employer_notes: null,
};

/**
 * The embedded evaluation, in whichever shape it arrives: an object (the
 * one-to-one embed), a one-element array (an older PostgREST, or a client
 * that does not know the relationship is one-to-one), or null (no
 * evaluation yet, or the caller may not read it).
 */
export function evaluationOf(embedded: unknown): ApplicationEvaluation {
  const one = Array.isArray(embedded) ? embedded[0] : embedded;
  if (!one || typeof one !== "object") return { ...EMPTY };
  const row = one as Record<string, unknown>;
  const score = row.ai_score;
  return {
    ai_score: typeof score === "number" ? score : typeof score === "string" && score.trim() !== "" && Number.isFinite(Number(score)) ? Number(score) : null,
    ai_analysis: typeof row.ai_analysis === "string" ? row.ai_analysis : null,
    ai_scorecard: (row.ai_scorecard ?? null) as Json | null,
    phase_ai_analysis: typeof row.phase_ai_analysis === "string" ? row.phase_ai_analysis : null,
    employer_notes: typeof row.employer_notes === "string" ? row.employer_notes : null,
  };
}

/**
 * The row with its embedded `application_evaluations` laid back onto the
 * five field names, and the embed itself removed. A row that was selected
 * without the embed is returned as it is.
 */
export function withEvaluation<T extends object>(row: T): Omit<T, "application_evaluations"> & ApplicationEvaluation {
  if (!row || !("application_evaluations" in row)) return row as unknown as Omit<T, "application_evaluations"> & ApplicationEvaluation;
  const { application_evaluations: embedded, ...rest } = row as T & { application_evaluations?: unknown };
  return { ...rest, ...evaluationOf(embedded) } as Omit<T, "application_evaluations"> & ApplicationEvaluation;
}

/**
 * A realtime change to public.applications without the five: the row always
 * carries NULL for them now, and merging that NULL into a cached staff row
 * would wipe the score the evaluation change brought.
 */
export function withoutEvaluationFields<T extends Record<string, unknown>>(row: T): T {
  if (!row || typeof row !== "object") return row;
  let out: T | null = null;
  for (const field of EVALUATION_FIELDS) {
    if (field in row) {
      out ??= { ...row };
      delete (out as Record<string, unknown>)[field];
    }
  }
  return out ?? row;
}
