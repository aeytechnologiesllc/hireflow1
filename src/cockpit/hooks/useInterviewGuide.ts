import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readPersonalGuide, type PersonalGuide } from "@/lib/interviewGuide";
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
        supabase.from("applications").select("ai_scorecard").eq("id", applicationId!).maybeSingle(),
      ]);
      const scorecard = application.data?.ai_scorecard;
      const family =
        scorecard && typeof scorecard === "object" && !Array.isArray(scorecard) && typeof (scorecard as Record<string, unknown>).jobFamily === "string"
          ? ((scorecard as Record<string, unknown>).jobFamily as string)
          : null;
      if (guide.error) {
        if (isRecordNotDeployed(guide.error)) return { family, personal: null, generatedAt: null, deployed: false };
        throw guide.error;
      }
      return {
        family,
        personal: readPersonalGuide(guide.data?.guide),
        generatedAt: guide.data?.generated_at ?? null,
        deployed: true,
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
      }));
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
  };
}
