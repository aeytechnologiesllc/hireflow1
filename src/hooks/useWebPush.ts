import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { nativePermissionGranted, turnOnNativeNotifications } from "@/hooks/usePushNotifications";
import {
  WEB_PUSH_CHANGED,
  dropBrowserSubscription,
  insideNativeApp,
  readWebPushStatus,
  restoreWebPush,
  sendWebPushTest,
  turnOffWebPush,
  turnOnWebPush,
  warmUpPublicKey,
  type TurnOnResult,
  type WebPushStatus,
} from "@/lib/webPush";

/**
 * Phone notifications on this device, for the screens (Settings' "Notifications
 * on this device" row, and the first-time card). The browser half is
 * src/lib/webPush.ts; inside the native wrapper the same buttons use its own
 * permission (src/hooks/usePushNotifications.ts).
 *
 * `status` is one of 'unsupported' | 'needs-home-screen' | 'blocked' | 'off' |
 * 'on', or 'checking' until the first answer.
 */
export type PushUiStatus = WebPushStatus | "checking";

async function readNativeStatus(): Promise<WebPushStatus> {
  return (await nativePermissionGranted()) ? "on" : "off";
}

export function useWebPush() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const native = useMemo(() => insideNativeApp(), []);
  const [status, setStatus] = useState<PushUiStatus>("checking");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const next = native ? await readNativeStatus() : await readWebPushStatus(userId);
    if (mounted.current) setStatus(next);
  }, [userId, native]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const again = () => void refresh();
    window.addEventListener(WEB_PUSH_CHANGED, again);
    // Back from the phone's own Settings (where it may have been allowed or blocked).
    document.addEventListener("visibilitychange", again);
    return () => {
      mounted.current = false;
      window.removeEventListener(WEB_PUSH_CHANGED, again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [refresh]);

  // Have the key ready, so the tap has less to wait for.
  useEffect(() => {
    if (status === "off" && !native) warmUpPublicKey();
  }, [status, native]);

  /** Call this straight from the tap: the phone only shows its permission box inside one. */
  const turnOn = useCallback(async (): Promise<TurnOnResult> => {
    if (!userId) return { ok: false, reason: "failed" };
    setBusy(true);
    try {
      const result: TurnOnResult = native
        ? (await turnOnNativeNotifications(userId))
          ? { ok: true }
          : { ok: false, reason: "denied" }
        : await turnOnWebPush(userId);
      if (native) window.dispatchEvent(new Event(WEB_PUSH_CHANGED));
      await refresh();
      return result;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [userId, native, refresh]);

  const turnOff = useCallback(async () => {
    if (!userId || native) return;
    setBusy(true);
    try {
      await turnOffWebPush(userId);
      await refresh();
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [userId, native, refresh]);

  /** How many of this account's devices the test reached. Throws if it could not be sent. */
  const sendTest = useCallback(async (): Promise<number> => {
    setBusy(true);
    try {
      return await sendWebPushTest();
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  return { status, busy, native, turnOn, turnOff, sendTest, refresh };
}

/**
 * Mounted once per signed-in session (AppLayout): quietly puts this device
 * back at sign-in if the person turned notifications on here before, and stops
 * the browser delivering if the session ends some other way than a sign-out
 * button (an expired sign-in).
 */
export function useWebPushSync() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const before = useRef<string | null>(null);
  const native = useMemo(() => insideNativeApp(), []);

  useEffect(() => {
    if (!userId || native) return;
    const timer = setTimeout(() => void restoreWebPush(userId), 2500);
    return () => clearTimeout(timer);
  }, [userId, native]);

  useEffect(() => {
    if (before.current && !userId && !native) void dropBrowserSubscription();
    before.current = userId;
  }, [userId, native]);
}
