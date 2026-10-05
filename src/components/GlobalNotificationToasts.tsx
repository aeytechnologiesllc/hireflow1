import { useEffect, useId, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { createIntegrityToastGate, parseIntegrityCard, type IntegrityCardRow, type IntegrityToast } from "@/cockpit/lib/assessmentRecord";

/**
 * One per tab, shared by every mount: decides which writes of the owner's
 * integrity card are a new flag (docs/ASSESSMENT-RECORD.md §4.4). Module
 * scope, so a second mount (or React's dev double-mount) and a message the
 * socket delivers twice still toast each update once.
 */
const integrityToasts = createIntegrityToastGate();

/** The integrity cards as they stand, read when the channel (re)joins: the
 *  next update is then compared with what the card said, so the toast can
 *  say what is new ("left the window … (3rd time)"). Before the migration
 *  the column and the type do not exist; that error just means no cards. */
async function seedIntegrityCards(userId: string) {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, message, link, group_key, is_read, created_at")
    .eq("user_id", userId)
    .eq("type", "integrity")
    .order("created_at", { ascending: false })
    .limit(200);
  if (!error && Array.isArray(data)) integrityToasts.seed(data as IntegrityCardRow[]);
}

/**
 * GlobalNotificationToasts - Listens for new notifications and shows toasts globally
 * Mount this component once in AppLayout to get real-time notification popups
 */
export function GlobalNotificationToasts() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Per-instance topic, same reason as useMessages/useEmployerLiveSync: each
  // layout mounts this once, but realtime-js returns the SAME channel for a
  // repeated topic, so any second mount would break the first one's join.
  const instanceId = useId();
  // `navigate` changes on every route change (react-router 6 rebuilds it from
  // the pathname). With it in the effect's deps the channel was torn down and
  // reopened on every navigation, and reopening the same topic picks up the
  // channel that is still leaving, so toasts could stop after one page change.
  // Read it through a ref instead; the channel now lives as long as the layout.
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    // Don't show toast notifications for candidates - they have the notifications page
    if (!user?.id || role === "candidate") return;
    const userId = user.id;

    // Clean up previous channel if exists
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    /** One integrity flag (or batch of them): the same card, one toast. */
    const showIntegrity = (t: IntegrityToast) => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast(t.title, {
        id: t.id,
        description: t.description,
        action: {
          label: "View",
          onClick: () => navigateRef.current(t.link),
        },
        duration: 8000,
      });
    };

    const channel = supabase
      .channel(`global-notifications-${userId}-${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const notification = payload.new as {
            id: string;
            title: string;
            message: string;
            link: string | null;
            type: string;
            group_key?: string | null;
            is_read?: boolean | null;
            created_at?: string | null;
          };

          // Invalidate notifications query to update counts
          queryClient.invalidateQueries({ queryKey: ["notifications"] });

          // A "New application" (type 'application', from the submit trigger)
          // or any note that links to an applicant means the applicant list
          // changed too. Refetch it now, so the toast's View lands on a list
          // that already has them instead of "I can't find that applicant".
          // useEmployerLiveSync normally gets there first; this covers a
          // moment when its channel is down or rejoining.
          if (notification.type === "application" || notification.link?.startsWith("/applicants")) {
            queryClient.invalidateQueries({ queryKey: ["applications"] });
          }

          // An applicant's first flag in a test creates their integrity card:
          // said as what they did, and opening that test's timeline. A card
          // the gate holds back (already shown, already read) shows nothing.
          if (parseIntegrityCard(notification)) {
            const t = integrityToasts.consider("INSERT", notification);
            if (t) showIntegrity(t);
            return;
          }

          // Determine toast type based on notification type
          const toastType = notification.type === "interview" ? "info" : "default";

          // Show toast with action if link exists
          if (notification.link) {
            const targetLink = notification.link;

            const handleViewClick = () => {
              navigateRef.current(targetLink);
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
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // Every later flag UPDATEs the same card (new tally, unread again,
          // moved to the top). One toast per new batch; a mark-as-read, an
          // older write or one already shown is not a flag.
          const t = integrityToasts.consider("UPDATE", payload.new as IntegrityCardRow);
          if (t) showIntegrity(t);
        }
      )
      .subscribe((status) => {
        // On every (re)join: what the cards say now, for the next update.
        if (status === "SUBSCRIBED") void seedIntegrityCards(userId).catch(() => undefined);
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user?.id, role, queryClient, instanceId]);

  // This component renders nothing - it's purely for side effects
  return null;
}
