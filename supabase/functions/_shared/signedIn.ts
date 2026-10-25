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

/**
 * The business a signed-in account writes jobs for, or null when it is not a
 * hiring account (2026-10-25, the second Phase 5 review): its own when it is
 * a business owner, or the business whose team it is on with leave to create
 * jobs. An applicant's account is null: job-writing AI was a free AI call for
 * any account, each counted as its own "business" with its own daily budget,
 * so a handful of free accounts could use up the whole platform's day.
 */
export async function jobWritingBusiness(userId: string): Promise<string | null> {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!userId || !url || !serviceKey) return null;
  try {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    if ((roles ?? []).some((r: { role?: string }) => r.role === "employer")) return userId;
    const { data: team } = await admin
      .from("team_members")
      .select("employer_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .eq("can_create_jobs", true)
      .limit(1)
      .maybeSingle();
    return typeof team?.employer_id === "string" ? team.employer_id : null;
  } catch {
    return null;
  }
}

/**
 * The business a signed-in account works for, or null when it is not a
 * hiring account: its own as a business owner, or the business whose team it
 * is on (any active member). For hiring-team AI that is not job writing
 * (documents to send, their signing fields): an applicant's account spent
 * there on its own daily budget (the third Phase 5 review).
 */
export async function hiringBusiness(userId: string): Promise<string | null> {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!userId || !url || !serviceKey) return null;
  try {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    if ((roles ?? []).some((r: { role?: string }) => r.role === "employer")) return userId;
    const { data: team } = await admin
      .from("team_members")
      .select("employer_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    return typeof team?.employer_id === "string" ? team.employer_id : null;
  } catch {
    return null;
  }
}
