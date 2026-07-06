/**
 * join-publish-job — sends a published HireFlow job to JOIN.com for distribution
 * across JOIN's job-board network, and records the result in job_distribution_posts.
 *
 * SAFETY MODEL (owner requirement — a job on JOIN multiposts the moment it's ONLINE):
 *  - Jobs are ALWAYS created OFFLINE first.
 *  - They flip ONLINE only when the caller asks (goLive) AND the JOIN_ALLOW_ONLINE
 *    secret is "true" — the platform-level switch stays off until the owner has
 *    approved the first supervised live posting.
 *
 * Response is honest about state: { configured:false } when no token exists yet,
 * status "live" | "offline" | "needs_attention" once wired.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json, requireUser, resolveJoinToken } from "../_shared/joinAccess.ts";
import {
  getCategories,
  getEmploymentTypes,
  getOffices,
  createOffice,
  createJob,
  changeJobStatus,
  JoinApiError,
  type JoinCategoryRef,
  type JoinRef,
} from "../_shared/joinClient.ts";
import {
  mapJobToJoinPayload,
  matchEmploymentTypeId,
  matchSubCategoryId,
  validateJobForJoin,
  type HireflowJobLike,
  type JoinResolvedRefs,
} from "../_shared/joinMapping.ts";

const JOB_FIELDS =
  "id,employer_id,title,description,responsibilities,requirements,location,job_type,is_remote,location_city,location_region,location_country,location_country_code,salary_min,salary_max,salary_currency,salary_period,require_resume,department,experience_level,status,job_code";

function pickFallbackSubCategory(categories: JoinCategoryRef[]): number | null {
  // Prefer an "Other"-ish bucket; else the first sub-category that exists.
  for (const cat of categories) {
    if (/other|misc/i.test(cat.slug ?? cat.name ?? "")) {
      const sub = cat.subCategories?.[0];
      if (sub) return sub.id;
    }
  }
  for (const cat of categories) {
    const sub = cat.subCategories?.[0];
    if (sub) return sub.id;
  }
  return null;
}

function pickFallbackEmploymentType(types: JoinRef[]): number | null {
  const ft = types.find((t) => /full/i.test(`${t.slug ?? ""} ${t.name ?? ""}`));
  return (ft ?? types[0])?.id ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const { userId, admin } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const jobId = String(body?.jobId ?? "").trim();
    const goLive = body?.goLive === true;
    if (!jobId) return json({ error: "jobId is required" }, 400);

    // The caller must own the job.
    const { data: job, error: jobError } = await admin
      .from("jobs")
      .select(JOB_FIELDS)
      .eq("id", jobId)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job) return json({ error: "Job not found" }, 404);
    if (job.employer_id !== userId) return json({ error: "You can only distribute your own jobs" }, 403);

    const tokenInfo = await resolveJoinToken(admin, userId);
    if (!tokenInfo) {
      // Not an error — distribution simply isn't set up yet. UI shows guidance.
      return json({ configured: false, status: "not_configured" });
    }
    const { token } = tokenInfo;

    // Record intent first so a mid-flight failure is visible as needs_attention.
    await admin.from("job_distribution_posts").upsert(
      {
        job_id: job.id,
        employer_id: userId,
        provider: "join",
        external_id: job.id,
        status: "publishing",
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "job_id,provider" },
    );

    // Business-state failures return HTTP 200 with status "needs_attention" —
    // supabase-js functions.invoke hides non-2xx response bodies from the client,
    // and these are states the UI must read. 4xx stays for auth/ownership errors.
    const fail = async (message: string) => {
      await admin
        .from("job_distribution_posts")
        .update({ status: "needs_attention", last_error: message, updated_at: new Date().toISOString() })
        .eq("job_id", job.id)
        .eq("provider", "join");
      return json({ configured: true, status: "needs_attention", error: message });
    };

    // Already sent? Then this call can only be a go-live request.
    const { data: existing } = await admin
      .from("job_distribution_posts")
      .select("provider_job_id")
      .eq("job_id", job.id)
      .eq("provider", "join")
      .maybeSingle();

    const allowOnline = (Deno.env.get("JOIN_ALLOW_ONLINE") ?? "").toLowerCase() === "true";
    const wantOnline = goLive && allowOnline;

    if (existing?.provider_job_id) {
      if (wantOnline) {
        try {
          await changeJobStatus(token, existing.provider_job_id, "ONLINE");
          await admin
            .from("job_distribution_posts")
            .update({ status: "live", published_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
            .eq("job_id", job.id)
            .eq("provider", "join");
          return json({ configured: true, status: "live", providerJobId: existing.provider_job_id });
        } catch (e) {
          return await fail(e instanceof JoinApiError ? e.message : "Could not set the JOIN job live");
        }
      }
      await admin
        .from("job_distribution_posts")
        .update({ status: "offline", updated_at: new Date().toISOString() })
        .eq("job_id", job.id)
        .eq("provider", "join");
      return json({ configured: true, status: "offline", providerJobId: existing.provider_job_id, note: "Already created at JOIN (offline)" });
    }

    // ── Resolve JOIN reference data ────────────────────────────────────────
    let categories: JoinCategoryRef[];
    let empTypes: JoinRef[];
    try {
      [categories, empTypes] = await Promise.all([getCategories(token), getEmploymentTypes(token)]);
    } catch (e) {
      return await fail(
        e instanceof JoinApiError && e.status === 401
          ? "JOIN rejected the API token — check the connection."
          : `Could not load JOIN reference data: ${e instanceof Error ? e.message : e}`,
      );
    }

    const categoryId = matchSubCategoryId(job as HireflowJobLike, categories) ?? pickFallbackSubCategory(categories);
    const employmentTypeId = matchEmploymentTypeId(job.job_type, empTypes) ?? pickFallbackEmploymentType(empTypes);

    // Office: match by the job's country/city, else create one.
    const countryIso = (job.location_country_code ?? "US").toUpperCase();
    const city = (job.location_city ?? "").trim() || (job.location ?? "").split(",")[0].trim() || "Remote";
    let officeId: number | null = null;
    try {
      const offices = await getOffices(token, { countryCode: countryIso });
      const match =
        offices.find((o) => (o.city ?? "").toLowerCase() === city.toLowerCase()) ??
        offices.find((o) => o.isDefault) ??
        null;
      officeId = match?.id ?? null;
      if (!officeId) {
        const created = await createOffice(token, { countryIso, city, name: `${city} (${countryIso})` });
        officeId = created.id;
      }
    } catch (e) {
      return await fail(`Could not resolve a JOIN office/location: ${e instanceof Error ? e.message : e}`);
    }

    const refs: Partial<JoinResolvedRefs> = {
      categoryId: categoryId ?? undefined,
      employmentTypeId: employmentTypeId ?? undefined,
      officeId: officeId ?? undefined,
      language: "en",
    };
    const problems = validateJobForJoin(job as HireflowJobLike, refs);
    if (problems.length > 0) return await fail(problems.join(" "));

    // ── Create the job at JOIN — ALWAYS OFFLINE at creation ───────────────
    const payload = mapJobToJoinPayload(job as HireflowJobLike, refs as JoinResolvedRefs, { publishLive: false });
    let joinJobId: number;
    try {
      const created = await createJob(token, payload as unknown as Record<string, unknown>);
      joinJobId = created.id;
    } catch (e) {
      return await fail(e instanceof JoinApiError ? `JOIN rejected the job: ${e.message}` : `Could not create the job at JOIN: ${e instanceof Error ? e.message : e}`);
    }

    let finalStatus: "live" | "offline" = "offline";
    if (wantOnline) {
      try {
        await changeJobStatus(token, joinJobId, "ONLINE");
        finalStatus = "live";
      } catch (e) {
        // The job exists but couldn't go live — surface it, keep the record.
        await admin
          .from("job_distribution_posts")
          .update({
            provider_job_id: String(joinJobId),
            status: "needs_attention",
            last_error: `Created at JOIN but could not go live: ${e instanceof Error ? e.message : e}`,
            raw_provider_response: { joinJobId },
            updated_at: new Date().toISOString(),
          })
          .eq("job_id", job.id)
          .eq("provider", "join");
        return json({ configured: true, status: "needs_attention", providerJobId: joinJobId, error: "Created at JOIN but could not go live" });
      }
    }

    await admin
      .from("job_distribution_posts")
      .update({
        provider_job_id: String(joinJobId),
        status: finalStatus,
        published_at: finalStatus === "live" ? new Date().toISOString() : null,
        last_error: null,
        raw_provider_response: { joinJobId, sentPayloadStatus: payload.status, wantOnline, allowOnline },
        updated_at: new Date().toISOString(),
      })
      .eq("job_id", job.id)
      .eq("provider", "join");

    return json({
      configured: true,
      status: finalStatus,
      providerJobId: joinJobId,
      note: finalStatus === "offline"
        ? (goLive && !allowOnline
          ? "Created at JOIN in review mode (live posting is not enabled yet)"
          : "Created at JOIN (offline)")
        : "Live on JOIN's job-board network",
    });
  } catch (error) {
    console.error("[join-publish-job]", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /authenticated|authorization/i.test(message) ? 401 : 400;
    return json({ error: message }, status);
  }
});
