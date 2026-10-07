// submit-sales-simulation — the trusted write path for the sales simulation
// phase (part B of the candidate-trust fix; see docs/TRUSTED-RESULTS.md).
//
// Before this function existed, SalesSimulationPhase.tsx called
// ai-sales-simulation's unauthenticated "evaluate" mode directly, trusted
// whatever JSON it got back completely, and then wrote
// applications.notes/phase_ai_analysis itself with a plain candidate-session
// `supabase.from("applications").update(...)` call — a candidate could
// intercept or skip that call and write any score/wouldBuy they liked.
//
// This function does the SAME grading call (the exact prompt
// ai-sales-simulation's own "evaluate" mode used, down to the JSON keys and
// fallback shapes — see buildEvaluationPrompt / FETCH_FALLBACK_EVALUATION /
// PARSE_FALLBACK_EVALUATION below) but now:
//   1. requires a real, verified candidate session (verify_jwt = true in
//      config.toml, plus its own resolveCallerId check below — there is no
//      anonymous case here, unlike ai-sales-simulation's start/respond
//      streaming modes, which stay public on purpose);
//   2. runs the grading itself, service-role, instead of trusting a client-
//      supplied score;
//   3. calls recordStepResult (../_shared/trustedResults.ts) to write the
//      result, which independently re-verifies the caller really is this
//      application's own candidate AND that they've actually reached this
//      step, before writing anything.
//
// SalesSimulationPhase.tsx no longer touches applications.notes/phase at
// all for this step — see its handleSubmit.
//
// The assessment record (2026-10-06, docs/ASSESSMENT-RECORD.md §5.1), best
// effort, never blocking the step: the conversation itself streams through
// ai-sales-simulation, which does not record turns, so the transcript graded
// here is the request's unless the attempt's record already holds the
// candidate's own turns. The request's transcript is stored on the attempt
// so the hiring team has it, the full evaluation goes to session.grading
// (staff only), and the notes' violation counts come from the integrity
// events the page recorded when there are any. Once the result is recorded,
// an auto-mode job's move to the next step is asked for by the server too
// (_shared/stepMoveOn.ts), so a tab closed during grading still moves on.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { callOpenAIJson, requireJsonKeys, type OpenAIMessage } from "../_shared/openai.ts";
import { guardAuthenticatedAiCall } from "../_shared/rateLimit.ts";
import { recordStepResult, type MinimalSupabaseAdmin } from "../_shared/trustedResults.ts";
import {
  chatSimulationEndReason,
  chooseIntegrity,
  chooseTranscript,
  computerOnlyGate,
  recordStartDevice,
  failSession,
  finishGrading,
  gateGrading,
  gradingRecord,
  loadIntegrityEvents,
  loadTurns,
  readStepOnFile,
  releaseGrading,
  resolveSession,
  storeSubmittedTranscript,
  unstoredTail,
  type AssessmentAdmin,
} from "../_shared/assessmentSession.ts";
import { scheduleStepMoveOn } from "../_shared/stepMoveOn.ts";
import { computerRequiredBody, deviceKindOfRequest, needsComputer } from "../_shared/deviceKind.ts";
import {
  buildApiMessages,
  buildEvaluationPrompt,
  buildPhaseAiAnalysis,
  buildSalesSimulationResult,
  fetchFallbackEvaluation,
  parseFallbackEvaluation,
  type AntiCheatViolation,
  type EvalChatMessage,
  type SalesEvaluation,
} from "./grading.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_SALES_SIMULATION_EVAL_MODEL = Deno.env.get("OPENAI_SALES_SIMULATION_EVAL_MODEL") || "gpt-5.6-luna";
/** Named in session.grading.prompt_version; bump when the evaluation prompt changes. */
const EVAL_PROMPT_VERSION = "sales-sim-eval-1";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface SubmitRequest {
  applicationId?: string;
  stepId?: string;
  scenario?: string;
  prospectName?: string;
  prospectCompany?: string;
  productService?: string;
  jobTitle?: string;
  candidateName?: string;
  // Pre-mapped the same way ai-sales-simulation's old "evaluate" mode always
  // received them from the browser (salesRep -> "user", prospect ->
  // "assistant") — kept in that shape so the prompt/role-flip below matches
  // exactly, not reinterpreted.
  messages?: EvalChatMessage[];
  violations?: AntiCheatViolation[];
}

