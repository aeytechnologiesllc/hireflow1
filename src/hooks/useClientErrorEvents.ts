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

// src/integrations/supabase/types.ts is generated FROM THE LIVE DATABASE
// (see that file's own header) and this repo's guardrails forbid running a
// live migration from here, so client_error_events/page_view_daily (added
// by 20260916165000_client_error_events_and_page_views.sql) can't be in it
// yet. Once that migration is applied live, re-run
// `npx supabase gen types typescript` and this cast goes away — RLS (the
// "Developers can view client error events" policy) is what actually gates
// access either way, not this type.
const db = supabase as unknown as {
  from(table: "client_error_events"): {
    select: (cols: string) => {
      order: (col: string, opts: { ascending: boolean }) => Promise<{ data: ClientErrorEvent[] | null; error: unknown }>;
    };
  };
};

export function useClientErrorEvents() {
  const { role } = useAuth();
  const isDeveloper = (role as string) === "developer";

  return useQuery({
    queryKey: ["developer-client-error-events"],
    queryFn: async (): Promise<ClientErrorEvent[]> => {
      const { data, error } = await db
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
