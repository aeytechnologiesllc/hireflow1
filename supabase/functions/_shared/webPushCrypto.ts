/**
 * webPushCrypto.ts — Web Push with no library, on WebCrypto alone (2026-10-21).
 *
 * A phone that has HireFlow on its Home Screen (and Chrome on Android, and
 * desktop browsers) is reached through its browser's own push service
 * (Apple, Google, Mozilla, Microsoft). What we hand that service is:
 *
 *   - the message, encrypted for that one device (RFC 8291, "aes128gcm"
 *     content encoding of RFC 8188): the push service never reads it;
 *   - a VAPID token (RFC 8292): an ES256 JWT naming who is sending, signed
 *     with HireFlow's own key pair, which is how the service knows the
 *     subscription's owner allowed this sender.
 *
 * This file is plain TypeScript with only erasable type syntax and only
 * WebCrypto globals, so the edge functions (Deno) and scripts/web_push.test.mjs
 * (Node) import the very same code. The test proves it three ways: it
 * reproduces the worked example in RFC 8291 section 5 byte for byte, it
 * decrypts what it encrypts with an independent implementation, and it
 * verifies the VAPID signature.
 *
 * Nothing here talks to the database or reads a secret. The server half
 * (loading or creating the VAPID key pair, sending to a user's devices) is
 * _shared/webPush.ts.
 */

/** HireFlow's sender key pair. `publicKey` is the 65-byte uncompressed P-256 point, base64url. */
export type VapidKeys = { publicKey: string; privateJwk: JsonWebKey };

/** What a browser gives us when someone turns notifications on. */
export type WebPushTarget = { endpoint: string; p256dh: string; auth: string };

/** The longest message that still fits one 4096-byte record (see encryptPayload). */
export const MAX_PAYLOAD_BYTES = 3993;

const RECORD_SIZE = 4096;
const encoder = new TextEncoder();

/* ------------------------------------------------------------ base64url */

export function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(text: string): Uint8Array {
  const clean = text.trim().replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]*$/.test(clean) || clean.length % 4 === 1) throw new Error("not base64url");
  const binary = atob(clean + "=".repeat((4 - (clean.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/* ------------------------------------------------------- push services */

/**
 * The only hosts a subscription may point at. A subscription row is written
 * by the signed-in person's own browser, so its endpoint is not trusted: left
 * unchecked, our server would POST to any address a caller names (an internal
 * one, say). Every browser's push service lives on one of these.
 */
const PUSH_HOSTS = new Set(["fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);
const PUSH_HOST_SUFFIXES = [".push.services.mozilla.com", ".push.apple.com", ".notify.windows.com"];

export function isAllowedPushEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.has(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length);
}

/** A device's two keys, as its browser gave them: a 65-byte uncompressed P-256 point and a 16-byte secret. */
export function isValidSubscriptionKeys(p256dh: unknown, auth: unknown): boolean {
  if (typeof p256dh !== "string" || typeof auth !== "string") return false;
  try {
    const point = b64urlDecode(p256dh);
    return point.length === 65 && point[0] === 4 && b64urlDecode(auth).length === 16;
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------- VAPID */

/** A new sender key pair (ECDSA P-256). */
export async function generateVapidKeyPair(): Promise<VapidKeys> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { publicKey: b64urlEncode(raw), privateJwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d } };
}

/**
 * The `Authorization` header value for one push service (RFC 8292 section 3):
 * `vapid t=<jwt>, k=<public key>`. The JWT names the service's origin (`aud`),
 * lasts 12 hours (the limit is 24) and says who to contact (`sub`).
 */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, nowMs: number = Date.now()): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: subject };
  const signingInput = `${b64urlEncode(encoder.encode(JSON.stringify(header)))}.${b64urlEncode(encoder.encode(JSON.stringify(claims)))}`;
  const key = await crypto.subtle.importKey("jwk", keys.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  // WebCrypto signs ECDSA as r||s (64 bytes), which is exactly what a JWS wants.
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(signingInput)));
  return `vapid t=${signingInput}.${b64urlEncode(signature)}, k=${keys.publicKey}`;
}

/* ---------------------------------------------------- message encryption */

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource }, key, length * 8));
}

