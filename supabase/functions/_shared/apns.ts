/**
 * Notifications to the HireFlow iPhone app, straight from Apple (APNs), with
 * no OneSignal (the owner, 2026-11-04: build it "the FairFix way").
 *
 * The app (ios/, Capacitor) saves each phone's push address, an APNs device
 * token, in push_subscriptions.apns_token (save_native_push_token,
 * 20261104200000_native_push_apns.sql). This sends one notification to those
 * phones with the project's own token-signing key from the Apple Developer
 * account (Keys → Apple Push Notifications service):
 *
 *   APNS_KEY_ID       the key's 10-character id
 *   APNS_TEAM_ID      the team id (8M67RVJS7T)
 *   APNS_PRIVATE_KEY  the .p8 file's text, BEGIN/END lines included
 *   APNS_BUNDLE_ID    optional; com.aeytechnologies.hireflow
 *
 * Without the three secrets nothing is sent and nothing fails: the browser
 * rows still go out (send-push-notification).
 *
 * A token from a build run from Xcode belongs to Apple's sandbox, one from
 * TestFlight or the App Store to production, and the app cannot tell which.
 * A phone is tried on production first; when Apple says the token is not a
 * production one (400 BadDeviceToken) it is tried on the sandbox, and the
 * answer is remembered on its row. A phone Apple says is gone (410, or a token
 * neither side knows) is removed, like a dead browser subscription.
 *
 * Pure apart from fetch and the two row writes it is handed, so
 * scripts/apns.test.mjs runs it under plain Node.
 */

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  privateKeyPem: string;
  bundleId: string;
}

export interface ApnsDevice {
  id: string;
  apns_token: string;
  apns_environment: string | null;
}

export interface ApnsMessage {
  title: string;
  body: string;
  /** An in-app address the tap opens (pushLink.ts), or null. */
  url: string | null;
  /** The notification's id: a second push of the same one replaces it. */
  tag?: string;
}

export interface ApnsDeps {
  fetch: typeof fetch;
  removeDevice: (id: string) => Promise<void>;
  setEnvironment: (id: string, environment: "production" | "sandbox") => Promise<void>;
  now?: () => number;
}

export interface ApnsResult {
  sent: number;
  removed: number;
  failed: number;
}

const HOSTS = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
} as const;

export const DEFAULT_BUNDLE_ID = "com.aeytechnologies.hireflow";

/** The secrets, or null when they are not all set. */
export function apnsConfigFrom(get: (name: string) => string | undefined): ApnsConfig | null {
  const keyId = (get("APNS_KEY_ID") ?? "").trim();
  const teamId = (get("APNS_TEAM_ID") ?? "").trim();
  // A secret pasted on one line carries literal "\n"s.
  const privateKeyPem = (get("APNS_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n").trim();
  const bundleId = (get("APNS_BUNDLE_ID") ?? "").trim() || DEFAULT_BUNDLE_ID;
  if (!/^[A-Z0-9]{10}$/.test(keyId) || !/^[A-Z0-9]{10}$/.test(teamId) || !privateKeyPem.includes("PRIVATE KEY")) return null;
  return { keyId, teamId, privateKeyPem, bundleId };
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const raw = atob(body);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

let cached: { key: string; token: string; at: number } | null = null;

/**
 * The provider token Apple asks for: an ES256 JWT signed with the .p8 key.
 * Apple refuses one older than an hour and one renewed more often than every
 * 20 minutes, so one is kept for 50.
 */
export async function providerToken(config: ApnsConfig, now: number = Date.now()): Promise<string> {
  const cacheKey = `${config.teamId}:${config.keyId}`;
  if (cached && cached.key === cacheKey && now - cached.at < 50 * 60_000) return cached.token;
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(config.privateKeyPem), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = new TextEncoder();
  const head = base64url(enc.encode(JSON.stringify({ alg: "ES256", kid: config.keyId })));
  const claims = base64url(enc.encode(JSON.stringify({ iss: config.teamId, iat: Math.floor(now / 1000) })));
  // WebCrypto's ECDSA signature is r||s, which is exactly JOSE's form.
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${claims}`)));
  const token = `${head}.${claims}.${base64url(signature)}`;
  cached = { key: cacheKey, token, at: now };
  return token;
}

/** What Apple is sent for one notification: the alert, and the address a tap opens. */
export function apnsPayload(message: ApnsMessage): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    aps: {
      alert: { title: message.title.slice(0, 160), body: message.body.slice(0, 600) },
      sound: "default",
    },
  };
  if (message.url) payload.url = message.url;
  return payload;
}

async function sendOne(
  deps: ApnsDeps,
  config: ApnsConfig,
  token: string,
  environment: "production" | "sandbox",
  message: ApnsMessage,
): Promise<{ status: number; reason: string | null }> {
  const headers: Record<string, string> = {
    authorization: `bearer ${await providerToken(config, deps.now?.())}`,
    "apns-topic": config.bundleId,
    "apns-push-type": "alert",
    "apns-priority": "10",
    "content-type": "application/json",
  };
  if (message.tag) headers["apns-collapse-id"] = message.tag.slice(0, 64);
  const response = await deps.fetch(`${HOSTS[environment]}/3/device/${token}`, {
    method: "POST",
    headers,
    body: JSON.stringify(apnsPayload(message)),
  });
  if (response.status === 200) return { status: 200, reason: null };
  const answer = (await response.json().catch(() => ({}))) as { reason?: string };
  return { status: response.status, reason: typeof answer.reason === "string" ? answer.reason : null };
}

/** A token Apple does not know on that side (or no longer). */
const goneOn = (r: { status: number; reason: string | null }) =>
  r.status === 410 || (r.status === 400 && (r.reason === "BadDeviceToken" || r.reason === "DeviceTokenNotForTopic"));

/** Sends one notification to these phones. Never throws for one phone. */
export async function pushToApns(devices: readonly ApnsDevice[], message: ApnsMessage, config: ApnsConfig, deps: ApnsDeps): Promise<ApnsResult> {
  const result: ApnsResult = { sent: 0, removed: 0, failed: 0 };
  for (const device of devices) {
    const token = (device.apns_token ?? "").toLowerCase();
    if (!/^[0-9a-f]{64,200}$/.test(token)) continue;
    try {
      const first: "production" | "sandbox" = device.apns_environment === "sandbox" ? "sandbox" : "production";
      let answer = await sendOne(deps, config, token, first, message);
      if (answer.status === 400 && answer.reason === "BadDeviceToken" && first === "production" && device.apns_environment !== "production") {
        // A build from Xcode: the sandbox's token.
        answer = await sendOne(deps, config, token, "sandbox", message);
        if (answer.status === 200) await deps.setEnvironment(device.id, "sandbox");
      } else if (answer.status === 200 && device.apns_environment == null) {
        await deps.setEnvironment(device.id, first);
      }
      if (answer.status === 200) {
        result.sent += 1;
      } else if (goneOn(answer)) {
        await deps.removeDevice(device.id);
        result.removed += 1;
      } else {
        console.error("[apns] refused", answer.status, answer.reason);
        result.failed += 1;
      }
    } catch (error) {
      console.error("[apns] send failed:", error instanceof Error ? error.message : error);
      result.failed += 1;
    }
  }
  return result;
}
