/**
 * connectionTest.ts — the browser side of the computer and connection check
 * (docs/EQUIPMENT-CHECK.md §1, §3 and §4).
 *
 * The test is a CHAIN of requests to the `connection-test` edge function:
 * 8 pings, then 3 downloads one after the other, then 4 uploads of random
 * bytes one after the other. The first download (512 KB) and the first
 * upload (64 KB, which only closes the downloads: the server does not count
 * it) are small, and every later one is sized from how fast the one before
 * it went, up to 3 MB down and 1.5 MB up (nextRequestBytes), so a slow line
 * still finishes inside each request's time limit instead of failing for
 * good. Every response carries a
 * signed stamp (server time, bytes, a nonce) and every next request hands
 * the previous stamp back, so the server times every step on its own clock.
 * A download's stamp is read from the LAST 512 bytes of its body (the copy
 * in the `x-stamp` header arrives first and proves nothing). This module
 * never times anything the server will trust: the running estimate it
 * reports is for the gauge on the candidate's screen, and `record`
 * recomputes every figure from the stamps and ignores it.
 *
 * Deliberately IMPORT-FREE: the page hands in the transport (built from
 * `supabase.functions.invoke`, which the dev preview can answer offline), so
 * the chain runner, the stamp-tail parser, the estimate maths and the device
 * parsing run under plain Node for scripts/connection_check_client.test.mjs.
 */

// ============================================================================
// The chain's shape (docs/EQUIPMENT-CHECK.md §3)
// ============================================================================

export const PING_COUNT = 8;
export const DOWNLOAD_COUNT = 3;
/** The most one download asks for (the server's cap). */
export const DOWNLOAD_BYTES = 3 * 1024 * 1024;
export const UPLOAD_COUNT = 4;
/** The most one upload carries (the server's cap). */
export const UPLOAD_BYTES = Math.round(1.5 * 1024 * 1024);
/** The first of each: small enough to finish inside its time limit on a very
 *  slow line (512 KB in 90 s is about 0.05 Mbps; 64 KB up, about 0.006). */
export const FIRST_DOWNLOAD_BYTES = 512 * 1024;
export const FIRST_UPLOAD_BYTES = 64 * 1024;
/** The least a later one asks for, however slow the one before it was. */
export const MIN_DOWNLOAD_BYTES = 64 * 1024;
export const MIN_UPLOAD_BYTES = 32 * 1024;
/** How long a later download or upload is sized to take, from the one before it. */
export const TARGET_REQUEST_MS = Object.freeze({ download: 2_500, upload: 2_000 });
/** Steps in one chain: the gauge counts them. */
export const CHAIN_STEPS = PING_COUNT + DOWNLOAD_COUNT + UPLOAD_COUNT;
/** The stamp sits in the last this many bytes of a download, space-padded. */
export const STAMP_TAIL_BYTES = 512;
/** "Run it again" is offered until this many runs have finished. */
export const MAX_RUNS = 3;
/** A request that fails is sent once more with the same previous stamp. */
export const RETRIES_PER_REQUEST = 1;
/** How long each kind of request may take before it counts as failed. */
export const REQUEST_TIMEOUT_MS = Object.freeze({ ping: 15_000, download: 90_000, upload: 90_000 });

export type StepKind = "ping" | "download" | "upload";

/** The fields a stamp's JSON carries (connection-test signs them; the page reads only the shape). */
export interface StampShape {
  kind: StepKind;
  nonce: string;
  at: number;
  bytes: number;
  prev_nonce: string | null;
  prev_at: number;
  candidate?: string;
  timing?: "stream" | "chain";
  head?: true;
  /** Where the request came from, and a hash of its User-Agent (the server's to compare). */
  ip?: string;
  ua?: string;
  sig: string;
}

const NONCE_RE = /^[0-9a-f]{16}$/;

/** Pure: the stamp in a piece of JSON text, or null when the text is not one. The signature is the server's to check. */
export function parseStampText(text: unknown): StampShape | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 1024) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const s = parsed as Record<string, unknown>;
  if (s.kind !== "ping" && s.kind !== "download" && s.kind !== "upload") return null;
  if (typeof s.nonce !== "string" || !NONCE_RE.test(s.nonce)) return null;
  if (typeof s.at !== "number" || !Number.isFinite(s.at)) return null;
  if (typeof s.bytes !== "number" || !Number.isFinite(s.bytes)) return null;
  if (s.prev_nonce !== null && typeof s.prev_nonce !== "string") return null;
  if (typeof s.prev_at !== "number" || !Number.isFinite(s.prev_at)) return null;
  if (typeof s.sig !== "string" || s.sig.length === 0) return null;
  return s as unknown as StampShape;
}

/**
 * Pure: the stamp text at the end of a download body (the last 512 bytes,
 * JSON padded with spaces), or null when the body is too short, the tail is
 * not a download stamp, or it is the header copy (`head: true`), which is
 * never a chain link. The TEXT is returned, not the parsed object: it is
 * handed back to the server exactly as it came.
 */
export function readStampTail(body: Uint8Array): string | null {
  if (body.length < STAMP_TAIL_BYTES) return null;
  const tail = new TextDecoder().decode(body.subarray(body.length - STAMP_TAIL_BYTES)).trim();
  const stamp = parseStampText(tail);
  if (!stamp || stamp.kind !== "download" || stamp.head) return null;
  return tail;
}

