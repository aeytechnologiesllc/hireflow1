import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSchemaMode } from "@/hooks/useSchemaMode";
import type { Tables, TablesInsert, Json } from "@/integrations/supabase/types";
import {
  notifyApplicationReceived,
  notifyNewApplication,
  notifyStatusRejected,
  notifyStatusHired,
  notifyPhaseAdvanced,
} from "@/utils/emailNotifications";

export type Application = Tables<"applications">;
export type ApplicationInsert = TablesInsert<"applications">;

export interface InterviewForApplication {
  id: string;
  scheduled_at: string;
  status: string;
  candidate_response: string | null;
  meeting_link: string | null;
  duration_minutes: number | null;
  interview_type: string | null;
  proposed_times: Json | null;
  candidate_note: string | null;
  /** The times the team offered (src/lib/candidateInterview.ts reads them). */
  employer_windows?: Json | null;
}

export interface ApplicationWithJob extends Application {
  jobs: Tables<"jobs"> | null;
  latestInterview?: InterviewForApplication | null;
}

export interface ApplicationWithCandidate extends Application {
  profiles: Tables<"profiles"> | null;
  jobs: Tables<"jobs"> | null;
}

async function fetchJobNotificationContext(jobId: string) {
  const { data: jobDetails, error: jobError } = await supabase
    .from("jobs")
    .select("title, employer_id")
    .eq("id", jobId)
    .single();

  if (jobError || !jobDetails) {
    throw jobError ?? new Error("Job not found");
  }

  const { data: employerProfile } = await supabase
    .from("profiles")
    .select("company_name")
    .eq("user_id", jobDetails.employer_id)
    .maybeSingle();

  return {
    ...jobDetails,
    // A null/blank company_name must never reach a candidate-facing message —
    // that literally rendered as "null has decided not to move forward..."
    // (src/hooks/useApplications.ts, the launch blocker this guards against).
    // "This employer" reads correctly whether it opens a sentence or sits
    // mid-sentence, matching the fallback already used on the candidate side
    // (CandidateApplicationDetail.tsx, CandidateInterviewConfirmationCard.tsx).
    companyName: employerProfile?.company_name?.trim() || "This employer",
  };
}

export function useCandidateApplications() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["applications", "candidate", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(*)")
        .eq("candidate_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch interviews for these applications
      const applicationIds = data.map((app) => app.id);
      
      const { data: interviews } = await supabase
        .from("interviews")
        .select("id, application_id, scheduled_at, status, candidate_response, meeting_link, duration_minutes, interview_type, proposed_times, candidate_note, employer_windows")
        .in("application_id", applicationIds)
        .eq("status", "scheduled")
        .order("scheduled_at", { ascending: false });

      // Map interviews to applications (get the latest one per application)
      const interviewMap = new Map<string, InterviewForApplication>();
      interviews?.forEach((interview) => {
        if (!interviewMap.has(interview.application_id)) {
          interviewMap.set(interview.application_id, {
            id: interview.id,
            scheduled_at: interview.scheduled_at,
            status: interview.status,
            candidate_response: interview.candidate_response,
            meeting_link: interview.meeting_link,
            duration_minutes: interview.duration_minutes,
            interview_type: interview.interview_type,
            proposed_times: interview.proposed_times,
            candidate_note: interview.candidate_note,
            employer_windows: interview.employer_windows,
          });
        }
      });

      return data.map((app) => ({
        ...app,
        latestInterview: interviewMap.get(app.id) || null,
      })) as ApplicationWithJob[];
    },
    enabled: !!user,
  });
}

/**
 * Freshness for the staff applicant queries, overriding the App.tsx defaults
 * for these two only (scripts/guards/cockpit-live-applicants.mjs checks it).
 */
const LIVE_LIST_FRESHNESS = {
  staleTime: 10_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
} as const;

