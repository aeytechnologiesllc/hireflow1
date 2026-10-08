import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { shiftFromJobText, zoneFromJob, type JobShift } from "@/lib/interviewSuggestion";

/** What an application's job says about when to interview: whose clock its applicants are on, and its shift. */
export interface JobInterviewHints {
  /** The clock the job is posted for, or null when it does not say. */
  zone: string | null;
  /** The shift its post states, or null. */
  shift: JobShift | null;
}

const NOTHING: JobInterviewHints = { zone: null, shift: null };

/**
 * Read from the job's own country and text (src/lib/interviewSuggestion.ts).
 * Never throws: a lookup that fails only means the set-up screen suggests
 * nothing. The select is a plain embed through the application's own job
 * (applications.job_id), the same one the invitation lookup uses.
 */
export async function fetchJobInterviewHints(applicationId: string | null | undefined): Promise<JobInterviewHints> {
  if (!applicationId) return NOTHING;
  try {
    const { data, error } = await supabase
      .from("applications")
      .select("jobs(location_country_code, description, requirements, responsibilities)")
      .eq("id", applicationId)
      .maybeSingle();
    if (error || !data) return NOTHING;
    const joined = (data as { jobs?: unknown }).jobs;
    const job = (Array.isArray(joined) ? joined[0] : joined) as {
      location_country_code?: string | null;
      description?: string | null;
      requirements?: string | null;
      responsibilities?: string | null;
    } | null;
    if (!job) return NOTHING;
    const text = [job.description, job.requirements, job.responsibilities].filter(Boolean).join("\n");
    return { zone: zoneFromJob({ countryCode: job.location_country_code, text }), shift: shiftFromJobText(text) };
  } catch {
    return NOTHING;
  }
}

export function useJobInterviewHints(applicationId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["job-interview-hints", applicationId],
    queryFn: () => fetchJobInterviewHints(applicationId),
    enabled: enabled && !!applicationId,
    staleTime: 5 * 60_000,
  });
}