/** Pure: the stamp text in a ping's or upload's JSON reply (`{ stamp }`). */
export function stampFromReply(data: unknown, kind: StepKind): string | null {
  if (!data || typeof data !== "object") return null;
  const text = (data as { stamp?: unknown }).stamp;
  const stamp = parseStampText(text);
  return stamp && stamp.kind === kind && !stamp.head ? (text as string).trim() : null;
}

// ============================================================================
// The transport
// ============================================================================

/** Why a request could not be completed; `retryable` says whether sending it again can help. */
export class ConnectionRequestError extends Error {
  status: number | null;
  code: string | null;
  retryable: boolean;
  constructor(message: string, opts: { status?: number | null; code?: string | null; retryable: boolean }) {
    super(message);
    this.name = "ConnectionRequestError";
    this.status = opts.status ?? null;
    this.code = opts.code ?? null;
    this.retryable = opts.retryable;
  }
}

/**
 * One method per op. Each resolves to the stamp TEXT the response carried
 * (a download's from its body tail) and rejects with ConnectionRequestError.
 * `prev` is the previous response's stamp text, handed back as it came.
 */
export interface ConnectionTransport {
  ping(prev: string | null, signal: AbortSignal): Promise<string>;
  download(prev: string | null, bytes: number, signal: AbortSignal): Promise<string>;
  upload(prev: string | null, body: ArrayBuffer, signal: AbortSignal): Promise<string>;
}

/** The slice of `supabase.functions.invoke` the transport uses. */
export type InvokeLike = (
  name: string,
  options: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal },
) => Promise<{ data: unknown; error: unknown }>;

