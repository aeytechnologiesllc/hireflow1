/**
 * send-test-push — the "Send a test" button in Settings.
 *
 * Sends one test notification to the CALLER's own devices and says how many it
 * reached. Only the caller's: the account comes from the sign-in, never from
 * the request. Web devices first (a phone with HireFlow on its Home Screen, a
 * browser: _shared/webPush.ts), then, if ONESIGNAL_* is set and the account
 * has a native-wrapper device, OneSignal as before.
 *
 * Answers 200 with the counts, including "0 devices"; the page words it.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { pushUrlForLink } from "../_shared/pushLink.ts";
import { getVapidKeys, pushToDevices } from "../_shared/webPush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { data: devices, error: devicesError } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, player_id")
      .eq("user_id", user.id);
    if (devicesError) throw devicesError;
    const webDevices = (devices ?? []).filter((d: { endpoint: string | null }) => !!d.endpoint);
    const nativeDevices = (devices ?? []).filter((d: { endpoint: string | null; player_id: string | null }) => !d.endpoint && !!d.player_id);
    console.log(`[test-push] User ${user.id} has ${webDevices.length} web and ${nativeDevices.length} native device(s)`);

    let web = { sent: 0, failed: 0, removed: 0 };
    let webError = false;
    if (webDevices.length) {
      try {
        const keys = await getVapidKeys(admin);
        web = await pushToDevices(
          admin,
          webDevices,
          {
            title: "HireFlow notifications are on",
            body: "This is what you'll see when someone applies.",
            url: pushUrlForLink("/settings"),
            tag: "hireflow-test",
          },
          keys,
        );
      } catch (error) {
        console.error("[test-push] web push failed:", error instanceof Error ? error.message : error);
        webError = true;
      }
    }

    // The native wrapper's devices, only when OneSignal is set up.
    let onesignal: { recipients: number } | null = null;
    const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
    const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (ONESIGNAL_APP_ID && ONESIGNAL_REST_API_KEY && nativeDevices.length) {
      try {
        const response = await fetch("https://onesignal.com/api/v1/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Basic ${ONESIGNAL_REST_API_KEY}` },
          body: JSON.stringify({
            app_id: ONESIGNAL_APP_ID,
            include_aliases: { external_id: [user.id] },
            target_channel: "push",
            headings: { en: "HireFlow notifications are on" },
            contents: { en: "This is what you'll see when someone applies." },
            ios_badgeType: "Increase",
            ios_badgeCount: 1,
          }),
        });
        const answer = await response.json().catch(() => ({}));
        if (response.ok) onesignal = { recipients: Number(answer.recipients ?? 0) };
        else console.error("[test-push] OneSignal API error:", response.status, answer);
      } catch (error) {
        console.error("[test-push] OneSignal failed:", error instanceof Error ? error.message : error);
      }
    }

    const devicesReached = web.sent + (onesignal?.recipients ?? 0);
    return json({
      success: true,
      devices: devicesReached,
      saved_devices: webDevices.length + nativeDevices.length,
      web: webError ? { error: "failed" } : web,
      onesignal,
    });
  } catch (error) {
    console.error("Test push error:", error instanceof Error ? error.message : error);
    return json({ error: "Couldn't send the test. Please try again." }, 500);
  }
});
