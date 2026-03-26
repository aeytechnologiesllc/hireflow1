import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type Interview = Tables<"interviews">;
export type InterviewInsert = TablesInsert<"interviews">;

export interface InterviewWithDetails extends Interview {
  applications: {
    id: string;
    candidate_id: string;
    jobs: Tables<"jobs"> | null;
    profiles: Tables<"profiles"> | null;
  } | null;
}

export function useInterviews() {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ["interviews", user?.id, role],
    queryFn: async () => {
      // Fetch interviews with applications and jobs
      const { data: interviews, error: intError } = await supabase
        .from("interviews")
        .select(`
          *,
          applications(
            id,
            candidate_id,
            jobs(*)
          )
        `)
        .order("scheduled_at", { ascending: true });

      if (intError) throw intError;

      if (!interviews || interviews.length === 0) {
        return [] as InterviewWithDetails[];
      }

      // Filter based on role
      const filtered = (interviews as InterviewWithDetails[]).filter((interview) => {
        if (role === "employer") {
          return interview.applications?.jobs?.employer_id === user!.id;
        } else {
          return interview.applications?.candidate_id === user!.id;
        }
      });

      if (filtered.length === 0) {
        return [] as InterviewWithDetails[];
      }

      // Get unique candidate IDs
      const candidateIds = [...new Set(filtered.map((i) => i.applications?.candidate_id).filter(Boolean))];

      // Fetch profiles for all candidates
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .in("user_id", candidateIds);

      if (profileError) throw profileError;

      // Map profiles to interviews
      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

      return filtered.map((interview) => ({
        ...interview,
        applications: interview.applications ? {
          ...interview.applications,
          profiles: profileMap.get(interview.applications.candidate_id) || null,
        } : null,
      })) as InterviewWithDetails[];
    },
    enabled: !!user,
  });
}

export function useUpcomingInterviews() {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ["interviews", "upcoming", user?.id, role],
    queryFn: async () => {
      const now = new Date().toISOString();
      
      const { data: interviews, error: intError } = await supabase
        .from("interviews")
        .select(`
          *,
          applications(
            id,
            candidate_id,
            jobs(*)
          )
        `)
        .eq("status", "scheduled")
        .gte("scheduled_at", now)
        .order("scheduled_at", { ascending: true });

      if (intError) throw intError;

      if (!interviews || interviews.length === 0) {
        return [] as InterviewWithDetails[];
      }

      // Filter based on role
      const filtered = (interviews as InterviewWithDetails[]).filter((interview) => {
        if (role === "employer") {
          return interview.applications?.jobs?.employer_id === user!.id;
        } else {
          return interview.applications?.candidate_id === user!.id;
        }
      });

      if (filtered.length === 0) {
        return [] as InterviewWithDetails[];
      }

      // Get unique candidate IDs
      const candidateIds = [...new Set(filtered.map((i) => i.applications?.candidate_id).filter(Boolean))];

      // Fetch profiles
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .in("user_id", candidateIds);

      if (profileError) throw profileError;

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

      return filtered.map((interview) => ({
        ...interview,
        applications: interview.applications ? {
          ...interview.applications,
          profiles: profileMap.get(interview.applications.candidate_id) || null,
        } : null,
      })) as InterviewWithDetails[];
    },
    enabled: !!user,
  });
}

export function useCreateInterview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (interview: InterviewInsert) => {
      const { data, error } = await supabase
        .from("interviews")
        .insert(interview)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
    },
  });
}

export function useUpdateInterview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Interview> & { id: string }) => {
      const { data, error } = await supabase
        .from("interviews")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
    },
  });
}

export function useDeleteInterview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("interviews")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
    },
  });
}
