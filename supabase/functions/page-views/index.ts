/**
 * page-views — cookieless page-view counting for public/beacon.js and the
 * SPA's own route-change tracking (src/lib/crashReporter.ts's sibling,
 * src/hooks/usePageViewTracking.ts).
 *
 * Public (verify_jwt = false), rate-limited (_shared/rateLimit.ts, same
 * cost-protection posture as every other public function), and
 * bot-filtered server-side (_shared/telemetry.ts isBotUserAgent) — a bot
 * pageview is silently accepted and dropped (200 OK, no row written) rather
 * than rejected, so a scraper never learns anything about detection from
 * the response.
 *
 * Never accepts or stores any identifier for the visitor: no cookie, no
 * IP, no fingerprint, no user id — only the aggregate dimensions
 * (day/path/referrer host/utm/device class) that record_page_view()
 * (20260916160000_*.sql) upserts a running count onto. Two visits to the
 * same page from the same person on the same day are indistinguishable
 * from two different people — that's the point.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { guardPublicAiCall } from "../_shared/rateLimit.ts";
import { classifyDeviceClass, honorsOptOut, isBotUserAgent, sanitizePageViewPayload } from "../_shared/telemetry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_BODY_BYTES = 4 * 1024;

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

  const limited = await guardPublicAiCall(req, "page-views", corsHeaders, 120, 3600);
  if (limited) return limited;

  // Belt-and-suspenders: beacon.js already checks DNT/GPC client-side and
  // never sends when set, but a hand-rolled POST (or a future caller that
  // forgets) is still honored here.
  if (honorsOptOut(req.headers.get("dnt"), req.headers.get("sec-gpc"))) {
    return jsonResponse({ ok: true, skipped: "opt-out" }, 200);
  }

  const userAgent = req.headers.get("user-agent");
  if (isBotUserAgent(userAgent)) {
    // 200, not 4xx — never tell an automated caller it was detected.
    return jsonResponse({ ok: true, skipped: "bot" }, 200);
  }

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

  const fallbackDeviceClass = classifyDeviceClass(userAgent);
  const sanitized = sanitizePageViewPayload(body, fallbackDeviceClass);
  if (!sanitized) {
    return jsonResponse({ error: "path is required" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("page-views: Supabase env vars missing");
    return jsonResponse({ error: "Server not configured" }, 500);
  }
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  try {
    const { error } = await supabaseAdmin.rpc("record_page_view", {
      p_day: new Date().toISOString().slice(0, 10),
      p_path: sanitized.path,
      p_referrer_host: sanitized.referrerHost,
      p_utm_source: sanitized.utmSource,
      p_utm_medium: sanitized.utmMedium,
      p_utm_campaign: sanitized.utmCampaign,
      p_device_class: sanitized.deviceClass,
    });
    if (error) {
      console.error("page-views: record_page_view failed:", error);
      return jsonResponse({ error: "Could not record page view" }, 500);
    }
    return jsonResponse({ ok: true }, 200);
  } catch (e) {
    console.error("page-views: unexpected failure:", e);
    return jsonResponse({ error: "Could not record page view" }, 500);
  }
});
