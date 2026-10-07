import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { aiUnavailableResponse, callOpenAIJson, isAiUnavailable, requireJsonKeys } from "../_shared/openai.ts";
import { streamOpenAIChatCompletion } from "../_shared/openaiStreaming.ts";
import { guardPublicAiCall } from "../_shared/rateLimit.ts";
import { recordStepResult, type MinimalSupabaseAdmin } from "../_shared/trustedResults.ts";
import {
  afterReplyAskFailed,
  askForOpener,
  awaitInFlightReply,
  candidateTurnStatus,
  chatSimulationEndReason,
  computerOnlyGate,
  recordStartDevice,
  chooseIntegrity,
  chooseTranscript,
  cleanClientAt,
  cleanClientMsgId,
  failSession,
  finishGrading,
  gateGrading,
  gradingRecord,
  holdCandidateTurn,
  loadIntegrityEvents,
  loadTurns,
  markReplyAsked,
  OPENER_ID,
  readStepOnFile,
  recordCandidateTurn,
  recordingTargetFrom,
  refuseGradingForOutage,
  releaseGrading,
  replayTextFor,
  replyMsgId,
  resolveSession,
  resumePayload,
  serverMsgId,
  settleTrailingReply,
  sseReplayText,
  storeHeldCandidateTurn,
  teeAndRecordReply,
  turnsToTranscript,
  updateContext,
  withLeadingSse,
  type AssessmentAdmin,
  type HeldCandidateTurn,
  type SessionRow,
  type StoredTurn,
} from "../_shared/assessmentSession.ts";
import { scheduleStepMoveOn } from "../_shared/stepMoveOn.ts";
import { computerRequiredBody, deviceKindOfRequest, needsComputer } from "../_shared/deviceKind.ts";
import {
  buildChatSimulationResult,
  buildPhaseAiAnalysis,
  buildSimulationApiMessages,
  leadEvaluationFrom,
  phaseAiAnalysisFromStoredResult,
  supportEvaluationFrom,
  reviewLines,
  ungradedEvaluation,
  type AntiCheatViolation,
  type SimulationChatMessage,
} from "./grading.ts";
import {
  DEFAULT_TYPING_BAR,
  applicantWordCount,
  buildTypingResult,
  cleanReplyTyping,
  replyTypingRows,
  typosPer100Words,
  verifiedSpellingMistakes,
  type ChatTypingResult,
  type SpellingMistake,
} from "./typing.ts";
import {
  EVAL_PROMPT_VERSION,
  buildEvaluatorMessages,
  customerPromptFor,
  customerTurnInstruction,
  evaluatorRequiredKeys,
  knownPinnedCase,
  practiceStepFrom,
  rubricForCase,
  scenarioToPin,
  type PracticeStepConfig,
} from "./prompts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_CHAT_SIMULATION_MODEL = Deno.env.get("OPENAI_CHAT_SIMULATION_MODEL") || "gpt-5.6-luna";
const OPENAI_CHAT_SIMULATION_EVAL_MODEL = Deno.env.get("OPENAI_CHAT_SIMULATION_EVAL_MODEL") || "gpt-5.6-luna";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatSimulationRequest {
  mode: "start" | "respond" | "evaluate";
  scenario: string;
  customerName: string;
  jobTitle?: string;
  messages?: ChatMessage[];
  agentMessage?: string;
  messageCount?: number;
  // Required for mode "evaluate" — this is what lets the server own the
  // write: recordStepResult verifies the caller really is this application's
  // candidate and has actually reached this step before it ever touches
  // `applications`. See docs/TRUSTED-RESULTS.md.
  //
  // Since 2026-10-06 also on "start"/"respond" from a page that records the
  // test (docs/ASSESSMENT-RECORD.md §5.1): with the candidate's own session
  // JWT plus these two ids, every message is stored as it is sent and the
  // conversation is rebuilt from the stored turns. A page on the previous
  // build sends neither on a turn and is served exactly as before.
  applicationId?: string;
  stepId?: string;
  violations?: AntiCheatViolation[];
  /** "respond": the page's own id for the agent's message (idempotency key). */
  clientMsgId?: string;
  /** "respond": when the page sent it. */
  clientAt?: string;
  /** "start": the page's id for the case it shows. Echoed back only: the
   *  case is always the server's own pick (prompts.ts scenarioToPin), and
   *  the request's scenario, customerName and scenarioId never reach the
   *  reviewer. */
  scenarioId?: string;
  /** "respond": the page's keystroke summary for this one reply
   *  (src/lib/typingMeter.ts: charsTyped, activeMs, corrections, keys,
   *  pasteLike). Cleaned (typing.ts cleanReplyTyping) and stored on the
   *  candidate_turn as detail.typing; the speed, the medians and the reply
   *  times are worked out at grading, never taken from the page. */
  typing?: unknown;
}

