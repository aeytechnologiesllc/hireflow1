import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { NO_PLAN_EDITS, readPersonalGuide, readPlanEdits, type PersonalGuide, type PlanEdits } from "@/lib/interviewGuide";
import { isRecordNotDeployed } from "./useAssessmentSessions";

/**
 * One applicant's interview guide, the staff side (src/lib/interviewGuide.ts;
 * docs/INTERVIEWS.md, "The interview guide").
 *
 * The plan (the questions everyone gets) is plain code and is on screen at
 * once. This reads what goes with it: which plan fits the job (the scorer's
 * own family for the job, kept on the applicant's scorecard) and the personal
 * part, if one has been written. The personal part is read under RLS from
 * public.interview_guides, which only the job's hiring team can see.
 *
 * Writing it goes through the interview-guide edge function and nothing else:
 * the page sends the application's id, and the function reads the record
 * itself. The page cannot write the table.
 *
 * Until the migration is applied the table does not exist: that reads as "not
 * written yet", and writing says it is not switched on yet.
 *
 * It also reads the job's own changes to the plan (public.interview_plans,
 * PlanEdits): a welcome of their own, questions reworded, not asked, or
 * added. They are per job, so every applicant for the job is asked the same
 * set, and they are saved through save_interview_plan and nothing else.
 */

export const interviewGuideKeys = {
  one: (applicationId: string | null | undefined) => ["interview-guide", applicationId ?? null] as const,
};

export interface InterviewGuideRecord {
  /** The scorer's family for the job ("team_lead", …), or null when the applicant is not scored yet. */
  family: string | null;
  personal: PersonalGuide | null;
  generatedAt: string | null;
  /** False when the table is not there yet (the migration is not applied). */
  deployed: boolean;
  /** The applicant's job: a plan's changes are kept per job. */
  jobId: string | null;
  /** The job's own changes to the plan (none when nothing was changed). */
  planEdits: PlanEdits;
  /** False when public.interview_plans is not there yet. */
  plansDeployed: boolean;
}

/** Why a job's changes could not be saved, in the words the dialog shows. */
export type PlanSaveFailure = "not_allowed" | "too_long" | "not_deployed" | "failed";

export const PLAN_SAVE_WORDS: Record<PlanSaveFailure, string> = {
  not_allowed: "Only the owner, or a teammate who manages applicants, can change the questions.",
  too_long: "One of the boxes holds too much. Shorten it and save again.",
  not_deployed: "Changing the questions is not switched on yet.",
  failed: "Your changes could not be saved just now. They are still on this screen: try again.",
};

function planFailureFrom(error: { code?: string | null; message?: string | null } | null | undefined): PlanSaveFailure {
  if (isRecordNotDeployed(error)) return "not_deployed";
  if (error?.code === "42501") return "not_allowed";
  if (error?.code === "22023") return "too_long";
  return "failed";
}

/** Why a personal part could not be written, in the words the dialog shows. */
export type GuideWriteFailure = "ai_unavailable" | "nothing_yet" | "rate_limited" | "not_deployed" | "failed";

export class GuideWriteError extends Error {
  readonly reason: GuideWriteFailure;
  constructor(reason: GuideWriteFailure) {
    super(reason);
    this.reason = reason;
  }
}

export const GUIDE_WRITE_WORDS: Record<GuideWriteFailure, string> = {
  ai_unavailable: "The writing service is not answering right now. The questions everyone gets are below; try the personal ones again in a few minutes.",
  nothing_yet: "They have not sent their application yet, so there is nothing to write personal questions from.",
  rate_limited: "That is a lot of guides in one hour. Try again in a little while.",
  not_deployed: "Personal questions are not switched on yet.",
  failed: "The personal questions could not be written just now. Try again.",
};

function failureFrom(status: number | null, body: unknown): GuideWriteFailure {
  const code = body && typeof body === "object" ? String((body as Record<string, unknown>).error ?? "") : "";
  if (status === 503 || code === "ai_unavailable") return "ai_unavailable";
  if (status === 409 || code === "nothing_yet") return "nothing_yet";
  if (status === 429 || code === "rate_limited") return "rate_limited";
  // The function is not there (not deployed yet): the gateway answers 404 with no body of ours.
  if (status === 404 && code !== "not_found") return "not_deployed";
  return "failed";
}

