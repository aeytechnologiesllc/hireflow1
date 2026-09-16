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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOpenAIJson, requireJsonKeys, type OpenAIMessage } from "../_shared/openai.ts";
import { guardAuthenticatedAiCall } from "../_shared/rateLimit.ts";
import { recordStepResult, type MinimalSupabaseAdmin } from "../_shared/trustedResults.ts";
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

    const evaluation = await gradeTranscript({
      scenario,
      prospectName,
      prospectCompany,
      productService,
      jobTitle,
      candidateName,
      messages,
    });

    // Matches SalesSimulationPhase.tsx's own former `updatedNotes.salesSimulationResult`
    // shape exactly — see grading.ts's own doc comment / docs/TRUSTED-RESULTS.md's
    // result_key table.
    const salesSimulationResult = buildSalesSimulationResult({
      scenario,
      prospectCompany,
      messageCount: messages.length,
      evaluation,
      violations,
    });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

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
      resultKey: "salesSimulationResult",
      // SalesSimulationResult is a precise, documented shape (see grading.ts);
      // RecordStepResultInput only wants Record<string, unknown> because it's
      // deliberately generic across every phase's own result shape.
      result: salesSimulationResult as unknown as Record<string, unknown>,
    });

    if (!outcome.ok) {
      return jsonResponse({ error: outcome.error }, outcome.code === "step_not_reached" ? 409 : 400);
    }

    // phase_ai_analysis isn't part of recordStepResult's write (it only
    // owns notes/phase/status) and isn't guarded by
    // protect_application_columns at all — best-effort, service-role, same
    // text SalesSimulationPhase.tsx's own update used to send alongside
    // notes. Not fatal: trigger-ava-analysis (still called by the page right
    // after this) overwrites this field moments later in the normal auto-
    // mode flow anyway.
    const { error: analysisError } = await admin
      .from("applications")
      .update({ phase_ai_analysis: buildPhaseAiAnalysis(evaluation) })
      .eq("id", applicationId);
    if (analysisError) {
      console.error("[submit-sales-simulation] Failed to write phase_ai_analysis (non-fatal):", analysisError);
    }

    return jsonResponse({ success: true, evaluation, next: outcome.next });
  } catch (error) {
    console.error("[submit-sales-simulation] Unexpected error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
