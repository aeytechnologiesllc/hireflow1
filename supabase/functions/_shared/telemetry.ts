/**
 * Shared, pure telemetry helpers for the client-errors and page-views edge
 * functions: fingerprinting, payload sanitizing, and bot filtering.
 *
 * Pure and dependency-free on purpose (no Deno-only or Node-only APIs) so
 * the exact same code runs three places: the two edge functions (Deno), and
 * the node test suite (scripts/telemetry_sanitizing.test.mjs) that imports
 * this file directly — Node 24's built-in TypeScript type-stripping runs it
 * with no build step, the same way scripts/step_gate.test.mjs already
 * imports src/lib/candidateJourney.ts. Keep it that way: no `Deno.env`, no
 * `node:` imports, no npm/esm.sh specifiers in this file.
 */

// ---------------------------------------------------------------------------
// Limits. Both edge functions enforce these before ever touching the
// database — the DB columns are not the size guard, this is.
// ---------------------------------------------------------------------------
export const MAX_MESSAGE_LEN = 500;
export const MAX_STACK_LEN = 4000;
export const MAX_ROUTE_LEN = 300;
export const MAX_RELEASE_LEN = 100;
export const MAX_REFERRER_HOST_LEN = 200;
export const MAX_UTM_LEN = 100;

export const KNOWN_USER_ROLES = new Set([
  "employer",
  "candidate",
  "team_member",
  "developer",
]);

export const BROWSER_FAMILIES = [
  "chrome",
  "edge",
  "firefox",
  "safari",
  "opera",
  "samsung",
  "other",
] as const;
export type BrowserFamily = (typeof BROWSER_FAMILIES)[number];

export const DEVICE_CLASSES = ["mobile", "tablet", "desktop"] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

// ---------------------------------------------------------------------------
// Bot filtering (page-views and, defensively, client-errors).
// ---------------------------------------------------------------------------
// Deliberately broad and conservative: false positives here just mean one
// fewer counted pageview, never a wrongly-blocked human. Matched
// case-insensitively against the raw User-Agent string.
const BOT_UA_SUBSTRINGS = [
  "bot",
  "spider",
  "crawl",
  "slurp",
  "curl",
  "wget",
  "python-requests",
  "python-urllib",
  "go-http-client",
  "headlesschrome",
  "phantomjs",
  "selenium",
  "puppeteer",
  "playwright",
  "axios",
  "libwww-perl",
  "httpclient",
  "okhttp",
  "postmanruntime",
  "insomnia",
  "monitor",
  "pingdom",
  "uptimerobot",
  "facebookexternalhit",
  "bingpreview",
  "discordbot",
  "telegrambot",
  "slackbot",
  "whatsapp",
  "preview",
  "ahrefsbot",
  "semrushbot",
  "mj12bot",
  "dotbot",
  "petalbot",
  "bytespider",
  "gptbot",
  "ccbot",
  "claudebot",
  "applebot",
  "yandexbot",
  "baiduspider",
  "duckduckbot",
];

/** True when a request should be excluded from visitor counts as an automated client. */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.trim().length === 0) return true; // no UA at all -> not a real browser
  const ua = userAgent.toLowerCase();
  return BOT_UA_SUBSTRINGS.some((needle) => ua.includes(needle));
}

/**
 * True when the report comes from a page running on a developer's own machine
 * (vite dev, vite preview, the /__preview harness, a local Playwright run).
 * Those pages post to the same production endpoints, and before this check
 * every recorded "crash" was dev-server noise (duplicate-React errors from
 * /node_modules/.vite/deps/ on localhost), which buries real crashes.
 * Checks the browser-set Origin header first, then Referer; a request with
 * neither is not treated as local.
 */
