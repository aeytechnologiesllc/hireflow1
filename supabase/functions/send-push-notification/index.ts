/**
 * send-push-notification — sends one phone push for one notification row.
 *
 * Called by the public.trigger_push_notification() AFTER INSERT trigger on
 * public.notifications, through pg_net, with only `{ notification_id }`.
 *
 * The notifications row is the authority, not the request body: this function
 * loads the row with the service role and pushes exactly that row's title,
 * message and link to that row's user. So the endpoint needs no shared secret
 * (a database trigger has no safe way to hold one) and a forged call can do
 * nothing worse than deliver a real notification's push to its real owner,
 * once: `push_sent_at` is claimed atomically before sending, so a replay is a
 * no-op.
 *
 * The link is restricted to a hireflownow.com path (_shared/pushLink.ts),
 * because a counterparty can insert a notification for someone else.
 *
 * Earlier versions accepted user_id/title/message/url straight from the body
 * behind an INTERNAL_FUNCTION_SECRET header that the trigger never sent, and
 * the trigger called extensions.http_post, which does not exist on this
 * project. Every push was silently skipped.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { pushUrlForLink } from "../_shared/pushLink.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let notificationId: unknown;
  try {
    ({ notification_id: notificationId } = await req.json());
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (typeof notificationId !== "string" || !UUID_RE.test(notificationId)) {
    return json({ error: "notification_id is required" }, 400);
  }

  const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
  const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    // Not claimed, so nothing is marked sent while push isn't set up.
    return json({ success: true, skipped: true, reason: "onesignal_not_configured" });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // Claim the row atomically. No row back means it doesn't exist or was
    // already pushed; both are a quiet no-op.
    const { data: note, error: claimError } = await admin
      .from("notifications")
      .update({ push_sent_at: new Date().toISOString() })
      .eq("id", notificationId)
      .is("push_sent_at", null)
      .select("user_id, title, message, link")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!note) return json({ success: true, skipped: true, reason: "not_found_or_already_sent" });

    const { data: profile } = await admin
      .from("profiles")
      .select("email_notifications_enabled")
      .eq("user_id", note.user_id)
      .maybeSingle();
    if (profile && profile.email_notifications_enabled === false) {
      return json({ success: true, skipped: true, reason: "notifications_disabled" });
    }

    const { count } = await admin
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", note.user_id);
    if (!count) return json({ success: true, skipped: true, reason: "no_subscriptions" });

    const payload: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      include_aliases: { external_id: [note.user_id] },
      target_channel: "push",
      headings: { en: note.title },
      contents: { en: note.message },
      ios_badgeType: "Increase",
      ios_badgeCount: 1,
    };
    const url = pushUrlForLink(note.link);
    if (url) {
      payload.url = url;
      payload.data = { deep_link: url };
    }

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${ONESIGNAL_REST_API_KEY}` },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("OneSignal API error:", response.status, result);
      return json({ error: "OneSignal API error" }, 502);
    }
    return json({ success: true, onesignal_id: result.id, recipients: result.recipients });
  } catch (error) {
    console.error("send-push-notification error:", error instanceof Error ? error.message : error);
    return json({ error: "Push failed" }, 500);
  }
});
