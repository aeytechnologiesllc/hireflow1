import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useEmployerPendingDocumentsCount() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["employer-pending-documents-count", user?.id, role],
    queryFn: async () => {
      if (role !== "employer") return 0;

      // Get all jobs for this employer
      const { data: jobs, error: jobsError } = await supabase
        .from("jobs")
        .select("id")
        .eq("employer_id", user!.id);

      if (jobsError) throw jobsError;
      if (!jobs || jobs.length === 0) return 0;

      const jobIds = jobs.map(j => j.id);

      // Get all applications for these jobs
      const { data: applications, error: appError } = await supabase
        .from("applications")
        .select("id")
        .in("job_id", jobIds);

      if (appError) throw appError;
      if (!applications || applications.length === 0) return 0;

      const applicationIds = applications.map(a => a.id);

      // Count documents that:
      // 1. Are pending status
      // 2. Candidate HAS signed (candidate_signed_at is not null)
      // 3. Employer has NOT signed yet (employer_signed_at is null)
      // This means only documents awaiting the employer's countersignature are counted
      const { count: docCount, error: docError } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .in("application_id", applicationIds)
        .eq("status", "pending")
        .not("candidate_signed_at", "is", null)
        .is("employer_signed_at", null);

      if (docError) throw docError;

      // Also count document requests that have been submitted (received from candidates)
      const { count: requestCount, error: reqError } = await supabase
        .from("document_requests")
        .select("id", { count: "exact", head: true })
        .eq("employer_id", user!.id)
        .eq("status", "submitted");

      if (reqError) throw reqError;

      return (docCount || 0) + (requestCount || 0);
    },
    enabled: !!user && role === "employer",
  });

  // Real-time subscription for document and document_requests changes
  useEffect(() => {
    if (!user || role !== "employer") return;

    const channel = supabase
      .channel("employer-documents-count-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "documents",
        },
        () => {
          // Invalidate the count query when any document changes
          queryClient.invalidateQueries({ queryKey: ["employer-pending-documents-count"] });
          queryClient.invalidateQueries({ queryKey: ["documents"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "document_requests",
        },
        () => {
          // Invalidate when document requests change (e.g., candidate uploads)
          queryClient.invalidateQueries({ queryKey: ["employer-pending-documents-count"] });
          queryClient.invalidateQueries({ queryKey: ["document-requests"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, role, queryClient]);

  return query;
}