/** The body of a refused request, when the function wrote one (`{ error, code }`). */
async function refusalOf(error: unknown): Promise<{ status: number | null; code: string | null; message: string | null }> {
  const context = error && typeof error === "object" ? (error as { context?: unknown }).context : null;
  if (!context || typeof context !== "object") return { status: null, code: null, message: null };
  const response = context as { status?: unknown; clone?: () => { json: () => Promise<unknown> }; json?: () => Promise<unknown> };
  const status = typeof response.status === "number" ? response.status : null;
  let body: unknown = null;
  try {
    body = typeof response.clone === "function" ? await response.clone().json() : await response.json?.();
  } catch {
    body = null;
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return {
    status,
    code: typeof b.code === "string" ? b.code : null,
    message: typeof b.error === "string" ? b.error : null,
  };
}

function abortedError(): ConnectionRequestError {
  return new ConnectionRequestError("The test was stopped.", { retryable: false, code: "aborted" });
}

/**
 * The transport every real page uses: each op through `supabase.functions.invoke`
 * (the session's JWT travels with it, and the dev preview answers it offline),
 * the previous stamp in the `x-prev-stamp` header (never the query string, so
 * the browser's CORS preflight is cached across the chain's identical URLs).
 * A 4xx is the server refusing the chain: not retryable. Its `error` is
 * shown only when the reply also carries a `code`: connection-test writes
 * its plain-words refusals with one, and anything else ("Unauthorized",
 * "Unknown op") was never written for an applicant, so this module's own
 * sentence is shown instead. No answer at all, or a 5xx, is retryable: the
 * same request goes once more.
 */
export function createInvokeTransport(invoke: InvokeLike, functionName = "connection-test"): ConnectionTransport {
  const prevHeaders = (prev: string | null): Record<string, string> => (prev ? { "x-prev-stamp": prev } : {});

  const failed = async (error: unknown, signal: AbortSignal, what: string): Promise<never> => {
    if (signal.aborted) throw abortedError();
    const refusal = await refusalOf(error);
    if (refusal.status !== null && refusal.status >= 400 && refusal.status < 500) {
      const words = refusal.code && refusal.message
        ? refusal.message
        : refusal.status === 401
          ? "Your sign-in ran out. Sign in again, then run the test."
          : `${what} was refused.`;
      throw new ConnectionRequestError(words, {
        status: refusal.status,
        code: refusal.code ?? (refusal.status === 401 ? "signed_out" : "refused"),
        retryable: refusal.status === 408 || refusal.status === 429,
      });
    }
    throw new ConnectionRequestError(`${what} did not get through.`, {
      status: refusal.status,
      code: refusal.code,
      retryable: true,
    });
  };

  return {
    async ping(prev, signal) {
      const { data, error } = await invoke(`${functionName}?op=ping`, { method: "GET", headers: prevHeaders(prev), signal });
      if (error) return failed(error, signal, "The ping");
      const stamp = stampFromReply(data, "ping");
      if (!stamp) throw new ConnectionRequestError("The ping came back without its stamp.", { retryable: true, code: "no_stamp" });
      return stamp;
    },
    async download(prev, bytes, signal) {
      const { data, error } = await invoke(`${functionName}?op=download&bytes=${bytes}`, {
        method: "GET",
        headers: prevHeaders(prev),
        signal,
      });
      if (error) return failed(error, signal, "The download");
      const body = await bodyBytes(data);
      if (!body) throw new ConnectionRequestError("The download came back empty.", { retryable: true, code: "no_body" });
      const stamp = readStampTail(body);
      const parsed = stamp ? parseStampText(stamp) : null;
      if (!stamp || !parsed || parsed.bytes !== body.length) {
        throw new ConnectionRequestError("The download did not arrive whole.", { retryable: true, code: "short_download" });
      }
      return stamp;
    },
    async upload(prev, body, signal) {
      const { data, error } = await invoke(`${functionName}?op=upload`, {
        method: "POST",
        headers: prevHeaders(prev),
        body,
        signal,
      });
      if (error) return failed(error, signal, "The upload");
      const stamp = stampFromReply(data, "upload");
      if (!stamp) throw new ConnectionRequestError("The upload came back without its stamp.", { retryable: true, code: "no_stamp" });
      return stamp;
    },
  };
}

/** The bytes of a download reply, whatever shape the transport handed over. */
async function bodyBytes(data: unknown): Promise<Uint8Array | null> {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (typeof Blob !== "undefined" && data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  return null;
}

// ============================================================================
// The running estimate (the gauge only; never what is recorded)
// ============================================================================

export interface ChainSamples {
  /** Each ping's round trip as this page saw it, ms. */
  pings: number[];
  downloads: Array<{ bytes: number; ms: number }>;
  uploads: Array<{ bytes: number; ms: number }>;
}

export interface RunningEstimate {
  latencyMs: number | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Pure: how many bytes the next download or upload moves. The first of each
 * is small (FIRST_*_BYTES); every later one is sized to take about
 * TARGET_REQUEST_MS at the speed the one before it went, between MIN_* and
 * the server's cap. The page's own time for a request includes about one
 * round trip that moved no data, so that is taken off first (never more than
 * three quarters of it). Only the SIZE comes from the page's clock: the
 * figures are the server's, and a smaller request only ever adds a round
 * trip to its proven time (slower, never faster).
 */
export function nextRequestBytes(kind: "download" | "upload", samples: ChainSamples): number {
  const done = kind === "download" ? samples.downloads : samples.uploads;
  const first = kind === "download" ? FIRST_DOWNLOAD_BYTES : FIRST_UPLOAD_BYTES;
  const least = kind === "download" ? MIN_DOWNLOAD_BYTES : MIN_UPLOAD_BYTES;
  const most = kind === "download" ? DOWNLOAD_BYTES : UPLOAD_BYTES;
  const last = done[done.length - 1];
  if (!last || !(last.bytes > 0) || !(last.ms > 0)) return first;
  const roundTrip = samples.pings.length ? median(samples.pings) : 0;
  const moving = Math.max(last.ms - roundTrip, last.ms / 4);
  const sized = Math.round((last.bytes / moving) * TARGET_REQUEST_MS[kind]);
  return Math.max(least, Math.min(most, sized));
}

/** Pure: bits ÷ µs = Mbps, one decimal; null when nothing was moved or no time passed. */
export function mbps(bytes: number, ms: number): number | null {
  if (!(ms > 0) || !(bytes > 0)) return null;
  return Math.round(((bytes * 8) / (ms * 1000)) * 10) / 10;
}

/**
 * Pure: the page's own estimate from what it timed so far, the same way the
 * server figures its own (median round trip; total bytes over total time).
 * The browser's timing includes its own turnaround, so this reads a little
 * slower than the server's figure, never faster.
 */
export function runningEstimate(samples: ChainSamples): RunningEstimate {
  const downloadBytes = samples.downloads.reduce((sum, d) => sum + d.bytes, 0);
  const downloadMs = samples.downloads.reduce((sum, d) => sum + d.ms, 0);
  const uploadBytes = samples.uploads.reduce((sum, u) => sum + u.bytes, 0);
  const uploadMs = samples.uploads.reduce((sum, u) => sum + u.ms, 0);
  return {
    latencyMs: samples.pings.length ? Math.round(median(samples.pings)) : null,
    downloadMbps: mbps(downloadBytes, downloadMs),
    uploadMbps: mbps(uploadBytes, uploadMs),
  };
}

// ============================================================================
// The chain runner
// ============================================================================

export interface ChainProgress {
  /** Steps finished so far, out of `total`. */
  step: number;
  total: number;
  /** The step under way. */
  phase: StepKind;
  /** True while a failed request is being sent again. */
  retrying: boolean;
  estimate: RunningEstimate;
}

export type ChainFailure =
  /** The server refused a request (a stamp that did not add up, a stale chain): a fresh chain is the only way on. */
  | "refused"
  /** A request failed twice (no answer, a 5xx, a short download). */
  | "unreachable"
  /** The caller stopped it. */
  | "aborted";

export type ChainOutcome =
  | { ok: true; stamps: string[]; estimate: RunningEstimate; samples: ChainSamples; durationMs: number }
  | { ok: false; reason: ChainFailure; message: string; step: number; phase: StepKind; stamps: string[] };

export interface RunChainOptions {
  onProgress?: (progress: ChainProgress) => void;
  /** A clock for the estimate (ms); `performance.now` when there is one. */
  now?: () => number;
  signal?: AbortSignal;
  /** The upload body: N bytes of incompressible random data. */
  randomBytes?: (n: number) => ArrayBuffer;
  counts?: Partial<{ ping: number; download: number; upload: number }>;
  /** Fixed sizes instead of nextRequestBytes (the tests). */
  sizes?: Partial<{ download: number; upload: number }>;
  timeouts?: Partial<Record<StepKind, number>>;
}

function defaultNow(): number {
  const p = (globalThis as { performance?: { now?: () => number } }).performance;
  return typeof p?.now === "function" ? p.now() : Date.now();
}

/** N random bytes, 64 KB at a time (crypto.getRandomValues fills at most 65,536 per call). */
export function randomUploadBody(n: number): ArrayBuffer {
  const buffer = new ArrayBuffer(n);
  const view = new Uint8Array(buffer);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  for (let offset = 0; offset < n; offset += 65_536) {
    const chunk = view.subarray(offset, Math.min(n, offset + 65_536));
    if (c?.getRandomValues) c.getRandomValues(chunk);
    else for (let i = 0; i < chunk.length; i++) chunk[i] = (Math.random() * 256) | 0;
  }
  return buffer;
}

/** A signal that fires when the caller's does or when `ms` have passed. */
function withTimeout(parent: AbortSignal | undefined, ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const onParent = () => controller.abort();
  if (parent) {
    if (parent.aborted) controller.abort();
    else parent.addEventListener("abort", onParent, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParent);
    },
  };
}

/**
 * Runs one chain, in order, each request carrying the previous response's
 * stamp. A request that fails is sent once more with the SAME previous stamp
 * (the server never saw the lost one, or will not count it: a nonce is one
 * chain link). A request the server refuses, or one that fails twice, ends
 * the chain; the page then offers "Try again", which is a fresh chain.
 * Returns the stamps in order: what `record` verifies.
 */
export async function runConnectionChain(transport: ConnectionTransport, options: RunChainOptions = {}): Promise<ChainOutcome> {
  const now = options.now ?? defaultNow;
  const counts = { ping: PING_COUNT, download: DOWNLOAD_COUNT, upload: UPLOAD_COUNT, ...(options.counts ?? {}) };
  const fixed = options.sizes ?? {};
  const timeouts = { ...REQUEST_TIMEOUT_MS, ...(options.timeouts ?? {}) };
  const total = counts.ping + counts.download + counts.upload;
  const plan: StepKind[] = [
    ...Array<StepKind>(counts.ping).fill("ping"),
    ...Array<StepKind>(counts.download).fill("download"),
    ...Array<StepKind>(counts.upload).fill("upload"),
  ];
  const samples: ChainSamples = { pings: [], downloads: [], uploads: [] };
  const stamps: string[] = [];
  const startedAt = now();

  const report = (step: number, phase: StepKind, retrying: boolean) =>
    options.onProgress?.({ step, total, phase, retrying, estimate: runningEstimate(samples) });

  const send = async (kind: StepKind, prev: string | null, bytes: number): Promise<{ stamp: string; ms: number }> => {
    const { signal, done } = withTimeout(options.signal, timeouts[kind]);
    const from = now();
    try {
      let stamp: string;
      if (kind === "ping") stamp = await transport.ping(prev, signal);
      else if (kind === "download") stamp = await transport.download(prev, bytes, signal);
      else stamp = await transport.upload(prev, (options.randomBytes ?? randomUploadBody)(bytes), signal);
      return { stamp, ms: Math.max(0, now() - from) };
    } catch (error) {
      if (options.signal?.aborted) throw abortedError();
      if (signal.aborted) {
        throw new ConnectionRequestError("The request took too long.", { retryable: true, code: "timeout" });
      }
      throw error;
    } finally {
      done();
    }
  };

  for (let i = 0; i < plan.length; i++) {
    const kind = plan[i];
    const prev = stamps.length ? stamps[stamps.length - 1] : null;
    if (options.signal?.aborted) return { ok: false, reason: "aborted", message: "The test was stopped.", step: i, phase: kind, stamps };
    report(i, kind, false);
    // Sized once per step: a retry moves the same bytes.
    const bytes = kind === "ping" ? 0 : fixed[kind] ?? nextRequestBytes(kind, samples);
    let result: { stamp: string; ms: number } | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= RETRIES_PER_REQUEST && !result; attempt++) {
      if (attempt > 0) report(i, kind, true);
      try {
        result = await send(kind, prev, bytes);
      } catch (error) {
        lastError = error;
        const e = error instanceof ConnectionRequestError ? error : null;
        if (!e || !e.retryable) break;
      }
    }
    if (!result) {
      const e = lastError instanceof ConnectionRequestError ? lastError : null;
      const reason: ChainFailure = e?.code === "aborted" ? "aborted" : e && !e.retryable ? "refused" : "unreachable";
      const message = reason === "refused" && e?.message
        ? e.message
        : reason === "aborted"
          ? "The test was stopped."
          : "The test could not reach our server for a moment, so it did not finish.";
      return { ok: false, reason, message, step: i, phase: kind, stamps };
    }
    stamps.push(result.stamp);
    if (kind === "ping") samples.pings.push(result.ms);
    else if (kind === "download") samples.downloads.push({ bytes, ms: result.ms });
    else samples.uploads.push({ bytes, ms: result.ms });
    report(i + 1, kind, false);
  }

  return { ok: true, stamps, estimate: runningEstimate(samples), samples, durationMs: Math.max(0, now() - startedAt) };
}

// ============================================================================
// The device (docs/EQUIPMENT-CHECK.md §3, screen 1; §5 `device`)
// ============================================================================

/** What the page knows about the device: the server's DeviceFacts, every field nullable. */
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

export type DeviceKind = "computer" | "phone" | "tablet";

export interface ParsedUserAgent {
  os: string | null;
  osVersion: string | null;
  browser: string | null;
  browserVersion: string | null;
  /** The UA says it is a phone (Mobile, iPhone, iPod). */
  mobile: boolean;
  /** The UA says it is a tablet (iPad, Android without Mobile, Tablet). */
  tablet: boolean;
}

/** Everything about the device that is not in the UA string. */
export interface DeviceExtras {
  screenWidth?: number | null;
  screenHeight?: number | null;
  dpr?: number | null;
  cores?: number | null;
  memoryGb?: number | null;
  maxTouchPoints?: number | null;
  language?: string | null;
  timezone?: string | null;
  connectionType?: string | null;
}

/** The shape of `navigator.userAgentData` (Chromium). */
export interface UserAgentDataLike {
  brands?: Array<{ brand: string; version: string }>;
  platform?: string;
  mobile?: boolean;
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
}

export interface HighEntropyValues {
  platformVersion?: string;
  model?: string;
  architecture?: string;
  fullVersionList?: Array<{ brand: string; version: string }>;
}

const NOT_A_BRAND_RE = /not.?a.?brand/i;

function majorOf(version: string | null | undefined): string | null {
  if (!version) return null;
  const m = /^(\d+)/.exec(version.trim());
  return m ? m[1] : null;
}

function shortVersion(version: string | null | undefined, parts = 2): string | null {
  if (!version) return null;
  const nums = version.replace(/_/g, ".").split(".").filter((p) => /^\d+$/.test(p));
  if (!nums.length) return null;
  const kept = nums.slice(0, parts);
  while (kept.length > 1 && kept[kept.length - 1] === "0") kept.pop();
  return kept.join(".");
}

/** Pure: the OS and browser in a user-agent string, and whether it says phone or tablet. */
export function parseUserAgent(ua: string): ParsedUserAgent {
  const text = typeof ua === "string" ? ua : "";
  let os: string | null = null;
  let osVersion: string | null = null;
  const iphone = /iPhone OS (\d+[._]\d+(?:[._]\d+)?)/.exec(text) ?? (/iPhone|iPod/.test(text) ? /OS (\d+[._]\d+)/.exec(text) : null);
  const android = /Android (\d+(?:\.\d+)*)/.exec(text);
  const windows = /Windows NT (\d+\.\d+)/.exec(text);
  const mac = /Mac OS X (\d+[._]\d+(?:[._]\d+)?)/.exec(text);
  if (iphone) {
    os = "iOS";
    osVersion = shortVersion(iphone[1]);
  } else if (/iPad/.test(text)) {
    os = "iPadOS";
    osVersion = shortVersion(/CPU OS (\d+[._]\d+(?:[._]\d+)?)/.exec(text)?.[1] ?? null);
  } else if (android) {
    os = "Android";
    osVersion = shortVersion(android[1]);
  } else if (/Android/.test(text)) {
    os = "Android";
  } else if (windows) {
    os = "Windows";
    // The UA string froze at NT 10.0 for both Windows 10 and 11; only
    // userAgentData's platformVersion can tell them apart.
    osVersion = windows[1] === "10.0" ? "10 or 11" : windows[1] === "6.3" ? "8.1" : windows[1] === "6.2" ? "8" : windows[1] === "6.1" ? "7" : windows[1];
  } else if (/CrOS/.test(text)) {
    os = "ChromeOS";
    osVersion = shortVersion(/CrOS \w+ (\d+(?:\.\d+)*)/.exec(text)?.[1] ?? null, 1);
  } else if (mac) {
    os = "macOS";
    osVersion = shortVersion(mac[1]);
  } else if (/Macintosh/.test(text)) {
    os = "macOS";
  } else if (/Linux/.test(text)) {
    os = "Linux";
  }

  let browser: string | null = null;
  let browserVersion: string | null = null;
  const edge = /Edg(?:e|A|iOS)?\/(\d+(?:\.\d+)*)/.exec(text);
  const opera = /OPR\/(\d+(?:\.\d+)*)/.exec(text);
  const samsung = /SamsungBrowser\/(\d+(?:\.\d+)*)/.exec(text);
  const chrome = /(?:Chrome|CriOS)\/(\d+(?:\.\d+)*)/.exec(text);
  const firefox = /(?:Firefox|FxiOS)\/(\d+(?:\.\d+)*)/.exec(text);
  const safariVersion = /Safari\//.test(text) ? /Version\/(\d+(?:\.\d+)*)/.exec(text) : null;
  if (edge) {
    browser = "Edge";
    browserVersion = majorOf(edge[1]);
  } else if (opera) {
    browser = "Opera";
    browserVersion = majorOf(opera[1]);
  } else if (samsung) {
    browser = "Samsung Internet";
    browserVersion = majorOf(samsung[1]);
  } else if (chrome) {
    browser = "Chrome";
    browserVersion = majorOf(chrome[1]);
  } else if (firefox) {
    browser = "Firefox";
    browserVersion = majorOf(firefox[1]);
  } else if (safariVersion) {
    browser = "Safari";
    browserVersion = shortVersion(safariVersion[1]);
  } else if (/Safari\//.test(text)) {
    browser = "Safari";
  }

  const mobile = /iPhone|iPod/.test(text) || (/Android/.test(text) && /Mobile/.test(text)) || /\bMobile\b/.test(text) && !/iPad/.test(text);
  const tablet = /iPad/.test(text) || (/Android/.test(text) && !/Mobile/.test(text)) || /\bTablet\b/.test(text);
  return { os, osVersion, browser, browserVersion, mobile, tablet };
}

function screenText(extras: DeviceExtras): string | null {
  const w = extras.screenWidth;
  const h = extras.screenHeight;
  return typeof w === "number" && typeof h === "number" && w > 0 && h > 0 ? `${Math.round(w)}×${Math.round(h)}` : null;
}

function factsFromExtras(extras: DeviceExtras): Pick<DeviceFacts, "screen" | "dpr" | "cores" | "memoryGb" | "touch" | "language" | "timezone" | "connectionType"> {
  const finite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const touchPoints = finite(extras.maxTouchPoints);
  return {
    screen: screenText(extras),
    dpr: finite(extras.dpr),
    cores: finite(extras.cores),
    memoryGb: finite(extras.memoryGb),
    touch: touchPoints === null ? null : touchPoints > 0,
    language: extras.language || null,
    timezone: extras.timezone || null,
    connectionType: extras.connectionType || null,
  };
}

/** Pure: the platform name userAgentData reports, in the words the staff table uses. */
function osFromPlatform(platform: string | undefined): string | null {
  if (!platform) return null;
  const p = platform.trim();
  if (/^windows$/i.test(p)) return "Windows";
  if (/^macos$/i.test(p)) return "macOS";
  if (/^android$/i.test(p)) return "Android";
  if (/^chrome ?os$/i.test(p) || /^chromeos$/i.test(p)) return "ChromeOS";
  if (/^linux$/i.test(p)) return "Linux";
  if (/^ios$/i.test(p)) return "iOS";
  return p;
}

/**
 * Pure: the OS version userAgentData's platformVersion means. Windows 11
 * reports 13 and up (Windows 10 reports 1 to 12, Windows 8 and older 0);
 * every other platform reports its own version.
 */
export function osVersionFromPlatformVersion(os: string | null, platformVersion: string | null | undefined): string | null {
  if (!platformVersion) return null;
  if (os === "Windows") {
    const major = Number(majorOf(platformVersion));
    if (!Number.isFinite(major)) return null;
    return major >= 13 ? "11" : major >= 1 ? "10" : "8 or older";
  }
  return shortVersion(platformVersion);
}

/**
 * Pure: the device from `navigator.userAgentData` (brands, platform, mobile),
 * the high-entropy values when the browser granted them (platformVersion,
 * model, fullVersionList), and the facts the UA string cannot carry. The UA
 * string fills in what userAgentData leaves blank (the browser, when the
 * brands are only Chromium).
 */
export function deviceFromUserAgentData(
  uaData: UserAgentDataLike,
  high: HighEntropyValues | null,
  extras: DeviceExtras,
  userAgent = "",
): DeviceFacts {
  const fallback = parseUserAgent(userAgent);
  const os = osFromPlatform(uaData.platform) ?? fallback.os;
  const osVersion = osVersionFromPlatformVersion(os, high?.platformVersion) ?? (os === fallback.os ? fallback.osVersion : null);
  const list = (high?.fullVersionList?.length ? high.fullVersionList : uaData.brands) ?? [];
  const named = list.filter((b) => b && !NOT_A_BRAND_RE.test(b.brand) && !/^chromium$/i.test(b.brand));
  const pick = named[0] ?? list.find((b) => b && !NOT_A_BRAND_RE.test(b.brand)) ?? null;
  let browser: string | null = null;
  let browserVersion: string | null = null;
  if (pick) {
    browser = /google chrome/i.test(pick.brand)
      ? "Chrome"
      : /microsoft edge/i.test(pick.brand)
        ? "Edge"
        : /opera/i.test(pick.brand)
          ? "Opera"
          : /brave/i.test(pick.brand)
            ? "Brave"
            : /samsung/i.test(pick.brand)
              ? "Samsung Internet"
              : pick.brand;
    browserVersion = majorOf(pick.version);
  }
  if (!browser) {
    browser = fallback.browser;
    browserVersion = fallback.browserVersion;
  }
  return {
    os,
    osVersion,
    browser,
    browserVersion,
    model: high?.model && high.model.trim() ? high.model.trim() : null,
    ...factsFromExtras(extras),
  };
}

/** Pure: the device from the UA string alone (Safari, Firefox: no userAgentData). */
export function deviceFromUserAgent(userAgent: string, extras: DeviceExtras): DeviceFacts {
  const parsed = parseUserAgent(userAgent);
  return {
    os: parsed.os,
    osVersion: parsed.osVersion,
    browser: parsed.browser,
    browserVersion: parsed.browserVersion,
    model: null,
    ...factsFromExtras(extras),
  };
}

export interface DeviceKindInput {
  /** userAgentData.mobile, or the UA string's word. Null when unknown. */
  mobile: boolean | null;
  /** The UA string says tablet (iPad, Android without Mobile). */
  tablet: boolean;
  touch: boolean | null;
  /** The screen's short side, CSS px. */
  shortSide: number | null;
  os: string | null;
}

/**
 * Pure: phone, tablet or computer (docs/EQUIPMENT-CHECK.md §3: a phone or
 * tablet is `mobile`, or touch with a short side under 768px). Windows and
 * ChromeOS that do not say `mobile` are computers whatever their screen: a
 * 2-in-1 with a 1920×1080 panel at the default 150% scaling reports a
 * 1280×720 screen and ten touch points, and is exactly the computer the
 * applicant works from. The short-side rule stays for every other OS (an
 * Android phone asking for the desktop site reports Linux and mobile:
 * false). An iPad that calls itself a Mac is a Mac with touch.
 */
export function deviceKindOf(input: DeviceKindInput): DeviceKind {
  if (input.mobile === true) return "phone";
  if (input.os === "Windows" || input.os === "ChromeOS") return "computer";
  if (input.tablet) return "tablet";
  if (input.touch && input.os === "macOS") return "tablet";
  if (input.touch && input.shortSide !== null && input.shortSide < 768) return "phone";
  if (input.touch && (input.os === "iOS" || input.os === "iPadOS" || input.os === "Android")) return "tablet";
  return "computer";
}

/** What the page reads the device through (`navigator`, `screen`, `window`); passed in so the test can hand in a fake. */
export interface DeviceSources {
  userAgent?: string;
  userAgentData?: UserAgentDataLike | null;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  maxTouchPoints?: number;
  language?: string;
  connection?: { effectiveType?: string; downlink?: number; rtt?: number; type?: string } | null;
  screenWidth?: number;
  screenHeight?: number;
  devicePixelRatio?: number;
  timezone?: string;
}

export interface DeviceReading {
  device: DeviceFacts;
  kind: DeviceKind;
  /** `navigator.connection`, as the browser gave it (Chromium only). */
  network: { effectiveType: string | null; downlink: number | null; rtt: number | null; type: string | null } | null;
}

function browserSources(): DeviceSources {
  const nav = (globalThis as unknown as { navigator?: Record<string, unknown> }).navigator ?? {};
  const scr = (globalThis as { screen?: { width?: number; height?: number } }).screen ?? {};
  const win = globalThis as { devicePixelRatio?: number };
  let timezone: string | undefined;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timezone = undefined;
  }
  return {
    userAgent: typeof nav.userAgent === "string" ? nav.userAgent : "",
    userAgentData: (nav.userAgentData as UserAgentDataLike | undefined) ?? null,
    hardwareConcurrency: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : undefined,
    deviceMemory: typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined,
    maxTouchPoints: typeof nav.maxTouchPoints === "number" ? nav.maxTouchPoints : undefined,
    language: typeof nav.language === "string" ? nav.language : undefined,
    connection: (nav.connection as DeviceSources["connection"]) ?? null,
    screenWidth: typeof scr.width === "number" ? scr.width : undefined,
    screenHeight: typeof scr.height === "number" ? scr.height : undefined,
    devicePixelRatio: typeof win.devicePixelRatio === "number" ? win.devicePixelRatio : undefined,
    timezone,
  };
}

