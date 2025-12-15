import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface TeamMember {
  id: string;
  user_id: string;
  employer_id: string;
  invitation_id: string | null;
  name: string | null;
  email: string;
  department: string | null;
  permission_level: string;
  can_create_jobs: boolean;
  can_delete_jobs: boolean;
  can_message_candidates: boolean;
  can_manage_pipeline: boolean;
  can_schedule_interviews: boolean;
  can_send_documents: boolean;
  assigned_job_ids: string[];
  status: string;
  joined_at: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useTeamMembers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["team-members", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("*")
        .eq("employer_id", user!.id)
        .order("joined_at", { ascending: false });

      if (error) throw error;
      return data as TeamMember[];
    },
    enabled: !!user,
  });
}

export function useUpdateTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Omit<TeamMember, "id" | "user_id" | "employer_id" | "created_at" | "updated_at">>;
    }) => {
      const { data, error } = await supabase
        .from("team_members")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
  });
}

export function useRevokeTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("team_members")
        .update({ 
          status: "revoked",
          revoked_at: new Date().toISOString()
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
  });
}

export function useDeleteTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
  });
}

// Hook to check if current user is a team member and get their membership
export function useCurrentTeamMembership() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["current-team-membership", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("*")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .maybeSingle();

      if (error) throw error;
      return data as TeamMember | null;
    },
    enabled: !!user,
  });
}
