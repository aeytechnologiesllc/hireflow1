import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { interviewScores, type InterviewScore, type StoredRatingRow } from "../lib/interviewScore";

/**
 * Every applicant's interview rating, for the places outside the guide that
 * show it (lib/interviewScore.ts): the profile, the applicants list, the
 * Interviews page.
 *
 * One read of the hiring team's own ratings (the table's rule lets the team
 * read them and nobody else). It is only ever read here: the guide is the one
 * place a rating is written (hooks/useInterviewRatings.ts), and it refreshes
 * this after each save.
 */
export const INTERVIEW_SCORES_KEY = ["interview-scores"] as const;

const NONE = new Map<string, InterviewScore>();

export function useInterviewScores(): Map<string, InterviewScore> {
  const { user, role } = useAuth();
  const { data } = useQuery({
    queryKey: [...INTERVIEW_SCORES_KEY, user?.id],
    enabled: !!user && role !== "candidate",
    staleTime: 60_000,
    // A list that cannot show a rating is still a list: never an error on screen.
    retry: 1,
    queryFn: async (): Promise<StoredRatingRow[]> => {
      const { data: rows, error } = await supabase.from("interview_ratings").select("application_id, answers, overall_note");
      if (error) return [];
      return (rows ?? []) as StoredRatingRow[];
    },
  });
  return useMemo(() => (data && data.length > 0 ? interviewScores(data) : NONE), [data]);
}
