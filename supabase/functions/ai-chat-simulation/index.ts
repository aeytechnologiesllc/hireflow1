import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOpenAIJson, requireJsonKeys } from "../_shared/openai.ts";
import { streamOpenAIChatCompletion } from "../_shared/openaiStreaming.ts";
import { guardPublicAiCall } from "../_shared/rateLimit.ts";
import { recordStepResult, type MinimalSupabaseAdmin } from "../_shared/trustedResults.ts";
import {
  askForOpener,
  awaitInFlightReply,
  chatSimulationEndReason,
  chooseIntegrity,
  chooseTranscript,
  cleanClientAt,
  cleanClientMsgId,
  failSession,
  finishGrading,
  forIdOfReply,
  gateGrading,
  gradingRecord,
  loadIntegrityEvents,
  loadTurns,
  markReplyAsked,
  markReplyFailed,
  OPENER_ID,
  readStepOnFile,
  recordCandidateTurn,
  recordingTargetFrom,
  releaseGrading,
  replayTextFor,
  replyMsgId,
  resolveSession,
  resumePayload,
  serverMsgId,
  settleTrailingReply,
  sseReplayText,
  storeSubmittedTranscript,
  teeAndRecordReply,
  turnsToTranscript,
  unstoredTail,
  updateContext,
  withLeadingSse,
  type AssessmentAdmin,
  type SessionRow,
  type StoredTurn,
} from "../_shared/assessmentSession.ts";
import { scheduleStepMoveOn } from "../_shared/stepMoveOn.ts";
import {
  buildChatSimulationResult,
  buildPhaseAiAnalysis,
  buildSimulationApiMessages,
  phaseAiAnalysisFromStoredResult,
  type AntiCheatViolation,
  type SimulationChatMessage,
} from "./grading.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_CHAT_SIMULATION_MODEL = Deno.env.get("OPENAI_CHAT_SIMULATION_MODEL") || "gpt-5.6-luna";
const OPENAI_CHAT_SIMULATION_EVAL_MODEL = Deno.env.get("OPENAI_CHAT_SIMULATION_EVAL_MODEL") || "gpt-5.6-luna";
/** Named in session.grading.prompt_version; bump when the evaluation prompt changes. */
const EVAL_PROMPT_VERSION = "chat-sim-eval-1";

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
  /** "start": the page's id for the scenario it picked, kept with the scenario. */
  scenarioId?: string;
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

/** The scenario pinned on the attempt the first time it started. */
function pinnedScenario(context: Record<string, unknown>): { scenario: string; customerName: string; scenarioId: string | null } | null {
  if (typeof context.scenario !== "string" || !context.scenario.trim()) return null;
  if (typeof context.customer_name !== "string" || !context.customer_name.trim()) return null;
  return {
    scenario: context.scenario,
    customerName: context.customer_name,
    scenarioId: typeof context.scenario_id === "string" ? context.scenario_id : null,
  };
}

