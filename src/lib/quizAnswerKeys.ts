/**
 * Merges job_quiz_keys rows back into a job's quiz_questions /
 * workflow_steps so an owner/team edit screen shows and edits exactly the
 * correct answers it wrote — the same shape the job row carried before
 * migration 20260915110000_quiz_answer_keys_server_side.sql moved answer
 * fields (correct_answer / correctAnswer / correct_answers / fit_context)
 * out into public.job_quiz_keys.
 *
 * Question identity mirrors the DB trigger exactly: the question's own
 * "id" when present, else "__idx_<index>"; the sentinel step_id
 * "__quiz_questions__" for the legacy top-level quiz_questions array, else
 * the workflow step's own "id" (or "__step_<index>" if a step somehow has
 * none).
 */

export interface JobQuizKeyRow {
  step_id: string;
  question_id: string;
  key: Record<string, unknown> | null;
}

function questionId(question: Record<string, unknown>, index: number): string {
  const id = question?.id;
  return typeof id === "string" && id.length > 0 ? id : `__idx_${index}`;
}

function mergeQuestions(
  questions: unknown,
  stepId: string,
  keysByStep: Map<string, Map<string, Record<string, unknown>>>
): unknown {
  if (!Array.isArray(questions)) return questions;
  const keysForStep = keysByStep.get(stepId);
  if (!keysForStep || keysForStep.size === 0) return questions;

  return questions.map((q, index) => {
    if (!q || typeof q !== "object") return q;
    const key = keysForStep.get(questionId(q as Record<string, unknown>, index));
    return key ? { ...(q as Record<string, unknown>), ...key } : q;
  });
}

/** Merges get_job_quiz_keys RPC rows into a job's quiz_questions and workflow_steps. */
export function mergeQuizAnswerKeys<
  T extends { quiz_questions?: unknown; workflow_steps?: unknown }
>(job: T, keyRows: JobQuizKeyRow[] | null | undefined): T {
  if (!keyRows || keyRows.length === 0) return job;

  const keysByStep = new Map<string, Map<string, Record<string, unknown>>>();
  for (const row of keyRows) {
    if (!row.key) continue;
    if (!keysByStep.has(row.step_id)) keysByStep.set(row.step_id, new Map());
    keysByStep.get(row.step_id)!.set(row.question_id, row.key);
  }
  if (keysByStep.size === 0) return job;

  const merged: T = { ...job };

  if (Array.isArray(merged.quiz_questions)) {
    merged.quiz_questions = mergeQuestions(
      merged.quiz_questions,
      "__quiz_questions__",
      keysByStep
    ) as T["quiz_questions"];
  }

  if (Array.isArray(merged.workflow_steps)) {
    merged.workflow_steps = (merged.workflow_steps as Array<Record<string, unknown>>).map(
      (step, stepIndex) => {
        if (!step || step.type !== "quiz") return step;
        const config = step.config as Record<string, unknown> | undefined;
        if (!config || !Array.isArray(config.questions)) return step;
        const stepId = typeof step.id === "string" && step.id ? step.id : `__step_${stepIndex}`;
        return {
          ...step,
          config: {
            ...config,
            questions: mergeQuestions(config.questions, stepId, keysByStep),
          },
        };
      }
    ) as T["workflow_steps"];
  }

  return merged;
}