export function isLocalDevOrigin(origin: string | null | undefined, referer?: string | null): boolean {
  for (const raw of [origin, referer]) {
    if (!raw || raw === "null") continue;
    let host: string;
    try {
      host = new URL(raw).hostname.toLowerCase();
    } catch {
      continue;
    }
    return (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host === "0.0.0.0" ||
      host === "[::1]" ||
      host === "::1" ||
      host.endsWith(".local") ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  }
  return false;
}

/** True when the caller told us (DNT / GPC) not to be tracked. Server-side belt-and-suspenders; beacon.js already checks this before sending. */
export function honorsOptOut(dnt: string | null | undefined, gpc: string | null | undefined): boolean {
  return dnt === "1" || gpc === "1";
}

// ---------------------------------------------------------------------------
// Browser / device classification, from the User-Agent header. Order
// matters — Edge and Opera UAs also contain "Chrome" / "Safari" tokens.
// ---------------------------------------------------------------------------
export function classifyBrowserFamily(userAgent: string | null | undefined): BrowserFamily {
  if (!userAgent) return "other";
  const ua = userAgent.toLowerCase();
  if (ua.includes("edg/") || ua.includes("edge/")) return "edge";
  if (ua.includes("opr/") || ua.includes("opera")) return "opera";
  if (ua.includes("samsungbrowser")) return "samsung";
  if (ua.includes("firefox/") || ua.includes("fxios/")) return "firefox";
  if (ua.includes("crios/") || ua.includes("chrome/") || ua.includes("chromium/")) return "chrome";
  if (ua.includes("safari/") && (ua.includes("version/") || ua.includes("mobile/") || ua.includes("iphone") || ua.includes("ipad"))) {
    return "safari";
  }
  return "other";
}

export function classifyDeviceClass(userAgent: string | null | undefined): DeviceClass {
  if (!userAgent) return "desktop";
  const ua = userAgent.toLowerCase();
  if (ua.includes("ipad") || ua.includes("tablet") || (ua.includes("android") && !ua.includes("mobile"))) {
    return "tablet";
  }
  if (ua.includes("mobi") || ua.includes("iphone") || ua.includes("ipod") || ua.includes("android")) {
    return "mobile";
  }
  return "desktop";
}

// ---------------------------------------------------------------------------
// Fingerprinting. Deterministic, synchronous, no crypto dependency (FNV-1a
// is plenty for grouping — this is not a security boundary) so it runs
// identically in Deno and Node without an async digest call.
// ---------------------------------------------------------------------------
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply, done with shifts to stay in-range like the C reference impl.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * The first meaningful stack frame, with line/column numbers stripped so the
 * SAME throw site still fingerprints the same after a build shifts line
 * numbers around (a new release, a formatting change) — only the file and
 * function identify the frame, not where on the line it happened.
 */
export function topStackFrame(stack: string | null | undefined): string {
  if (!stack) return "";
  const lines = stack.split("\n").map((l) => l.trim()).filter(Boolean);
  // Skip a leading "Error: <message>" line if present — we want the first
  // actual call-site line ("at foo (bar.js:1:2)" or "foo@bar.js:1:2").
  const frame = lines.find((l) => l !== lines[0] || /(\bat\b|@)/.test(l)) ?? lines[0] ?? "";
  return frame
    .replace(/:\d+:\d+\)?$/, "") // trailing :line:col
    .replace(/\?[^:)\s]*/g, "") // query-string cache-busters in the URL
    .trim();
}

/**
 * A short, stable id grouping "the same" error across occurrences and
 * releases: normalized message + normalized top stack frame + route.
 * Two different routes throwing the same error group separately on purpose
 * — where it happened is part of what a developer needs to triage it.
 */
export function computeFingerprint(message: string, stack: string | null | undefined, route: string): string {
  const normalizedMessage = (message || "")
    .toLowerCase()
    .replace(/[0-9a-f-]{8,}/gi, "<id>") // uuids / hex ids vary per occurrence, not per error site
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  const frame = topStackFrame(stack);
  const normalizedRoute = normalizeRoute(route);
  return fnv1a(`${normalizedMessage}|${frame}|${normalizedRoute}`);
}

// ---------------------------------------------------------------------------
// Sanitizing. Every field is capped and PII-scrubbed before it ever reaches
// the database — the client is untrusted input, same as any public endpoint.
// ---------------------------------------------------------------------------
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// Long opaque tokens (JWTs, API keys, session ids) that a stack trace or
// error message might accidentally interpolate.
const TOKEN_RE = /\b[a-z0-9_-]{24,}\b/gi;
// Short-but-still-a-bearer-capability codes: PREFIX-ALNUM, e.g. team invite
// codes ("TEAM-A1B2C3D4", 13 chars — generate_invite_code() in
// 20251215054759_*.sql) and document verification codes ("DOC-...", see
// 20251219173453_*.sql / 20260915123000_*.sql). These are generated
// uppercase-hex-after-a-dash on purpose, which is what makes this pattern
// safe against ordinary lowercase, dash-separated route segments like
// "/join-team" or "/sign-document" — only an actual generated code matches.
const CODE_RE = /\b[A-Z]{2,10}-[A-Z0-9]{6,}\b/g;

