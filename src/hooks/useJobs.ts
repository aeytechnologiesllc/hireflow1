import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { detectSchemaMode, updateShowcaseRole } from "@/cockpit/data/showcaseSource";
import { createShowcaseRole, SHOWCASE_EMPLOYER_ID } from "@/lib/showcaseApply";
import { useSchemaMode } from "@/hooks/useSchemaMode";
import { notifyGoogleJobIndexingInBackground } from "@/lib/googleIndexing";

export type Job = Tables<"jobs">;
export type JobInsert = TablesInsert<"jobs">;

export interface JobWithApplicationCount extends Job {
  application_count: number;
}

async function resolveEmployerIdForJobAccess(userId: string, isTeamMember: boolean) {
  if (!isTeamMember) {
    return userId;
  }

  const { data: teamMember, error } = await supabase
    .from("team_members")
    .select("employer_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  if (error || !teamMember) {
    throw error ?? new Error("Active team membership not found.");
  }

  return teamMember.employer_id;
}

export function useEmployerJobs() {
  const { user, isTeamMember } = useAuth();
  const { data: mode } = useSchemaMode();

  return useQuery({
    queryKey: ["jobs", "employer", user?.id, isTeamMember],
    queryFn: async () => {
      let employerId = user!.id;

      try {
        employerId = await resolveEmployerIdForJobAccess(user!.id, !!isTeamMember);
      } catch (tmError) {
        console.error("Failed to get team member employer_id:", tmError);
        return [] as JobWithApplicationCount[];
      }

      // Get jobs - RLS will filter to assigned jobs for team members
      const { data: jobs, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("employer_id", employerId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get application counts for all jobs
      const jobIds = jobs.map(j => j.id);
      if (jobIds.length === 0) return [] as JobWithApplicationCount[];

      const { data: applications, error: appError } = await supabase
        .from("applications")
        .select("job_id")
        .in("job_id", jobIds);

      if (appError) throw appError;

      // Count applications per job
      const countMap = new Map<string, number>();
      applications?.forEach(app => {
        countMap.set(app.job_id, (countMap.get(app.job_id) || 0) + 1);
      });

      return jobs.map(job => ({
        ...job,
        application_count: countMap.get(job.id) || 0,
      })) as JobWithApplicationCount[];
    },
    enabled: !!user && mode === "hireflow1",
  });
}

export function useJob(id: string | undefined) {
  const { user } = useAuth();
  const { data: mode } = useSchemaMode();

  return useQuery({
    queryKey: ["jobs", "single", id, mode],
    queryFn: async () => {
      if (mode === "showcase") {
        const { data, error } = await supabase.from("roles").select("*").eq("id", id!).single();
        if (error) throw error;
        return {
          id: data.id,
          title: data.title,
          description: data.description,
          location: data.location,
          status: data.status === "draft" ? "draft" : "published",
          job_type: data.employment_type,
          salary_min: null,
          salary_max: null,
          employer_id: data.employer_id ?? SHOWCASE_EMPLOYER_ID,
          job_code: data.role_code,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as Job;
      }

      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data as Job;
    },
    enabled: !!user && !!id && !!mode,
  });
}

export function usePublishedJobs() {
  return useQuery({
    queryKey: ["jobs", "published"],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("status", "published")
        // Filter out jobs with passed deadlines
        .or(`application_deadline.is.null,application_deadline.gt.${now}`)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Job[];
    },
  });
}

export function useJobStats() {
  const { user, isTeamMember } = useAuth();

  return useQuery({
    queryKey: ["jobs", "stats", user?.id, isTeamMember],
    queryFn: async () => {
      let employerId = user!.id;

      try {
        employerId = await resolveEmployerIdForJobAccess(user!.id, !!isTeamMember);
      } catch (tmError) {
        console.error("Failed to get team member employer_id:", tmError);
        return { total: 0, published: 0, draft: 0, closed: 0 };
      }

      const { data, error } = await supabase
        .from("jobs")
        .select("status")
        .eq("employer_id", employerId);

      if (error) throw error;

      const stats = {
        total: data.length,
        published: data.filter((j) => j.status === "published").length,
        draft: data.filter((j) => j.status === "draft").length,
        closed: data.filter((j) => j.status === "closed").length,
      };

      return stats;
    },
    enabled: !!user,
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  const { user, isTeamMember } = useAuth();

  return useMutation({
    mutationFn: async (job: Omit<JobInsert, "employer_id">) => {
      const mode = await detectSchemaMode();
      if (mode === "showcase") {
        const pay =
          job.salary_min && job.salary_max
            ? `$${job.salary_min} – $${job.salary_max}`
            : job.salary_min
              ? `$${job.salary_min}+`
              : "Competitive";
        const created = await createShowcaseRole({
          title: job.title,
          description: job.description,
          location: job.location,
          pay,
          status: job.status === "draft" ? "draft" : "live",
          employment_type: job.job_type,
        });
        return {
          ...created,
          job_code: created.role_code,
          job_type: job.job_type,
        } as unknown as Job;
      }

      const employerId = await resolveEmployerIdForJobAccess(user!.id, !!isTeamMember);
      const { data, error } = await supabase
        .from("jobs")
        .insert({ ...job, employer_id: employerId })
        .select()
        .single();

      if (error) throw error;
      if (data.status === "published") {
        notifyGoogleJobIndexingInBackground({
          jobId: data.id,
          notificationType: "URL_UPDATED",
          reason: "job_created_published",
        });
      }
      return data;
    },
    onSuccess: (_data, _vars, _ctx) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["showcase-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["showcase-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
    },
  });
}

export function useUpdateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Job> & { id: string }) => {
      const mode = await detectSchemaMode();
      if (mode === "showcase") {
        const pay =
          updates.salary_min && updates.salary_max
            ? `$${updates.salary_min} – $${updates.salary_max}`
            : updates.salary_min
              ? `$${updates.salary_min}+`
              : undefined;
        const updated = await updateShowcaseRole(id, {
          title: updates.title,
          description: updates.description,
          location: updates.location,
          pay,
          status: updates.status === "draft" ? "draft" : updates.status === "closed" ? "closed" : "live",
        });
        return {
          id: updated.id,
          title: updated.title,
          description: updated.description,
          location: updated.location,
          status: updated.status === "draft" ? "draft" : "published",
          job_code: updated.role_code,
        } as unknown as Job;
      }

      const { data, error } = await supabase
        .from("jobs")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      if (data.status === "published") {
        notifyGoogleJobIndexingInBackground({
          jobId: data.id,
          notificationType: "URL_UPDATED",
          reason: "job_updated_published",
        });
      } else if (updates.status && updates.status !== "published") {
        notifyGoogleJobIndexingInBackground({
          jobId: data.id,
          notificationType: "URL_DELETED",
          reason: `job_status_${updates.status}`,
        });
      }
      return data;
    },
    onSuccess: () => {
      // Invalidate all job-related caches
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["showcase-jobs"] });
      
      // CRITICAL: Also invalidate all phase-specific application caches
      // This ensures candidates see the updated processing_mode when employer changes it
      queryClient.invalidateQueries({ queryKey: ["typing-test-application"] });
      queryClient.invalidateQueries({ queryKey: ["quiz-application"] });
      queryClient.invalidateQueries({ queryKey: ["video-intro-application"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-application"] });
      queryClient.invalidateQueries({ queryKey: ["chat-simulation-application"] });
      queryClient.invalidateQueries({ queryKey: ["chat-interview-application"] });
      queryClient.invalidateQueries({ queryKey: ["sales-simulation-application"] });
      queryClient.invalidateQueries({ queryKey: ["voice-interview-application"] });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      
      // CRITICAL: Invalidate application detail queries too (for ApplicantDetails page)
      // This ensures the mode badge updates in real-time when employer toggles processing_mode
      queryClient.invalidateQueries({ queryKey: ["application"] });
    },
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: existingJob } = await supabase
        .from("jobs")
        .select("id, employer_id, status")
        .eq("id", id)
        .maybeSingle();

      const { error } = await supabase.from("jobs").delete().eq("id", id);
      if (error) throw error;

      if (existingJob?.status === "published") {
        notifyGoogleJobIndexingInBackground({
          jobId: id,
          employerId: existingJob.employer_id,
          notificationType: "URL_DELETED",
          reason: "job_deleted",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      // CRITICAL: Invalidate subscription to update job count in usage limits
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
    },
  });
}