export function useEmployerApplications() {
  const { user, role, isTeamMember } = useAuth();
  const { data: mode } = useSchemaMode();

  return useQuery({
    queryKey: ["applications", "employer", user?.id],
    queryFn: async () => {
      // Whose jobs: a team member's business's, an owner's own. An owner
      // needs no look-up for that (useAuth already knows they are no team
      // member); it used to sit in front of everything below.
      let effectiveEmployerId = user!.id;
      if (isTeamMember || role !== "employer") {
        const { data: teamMember } = await supabase
          .from("team_members")
          .select("employer_id")
          .eq("user_id", user!.id)
          .eq("status", "active")
          .maybeSingle();
        effectiveEmployerId = teamMember?.employer_id || user!.id;
      }

      // The jobs once, then only their applications, each given its job here.
      // This used to be every application the rules allowed with its whole
      // job embedded (`*, jobs!inner(*)`), filtered on the phone: 9.2 MB for
      // the owner's 154 applications on every open, 2.7 MB of it the same
      // 17 KB job again and again (the performance check, 2026-10-11). RLS
      // still decides every row: a team member limited to some jobs sees only
      // those jobs, and so only their applications.
      const { data: jobs, error: jobsError } = await supabase
        .from("jobs")
        .select("*")
        .eq("employer_id", effectiveEmployerId);
      if (jobsError) throw jobsError;
      if (!jobs || jobs.length === 0) return [] as ApplicationWithCandidate[];
      const jobById = new Map(jobs.map((job) => [job.id, job]));

      // applications_staff_list: applications exactly, without the notes'
      // three heavy parts no staff screen reads (migration
      // 20261011201000_applications_staff_list.sql).
      const { data: applications, error: appError } = await supabase
        .from("applications_staff_list")
        .select("*")
        .in("job_id", [...jobById.keys()])
        .order("created_at", { ascending: false });

      if (appError) throw appError;

      const filtered = (applications ?? [])
        .map((app) => ({ ...app, jobs: jobById.get(app.job_id as string) ?? null }))
        .filter((app) => app.jobs?.employer_id === effectiveEmployerId) as unknown as ApplicationWithCandidate[];

      if (filtered.length === 0) {
        return [] as ApplicationWithCandidate[];
      }

      // Get unique candidate IDs
      const candidateIds = [...new Set(filtered.map((app) => app.candidate_id))];

      // Fetch profiles for all candidates
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .in("user_id", candidateIds);

      if (profileError) throw profileError;

      // Map profiles to applications
      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

      const withProfiles = filtered.map((app) => ({
        ...app,
        profiles: profileMap.get(app.candidate_id) || null,
      })) as ApplicationWithCandidate[];

      return withProfiles;
    },
    enabled: !!user && mode === "hireflow1",
    // The app-wide default (5 min, no refetch on focus) left the owner looking
    // at "Nobody has applied yet." for a whole test run. Live updates come from
    // useEmployerLiveSync; these make the list heal on its own too — on coming
    // back to the tab, after the network returns, or on a remount — if a
    // realtime event was ever missed.
    ...LIVE_LIST_FRESHNESS,
  });
}

