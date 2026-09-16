import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recordStepResult } from "../_shared/trustedResults.ts";
import type { MinimalSupabaseAdmin, StepType } from "../_shared/trustedResults.ts";
import {
  buildVideoIntroLegacyStepEntry,
  buildVideoIntroResult,
  formatVideoIntroPhaseAnalysis,
  isPlausibleVideoObjectPath,
  isValidDuration,
  resolveVideoStepType,
  type WorkflowStepLite,
} from "./logic.ts";

/**
 * complete-video-intro — the server-side half of the video_intro /
 * video_message part-B conversion (see docs/TRUSTED-RESULTS.md). Replaces
 * VideoIntroPhase.tsx's own direct
 * `supabase.from("applications").update({ notes, phase, phase_ai_analysis })`
 * call: the browser now uploads the recording to the `videos` bucket exactly
 * as before, then calls this function with the resulting storage path
 * instead of writing `applications` itself.
 *
 * verify_jwt = true (supabase/config.toml) — the gateway has already
 * rejected an unauthenticated request before this code runs; the
 * getUser() call below is what turns that verified JWT into an actual
 * candidate identity this function can check against `applications.candidate_id`.
 *
 * What this function does that the browser can no longer be trusted to do
 * honestly:
 *   1. Resolves the caller's identity from their own JWT (never a body
 *      param).
 *   2. Confirms the candidate-supplied storage path is plausibly THEIR OWN
 *      recording for THIS application/step (isPlausibleVideoObjectPath),
 *      then confirms an object really exists there in the `videos` bucket —
 *      a path that merely matches the naming convention proves nothing on
 *      its own.
 *   3. Builds the exact `videoIntroResult` / `notes[stepId]` shapes
 *      VideoIntroPhase.tsx always wrote (video intro is completion-based:
 *      once a real recording exists, it always "passes" — see logic.ts's
 *      own header comment for why that isn't a gap introduced here).
 *   4. Calls `recordStepResult`, which verifies the caller really owns this
 *      application, has actually reached this step, and merges the result
 *      into `notes`/`phase`/`status` using the same rules the browser's own
 *      local computation used to apply.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Identify the caller from their own JWT — never a body-supplied id.
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Authentication required" }, 401);
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Invalid authentication token" }, 401);
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const applicationId = typeof body.applicationId === "string" ? body.applicationId : null;
    const stepId = typeof body.stepId === "string" ? body.stepId : null;
    const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl : null;
    const duration = body.duration;

    if (!applicationId || !stepId || !videoUrl || !isValidDuration(duration)) {
      return jsonResponse(
        { error: "applicationId, stepId, videoUrl and a numeric duration are all required" },
        400,
      );
    }

    // The path must match THIS caller's own uid and THIS application/step's
    // own naming before anything else — otherwise a candidate could point
    // videoUrl at an old recording, another candidate's object, or a
    // made-up path that happens to parse.
    if (!isPlausibleVideoObjectPath(videoUrl, { callerUserId: user.id, applicationId, stepId })) {
      return jsonResponse(
        { error: "videoUrl does not match this candidate's own recording for this application/step" },
        400,
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: appRow, error: appError } = await admin
      .from("applications")
      .select("id, candidate_id, jobs:job_id ( workflow_steps )")
      .eq("id", applicationId)
      .maybeSingle();

    if (appError || !appRow) {
      return jsonResponse({ error: "Application not found" }, 404);
    }
    // Belt-and-braces: recordStepResult below checks this too, but this
    // avoids leaking a storage listing for an application the caller
    // doesn't even own.
    if ((appRow as { candidate_id: string }).candidate_id !== user.id) {
      return jsonResponse({ error: "Caller is not this application's candidate" }, 403);
    }

    // Confirm an object actually exists at that path — a path that merely
    // matches the naming convention proves nothing on its own (the
    // MediaRecorder could have produced nothing, or the upload could have
    // been interrupted after the client computed the name but before it
    // finished).
    const objectName = videoUrl.slice(user.id.length + 1); // strip the leading "<uid>/"
    const { data: listing, error: listError } = await admin.storage
      .from("videos")
      .list(user.id, { search: `${applicationId}-${stepId}-`, limit: 100 });

    const found =
      !listError &&
      Array.isArray(listing) &&
      listing.some((entry) => entry.name === objectName && (entry.metadata?.size ?? 1) > 0);

    if (!found) {
      return jsonResponse({ error: "No uploaded video found at that path" }, 400);
    }

    const workflowSteps = ((appRow as { jobs?: { workflow_steps?: unknown } }).jobs?.workflow_steps ??
      []) as WorkflowStepLite[];
    const stepType = resolveVideoStepType(workflowSteps, stepId) as StepType;

    const recordedAt = new Date().toISOString();
    const result = buildVideoIntroResult({ duration, videoUrl });
    const legacyStepEntry = buildVideoIntroLegacyStepEntry({ duration, videoUrl, stepType, recordedAt });

    // supabase-js's own PostgrestBuilder return type doesn't structurally
    // satisfy MinimalSupabaseAdmin's plain-Promise shape closely enough for
    // TS to unify without excessive instantiation depth (it's PromiseLike,
    // thenable, and behaviorally identical — this is a type-checker
    // limitation, not a real runtime mismatch). The real client is used
    // as-is at runtime; only the static type is narrowed here.
    const outcome = await recordStepResult(admin as unknown as MinimalSupabaseAdmin, {
      applicationId,
      callerUserId: user.id,
      stepId,
      stepType,
      resultKey: "videoIntroResult",
      result,
      legacyStepEntry,
      // autopilot-batch/index.ts:129 and usePendingActionsCount.ts:77 read
      // this flat key EXCLUSIVELY, never videoIntroResult — see
      // docs/TRUSTED-RESULTS.md's result_key table.
      extraNotesEntries: { videoIntroUrl: videoUrl },
    });

    if (!outcome.ok) {
      return jsonResponse(
        { error: outcome.error, code: outcome.code },
        outcome.code === "step_not_reached" ? 409 : 400,
      );
    }

    // Cosmetic parity with the write this step used to make directly — the
    // cockpit's mapper (src/cockpit/lib/mappers.ts:295-296) falls back to
    // phase_ai_analysis while ai_analysis is still null, exactly the gap
    // this step's own submit used to fill before trigger-ava-analysis's own
    // scored write lands moments later. Best-effort only: never turns an
    // already-recorded, successful step result into an error response.
    const { error: analysisError } = await admin
      .from("applications")
      .update({ phase_ai_analysis: formatVideoIntroPhaseAnalysis(duration, videoUrl) })
      .eq("id", applicationId);
    if (analysisError) {
      console.error("[complete-video-intro] phase_ai_analysis update failed:", analysisError.message);
    }

    return jsonResponse({ success: true, next: outcome.next });
  } catch (error) {
    console.error("[complete-video-intro] Unexpected error:", error);
    return jsonResponse(
      { error: "Unexpected error", details: error instanceof Error ? error.message : "Unknown" },
      500,
    );
  }
});
