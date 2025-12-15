import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function usePendingDocumentsCount() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["pending-documents-count", user?.id, role],
    queryFn: async () => {
      if (role !== "candidate") return 0;

      // Get all applications for this candidate
      const { data: applications, error: appError } = await supabase
        .from("applications")
        .select("id")
        .eq("candidate_id", user!.id);

      if (appError) throw appError;
      if (!applications || applications.length === 0) return 0;

      const applicationIds = applications.map(a => a.id);

      // Count documents that:
      // 1. Are pending status
      // 2. Candidate has NOT signed yet (candidate_signed_at is null)
      // This means only documents awaiting the candidate's signature are counted
      const { count, error: docError } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .in("application_id", applicationIds)
        .eq("status", "pending")
        .is("candidate_signed_at", null);

      if (docError) throw docError;
      return count || 0;
    },
    enabled: !!user && role === "candidate",
  });

  // Real-time subscription for document changes
  useEffect(() => {
    if (!user || role !== "candidate") return;

    const channel = supabase
      .channel("documents-count-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "documents",
        },
        () => {
          // Invalidate the count query when any document changes
          queryClient.invalidateQueries({ queryKey: ["pending-documents-count"] });
          queryClient.invalidateQueries({ queryKey: ["documents"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, role, queryClient]);

  return query;
}
