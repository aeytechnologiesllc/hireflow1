/**
 * connectionStamps.ts — the signed stamps of the computer and connection
 * check (docs/EQUIPMENT-CHECK.md §1 and §4), and the three figures `record`
 * computes from a chain of them.
 *
 * Every figure is measured by the server, from its own clock. The browser
 * never times itself: the test is a CHAIN of requests, every response
 * carries a stamp (server time, bytes, a nonce) signed with a key only the
 * server holds, and every next request hands that stamp back. The server
 * therefore knows, on its own clock, when it sent each download, when each
 * was fully received (the request carrying the stamp from the END of the
 * body arrived), when each upload's last byte landed, and when each ping
 * came back. The only thing the browser adds is its own turnaround, which
 * can only make a connection look SLOWER, never faster. `record` recomputes
 * all three figures from the stamps and ignores any number the page sends.
 *
 * What stops the obvious tricks:
 *   - A forged or edited stamp fails its HMAC and the chain is refused.
 *   - Two requests in parallel cannot both continue one chain: each stamp
 *     names its predecessor's nonce, and a nonce may appear once.
 *   - A download's stamp exists in two copies: the `x-stamp` header, which
 *     arrives FIRST, and the last 512 bytes of the body, which arrive LAST.
 *     Only the body copy is a chain link (the header copy carries
 *     `head: true`, refused as a predecessor), so the next request cannot
 *     be sent before the whole download has arrived.
 *   - A stamp older than 20 minutes is refused, so a chain cannot be kept
 *     and sent later, and every stamp names the signed-in candidate, so a
 *     chain cannot be sent by someone else.
 *   - A chain runs in the contract's order (pings, then downloads, then
 *     uploads, starting with a ping), so no step can be placed where its
 *     time would not be proven.
 *   - Every stamp also carries the address the request came from (as the
 *     platform reports it) and a short hash of its User-Agent. A chain whose
 *     stamps name two browsers is refused; a chain from more than one
 *     address, or sent from another address or browser than the one it ran
 *     on, is recorded as a flag the hiring team sees. A candidate who runs
 *     the test from a fast machine elsewhere and sends it from home is
 *     therefore visible, never hidden (docs/EQUIPMENT-CHECK.md §4).
 *
 * Only proven intervals are counted, and only ones that can make a
 * connection look SLOWER (rule 1):
 *   - a ping's round trip and a download's time end when the NEXT request
 *     arrived (`prev_at` of the next stamp): the page cannot send it before
 *     it holds this stamp;
 *   - an upload's time starts at the PREVIOUS upload's `at`: the page could
 *     only send this body once it held that stamp, which was minted after
 *     that `at`. `at − received` of the same request is NOT used: when the
 *     gateway buffers a body, `received` is after the body arrived and the
 *     difference measures an internal handoff, not the applicant's line.
 *     The first upload (after the downloads) therefore has no proven start
 *     of its own: it closes the last download and its own bytes and time
 *     are left out of the upload figure;
 *   - a duration of 0 ms or less (two workers' clocks disagreeing) proves
 *     nothing: that step's bytes AND its time are left out, never the time
 *     alone.
 *
 * Deliberately IMPORT-FREE and written against `globalThis.crypto.subtle`,
 * so it runs under plain Node 22+ (scripts/connection_test_stamps.test.mjs
 * imports it the way scripts/trusted_results_logic.test.mjs imports
 * trustedResults.ts) as well as Deno inside the connection-test function.
 * Nothing here reads the environment: the secret is made by the caller
 * (makeSecret) from the key the function runs with.
 */

// ============================================================================
// Stamps
// ============================================================================

export type StampKind = "ping" | "download" | "upload";

/**
 * A DIAGNOSTIC label on an upload stamp, never what times it
 * (docs/EQUIPMENT-CHECK.md §4): "stream" when the function spent 5 ms or more
 * reading the body after the request arrived (the gateway may have streamed
 * it), "chain" when it was handed over whole. Nothing proves that the
 * request arrived before the body left the page (a buffering gateway starts
 * the handler after the whole body is in), so every upload is timed from the
 * previous upload's `at` (figuresFromChain) whatever this says; it is kept
 * so a live chain can show how the deployed gateway behaves.
 */
export type UploadTiming = "stream" | "chain";

export interface StampFields {
  kind: StampKind;
  /** 16 hex characters, fresh for every stamp. */
  nonce: string;
  /** Server `Date.now()` at the moment that matters for the kind: a ping's
   *  response sent, a download's streaming began, an upload's last byte in. */
  at: number;
  /** Bytes this step moved: 0 for a ping, the body length for a download, the bytes read for an upload. */
  bytes: number;
  /** The nonce of the stamp the request handed in; null for the first stamp of a chain. */
  prev_nonce: string | null;
  /** Server time the request that handed in `prev_nonce` ARRIVED: the number
   *  that proves the previous step was complete. Set for every stamp, the
   *  first of a chain included (it is then simply when the chain began). */
  prev_at: number;
  /** The JWT subject the chain belongs to. */
  candidate?: string;
  /** Upload only. */
  timing?: UploadTiming;
  /** Download only: the copy in the `x-stamp` header, which arrives before
   *  the body. Never a chain link. */
  head?: true;
  /** The address the request came from, as the platform reports it
   *  (bestEffortIp, cleaned); absent when it reported none. */
  ip?: string;
  /** The first 16 hex characters of SHA-256 of the request's User-Agent. */
  ua?: string;
}

export interface Stamp extends StampFields {
  /** base64url(HMAC-SHA256(secret, canonical fields)), 43 characters. */
  sig: string;
}

