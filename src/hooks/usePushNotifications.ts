import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

declare global {
  interface Window {
    nativelyLoaded?: boolean;
    NativelyNotifications?: new () => {
      requestPermission: (fallbackToSettings: boolean, callback: (resp: { status: boolean }) => void) => void;
      getPermissionStatus: (callback: (resp: { status: string }) => void) => void;
      setExternalId: (options: { externalId: string }, callback: (resp: { status: boolean }) => void) => void;
      removeExternalId: (callback: (resp: { status: boolean }) => void) => void;
      getOneSignalId: (callback: (resp: { playerId: string | null }) => void) => void;
    };
  }
}

/** Wait until the Natively SDK script has loaded (max ~5s) */
function waitForNatively(maxMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.NativelyNotifications) {
      resolve(true);
      return;
    }
    const start = Date.now();
    const iv = setInterval(() => {
      if (window.NativelyNotifications) {
        clearInterval(iv);
        resolve(true);
      } else if (Date.now() - start > maxMs) {
        clearInterval(iv);
        resolve(false);
      }
    }, 200);
  });
}

/** Retry getOneSignalId until a player ID is returned */
function pollPlayerId(
  notifications: InstanceType<NonNullable<typeof window.NativelyNotifications>>,
  retries = 10,
  delayMs = 1000
): Promise<string | null> {
  return new Promise((resolve) => {
    let attempt = 0;
    const tryGet = () => {
      notifications.getOneSignalId((resp) => {
        if (resp.playerId) {
          resolve(resp.playerId);
        } else if (++attempt < retries) {
          setTimeout(tryGet, delayMs);
        } else {
          resolve(null);
        }
      });
    };
    tryGet();
  });
}

export function usePushNotifications() {
  const { user } = useAuth();
  const registering = useRef(false);

  const registerDevice = useCallback(async () => {
    if (!user) return;
    if (registering.current) return;
    registering.current = true;

    try {
      const sdkReady = await waitForNatively();
      if (!sdkReady || !window.NativelyNotifications) {
        console.log("[Push] Not running inside Natively — skipping");
        return;
      }

      const notifications = new window.NativelyNotifications();

      // 1. Check current permission status
      const permStatus = await new Promise<string>((res) =>
        notifications.getPermissionStatus((r) => res(r.status))
      );
      console.log("[Push] Permission status:", permStatus);

      // 2. Request permission if not granted
      if (permStatus !== "granted") {
        const granted = await new Promise<boolean>((res) =>
          notifications.requestPermission(false, (r) => res(r.status))
        );
        if (!granted) {
          console.log("[Push] Permission denied by user");
          return;
        }
        console.log("[Push] Permission granted");
      }

      // 3. Set external ID (maps OneSignal device to our user)
      const extSet = await new Promise<boolean>((res) =>
        notifications.setExternalId({ externalId: user.id }, (r) => res(r.status))
      );
      console.log("[Push] setExternalId result:", extSet);

      // 4. Get OneSignal player/subscription ID (with retries)
      const playerId = await pollPlayerId(notifications);
      if (!playerId) {
        console.warn("[Push] Could not retrieve player ID after retries");
        return;
      }
      console.log("[Push] Player ID:", playerId);

      // 5. Store in push_subscriptions
      const { error } = await supabase
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
    } catch (err) {
      console.error("[Push] Registration error:", err);
    } finally {
      registering.current = false;
    }
  }, [user]);

  const removeExternalId = useCallback(async () => {
    const sdkReady = await waitForNatively();
    if (!sdkReady || !window.NativelyNotifications) return;
    const notifications = new window.NativelyNotifications();
    notifications.removeExternalId((r) => {
      console.log("[Push] removeExternalId:", r.status);
    });
  }, []);

  // Auto-register on login when running in Natively
  useEffect(() => {
    if (user) {
      const timer = setTimeout(registerDevice, 1500);
      return () => clearTimeout(timer);
    }
  }, [user, registerDevice]);

  const sendTestNotification = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("send-test-push");
    if (error) throw error;
    return data;
  }, []);

  return { registerDevice, removeExternalId, sendTestNotification };
}