/** The caller's user id, resolved from their own session JWT — never trust a
 *  body-supplied id. Mirrors document-signing/index.ts's resolveCallerId. */
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

/** The service-role client the assessment record is written with. */
function recordClient(): AssessmentAdmin | null {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey) as unknown as AssessmentAdmin;
}

/** The scenario pinned on the attempt the first time it started. `byServer`:
 *  this build pinned it (always its own pick); an older build pinned the
 *  request's id or text, which counts only while it is one of the step's own
 *  cases (prompts.ts knownPinnedCase). */
function pinnedScenario(
  context: Record<string, unknown>,
): { scenario: string; customerName: string; scenarioId: string | null; byServer: boolean } | null {
  if (typeof context.scenario !== "string" || !context.scenario.trim()) return null;
  if (typeof context.customer_name !== "string" || !context.customer_name.trim()) return null;
  return {
    scenario: context.scenario,
    customerName: context.customer_name,
    scenarioId: typeof context.scenario_id === "string" ? context.scenario_id : null,
    byServer: context.scenario_pinned_by === "server",
  };
}

/** The job and this step's own config, read with the service role for the
 *  signed-in candidate's own application — never from the request. Null
 *  when it cannot be read (the caller then falls back as before). */
interface PracticeJob {
  title: string | null;
  description: string | null;
  experienceLevel: string | null;
  step: PracticeStepConfig | null;
}

