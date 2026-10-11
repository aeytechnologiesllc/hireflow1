import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";

/**
 * The signed-in account behind a request, or a 401 to return.
 *
 * verify_jwt = true lets the site's public key through (it is a valid JWT),
 * so a function that spends money on every call must still ask who is
 * calling. Pair it with guardAuthenticatedAiCall for a per-account limit.
 */
export async function requireSignedInUser(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<{ userId: string; refusal: null } | { userId: null; refusal: Response }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const client = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data } = await client.auth.getUser().catch(() => ({ data: { user: null } }));
  if (data?.user?.id) return { userId: data.user.id, refusal: null };
  return {
    userId: null,
    refusal: new Response(JSON.stringify({ error: "Please sign in again." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
  };
}
