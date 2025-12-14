import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type TeamInvitation = Tables<"team_invitations">;
export type TeamInvitationInsert = TablesInsert<"team_invitations">;

export function useTeamInvitations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["team-invitations", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_invitations")
        .select("*")
        .eq("inviter_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as TeamInvitation[];
    },
    enabled: !!user,
  });
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (email: string) => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      const { data, error } = await supabase
        .from("team_invitations")
        .insert({
          inviter_id: user!.id,
          invitee_email: email,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-invitations"] });
    },
  });
}

export function useUpdateInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data, error } = await supabase
        .from("team_invitations")
        .update({ status: status as any })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-invitations"] });
    },
  });
}
