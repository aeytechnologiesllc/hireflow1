import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

declare global {
  interface Window {
    NativelyNotifications?: new () => {
      requestPermission: (fallbackToSettings: boolean, callback: (resp: { status: boolean }) => void) => void;
      setExternalId: (options: { externalId: string }, callback: (resp: { status: boolean }) => void) => void;
      getOneSignalId: (callback: (resp: { playerId: string | null }) => void) => void;
    };
  }
}

export function usePushNotifications() {
  const { user } = useAuth();

  const registerDevice = useCallback(async () => {
    if (!user || !window.NativelyNotifications) return;

    try {
      const notifications = new window.NativelyNotifications();

      // Request permission
      notifications.requestPermission(false, (permResp) => {
        if (!permResp.status) {
          console.log("[Push] Permission denied");
          return;
        }

        console.log("[Push] Permission granted");

        // Set external user ID for OneSignal (maps to our auth user ID)
        notifications.setExternalId({ externalId: user.id }, (extResp) => {
          console.log("[Push] External user ID set:", extResp.status);
        });

        // Get the OneSignal player/subscription ID and store it
        notifications.getOneSignalId(async (idResp) => {
          const playerId = idResp.playerId;
          if (!playerId) {
            console.log("[Push] No player ID available yet");
            return;
          }

          console.log("[Push] Player ID:", playerId);

          // Upsert into push_subscriptions
          const { error } = await (supabase as any)
            .from("push_subscriptions")
            .upsert(
              {
                user_id: user.id,
                player_id: playerId,
                platform: "ios",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id,player_id" }
            );

          if (error) {
            console.error("[Push] Failed to store subscription:", error);
          } else {
            console.log("[Push] Subscription registered successfully");
          }
        });
      });
    } catch (err) {
      console.error("[Push] Registration error:", err);
    }
  }, [user]);

  // Auto-register on login when running in Natively
  useEffect(() => {
    if (user && window.NativelyNotifications) {
      // Small delay to let Natively bridge initialize
      const timer = setTimeout(registerDevice, 1500);
      return () => clearTimeout(timer);
    }
  }, [user, registerDevice]);

  const sendTestNotification = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("send-test-push");
    if (error) throw error;
    return data;
  }, []);

  return { registerDevice, sendTestNotification };
}
