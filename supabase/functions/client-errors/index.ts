/**
 * client-errors — crash-alert ingestion for the SPA.
 *
 * Called by src/lib/crashReporter.ts (window 'error', 'unhandledrejection',
 * and ErrorBoundary.componentDidCatch — see that file). Public
 * (verify_jwt = false, see supabase/config.toml) because a crash can happen
 * before or after sign-in, and a candidate mid-application is never signed
 * in with a session this function could verify_jwt against anyway in the
 * anonymous-candidate flows.
 *
 * Every field is untrusted client input:
 *   - size-capped hard, before anything else (MAX_BODY_BYTES) — a crash
 *     loop must never become a way to write unbounded rows.
 *   - rate-limited per caller IP via the shared limiter
 *     (_shared/rateLimit.ts) — same fail-open cost-protection posture as
 *     every other public function.
 *   - sanitized (message/stack/route capped and PII-redacted, browser
 *     family reduced to a fixed small set) by _shared/telemetry.ts before
 *     it ever reaches the database.
 *   - the user id and role are NEVER taken from the request body — if an
 *     Authorization header is present, the caller's identity and role are
 *     resolved server-side (auth.getUser(), then a user_roles lookup), so
 *     nobody can claim to be a developer to make their own error look more
 *     urgent, and nobody can claim to be a different signed-in user.
 *
 * Grouping, upsert-by-fingerprint and developer notifications all happen
 * inside the record_client_error_event() SQL function
 * (20260916165000_client_error_events_and_page_views.sql) — this function's
 * job is auth, validation and sanitizing, not business logic.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { guardPublicAiCall, callerId } from "../_shared/rateLimit.ts";
import { classifyBrowserFamily, sanitizeClientErrorPayload } from "../_shared/telemetry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 8KB is generous for a message + a trimmed stack + a route — well above
// what the client module ever sends (see MAX_MESSAGE_LEN/MAX_STACK_LEN in
// _shared/telemetry.ts), and small enough that a malicious body can't cost
// meaningful bandwidth or CPU before it's ever parsed.
const MAX_BODY_BYTES = 8 * 1024;

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const limited = await guardPublicAiCall(req, "client-errors", corsHeaders, 30, 3600);
  if (limited) return limited;

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: "Payload too large" }, 413);
  }

  let rawText: string;
  try {
    rawText = await req.text();
  } catch {
    return jsonResponse({ error: "Invalid body" }, 400);
  }
  if (rawText.length > MAX_BODY_BYTES) {
    return jsonResponse({ error: "Payload too large" }, 413);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawText);
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const browserFamily = classifyBrowserFamily(req.headers.get("user-agent"));
  const sanitized = sanitizeClientErrorPayload(body);
  if (!sanitized) {
    return jsonResponse({ error: "message is required" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error("client-errors: Supabase env vars missing");
    return jsonResponse({ error: "Server not configured" }, 500);
  }

  // Resolve identity server-side, never from the body. No Authorization
  // header (or an invalid one) just means an anonymous report — never an
  // error for this endpoint, since most of the app's crash surface (the
  // candidate flows) can be reached signed out.
  let userId: string | null = null;
  let userRole: string | null = null;
  const authHeader = req.headers.get("Authorization");
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  if (authHeader) {
    try {
      const supabaseUser = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await supabaseUser.auth.getUser();
      if (user) {
        userId = user.id;
        const { data: roleRow } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        userRole = roleRow?.role ?? null;
      }
    } catch (e) {
      console.warn("client-errors: could not resolve caller identity, reporting anonymously:", e);
    }
  }

  const fingerprint = sanitized.fingerprint;

  try {
    const { data, error } = await supabaseAdmin.rpc("record_client_error_event", {
      p_fingerprint: fingerprint,
      p_message: sanitized.message,
      p_stack: sanitized.stack,
      p_route: sanitized.route,
      p_release: sanitized.release,
      p_browser_family: browserFamily,
      p_user_role: userRole,
      p_user_id: userId,
    });
    if (error) {
      console.error("client-errors: record_client_error_event failed:", error, {
        caller: callerId(req),
      });
      return jsonResponse({ error: "Could not record error" }, 500);
    }
    const row = Array.isArray(data) ? data[0] : data;
    return jsonResponse({ ok: true, fingerprint, isNew: row?.out_is_new ?? null }, 200);
  } catch (e) {
    console.error("client-errors: unexpected failure:", e);
    return jsonResponse({ error: "Could not record error" }, 500);
  }
});
