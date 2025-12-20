import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ApplicationForDocument {
  id: string;
  candidate_id: string;
  profiles: {
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  } | null;
  jobs: {
    id: string;
    title: string;
  } | null;
}

export function useApplicationsForDocuments() {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ["applications-for-documents", user?.id],
    queryFn: async () => {
      if (role !== "employer") return [];

      // First get applications for employer's jobs
      const { data: jobs, error: jobsError } = await supabase
        .from("jobs")
        .select("id")
        .eq("employer_id", user!.id);

      if (jobsError) throw jobsError;
      if (!jobs || jobs.length === 0) return [];

      const jobIds = jobs.map(j => j.id);

      // Get applications with just the basic info
      const { data: applications, error: appsError } = await supabase
        .from("applications")
        .select(`
          id,
          candidate_id,
          job_id
        `)
        .in("job_id", jobIds)
        .in("status", ["pending", "in_progress", "reviewing", "interview", "offered", "hired"]);

      if (appsError) throw appsError;
      if (!applications || applications.length === 0) return [];

      // Get candidate profiles
      const candidateIds = [...new Set(applications.map(a => a.candidate_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, avatar_url")
        .in("user_id", candidateIds);

      if (profilesError) throw profilesError;

      // Get job titles
      const { data: jobDetails, error: jobDetailsError } = await supabase
        .from("jobs")
        .select("id, title")
        .in("id", jobIds);

      if (jobDetailsError) throw jobDetailsError;

      // Map everything together
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      const jobMap = new Map(jobDetails?.map(j => [j.id, j]) || []);

      return applications.map(app => ({
        id: app.id,
        candidate_id: app.candidate_id,
        profiles: profileMap.get(app.candidate_id) || null,
        jobs: jobMap.get(app.job_id) || null,
      })) as ApplicationForDocument[];
    },
    enabled: !!user && role === "employer",
  });
}