/** The label the stamp secret is derived under (docs/EQUIPMENT-CHECK.md §4). */
export const STAMP_SECRET_LABEL = "connection-test:v1";
/** A chain is refused when any stamp is older than this. */
export const STAMP_MAX_AGE_MS = 20 * 60_000;
/** A stamp may be this far ahead of the verifier's clock (another worker's clock). */
export const STAMP_MAX_AHEAD_MS = 60_000;
/** The download stamp sits in the last this many bytes of the body, space-padded
 *  (room for an IPv6 address and the User-Agent hash). */
export const STAMP_TAIL_BYTES = 512;
/** The fewest steps `record` accepts (docs/EQUIPMENT-CHECK.md §4). */
export const MIN_STEPS = Object.freeze({ ping: 4, download: 2, upload: 2 });
/** More stamps than a run with every retry could produce: the body is capped, not the chain alone. */
export const MAX_CHAIN_LENGTH = 64;
/** An upload whose `at − prev_at` is under this was handed over whole by the gateway. */
export const STREAMED_UPLOAD_MIN_MS = 5;

const NONCE_RE = /^[0-9a-f]{16}$/;
const SIG_RE = /^[A-Za-z0-9_-]{43}$/;
const UA_HASH_RE = /^[0-9a-f]{16}$/;
/** An IPv4 or IPv6 address as a platform header carries it (zone ids and brackets allowed). */
const ADDRESS_RE = /^[0-9A-Za-z:.%_[\]-]{1,64}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function subtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) throw new Error("WebCrypto (globalThis.crypto.subtle) is not available");
  return c.subtle;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

