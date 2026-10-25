import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { waitingOnApplicant } from "@/lib/applicantDocumentTurn";

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
      if (!applications || applications.length === 0) {
        // Still check for unseen document requests even without applications
        const { count: requestCount, error: reqError } = await supabase
          .from("document_requests")
          .select("id", { count: "exact", head: true })
          .eq("candidate_id", user!.id)
          .eq("status", "pending")
          .is("candidate_viewed_at", null);

        if (reqError) throw reqError;
        return requestCount || 0;
      }

      const applicationIds = applications.map(a => a.id);

      // Count both unsigned documents AND pending document requests
      const [docResult, requestResult] = await Promise.all([
        // Documents waiting on the candidate: pending, not signed by them yet,
        // not withdrawn (a withdrawn document is still status='pending', see
        // document-signing's "withdraw" action), and still in time. The date
        // is read here by the same rule as My Documents' "To sign"
        // (waitingOnApplicant; the eighth product review: an expired letter
        // was counted, though signing it only answers "This document has
        // expired").
        supabase
          .from("documents")
          .select("id, status, candidate_signed_at, is_voided, expires_at")
          .in("application_id", applicationIds)
          .eq("status", "pending")
          .is("candidate_signed_at", null)
          .eq("is_voided", false),
        // Count pending document requests for this candidate that haven't been viewed yet
        supabase
          .from("document_requests")
          .select("id", { count: "exact", head: true })
          .eq("candidate_id", user!.id)
          .eq("status", "pending")
          .is("candidate_viewed_at", null),
      ]);

      if (docResult.error) throw docResult.error;
      if (requestResult.error) throw requestResult.error;

      const now = new Date();
      const waiting = (docResult.data ?? []).filter((d) => waitingOnApplicant(d, now)).length;
      return waiting + (requestResult.count || 0);
    },
    enabled: !!user && role === "candidate",
  });

  // Real-time subscription for document and document_requests changes
  useEffect(() => {
    if (!user || role !== "candidate") return;

    const channel = supabase
      .channel("candidate-documents-count-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "documents",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["pending-documents-count"] });
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
          // Invalidate when document requests change (e.g., new request from employer)
          queryClient.invalidateQueries({ queryKey: ["pending-documents-count"] });
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
