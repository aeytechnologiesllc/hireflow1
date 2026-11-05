/**
 * Notifications inside the HireFlow iPhone app (ios/, Capacitor; the owner,
 * 2026-11-04: "build it" the FairFix way, straight from Apple, no OneSignal).
 *
 * The app loads the staff site, so this page runs inside it: it asks iOS for
 * permission (iOS shows its own box, no tap needed), registers with Apple for
 * this phone's push address, and saves that address for whoever is signed in
 * (save_native_push_token, 20261104200000_native_push_apns.sql). The server
 * sends to it from send-push-notification (_shared/apns.ts). A tap on a
 * notification opens its page in the app. Signing out removes the address.
 *
 * The plugin's code rides with the page, but it is used only inside the app:
 * in a browser none of this runs.
 * docs/PUSH-NOTIFICATIONS.md, "The iPhone app".
 */
import { supabase } from "@/integrations/supabase/client";
import { inAppPath } from "@/lib/safeLink";
import { PushNotifications } from "@capacitor/push-notifications";

const TOKEN_KEY = "hf-native-push-token";

/** The app adds "HireFlowApp/<n>" to its user agent (capacitor.config.json appendUserAgent). */
export function insideHireFlowApp(): boolean {
  return typeof navigator !== "undefined" && /HireFlowApp\/\d/.test(navigator.userAgent);
}

type PushPlugin = typeof PushNotifications;

/**
 * The plugin, only inside the app (in a browser it has nothing to talk to).
 * Never hand it through a promise or return it from an async function: it
 * answers to any name, "then" included, so a promise waits on it forever
 * (found in the Simulator, 2026-11-04: the app hung before asking iOS).
 */
function plugin(): PushPlugin | null {
  return insideHireFlowApp() ? PushNotifications : null;
}

function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function keepToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* not remembered: signing out then leaves the address until Apple drops it */
  }
}

/** The in-app path of a notification's address (its own host or the candidates' one). */
export function inAppPathOf(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null;
  try {
    const u = new URL(url, window.location.origin);
    if (!/(^|\.)hireflownow\.com$/.test(u.hostname) && u.origin !== window.location.origin) return null;
    return inAppPath(`${u.pathname}${u.search}${u.hash}`);
  } catch {
    return null;
  }
}


let listening = false;

/**
 * Hooks the plugin's answers up once: the address Apple gives (saved for the
 * signed-in person), and the tap on a notification (its page opened in the
 * app). False outside the app.
 */
async function listen(open: (path: string) => void): Promise<boolean> {
  const push = plugin();
  if (!push) return false;
  if (listening) return true;
  listening = true;
  await push.addListener("registration", (token) => {
    const value = (token?.value ?? "").toLowerCase();
    if (!/^[0-9a-f]{64,200}$/.test(value)) return;
    keepToken(value);
    void supabase.rpc("save_native_push_token" as never, { p_token: value } as never).then(({ error }) => {
      if (error) console.warn("[native-push] could not save this phone", error.message);
    });
  });
  await push.addListener("registrationError", (error) => {
    console.warn("[native-push] Apple gave no address", error?.error);
  });
  await push.addListener("pushNotificationActionPerformed", (action) => {
    const path = inAppPathOf((action?.notification?.data as { url?: unknown } | undefined)?.url);
    if (path) open(path);
  });
  return true;
}

/** Whether iOS lets this app show notifications (null: not in the app). */
export async function nativePushGranted(): Promise<boolean | null> {
  const push = plugin();
  if (!push) return null;
  try {
    return (await push.checkPermissions()).receive === "granted";
  } catch {
    return null;
  }
}

/**
 * After sign-in, and from Settings' "Turn on": ask iOS once (after that iOS
 * answers from its Settings), then register. Resolves true when allowed.
 */
let turningOn: Promise<boolean> | null = null;

export function turnOnNativePush(open: (path: string) => void = (path) => window.location.assign(path)): Promise<boolean> {
  // One ask at a time: sign-in and Settings (or React's double run in
  // development) asking together got the second answer, "denied", while iOS
  // was still showing the first box.
  turningOn ??= askAndRegister(open).finally(() => {
    turningOn = null;
  });
  return turningOn;
}

async function askAndRegister(open: (path: string) => void): Promise<boolean> {
  try {
    if (!(await listen(open))) return false;
    const push = plugin();
    if (!push) return false;
    let permission = await push.checkPermissions();
    if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
      permission = await push.requestPermissions();
    }
    if (permission.receive !== "granted") return false;
    await push.register();
    return true;
  } catch (error) {
    console.warn("[native-push] could not turn on", error);
    return false;
  }
}

/** Signing out: this phone stops getting this person's notifications. */
export async function removeNativePushBeforeSignOut(): Promise<void> {
  if (!insideHireFlowApp()) return;
  const token = readToken();
  if (!token) return;
  try {
    await Promise.race([
      supabase.rpc("remove_native_push_token" as never, { p_token: token } as never),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } finally {
    keepToken(null);
  }
}
