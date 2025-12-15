import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface TeamMemberPermissions {
  isTeamMember: boolean;
  employerId: string | null;
  permissionLevel: string | null;
  canCreateJobs: boolean;
  canDeleteJobs: boolean;
  canMessageCandidates: boolean;
  canManagePipeline: boolean;
  canScheduleInterviews: boolean;
  canSendDocuments: boolean;
  assignedJobIds: string[];
}

const defaultPermissions: TeamMemberPermissions = {
  isTeamMember: false,
  employerId: null,
  permissionLevel: null,
  canCreateJobs: false,
  canDeleteJobs: false,
  canMessageCandidates: false,
  canManagePipeline: false,
  canScheduleInterviews: false,
  canSendDocuments: false,
  assignedJobIds: [],
};

export function useTeamMemberPermissions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["team-member-permissions", user?.id],
    queryFn: async (): Promise<TeamMemberPermissions> => {
      if (!user) return defaultPermissions;

      const { data, error } = await supabase
        .from("team_members")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (error) {
        console.error("Error fetching team member permissions:", error);
        return defaultPermissions;
      }

      if (!data) return defaultPermissions;

      return {
        isTeamMember: true,
        employerId: data.employer_id,
        permissionLevel: data.permission_level,
        canCreateJobs: data.can_create_jobs ?? false,
        canDeleteJobs: data.can_delete_jobs ?? false,
        canMessageCandidates: data.can_message_candidates ?? true,
        canManagePipeline: data.can_manage_pipeline ?? true,
        canScheduleInterviews: data.can_schedule_interviews ?? true,
        canSendDocuments: data.can_send_documents ?? true,
        assignedJobIds: data.assigned_job_ids ?? [],
      };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Helper to check if a job is accessible to the team member
export function useCanAccessJob(jobId: string | undefined) {
  const { data: permissions } = useTeamMemberPermissions();
  
  if (!permissions?.isTeamMember) return true; // Not a team member, regular employer rules apply
  if (!jobId) return false;
  if (permissions.assignedJobIds.length === 0) return true; // No job restrictions
  
  return permissions.assignedJobIds.includes(jobId);
}