function redactPii(input: string): string {
  return input.replace(EMAIL_RE, "<email>").replace(CODE_RE, "<redacted>").replace(TOKEN_RE, "<redacted>");
}

/**
 * Strip query string and hash, cap length, and redact PII/bearer codes — a
 * route is a path, not a URL with secrets in the query, but path SEGMENTS
 * can themselves be secrets (e.g. /join-team/TEAM-A1B2C3D4 embeds a live
 * team-invite bearer code). Shared by client-errors' `route` field and
 * page-views' `path` field, so both get the same protection.
 */
export function normalizeRoute(route: string | null | undefined): string {
  if (!route) return "/";
  let path = String(route).split("?")[0].split("#")[0];
  if (!path.startsWith("/")) path = `/${path}`;
  path = redactPii(path);
  return path.slice(0, MAX_ROUTE_LEN);
}

export interface RawClientErrorPayload {
  message?: unknown;
  stack?: unknown;
  route?: unknown;
  release?: unknown;
  userRole?: unknown;
}

export interface SanitizedClientError {
  message: string;
  stack: string | null;
  route: string;
  release: string | null;
  userRole: string | null;
  fingerprint: string;
}

/**
 * Validates and sanitizes a client-errors payload. Returns null when the
 * payload is unusable (no message) — the caller responds 400 rather than
 * writing a garbage row.
 */
export function sanitizeClientErrorPayload(
  raw: RawClientErrorPayload,
): SanitizedClientError | null {
  const rawMessage = typeof raw.message === "string" ? raw.message.trim() : "";
  if (!rawMessage) return null;

  const message = redactPii(rawMessage).slice(0, MAX_MESSAGE_LEN);
  const stack = typeof raw.stack === "string" && raw.stack.trim()
    ? redactPii(raw.stack).slice(0, MAX_STACK_LEN)
    : null;
  const route = normalizeRoute(typeof raw.route === "string" ? raw.route : "/");
  const release = typeof raw.release === "string" && raw.release.trim()
    ? raw.release.trim().slice(0, MAX_RELEASE_LEN)
    : null;
  const userRole = typeof raw.userRole === "string" && KNOWN_USER_ROLES.has(raw.userRole)
    ? raw.userRole
    : null;

  return {
    message,
    stack,
    route,
    release,
    userRole,
    fingerprint: computeFingerprint(message, stack, route),
  };
}

export interface RawPageViewPayload {
  path?: unknown;
  referrerHost?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
  deviceClass?: unknown;
}

export interface SanitizedPageView {
  path: string;
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  deviceClass: DeviceClass;
}

function sanitizeUtm(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return redactPii(trimmed).slice(0, MAX_UTM_LEN);
}

export function sanitizePageViewPayload(
  raw: RawPageViewPayload,
  fallbackDeviceClass: DeviceClass,
): SanitizedPageView | null {
  const path = typeof raw.path === "string" && raw.path.trim() ? normalizeRoute(raw.path) : null;
  if (!path) return null;

  let referrerHost: string | null = null;
  if (typeof raw.referrerHost === "string" && raw.referrerHost.trim()) {
    // A host, never a full URL — no path/query that could carry a token.
    referrerHost = raw.referrerHost.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].slice(0, MAX_REFERRER_HOST_LEN);
  }

  const deviceClass: DeviceClass = DEVICE_CLASSES.includes(raw.deviceClass as DeviceClass)
    ? (raw.deviceClass as DeviceClass)
    : fallbackDeviceClass;

  return {
    path,
    referrerHost,
    utmSource: sanitizeUtm(raw.utmSource),
    utmMedium: sanitizeUtm(raw.utmMedium),
    utmCampaign: sanitizeUtm(raw.utmCampaign),
    deviceClass,
  };
}