export function useInterviewGuide(applicationId: string | null | undefined, enabled = true) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: interviewGuideKeys.one(applicationId),
    enabled: enabled && !!applicationId,
    staleTime: 60_000,
    retry: (count, error) => count < 2 && !isRecordNotDeployed(error as { code?: string; message?: string }),
    queryFn: async (): Promise<InterviewGuideRecord> => {
      const [guide, application] = await Promise.all([
        supabase.from("interview_guides").select("guide, generated_at").eq("application_id", applicationId!).maybeSingle(),
        supabase.from("applications").select("ai_scorecard, job_id").eq("id", applicationId!).maybeSingle(),
      ]);
      const jobId = typeof application.data?.job_id === "string" ? application.data.job_id : null;
      // The job's own changes to the plan. A table that is not there yet
      // reads as "nothing changed"; any other failure is a failure, because
      // showing the plan without his changes would put the wrong questions
      // in front of him.
      let planEdits: PlanEdits = NO_PLAN_EDITS;
      let plansDeployed = true;
      if (jobId) {
        const plan = await supabase.from("interview_plans").select("edits").eq("job_id", jobId).maybeSingle();
        if (plan.error) {
          if (!isRecordNotDeployed(plan.error)) throw plan.error;
          plansDeployed = false;
        } else {
          planEdits = readPlanEdits(plan.data?.edits);
        }
      }
      const scorecard = application.data?.ai_scorecard;
      const family =
        scorecard && typeof scorecard === "object" && !Array.isArray(scorecard) && typeof (scorecard as Record<string, unknown>).jobFamily === "string"
          ? ((scorecard as Record<string, unknown>).jobFamily as string)
          : null;
      if (guide.error) {
        if (isRecordNotDeployed(guide.error)) return { family, personal: null, generatedAt: null, deployed: false, jobId, planEdits, plansDeployed };
        throw guide.error;
      }
      return {
        family,
        personal: readPersonalGuide(guide.data?.guide),
        generatedAt: guide.data?.generated_at ?? null,
        deployed: true,
        jobId,
        planEdits,
        plansDeployed,
      };
    },
  });

  const write = useMutation({
    mutationFn: async (): Promise<{ personal: PersonalGuide; generatedAt: string }> => {
      if (!applicationId) throw new GuideWriteError("failed");
      const { data, error } = await supabase.functions.invoke("interview-guide", { body: { applicationId } });
      if (error) {
        // A refusal arrives as an error carrying the response.
        const response = (error as { context?: unknown }).context;
        if (typeof Response !== "undefined" && response instanceof Response) {
          const body = await response.clone().json().catch(() => null);
          throw new GuideWriteError(failureFrom(response.status, body));
        }
        throw new GuideWriteError("failed");
      }
      const personal = readPersonalGuide((data as { guide?: unknown } | null)?.guide);
      if (!personal) throw new GuideWriteError("failed");
      const generatedAt = String((data as { generatedAt?: unknown } | null)?.generatedAt ?? new Date().toISOString());
      return { personal, generatedAt };
    },
    onSuccess: ({ personal, generatedAt }) => {
      queryClient.setQueryData<InterviewGuideRecord>(interviewGuideKeys.one(applicationId), (previous) => ({
        family: previous?.family ?? null,
        personal,
        generatedAt,
        deployed: true,
        jobId: previous?.jobId ?? null,
        planEdits: previous?.planEdits ?? NO_PLAN_EDITS,
        plansDeployed: previous?.plansDeployed ?? true,
      }));
    },
  });

  // Save the job's changes to the plan (null: back to the plan as written).
  // What comes back is what the database kept, and that is what is shown.
  const savePlan = useMutation({
    // Said at once: a refusal (not allowed, too long) is not something a
    // second try a second later would change.
    retry: false,
    mutationFn: async (edits: PlanEdits | null): Promise<PlanEdits> => {
      const jobId = query.data?.jobId;
      if (!jobId) throw Object.assign(new Error("no job"), { reason: "failed" as PlanSaveFailure });
      const { data, error } = await supabase.rpc("save_interview_plan", { p_job_id: jobId, p_edits: (edits ? readPlanEdits(edits) : null) as never });
      if (error) throw Object.assign(new Error(error.message), { reason: planFailureFrom(error) });
      return readPlanEdits(data);
    },
    onSuccess: (planEdits) => {
      queryClient.setQueryData<InterviewGuideRecord>(interviewGuideKeys.one(applicationId), (previous) => (previous ? { ...previous, planEdits, plansDeployed: true } : previous));
      // Other applicants of the same job are asked the same questions.
      void queryClient.invalidateQueries({ queryKey: ["interview-guide"] });
    },
  });

  return {
    record: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    write: () => write.mutateAsync(),
    isWriting: write.isPending,
    /** Why the last write failed, or null. Cleared by the next write. */
    writeFailure: write.error instanceof GuideWriteError ? write.error.reason : write.error ? ("failed" as const) : null,
    /** Save the job's changes to the plan; null puts the plan back as written. Rejects with `reason` (PlanSaveFailure). */
    savePlan: (edits: PlanEdits | null) => savePlan.mutateAsync(edits),
    isSavingPlan: savePlan.isPending,
  };
}
