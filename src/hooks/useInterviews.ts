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
      const { data, error } = await supabase
        .from("interviews")
        .select(`
          *,
          applications(
            id,
            candidate_id,
            jobs(*),
            profiles:candidate_id(*)
          )
        `)
        .order("scheduled_at", { ascending: true });

      if (error) throw error;
      
      // Filter based on role
      const filtered = (data as any[]).filter((interview) => {
        if (role === "employer") {
          return interview.applications?.jobs?.employer_id === user!.id;
        } else {
          return interview.applications?.candidate_id === user!.id;
        }
      });

      return filtered as InterviewWithDetails[];
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
      
      const { data, error } = await supabase
        .from("interviews")
        .select(`
          *,
          applications(
            id,
            candidate_id,
            jobs(*),
            profiles:candidate_id(*)
          )
        `)
        .eq("status", "scheduled")
        .gte("scheduled_at", now)
        .order("scheduled_at", { ascending: true });

      if (error) throw error;
      
      const filtered = (data as any[]).filter((interview) => {
        if (role === "employer") {
          return interview.applications?.jobs?.employer_id === user!.id;
        } else {
          return interview.applications?.candidate_id === user!.id;
        }
      });

      return filtered as InterviewWithDetails[];
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
