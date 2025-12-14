import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type Job = Tables<"jobs">;
export type JobInsert = TablesInsert<"jobs">;

export function useEmployerJobs() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["jobs", "employer", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("employer_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Job[];
    },
    enabled: !!user,
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
