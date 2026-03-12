import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

declare global {
  interface Window {
    natively?: {
      notifications: {
        getPermissionStatus: (callback: (status: string) => void) => void;
        requestPermission: (callback: (granted: boolean) => void) => void;
      };
      onesignal: {
        setExternalUserId: (userId: string, callback?: (success: boolean) => void) => void;
        getPlayerId: (callback: (playerId: string | null) => void) => void;
      };
    };
  }
}

export function usePushNotifications() {
  const { user } = useAuth();

  const registerDevice = useCallback(async () => {
    if (!user || !window.natively) return;

    try {
      // Request permission
      window.natively.notifications.requestPermission((granted) => {
        if (!granted) {
          console.log("[Push] Permission denied");
          return;
        }

        // Set external user ID for OneSignal (maps to our auth user ID)
        window.natively.onesignal.setExternalUserId(user.id, (success) => {
          console.log("[Push] External user ID set:", success);
        });

        // Get the player ID and store it
        window.natively.onesignal.getPlayerId(async (playerId) => {
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
    if (user && window.natively) {
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
