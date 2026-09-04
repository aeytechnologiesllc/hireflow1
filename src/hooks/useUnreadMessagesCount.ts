import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export function useUnreadMessagesCount() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["unread-messages-count", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;

      const { count, error } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("receiver_id", user.id)
        .eq("is_read", false);

      if (error) {
        console.error("Error fetching unread messages count:", error);
        return 0;
      }

      return count || 0;
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  // Real-time subscription for messages
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("unread-messages-count")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          // Only invalidate if this message involves the current user
          const newRecord = payload.new as { receiver_id?: string; sender_id?: string } | null;
          const oldRecord = payload.old as { receiver_id?: string; sender_id?: string } | null;
          
          if (
            newRecord?.receiver_id === user.id ||
            newRecord?.sender_id === user.id ||
            oldRecord?.receiver_id === user.id ||
            oldRecord?.sender_id === user.id
          ) {
            queryClient.invalidateQueries({ queryKey: ["unread-messages-count", user.id] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Nothing here marks messages read. Landing on /messages used to mark every
  // unread message read at once — including threads the reader never opened —
  // so a second candidate's note went quiet the moment you looked at a first.
  // The page marks a thread read only when that thread is actually on screen.

  return query;
}