/**
 * Reads the device: userAgentData with the high-entropy values when granted,
 * the UA string otherwise; screen, pixel ratio, cores, memory, touch,
 * connection, language, timezone. Never throws: a browser that refuses a
 * value leaves it null.
 */
export async function readDevice(sources: DeviceSources = browserSources()): Promise<DeviceReading> {
  const ua = sources.userAgent ?? "";
  const conn = sources.connection ?? null;
  const network = conn
    ? {
      effectiveType: typeof conn.effectiveType === "string" ? conn.effectiveType : null,
      downlink: typeof conn.downlink === "number" ? conn.downlink : null,
      rtt: typeof conn.rtt === "number" ? conn.rtt : null,
      type: typeof conn.type === "string" ? conn.type : null,
    }
    : null;
  const extras: DeviceExtras = {
    screenWidth: sources.screenWidth ?? null,
    screenHeight: sources.screenHeight ?? null,
    dpr: sources.devicePixelRatio ?? null,
    cores: sources.hardwareConcurrency ?? null,
    memoryGb: sources.deviceMemory ?? null,
    maxTouchPoints: sources.maxTouchPoints ?? null,
    language: sources.language ?? null,
    timezone: sources.timezone ?? null,
    connectionType: network?.type ?? network?.effectiveType ?? null,
  };
  const uaData = sources.userAgentData ?? null;
  let device: DeviceFacts;
  let mobile: boolean | null;
  const parsed = parseUserAgent(ua);
  if (uaData && (Array.isArray(uaData.brands) || typeof uaData.platform === "string")) {
    let high: HighEntropyValues | null = null;
    if (typeof uaData.getHighEntropyValues === "function") {
      try {
        high = (await uaData.getHighEntropyValues(["platformVersion", "model", "architecture", "fullVersionList"])) as HighEntropyValues;
      } catch {
        high = null;
      }
    }
    device = deviceFromUserAgentData(uaData, high, extras, ua);
    mobile = typeof uaData.mobile === "boolean" ? uaData.mobile : parsed.mobile;
  } else {
    device = deviceFromUserAgent(ua, extras);
    mobile = parsed.mobile;
  }
  const w = extras.screenWidth ?? null;
  const h = extras.screenHeight ?? null;
  const shortSide = typeof w === "number" && typeof h === "number" && w > 0 && h > 0 ? Math.min(w, h) : null;
  const kind = deviceKindOf({ mobile, tablet: parsed.tablet, touch: device.touch, shortSide, os: device.os });
  return { device, kind, network };
}

