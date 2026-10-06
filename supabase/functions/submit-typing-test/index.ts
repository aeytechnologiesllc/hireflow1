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
 *
 * The assessment record (2026-10-06, docs/ASSESSMENT-RECORD.md §5.1), best
 * effort, never blocking the test:
 *   - "start" pins the passage and the speed target on the attempt
 *     (session.context: target_text, required_wpm, and every run so far:
 *     a "Try again" is another run of the same attempt). It refuses a new
 *     run, before touching typing_test_starts, when the step is finished
 *     (409 step_finished: the result is on file and staff did not hand it
 *     back) or an attempt is being checked right now (409 already_checking):
 *     a run there could never be graded.
 *   - "snapshot" (new; a page on the previous build never sends it): the
 *     text so far, while typing, at most one stored per 5 s of the run and
 *     only in the first 5 minutes of it, so a closed tab still shows how far
 *     they got. Always answers 200; it never blocks the test.
 *   - "complete" may carry `typedText` (and `reason`: "time_up" |
 *     "finished_early"): the text as it stood when typing stopped is stored
 *     as that run's typing_snapshot, with its WPM and accuracy.
 *   - "submit" grades THAT stored text when it exists (the text the page
 *     sends with "submit" only for a page on the previous build), stores the
 *     final snapshot, puts the full grading (word errors, runs) in
 *     session.grading, and builds the notes' violations from the integrity
 *     events the page recorded when there are any.
 *   - once "submit" has recorded the result, an auto-mode job's move to the
 *     next step is asked for by the server too (_shared/stepMoveOn.ts), so a
 *     tab closed while the result was being checked still moves on.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCandidateJourney, type WorkflowStepLike } from "../_shared/candidateJourney.ts";
import { hasReachedStep, recordStepResult, type MinimalSupabaseAdmin } from "../_shared/trustedResults.ts";
import {
  chooseIntegrity,
  chooseTypedText,
  cleanTypingEndedBy,
  failSession,
  findEvent,
  finishGrading,
  gateGrading,
  gradingRecord,
  insertEvent,
  loadIntegrityEvents,
  nextTypingContext,
  planClaim,
  readStepOnFile,
  releaseGrading,
  resolveSession,
  typingAttempts,
  typingEndReason,
  typingProgressKey,
  typingRunFor,
  typingRunKey,
  typingSnapshotDetail,
  typingWordErrors,
  updateContext,
  type AssessmentAdmin,
  computerOnlyGate,
  type SessionResolution,
  type SessionRow,
} from "../_shared/assessmentSession.ts";
import { computerRequiredBody, deviceKindOfRequest, needsComputer } from "../_shared/deviceKind.ts";
import { scheduleStepMoveOn } from "../_shared/stepMoveOn.ts";
import { calculateTypingResults, isImplausiblyFast, pickTypingPassage, resolveElapsedMs, TYPING_FORMULA } from "./calculateResults.ts";

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
  /** Since 2026-10-06: the text as it stood when typing stopped. Optional:
   *  a page on the previous build sends it only with "submit". */
  typedText?: string;
  /** Since 2026-10-06: how typing stopped. */
  reason?: "time_up" | "finished_early";
}

interface SnapshotPayload {
  action: "snapshot";
  applicationId: string;
  stepId: string;
  typedText: string;
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

type RequestPayload = StartPayload | SnapshotPayload | CompletePayload | SubmitPayload;

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

  // An attempt this request claimed for grading: if anything below throws,
  // it is marked failed (the result is still owed), not left "grading".
  let heldClaim: { admin: AssessmentAdmin; sessionId: string } | null = null;

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
    const record = admin as unknown as AssessmentAdmin;

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

    // The attempt's record, best effort (never blocks the test).
    const resolveRecord = async (): Promise<SessionResolution> => {
      const resolved = await resolveSession(record, {
        applicationId,
        stepId,
        userId: user.id,
        stepType: "typing_test",
        purpose: "submit",
      });
      if (!resolved.ok) console.log("[submit-typing-test] not recording:", resolved.reason, resolved.detail ?? "");
      return resolved;
    };
    const openRecord = async (): Promise<SessionRow | null> => {
      const resolved = await resolveRecord();
      return resolved.ok ? resolved.session : null;
    };
    const requiredWpm = job.required_wpm || 40;

