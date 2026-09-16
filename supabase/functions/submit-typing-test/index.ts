/**
 * submit-typing-test — server-side grading for TypingTestPhase.tsx.
 *
 * Part of the candidate-trust conversion described in
 * docs/TRUSTED-RESULTS.md. Before this function existed, TypingTestPhase.tsx
 * computed wpm/accuracy/score in the browser (from the candidate's own
 * typed text and their own JS-measured elapsed time) and wrote the result
 * straight into `applications.notes`/`phase` with a plain candidate-session
 * `supabase.from("applications").update(...)` call — trivially forgeable
 * from devtools before trigger-ava-analysis ever ran.
 *
 * Two actions:
 *
 *   "start"    — records a SERVER clock start time for (applicationId,
 *                stepId) in typing_test_starts, and picks + echoes back the
 *                passage the candidate must type. Called the moment the
 *                candidate presses "Start typing test" (including a retry —
 *                each call overwrites that step's row with a fresh
 *                started_at, a cleared ended_at, and a freshly (re)chosen
 *                passage).
 *
 *   "complete" — stamps the SAME row's ended_at with the server clock the
 *                instant typing actually stops (TypingTestPhase.tsx's
 *                handleTestComplete — time running out, or "Finish early").
 *                This is what pins the graded elapsed time to when typing
 *                stopped rather than to whenever "submit" is later called —
 *                see resolveElapsedMs in calculateResults.ts for why this
 *                exists. Idempotent: a second call is a no-op if ended_at
 *                is already set.
 *
 *   "submit"   — takes the candidate's typed text, computes elapsed time as
 *                ended_at - started_at when "complete" already ran (falling
 *                back to Date.now() - started_at only if it didn't — see
 *                resolveElapsedMs), reproduces TypingTestPhase.tsx's own
 *                scoring formula exactly (calculateResults.ts, shared with
 *                scripts/typing_test_results.test.mjs), refuses a submission
 *                with no matching start row or an implausibly fast elapsed
 *                time for the amount of text typed, then calls
 *                recordStepResult (resultKey "typingTestResult",
 *                legacyStepEntry matching the exact shape the old client
 *                write used) and returns outcome.next.
 *
 * The candidate's own anti-cheat violation log (tab switches, blocked
 * copy/paste/cut, right-click, keyboard shortcuts) is carried through
 * untouched as candidate-reported evidence, in the same notes shape as
 * before — it was never a scoring input in the original client formula
 * either, and stays that way here.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCandidateJourney, type WorkflowStepLike } from "../_shared/candidateJourney.ts";
import { hasReachedStep, recordStepResult, type MinimalSupabaseAdmin } from "../_shared/trustedResults.ts";
import { calculateTypingResults, isImplausiblyFast, pickTypingPassage, resolveElapsedMs } from "./calculateResults.ts";

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

interface StartPayload {
  action: "start";
  applicationId: string;
  stepId: string;
}

interface CompletePayload {
  action: "complete";
  applicationId: string;
  stepId: string;
}

interface AntiCheatViolation {
  type: string;
  timestamp: string;
  details?: string;
}

interface SubmitPayload {
  action: "submit";
  applicationId: string;
  stepId: string;
  typedText: string;
  violations?: AntiCheatViolation[];
}

type RequestPayload = StartPayload | CompletePayload | SubmitPayload;

interface JobRow {
  required_wpm: number | null;
  processing_mode: string | null;
  workflow_steps: unknown;
  quiz_questions: unknown;
}

interface ApplicationRow {
  id: string;
  candidate_id: string;
  phase: string | null;
  status: string | null;
  notes: string | null;
  jobs: JobRow | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const payload = (await req.json()) as Partial<RequestPayload>;
    if (!payload || typeof payload !== "object") {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }
    const applicationId = typeof payload.applicationId === "string" ? payload.applicationId : "";
    const stepId = typeof payload.stepId === "string" ? payload.stepId : "";
    if (!applicationId || !stepId) {
      return jsonResponse({ error: "applicationId and stepId are required" }, 400);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Both actions need the application + its job's journey config to
    // confirm the candidate has actually reached this step — fetch once.
    const { data: appData, error: appError } = await admin
      .from("applications")
      .select("id, candidate_id, phase, status, notes, jobs:job_id ( required_wpm, processing_mode, workflow_steps, quiz_questions )")
      .eq("id", applicationId)
      .maybeSingle();

    if (appError || !appData) {
      return jsonResponse({ error: "Application not found" }, 404);
    }
    const application = appData as unknown as ApplicationRow;

    if (application.candidate_id !== user.id) {
      return jsonResponse({ error: "You are not authorized to act on this application" }, 403);
    }
    if (application.status === "rejected") {
      return jsonResponse({ error: "Application has been rejected" }, 400);
    }

    const job = application.jobs ?? { required_wpm: null, processing_mode: null, workflow_steps: [], quiz_questions: [] };
    const workflowSteps = (job.workflow_steps ?? []) as WorkflowStepLike[];
    const quizQuestions = job.quiz_questions as unknown[] | undefined;
    const hasQuiz = Array.isArray(quizQuestions) && quizQuestions.length > 0;
    const steps = buildCandidateJourney(workflowSteps, { hasQuiz });

    const reached = hasReachedStep(steps, {
      stepId,
      expectedType: "typing_test",
      phase: application.phase,
      status: application.status,
    });
    if (!reached.reached) {
      return jsonResponse(
        { error: `Candidate has not reached step "${stepId}"` },
        reached.reason === "unrecognized_or_wrong_type_step" ? 404 : 409,
      );
    }

    if (payload.action === "start") {
      const targetText = pickTypingPassage();
      // ended_at MUST be explicitly reset to null here: PostgREST's upsert
      // only sets the columns present in the payload on conflict, so a
      // "Try again" retry that omitted it would leave the PREVIOUS
      // attempt's ended_at sitting on the row — submit would then compute
      // elapsed time against a start it stamped for this attempt but an end
      // it stamped for the last one.
      const { error: upsertError } = await admin
        .from("typing_test_starts")
        .upsert(
          {
            application_id: applicationId,
            step_id: stepId,
            target_text: targetText,
            started_at: new Date().toISOString(),
            ended_at: null,
          },
          { onConflict: "application_id,step_id" },
        );
      if (upsertError) {
        console.error("[submit-typing-test] Failed to record start:", upsertError);
        return jsonResponse({ error: "Failed to start typing test" }, 500);
      }
      return jsonResponse({ targetText });
    }

    if (payload.action === "complete") {
      // Freezes elapsed time the instant typing actually stops — see
      // resolveElapsedMs in calculateResults.ts. Idempotent: only stamps
      // ended_at when it isn't already set, so a duplicate call (e.g. a
      // retried request) can't push it later.
      const { data: startRow, error: startError } = await admin
        .from("typing_test_starts")
        .select("id, ended_at")
        .eq("application_id", applicationId)
        .eq("step_id", stepId)
        .maybeSingle();

      if (startError || !startRow) {
        return jsonResponse({ error: "no_start_recorded" }, 400);
      }

      if (!startRow.ended_at) {
        const { error: completeError } = await admin
          .from("typing_test_starts")
          .update({ ended_at: new Date().toISOString() })
          .eq("id", startRow.id as string)
          .is("ended_at", null);
        if (completeError) {
          console.error("[submit-typing-test] Failed to record completion:", completeError);
          return jsonResponse({ error: "Failed to record test completion" }, 500);
        }
      }
      return jsonResponse({ ok: true });
    }

    if (payload.action === "submit") {
      const typedText = typeof payload.typedText === "string" ? payload.typedText : "";
      const violations = Array.isArray(payload.violations) ? payload.violations : [];

      const { data: startRow, error: startError } = await admin
        .from("typing_test_starts")
        .select("target_text, started_at, ended_at")
        .eq("application_id", applicationId)
        .eq("step_id", stepId)
        .maybeSingle();

      if (startError || !startRow) {
        return jsonResponse({ error: "no_start_recorded" }, 400);
      }

      const startedAtMs = new Date(startRow.started_at as string).getTime();
      // Prefer the server timestamp "complete" froze the instant typing
      // stopped over the time this "submit" request happens to arrive —
      // otherwise time spent reading the results screen before clicking
      // "Submit results" silently inflates elapsedMs and deflates the
      // score for an honest candidate who typed exactly as well either
      // way. Falls back to Date.now() - startedAtMs only if "complete"
      // never landed (e.g. a transient network failure) — no worse than
      // the un-fixed behavior for that edge case, never the common path.
      const endedAtMs = startRow.ended_at ? new Date(startRow.ended_at as string).getTime() : null;
      const elapsedMs = resolveElapsedMs(startedAtMs, endedAtMs, Date.now());

      if (isImplausiblyFast(typedText.length, elapsedMs)) {
        return jsonResponse({ error: "implausible_typing_speed" }, 400);
      }

      const requiredWpm = job.required_wpm || 40;
      const results = calculateTypingResults(typedText, startRow.target_text as string, elapsedMs, requiredWpm);
      const tabSwitchViolations = violations.filter((v) => v?.type === "tab_switch").length;
      const completedAt = new Date().toISOString();

      const resultForKey = {
        wpm: results.wpm,
        accuracy: results.accuracy,
        score: results.score,
        passed: results.passed,
        requiredWpm,
        tabSwitches: tabSwitchViolations,
        violations,
      };
      const legacyStepEntry = {
        type: "typing_test",
        ...resultForKey,
        completedAt,
      };

      // The real supabase-js client is structurally far richer than
      // MinimalSupabaseAdmin (and its .maybeSingle() thenable isn't a real
      // Promise), which trips `deno check`'s type-instantiation depth limit
      // when passed straight through — a plain structural cast is safe
      // here since recordStepResult only ever calls the small subset of
      // methods MinimalSupabaseAdmin declares.
      const outcome = await recordStepResult(admin as unknown as MinimalSupabaseAdmin, {
        applicationId,
        callerUserId: user.id,
        stepId,
        stepType: "typing_test",
        resultKey: "typingTestResult",
        result: resultForKey,
        legacyStepEntry,
      });

      if (!outcome.ok) {
        return jsonResponse({ error: outcome.error }, outcome.code === "step_not_reached" ? 409 : 400);
      }

      // Best-effort — matches the informational sentence the removed
      // client write used to put in phase_ai_analysis (cockpit's mapper
      // falls back to it only until trigger-ava-analysis's own analysis
      // lands moments later). Never fails the request.
      const speedPercent = Math.round((results.wpm / requiredWpm) * 100);
      const phaseAiAnalysis =
        `Typing test: ${results.wpm} WPM (${speedPercent}% of ${requiredWpm} WPM target), ` +
        `Accuracy: ${results.accuracy}%, Combined Score: ${results.score}%. ` +
        `Local calculation: ${results.passed ? "PASSED" : "FAILED"}. Backend will compute final weighted score.`;
      const { error: analysisError } = await admin
        .from("applications")
        .update({ phase_ai_analysis: phaseAiAnalysis })
        .eq("id", applicationId);
      if (analysisError) {
        console.error("[submit-typing-test] Failed to write phase_ai_analysis (non-fatal):", analysisError);
      }

      return jsonResponse({ results: resultForKey, next: outcome.next });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("[submit-typing-test] Unhandled error:", error);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
