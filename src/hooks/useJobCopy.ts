import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCreateJob, type Job, type JobInsert } from "@/hooks/useJobs";
import { mergeQuizAnswerKeys, type JobQuizKeyRow } from "@/lib/quizAnswerKeys";
import { jobCopyPayload } from "@/lib/jobCopy";

/**
 * "Copy to drafts" (src/lib/jobCopy.ts): reads one job whole, with its quiz
 * answers, and saves a copy as a new draft.
 *
 * It goes through the same two doors the job editor uses, on purpose:
 *  - the read is the editor's own (useJob): the row, then get_job_quiz_keys,
 *    which only answers the job's owner and its team, merged back in;
 *  - the write is useCreateJob: the ordinary insert, under the ordinary
 *    rules (who may create a job, the job's own code, and the trigger that
 *    moves the quiz answers into job_quiz_keys for the new row).
 * So a copy can do nothing a hand-made job could not, and needs no database
 * change of its own.
 *
 * Unlike the editor's read, a failed answer lookup stops the copy: a quiz
 * saved without its answers could never be marked, and nothing on screen
 * would say so until an applicant took it.
 */

/** Thrown when the job cannot be read whole; the page says it plainly. */
export class JobCopyError extends Error {
  constructor(
    public readonly reason: "not_found" | "answers_unreadable" | "nothing_to_copy",
    message: string,
  ) {
    super(message);
    this.name = "JobCopyError";
  }
}

export function useCopyJobToDrafts() {
  const createJob = useCreateJob();

  return useMutation({
    mutationFn: async (jobId: string): Promise<Job> => {
      const { data: row, error } = await supabase.from("jobs").select("*").eq("id", jobId).maybeSingle();
      if (error) throw error;
      if (!row) throw new JobCopyError("not_found", "That job isn't there any more.");

      const { data: keyRows, error: keysError } = await supabase.rpc("get_job_quiz_keys", { p_job_id: jobId });
      if (keysError) throw new JobCopyError("answers_unreadable", keysError.message || "The quiz answers could not be read.");

      const whole = mergeQuizAnswerKeys(row as Job, keyRows as unknown as JobQuizKeyRow[]);
      const draft = jobCopyPayload(whole as unknown as Record<string, unknown>);
      if (!draft) throw new JobCopyError("nothing_to_copy", "That job has no title or description to copy.");

      return (await createJob.mutateAsync(draft as unknown as Omit<JobInsert, "employer_id">)) as Job;
    },
  });
}

/** Why a copy failed, in words for a toast. */
export function jobCopyFailureWords(error: unknown): string {
  if (error instanceof JobCopyError) {
    if (error.reason === "not_found") return "That job isn't there any more.";
    if (error.reason === "answers_unreadable") return "Couldn't read this job's quiz answers, so no copy was made. Try again.";
    return "That job has nothing to copy yet.";
  }
  const code = (error as { code?: string } | null)?.code;
  if (code === "42501") return "You can't create jobs on this account.";
  return "Couldn't copy this job. Try again.";
}
