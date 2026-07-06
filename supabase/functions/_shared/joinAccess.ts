/**
 * joinAccess — shared auth + JOIN-token resolution for the join-* edge functions.
 *
 * Token model (owner decision 2026-07-04): ONE platform-owned JOIN account powers
 * all employers → the `JOIN_API_TOKEN` Supabase secret is the default. An employer
 * who connected their OWN JOIN account in Settings (employer_integrations, encrypted)
 * overrides the platform token for their jobs.
 */
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decryptSecret } from "./secretCrypto.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Authenticate the caller and return their user + an admin client. */
export async function requireUser(req: Request): Promise<{ userId: string; admin: SupabaseClient }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("No authorization header");

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new Error("User not authenticated");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  return { userId: user.id, admin };
}

/**
 * Resolve the JOIN API token to use for an employer's jobs.
 * Order: employer's own connected token (Settings) → platform token (JOIN_API_TOKEN secret).
 * Returns null when neither is configured — callers should respond with a clean
 * "not configured" instead of an error, so the UI can show setup guidance.
 */
export async function resolveJoinToken(admin: SupabaseClient, employerId: string): Promise<{ token: string; source: "employer" | "platform" } | null> {
  const { data: row } = await admin
    .from("employer_integrations")
    .select("api_token_ciphertext, api_token_nonce, status")
    .eq("employer_id", employerId)
    .eq("provider", "join")
    .eq("status", "connected")
    .maybeSingle();

  if (row?.api_token_ciphertext && row?.api_token_nonce) {
    const key = Deno.env.get("JOIN_TOKEN_ENCRYPTION_KEY");
    if (key) {
      try {
        const token = await decryptSecret(row.api_token_ciphertext, row.api_token_nonce, key);
        if (token?.trim()) return { token: token.trim(), source: "employer" };
      } catch (e) {
        console.error("[joinAccess] failed to decrypt employer token, falling back to platform", e);
      }
    }
  }

  const platform = (Deno.env.get("JOIN_API_TOKEN") ?? "").trim();
  if (platform) return { token: platform, source: "platform" };
  return null;
}
