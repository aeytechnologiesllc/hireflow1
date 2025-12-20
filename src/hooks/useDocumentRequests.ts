import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

export interface DocumentRequest {
  id: string;
  application_id: string;
  employer_id: string;
  candidate_id: string;
  document_type: string;
  custom_document_name: string | null;
  description: string | null;
  is_required: boolean;
  due_date: string | null;
  status: "pending" | "submitted" | "reviewed" | "approved" | "rejected";
  file_url: string | null;
  file_name: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRequestWithDetails extends DocumentRequest {
  applications: {
    id: string;
    candidate_id: string;
    jobs: {
      id: string;
      title: string;
      employer_id: string;
    } | null;
  } | null;
  candidate_profile: {
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  } | null;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  drivers_license: "Driver's License",
  ssn_card: "Social Security Card",
  passport: "Passport",
  work_authorization: "Work Authorization",
  tax_form: "Tax Form (W-9/1099)",
  id_card: "Government ID",
  proof_of_address: "Proof of Address",
  bank_details: "Bank Details",
  custom: "Custom Document",
};

export function getDocumentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type] || type.replace(/_/g, " ");
}

export function useDocumentRequests(statusFilter?: string) {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ["document-requests", user?.id, role, statusFilter],
    queryFn: async () => {
      // Fetch document requests
      let query = supabase
        .from("document_requests")
        .select(`
          *,
          applications(
            id,
            candidate_id,
            jobs(id, title, employer_id)
          )
        `)
        .order("created_at", { ascending: false });

      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data: requests, error } = await query;

      if (error) throw error;

      if (!requests || requests.length === 0) {
        return [] as DocumentRequestWithDetails[];
      }

      // Get unique candidate IDs
      const candidateIds = [...new Set(requests.map((r) => r.candidate_id))];

      // Fetch candidate profiles
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, avatar_url")
        .in("user_id", candidateIds);

      if (profileError) throw profileError;

      // Map profiles to requests
      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

      return requests.map((req) => ({
        ...req,
        candidate_profile: profileMap.get(req.candidate_id) || null,
      })) as DocumentRequestWithDetails[];
    },
    enabled: !!user,
  });
}

export function usePendingDocumentRequestsCount() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["pending-document-requests-count", user?.id, role],
    queryFn: async () => {
      if (role === "candidate") {
        // Count pending requests for this candidate
        const { count, error } = await supabase
          .from("document_requests")
          .select("*", { count: "exact", head: true })
          .eq("candidate_id", user!.id)
          .eq("status", "pending");

        if (error) throw error;
        return count || 0;
      } else {
        // Count submitted requests awaiting employer review
        const { count, error } = await supabase
          .from("document_requests")
          .select("*", { count: "exact", head: true })
          .eq("status", "submitted");

        if (error) throw error;
        return count || 0;
      }
    },
    enabled: !!user,
  });

  // Set up realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("document-requests-count")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "document_requests",
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["pending-document-requests-count"],
          });
          queryClient.invalidateQueries({
            queryKey: ["document-requests"],
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  return query;
}

export function useCreateDocumentRequest() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requests: Omit<DocumentRequest, "id" | "created_at" | "updated_at" | "status" | "file_url" | "file_name" | "submitted_at" | "reviewed_at" | "reviewed_by" | "rejection_reason">[]) => {
      const { data, error } = await supabase
        .from("document_requests")
        .insert(requests)
        .select();

      if (error) throw error;

      // Create notifications for each candidate
      const candidateIds = [...new Set(requests.map((r) => r.candidate_id))];
      const documentCount = requests.length;
      const documentWord = documentCount === 1 ? "document" : "documents";

      const notifications = candidateIds.map((candidateId) => ({
        user_id: candidateId,
        type: "system" as const,
        title: "New Document Request",
        message: `You have ${documentCount} new ${documentWord} to upload. Please submit the required documents.`,
        link: "/documents",
        is_read: false,
      }));

      // Insert notifications (don't fail if this errors)
      await supabase.from("notifications").insert(notifications);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-requests"] });
      queryClient.invalidateQueries({ queryKey: ["pending-document-requests-count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast({
        title: "Request Sent",
        description: "Document request has been sent to the candidate.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send document request.",
        variant: "destructive",
      });
    },
  });
}

export function useUpdateDocumentRequest() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<DocumentRequest> & { id: string }) => {
      const { data, error } = await supabase
        .from("document_requests")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-requests"] });
      queryClient.invalidateQueries({ queryKey: ["pending-document-requests-count"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update document request.",
        variant: "destructive",
      });
    },
  });
}

export function useDeleteDocumentRequest() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("document_requests")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-requests"] });
      queryClient.invalidateQueries({ queryKey: ["pending-document-requests-count"] });
      toast({
        title: "Deleted",
        description: "Document request has been deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete document request.",
        variant: "destructive",
      });
    },
  });
}
