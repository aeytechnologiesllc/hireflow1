/**
 * join-sync-applications — pulls applications from JOIN back into HireFlow.
 *
 * JOIN has no webhooks, so we poll GET /applications filtered by jobExternalId
 * (= the HireFlow job id we set at publish) + an updatedAtGte watermark.
 *
 * Import rules (owner-approved):
 *  - Applicants become REAL candidate users: profiles are matched by email; if
 *    none exists we create the auth user (email confirmed, no password email) —
 *    the handle_new_user trigger creates the profile row automatically.
 *  - Dedupe: applications carry (external_provider='join', external_application_id)
 *    with a unique index — the same JOIN application can never import twice.
 *    A candidate who already applied to the same job directly is also skipped
 *    (applications are unique per job+candidate).
 *  - We preserve: JOIN application id, original applied date, hiring state → status,
 *    CV url, and WHICH BOARD the applicant came from (source.product).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json, requireUser, resolveJoinToken } from "../_shared/joinAccess.ts";
import { getApplications, JoinApiError } from "../_shared/joinClient.ts";
import {
  externalApplicationId,
  joinCandidateFullName,
  joinHiringStateToStatus,
  joinResumeUrl,
  type JoinApplicationLike,
} from "../_shared/joinMapping.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const { userId, admin } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const onlyJobId = body?.jobId ? String(body.jobId) : null;

    const tokenInfo = await resolveJoinToken(admin, userId);
    if (!tokenInfo) return json({ configured: false, status: "not_configured", imported: 0 });
    const { token } = tokenInfo;

    // Which of the caller's jobs are distributed via JOIN?
    let postsQuery = admin
      .from("job_distribution_posts")
      .select("job_id, provider_job_id, last_synced_at")
      .eq("employer_id", userId)
      .eq("provider", "join")
      .not("provider_job_id", "is", null);
    if (onlyJobId) postsQuery = postsQuery.eq("job_id", onlyJobId);
    const { data: posts, error: postsError } = await postsQuery;
    if (postsError) throw postsError;
    if (!posts || posts.length === 0) return json({ configured: true, imported: 0, skipped: 0, jobs: 0, note: "No JOIN-distributed jobs to sync" });

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const post of posts) {
      // Watermark with a 10-minute overlap so boundary updates are never missed
      // (the unique index makes re-processing harmless).
      const updatedAtGte = post.last_synced_at
        ? new Date(new Date(post.last_synced_at).getTime() - 10 * 60 * 1000).toISOString()
        : undefined;

      try {
        for (let page = 1; page <= 20; page++) {
          const apps = (await getApplications(token, {
            jobExternalId: post.job_id,
            updatedAtGte,
            page,
            pageSize: 50,
          })) as JoinApplicationLike[];
          if (!Array.isArray(apps) || apps.length === 0) break;

          for (const app of apps) {
            const extId = externalApplicationId(app);
            const email = (app.candidate?.email ?? "").trim().toLowerCase();
            if (!email) { skipped++; continue; }

            // Already imported?
            const { data: dupe } = await admin
              .from("applications")
              .select("id")
              .eq("external_provider", "join")
              .eq("external_application_id", extId)
              .maybeSingle();
            if (dupe) { skipped++; continue; }

            // Find or create the candidate user (profile matched by email).
            let candidateId: string | null = null;
            const { data: profile } = await admin
              .from("profiles")
              .select("user_id")
              .ilike("email", email)
              .maybeSingle();
            if (profile?.user_id) {
              candidateId = profile.user_id;
            } else {
              const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
                email,
                email_confirm: true,
                user_metadata: { full_name: joinCandidateFullName(app), role: "candidate" },
              });
              if (createError || !createdUser?.user) {
                errors.push(`Could not create candidate for ${email}: ${createError?.message ?? "unknown"}`);
                skipped++;
                continue;
              }
              candidateId = createdUser.user.id;
              // Phone lands on the profile the trigger created.
              const phone = app.candidate?.phoneNumber ?? null;
              if (phone) {
                await admin.from("profiles").update({ phone }).eq("user_id", candidateId);
              }
            }

            // Same candidate may have applied directly on HireFlow already.
            const { data: existingApp } = await admin
              .from("applications")
              .select("id")
              .eq("job_id", post.job_id)
              .eq("candidate_id", candidateId)
              .maybeSingle();
            if (existingApp) { skipped++; continue; }

            const board = app.source?.product ? String(app.source.product) : "JOIN network";
            const { error: insertError } = await admin.from("applications").insert({
              job_id: post.job_id,
              candidate_id: candidateId,
              status: joinHiringStateToStatus(app.hiringState),
              phase: "application",
              source: "join",
              external_provider: "join",
              external_application_id: extId,
              resume_url: joinResumeUrl(app),
              employer_notes: `Imported from JOIN · applied via: ${board}`,
              ...(app.createdAt ? { created_at: app.createdAt } : {}),
            });
            if (insertError) {
              // Unique-index race → someone else imported it; anything else → report.
              if (/duplicate|unique/i.test(insertError.message)) { skipped++; }
              else { errors.push(`Import failed for JOIN app ${extId}: ${insertError.message}`); skipped++; }
              continue;
            }
            imported++;
          }

          if (apps.length < 50) break; // last page
        }

        await admin
          .from("job_distribution_posts")
          .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("job_id", post.job_id)
          .eq("provider", "join");
      } catch (e) {
        const message = e instanceof JoinApiError ? e.message : e instanceof Error ? e.message : String(e);
        errors.push(`Sync failed for job ${post.job_id}: ${message}`);
        await admin
          .from("job_distribution_posts")
          .update({ last_error: message, updated_at: new Date().toISOString() })
          .eq("job_id", post.job_id)
          .eq("provider", "join");
      }
    }

    return json({ configured: true, jobs: posts.length, imported, skipped, errors: errors.length ? errors : undefined });
  } catch (error) {
    console.error("[join-sync-applications]", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: message }, /authenticated|authorization/i.test(message) ? 401 : 400);
  }
});