/** A fresh nonce: 8 random bytes as 16 hex characters. */
export function makeNonce(): string {
  const bytes = new Uint8Array(8);
  (globalThis as { crypto: Crypto }).crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/**
 * The HMAC key stamps are signed with, derived once per worker from the key
 * the function runs with: HMAC-SHA256(serviceRoleKey, label). Nobody
 * configures it, and the service-role key itself never signs anything.
 */
export async function makeSecret(serviceRoleKey: string, label: string = STAMP_SECRET_LABEL): Promise<CryptoKey> {
  if (typeof serviceRoleKey !== "string" || serviceRoleKey.length < 16) {
    throw new Error("a service-role key is needed to derive the stamp secret");
  }
  const s = subtle();
  const root = await s.importKey("raw", encoder.encode(serviceRoleKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const derived = new Uint8Array(await s.sign("HMAC", root, encoder.encode(label)));
  return s.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** The bytes the signature covers: every field, in a fixed order, absent ones empty.
 *  Copied into a plain ArrayBuffer: WebCrypto takes a BufferSource, and under Deno's
 *  lib a TextEncoder result is typed over ArrayBufferLike. */
function canonical(fields: StampFields): Uint8Array<ArrayBuffer> {
  return new Uint8Array(encoder.encode(
    [
      "v1",
      fields.kind,
      fields.nonce,
      String(fields.at),
      String(fields.bytes),
      fields.prev_nonce ?? "",
      String(fields.prev_at),
      fields.candidate ?? "",
      fields.timing ?? "",
      fields.head ? "head" : "",
      fields.ip ?? "",
      fields.ua ?? "",
    ].join("\n"),
  ));
}

export async function signStamp(secret: CryptoKey, fields: StampFields): Promise<Stamp> {
  const sig = new Uint8Array(await subtle().sign("HMAC", secret, canonical(fields)));
  return { ...fields, sig: toBase64Url(sig) };
}

/** Whether `stamp` was signed with `secret` over exactly these fields. */
export async function verifyStamp(secret: CryptoKey, stamp: Stamp): Promise<boolean> {
  if (!isStampShape(stamp)) return false;
  try {
    return await subtle().verify("HMAC", secret, fromBase64Url(stamp.sig), canonical(stamp));
  } catch {
    return false;
  }
}

/** Pure: whether `value` has a stamp's exact shape (nothing about its signature). */
export function isStampShape(value: unknown): value is Stamp {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const s = value as Record<string, unknown>;
  if (s.kind !== "ping" && s.kind !== "download" && s.kind !== "upload") return false;
  if (typeof s.nonce !== "string" || !NONCE_RE.test(s.nonce)) return false;
  if (typeof s.at !== "number" || !Number.isInteger(s.at) || s.at <= 0) return false;
  if (typeof s.bytes !== "number" || !Number.isInteger(s.bytes) || s.bytes < 0) return false;
  if (s.prev_nonce !== null && (typeof s.prev_nonce !== "string" || !NONCE_RE.test(s.prev_nonce))) return false;
  if (typeof s.prev_at !== "number" || !Number.isInteger(s.prev_at) || s.prev_at <= 0) return false;
  if (s.candidate !== undefined && (typeof s.candidate !== "string" || s.candidate.length === 0 || s.candidate.length > 64)) return false;
  if (s.timing !== undefined && s.timing !== "stream" && s.timing !== "chain") return false;
  if (s.timing !== undefined && s.kind !== "upload") return false;
  if (s.head !== undefined && (s.head !== true || s.kind !== "download")) return false;
  if (s.ip !== undefined && (typeof s.ip !== "string" || !ADDRESS_RE.test(s.ip))) return false;
  if (s.ua !== undefined && (typeof s.ua !== "string" || !UA_HASH_RE.test(s.ua))) return false;
  if (typeof s.sig !== "string" || !SIG_RE.test(s.sig)) return false;
  return true;
}

/** Pure: the requester's address as a stamp carries it, or null when the
 *  platform reported none (bestEffortIp says "unknown") or it is not one. */
export function cleanAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed !== "unknown" && ADDRESS_RE.test(trimmed) ? trimmed : null;
}

/** The first 16 hex characters of SHA-256 of a User-Agent string ("" included). */
export async function userAgentHash(userAgent: string | null | undefined): Promise<string> {
  const digest = new Uint8Array(await subtle().digest("SHA-256", new Uint8Array(encoder.encode(userAgent ?? ""))));
  return toHex(digest).slice(0, 16);
}

/** The JSON text a stamp travels as (the `x-stamp` header, the body tail, the `prev` handed back). */
export function encodeStamp(stamp: Stamp): string {
  const out: Record<string, unknown> = {
    kind: stamp.kind,
    nonce: stamp.nonce,
    at: stamp.at,
    bytes: stamp.bytes,
    prev_nonce: stamp.prev_nonce,
    prev_at: stamp.prev_at,
  };
  if (stamp.candidate !== undefined) out.candidate = stamp.candidate;
  if (stamp.timing !== undefined) out.timing = stamp.timing;
  if (stamp.head) out.head = true;
  if (stamp.ip !== undefined) out.ip = stamp.ip;
  if (stamp.ua !== undefined) out.ua = stamp.ua;
  out.sig = stamp.sig;
  return JSON.stringify(out);
}

/** A stamp from its JSON text, or null when it is not one (the signature is not checked here). */
export function decodeStamp(text: unknown): Stamp | null {
  if (typeof text !== "string" || !text.trim() || text.length > 1024) return null;
  try {
    const parsed = JSON.parse(text.trim());
    return isStampShape(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** The last 512 bytes of a download: the stamp's JSON padded with spaces. */
export function stampTail(stamp: Stamp): Uint8Array {
  const json = encoder.encode(encodeStamp(stamp));
  if (json.length > STAMP_TAIL_BYTES) {
    throw new Error(`stamp is ${json.length} bytes; the body tail holds ${STAMP_TAIL_BYTES}`);
  }
  const out = new Uint8Array(STAMP_TAIL_BYTES).fill(0x20);
  out.set(json, 0);
  return out;
}

/** The stamp at the end of a download body (the page reads it from the bytes it received). */
export function readStampTail(body: Uint8Array): Stamp | null {
  if (body.length < STAMP_TAIL_BYTES) return null;
  return decodeStamp(decoder.decode(body.subarray(body.length - STAMP_TAIL_BYTES)));
}

/** Pure: the upload stamp's diagnostic label, from its own two times (see UploadTiming). */
export function uploadTiming(received: number, at: number): UploadTiming {
  return at - received >= STREAMED_UPLOAD_MIN_MS ? "stream" : "chain";
}

// ============================================================================
// The chain
// ============================================================================

export type ChainRefusalReason =
  /** Not a list of stamps, or an empty one. */
  | "no_stamps"
  /** More stamps than one run could produce. */
  | "too_many_steps"
  /** An entry is not a stamp (shape). */
  | "not_a_stamp"
  /** A stamp was not signed by this server, or was edited. */
  | "bad_signature"
  /** The header copy of a download stamp: it arrives before the body, so it proves nothing. */
  | "head_copy"
  /** The first stamp names a predecessor: the chain's start is missing. */
  | "not_a_chain_start"
  /** A stamp does not name the stamp before it. */
  | "chain_broken"
  /** Not the contract's order: a ping first, then pings, downloads, uploads. */
  | "out_of_order"
  /** The stamps name more than one browser (User-Agent). */
  | "mixed_browsers"
  /** A nonce appears twice. */
  | "nonce_reused"
  /** A stamp is older than STAMP_MAX_AGE_MS. */
  | "stale"
  /** A stamp is from the future (beyond STAMP_MAX_AHEAD_MS). */
  | "future"
  /** A stamp belongs to another signed-in user, or to none. */
  | "foreign"
  /** Fewer pings, downloads or uploads than MIN_STEPS. */
  | "too_few_steps";

export interface ChainCounts {
  ping: number;
  download: number;
  upload: number;
}

/** Where a verified chain's requests came from (its stamps' `ip` and `ua`). */
export interface ChainSource {
  /** Every distinct address the stamps name, in chain order. */
  addresses: string[];
  /** The one User-Agent hash every stamp carries, or null when none does. */
  ua: string | null;
}

export type ChainVerdict =
  | { ok: true; chain: Stamp[]; counts: ChainCounts; source: ChainSource }
  | { ok: false; reason: ChainRefusalReason; index: number | null; detail: string };

export interface VerifyChainOptions {
  /** The verifier's clock, ms. */
  now: number;
  /** The signed-in user the chain must belong to. Every stamp must name exactly this subject. */
  candidate: string;
  maxAgeMs?: number;
  maxAheadMs?: number;
  minSteps?: Partial<ChainCounts>;
}

/** Plain words for a refusal, for the page (docs/EQUIPMENT-CHECK.md §4: "a reason the page shows"). */
export function chainRefusalText(reason: ChainRefusalReason): string {
  switch (reason) {
    case "no_stamps":
    case "not_a_stamp":
    case "bad_signature":
    case "head_copy":
    case "not_a_chain_start":
    case "chain_broken":
    case "out_of_order":
    case "nonce_reused":
    case "too_many_steps":
      return "The test's record did not add up, so it was not saved. Run it again.";
    case "mixed_browsers":
      return "Parts of this test came from different browsers. Run it again in one browser.";
    case "stale":
    case "future":
      return "This test is more than 20 minutes old. Run it again.";
    case "foreign":
      return "This test was run under another sign-in. Run it again.";
    case "too_few_steps":
      return "The test did not finish every part. Run it again.";
    default:
      return "The test could not be saved. Run it again.";
  }
}

/** The contract's order: pings, then downloads, then uploads. */
const KIND_ORDER: Record<StampKind, number> = { ping: 0, download: 1, upload: 2 };

/**
 * Verifies a chain (docs/EQUIPMENT-CHECK.md §4 `record`): every signature,
 * one unbroken chain (each `prev_nonce` names the stamp before it, no gaps,
 * no reuse, a real start), no download header copies, the contract's order
 * (a ping first; pings, then downloads, then uploads), every `at` and
 * `prev_at` within the last 20 minutes, every stamp bound to `candidate`,
 * one browser throughout, and enough of each kind. Checks run in that order,
 * so the reason names the first thing wrong and `index` the stamp it was
 * found on. A chain from more than one address is NOT refused (a connection
 * can move between IPv4 and IPv6, or a phone between networks, mid-test);
 * `source` names every address so `record` can flag it.
 */
export async function verifyChain(secret: CryptoKey, stamps: unknown, options: VerifyChainOptions): Promise<ChainVerdict> {
  if (!Array.isArray(stamps) || stamps.length === 0) {
    return { ok: false, reason: "no_stamps", index: null, detail: "no stamps were sent" };
  }
  if (stamps.length > MAX_CHAIN_LENGTH) {
    return { ok: false, reason: "too_many_steps", index: null, detail: `${stamps.length} stamps; at most ${MAX_CHAIN_LENGTH}` };
  }
  const chain: Stamp[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const raw = stamps[i];
    const stamp = typeof raw === "string" ? decodeStamp(raw) : isStampShape(raw) ? raw : null;
    if (!stamp) return { ok: false, reason: "not_a_stamp", index: i, detail: `stamp ${i} is not a stamp` };
    chain.push(stamp);
  }
  for (let i = 0; i < chain.length; i++) {
    if (!(await verifyStamp(secret, chain[i]))) {
      return { ok: false, reason: "bad_signature", index: i, detail: `stamp ${i} (${chain[i].kind}) is not signed by this server` };
    }
  }
  const seen = new Set<string>();
  for (let i = 0; i < chain.length; i++) {
    const stamp = chain[i];
    if (stamp.head) return { ok: false, reason: "head_copy", index: i, detail: `stamp ${i} is a download's header copy` };
    if (i === 0) {
      if (stamp.prev_nonce !== null) {
        return { ok: false, reason: "not_a_chain_start", index: 0, detail: "the first stamp names a predecessor" };
      }
    } else if (stamp.prev_nonce !== chain[i - 1].nonce) {
      return { ok: false, reason: "chain_broken", index: i, detail: `stamp ${i} does not follow stamp ${i - 1}` };
    }
    if (seen.has(stamp.nonce)) return { ok: false, reason: "nonce_reused", index: i, detail: `nonce ${stamp.nonce} appears twice` };
    seen.add(stamp.nonce);
  }
  for (let i = 0; i < chain.length; i++) {
    const stamp = chain[i];
    if (i === 0 ? stamp.kind !== "ping" : KIND_ORDER[stamp.kind] < KIND_ORDER[chain[i - 1].kind]) {
      return {
        ok: false,
        reason: "out_of_order",
        index: i,
        detail: i === 0 ? `the chain starts with a ${stamp.kind}, not a ping` : `a ${stamp.kind} after a ${chain[i - 1].kind}`,
      };
    }
  }
  const maxAge = options.maxAgeMs ?? STAMP_MAX_AGE_MS;
  const maxAhead = options.maxAheadMs ?? STAMP_MAX_AHEAD_MS;
  for (let i = 0; i < chain.length; i++) {
    const stamp = chain[i];
    for (const t of [stamp.at, stamp.prev_at]) {
      if (options.now - t > maxAge) return { ok: false, reason: "stale", index: i, detail: `stamp ${i} is ${Math.round((options.now - t) / 1000)} s old` };
      if (t - options.now > maxAhead) return { ok: false, reason: "future", index: i, detail: `stamp ${i} is ${Math.round((t - options.now) / 1000)} s ahead` };
    }
  }
  for (let i = 0; i < chain.length; i++) {
    if (chain[i].candidate !== options.candidate) {
      return { ok: false, reason: "foreign", index: i, detail: `stamp ${i} is not bound to this candidate` };
    }
  }
  for (let i = 1; i < chain.length; i++) {
    if (chain[i].ua !== chain[0].ua) {
      return { ok: false, reason: "mixed_browsers", index: i, detail: `stamp ${i} names another browser than stamp 0` };
    }
  }
  const counts: ChainCounts = { ping: 0, download: 0, upload: 0 };
  for (const stamp of chain) counts[stamp.kind] += 1;
  const min = { ...MIN_STEPS, ...(options.minSteps ?? {}) };
  for (const kind of ["ping", "download", "upload"] as const) {
    if (counts[kind] < min[kind]) {
      return { ok: false, reason: "too_few_steps", index: null, detail: `${counts[kind]} ${kind}(s); at least ${min[kind]} needed` };
    }
  }
  const addresses: string[] = [];
  for (const stamp of chain) if (stamp.ip !== undefined && !addresses.includes(stamp.ip)) addresses.push(stamp.ip);
  return { ok: true, chain, counts, source: { addresses, ua: chain[0].ua ?? null } };
}

// ============================================================================
// The figures
// ============================================================================

export interface Figures {
  /** Median ping round trip, whole ms. Null when no ping was followed by another request. */
  latencyMs: number | null;
  /** Mean absolute deviation of the round trips from their median, whole ms. */
  jitterMs: number | null;
  /** Total download bytes ÷ total proven download time, megabits (10^6) per second, 1 decimal. */
  downloadMbps: number | null;
  /** Same for the uploads that have a proven start (every one after the first). */
  uploadMbps: number | null;
  /** Each counted ping's round trip, ms, in chain order. */
  pings: number[];
  downloads: Array<{ bytes: number; ms: number }>;
  /** The counted uploads; `timing` is the stamp's diagnostic label only. */
  uploads: Array<{ bytes: number; ms: number; timing: UploadTiming }>;
  downloadBytes: number;
  downloadMs: number;
  uploadBytes: number;
  uploadMs: number;
  /** Steps whose interval came out at 0 ms or less (clocks disagreeing):
   *  left out, bytes and time together. */
  unproven: number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** bits ÷ µs = Mbps: bytes × 8 / (ms × 1000), to one decimal. Null when no time was proven. */
export function mbps(bytes: number, ms: number): number | null {
  if (!(ms > 0) || !(bytes > 0)) return null;
  return Math.round(((bytes * 8) / (ms * 1000)) * 10) / 10;
}

/**
 * Pure: the three figures from a verified chain, from the stamps alone
 * (docs/EQUIPMENT-CHECK.md §4). Every interval is one the page could only
 * make LONGER:
 *   - ping N's round trip = `prev_at` of the next stamp (when the request
 *     carrying stamp N arrived) − `at` of stamp N (when the ping answered);
 *   - a download's time = `prev_at` of the next stamp − its own `at`
 *     (streaming began); its bytes are the body length;
 *   - an upload's time = its `at` (last byte in) − the PREVIOUS upload's
 *     `at`: its body could only leave the page once the page held that
 *     stamp. The first upload has no such start (the stamp before it is a
 *     download, whose `at` is when that download BEGAN): it closes the last
 *     download, and its own bytes and time are not counted.
 * The last stamp of a chain has nothing after it, so a ping or a download
 * there is not counted; an upload there is (its time needs no next request).
 * An interval of 0 ms or less proves nothing (another worker's clock): that
 * step's bytes and time are both left out (`unproven`), never the time alone.
 */
export function figuresFromChain(chain: readonly Stamp[]): Figures {
  const pings: number[] = [];
  const downloads: Array<{ bytes: number; ms: number }> = [];
  const uploads: Array<{ bytes: number; ms: number; timing: UploadTiming }> = [];
  let unproven = 0;
  for (let i = 0; i < chain.length; i++) {
    const stamp = chain[i];
    const next = i + 1 < chain.length ? chain[i + 1] : null;
    const previous = i > 0 ? chain[i - 1] : null;
    if (stamp.kind === "ping") {
      if (!next) continue;
      const ms = next.prev_at - stamp.at;
      if (ms > 0) pings.push(ms);
      else unproven += 1;
    } else if (stamp.kind === "download") {
      if (!next) continue;
      const ms = next.prev_at - stamp.at;
      if (ms > 0) downloads.push({ bytes: stamp.bytes, ms });
      else unproven += 1;
    } else {
      // Only an upload that follows an upload has a proven start.
      if (!previous || previous.kind !== "upload") continue;
      const ms = stamp.at - previous.at;
      if (ms > 0) uploads.push({ bytes: stamp.bytes, ms, timing: stamp.timing ?? "chain" });
      else unproven += 1;
    }
  }
  const downloadBytes = downloads.reduce((sum, d) => sum + d.bytes, 0);
  const downloadMs = downloads.reduce((sum, d) => sum + d.ms, 0);
  const uploadBytes = uploads.reduce((sum, u) => sum + u.bytes, 0);
  const uploadMs = uploads.reduce((sum, u) => sum + u.ms, 0);
  const latency = pings.length ? median(pings) : null;
  const jitter = latency === null ? null : pings.reduce((sum, p) => sum + Math.abs(p - latency), 0) / pings.length;
  return {
    latencyMs: latency === null ? null : Math.round(latency),
    jitterMs: jitter === null ? null : Math.round(jitter),
    downloadMbps: mbps(downloadBytes, downloadMs),
    uploadMbps: mbps(uploadBytes, uploadMs),
    pings,
    downloads,
    uploads,
    downloadBytes,
    downloadMs,
    uploadBytes,
    uploadMs,
    unproven,
  };
}

// ============================================================================
// The result (docs/EQUIPMENT-CHECK.md §5): what `record` writes to
// notes.equipmentCheckResult, and how every reader reads it back.
// ============================================================================

export interface ConnectionBars {
  minDownloadMbps: number;
  minUploadMbps: number;
  maxLatencyMs: number;
}

/** The live job's own numbers (docs/EQUIPMENT-CHECK.md §2). */
export const DEFAULT_BARS: Readonly<ConnectionBars> = Object.freeze({ minDownloadMbps: 10, minUploadMbps: 3, maxLatencyMs: 200 });

export type UsingThisComputer = "yes" | "no_switched" | "ran_here_anyway";
export type DeviceKind = "computer" | "phone" | "tablet";
export type BarName = "download" | "upload" | "latency";

export interface DeviceFacts {
  os: string | null;
  osVersion: string | null;
  browser: string | null;
  browserVersion: string | null;
  screen: string | null;
  dpr: number | null;
  cores: number | null;
  memoryGb: number | null;
  touch: boolean | null;
  language: string | null;
  timezone: string | null;
  connectionType: string | null;
  model: string | null;
}

/**
 * Where the test ran against where it was sent from (docs/EQUIPMENT-CHECK.md
 * §4, §5): each one null when a side is unknown (the platform named no
 * address). Facts for the hiring team, never a refusal: an address can
 * change in 20 minutes, and a full remote desktop still passes them all.
 */
export interface ConnectionSource {
  /** The test's requests all came from one address (false: from more than one). */
  oneAddress: boolean | null;
  /** The request that sent the result came from an address the test ran from. */
  sameAddress: boolean | null;
  /** The browser that sent the result is the one the test ran in (User-Agent). */
  sameBrowser: boolean | null;
}

/** Pure: the source facts from a verified chain's source and the sending request's own address and User-Agent hash. */
export function connectionSource(chain: ChainSource, sender: { address: string | null; ua: string | null }): ConnectionSource {
  return {
    oneAddress: chain.addresses.length === 0 ? null : chain.addresses.length === 1,
    sameAddress: chain.addresses.length === 0 || !sender.address ? null : chain.addresses.includes(sender.address),
    sameBrowser: !chain.ua || !sender.ua ? null : chain.ua === sender.ua,
  };
}

export interface EquipmentCheckResult {
  downloadMbps: number;
  uploadMbps: number;
  latencyMs: number;
  jitterMs: number;
  measuredBy: "server";
  /** How many runs the applicant had finished when this one was sent, the sent one included (1 to 3 on the page). */
  runs: number;
  usingThisComputer: UsingThisComputer;
  deviceKind: DeviceKind;
  device: DeviceFacts;
  bars: ConnectionBars;
  meetsBars: boolean;
  below: BarName[];
  measuredAt: string;
  attempt: number;
  /** Where the test ran against where it was sent from. */
  source: ConnectionSource;
  _trusted: true;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveNumber(value: unknown): number | null {
  const n = finiteNumber(value);
  return n !== null && n > 0 ? n : null;
}

/**
 * Pure: the job's bars from the step's config `{min_download_mbps,
 * min_upload_mbps, max_latency_ms}` (camelCase accepted too), each one
 * falling back to the default when missing or not a positive number.
 */
export function connectionBars(config: unknown): ConnectionBars {
  const c = config && typeof config === "object" && !Array.isArray(config) ? (config as Record<string, unknown>) : {};
  return {
    minDownloadMbps: positiveNumber(c.min_download_mbps ?? c.minDownloadMbps) ?? DEFAULT_BARS.minDownloadMbps,
    minUploadMbps: positiveNumber(c.min_upload_mbps ?? c.minUploadMbps) ?? DEFAULT_BARS.minUploadMbps,
    maxLatencyMs: positiveNumber(c.max_latency_ms ?? c.maxLatencyMs) ?? DEFAULT_BARS.maxLatencyMs,
  };
}

/** Pure: which bars a set of figures misses, in the fixed order download, upload, latency. */
export function barsBelow(figures: { downloadMbps: number; uploadMbps: number; latencyMs: number }, bars: ConnectionBars): BarName[] {
  const below: BarName[] = [];
  if (figures.downloadMbps < bars.minDownloadMbps) below.push("download");
  if (figures.uploadMbps < bars.minUploadMbps) below.push("upload");
  if (figures.latencyMs > bars.maxLatencyMs) below.push("latency");
  return below;
}

export function cleanUsingThisComputer(value: unknown): UsingThisComputer | null {
  return value === "yes" || value === "no_switched" || value === "ran_here_anyway" ? value : null;
}

export function cleanDeviceKind(value: unknown): DeviceKind | null {
  return value === "computer" || value === "phone" || value === "tablet" ? value : null;
}

const DEVICE_TEXT_MAX = 80;

function deviceText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Control characters are exactly what this strips.
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return clean ? clean.slice(0, DEVICE_TEXT_MAX) : null;
}

/** Pure: the device facts the page read, kept to the known keys and sane values. */
export function cleanDevice(value: unknown): DeviceFacts {
  const d = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const dpr = finiteNumber(d.dpr);
  const cores = finiteNumber(d.cores);
  const memoryGb = finiteNumber(d.memoryGb);
  return {
    os: deviceText(d.os),
    osVersion: deviceText(d.osVersion),
    browser: deviceText(d.browser),
    browserVersion: deviceText(d.browserVersion),
    screen: deviceText(d.screen),
    dpr: dpr !== null && dpr > 0 && dpr <= 10 ? Math.round(dpr * 100) / 100 : null,
    cores: cores !== null && cores >= 1 && cores <= 1024 ? Math.round(cores) : null,
    memoryGb: memoryGb !== null && memoryGb > 0 && memoryGb <= 4096 ? Math.round(memoryGb * 100) / 100 : null,
    touch: typeof d.touch === "boolean" ? d.touch : null,
    language: deviceText(d.language),
    timezone: deviceText(d.timezone),
    connectionType: deviceText(d.connectionType),
    model: deviceText(d.model),
  };
}

/** Pure: the result `record` writes (docs/EQUIPMENT-CHECK.md §5) from the server's figures and the page's facts. */
export function buildEquipmentCheckResult(input: {
  figures: { downloadMbps: number; uploadMbps: number; latencyMs: number; jitterMs: number };
  bars: ConnectionBars;
  runs: number;
  usingThisComputer: UsingThisComputer;
  deviceKind: DeviceKind;
  device: DeviceFacts;
  measuredAt: string;
  attempt: number;
  source: ConnectionSource;
}): EquipmentCheckResult {
  const below = barsBelow(input.figures, input.bars);
  return {
    downloadMbps: input.figures.downloadMbps,
    uploadMbps: input.figures.uploadMbps,
    latencyMs: input.figures.latencyMs,
    jitterMs: input.figures.jitterMs,
    measuredBy: "server",
    runs: Math.max(1, Math.min(99, Math.round(input.runs))),
    usingThisComputer: input.usingThisComputer,
    deviceKind: input.deviceKind,
    device: input.device,
    bars: input.bars,
    meetsBars: below.length === 0,
    below,
    measuredAt: input.measuredAt,
    attempt: Math.max(1, Math.round(input.attempt)),
    source: input.source,
    _trusted: true,
  };
}

function cleanSource(value: unknown): ConnectionSource {
  const v = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const flag = (x: unknown) => (typeof x === "boolean" ? x : null);
  return { oneAddress: flag(v.oneAddress), sameAddress: flag(v.sameAddress), sameBrowser: flag(v.sameBrowser) };
}

/**
 * Pure: a stored notes.equipmentCheckResult as every reader (trigger-ava-analysis,
 * the dossier, the shortlist, the performance report) sees it, or null when
 * the value is not a recorded result. Tolerant of a missing field here and
 * there; never of a missing figure, and never of a value that does not say
 * the server timed it (`measuredBy: "server"`, which only `record` writes):
 * that is not turned into a server-timed result here. Readers that can see
 * the whole notes object use recordedEquipmentCheck, which also wants the
 * server's own marker.
 */
export function readEquipmentCheckResult(value: unknown): EquipmentCheckResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  if (r.measuredBy !== "server") return null;
  const downloadMbps = finiteNumber(r.downloadMbps);
  const uploadMbps = finiteNumber(r.uploadMbps);
  const latencyMs = finiteNumber(r.latencyMs);
  if (downloadMbps === null || uploadMbps === null || latencyMs === null) return null;
  const bars = connectionBars(
    r.bars && typeof r.bars === "object"
      ? {
        min_download_mbps: (r.bars as Record<string, unknown>).minDownloadMbps,
        min_upload_mbps: (r.bars as Record<string, unknown>).minUploadMbps,
        max_latency_ms: (r.bars as Record<string, unknown>).maxLatencyMs,
      }
      : null,
  );
  const figures = { downloadMbps, uploadMbps, latencyMs, jitterMs: finiteNumber(r.jitterMs) ?? 0 };
  const below = Array.isArray(r.below)
    ? (r.below.filter((b) => b === "download" || b === "upload" || b === "latency") as BarName[])
    : barsBelow(figures, bars);
  return {
    ...figures,
    measuredBy: "server",
    runs: Math.max(0, Math.round(finiteNumber(r.runs) ?? 0)),
    usingThisComputer: cleanUsingThisComputer(r.usingThisComputer) ?? "yes",
    deviceKind: cleanDeviceKind(r.deviceKind) ?? "computer",
    device: cleanDevice(r.device),
    bars,
    meetsBars: typeof r.meetsBars === "boolean" ? r.meetsBars : below.length === 0,
    below,
    measuredAt: typeof r.measuredAt === "string" ? r.measuredAt : "",
    attempt: Math.max(1, Math.round(finiteNumber(r.attempt) ?? 1)),
    source: cleanSource(r.source),
    _trusted: true,
  };
}

/**
 * Pure: the recorded result from a whole parsed notes object, or null unless
 * the SERVER recorded it: recordStepResult writes `_trusted[stepId]` (a key
 * no candidate write can ever produce) beside every result, so a value with
 * no `equipment_check` marker is not one, whatever it says about itself.
 * `stepIds` narrows the marker to the job's own equipment_check steps.
 */
export function recordedEquipmentCheck(notes: unknown, stepIds?: readonly string[]): EquipmentCheckResult | null {
  if (!notes || typeof notes !== "object" || Array.isArray(notes)) return null;
  const n = notes as Record<string, unknown>;
  const markers = n._trusted && typeof n._trusted === "object" && !Array.isArray(n._trusted) ? (n._trusted as Record<string, unknown>) : null;
  if (!markers) return null;
  const marked = Object.entries(markers).some(([stepId, marker]) =>
    (!stepIds || stepIds.includes(stepId)) &&
    !!marker && typeof marker === "object" && (marker as Record<string, unknown>).stepType === "equipment_check"
  );
  return marked ? readEquipmentCheckResult(n.equipmentCheckResult) : null;
}

/** "Download 28 Mbps · we ask for 10" style words for one missed bar, in staff prose. */
export function barShortfallText(result: EquipmentCheckResult, bar: BarName): string {
  switch (bar) {
    case "download":
      return `download ${result.downloadMbps} Mbps (asked for ${result.bars.minDownloadMbps})`;
    case "upload":
      return `upload ${result.uploadMbps} Mbps (asked for ${result.bars.minUploadMbps})`;
    default:
      return `latency ${result.latencyMs} ms (asked for ${result.bars.maxLatencyMs} or under)`;
  }
}

/**
 * The flags the hiring team sees, each one its own line (docs/EQUIPMENT-CHECK.md
 * §6). A switch to the right computer ("no_switched") is what the page asked
 * for, so it is never a flag: the answer itself says it, in neutral words.
 * The cockpit's equipmentFlags (src/cockpit/lib/assessmentRecord.ts) says the
 * same lines in the same order.
 */
export function connectionFlags(result: EquipmentCheckResult): string[] {
  const flags: string[] = [];
  if (result.usingThisComputer === "ran_here_anyway") flags.push("Not the computer they'll work from (ran here anyway)");
  if (result.deviceKind === "phone") flags.push("Ran on a phone");
  else if (result.deviceKind === "tablet") flags.push("Ran on a tablet");
  if (result.runs >= 3) flags.push(`Sent after ${result.runs} runs`);
  if (result.source.sameAddress === false) flags.push("Sent from a different network than the test ran on");
  else if (result.source.oneAddress === false) flags.push("The test ran from more than one network");
  if (result.source.sameBrowser === false) flags.push("Sent from a different browser than the test ran in");
  return flags;
}

function deviceWords(result: EquipmentCheckResult): string {
  const d = result.device;
  const os = [d.os, d.osVersion].filter(Boolean).join(" ");
  const platform = [os, d.browser].filter(Boolean).join(" / ") || "an unknown device";
  const screen = d.screen ? ` on a ${d.screen} ${result.deviceKind}` : ` on a ${result.deviceKind}`;
  return `${platform}${screen}`;
}

/**
 * The one line Ava and the staff summaries get (docs/EQUIPMENT-CHECK.md §6):
 * "Connection: 28 Mbps down, 9 up, 42 ms, timed by our server; Windows 11 /
 * Chrome on a 1920×1080 computer; says it is the computer they will use."
 */
export function connectionEvidenceLine(result: EquipmentCheckResult): string {
  const computer = result.usingThisComputer === "yes"
    ? "says it is the computer they will use"
    : result.usingThisComputer === "no_switched"
      ? "switched to the computer they will use before running it"
      : "says it is NOT the computer they will use (ran here anyway)";
  const verdict = result.meetsBars
    ? `meets the job's bar (${result.bars.minDownloadMbps} down, ${result.bars.minUploadMbps} up, ${result.bars.maxLatencyMs} ms)`
    : `below the job's bar: ${result.below.map((bar) => barShortfallText(result, bar)).join(", ")}`;
  const source = [
    result.source.sameAddress === false ? "sent from a different network than the test ran on" : null,
    result.source.sameAddress !== false && result.source.oneAddress === false ? "the test ran from more than one network" : null,
    result.source.sameBrowser === false ? "sent from a different browser than the test ran in" : null,
  ].filter(Boolean);
  return `Connection: ${result.downloadMbps} Mbps down, ${result.uploadMbps} up, ${result.latencyMs} ms, timed by our server; ` +
    `${deviceWords(result)}; ${computer}; ${verdict}${source.length ? `; ${source.join("; ")}` : ""}.`;
}

// ============================================================================
// The runs, and the page's markers (docs/EQUIPMENT-CHECK.md §3 and §5)
// ============================================================================

/** The most runs one record or marker may name (the page stops at 3). */
export const MAX_RUN_NUMBER = 99;

/** A run number the page counted (1, 2, 3 …), or null when it is not one. */
export function cleanRunNumber(value: unknown): number | null {
  const n = finiteNumber(value);
  if (n === null || !Number.isInteger(n) || n < 1 || n > MAX_RUN_NUMBER) return null;
  return n;
}

/**
 * Pure: `record`'s `runs`, as the count §5 stores: how many runs the
 * applicant had finished when this one was sent, the sent one included. The
 * page sends the list of its finished runs (each with its own page-side
 * estimate, kept in grading.raw); a bare count is read as the count. Never
 * below 1: a sent run is a run.
 */
export function runsFinished(value: unknown): number {
  if (Array.isArray(value)) return Math.max(1, Math.min(MAX_RUN_NUMBER, value.length));
  const n = finiteNumber(value);
  return n === null ? 1 : Math.max(1, Math.min(MAX_RUN_NUMBER, Math.round(n)));
}

/**
 * Pure: which run was sent, for the staff timeline's markers: the run the
 * page's `estimate` names, else the entry of `runs` marked `sent`, else the
 * last one. Always between 1 and `total`.
 */
export function sentRunNumber(runs: unknown, estimate: unknown, total: number): number {
  const named = estimate && typeof estimate === "object" && !Array.isArray(estimate)
    ? cleanRunNumber((estimate as Record<string, unknown>).run)
    : null;
  const marked = Array.isArray(runs)
    ? cleanRunNumber(
      (runs.find((r) => r && typeof r === "object" && (r as Record<string, unknown>).sent === true) as Record<string, unknown> | undefined)?.run,
    )
    : null;
  const run = named ?? marked ?? total;
  return Math.max(1, Math.min(total, run));
}

/** The `system` markers the page asks connection-test to write as they happen (`op=event`). */
export type ConnectionMarker = "device_read" | "computer_answer" | "test_started" | "test_finished";

/** The answer to the computer question as a marker records it: §5's three, plus a plain "no" (the step stays open). */
export type ComputerAnswer = UsingThisComputer | "no";

function pageFigure(value: unknown, decimals: 0 | 1, max: number): number | null {
  const n = finiteNumber(value);
  if (n === null || n < 0 || n > max) return null;
  const f = decimals === 1 ? 10 : 1;
  return Math.round(n * f) / f;
}

/**
 * Pure: one marker's `detail`, kept to the keys the staff timeline reads
 * (src/cockpit/lib/assessmentRecord.ts mergeConnectionEvents), or null when
 * `what` is not a marker or the detail cannot say what the marker means.
 * Facts, never figures the record trusts: a `test_finished` carries the
 * page's own estimate and says so; the server's figures for that run are a
 * separate `test_run` marker computed from its stamps.
 */
export function cleanConnectionMarker(what: unknown, detail: unknown): { what: ConnectionMarker; detail: Record<string, unknown> } | null {
  const d = detail && typeof detail === "object" && !Array.isArray(detail) ? (detail as Record<string, unknown>) : {};
  switch (what) {
    case "device_read": {
      const device = cleanDevice(d.device);
      const join = (...parts: Array<string | null>) => parts.filter(Boolean).join(" ") || null;
      return {
        what,
        detail: {
          what,
          device_kind: cleanDeviceKind(d.device_kind),
          os: join(device.os, device.osVersion),
          browser: join(device.browser, device.browserVersion),
          screen: device.screen,
        },
      };
    }
    case "computer_answer": {
      const answer: ComputerAnswer | null = d.answer === "no" ? "no" : cleanUsingThisComputer(d.answer);
      return answer ? { what, detail: { what, answer } } : null;
    }
    case "test_started": {
      const run = cleanRunNumber(d.run);
      return run === null ? null : { what, detail: { what, run } };
    }
    case "test_finished": {
      const run = cleanRunNumber(d.run);
      if (run === null) return null;
      return {
        what,
        detail: {
          what,
          run,
          download_mbps: pageFigure(d.download_mbps, 1, 100_000),
          upload_mbps: pageFigure(d.upload_mbps, 1, 100_000),
          latency_ms: pageFigure(d.latency_ms, 0, 600_000),
          estimate: "page",
        },
      };
    }
    default:
      return null;
  }
}
