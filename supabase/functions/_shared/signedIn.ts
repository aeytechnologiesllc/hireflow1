/**
 * signedIn.ts — the signed-in user behind a request, or null
 * (2026-10-25; docs/LAUNCH-PLAN.md, Phase 1, task 3).
 *
 * For public functions (verify_jwt = false) that only signed-in people should
 * be able to spend money on. The gateway lets the site's public key through
 * as a bearer token; that is not a user, so it answers null here.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";

export async function signedInUserId(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !url || !serviceKey) return null;
  try {
    const { data, error } = await createClient(url, serviceKey).auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