/** The caller's user id from a real session JWT. Never trust a body-supplied
 *  candidate id — same pattern as document-signing/index.ts's own
 *  resolveCallerId. A missing/invalid token is a hard 401; there is no
 *  public case for this endpoint. */
async function resolveCallerId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  if (!authHeader || !anonKey || !url) return null;
  try {
    const supabaseUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabaseUser.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

async function gradeTranscript(params: {
  scenario: string;
  prospectName: string;
  prospectCompany: string;
  productService: string;
  jobTitle: string;
  candidateName: string;
  messages: EvalChatMessage[];
}): Promise<SalesEvaluation> {
  if (!OPENAI_API_KEY) {
    console.error("[submit-sales-simulation] OPENAI_API_KEY is not configured — using fetch-failure fallback evaluation");
    return fetchFallbackEvaluation();
  }

  try {
    const systemPrompt = buildEvaluationPrompt(params);
    const userContent =
      "As the prospect who just experienced this sales interaction, evaluate the sales rep's performance. Would you buy from them? Why or why not?";
    const apiMessages: OpenAIMessage[] = buildApiMessages(systemPrompt, params.messages, userContent);

    const { data } = await callOpenAIJson<SalesEvaluation>({
      apiKey: OPENAI_API_KEY,
      model: OPENAI_SALES_SIMULATION_EVAL_MODEL,
      messages: apiMessages,
      temperature: 0.35,
      maxCompletionTokens: 1300,
      validator: (value) =>
        requireJsonKeys(value, [
          "score",
          "discovery",
          "objectionHandling",
          "valueProposition",
          "closingSkills",
          "rapport",
          "strengths",
          "improvements",
          "wouldBuy",
          "overallFeedback",
        ]),
      fallback: parseFallbackEvaluation,
    });

    return data;
  } catch (error) {
    console.error("[submit-sales-simulation] Grading call failed — using fetch-failure fallback evaluation:", error);
    return fetchFallbackEvaluation();
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // An attempt this request claimed for grading: if anything below throws,
  // it is marked failed (the result is still owed), not left "grading".
  let heldClaim: { admin: AssessmentAdmin; sessionId: string } | null = null;

  try {
    const callerId = await resolveCallerId(req);
    if (!callerId) {
      return jsonResponse({ error: "Sign in to continue." }, 401);
    }

    const limited = await guardAuthenticatedAiCall("submit-sales-simulation", callerId, corsHeaders);
    if (limited) return limited;

    let body: SubmitRequest;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid request body." }, 400);
    }

    const {
      applicationId,
      stepId,
      scenario,
      prospectName,
      prospectCompany,
      productService,
      jobTitle = "",
      candidateName = "the sales representative",
      messages,
      violations = [],
    } = body;

    if (!applicationId || !stepId) {
      return jsonResponse({ error: "applicationId and stepId are required." }, 400);
    }
    if (!scenario || !prospectName || !prospectCompany || !productService) {
      return jsonResponse({ error: "scenario, prospectName, prospectCompany and productService are required." }, 400);
    }
    if (!Array.isArray(messages)) {
      return jsonResponse({ error: "messages must be an array." }, 400);
    }
    if (!Array.isArray(violations)) {
      return jsonResponse({ error: "violations must be an array." }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const record = admin as unknown as AssessmentAdmin;

    // The sales practice is taken on a computer (docs/COMPUTER-ONLY-TESTS.md),
    // from the request's headers AND the page's own reading in its body. A
    // phone or tablet is refused BEFORE anything is opened or spent: an
    // attempt the page's mount opened records no start device, so only a
    // retried submit of one a computer sent (it records the device below), a
    // finished step (the result on file is answered back) or a step the rule
    // does not put on a computer goes on.
    const requestDevice = deviceKindOfRequest(req, body);
    if (needsComputer(requestDevice)) {
      const gate = await computerOnlyGate(record, requestDevice, { applicationId, stepId, userId: callerId, purpose: "submit" });
      if (gate === "refuse") return jsonResponse(computerRequiredBody(requestDevice), 400);
    }

    // The attempt's record, best effort: with none (the migration not
    // applied, a finished or closed step) this grades the request's
    // transcript exactly as before.
    const resolved = await resolveSession(record, {
      applicationId,
      stepId,
      userId: callerId,
      stepType: "sales_simulation",
      purpose: "submit",
    });
    const session = resolved.ok ? resolved.session : null;
    if (!resolved.ok) console.log("[submit-sales-simulation] submit without a record:", resolved.reason, resolved.detail ?? "");
    // The practice leaves no record until this submit, so this is where the
    // device it was taken on is recorded (once; a retry never overwrites it).
    if (session) await recordStartDevice(record, session, requestDevice);

    // ONE request grades an attempt, and a result already on file is never
    // graded again from a request body (a retried or replayed submit gets
    // "already recorded" back). Decided before anything is spent.
    const gate = await gateGrading(record, session, resolved.ok ? null : resolved.reason);
    if (!gate.go) {
      if (gate.why === "checking") {
        return jsonResponse({ error: "This sales practice is already being checked.", code: "already_checking" }, 409);
      }
      const onFile = await readStepOnFile(record, applicationId, stepId, "salesSimulationResult");
      if (!onFile?.result) return jsonResponse({ error: "This step is already recorded.", code: "already_recorded" }, 409);
      return jsonResponse({ success: true, next: onFile.next, alreadyRecorded: true });
    }
    const claimed = gate.claim === "claimed";
    if (session && claimed) heldClaim = { admin: record, sessionId: session.id };

    const storedTurns = session ? await loadTurns(record, session.id) : null;
    const transcript = chooseTranscript(storedTurns, messages);
    const gradedMessages: EvalChatMessage[] = transcript.source === "stored" ? transcript.messages : messages;
    const tail = session && storedTurns ? unstoredTail(storedTurns, messages) : null;
    if (session && tail && tail.messages.length > 0) {
      await storeSubmittedTranscript(record, session.id, tail, { candidate: "agent", assistant: "customer" });
    }

    let evaluation: SalesEvaluation;
    try {
      evaluation = await gradeTranscript({
        scenario,
        prospectName,
        prospectCompany,
        productService,
        jobTitle,
        candidateName,
        messages: gradedMessages,
      });
    } catch (error) {
      if (session && claimed) await failSession(record, session.id, error instanceof Error ? error.message : String(error));
      throw error;
    }

    // gradeTranscript answers with one of its two fixed fallbacks when the
    // model could not be reached or read; the staff record says so.
    const evaluationJson = JSON.stringify(evaluation);
    const usedFallback = evaluationJson === JSON.stringify(parseFallbackEvaluation()) ||
      evaluationJson === JSON.stringify(fetchFallbackEvaluation());

    // The notes' violation counts: the integrity events the page recorded
    // when there are any, else the request's own list.
    const integrity = chooseIntegrity(session ? await loadIntegrityEvents(record, session.id) : null, violations);

    // Matches SalesSimulationPhase.tsx's own former `updatedNotes.salesSimulationResult`
    // shape exactly — see grading.ts's own doc comment / docs/TRUSTED-RESULTS.md's
    // result_key table.
    const salesSimulationResult = buildSalesSimulationResult({
      scenario,
      prospectCompany,
      messageCount: gradedMessages.length,
      evaluation,
      violations: integrity.violations as AntiCheatViolation[],
      // A fallback is not a grade (2026-10-06): stored as graded:false with
      // no score, never as the fallback's 70.
      graded: !usedFallback,
    });

    // The real supabase-js client's query builder is a thenable, not a
    // structural Promise (missing catch/finally in TS's eyes), which trips
    // recordStepResult's own MinimalSupabaseAdmin type — and comparing the
    // full client type against it is what TS2589s. Both are awaitable at
    // runtime; this cast just skips the structural check rather than
    // reshaping trustedResults.ts's own (shared, do-not-edit) interface.
    const outcome = await recordStepResult(admin as unknown as MinimalSupabaseAdmin, {
      applicationId,
      callerUserId: callerId,
      stepId,
      stepType: "sales_simulation",
      // SalesSimulationPhase.tsx's own `.update()` never wrote `phase`/
      // `status` at all, in either mode — the whole advance/reject
      // decision was left to a follow-up trigger-ava-analysis call. See
      // StepAdvanceMode's doc comment on RecordStepResultInput.
      advance: "never",
      resultKey: "salesSimulationResult",
      // SalesSimulationResult is a precise, documented shape (see grading.ts);
      // RecordStepResultInput only wants Record<string, unknown> because it's
      // deliberately generic across every phase's own result shape.
      result: salesSimulationResult as unknown as Record<string, unknown>,
    });

    if (!outcome.ok) {
      if (session && claimed) {
        if (outcome.code === "write_failed") await failSession(record, session.id, outcome.error);
        else await releaseGrading(record, session.id, gate.fromStatus ?? "active");
      }
      return jsonResponse({ error: outcome.error }, outcome.code === "step_not_reached" ? 409 : 400);
    }

    // The end must not depend on the tab: in an auto-mode job the server asks
    // for the next step itself, in the background, with this request's own
    // JWT (_shared/stepMoveOn.ts). The page's own ask, if it is still open,
    // gets the same idempotent answer. Never blocks this response.
    scheduleStepMoveOn(record, { applicationId, stepId, authorization: req.headers.get("Authorization") });

    if (session) {
      await finishGrading(
        record,
        session.id,
        gate,
        gradingRecord({
          model: usedFallback ? null : OPENAI_SALES_SIMULATION_EVAL_MODEL,
          promptVersion: EVAL_PROMPT_VERSION,
          fallback: usedFallback,
          result: evaluation,
          extra: {
            scenario: { scenario, prospect_name: prospectName, prospect_company: prospectCompany, product_service: productService },
            transcript_source: transcript.source,
            messages_graded: gradedMessages.length,
            integrity_source: integrity.source,
          },
        }),
        chatSimulationEndReason(storedTurns),
      );
    }

    // phase_ai_analysis isn't part of recordStepResult's write (it only
    // owns notes/phase/status) and isn't guarded by
    // protect_application_columns at all — best-effort, service-role, same
    // text SalesSimulationPhase.tsx's own update used to send alongside
    // notes. Not fatal: trigger-ava-analysis (called by the page right after
    // this, and by the server's own move-on above) overwrites this field
    // moments later in the normal auto-mode flow anyway.
    const { error: analysisError } = await admin
      .from("applications")
      .update({ phase_ai_analysis: buildPhaseAiAnalysis(evaluation, !usedFallback) })
      .eq("id", applicationId);
    if (analysisError) {
      console.error("[submit-sales-simulation] Failed to write phase_ai_analysis (non-fatal):", analysisError);
    }

    // The full evaluation stays on the server (session.grading for staff): no
    // page reads it, and the notes already hold what the candidate may see.
    return jsonResponse({
      success: true,
      next: outcome.next,
      ...(session ? { assessment: { recorded: true, session_id: session.id } } : {}),
    });
  } catch (error) {
    console.error("[submit-sales-simulation] Unexpected error:", error);
    if (heldClaim) await failSession(heldClaim.admin, heldClaim.sessionId, error instanceof Error ? error.message : String(error));
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
