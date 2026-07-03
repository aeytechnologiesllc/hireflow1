import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { encryptSecret } from "../_shared/secretCrypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type JoinIntegrationRow = {
  status: "connected" | "disconnected" | "error";
  token_preview: string;
  connected_at: string | null;
  last_validated_at: string | null;
  last_error: string | null;
  updated_at: string | null;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function maskToken(token: string): string {
  const compact = token.trim();
  if (compact.length <= 10) return "saved token";
  return `${compact.slice(0, 4)}...${compact.slice(-4)}`;
}

function statusPayload(row?: JoinIntegrationRow | null) {
  if (!row) {
    return {
      provider: "join",
      connected: false,
      status: "not_connected",
      tokenPreview: null,
      connectedAt: null,
      lastValidatedAt: null,
      lastError: null,
      updatedAt: null,
    };
  }

  return {
    provider: "join",
    connected: row.status === "connected",
    status: row.status,
    tokenPreview: row.token_preview,
    connectedAt: row.connected_at,
    lastValidatedAt: row.last_validated_at,
    lastError: row.last_error,
    updatedAt: row.updated_at,
  };
}

async function requireEmployerOwner(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("No authorization header");

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) throw new Error("User not authenticated");

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: employerRole, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "employer")
    .maybeSingle();

  if (roleError) throw roleError;
  if (!employerRole) throw new Error("Only employer account owners can manage JOIN connections");

  return { user, supabaseAdmin };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  try {
    const { user, supabaseAdmin } = await requireEmployerOwner(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "get");

    if (action === "get") {
      const { data, error } = await supabaseAdmin
        .from("employer_integrations")
        .select("status, token_preview, connected_at, last_validated_at, last_error, updated_at")
        .eq("employer_id", user.id)
        .eq("provider", "join")
        .maybeSingle();

      if (error) throw error;
      return json(statusPayload(data as JoinIntegrationRow | null));
    }

    if (action === "disconnect") {
      const { error } = await supabaseAdmin
        .from("employer_integrations")
        .delete()
        .eq("employer_id", user.id)
        .eq("provider", "join");

      if (error) throw error;
      return json(statusPayload(null));
    }

    if (action === "connect") {
      const token = String(body?.apiToken ?? "").trim();
      if (token.length < 12) {
        return json({ error: "Paste the full JOIN API token/key before connecting." }, 400);
      }

      const encryptionKey = Deno.env.get("JOIN_TOKEN_ENCRYPTION_KEY");
      if (!encryptionKey || encryptionKey.length < 16) {
        return json({ error: "JOIN token encryption is not configured." }, 500);
      }

      const encrypted = await encryptSecret(token, encryptionKey);
      const now = new Date().toISOString();

      const { data, error } = await supabaseAdmin
        .from("employer_integrations")
        .upsert({
          employer_id: user.id,
          provider: "join",
          status: "connected",
          api_token_ciphertext: encrypted.ciphertext,
          api_token_nonce: encrypted.nonce,
          token_preview: maskToken(token),
          connected_at: now,
          last_error: null,
          metadata: {
            account_model: "customer_owned",
            setup_source: "settings",
            note: "Customer owns JOIN billing, plan, and API access.",
          },
        }, { onConflict: "employer_id,provider" })
        .select("status, token_preview, connected_at, last_validated_at, last_error, updated_at")
        .single();

      if (error) throw error;
      return json(statusPayload(data as JoinIntegrationRow));
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error: unknown) {
    console.error("[join-integration]", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /authenticated|authorization/i.test(message) ? 401 : /Only employer/i.test(message) ? 403 : 400;
    return json({ error: message }, status);
  }
});
