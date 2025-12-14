import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";

export type Document = Tables<"documents">;

export interface DocumentWithApplication extends Document {
  applications: {
    id: string;
    candidate_id: string;
    jobs: Tables<"jobs"> | null;
    profiles: Tables<"profiles"> | null;
  } | null;
}

export function useDocuments() {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ["documents", user?.id, role],
    queryFn: async () => {
      // Fetch documents with applications and jobs
      const { data: documents, error: docError } = await supabase
        .from("documents")
        .select(`
          *,
          applications(
            id,
            candidate_id,
            jobs(*)
          )
        `)
        .order("created_at", { ascending: false });

      if (docError) throw docError;

      if (!documents || documents.length === 0) {
        return [] as DocumentWithApplication[];
      }

      // Filter based on role
      const filtered = (documents as any[]).filter((doc) => {
        if (role === "employer") {
          return doc.applications?.jobs?.employer_id === user!.id;
        } else {
          return doc.applications?.candidate_id === user!.id;
        }
      });

      if (filtered.length === 0) {
        return [] as DocumentWithApplication[];
      }

      // Get unique candidate IDs
      const candidateIds = [...new Set(filtered.map((d) => d.applications?.candidate_id).filter(Boolean))];

      // Fetch profiles for all candidates
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .in("user_id", candidateIds);

      if (profileError) throw profileError;

      // Map profiles to documents
      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

      return filtered.map((doc) => ({
        ...doc,
        applications: doc.applications ? {
          ...doc.applications,
          profiles: profileMap.get(doc.applications.candidate_id) || null,
        } : null,
      })) as DocumentWithApplication[];
    },
    enabled: !!user,
  });
}
