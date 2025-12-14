import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type Job = Tables<"jobs">;
export type JobInsert = TablesInsert<"jobs">;

export interface JobWithApplicationCount extends Job {
  application_count: number;
}

export function useEmployerJobs() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["jobs", "employer", user?.id],
    queryFn: async () => {
      // Get jobs
      const { data: jobs, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("employer_id", user!.id)
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
    enabled: !!user,
  });
}

export function useJob(id: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["jobs", "single", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data as Job;
    },
    enabled: !!user && !!id,
  });
}

export function usePublishedJobs() {
  return useQuery({
    queryKey: ["jobs", "published"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("status", "published")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Job[];
    },
  });
}

export function useJobStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["jobs", "stats", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("status")
        .eq("employer_id", user!.id);

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
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (job: Omit<JobInsert, "employer_id">) => {
      const { data, error } = await supabase
        .from("jobs")
        .insert({ ...job, employer_id: user!.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useUpdateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Job> & { id: string }) => {
      const { data, error } = await supabase
        .from("jobs")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("jobs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}