export type EncryptOptions = {
  /** Fixed 16-byte salt and sender key for the test vector; real sends leave both out. */
  salt?: Uint8Array;
  ephemeral?: { privateKey: CryptoKey; publicKeyRaw: Uint8Array };
};

/**
 * RFC 8291 section 3-4 with a single RFC 8188 record. Returns the request
 * body: salt(16) || record size(4) || key id length(1) || sender public
 * key(65) || AES-128-GCM(payload || 0x02).
 */
export async function encryptPayload(payload: Uint8Array, target: { p256dh: string; auth: string }, options: EncryptOptions = {}): Promise<Uint8Array> {
  if (payload.length > MAX_PAYLOAD_BYTES) throw new Error("push message too long");
  if (!isValidSubscriptionKeys(target.p256dh, target.auth)) throw new Error("bad subscription keys");
  const uaPublic = b64urlDecode(target.p256dh);
  const authSecret = b64urlDecode(target.auth);

  const ephemeral = options.ephemeral ?? (await (async () => {
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    return { privateKey: pair.privateKey, publicKeyRaw: new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)) };
  })());
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  if (salt.length !== 16) throw new Error("salt must be 16 bytes");

  const uaKey = await crypto.subtle.importKey("raw", uaPublic as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, ephemeral.privateKey, 256));

  // RFC 8291 section 3.4: mix the shared secret with the device's auth secret.
  const keyInfo = concat(encoder.encode("WebPush: info\0"), uaPublic, ephemeral.publicKeyRaw);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  // RFC 8188 section 2.2-2.3: the content key and nonce for this record.
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  // 0x02 marks the last (and only) record.
  const plaintext = concat(payload, new Uint8Array([2]));
  const aes = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, aes, plaintext as BufferSource));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = ephemeral.publicKeyRaw.length;
  return concat(header, ephemeral.publicKeyRaw, ciphertext);
}

/* ---------------------------------------------------------------- send */

export type SendOptions = {
  /** How long the push service may hold the message for a device that is off, in seconds. */
  ttl?: number;
  urgency?: "very-low" | "low" | "normal" | "high";
  /** Tests substitute this for fetch. */
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
  now?: number;
  timeoutMs?: number;
};

/**
 * Sends one message to one device. Returns the push service's HTTP status:
 * 201 is accepted, 404 and 410 mean the device has gone for good (delete its
 * row), 400 is an endpoint we refuse to call, 0 means the service could not
 * be reached. One quick retry for a 5xx, 429 or no answer.
 */
export async function sendWebPush(target: WebPushTarget, payload: string | Record<string, unknown>, keys: VapidKeys, subject: string, options: SendOptions = {}): Promise<number> {
  if (!isAllowedPushEndpoint(target.endpoint)) return 400;
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  const body = await encryptPayload(encoder.encode(text), target);
  const authorization = await vapidAuthorization(target.endpoint, keys, subject, options.now);
  const doFetch = options.fetchImpl ?? ((url: string, init: RequestInit) => fetch(url, init));
  const init: RequestInit = {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(options.ttl ?? 86400),
      Urgency: options.urgency ?? "high",
    },
    body: body as BodyInit,
    // A push service answers; it never sends us elsewhere.
    redirect: "manual",
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    let status = 0;
    try {
      const response = await doFetch(target.endpoint, { ...init, signal: AbortSignal.timeout(options.timeoutMs ?? 8000) });
      status = response.status;
      await response.body?.cancel().catch(() => {});
    } catch {
      status = 0;
    }
    if (status !== 0 && status !== 429 && status < 500) return status;
    if (attempt === 1) return status;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return 0;
}
