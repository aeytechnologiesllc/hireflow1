/**
 * crashReporter — tiny client-side crash capture, posted to the
 * `client-errors` edge function (supabase/functions/client-errors) so a
 * developer finds out about a broken screen without a candidate or
 * employer having to file a support ticket.
 *
 * Three sources are wired to `reportError` (see installCrashReporter,
 * called once from src/App.tsx, and ErrorBoundary.tsx's componentDidCatch):
 *   1. window 'error' — uncaught synchronous exceptions.
 *   2. window 'unhandledrejection' — a rejected promise nobody caught.
 *   3. ErrorBoundary.componentDidCatch — a React render-time throw.
 *
 * Deliberately minimal: no third-party SDK, no session replay, no extra
 * network calls beyond the one POST. The server (client-errors + the
 * record_client_error_event SQL function) does all the grouping,
 * fingerprinting and developer alerting — this module's only job is to
 * capture the raw signal, throttle it locally so a crash LOOP can't spam
 * the endpoint, and send it with the caller's session token attached (if
 * any) so the server can resolve who was signed in without trusting a
 * client-claimed user id.
 */
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";

const ENDPOINT = `${SUPABASE_URL}/functions/v1/client-errors`;

// Never report a failure of client-errors reporting itself back to
// client-errors — that would be an infinite loop the instant the endpoint
// is briefly down.
const SELF_ENDPOINT_MARKER = "/functions/v1/client-errors";

// Client-side throttle: at most this many reports in the rolling window,
// independent of and in addition to the server's own per-IP rate limit —
// a tight crash loop (e.g. a render throwing every frame) should cost the
// browser almost nothing, not fire a fetch per throw.
const MAX_REPORTS_PER_WINDOW = 5;
const WINDOW_MS = 30_000;
let windowStart = 0;
let windowCount = 0;

// Same-fingerprint-ish de-dupe within a short burst: identical
// message+stack reported twice within a few seconds is almost always the
// same throw re-firing (a re-render, a retried effect), not two different
// problems.
const recentlySent = new Map<string, number>();
const DEDUPE_MS = 5_000;

function releaseId(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return env.VITE_RELEASE || env.VITE_VERCEL_GIT_COMMIT_SHA || env.MODE || "unknown";
}

function shouldSend(key: string): boolean {
  const now = Date.now();

  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= MAX_REPORTS_PER_WINDOW) return false;

  const last = recentlySent.get(key);
  if (last && now - last < DEDUPE_MS) return false;

  windowCount += 1;
  recentlySent.set(key, now);
  // Bound the de-dupe map itself — it's per-tab, in-memory, never persisted.
  if (recentlySent.size > 100) {
    const oldestKey = recentlySent.keys().next().value;
    if (oldestKey) recentlySent.delete(oldestKey);
  }
  return true;
}

/**
 * Report a crash. Safe to call from anywhere — never throws, never
 * awaited by the caller (fire-and-forget), and silently gives up if
 * `navigator.onLine` is false or the message itself looks like a report of
 * this endpoint's own failure.
 */
export function reportError(message: string | undefined | null, stack?: string | null): void {
  try {
    if (typeof window === "undefined") return;
    const trimmedMessage = (message || "Unknown error").toString().slice(0, 500);
    if (trimmedMessage.includes(SELF_ENDPOINT_MARKER) || (stack || "").includes(SELF_ENDPOINT_MARKER)) {
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;

    const route = window.location.pathname;
    const key = `${trimmedMessage}|${route}`;
    if (!shouldSend(key)) return;

    void send(trimmedMessage, stack ?? null, route);
  } catch {
    // Reporting a crash must never itself throw.
  }
}

async function send(message: string, stack: string | null, route: string): Promise<void> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        headers.Authorization = `Bearer ${data.session.access_token}`;
      }
    } catch {
      // Anonymous report is fine — never block on session lookup.
    }

    await fetch(ENDPOINT, {
      method: "POST",
      headers,
      // Trimmed here too, defense in depth alongside the server's own cap
      // (_shared/telemetry.ts MAX_STACK_LEN) — no reason to ship 50KB of
      // stack for a 4000-char server limit.
      body: JSON.stringify({
        message,
        stack: stack ? stack.slice(0, 4000) : null,
        route,
        release: releaseId(),
      }),
      keepalive: true,
    });
  } catch {
    // Best-effort. A failed crash report must never surface to the user
    // or cascade into another error.
  }
}

let installed = false;

/** Wires window-level crash capture. Call once, e.g. from src/App.tsx. Idempotent. */
export function installCrashReporter(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event: ErrorEvent) => {
    reportError(event.error?.message || event.message, event.error?.stack);
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? "Unhandled rejection");
    const stack = reason instanceof Error ? reason.stack : undefined;
    reportError(message, stack);
  });
}
