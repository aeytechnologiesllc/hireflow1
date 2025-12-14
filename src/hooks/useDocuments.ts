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
      const { data, error } = await supabase
        .from("documents")
        .select(`
          *,
          applications(
            id,
            candidate_id,
            jobs(*),
            profiles:candidate_id(*)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Filter based on role
      const filtered = (data as any[]).filter((doc) => {
        if (role === "employer") {
          return doc.applications?.jobs?.employer_id === user!.id;
        } else {
          return doc.applications?.candidate_id === user!.id;
        }
      });

      return filtered as DocumentWithApplication[];
    },
    enabled: !!user,
  });
}