/** "Windows 11 · Chrome 131 · 1920×1080", for the candidate's own screen. */
export function describeDevice(device: DeviceFacts): string {
  const os = [device.os, device.osVersion].filter(Boolean).join(" ");
  const browser = [device.browser, device.browserVersion].filter(Boolean).join(" ");
  const parts = [os, browser, device.screen].filter((p) => p && p.length > 0);
  return parts.length ? parts.join(" · ") : "This device";
}

// ============================================================================
// The job's bars (docs/EQUIPMENT-CHECK.md §2), read the way `record` reads them
// ============================================================================

export interface ConnectionBars {
  minDownloadMbps: number;
  minUploadMbps: number;
  maxLatencyMs: number;
}

/** The live job's own numbers, the fallback when a step carries none. */
export const DEFAULT_BARS: Readonly<ConnectionBars> = Object.freeze({ minDownloadMbps: 10, minUploadMbps: 3, maxLatencyMs: 200 });

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Pure: the bars from a step's config `{min_download_mbps, min_upload_mbps, max_latency_ms}` (camelCase accepted too). */
export function barsFromConfig(config: unknown): ConnectionBars {
  const c = config && typeof config === "object" && !Array.isArray(config) ? (config as Record<string, unknown>) : {};
  return {
    minDownloadMbps: positive(c.min_download_mbps ?? c.minDownloadMbps) ?? DEFAULT_BARS.minDownloadMbps,
    minUploadMbps: positive(c.min_upload_mbps ?? c.minUploadMbps) ?? DEFAULT_BARS.minUploadMbps,
    maxLatencyMs: positive(c.max_latency_ms ?? c.maxLatencyMs) ?? DEFAULT_BARS.maxLatencyMs,
  };
}

