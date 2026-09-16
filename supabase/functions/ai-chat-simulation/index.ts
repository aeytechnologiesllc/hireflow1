import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOpenAIJson, requireJsonKeys, type OpenAIMessage } from "../_shared/openai.ts";
import { streamOpenAIChatCompletion } from "../_shared/openaiStreaming.ts";
import { guardPublicAiCall } from "../_shared/rateLimit.ts";
import { recordStepResult, type MinimalSupabaseAdmin } from "../_shared/trustedResults.ts";
import { buildChatSimulationResult, buildPhaseAiAnalysis, type AntiCheatViolation } from "./grading.ts";

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
  // Only required for mode "evaluate" — this is what lets the server own the
  // write: recordStepResult verifies the caller really is this application's
  // candidate and has actually reached this step before it ever touches
  // `applications`. See docs/TRUSTED-RESULTS.md.
  applicationId?: string;
  stepId?: string;
  violations?: AntiCheatViolation[];
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Public endpoint that spends money per call — cap how fast one caller can spend it.
  const limited = await guardPublicAiCall(req, "ai-chat-simulation", corsHeaders, 60, 3600);
  if (limited) return limited;

  try {
    const request: ChatSimulationRequest = await req.json();
    const { mode, scenario, customerName, jobTitle, messages = [], agentMessage, messageCount = 0, applicationId, stepId, violations = [] } = request;

    console.log("Chat simulation request:", { mode, scenario, customerName, messageCount });

    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are roleplaying as a customer named ${customerName} in a customer support chat simulation.

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

    let userContent = "";
    
    if (mode === "start") {
      userContent = "Start the conversation as the frustrated customer. Send your opening message describing your problem.";
    } else if (mode === "respond") {
      userContent = `The support agent just said: "${agentMessage}"
      
Respond as the customer ${customerName}. Remember your scenario: ${scenario}. This is message #${messageCount} in the conversation.`;
    } else if (mode === "evaluate") {
      userContent = `Evaluate this support agent's performance throughout the conversation. Analyze their empathy, problem-solving, communication skills, and professionalism.`;
    }

    // For the AI, we flip the roles - the "agent" messages become "user" (since AI is the customer)
    const apiMessages: OpenAIMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m): OpenAIMessage => ({
        role: m.role === "user" ? "assistant" : "user", // Flip roles for AI perspective
        content: m.content
      })),
      { role: "user", content: userContent }
    ];

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

      // Graded here, server-side, every time — including the fallback path
      // (OpenAI unreachable / bad JSON), so an honest candidate's submission
      // still completes and gets recorded exactly like the client-side
      // default evaluation used to guarantee before this conversion.
      const { data: evaluation } = await callOpenAIJson({
        apiKey: OPENAI_API_KEY,
        model: OPENAI_CHAT_SIMULATION_EVAL_MODEL,
        messages: apiMessages,
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
        fallback: () => ({
          score: 70,
          empathy: 70,
          problemSolving: 70,
          communication: 70,
          professionalism: 70,
          strengths: ["Completed simulation"],
          improvements: ["Unable to parse detailed evaluation"],
          overallFeedback: "Simulation completed successfully.",
        }),
      });

      // Exact chatSimulationResult shape ChatSimulationPhase.tsx has always
      // written at notes.chatSimulationResult (docs/TRUSTED-RESULTS.md's
      // result_key table) — every existing reader (trigger-ava-analysis, the
      // cockpit, CondensedAIAnalysis, ai-shortlist, ai-chat-interview,
      // generate-applicant-dossier, ava-voice-session/ava-voice-tools,
      // ai-generate-performance-report) keeps working unchanged. See
      // grading.ts (buildAntiCheatLog/buildChatSimulationResult) — pulled out
      // as pure functions so scripts/chat_simulation_grading.test.mjs can
      // exercise this exact assembly under plain Node.
      const chatSimulationResult = buildChatSimulationResult({
        scenario,
        messageCount: messages.length,
        evaluation,
        violations,
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
        resultKey: "chatSimulationResult",
        result: chatSimulationResult as unknown as Record<string, unknown>,
      });

      if (!outcome.ok) {
        return new Response(
          JSON.stringify({ error: outcome.error }),
          { status: outcome.code === "step_not_reached" ? 409 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        JSON.stringify({ chatSimulationResult, phaseAiAnalysis, next: outcome.next }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For start/respond modes, stream the response
    console.log("Streaming customer response via OpenAI");
    const response = await streamOpenAIChatCompletion({
      apiKey: OPENAI_API_KEY,
      model: OPENAI_CHAT_SIMULATION_MODEL,
      messages: apiMessages,
      temperature: 0.9,
      maxCompletionTokens: 700,
    });

    return new Response(response.body, {
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