    // The typing test is taken on a computer (docs/COMPUTER-ONLY-TESTS.md):
    // the request's headers AND the page's own reading in its body (a phone
    // asking for the desktop site sends a computer's headers). Computers and
    // unknown devices are never asked anything here.
    const requestDevice = deviceKindOfRequest(req, payload);
    const phoneRefused = async (continuable: boolean): Promise<boolean> =>
      needsComputer(requestDevice) &&
      (await computerOnlyGate(record, requestDevice, { applicationId, stepId, userId: user.id, purpose: "submit", steps, continuable })) === "refuse";

    if (payload.action === "start") {
      // Every start is a new run with its own clock, so a phone or tablet
      // never starts one on a step the rule puts on a computer: refused
      // before the attempt is resolved (which would open it) and before the
      // start row is touched.
      if (await phoneRefused(false)) return jsonResponse(computerRequiredBody(requestDevice as "phone" | "tablet"), 400);
      // A new run only where one can still be graded. A finished step (its
      // result is on file and staff did not hand it back) and an attempt
      // being checked right now refuse it BEFORE the start row is reset:
      // otherwise the applicant types a whole run that the submit then
      // answers with the old result ("already recorded"), and the run is
      // lost while the page says it was saved. A stale claim (its request
      // died) does not block: the next submit takes it over.
      const resolved = await resolveRecord();
      if (!resolved.ok && resolved.reason === "step_finished") {
        return jsonResponse({ error: "This typing test is already recorded.", code: "step_finished" }, 409);
      }
      const session = resolved.ok ? resolved.session : null;
      if (session && session.status === "grading" && planClaim(session.status, session.updated_at, Date.now()) === "wait") {
        return jsonResponse({ error: "This typing test is already being checked.", code: "already_checking" }, 409);
      }
      const targetText = pickTypingPassage();
      const startedAt = new Date().toISOString();
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
            started_at: startedAt,
            ended_at: null,
          },
          { onConflict: "application_id,step_id" },
        );
      if (upsertError) {
        console.error("[submit-typing-test] Failed to record start:", upsertError);
        return jsonResponse({ error: "Failed to start typing test" }, 500);
      }
      // Pin the passage and the speed target on the attempt; a "Try again"
      // is the next run of the same attempt.
      if (session) {
        const next = nextTypingContext(session.context, { targetText, requiredWpm, startedAt });
        // The device the attempt started on (once): a phone may later
        // finish only a run a computer started.
        const startedOn = typeof session.context.started_device_kind === "string" && session.context.started_device_kind
          ? {}
          : { started_device_kind: requestDevice };
        await updateContext(record, session, { ...next.context, ...startedOn });
      }
      return jsonResponse({ targetText });
    }

    if (payload.action === "snapshot") {
      // The text so far, while the run is going: recorded or not, the
      // answer is 200 so a page never treats a snapshot as a failure.
      const typed = typeof payload.typedText === "string" ? payload.typedText : null;
      const { data: runRow } = await admin
        .from("typing_test_starts")
        .select("started_at, ended_at")
        .eq("application_id", applicationId)
        .eq("step_id", stepId)
        .maybeSingle();
      const runStartedAt = runRow?.started_at as string | undefined;
      const runElapsedMs = runStartedAt ? Date.now() - new Date(runStartedAt).getTime() : NaN;
      const key = typed !== null && runRow && !runRow.ended_at ? typingProgressKey(runStartedAt, runElapsedMs) : null;
      if (!key) return jsonResponse({ ok: true, recorded: false });
      // A phone or tablet never opens the attempt with a snapshot; one a
      // computer started still takes them (docs/COMPUTER-ONLY-TESTS.md).
      if (await phoneRefused(true)) return jsonResponse({ ok: true, recorded: false });
      const session = await openRecord();
      if (!session) return jsonResponse({ ok: true, recorded: false });
      const saved = await insertEvent(record, {
        sessionId: session.id,
        kind: "typing_snapshot",
        clientMsgId: key,
        detail: typingSnapshotDetail({
          typedText: typed!,
          targetText: null,
          wpm: null,
          accuracy: null,
          elapsedMs: Math.round(runElapsedMs),
          final: false,
          run: typingRunFor(session.context, runStartedAt),
        }),
      });
      return jsonResponse({ ok: true, recorded: saved.inserted });
    }

    if (payload.action === "complete") {
      // A phone or tablet finishes only a run a computer started: never one
      // whose start row is left over from an earlier attempt (staff reopened
      // the step), which would open the next attempt from a phone
      // (docs/COMPUTER-ONLY-TESTS.md). Refused before ended_at is stamped.
      if (await phoneRefused(true)) return jsonResponse(computerRequiredBody(requestDevice as "phone" | "tablet"), 400);
      // Freezes elapsed time the instant typing actually stops — see
      // resolveElapsedMs in calculateResults.ts. Idempotent: only stamps
      // ended_at when it isn't already set, so a duplicate call (e.g. a
      // retried request) can't push it later.
      const { data: startRow, error: startError } = await admin
        .from("typing_test_starts")
        .select("id, ended_at, started_at, target_text")
        .eq("application_id", applicationId)
        .eq("step_id", stepId)
        .maybeSingle();

      if (startError || !startRow) {
        return jsonResponse({ error: "no_start_recorded" }, 400);
      }

      let endedAt = startRow.ended_at as string | null;
      if (!startRow.ended_at) {
        endedAt = new Date().toISOString();
        const { error: completeError } = await admin
          .from("typing_test_starts")
          .update({ ended_at: endedAt })
          .eq("id", startRow.id as string)
          .is("ended_at", null);
        if (completeError) {
          console.error("[submit-typing-test] Failed to record completion:", completeError);
          return jsonResponse({ error: "Failed to record test completion" }, 500);
        }
      }

      // The text as it stood when typing stopped, stored as this run's
      // snapshot: "submit" grades it, and the hiring team sees it against
      // the passage.
      if (typeof payload.typedText === "string") {
        const session = await openRecord();
        const runKey = typingRunKey(startRow.started_at);
        if (session && runKey) {
          const runStartedMs = new Date(startRow.started_at as string).getTime();
          const runElapsedMs = resolveElapsedMs(runStartedMs, endedAt ? new Date(endedAt).getTime() : null, Date.now());
          const target = startRow.target_text as string;
          const runResults = calculateTypingResults(payload.typedText, target, runElapsedMs, requiredWpm);
          const saved = await insertEvent(record, {
            sessionId: session.id,
            kind: "typing_snapshot",
            clientMsgId: runKey,
            detail: typingSnapshotDetail({
              typedText: payload.typedText,
              targetText: target,
              wpm: runResults.wpm,
              accuracy: runResults.accuracy,
              elapsedMs: runElapsedMs,
              final: false,
              run: typingRunFor(session.context, startRow.started_at),
              endedBy: cleanTypingEndedBy(payload.reason),
            }),
          });
          if (saved.error) console.error("[submit-typing-test] run snapshot not stored:", saved.error);
        }
      }
      return jsonResponse({ ok: true });
    }

    if (payload.action === "submit") {
      // The same for the submit: a run a computer started goes on (and a
      // finished step answers its result back); a phone never grades a
      // left-over start row into a new attempt (docs/COMPUTER-ONLY-TESTS.md).
      if (await phoneRefused(true)) return jsonResponse(computerRequiredBody(requestDevice as "phone" | "tablet"), 400);
      const requestViolations = Array.isArray(payload.violations) ? payload.violations : [];

      const { data: startRow, error: startError } = await admin
        .from("typing_test_starts")
        .select("target_text, started_at, ended_at")
        .eq("application_id", applicationId)
        .eq("step_id", stepId)
        .maybeSingle();

      if (startError || !startRow) {
        return jsonResponse({ error: "no_start_recorded" }, 400);
      }

      // ONE request grades an attempt, and a result already on file is never
      // graded again from a request body (a retried or replayed submit gets
      // the recorded result back).
      const resolved = await resolveRecord();
      const session = resolved.ok ? resolved.session : null;
      const gate = await gateGrading(record, session, resolved.ok ? null : resolved.reason);
      if (!gate.go) {
        if (gate.why === "checking") {
          return jsonResponse({ error: "This typing test is already being checked.", code: "already_checking" }, 409);
        }
        const onFile = await readStepOnFile(record, applicationId, stepId, "typingTestResult");
        if (!onFile?.result) return jsonResponse({ error: "This step is already recorded.", code: "already_recorded" }, 409);
        return jsonResponse({ results: onFile.result, next: onFile.next, alreadyRecorded: true });
      }
      const claimed = gate.claim === "claimed";
      if (session && claimed) heldClaim = { admin: record, sessionId: session.id };

      // The text graded: what was stored when typing stopped ("complete"),
      // else what this request carries (a page on the previous build).
      const runKey = typingRunKey(startRow.started_at);
      const runSnapshot = session && runKey ? await findEvent(record, session.id, runKey) : null;
      const chosenText = chooseTypedText(runSnapshot?.detail ?? null, payload.typedText);
      const typedText = chosenText.text;

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
        if (session && claimed) await releaseGrading(record, session.id, gate.fromStatus ?? "active");
        return jsonResponse({ error: "implausible_typing_speed" }, 400);
      }

      const results = calculateTypingResults(typedText, startRow.target_text as string, elapsedMs, requiredWpm);
      // The violations kept in notes: the integrity events the page recorded
      // when there are any, else the request's own list.
      const integrity = chooseIntegrity(session ? await loadIntegrityEvents(record, session.id) : null, requestViolations);
      const violations = integrity.violations;
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
        // TypingTestPhase.tsx never advanced `phase`/`status` itself, in
        // either mode — it resent them unchanged and left the whole
        // advance/reject decision to a follow-up trigger-ava-analysis
        // call. See StepAdvanceMode's doc comment on RecordStepResultInput.
        advance: "never",
        resultKey: "typingTestResult",
        result: resultForKey,
        legacyStepEntry,
      });

      if (!outcome.ok) {
        if (session && claimed) {
          if (outcome.code === "write_failed") await failSession(record, session.id, outcome.error);
          else await releaseGrading(record, session.id, gate.fromStatus ?? "active");
        }
        return jsonResponse({ error: outcome.error }, outcome.code === "step_not_reached" ? 409 : 400);
      }

      // The end must not depend on the tab: in an auto-mode job the server
      // asks for the next step itself, in the background, with this
      // request's own JWT (_shared/stepMoveOn.ts). The page's own ask, if it
      // is still open, gets the same idempotent answer. Never blocks this
      // response.
      scheduleStepMoveOn(record, { applicationId, stepId, authorization: authHeader, processingMode: job.processing_mode });

      if (session) {
        // The submitted text against the passage, and the full grading.
        const run = typingRunFor(session.context, startRow.started_at);
        const endedBy = runSnapshot?.detail.ended_by;
        const finalSaved = await insertEvent(record, {
          sessionId: session.id,
          kind: "typing_snapshot",
          clientMsgId: "final",
          detail: typingSnapshotDetail({
            typedText,
            targetText: startRow.target_text as string,
            wpm: results.wpm,
            accuracy: results.accuracy,
            elapsedMs,
            final: true,
            run,
            endedBy: typeof endedBy === "string" ? endedBy : null,
            textSource: chosenText.source,
          }),
        });
        if (finalSaved.error) console.error("[submit-typing-test] final snapshot not stored:", finalSaved.error);
        await finishGrading(
          record,
          session.id,
          gate,
          gradingRecord({
            model: null,
            promptVersion: "typing-formula-1",
            fallback: false,
            result: {
              wpm: results.wpm,
              accuracy: results.accuracy,
              score: results.score,
              requiredWpm,
              passed: results.passed,
              formula: TYPING_FORMULA,
              word_errors: typingWordErrors(typedText, startRow.target_text as string),
              attempts_before_submit: typingAttempts(session.context),
            },
            extra: {
              elapsed_ms: elapsedMs,
              text_source: chosenText.source,
              run,
              integrity_source: integrity.source,
            },
          }),
          typingEndReason(endedBy, elapsedMs),
        );
      }

      // Best-effort — matches the informational sentence the removed
      // client write used to put in phase_ai_analysis (cockpit's mapper
      // falls back to it only until trigger-ava-analysis's own analysis
      // lands moments later). Never fails the request.
      const speedPercent = Math.round((results.wpm / requiredWpm) * 100);
      const phaseAiAnalysis =
        `Typing test: ${results.wpm} WPM (${speedPercent}% of ${requiredWpm} WPM target), ` +
        `Accuracy: ${results.accuracy}%, Combined Score: ${results.score}%. ` +
        // results.passed is always false (calculateResults.ts: Ava decides), so the
        // old "Local calculation: FAILED" told the owner that every typist failed.
        `${results.wpm >= requiredWpm ? "Meets" : "Below"} the speed target. Ava weighs it with the rest of the application.`;
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
    if (heldClaim) await failSession(heldClaim.admin, heldClaim.sessionId, error instanceof Error ? error.message : String(error));
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
