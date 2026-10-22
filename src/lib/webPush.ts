import { supabase } from "@/integrations/supabase/client";

/**
 * Phone notifications for the web app (2026-10-21; docs/PUSH-NOTIFICATIONS.md).
 *
 * HireFlow saved to a phone's Home Screen (iPhone Safari, Android Chrome), or
 * open in a desktop browser, can show a notification when the app is closed.
 * The browser hands the app a subscription (an address on its own push
 * service and two keys); we save it against the signed-in person
 * (save_web_push_subscription), and the server pushes to it
 * (supabase/functions/send-push-notification).
 *
 * This file is the browser half and has no React in it: what the device can
 * do, turning it on, keeping the saved copy right, and taking it away at
 * sign-out. src/hooks/useWebPush.ts is the hook the screens use. Inside the
 * native wrapper ("Natively") none of this applies; that path is
 * src/hooks/usePushNotifications.ts.
 */

export const NOTIFICATIONS_WORKER = "/hireflow-sw.js";

/** What the Settings row and the first-time card go by. */
export type WebPushStatus = "unsupported" | "needs-home-screen" | "blocked" | "off" | "on";

/** Said on `window` whenever this device's state may have changed (turned on, off, signed out). */
export const WEB_PUSH_CHANGED = "hf-web-push-changed";

/* ------------------------------------------------------------ the device */

function isAppleTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return true;
  // An iPad asks for the desktop site and calls itself a Mac, but has a touch screen.
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

/** Running from the Home Screen icon rather than a browser tab. */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches);
}

function canPush(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/**
 * Inside the native wrapper app, which has its own way (OneSignal through
 * Natively). Judged by the wrapper's name in the user agent (the same test the
 * Natively SDK makes), not by whether its script has loaded yet: the script
 * arrives after the page starts, and a wrapper user must never be shown the
 * browser's "add to Home Screen" instructions meanwhile.
 */
export function insideNativeApp(): boolean {
  return typeof navigator !== "undefined" && /Natively\/(iOS|Android)/.test(navigator.userAgent);
}

/** The part of the answer that needs no waiting. null: the device could, so look closer. */
export function quickStatus(): Exclude<WebPushStatus, "off" | "on"> | null {
  // iPhone and iPad only allow notifications for an app on the Home Screen.
  // A browser tab has no PushManager there at all, so check this first.
  if (isAppleTouchDevice() && !isInstalledApp()) return "needs-home-screen";
  if (!canPush()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return null;
}

/** The offline preview's switch (?__previewPush=on|off|blocked|home|unsupported), kept for the visit. Development only. */
function previewStatus(): WebPushStatus | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  try {
    const asked = new URLSearchParams(window.location.search).get("__previewPush");
    if (asked) window.sessionStorage.setItem("hf-preview-push", asked);
    const kept = window.sessionStorage.getItem("hf-preview-push");
    const table: Record<string, WebPushStatus> = { on: "on", off: "off", blocked: "blocked", home: "needs-home-screen", unsupported: "unsupported" };
    return kept ? (table[kept] ?? null) : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------- what we remember */

const wantedKey = (userId: string) => `hf-web-push-wanted:${userId}`;

/**
 * Whether this person turned notifications on from this browser. It survives
 * sign-out on purpose: signing out removes the device (nothing is delivered to
 * a signed-out phone), and signing back in as the same person quietly puts it
 * back. Only "Turn off" forgets it.
 */
function wanted(userId: string): boolean {
  try {
    return window.localStorage.getItem(wantedKey(userId)) === "1";
  } catch {
    return false;
  }
}
function setWanted(userId: string, on: boolean) {
  try {
    if (on) window.localStorage.setItem(wantedKey(userId), "1");
    else window.localStorage.removeItem(wantedKey(userId));
  } catch {
    /* private browsing: the device still works, it just isn't re-saved at sign-in */
  }
}

function announce() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(WEB_PUSH_CHANGED));
}

/* --------------------------------------------------------- service worker */

/** True for the one worker HireFlow keeps. */
export function isNotificationsWorker(scriptUrl: string | null | undefined): boolean {
  if (!scriptUrl) return false;
  try {
    const url = new URL(scriptUrl, window.location.href);
    return url.origin === window.location.origin && url.pathname === NOTIFICATIONS_WORKER;
  } catch {
    return false;
  }
}

/**
 * At start-up (src/main.tsx): remove every service worker except the
 * notifications one (the old cleanup stays for anything else that might sit in
 * a browser from an earlier build), then register it. Never throws, never waits
 * for anything the app needs.
 */
export async function setUpServiceWorkers(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map((registration) => {
        const script = registration.active?.scriptURL ?? registration.waiting?.scriptURL ?? registration.installing?.scriptURL;
        return isNotificationsWorker(script) ? undefined : registration.unregister();
      }),
    );
    if ("PushManager" in window) await navigator.serviceWorker.register(NOTIFICATIONS_WORKER, { scope: "/" });
  } catch (error) {
    console.warn("[push] service worker not set up:", error);
  }
}