export type BarName = "download" | "upload" | "latency";

/** Pure: which bars an estimate misses, in the fixed order download, upload, latency; a figure not measured yet is not judged. */
export function barsBelow(estimate: RunningEstimate, bars: ConnectionBars): BarName[] {
  const below: BarName[] = [];
  if (estimate.downloadMbps !== null && estimate.downloadMbps < bars.minDownloadMbps) below.push("download");
  if (estimate.uploadMbps !== null && estimate.uploadMbps < bars.minUploadMbps) below.push("upload");
  if (estimate.latencyMs !== null && estimate.latencyMs > bars.maxLatencyMs) below.push("latency");
  return below;
}

// ============================================================================
// The markers (docs/EQUIPMENT-CHECK.md §3): the page's moments, on the record
// ============================================================================

/** The `system` markers connection-test?op=event writes on the attempt as they happen. */
export type MarkerName = "device_read" | "computer_answer" | "test_started" | "test_finished";

/** The server's figures for one finished run, from its stamps (the same ones `record` would store). */
export interface ServerRunFigures {
  downloadMbps: number;
  uploadMbps: number;
  latencyMs: number;
  jitterMs: number;
}

/** How long the result screen waits for a run's server figures before showing the page's own estimate. */
export const SERVER_FIGURES_TIMEOUT_MS = 8_000;

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Pure: the server's figures in an `op=event` reply (`{ figures }`), or null when it sent none. */
export function serverFiguresFromReply(data: unknown): ServerRunFigures | null {
  if (!data || typeof data !== "object") return null;
  const f = (data as { figures?: unknown }).figures;
  if (!f || typeof f !== "object") return null;
  const r = f as Record<string, unknown>;
  const downloadMbps = finite(r.downloadMbps);
  const uploadMbps = finite(r.uploadMbps);
  const latencyMs = finite(r.latencyMs);
  const jitterMs = finite(r.jitterMs);
  if (downloadMbps === null || uploadMbps === null || latencyMs === null || jitterMs === null) return null;
  return { downloadMbps, uploadMbps, latencyMs, jitterMs };
}

