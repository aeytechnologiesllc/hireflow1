import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type Application = Tables<"applications">;
export type ApplicationInsert = TablesInsert<"applications">;

export interface ApplicationWithJob extends Application {
  jobs: Tables<"jobs"> | null;
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
      return data as ApplicationWithJob[];
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
      const filtered = (applications as any[]).filter(
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

      const myApps = (data as any[]).filter(
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
      const { data, error } = await supabase
        .from("applications")
        .insert({ ...application, candidate_id: user!.id })
        .select()
        .single();

      if (error) throw error;
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
      const { data, error } = await supabase
        .from("applications")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
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
