import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ClientErrorEvent {
  id: string;
  fingerprint: string;
  message: string;
  stack: string | null;
  route: string;
  release: string | null;
  browser_family: string | null;
  user_role: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
}

export function useClientErrorEvents() {
  const { role } = useAuth();
  const isDeveloper = (role as string) === "developer";

  return useQuery({
    queryKey: ["developer-client-error-events"],
    queryFn: async (): Promise<ClientErrorEvent[]> => {
      const { data, error } = await supabase
        .from("client_error_events")
        .select("id, fingerprint, message, stack, route, release, browser_family, user_role, occurrence_count, first_seen_at, last_seen_at")
        .order("last_seen_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isDeveloper,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}
