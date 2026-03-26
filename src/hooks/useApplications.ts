import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import {
  notifyApplicationReceived,
  notifyNewApplication,
  notifyStatusRejected,
  notifyStatusHired,
  notifyPhaseAdvanced,
  notifyPhaseCompleted,
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
  proposed_times: any;
  candidate_note: string | null;
}

export interface ApplicationWithJob extends Application {
  jobs: Tables<"jobs"> | null;
  latestInterview?: InterviewForApplication | null;
}

export interface ApplicationWithCandidate extends Application {
  profiles: Tables<"profiles"> | null;
  jobs: Tables<"jobs"> | null;
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
        .select("id, application_id, scheduled_at, status, candidate_response, meeting_link, duration_minutes, interview_type, proposed_times, candidate_note")
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

export function useEmployerApplications() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["applications", "employer", user?.id],
    queryFn: async () => {
      // Check if user is a team member
      const { data: teamMember } = await supabase
        .from("team_members")
        .select("employer_id")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .maybeSingle();

      const effectiveEmployerId = teamMember?.employer_id || user!.id;

      // Get applications with jobs - RLS handles job filtering for team members
      const { data: applications, error: appError } = await supabase
        .from("applications")
        .select("*, jobs!inner(*)")
        .order("created_at", { ascending: false });

      if (appError) throw appError;

      // Filter to only show applications for jobs owned by effective employer
      const filtered = (applications as ApplicationWithCandidate[]).filter(
        (app) => app.jobs?.employer_id === effectiveEmployerId
      );

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

      return filtered.map((app) => ({
        ...app,
        profiles: profileMap.get(app.candidate_id) || null,
      })) as ApplicationWithCandidate[];
    },
    enabled: !!user,
  });
}

export function useApplicationStats() {
  const { user } = useAuth();

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
    enabled: !!user,
  });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (application: Omit<ApplicationInsert, "candidate_id">) => {
      // Check if employer has reached applicant limit before creating application
      const { data: job, error: jobError } = await supabase
        .from("jobs")
        .select("employer_id")
        .eq("id", application.job_id)
        .single();

      if (jobError || !job) {
        throw new Error("Job not found");
      }

      // Check employer's subscription limit
      const { data: limitCheck, error: limitError } = await supabase.functions.invoke("check-applicant-limit", {
        body: { employerId: job.employer_id, jobId: application.job_id },
      });

      if (limitError) {
        console.error("Error checking applicant limit:", limitError);
        // Continue anyway - don't block applications on limit check failures
      } else if (limitCheck?.limitReached) {
        throw new Error(limitCheck.message || "This employer has reached their applicant limit. Please try again later.");
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
          // Get job details for email content
          const { data: jobDetails } = await supabase
            .from("jobs")
            .select("title, employer_id, profiles:employer_id(company_name)")
            .eq("id", application.job_id)
            .single();

          if (jobDetails) {
            const companyName = (jobDetails as { profiles?: { company_name?: string } | null }).profiles?.company_name;
            
            // Notify candidate their application was received
            notifyApplicationReceived(user!.id, jobDetails.title, companyName);
            
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
    mutationFn: async ({ id, ...updates }: Partial<Application> & { id: string }) => {
      // Get the current application state before update
      const { data: currentApp } = await supabase
        .from("applications")
        .select("status, phase, phase_ai_analysis, candidate_id, job_id")
        .eq("id", id)
        .single();

      const { data, error } = await supabase
        .from("applications")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // Send email notifications for status/phase changes asynchronously
      if (currentApp) {
        (async () => {
          try {
            // Get job details for email content
            const { data: job } = await supabase
              .from("jobs")
              .select("title, employer_id, profiles:employer_id(company_name)")
              .eq("id", currentApp.job_id)
              .single();

            if (job) {
              const companyName = (job as { profiles?: { company_name?: string } | null }).profiles?.company_name;

              // Status changed to rejected
              if (updates.status === "rejected" && currentApp.status !== "rejected") {
                notifyStatusRejected(currentApp.candidate_id, job.title, companyName);
              }

              // Status changed to hired
              if (updates.status === "hired" && currentApp.status !== "hired") {
                notifyStatusHired(currentApp.candidate_id, job.title, companyName);
              }

              // Phase advanced (only if phase actually changed)
              if (updates.phase && updates.phase !== currentApp.phase) {
                notifyPhaseAdvanced(currentApp.candidate_id, updates.phase, job.title, companyName);
              }

              // Phase completed by candidate (phase_ai_analysis added/updated while in same phase)
              // This signals candidate finished the current phase assessment
              if (updates.phase_ai_analysis && updates.phase_ai_analysis !== currentApp.phase_ai_analysis) {
                // Get candidate profile for name
                const { data: candidateProfile } = await supabase
                  .from("profiles")
                  .select("full_name, email")
                  .eq("user_id", currentApp.candidate_id)
                  .single();
                
                const candidateName = candidateProfile?.full_name || candidateProfile?.email || "A candidate";
                const phaseName = currentApp.phase || "a phase";
                notifyPhaseCompleted(job.employer_id, candidateName, phaseName, job.title);
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

export function useDeleteApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (applicationId: string) => {
      // Delete related documents first
      await supabase.from("documents").delete().eq("application_id", applicationId);
      
      // Delete related interviews
      await supabase.from("interviews").delete().eq("application_id", applicationId);
      
      // Delete related messages
      await supabase.from("messages").delete().eq("application_id", applicationId);
      
      // Delete the application
      const { error } = await supabase
        .from("applications")
        .delete()
        .eq("id", applicationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
  });
}
