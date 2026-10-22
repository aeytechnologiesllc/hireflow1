/**
 * push-public-key — the public half of HireFlow's phone-notification sender key.
 *
 * A browser needs it to subscribe ("applicationServerKey"), so the app asks
 * for it just before it turns notifications on. The first call anywhere
 * creates the key pair and stores it (_shared/webPush.ts getVapidKeys); every
 * later call returns the same public key. The private half never leaves the
 * server. Nobody creates or pastes a key.
 *
 * GET or POST, answered the same. A public key is not a secret, and the
 * gateway lets the site's public key through whether or not verify_jwt is on,
 * so this checks nothing about the caller. It reads one row.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { getVapidKeys } from "../_shared/webPush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const keys = await getVapidKeys(admin);
    return json({ publicKey: keys.publicKey });
  } catch (error) {
    console.error("push-public-key error:", error instanceof Error ? error.message : error);
    return json({ error: "Notifications aren't available right now." }, 500);
  }
});
