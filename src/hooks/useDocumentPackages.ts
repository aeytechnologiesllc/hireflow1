import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { notifyDocumentSent } from "@/utils/emailNotifications";

export interface DocumentPackage {
  id: string;
  application_id: string;
  employer_id: string;
  candidate_id: string;
  name: string;
  status: "draft" | "sent" | "partially_completed" | "completed";
  sent_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentPackageWithDetails extends DocumentPackage {
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
  documents_count: number;
  document_requests_count: number;
  signed_documents_count: number;
  uploaded_requests_count: number;
}

export interface PackageItem {
  type: "document" | "request";
  id: string;
  name: string;
  document_type: string;
  status: string;
  created_at: string;
}

export function useDocumentPackages() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["document-packages", user?.id, role],
    queryFn: async () => {
      // Fetch packages
      const { data: packages, error } = await supabase
        .from("document_packages")
        .select(`
          *,
          applications(
            id,
            candidate_id,
            jobs(id, title, employer_id)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!packages || packages.length === 0) return [] as DocumentPackageWithDetails[];

      // Get unique candidate IDs
      const candidateIds = [...new Set(packages.map((p) => p.candidate_id))];
      const packageIds = packages.map((p) => p.id);

      // Fetch candidate profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, avatar_url")
        .in("user_id", candidateIds);

      // Fetch document counts per package
      const { data: documentCounts } = await supabase
        .from("documents")
        .select("package_id, status")
        .in("package_id", packageIds);

      // Fetch document request counts per package
      const { data: requestCounts } = await supabase
        .from("document_requests")
        .select("package_id, status")
        .in("package_id", packageIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

      // Count documents and requests per package
      const docCountMap = new Map<string, { total: number; signed: number }>();
      const reqCountMap = new Map<string, { total: number; uploaded: number }>();

      documentCounts?.forEach((doc) => {
        if (!doc.package_id) return;
        const current = docCountMap.get(doc.package_id) || { total: 0, signed: 0 };
        current.total++;
        if (doc.status === "signed") current.signed++;
        docCountMap.set(doc.package_id, current);
      });

      requestCounts?.forEach((req) => {
        if (!req.package_id) return;
        const current = reqCountMap.get(req.package_id) || { total: 0, uploaded: 0 };
        current.total++;
        if (req.status === "submitted" || req.status === "reviewed" || req.status === "approved") {
          current.uploaded++;
        }
        reqCountMap.set(req.package_id, current);
      });

      return packages.map((pkg) => ({
        ...pkg,
        candidate_profile: profileMap.get(pkg.candidate_id) || null,
        documents_count: docCountMap.get(pkg.id)?.total || 0,
        document_requests_count: reqCountMap.get(pkg.id)?.total || 0,
        signed_documents_count: docCountMap.get(pkg.id)?.signed || 0,
        uploaded_requests_count: reqCountMap.get(pkg.id)?.uploaded || 0,
      })) as DocumentPackageWithDetails[];
    },
    enabled: !!user,
  });

  // Real-time subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("document-packages-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "document_packages",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["document-packages"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  return query;
}

export function useDocumentPackage(packageId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["document-package", packageId],
    queryFn: async () => {
      if (!packageId) return null;

      const { data: pkg, error } = await supabase
        .from("document_packages")
        .select(`
          *,
          applications(
            id,
            candidate_id,
            jobs(id, title, employer_id)
          )
        `)
        .eq("id", packageId)
        .single();

      if (error) throw error;

      // Get candidate profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, avatar_url")
        .eq("user_id", pkg.candidate_id)
        .single();

      // Get documents in this package
      const { data: documents } = await supabase
        .from("documents")
        .select("id, name, document_type, status, created_at")
        .eq("package_id", packageId);

      // Get document requests in this package
      const { data: requests } = await supabase
        .from("document_requests")
        .select("id, document_type, custom_document_name, status, created_at")
        .eq("package_id", packageId);

      const items: PackageItem[] = [
        ...(documents?.map((d) => ({
          type: "document" as const,
          id: d.id,
          name: d.name,
          document_type: d.document_type || "custom",
          status: d.status,
          created_at: d.created_at,
        })) || []),
        ...(requests?.map((r) => ({
          type: "request" as const,
          id: r.id,
          name: r.custom_document_name || r.document_type,
          document_type: r.document_type,
          status: r.status,
          created_at: r.created_at,
        })) || []),
      ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      return {
        ...pkg,
        candidate_profile: profile || null,
        items,
      };
    },
    enabled: !!user && !!packageId,
  });
}

export function useCreateDocumentPackage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      application_id: string;
      employer_id: string;
      candidate_id: string;
      name?: string;
    }) => {
      const { data: pkg, error } = await supabase
        .from("document_packages")
        .insert({
          application_id: data.application_id,
          employer_id: data.employer_id,
          candidate_id: data.candidate_id,
          name: data.name || "Hiring Package",
          status: "draft",
        })
        .select()
        .single();

      if (error) throw error;
      return pkg;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-packages"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create package.",
        variant: "destructive",
      });
    },
  });
}

export function useUpdateDocumentPackage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<DocumentPackage> & { id: string }) => {
      const { data, error } = await supabase
        .from("document_packages")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["document-packages"] });
      queryClient.invalidateQueries({ queryKey: ["document-package", variables.id] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update package.",
        variant: "destructive",
      });
    },
  });
}

export function useSendDocumentPackage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (packageId: string) => {
      // Get package details
      const { data: pkg, error: pkgError } = await supabase
        .from("document_packages")
        .select("*, applications(candidate_id, jobs(title, employer_id))")
        .eq("id", packageId)
        .single();

      if (pkgError) throw pkgError;

      // Update package status to sent
      const { error: updateError } = await supabase
        .from("document_packages")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", packageId);

      if (updateError) throw updateError;

      // Count items in package
      const { count: docCount } = await supabase
        .from("documents")
        .select("*", { count: "exact", head: true })
        .eq("package_id", packageId);

      const { count: reqCount } = await supabase
        .from("document_requests")
        .select("*", { count: "exact", head: true })
        .eq("package_id", packageId);

      const totalItems = (docCount || 0) + (reqCount || 0);
      const jobTitle = (pkg.applications as { jobs?: { title?: string; employer_id?: string } | null } | null)?.jobs?.title || "the position";

      // Create notification for candidate
      await supabase.from("notifications").insert({
        user_id: pkg.candidate_id,
        type: "system",
        title: "Hiring Document Package",
        message: `Congratulations! You have received a hiring document package for ${jobTitle} with ${totalItems} item${totalItems !== 1 ? "s" : ""} to complete.`,
        link: "/documents",
        is_read: false,
      });

      // Send email notification asynchronously
      (async () => {
        try {
          const employerId = (pkg.applications as { jobs?: { title?: string; employer_id?: string } | null } | null)?.jobs?.employer_id;
          if (employerId) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("company_name")
              .eq("user_id", employerId)
              .single();

            notifyDocumentSent(pkg.candidate_id, pkg.name || "Hiring Package", profile?.company_name);
          }
        } catch (err) {
          console.error("Failed to send document package email notification:", err);
        }
      })();

      return pkg;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-packages"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document-requests"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast({
        title: "Package Sent",
        description: "The hiring document package has been sent to the candidate.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send package.",
        variant: "destructive",
      });
    },
  });
}

export function useDeleteDocumentPackage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("document_packages")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-packages"] });
      toast({
        title: "Deleted",
        description: "Document package has been deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete package.",
        variant: "destructive",
      });
    },
  });
}
