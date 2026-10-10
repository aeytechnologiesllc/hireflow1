import { useEffect, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSchemaMode } from "@/hooks/useSchemaMode";
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
  const { data: mode } = useSchemaMode();

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
      const filtered = (documents as DocumentWithApplication[]).filter((doc) => {
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
    enabled: !!user && mode === "hireflow1",
  });
}

/**
 * Keeps the applicant's documents live (2026-10-10, the owner: both sides
 * update without a refresh): the team countersigning, withdrawing or sending
 * a letter refreshes Your documents at once. Mount it once, on the page that
 * lists them. The topic carries useId() so a second mount never shares (and
 * breaks) the first one's channel; RLS limits delivery to their own rows.
 */
export function useDocumentsLive() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const instanceId = useId();
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ queryKey: ["documents"] });
      }, 250);
    };
    const channel = supabase
      .channel(`my-documents-${userId}-${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, refresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [userId, instanceId, queryClient]);
}
