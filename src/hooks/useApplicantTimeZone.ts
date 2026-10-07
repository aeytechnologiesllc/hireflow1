import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { applicantTimeZone } from "@/lib/interviewTimes";

/**
 * The applicant's own time zone for one application, as their computer and
 * connection check recorded it, or null. Never throws: a lookup that fails
 * only means the interview time is written on the team's clock (with its zone
 * named) instead of the applicant's. See src/lib/interviewTimes.ts.
 */
export async function fetchApplicantTimeZone(applicationId: string | null | undefined): Promise<string | null> {
  if (!applicationId) return null;
  try {
    const { data, error } = await supabase.from("applications").select("notes").eq("id", applicationId).maybeSingle();
    if (error || !data) return null;
    return applicantTimeZone(data.notes);
  } catch {
    return null;
  }
}

export function useApplicantTimeZone(applicationId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["applicant-time-zone", applicationId],
    queryFn: () => fetchApplicantTimeZone(applicationId),
    enabled: enabled && !!applicationId,
    staleTime: 5 * 60_000,
  });
}