/** The registration, or null if the worker never came up (it can take a moment on a first visit). */
async function workerRegistration(waitMs: number): Promise<ServiceWorkerRegistration | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), waitMs));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

/* ------------------------------------------------------------------ keys */

let publicKeyOnce: Promise<Uint8Array> | null = null;

function keyBytes(base64url: string): Uint8Array {
  const clean = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(clean + "=".repeat((4 - (clean.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** HireFlow's public push key (created by the server on first use). */
async function publicKey(): Promise<Uint8Array> {
  if (!publicKeyOnce) {
    publicKeyOnce = (async () => {
      const { data, error } = await supabase.functions.invoke("push-public-key");
      const key = (data as { publicKey?: unknown } | null)?.publicKey;
      if (error || typeof key !== "string" || key.length < 80) throw new Error("push key unavailable");
      return keyBytes(key);
    })().catch((error) => {
      publicKeyOnce = null;
      throw error;
    });
  }
  return publicKeyOnce;
}

/** Fetch the key ahead of the tap, so the tap has less to wait for. */
export function warmUpPublicKey(): void {
  void publicKey().catch(() => {});
}

function sameBytes(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false;
  const x = new Uint8Array(a);
  return b.every((v, i) => v === x[i]);
}

/* ----------------------------------------------------------- the database */

type DeviceKeys = { endpoint: string; p256dh: string; auth: string };

function deviceKeys(subscription: PushSubscription): DeviceKeys | null {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

/** Save this browser's subscription for whoever is signed in. */
async function saveDevice(subscription: PushSubscription): Promise<void> {
  const keys = deviceKeys(subscription);
  if (!keys) throw new Error("incomplete subscription");
  const { error } = await supabase.rpc(
    "save_web_push_subscription" as never,
    { p_endpoint: keys.endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_user_agent: navigator.userAgent.slice(0, 300) } as never,
  );
  if (error) throw error;
}

/** Whether this person has this browser's subscription saved. */
async function isSaved(userId: string, endpoint: string): Promise<boolean> {
  const { data, error } = await supabase.from("push_subscriptions" as never).select("id").eq("user_id", userId).eq("endpoint", endpoint).limit(1);
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

/* ----------------------------------------------------------------- status */

/** The browser's subscription for this site, if there is one. Never waits for a worker that isn't there. */
async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * 'unsupported' | 'needs-home-screen' | 'blocked' | 'off' | 'on'.
 * 'on' means permission is granted AND this browser has a subscription AND it
 * is saved for this person.
 */
export async function readWebPushStatus(userId: string | null): Promise<WebPushStatus> {
  const preview = previewStatus();
  if (preview) return preview;
  const quick = quickStatus();
  if (quick) return quick;
  if (!userId || Notification.permission !== "granted") return "off";
  try {
    const subscription = await currentSubscription();
    if (!subscription) return "off";
    return (await isSaved(userId, subscription.endpoint)) ? "on" : "off";
  } catch {
    return "off";
  }
}

/* -------------------------------------------------------- turning it on */

export type TurnOnResult = { ok: boolean; reason?: "denied" | "unsupported" | "failed" };

/** A subscription made with our key: the existing one if it is ours, otherwise a fresh one. */
async function subscribeThisBrowser(registration: ServiceWorkerRegistration): Promise<PushSubscription> {
  const key = await publicKey();
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    if (sameBytes(existing.options.applicationServerKey, key)) return existing;
    await existing.unsubscribe(); // made with another key: it could never receive from us
  }
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource });
}

/**
 * Turn notifications on for this device. MUST be called straight from a tap:
 * the first thing it does is ask for permission, which iPhone only allows
 * inside a tap (nothing may be awaited before it).
 */
export async function turnOnWebPush(userId: string): Promise<TurnOnResult> {
  if (import.meta.env.DEV && previewStatus()) {
    setWanted(userId, true);
    return { ok: true };
  }
  const quick = quickStatus();
  if (quick === "unsupported" || quick === "needs-home-screen") return { ok: false, reason: "unsupported" };
  if (quick === "blocked") return { ok: false, reason: "denied" };
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "denied" };
    const registration = await workerRegistration(8000);
    if (!registration) return { ok: false, reason: "failed" };
    const subscription = await subscribeThisBrowser(registration);
    await saveDevice(subscription);
    setWanted(userId, true);
    announce();
    return { ok: true };
  } catch (error) {
    console.warn("[push] could not turn on:", error);
    return { ok: false, reason: "failed" };
  }
}

/* ----------------------------------------------------- keeping it right */

/**
 * At sign-in: if this person turned notifications on here before and the
 * browser still allows them, make sure the subscription exists and is saved
 * (an address can change, and the earlier sign-out took the device off).
 * Quiet: no prompt, no message, nothing thrown.
 */
export async function restoreWebPush(userId: string): Promise<void> {
  try {
    if (quickStatus() || Notification.permission !== "granted" || !wanted(userId)) return;
    const registration = await workerRegistration(10000);
    if (!registration) return;
    const existing = await registration.pushManager.getSubscription();
    if (existing && (await isSaved(userId, existing.endpoint)) && sameBytes(existing.options.applicationServerKey, await publicKey())) return;
    await saveDevice(await subscribeThisBrowser(registration));
    announce();
  } catch (error) {
    console.warn("[push] could not restore this device:", error);
  }
}

/**
 * Take this device off the account (sign-out, "Turn off"): delete its saved
 * row while still signed in, then drop the browser's subscription so the push
 * service stops delivering to it even if the row could not be deleted.
 */
export async function removeThisDevice(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const subscription = await currentSubscription();
    if (!subscription) return;
    const { error } = await supabase.from("push_subscriptions" as never).delete().eq("endpoint", subscription.endpoint);
    if (error) console.warn("[push] could not delete this device's row:", error.message);
    await subscription.unsubscribe();
  } catch (error) {
    console.warn("[push] could not remove this device:", error);
  } finally {
    announce();
  }
}

/** At sign-out: take the device off the account, but never hold the sign-out up for more than a moment. */
export async function removeThisDeviceBeforeSignOut(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  await Promise.race([removeThisDevice(), new Promise<void>((resolve) => setTimeout(resolve, 2500))]);
}

/** The "Turn off" button: this device, and the memory that it was on. */
export async function turnOffWebPush(userId: string): Promise<void> {
  setWanted(userId, false);
  await removeThisDevice();
}

/** Drop the browser's subscription without touching the database. For when the person is already signed out. */
export async function dropBrowserSubscription(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    await (await currentSubscription())?.unsubscribe();
  } catch {
    /* nothing to drop */
  }
}

/* ------------------------------------------------------------------- test */

/** Send a test notification to this account's devices. Returns how many it reached. */
export async function sendWebPushTest(): Promise<number> {
  if (import.meta.env.DEV && previewStatus()) return 1;
  const { data, error } = await supabase.functions.invoke("send-test-push");
  if (error) throw error;
  const reached = Number((data as { devices?: unknown } | null)?.devices ?? 0);
  return Number.isFinite(reached) ? reached : 0;
}