async function loadPracticeJob(
  admin: AssessmentAdmin,
  applicationId: string,
  stepId: string,
  userId: string,
): Promise<PracticeJob | null> {
  try {
    const { data, error } = await admin
      .from("applications")
      .select("candidate_id, jobs(title, description, experience_level, workflow_steps)")
      .eq("id", applicationId)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("[ai-chat-simulation] job not read:", error.message ?? error);
      return null;
    }
    const row = data as { candidate_id?: unknown; jobs?: unknown };
    if (row.candidate_id !== userId) return null;
    const job = (Array.isArray(row.jobs) ? row.jobs[0] : row.jobs) as Record<string, unknown> | null | undefined;
    if (!job || typeof job !== "object") return null;
    const text = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
    return {
      title: text(job.title),
      description: text(job.description),
      experienceLevel: text(job.experience_level),
      step: practiceStepFrom(job.workflow_steps, stepId),
    };
  } catch (error) {
    console.error("[ai-chat-simulation] job not read:", error);
    return null;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Public endpoint that spends money per call — cap how fast one caller can spend it.
  const limited = await guardPublicAiCall(req, "ai-chat-simulation", corsHeaders, 60, 3600);
  if (limited) return limited;

  try {
    const request: ChatSimulationRequest = await req.json();
    const { mode, scenario, customerName, messages = [], agentMessage, messageCount = 0, applicationId, stepId, violations = [] } = request;

    console.log("Chat simulation request:", { mode, scenario, customerName, messageCount });

    if (mode !== "start" && mode !== "respond" && mode !== "evaluate") {
      return json({ error: "Unknown mode", code: "unknown_mode" }, 400);
    }

    // The chat practice is taken on a computer (docs/COMPUTER-ONLY-TESTS.md).
    // Read once from this request's own headers AND the page's own reading
    // in its body (a phone asking for the desktop site sends a computer's
    // headers); each path below refuses a phone or tablet BEFORE anything is
    // opened.
    const requestDevice = deviceKindOfRequest(req, request);

    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For evaluation mode: the server grades the transcript itself (never a
    // client-supplied score/evaluation) and then owns the write via
    // recordStepResult — the browser no longer touches `applications` for
    // this step at all. See docs/TRUSTED-RESULTS.md.
    if (mode === "evaluate") {
      if (!applicationId || !stepId) {
        return new Response(
          JSON.stringify({ error: "applicationId and stepId are required to record a chat simulation result" }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const callerUserId = await resolveCallerId(req);
      if (!callerUserId) {
        return new Response(
          JSON.stringify({ error: "Sign in to submit this step." }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceKey) {
        console.error("Supabase service credentials are not configured");
        return new Response(
          JSON.stringify({ error: "Service not configured" }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const admin = createClient(supabaseUrl, serviceKey);
      const record = admin as unknown as AssessmentAdmin;

      // A phone or tablet may finish an attempt a COMPUTER started (its
      // recorded start device), never grade one it opened or the page's
      // mount opened (docs/COMPUTER-ONLY-TESTS.md). A finished step goes on
      // to answer the result on file.
      if (needsComputer(requestDevice)) {
        const gate = await computerOnlyGate(record, requestDevice, { applicationId, stepId, userId: callerUserId, purpose: "submit" });
        if (gate === "refuse") return json(computerRequiredBody(requestDevice), 400);
      }

      // The record of this attempt (docs/ASSESSMENT-RECORD.md §5.1). With the
      // record system deployed, the chat graded is the one STORED as it
      // happened, never a transcript in the request (see below). Only where
      // the record system is not deployed at all is the request's transcript
      // graded, and the result then says so (transcriptSource "browser").
      const resolved = await resolveSession(record, {
        applicationId,
        stepId,
        userId: callerUserId,
        stepType: "chat_simulation",
        purpose: "submit",
      });
      const session: SessionRow | null = resolved.ok ? resolved.session : null;
      if (!resolved.ok) console.log("[ai-chat-simulation] evaluate without a record:", resolved.reason, resolved.detail ?? "");
      const recordDeployed = resolved.ok || resolved.reason !== "not_deployed";

      // ONE request grades an attempt, and a result already on file is never
      // graded again from a request body (a retried or replayed evaluate gets
      // the recorded result back). Decided before anything is spent.
      const gate = await gateGrading(record, session, resolved.ok ? null : resolved.reason);
      if (!gate.go) {
        if (gate.why === "checking") {
          return json({ error: "This chat practice is already being checked.", code: "already_checking" }, 409);
        }
        const onFile = await readStepOnFile(record, applicationId, stepId, "chatSimulationResult");
        if (!onFile?.result) return json({ error: "This step is already recorded.", code: "already_recorded" }, 409);
        return json({
          chatSimulationResult: onFile.result,
          // Rebuilt from the stored result: never the phase_ai_analysis
          // column, which the hiring team's own analysis overwrites.
          phaseAiAnalysis: phaseAiAnalysisFromStoredResult(onFile.result),
          next: onFile.next,
          alreadyRecorded: true,
        });
      }
      const claimed = gate.claim === "claimed";
      /** Lets go of the claim when this request refuses before grading. */
      const letGo = async () => {
        if (session && claimed) await releaseGrading(record, session.id, gate.fromStatus ?? "active");
      };

      const storedTurns = session ? await settleTrailingReply(record, session.id, await loadTurns(record, session.id)) : null;
      // Graded: the STORED turns whenever the record has the applicant's own
      // messages (each was stored before the player answered it).
      const transcript = chooseTranscript(storedTurns, messages);
      if (transcript.source === "request" && recordDeployed) {
        // The record system is live but holds none of this applicant's
        // messages: the chat was never served through it (a page that left
        // out its application and step on every turn) or every turn failed
        // to save. A transcript in the request is the applicant's own
        // writing on BOTH sides, so it is never graded: an applicant could
        // otherwise invent the player's lines, and the hiring team would read
        // them as the test's. The page starts the chat again, recorded.
        await letGo();
        if (!session && resolved.ok === false && resolved.reason === "error") {
          return json({ error: "We could not read your saved chat just now. Please try again in a moment.", code: "record_unreadable", retryable: true }, 503);
        }
        console.warn("[ai-chat-simulation] evaluate refused: nothing the applicant wrote is on the record", {
          reason: resolved.ok ? "no_stored_turns" : resolved.reason,
          requestTurns: transcript.requestTurns,
        });
        return json({
          error: "This chat wasn't saved as you wrote it, so it can't be sent. Please start the chat again.",
          code: "chat_not_recorded",
        }, 409);
      }
      const gradedMessages: SimulationChatMessage[] = transcript.source === "stored" ? transcript.messages : messages;
      if (transcript.source === "stored" && transcript.requestTurns !== transcript.storedTurns) {
        console.warn("[ai-chat-simulation] grading the stored transcript; the request's differs", {
          stored: transcript.storedTurns,
          request: transcript.requestTurns,
        });
      }
      // Nothing the applicant wrote: nothing to grade (never a real 0).
      if (!gradedMessages.some((m) => m.role === "user" && typeof m.content === "string" && m.content.trim().length > 0)) {
        await letGo();
        return json({ error: "Reply to the player at least once before you send the chat.", code: "no_answers" }, 400);
      }

      // The job, and this step's own config (its focus, its title, its
      // cases), read here for the caller's own application: never from the
      // request. The case graded is the one the attempt is pinned to when the
      // server can vouch for it (one of the step's own cases), else the
      // server's own pick for this application and step (the page's stable
      // index): never the request's scenario, customer name or scenario id,
      // and none of the request's text reaches the reviewer's instructions.
      const practiceJob = await loadPracticeJob(record, applicationId, stepId, callerUserId);
      if (!practiceJob) {
        await letGo();
        return json({ error: "We could not load this step just now. Please try again in a moment.", code: "job_unreadable", retryable: true }, 503);
      }
      const pinned = session ? pinnedScenario(session.context) : null;
      // A case this build pinned is graded as played, even if the employer
      // has since edited the step's cases; an older pin only while it is one
      // of the step's own cases.
      const graded =
        knownPinnedCase(practiceJob.step, pinned) ??
        (pinned?.byServer ? { id: pinned.scenarioId ?? "", customerName: pinned.customerName, scenario: pinned.scenario } : null) ??
        scenarioToPin(practiceJob.step, { applicationId, stepId });
      const gradedScenario = graded.scenario;
      const gradedCustomerName = graded.customerName;
      const gradedScenarioId = graded.id || null;
      // The rubric follows the case that was played: a takeover case is
      // marked as a team leader taking over a mishandled chat, any other case
      // as a support agent (whatever the job's level says).
      const rubric = rubricForCase(gradedScenario);
      const focus = practiceJob.step?.focus ?? [];

      try {
        // Graded here, server-side, every time, by a REVIEWER (prompts.ts
        // evaluatorPromptFor), not the player persona: the whole chat goes as
        // one message of numbered, labelled lines ("LEAD 3:", "PLAYER 4:", or
        // AGENT/CUSTOMER), and the server checks every flag the reviewer
        // raises against those lines itself (grading.ts). When the
        // model fails or its answer cannot be read, the chat is recorded as
        // NOT graded (no score, transcript kept for re-grading) so the
        // candidate still moves on and nobody reads a made-up 70 as real.
        // When the AI SERVICE refuses (out of credit, rate limited, down:
        // throwWhenUnavailable), nothing is recorded at all: the catch below
        // lets go of the claim and the chat stays open to be sent again.
        let usedFallback = false;
        const { data: reviewed } = await callOpenAIJson({
          apiKey: OPENAI_API_KEY,
          model: OPENAI_CHAT_SIMULATION_EVAL_MODEL,
          messages: buildEvaluatorMessages(
            {
              rubric,
              scenario: gradedScenario,
              customerName: gradedCustomerName,
              jobTitle: practiceJob.title ?? "",
              focus,
              stepTitle: practiceJob.step?.title ?? null,
            },
            gradedMessages,
          ),
          temperature: 0.2,
          // A little more room than before for the spelling list (eval-4).
          maxCompletionTokens: 2800,
          validator: (value) => requireJsonKeys(value, evaluatorRequiredKeys(rubric)),
          // No made-up mark: null means "not graded" below.
          fallback: (): Record<string, unknown> | null => {
            usedFallback = true;
            return null;
          },
          throwWhenUnavailable: true,
        });
        const marked = usedFallback
          ? null
          : rubric === "team_lead"
            ? leadEvaluationFrom(reviewed, gradedMessages, { caseText: gradedScenario })
            : supportEvaluationFrom(reviewed);
        const graded = marked !== null;
        const evaluation = marked ?? ungradedEvaluation(usedFallback ? "model_failed" : "answer_unreadable");
        if (!graded) console.warn("[ai-chat-simulation] chat recorded as not graded:", usedFallback ? "model_failed" : "answer_unreadable");

        // Typing, measured inside the chat (docs/TYPING-IN-CHAT.md): speed
        // and corrections from each STORED reply's own keystroke summary
        // (detail.typing), reply time from the server's own timestamps, typos
        // from the reviewer's list, kept only where the word is in the
        // applicant's own numbered line. Only from the record: a transcript
        // the page sent carries no server times, so it gets no typing block.
        let spellingMistakes: SpellingMistake[] | null = null;
        let typing: ChatTypingResult | null = null;
        if (transcript.source === "stored" && storedTurns) {
          spellingMistakes = graded ? verifiedSpellingMistakes(reviewed, reviewLines(gradedMessages)) : null;
          typing = buildTypingResult({
            turns: storedTurns,
            bar: practiceJob.step?.typingBar ?? { ...DEFAULT_TYPING_BAR },
            typosPer100Words: typosPer100Words(spellingMistakes ? spellingMistakes.length : null, applicantWordCount(gradedMessages)),
          });
        }

        // The integrity summary in notes comes from the events the page
        // recorded (record_integrity_events) whenever there are any, else
        // from the request's own list (a page on the previous build).
        const integrity = chooseIntegrity(session ? await loadIntegrityEvents(record, session.id) : null, violations);

        // Exact chatSimulationResult shape ChatSimulationPhase.tsx has always
        // written at notes.chatSimulationResult (docs/TRUSTED-RESULTS.md's
        // result_key table) — every existing reader (trigger-ava-analysis, the
        // cockpit, CondensedAIAnalysis, ai-shortlist, ai-chat-interview,
        // generate-applicant-dossier, ava-voice-session/ava-voice-tools,
        // ai-generate-performance-report) keeps working unchanged. See
        // grading.ts (buildAntiCheatLog/buildChatSimulationResult) — pulled out
        // as pure functions so scripts/chat_simulation_grading.test.mjs can
        // exercise this exact assembly under plain Node. The full grading
        // (communication, professionalism, overallFeedback) goes only to the
        // staff-only record below, never to notes. A lead's own items
        // (ownership, correctedAgent, newPromiseMade, the quoted evidence)
        // ride along; a chat nobody marked carries graded:false and its
        // transcript instead of a score.
        const chatSimulationResult = buildChatSimulationResult({
          scenario: gradedScenario,
          messageCount: gradedMessages.length,
          evaluation,
          violations: integrity.violations,
          transcript: gradedMessages,
          scenarioId: gradedScenarioId,
          // Only where the record system is not deployed at all.
          transcriptSource: transcript.source === "stored" ? "stored" : "browser",
          typing,
        });

        // recordStepResult only needs the minimal from().select().eq().maybeSingle()
        // / from().update().eq() shape (see MinimalSupabaseAdmin in
        // trustedResults.ts) — the real client's builders are structurally
        // compatible (thenable) but not literally `Promise`, and comparing the
        // full generated client type against that interface blows up
        // TypeScript's instantiation depth. Same `as unknown as` pattern any
        // part-B conversion needs here.
        const outcome = await recordStepResult(admin as unknown as MinimalSupabaseAdmin, {
          applicationId,
          callerUserId,
          stepId,
          stepType: "chat_simulation",
          // ChatSimulationPhase.tsx's own `.update()` never wrote `phase`/
          // `status` at all, in either mode — the whole advance/reject
          // decision was left to a follow-up trigger-ava-analysis call. See
          // StepAdvanceMode's doc comment on RecordStepResultInput.
          advance: "never",
          resultKey: "chatSimulationResult",
          result: chatSimulationResult as unknown as Record<string, unknown>,
        });

        if (!outcome.ok) {
          if (session && claimed) {
            if (outcome.code === "write_failed") await failSession(record, session.id, outcome.error);
            else await releaseGrading(record, session.id, gate.fromStatus ?? "active");
          }
          return new Response(
            JSON.stringify({ error: outcome.error }),
            { status: outcome.code === "step_not_reached" ? 409 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // The end must not depend on the tab: in an auto-mode job the server
        // asks for the next step itself, in the background, with this
        // request's own JWT (_shared/stepMoveOn.ts). The page's own ask, if
        // it is still open, gets the same idempotent answer. Never blocks
        // this response.
        scheduleStepMoveOn(record, { applicationId, stepId, authorization: req.headers.get("Authorization") });

        if (session) {
          await finishGrading(
            record,
            session.id,
            gate,
            gradingRecord({
              model: graded ? OPENAI_CHAT_SIMULATION_EVAL_MODEL : null,
              promptVersion: EVAL_PROMPT_VERSION,
              fallback: !graded,
              result: evaluation,
              extra: {
                graded,
                rubric,
                focus,
                step_title: practiceJob.step?.title ?? null,
                scenario: { scenario: gradedScenario, customer_name: gradedCustomerName, scenario_id: gradedScenarioId },
                transcript_source: transcript.source,
                messages_graded: gradedMessages.length,
                integrity_source: integrity.source,
                // Typing per reply (staff only): what the medians in
                // notes.chatSimulationResult.typing were built from, and the
                // spelling mistakes the server found in the applicant's lines.
                ...(typing && storedTurns
                  ? { typing: { replies: replyTypingRows(storedTurns), spelling_mistakes: spellingMistakes } }
                  : {}),
                // An answer that came back but could not be read as a mark, for whoever re-grades it.
                ...(!graded && !usedFallback ? { unread_answer: reviewed } : {}),
              },
            }),
            chatSimulationEndReason(storedTurns),
          );
        }

        // phase_ai_analysis is a display-only summary column recordStepResult
        // itself doesn't own (it's not part of any notes[resultKey] shape) —
        // written here, still service-role, with the exact text
        // ChatSimulationPhase.tsx always wrote alongside notes. Best-effort:
        // a failure here never undoes the trusted result write above.
        const phaseAiAnalysis = buildPhaseAiAnalysis(evaluation);
        const { error: analysisError } = await admin
          .from("applications")
          .update({ phase_ai_analysis: phaseAiAnalysis })
          .eq("id", applicationId);
        if (analysisError) {
          console.error("Failed to write phase_ai_analysis:", analysisError);
        }

        return new Response(
          JSON.stringify({
            chatSimulationResult,
            phaseAiAnalysis,
            next: outcome.next,
            ...(session ? { assessment: { recorded: true, session_id: session.id } } : {}),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        if (isAiUnavailable(error)) {
          // The service refused before anything was recorded: no result, no
          // "not graded", no move on. The attempt goes back to open with the
          // whole conversation, and the page offers to send it again.
          console.warn("[ai-chat-simulation] chat left open, the AI service is unavailable:", error.reason);
          await refuseGradingForOutage(record, session, gate, error.reason);
          return aiUnavailableResponse(corsHeaders);
        }
        if (session && claimed) await failSession(record, session.id, error instanceof Error ? error.message : String(error));
        throw error;
      }
    }

    // start / respond. A page that records the test sends its session JWT
    // plus applicationId and stepId; anything else is served as before.
    const target = recordingTargetFrom(request);
    const callerId = target ? await resolveCallerId(req) : null;
    // A phone or tablet never starts the chat practice, never opens its
    // attempt and never holds it without a record: a start or a reply goes
    // on only for the signed-in candidate's own attempt that a computer
    // started (a reload or a reply after moving to the phone), or on a step
    // the rule does not put on a computer. Without an application to record
    // against it is refused outright: this function serves only that step
    // (docs/COMPUTER-ONLY-TESTS.md).
    if (needsComputer(requestDevice)) {
      const gate = await computerOnlyGate(target ? recordClient() : null, requestDevice, target ? { ...target, userId: callerId, purpose: "turns" } : null);
      if (gate === "refuse") return json(computerRequiredBody(requestDevice), 400);
    }
    let recording: { admin: AssessmentAdmin; session: SessionRow; applicationId: string; stepId: string; userId: string } | null = null;
    let notRecorded: string | null = null;
    if (target) {
      const userId = callerId;
      const admin = userId ? recordClient() : null;
      if (!userId) notRecorded = "not_signed_in";
      else if (!admin) notRecorded = "error";
      else {
        const resolved = await resolveSession(admin, { ...target, userId, stepType: "chat_simulation", purpose: "turns" });
        if (resolved.ok) recording = { admin, session: resolved.session, applicationId: target.applicationId, stepId: target.stepId, userId };
        else notRecorded = resolved.reason;
      }
      if (notRecorded) console.log("[ai-chat-simulation] turn not recorded:", notRecorded);
    }

    let liveScenario = scenario;
    let liveCustomerName = customerName;
    let history: SimulationChatMessage[] = messages;
    let liveAgentMessage = agentMessage;
    let liveMessageCount = messageCount;
    let replyId: string | null = null;
    // A new message, held until the model takes it (stored right after).
    let held: HeldCandidateTurn | null = null;
    let scenarioId: string | null = typeof request.scenarioId === "string" ? request.scenarioId.slice(0, 200) : null;

    if (recording) {
      const { admin, session } = recording;
      // The case is pinned on the attempt the first time it starts and
      // served back from then on, so a reload continues the same player's
      // problem. The pin is ALWAYS the server's own pick (scenarioToPin: the
      // page's stable index over the step's configured cases, else the page's
      // built-in ones), never the request's scenario id or text, so an
      // applicant cannot choose the case they rehearsed. Only when the job
      // cannot be read is nothing pinned, and this one turn is played from
      // the request's text (the evaluate grades the server's pick regardless).
      let pinned = pinnedScenario(session.context);
      if (!pinned) {
        const practiceJob = await loadPracticeJob(admin, recording.applicationId, recording.stepId, recording.userId);
        if (practiceJob) {
          const pick = scenarioToPin(practiceJob.step, { applicationId: recording.applicationId, stepId: recording.stepId });
          await updateContext(admin, session, {
            scenario: pick.scenario,
            customer_name: pick.customerName,
            scenario_id: pick.id,
            scenario_pinned_by: "server",
          });
          pinned = { scenario: pick.scenario, customerName: pick.customerName, scenarioId: pick.id, byServer: true };
        }
      }
      if (pinned) {
        liveScenario = pinned.scenario;
        liveCustomerName = pinned.customerName;
        scenarioId = pinned.scenarioId ?? scenarioId;
      }

      const resumeWith = (turns: StoredTurn[]) =>
        json(resumePayload(session, turns, {
          scenario: { scenario: liveScenario, customerName: liveCustomerName, scenarioId },
        }));

      if (mode === "start") {
        // The device the attempt started on (headers plus the page's own
        // reading), once: a phone may later continue only an attempt a
        // computer started.
        await recordStartDevice(admin, session, requestDevice);
        // A reload: the conversation is already on file. Hand it back rather
        // than asking for a second opening message.
        const turns = await loadTurns(admin, session.id);
        if (turns && turns.length > 0) return resumeWith(turns);
        // Another start already asked for the opener (a reload or a second
        // tab while it streamed): wait for THAT opener instead of a second one.
        if (!(await askForOpener(admin, session.id)).first) {
          const waited = await awaitInFlightReply(admin, session.id, OPENER_ID);
          if (waited.action === "replay") {
            const now = await loadTurns(admin, session.id);
            return resumeWith(now && now.length > 0 ? now : [waited.reply]);
          }
          await markReplyAsked(admin, session.id, OPENER_ID);
        }
        history = [];
        replyId = OPENER_ID;
      } else if (mode === "respond" && typeof agentMessage === "string" && agentMessage.trim()) {
        const clientMsgId = cleanClientMsgId(request.clientMsgId) ?? serverMsgId();
        const turnInput = {
          content: agentMessage,
          clientMsgId,
          clientAt: cleanClientAt(request.clientAt),
          role: "agent" as const,
          // The page's keystroke summary for this reply, cleaned; never a total.
          typing: cleanReplyTyping(request.typing) as Record<string, unknown> | null,
        };
        // A NEW message is held until the model takes it, then stored
        // (_shared/assessmentSession.ts holdCandidateTurn): when the AI
        // service refuses, nothing is stored and the page puts the text back
        // in the box, so the record never holds a reply nobody answered. A
        // message already on the record (sent again) goes on as before.
        const heldFrom = Date.now();
        const [known, storedSoFar] = await Promise.all([
          candidateTurnStatus(admin, session.id, clientMsgId),
          loadTurns(admin, session.id),
        ]);
        if (known === "new") {
          held = holdCandidateTurn(turnInput, heldFrom);
          history = storedSoFar ? turnsToTranscript(storedSoFar) : messages;
          liveAgentMessage = held.input.content;
          liveMessageCount = storedSoFar ? storedSoFar.length : messageCount;
          replyId = replyMsgId(clientMsgId);
        } else {
          const turn = await recordCandidateTurn(admin, session.id, turnInput);
          if (!turn.ok && turn.reason === "turn_not_saved") {
            // Every answer is kept as it is sent: one that could not be stored
            // (after three tries) is sent again by the page, never carried on
            // without the record.
            return json({ error: "Your message did not save. Please send it again.", code: "turn_not_saved", retryable: true }, 503);
          }
          let stored: StoredTurn | null = turn.ok ? turn.existingReply : null;
          if (turn.ok && !stored && turn.repeat) {
            // Sent again while its first reply may still be streaming: wait for
            // that reply, so the applicant sees the one the record keeps.
            const waited = await awaitInFlightReply(admin, session.id, clientMsgId);
            if (waited.action === "replay") stored = waited.reply;
            else await markReplyAsked(admin, session.id, clientMsgId);
          }
          if (!turn.ok) {
            notRecorded = turn.reason;
            recording = null;
          } else if (stored) {
            // Its reply is stored: play it back (no second model call, no second reply).
            return new Response(
              withLeadingSse(sseReplayText(replayTextFor(stored)), {
                assessment: { recorded: true, session_id: session.id, attempt: session.attempt, replayed: true },
              }),
              { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } },
            );
          } else {
            // The model's history is the STORED conversation, never the
            // request's (the request's only if the record cannot be read back).
            history = turn.history ? turnsToTranscript(turn.history) : messages;
            liveAgentMessage = turn.content;
            liveMessageCount = turn.history ? turn.history.length : messageCount;
            replyId = replyMsgId(clientMsgId);
          }
        }
      } else {
        notRecorded = "no_message";
        recording = null;
      }
    }

    // For start/respond modes, stream the response
    console.log("Streaming customer response via OpenAI");
    let response: Response;
    try {
      response = await streamOpenAIChatCompletion({
        apiKey: OPENAI_API_KEY,
        model: OPENAI_CHAT_SIMULATION_MODEL,
        messages: buildSimulationApiMessages(
          customerPromptFor(liveCustomerName, liveScenario, liveMessageCount),
          history,
          customerTurnInstruction(mode === "start" ? "start" : "respond", liveAgentMessage, liveCustomerName, liveScenario, liveMessageCount),
        ),
        temperature: 0.9,
        maxCompletionTokens: 700,
      });
    } catch (error) {
      if (recording && replyId) {
        // The AI service refused: a held message stays unsent (the page puts
        // it back in the box) and the opener or a stored message is marked
        // so the next ask goes at once. Anything else is recorded as before:
        // the message stored, its reply marked failed, and a 500.
        const failure = await afterReplyAskFailed(recording.admin, recording.session.id, { held, replyId, error });
        if (failure === "ai_unavailable") {
          console.warn("[ai-chat-simulation] no reply, the AI service is unavailable:", isAiUnavailable(error) ? error.reason : "");
          return aiUnavailableResponse(corsHeaders, mode === "respond" ? { turnSaved: !held } : {});
        }
      } else if (isAiUnavailable(error)) {
        return aiUnavailableResponse(corsHeaders);
      }
      throw error;
    }

    if (recording && held) {
      // The model has taken the message: store it now, before any of the
      // reply reaches the browser or the record.
      const turn = await storeHeldCandidateTurn(recording.admin, recording.session.id, held);
      if (!turn.ok && turn.reason === "turn_not_saved") {
        await response.body?.cancel().catch(() => {});
        return json({ error: "Your message did not save. Please send it again.", code: "turn_not_saved", retryable: true }, 503);
      }
      if (!turn.ok) {
        // A full session: answered without being recorded, as before.
        notRecorded = turn.reason;
        recording = null;
      } else if (turn.existingReply || turn.repeat) {
        // Another request with this same id stored the message first (two
        // tabs, a resend that overlapped this one): the record keeps THAT
        // message and THAT reply, and an applicant only ever sees the reply
        // the record keeps. So this request's own stream is never delivered.
        // The stored reply is played back, waited for while the other request
        // is still streaming it (awaitInFlightReply, as for any message sent
        // again). If none is coming (that ask failed or died), the page is
        // told to send the message again: it is on the record now, so the
        // resend goes the way of any stored message and asks for its reply.
        await response.body?.cancel().catch(() => {});
        let kept: StoredTurn | null = turn.existingReply;
        if (!kept) {
          const waited = await awaitInFlightReply(recording.admin, recording.session.id, held.input.clientMsgId);
          if (waited.action === "replay") kept = waited.reply;
        }
        if (!kept) {
          return json({ error: "Your message did not save. Please send it again.", code: "turn_not_saved", retryable: true }, 503);
        }
        return new Response(
          withLeadingSse(sseReplayText(replayTextFor(kept)), {
            assessment: { recorded: true, session_id: recording.session.id, attempt: recording.session.attempt, replayed: true },
          }),
          { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } },
        );
      }
    }

    let body: ReadableStream<Uint8Array> = response.body!;
    if (recording && replyId) {
      // The browser still streams live; the full reply is stored once the
      // stream ends, in the background, even if the tab has closed.
      body = withLeadingSse(
        teeAndRecordReply(recording.admin, body, {
          sessionId: recording.session.id,
          clientMsgId: replyId,
          style: "customer",
          model: OPENAI_CHAT_SIMULATION_MODEL,
        }),
        {
          assessment: {
            recorded: true,
            session_id: recording.session.id,
            attempt: recording.session.attempt,
            ...(mode === "start" ? { scenario: { scenario: liveScenario, customerName: liveCustomerName, scenarioId } } : {}),
          },
        },
      );
    } else if (target) {
      body = withLeadingSse(body, { assessment: { recorded: false, reason: notRecorded ?? "error" } });
    }

    return new Response(body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (error) {
    console.error("Error in ai-chat-simulation:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