export function useApplicationStats() {
  const { user } = useAuth();
  const { data: mode } = useSchemaMode();

  return useQuery({
    queryKey: ["applications", "stats", user?.id],
    queryFn: async () => {
      // Check if user is a team member
      const { data: teamMember } = await supabase
        .from("team_members")
        .select("employer_id")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .maybeSingle();

      const effectiveEmployerId = teamMember?.employer_id || user!.id;

      const { data, error } = await supabase
        .from("applications")
        .select("status, jobs!inner(employer_id)");

      if (error) throw error;

      const myApps = (data as Array<{ status: string; jobs: { employer_id: string } | null }>).filter(
        (app) => app.jobs?.employer_id === effectiveEmployerId
      );

      return {
        total: myApps.length,
        pending: myApps.filter((a) => a.status === "pending").length,
        reviewing: myApps.filter((a) => a.status === "reviewing").length,
        interview: myApps.filter((a) => a.status === "interview").length,
        hired: myApps.filter((a) => a.status === "hired").length,
      };
    },
    enabled: !!user && mode === "hireflow1",
    ...LIVE_LIST_FRESHNESS,
  });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (application: Omit<ApplicationInsert, "candidate_id">) => {
      // The job must still be published (the public view only lists those).
      const { data: job, error: jobError } = await supabase
        .from("published_jobs_public")
        .select("employer_id")
        .eq("id", application.job_id)
        .single();

      if (jobError || !job) {
        throw new Error("Job not found");
      }

      const { data, error } = await supabase
        .from("applications")
        .insert({ ...application, candidate_id: user!.id })
        .select()
        .single();

      if (error) throw error;

      // Send email notifications asynchronously (don't block on failure)
      (async () => {
        try {
          const jobDetails = await fetchJobNotificationContext(application.job_id);

          if (jobDetails) {
            // Notify candidate their application was received
            notifyApplicationReceived(user!.id, jobDetails.title, jobDetails.companyName, data?.id);
            
            // Notify employer about new application
            const candidateName = user?.user_metadata?.full_name || user?.email || "A candidate";
            notifyNewApplication(jobDetails.employer_id, candidateName, jobDetails.title);
          }
        } catch (err) {
          console.error("Failed to send application email notifications:", err);
        }
      })();

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}

export function useUpdateApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      phaseTitle,
      ...updates
    }: Partial<Omit<Application, "ai_score" | "ai_analysis" | "ai_scorecard" | "phase_ai_analysis">> & {
      // Both sides call this: applicants (the form's resume, answers and
      // submit) and the hiring team (moves, declines with employer_notes).
      // Ava's score, report, scorecard and summary are written by the server
      // alone (application_evaluations, 2026-10-25), so they are not here;
      // the team's employer_notes still is (a trigger files it there).
      id: string;
      /**
       * The step's name as the applicant knows it ("Chat interview"), for the
       * "you've been moved to" email when `phase` is a step id. Never written
       * to the row. Without it the email said "You've been moved to step_chat".
       */
      phaseTitle?: string;
    }) => {
      // Best-effort read of the prior state for notifications.
      // Do not block the actual application update if this lookup stalls.
      // Only columns both sides may read: an applicant's own row never holds
      // the hiring team's evaluation (application_evaluations).
      const currentAppLookup = supabase
        .from("applications")
        .select("status, phase, candidate_id, job_id")
        .eq("id", id)
        .single();

      const currentAppResult = await Promise.race([
        currentAppLookup,
        new Promise<{ data: null; error: Error }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: new Error("Timed out loading current application state") }), 2500)
        ),
      ]);
      const currentApp = currentAppResult.data ?? null;

      if (currentAppResult.error) {
        console.warn("[useUpdateApplication] Continuing without pre-update snapshot:", currentAppResult.error.message);
      }

      const { data, error } = await supabase
        .from("applications")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // Send email + in-app notifications for status/phase changes asynchronously.
      // Use the pre-update snapshot when available, but fall back to the freshly
      // updated row (`data`) so a slow snapshot lookup can never silently drop a
      // hire/reject notification — the candidate must always be told.
      const snap = currentApp ?? data;
      if (snap) {
        (async () => {
          try {
            const job = await fetchJobNotificationContext(snap.job_id);

            if (job) {
              // Status changed to rejected (prevStatus unknown if snapshot timed out → still notify).
              // In-app notification is handled server-side by
              // notify_application_status_change() (AFTER UPDATE ON
              // applications) — a manual insert here duplicated it with a
              // second, differently-worded bell and a non-redirect link.
              if (updates.status === "rejected" && currentApp?.status !== "rejected") {
                notifyStatusRejected(snap.candidate_id, job.title, job.companyName, id);
              }

              // Status changed to hired — same DB trigger already covers
              // the in-app notification.
              if (updates.status === "hired" && currentApp?.status !== "hired") {
                notifyStatusHired(snap.candidate_id, job.title, job.companyName, id);
              }

              // Phase notifications need the previous phase, so they only run when
              // the pre-update snapshot is available.
              if (currentApp) {
                // Phase advanced (only if phase actually changed)
                if (updates.phase && updates.phase !== currentApp.phase) {
                  notifyPhaseAdvanced(currentApp.candidate_id, phaseTitle?.trim() || updates.phase, job.title, job.companyName);
                }
                // "Phase completed" used to be sent from here when a write
                // carried a new phase_ai_analysis. No caller has sent one
                // since the graders moved server-side (applicants may not
                // write it; protect_application_staff_columns), and the
                // summary is the hiring team's own table now.
              }
            }
          } catch (err) {
            console.error("Failed to send application update email notifications:", err);
          }
        })();
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}

// No useDeleteApplication: a business removes an application only through
// "Delete their information" (remove-applicant), which logs who did it and
// deletes its files; the database refuses a business's direct delete since
// 20261025550000 (the eleventh Phase 5 review). An applicant withdraws their
// own from Applications.