function systemPromptFor(customerName: string, scenario: string, mode: ChatSimulationRequest["mode"], messageCount: number): string {
  return `You are roleplaying as a customer named ${customerName} in a customer support chat simulation.

SCENARIO: ${scenario}

YOUR PERSONALITY & BEHAVIOR:
- You are a real customer with a genuine problem that's frustrating you
- Start somewhat frustrated but not hostile
- Your frustration level can increase OR decrease based on how the support agent responds
- If the agent is empathetic and helpful, you can become calmer and more cooperative
- If the agent is dismissive or unhelpful, you can become more frustrated
- Sometimes you might send a quick follow-up message expressing impatience
- Be realistic - real customers make typos, use informal language, and sometimes ramble

REALISTIC BEHAVIORS TO EXHIBIT:
- Express genuine emotion (frustration, relief, gratitude)
- Ask clarifying questions about solutions
- Mention how the problem is affecting you personally
- Reference past experiences if relevant ("this happened before", "I've been a customer for X years")
- React authentically to solutions (skeptical, relieved, grateful)

CONVERSATION FLOW:
- If the agent apologizes sincerely and offers help, acknowledge it but stay focused on resolution
- If the agent provides a solution, ask about timeline or confirmation
- If the agent asks for information, provide it (use realistic fake details)
- After ${messageCount >= 5 ? "enough back and forth, if you feel the issue is resolved or being handled well" : "a few more exchanges"}, you can express satisfaction and thank the agent

${mode === 'evaluate' ? `
EVALUATION MODE: You are now evaluating the support agent's performance. Analyze the conversation and return JSON:
{
  "score": <number 0-100>,
  "empathy": <number 0-100>,
  "problemSolving": <number 0-100>,
  "communication": <number 0-100>,
  "professionalism": <number 0-100>,
  "strengths": ["strength1", "strength2"],
  "improvements": ["area1", "area2"],
  "overallFeedback": "Brief summary of agent performance"
}
` : `
RESPONSE GUIDELINES:
- Keep responses 1-3 sentences typically (real customers don't write essays)
- Occasionally send very short responses ("ok", "and?", "I see")
- Don't be satisfied too easily - make sure the agent actually addresses your concern
- CRITICAL: Do NOT greet or use the agent's name. You're the customer - just describe your problem. Real frustrated customers don't say "Hello [agent name]" - they just complain.

NATURAL CONVERSATION ENDING:
- When you feel the agent has genuinely resolved your issue (after at least ${Math.max(5, messageCount)} exchanges), you should naturally wrap up
- Express genuine gratitude and satisfaction in a natural way like: "Thank you so much! I really appreciate your help." or "That's great, thanks for sorting this out for me!"
- When you're satisfied and ready to end the conversation, add [RESOLVED] at the very END of your message (this is a hidden marker, write your natural message first then add [RESOLVED] at the end)
- Only add [RESOLVED] when you're truly satisfied - the agent must have actually addressed your concern
- Example: "Perfect, that's exactly what I needed. Thanks so much for your help! [RESOLVED]"
`}`;
}

function userContentFor(
  mode: ChatSimulationRequest["mode"],
  agentMessage: string | undefined,
  customerName: string,
  scenario: string,
  messageCount: number,
): string {
  if (mode === "start") {
    return "Start the conversation as the frustrated customer. Send your opening message describing your problem.";
  }
  if (mode === "respond") {
    return `The support agent just said: "${agentMessage}"
      
Respond as the customer ${customerName}. Remember your scenario: ${scenario}. This is message #${messageCount} in the conversation.`;
  }
  if (mode === "evaluate") {
    return `Evaluate this support agent's performance throughout the conversation. Analyze their empathy, problem-solving, communication skills, and professionalism.`;
  }
  return "";
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

      // The record of this attempt (docs/ASSESSMENT-RECORD.md §5.1), best
      // effort: with no record (the migration not applied, a finished or
      // closed step) this grades the request's transcript exactly as before.
      // A page on the previous build kept the conversation only in the
      // browser; its transcript is stored here so the hiring team has it.
      const resolved = await resolveSession(record, {
        applicationId,
        stepId,
        userId: callerUserId,
        stepType: "chat_simulation",
        purpose: "submit",
      });
      const session: SessionRow | null = resolved.ok ? resolved.session : null;
      if (!resolved.ok) console.log("[ai-chat-simulation] evaluate without a record:", resolved.reason, resolved.detail ?? "");

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

      const storedTurns = session ? await settleTrailingReply(record, session.id, await loadTurns(record, session.id)) : null;
      // Graded: the STORED turns whenever the record has the agent's own
      // messages (each was stored before the customer answered it), else the
      // transcript in the request.
      const transcript = chooseTranscript(storedTurns, messages);
      const gradedMessages: SimulationChatMessage[] = transcript.source === "stored" ? transcript.messages : messages;
      const tail = session && storedTurns ? unstoredTail(storedTurns, messages) : null;
      if (session && tail && tail.messages.length > 0) {
        await storeSubmittedTranscript(record, session.id, tail, { candidate: "agent", assistant: "customer" });
      }
      if (transcript.source === "stored" && transcript.requestTurns !== transcript.storedTurns) {
        console.warn("[ai-chat-simulation] grading the stored transcript; the request's differs", {
          stored: transcript.storedTurns,
          request: transcript.requestTurns,
        });
      }
      const pinned = session ? pinnedScenario(session.context) : null;
      const gradedScenario = pinned?.scenario ?? scenario;
      const gradedCustomerName = pinned?.customerName ?? customerName;

      try {
        // Graded here, server-side, every time — including the fallback path
        // (OpenAI unreachable / bad JSON), so an honest candidate's submission
        // still completes and gets recorded exactly like the client-side
        // default evaluation used to guarantee before this conversion.
        let usedFallback = false;
        const { data: evaluation } = await callOpenAIJson({
          apiKey: OPENAI_API_KEY,
          model: OPENAI_CHAT_SIMULATION_EVAL_MODEL,
          messages: buildSimulationApiMessages(
            systemPromptFor(gradedCustomerName, gradedScenario, mode, messageCount),
            gradedMessages,
            userContentFor(mode, agentMessage, gradedCustomerName, gradedScenario, messageCount),
          ),
          temperature: 0.35,
          maxCompletionTokens: 1200,
          validator: (value) => requireJsonKeys(value, [
            "score",
            "empathy",
            "problemSolving",
            "communication",
            "professionalism",
            "strengths",
            "improvements",
            "overallFeedback",
          ]),
          fallback: () => {
            usedFallback = true;
            return {
              score: 70,
              empathy: 70,
              problemSolving: 70,
              communication: 70,
              professionalism: 70,
              strengths: ["Completed simulation"],
              improvements: ["Unable to parse detailed evaluation"],
              overallFeedback: "Simulation completed successfully.",
            };
          },
        });

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
        // staff-only record below, never to notes.
        const chatSimulationResult = buildChatSimulationResult({
          scenario: gradedScenario,
          messageCount: gradedMessages.length,
          evaluation,
          violations: integrity.violations,
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
              model: usedFallback ? null : OPENAI_CHAT_SIMULATION_EVAL_MODEL,
              promptVersion: EVAL_PROMPT_VERSION,
              fallback: usedFallback,
              result: evaluation,
              extra: {
                scenario: { scenario: gradedScenario, customer_name: gradedCustomerName },
                transcript_source: transcript.source,
                messages_graded: gradedMessages.length,
                integrity_source: integrity.source,
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
        if (session && claimed) await failSession(record, session.id, error instanceof Error ? error.message : String(error));
        throw error;
      }
    }

    // start / respond. A page that records the test sends its session JWT
    // plus applicationId and stepId; anything else is served as before.
    const target = recordingTargetFrom(request);
    let recording: { admin: AssessmentAdmin; session: SessionRow } | null = null;
    let notRecorded: string | null = null;
    if (target) {
      const userId = await resolveCallerId(req);
      const admin = userId ? recordClient() : null;
      if (!userId) notRecorded = "not_signed_in";
      else if (!admin) notRecorded = "error";
      else {
        const resolved = await resolveSession(admin, { ...target, userId, stepType: "chat_simulation", purpose: "turns" });
        if (resolved.ok) recording = { admin, session: resolved.session };
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
    let scenarioId: string | null = typeof request.scenarioId === "string" ? request.scenarioId.slice(0, 200) : null;

    if (recording) {
      const { admin, session } = recording;
      // The scenario is pinned on the attempt the first time it starts (the
      // page's own stable pick, for now) and served back from then on, so a
      // reload continues the same customer's problem.
      let pinned = pinnedScenario(session.context);
      if (!pinned && typeof scenario === "string" && scenario.trim() && typeof customerName === "string" && customerName.trim()) {
        await updateContext(admin, session, {
          scenario,
          customer_name: customerName,
          ...(scenarioId ? { scenario_id: scenarioId } : {}),
        });
        pinned = { scenario, customerName, scenarioId };
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
        const turn = await recordCandidateTurn(admin, session.id, {
          content: agentMessage,
          clientMsgId,
          clientAt: cleanClientAt(request.clientAt),
          role: "agent",
        });
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
          systemPromptFor(liveCustomerName, liveScenario, mode, liveMessageCount),
          history,
          userContentFor(mode, liveAgentMessage, liveCustomerName, liveScenario, liveMessageCount),
        ),
        temperature: 0.9,
        maxCompletionTokens: 700,
      });
    } catch (error) {
      // No reply is coming for this ask: a message sent again is answered at once.
      if (recording && replyId) {
        await markReplyFailed(recording.admin, recording.session.id, forIdOfReply(replyId), error instanceof Error ? error.message : String(error));
      }
      throw error;
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
