import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

/**
 * GlobalNotificationToasts - Listens for new notifications and shows toasts globally
 * Mount this component once in AppLayout to get real-time notification popups
 */
export function GlobalNotificationToasts() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    // Don't show toast notifications for candidates - they have the notifications page
    if (!user?.id || role === "candidate") return;

    // Clean up previous channel if exists
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`global-notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const notification = payload.new as {
            id: string;
            title: string;
            message: string;
            link: string | null;
            type: string;
          };

          console.log("New notification received:", notification);

          // Invalidate notifications query to update counts
          queryClient.invalidateQueries({ queryKey: ["notifications"] });

          // Determine toast type based on notification type
          const toastType = notification.type === "interview" ? "info" : "default";

          // Show toast with action if link exists
          if (notification.link) {
            const targetLink = notification.link;
            
            const handleViewClick = () => {
              navigate(targetLink);
            };
            
            if (toastType === "info") {
              toast.info(notification.title, {
                description: notification.message,
                action: {
                  label: "View",
                  onClick: handleViewClick,
                },
                duration: 8000,
              });
            } else {
              toast(notification.title, {
                description: notification.message,
                action: {
                  label: "View",
                  onClick: handleViewClick,
                },
                duration: 8000,
              });
            }
          } else {
            if (toastType === "info") {
              toast.info(notification.title, {
                description: notification.message,
                duration: 6000,
              });
            } else {
              toast(notification.title, {
                description: notification.message,
                duration: 6000,
              });
            }
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user?.id, role, navigate, queryClient]);

  // This component renders nothing - it's purely for side effects
  return null;
}
