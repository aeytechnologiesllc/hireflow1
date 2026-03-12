import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
    const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OneSignal not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if the user has any registered push subscriptions
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("player_id")
      .eq("user_id", user.id);

    const subCount = subs?.length ?? 0;
    console.log(`[test-push] User ${user.id} has ${subCount} push subscription(s)`);

    // Send test notification via OneSignal
    const payload = {
      app_id: ONESIGNAL_APP_ID,
      include_aliases: { external_id: [user.id] },
      target_channel: "push",
      headings: { en: "🎉 HireFlow Connected!" },
      contents: { en: "Push notifications are working. You'll receive hiring updates here." },
      ios_badgeType: "Increase",
      ios_badgeCount: 1,
    };

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("[test-push] OneSignal response:", JSON.stringify(result));

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "OneSignal API error", details: result, stored_subscriptions: subCount }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const recipients = result.recipients ?? 0;

    return new Response(
      JSON.stringify({
        success: true,
        message: recipients > 0
          ? "Test notification sent!"
          : "Notification created but 0 recipients matched. The device may not have its external_id mapped yet — try re-registering.",
        onesignal_id: result.id,
        recipients,
        stored_subscriptions: subCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Test push error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
