import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function useUnreadMessagesCount() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();

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

  // Clear count indicator when visiting messages page (messages get marked as read there)
  useEffect(() => {
    if (location.pathname === "/messages") {
      // The messages page handles marking messages as read
      // Just refetch after a short delay to reflect the change
      const timeout = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["unread-messages-count", user?.id] });
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [location.pathname, queryClient, user?.id]);

  return query;
}