export interface MarkerSender {
  /** Writes one marker, fire and forget: never throws, never holds up the test. `key` makes a retry a no-op. */
  mark(what: Exclude<MarkerName, "test_finished">, detail: Record<string, unknown>, key: string): void;
  /**
   * A finished run: its `test_finished` marker (the page's estimate) and its
   * stamps, so the server times the run and answers with its figures, which
   * staff see as that run's `test_run` and the result screen shows. Resolves
   * to null (never rejects) when the server refused the chain, did not
   * answer, or took longer than `timeoutMs`: the page then shows its own
   * estimate and says so.
   */
  finishRun(input: { run: number; estimate: RunningEstimate; stamps: readonly string[]; key: string; timeoutMs?: number }): Promise<ServerRunFigures | null>;
}

/**
 * The page's markers through `connection-test?op=event`, with the same
 * invoke the chain uses (the session's JWT travels with it, and the dev
 * preview answers it offline).
 */
export function createMarkerSender(
  invoke: InvokeLike,
  target: { applicationId: string; stepId: string },
  functionName = "connection-test",
): MarkerSender {
  const send = (what: MarkerName, detail: Record<string, unknown>, key: string, extra: Record<string, unknown> = {}, signal?: AbortSignal) =>
    invoke(`${functionName}?op=event`, {
      method: "POST",
      body: { application_id: target.applicationId, step_id: target.stepId, what, detail, client_msg_id: key, ...extra },
      signal,
    });

  return {
    mark(what, detail, key) {
      void send(what, detail, key).then(
        ({ error }) => {
          if (error) console.warn(`[connectionTest] the ${what} marker was not recorded`);
        },
        () => console.warn(`[connectionTest] the ${what} marker was not recorded`),
      );
    },
    async finishRun({ run, estimate, stamps, key, timeoutMs = SERVER_FIGURES_TIMEOUT_MS }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const { data, error } = await send(
          "test_finished",
          { run, download_mbps: estimate.downloadMbps, upload_mbps: estimate.uploadMbps, latency_ms: estimate.latencyMs },
          key,
          { stamps: [...stamps] },
          controller.signal,
        );
        return error ? null : serverFiguresFromReply(data);
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
