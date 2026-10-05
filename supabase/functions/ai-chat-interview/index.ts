import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callOpenAIJson, requireJsonKeys, type OpenAIMessage } from "../_shared/openai.ts";
import { streamOpenAIChatCompletion } from "../_shared/openaiStreaming.ts";
import { guardPublicAiCall } from "../_shared/rateLimit.ts";
import { recordStepResult, type MinimalSupabaseAdmin } from "../_shared/trustedResults.ts";
import {
  askForOpener,
  awaitInFlightReply,
  chooseIntegrity,
  chooseTranscript,
  cleanClientAt,
  cleanClientMsgId,
  failSession,
  finishGrading,
  forIdOfReply,
  gateGrading,
  gradingRecord,
  interviewEndReason,
  interviewQuestionCount,
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
  buildChatInterviewResult,
  buildPhaseAiAnalysis,
  candidateAnswerCount,
  type AntiCheatViolationForNotes,
  type ChatInterviewSubmitPath,
  type EvaluationResult,
  type TranscriptMessageForNotes,
} from "./resultShape.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_CHAT_INTERVIEW_MODEL = Deno.env.get("OPENAI_CHAT_INTERVIEW_MODEL") || "gpt-5.6-luna";
const OPENAI_CHAT_INTERVIEW_EVAL_MODEL = Deno.env.get("OPENAI_CHAT_INTERVIEW_EVAL_MODEL") || "gpt-5.6-luna";
/** Named in session.grading.prompt_version; bump when the evaluation prompt changes. */
const EVAL_PROMPT_VERSION = "chat-interview-eval-1";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  // Only ever used by mode "submit"'s "auto_end" shape, which stores the
  // transcript verbatim in notes.chatInterviewResult.messages — ignored by
  // every other mode.
  timestamp?: string;
}

interface CandidateContext {
  applicationAnswers?: Array<{ question: string; answer: string }>;
  resumeAnalysis?: string;
  quizScore?: number;
  quizSummary?: string;
  typingTestResult?: { wpm: number; accuracy: number };
  chatSimulationResult?: { score: number; summary: string };
  salesSimulationResult?: { score: number; summary: string };
  videoIntroUrl?: string;
  completedPhases?: string[];
}

interface ChatInterviewRequest {
  /** There is no "evaluate" mode any more (see the check in the handler). */
  mode: "start" | "respond" | "submit";
  jobTitle: string;
  jobDescription: string;
  jobDetails?: {
    requirements?: string;
    responsibilities?: string;
    benefits?: string[];
    skills?: string[];
    location?: string;
    jobType?: string;
  };
  candidateName?: string;
  candidateContext?: CandidateContext;
  messages?: ChatMessage[];
  userMessage?: string;
  // mode "submit" only — the trusted, server-side finalize. See
  // docs/TRUSTED-RESULTS.md. The caller must be the candidate on
  // `applicationId`, authenticated via a real user JWT (never the anon/
  // publishable key start/respond accept).
  applicationId?: string;
  stepId?: string;
  path?: ChatInterviewSubmitPath;
  duration?: string | number;
  questionCount?: number;
  violations?: AntiCheatViolationForNotes[];
  // Since 2026-10-06, "start"/"respond" from a page that records the test
  // (docs/ASSESSMENT-RECORD.md §5.1) also carry applicationId + stepId and
  // the candidate's own session JWT; every message is then stored as it is
  // sent and the history is rebuilt from the stored turns. A page on the
  // previous build sends neither on a turn and is served exactly as before.
  /** "respond": the page's own id for the candidate's message (idempotency key). */
  clientMsgId?: string;
  /** "respond": when the page sent it. */
  clientAt?: string;
}

/** The caller's user id from their own session JWT (never a body field). */
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/**
 * Adapts a real supabase-js client to the narrow `MinimalSupabaseAdmin`
 * shape `recordStepResult` expects — the real client's query builder is
 * PromiseLike, not a plain `Promise`, so it doesn't structurally satisfy
 * that interface on its own; `.then(...)` here produces genuine Promises.
 */
function toMinimalAdmin(client: ReturnType<typeof createClient>): MinimalSupabaseAdmin {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(column: string, value: string) {
              return {
                async maybeSingle() {
                  const { data, error } = await client.from(table).select(columns).eq(column, value).maybeSingle();
                  return { data, error };
                },
              };
            },
          };
        },
        update(values: Record<string, unknown>) {
          return {
            async eq(column: string, value: string) {
              const { error } = await client.from(table).update(values).eq(column, value);
              return { error };
            },
          };
        },
      };
    },
    // recordStepResult merges notes through merge_application_notes when the
    // adapter can call it; without this the interview result fell back to a
    // whole-notes overwrite that a background analysis could race. A method
    // call on the client, never a detached reference (supabase-js needs `this`).
    rpc(fn: string, args: Record<string, unknown>) {
      return client.rpc(fn, args);
    },
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Public endpoint that spends money per call — cap how fast one caller can spend it.
  const limited = await guardPublicAiCall(req, "ai-chat-interview", corsHeaders, 60, 3600);
  if (limited) return limited;

  // An attempt this request claimed for grading: if anything below throws,
  // it is marked failed (the result is still owed), not left "grading".
  let heldClaim: { admin: AssessmentAdmin; sessionId: string } | null = null;

  try {
    const request: ChatInterviewRequest = await req.json();
    const {
      mode,
      jobTitle,
      jobDescription,
      jobDetails,
      candidateName: requestCandidateName,
      candidateContext: requestCandidateContext,
      messages = [],
      userMessage,
      applicationId,
      stepId,
      path,
      duration,
      questionCount = 0,
      violations = [],
    } = request;

    console.log("Chat interview request:", { mode, jobTitle, candidateName: requestCandidateName, messageCount: messages.length, hasContext: !!requestCandidateContext });

    // The old "evaluate" mode is gone. No page has called it since the
    // trusted "submit" replaced it, and it ran the employer-facing grader
    // (score, recommendation, credibility rating, inconsistencies, summary)
    // on whatever transcript and candidate context anyone posted, with no
    // sign-in: an applicant could rehearse answers against the real grader.
    // Grading happens only inside "submit", for the signed-in candidate's
    // own application, and its full output stays in session.grading.
    if (mode !== "start" && mode !== "respond" && mode !== "submit") {
      return json({ error: "Unknown mode", code: "unknown_mode" }, 400);
    }

    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // mode "submit" is the trusted finalize: verify the caller really is a
    // signed-in candidate BEFORE spending anything on OpenAI. Never trust a
    // body-supplied candidate id — callerUserId comes only from the JWT
    // itself, resolved via auth.getUser().
    let submitCallerUserId: string | null = null;
    let supabaseAdmin: ReturnType<typeof createClient> | null = null;
    if (mode === "submit") {
      if (!applicationId || !stepId || (path !== "auto_end" && path !== "manual")) {
        return new Response(
          JSON.stringify({ error: "applicationId, stepId and a valid path are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Missing authorization header" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !anonKey || !serviceKey) {
        console.error("Supabase env vars missing for ai-chat-interview submit mode");
        return new Response(
          JSON.stringify({ error: "Server not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabaseUser = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
      if (userError || !user) {
        console.error("ai-chat-interview submit auth error:", userError);
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      submitCallerUserId = user.id;
      supabaseAdmin = createClient(supabaseUrl, serviceKey);
    }

    // What the prompt is built from. Without a record these are the
    // request's own values, exactly as before; with one, the conversation
    // and the candidate context come from the record.
    let candidateContext = requestCandidateContext;
    let candidateName = requestCandidateName;
    let conversation: ChatMessage[] = messages;
    let liveUserMessage = userMessage;

    // start / respond: the turn record (docs/ASSESSMENT-RECORD.md §5.1).
    const target = mode === "start" || mode === "respond" ? recordingTargetFrom(request) : null;
    let recording: { admin: AssessmentAdmin; session: SessionRow } | null = null;
    let notRecorded: string | null = null;
    let replyId: string | null = null;
    if (target) {
      const userId = await resolveCallerId(req);
      const admin = userId ? recordClient() : null;
      if (!userId) notRecorded = "not_signed_in";
      else if (!admin) notRecorded = "error";
      else {
        const resolved = await resolveSession(admin, { ...target, userId, stepType: "chat_interview", purpose: "turns" });
        if (resolved.ok) recording = { admin, session: resolved.session };
        else notRecorded = resolved.reason;
      }
      if (notRecorded) console.log("[ai-chat-interview] turn not recorded:", notRecorded);
    }
    if (recording) {
      const { admin, session } = recording;
      // The candidate context the interview started with is pinned on the
      // attempt, so every later question and the grading read the same one.
      if (session.context.candidate_context === undefined && requestCandidateContext) {
        await updateContext(admin, session, {
          candidate_context: requestCandidateContext,
          candidate_name: requestCandidateName ?? null,
        });
      }
      if (session.context.candidate_context !== undefined) {
        candidateContext = (session.context.candidate_context ?? undefined) as CandidateContext | undefined;
        if (typeof session.context.candidate_name === "string") candidateName = session.context.candidate_name;
      }

      if (mode === "start") {
        // A reload: the interview is already on file. Hand it back rather than
        // asking for a second greeting.
        const turns = await loadTurns(admin, session.id);
        if (turns && turns.length > 0) return json(resumePayload(session, turns));
        // Another start already asked for the greeting (a reload or a second
        // tab while it streamed): wait for THAT greeting instead of a second one.
        if (!(await askForOpener(admin, session.id)).first) {
          const waited = await awaitInFlightReply(admin, session.id, OPENER_ID);
          if (waited.action === "replay") {
            const now = await loadTurns(admin, session.id);
            return json(resumePayload(session, now && now.length > 0 ? now : [waited.reply]));
          }
          await markReplyAsked(admin, session.id, OPENER_ID);
        }
        conversation = [];
        replyId = OPENER_ID;
      } else if (typeof userMessage === "string" && userMessage.trim()) {
        const clientMsgId = cleanClientMsgId(request.clientMsgId) ?? serverMsgId();
        const turn = await recordCandidateTurn(admin, session.id, {
          content: userMessage,
          clientMsgId,
          clientAt: cleanClientAt(request.clientAt),
          role: "candidate",
        });
        if (!turn.ok && turn.reason === "turn_not_saved") {
          // Every answer is kept as it is sent: one that could not be stored
          // (after three tries) is sent again by the page, never carried on
          // without the record.
          return json({ error: "Your answer did not save. Please send it again.", code: "turn_not_saved", retryable: true }, 503);
        }
        let stored: StoredTurn | null = turn.ok ? turn.existingReply : null;
        if (turn.ok && !stored && turn.repeat) {
          // Sent again while its first reply may still be streaming: wait for
          // that reply, so the candidate sees the one the record keeps.
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
          // The model's history is the STORED interview, never the request's
          // (the request's only if the record cannot be read back).
          if (turn.history) {
            conversation = turnsToTranscript(turn.history).map((m) => ({ role: m.role, content: m.content }));
          }
          liveUserMessage = turn.content;
          replyId = replyMsgId(clientMsgId);
        }
      } else {
        notRecorded = "no_message";
        recording = null;
      }
    }

    // submit: the attempt's record, best effort. Graded: the STORED turns
    // whenever the record has the candidate's own answers, else the
    // request's transcript (a page on the previous build), which is then
    // stored so the hiring team has it.
    let submitSession: SessionRow | null = null;
    let submitGate: { claim: "claimed" | "none"; fromStatus: string | null } | null = null;
    let storedTurns: StoredTurn[] | null = null;
    let transcriptSource: "stored" | "request" = "request";
    if (mode === "submit" && supabaseAdmin && submitCallerUserId) {
      const record = supabaseAdmin as unknown as AssessmentAdmin;
      const resolved = await resolveSession(record, {
        applicationId: applicationId!,
        stepId: stepId!,
        userId: submitCallerUserId,
        stepType: "chat_interview",
        purpose: "submit",
      });
      if (resolved.ok) submitSession = resolved.session;
      else console.log("[ai-chat-interview] submit without a record:", resolved.reason, resolved.detail ?? "");

      // ONE request grades an attempt, and a result already on file is never
      // graded again from a request body (a retried or replayed submit gets
      // "already recorded" back). Decided before anything is spent.
      const gate = await gateGrading(record, submitSession, resolved.ok ? null : resolved.reason);
      if (!gate.go) {
        if (gate.why === "checking") {
          return json({ error: "This interview is already being checked.", code: "already_checking" }, 409);
        }
        const onFile = await readStepOnFile(record, applicationId!, stepId!, "chatInterviewResult");
        if (!onFile?.result) return json({ error: "This step is already recorded.", code: "already_recorded" }, 409);
        return json({ next: onFile.next, alreadyRecorded: true });
      }
      submitGate = gate;
      if (submitSession && gate.claim === "claimed") heldClaim = { admin: record, sessionId: submitSession.id };

      if (submitSession) {
        storedTurns = await settleTrailingReply(record, submitSession.id, await loadTurns(record, submitSession.id));
        const chosen = chooseTranscript(storedTurns, messages);
        transcriptSource = chosen.source;
        if (chosen.source === "stored") conversation = chosen.messages;
        const tail = storedTurns ? unstoredTail(storedTurns, messages) : null;
        if (tail && tail.messages.length > 0) {
          await storeSubmittedTranscript(record, submitSession.id, tail, { candidate: "candidate", assistant: "interviewer" });
        }
        if (submitSession.context.candidate_context !== undefined) {
          candidateContext = (submitSession.context.candidate_context ?? undefined) as CandidateContext | undefined;
          if (typeof submitSession.context.candidate_name === "string") candidateName = submitSession.context.candidate_name;
        }
      }
      // Ending is allowed at any time, once the candidate has answered at
      // least once: there is nothing to grade before that.
      if (candidateAnswerCount(conversation) === 0) {
        if (submitSession && gate.claim === "claimed") await releaseGrading(record, submitSession.id, gate.fromStatus ?? "active");
        return json({ error: "Answer at least one question before ending the interview." }, 400);
      }
    }

    // Build candidate context section
    let candidateContextSection = "";
    if (candidateContext) {
      candidateContextSection = `
=== CANDIDATE PROFILE (Use this to personalize your questions) ===
`;
      if (candidateContext.applicationAnswers?.length) {
        candidateContextSection += `
Application Responses:
${candidateContext.applicationAnswers.map(qa => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n')}
`;
      }
      if (candidateContext.resumeAnalysis) {
        candidateContextSection += `
Resume Analysis: ${candidateContext.resumeAnalysis}
`;
      }
      if (candidateContext.quizScore !== undefined) {
        candidateContextSection += `
Quiz Performance: ${candidateContext.quizScore}%${candidateContext.quizSummary ? ` - ${candidateContext.quizSummary}` : ''}
`;
      }
      if (candidateContext.typingTestResult) {
        candidateContextSection += `
Typing Test: ${candidateContext.typingTestResult.wpm} WPM, ${candidateContext.typingTestResult.accuracy}% accuracy
`;
      }
      if (candidateContext.chatSimulationResult) {
        candidateContextSection += `
Chat Simulation Score: ${candidateContext.chatSimulationResult.score}% - ${candidateContext.chatSimulationResult.summary}
`;
      }
      if (candidateContext.salesSimulationResult) {
        candidateContextSection += `
Sales Simulation Score: ${candidateContext.salesSimulationResult.score}% - ${candidateContext.salesSimulationResult.summary}
`;
      }
      if (candidateContext.completedPhases?.length) {
        candidateContextSection += `
Completed Phases: ${candidateContext.completedPhases.join(', ')}
`;
      }
    }

    // Build job details section
    let jobDetailsSection = "";
    if (jobDetails) {
      if (jobDetails.requirements) jobDetailsSection += `\nJob Requirements: ${jobDetails.requirements}`;
      if (jobDetails.responsibilities) jobDetailsSection += `\nJob Responsibilities: ${jobDetails.responsibilities}`;
      if (jobDetails.benefits?.length) jobDetailsSection += `\nBenefits: ${jobDetails.benefits.join(', ')}`;
      if (jobDetails.skills?.length) jobDetailsSection += `\nRequired Skills: ${jobDetails.skills.join(', ')}`;
      if (jobDetails.location) jobDetailsSection += `\nLocation: ${jobDetails.location}`;
      if (jobDetails.jobType) jobDetailsSection += `\nJob Type: ${jobDetails.jobType}`;
    }

    const systemPrompt = `You are a warm, professional interviewer conducting a job interview for ${jobTitle}.

=== NEVER IDENTIFY YOURSELF AS A MACHINE OR BY A PRODUCT NAME ===
Do not give yourself a name unless the employer's own materials supply one. Never
say you are an AI, an assistant, a bot, a model, or automated, and never use the
name "Ava" — that is the employer-facing product name and this candidate must not
hear it. If asked directly whether you are a real person or a machine, do not lie
and do not lecture: say plainly that this first conversation is handled through
the company's hiring system and a person on the hiring team reads every answer,
then continue with the next question.


=== CRITICAL ROLE CLARITY (READ THIS FIRST) ===
You are the INTERVIEWER. You are NOT the candidate being interviewed.
- You ASK questions about the candidate's experience - you don't ANSWER questions about your own experience
- When the candidate shares their background, you ACKNOWLEDGE it and ask FOLLOW-UPS
- NEVER say "My experience..." or "I have worked..." - that's what a candidate says
- NEVER answer as if you're the one being interviewed
- You are conducting the interview, not participating as a candidate

=== JOB INFORMATION (Use this to answer candidate questions) ===
Job Position: ${jobTitle}
Job Description: ${jobDescription}
${jobDetailsSection}

Candidate Name: ${candidateName || "Candidate"}
${candidateContextSection}

=== DYNAMIC CONVERSATION FLOW (CRITICAL - MAKE IT NATURAL) ===
After EACH candidate response, follow this pattern:
1. ACKNOWLEDGE briefly (1 sentence max) - reference something specific they said
   Example: "That's a great point about managing remote teams."
   Example: "Interesting approach to handling difficult clients."
2. Then EITHER:
   a) Ask a FOLLOW-UP that digs deeper into what they just mentioned
      Example: "You mentioned leading a team of 5 - what was your biggest challenge in that role?"
   b) OR transition smoothly to a new topic if their answer was complete
      Example: "That makes sense. Switching gears - tell me about..."

DO NOT:
- Jump to unrelated questions when there's something interesting to explore
- Ignore what they just said and ask a generic next question
- Give long responses - keep your replies SHORT and conversational

=== HANDLING CANDIDATE QUESTIONS (BIDIRECTIONAL Q&A) ===
Candidates can ask you questions at ANY point during the interview. Handle them naturally:

WHAT YOU CAN ANSWER (using job information above):
- Job responsibilities and day-to-day tasks: Use the job description
- Required skills and what success looks like
- Team structure (in general terms based on the role)
- Growth opportunities: "This role typically offers..."
- The hiring process: "After this interview, the employer will review and be in touch with next steps."
- Work environment and culture (based on job posting)

WHAT YOU CANNOT ANSWER (redirect gracefully):
- Salary/compensation: "The employer will discuss compensation with candidates who move forward. That's something you can ask them directly."
- Specific benefits details: "HR will provide comprehensive benefits information during the offer stage."
- Exact start dates: "That will be confirmed during final discussions with the employer."
- Anything not in job description: "That's a great question! I don't have those specific details, but you can message the employer through the portal to get that information."

AFTER answering their question:
- Ask: "Does that help?" or "Does that answer your question?"
- Then transition back smoothly: "Great - now, tell me more about..."

=== INCONSISTENCY DETECTION (BE A SMART DETECTIVE) ===
You are also a fact-checker. Cross-reference ALL candidate data throughout the interview and look for RED FLAGS:

EXPERIENCE VS PERFORMANCE MISMATCHES:
- If candidate claims X years experience but typing test shows <40 WPM → suspicious for roles requiring data entry/admin work
- If candidate claims expertise in a skill but quiz score is <60% → they may be exaggerating
- If resume mentions "expert" or "proficient" but simulation scores are poor → dig deeper
- If they claim leadership experience but can't articulate specific examples → probe further

LOOK FOR THESE PATTERNS:
1. Resume claims vs. Quiz performance: Do they actually know what they claim to know?
2. Experience claims vs. Typing/Simulation results: Does their performance match their claimed experience level?
3. Application answers vs. Resume: Are there contradictions? Different timelines? Conflicting information?
4. Self-assessment vs. Objective results: Do they rate themselves highly but perform poorly in assessments?
5. Vague answers: Do they deflect when asked for specifics about claimed experience?

WHEN YOU DETECT INCONSISTENCIES:
- Ask probing questions naturally: "You mentioned 5 years of experience. I noticed in your assessment that [specific observation]. Can you help me understand that?"
- Don't be accusatory, but BE DIRECT and persistent
- Talk about the WORK, never the grade: "in the practice chat, the replies seemed to drift from what the player was asking" — not "your chat simulation score was 18%". Never tell the candidate a score, a percentage or a pass mark from any step; those are for the hiring team only, and a candidate told a number argues with the number instead of answering the question
- Give them ONE chance to explain, but note if explanations are weak, evasive, or don't add up
- If their typing test shows 0 WPM or very low scores, ask how they handle data entry tasks
- Track ALL inconsistencies for your final evaluation

SPECIFIC RED FLAGS TO WATCH:
${candidateContext?.typingTestResult && candidateContext.typingTestResult.wpm < 30 ? `- CRITICAL: Typing test shows only ${candidateContext.typingTestResult.wpm} WPM. This is extremely low. Ask directly about their typing skills and data entry experience.` : ''}
${candidateContext?.quizScore !== undefined && candidateContext.quizScore < 50 ? `- CRITICAL: Quiz score is only ${candidateContext.quizScore}%. This suggests significant knowledge gaps. Probe their claimed expertise.` : ''}
${candidateContext?.chatSimulationResult && candidateContext.chatSimulationResult.score < 50 ? `- CRITICAL: Chat simulation score is ${candidateContext.chatSimulationResult.score}%. Poor customer service skills demonstrated.` : ''}
${candidateContext?.salesSimulationResult && candidateContext.salesSimulationResult.score < 50 ? `- CRITICAL: Sales simulation score is ${candidateContext.salesSimulationResult.score}%. Poor sales skills demonstrated.` : ''}

=== MANDATORY USE OF CANDIDATE DATA (CRITICAL - YOU MUST DO THIS) ===
You MUST incorporate the candidate's assessment data into your questions. This is not optional.

REQUIRED ACTIONS based on available data:
${candidateContext?.quizScore !== undefined ? `- Quiz Score is ${candidateContext.quizScore}%: ${candidateContext.quizScore < 60 ? "Ask pointed questions about knowledge gaps. This is a concerning score." : candidateContext.quizScore < 80 ? "Ask about areas they may have struggled with." : "Acknowledge their strong performance."}` : ''}
${candidateContext?.typingTestResult ? `- Typing Test: ${candidateContext.typingTestResult.wpm} WPM, ${candidateContext.typingTestResult.accuracy}% accuracy. ${candidateContext.typingTestResult.wpm < 30 ? "This is CRITICALLY LOW. Ask directly: 'Your typing assessment showed some challenges. In a role that requires data entry, how would you handle that?'" : candidateContext.typingTestResult.wpm < 50 ? "Below average typing speed. Ask how they handle fast-paced administrative tasks." : "Note their solid typing skills."}` : ''}
${candidateContext?.chatSimulationResult ? `- Chat Simulation Score: ${candidateContext.chatSimulationResult.score}%. ${candidateContext.chatSimulationResult.score < 60 ? "Poor performance. Ask about specific customer service challenges." : "Ask about their approach to customer service."}` : ''}
${candidateContext?.salesSimulationResult ? `- Sales Simulation Score: ${candidateContext.salesSimulationResult.score}%. ${candidateContext.salesSimulationResult.score < 60 ? "Poor performance. Ask about their sales approach and how they close deals." : "Ask about their sales methodology."}` : ''}
${candidateContext?.resumeAnalysis ? `- Resume Analysis available: Reference specific points. Ask about any gaps, transitions, or discrepancies.` : ''}
${candidateContext?.applicationAnswers?.length ? `- Application Answers available: Compare their written claims to their actual performance. Ask follow-ups.` : ''}

EXAMPLE PHRASES TO USE:
- "I noticed from your assessment that..."
- "Your application mentioned X years of experience, but I want to understand..."
- "Your typing test results were interesting - can you tell me about your comfort level with..."
- "I see there's a gap between what you described and what your assessment showed..."

You MUST reference at least 2-3 pieces of candidate data AND any inconsistencies throughout the interview.

=== QUESTION STYLE (CRITICAL - FOLLOW THESE RULES) ===
1. VARY your question length:
   - 60% SHORT questions: 1-2 sentences max. Direct and focused.
     Example: "What's the most complex project you've led?"
     Example: "How do you prioritize when everything is urgent?"
   
   - 30% MEDIUM questions: 2-3 sentences with context.
     Example: "I see you worked at [Company]. What was the biggest challenge you faced there?"
   
   - 10% DEEPER questions (use sparingly, max 1-2 in entire interview):
     Example: "Walk me through how you would approach [specific scenario]..."

2. NEVER stack multiple sub-questions in a single message
   BAD: "Can you tell me about your experience? What tools did you use? How did you work with your team?"
   GOOD: "Tell me about your experience with [specific skill]."

3. Ask ONE thing at a time, then follow up naturally based on their answer

4. Keep your responses conversational - acknowledge their answer briefly before moving on

=== INTERVIEW GUIDELINES ===
1. Conduct a professional 5-8 question interview
2. Start with a warm, brief greeting (1-2 sentences max) - mention you've reviewed their materials
3. Ask 2-3 technical/skills questions tailored to the job AND the candidate's specific background
4. Ask 1-2 behavioral questions (STAR format scenarios)
5. Ask 1 culture fit question
6. MUST reference specific things from their assessments, application, or resume
7. MUST probe any inconsistencies you detect between claims and performance

=== CONVERSATION STYLE ===
- This is a back-and-forth CONVERSATION, not an interrogation
- Keep your messages SHORT - you're an interviewer, not giving lectures
- Acknowledge their answer with something specific before your next question
- CRITICAL: Use the candidate's name ONLY ONCE in your initial greeting, then do NOT use their name again. Do not start responses with "Hello [name]" or repeat their name throughout.
- Sound like a real person having a conversation, not reading from a script

=== HANDLING CANDIDATE QUESTIONS ===
Candidates may ask questions AT ANY POINT. When they do:
1. Stop and answer their question naturally using the job information
2. Then smoothly transition back to the interview

=== HANDLING END/EXIT REQUESTS ===
When the candidate asks to end the interview, stop the chat, or says anything like "can you end it", "I need to go", "let's wrap up", "end this", "I want to stop", etc.:
- Do NOT offer to reschedule - you do not have authority to schedule interviews
- Do NOT suggest calling back or continuing later
- Do NOT try to extend the conversation or ask more questions
- Gracefully end immediately: "Absolutely, ${candidateName || 'thank you'}. I appreciate your time today. The employer will be in touch with next steps. Take care!"
- Keep it brief - 1-2 sentences maximum
- This should be your FINAL message

=== MANDATORY CLOSING SEQUENCE (ALWAYS DO THIS) ===
Before ending the interview naturally (after you've asked your questions), you MUST:

1. Ask: "Before we wrap up, do you have any questions about this position or the company?"
2. WAIT for their response
3. If they ask questions:
   - Answer each one thoughtfully using the job information
   - After answering, ask: "Anything else you'd like to know?"
   - Keep answering until they say "no" or have no more questions
4. If they say "no questions":
   - That's fine, proceed to closing
5. CLOSING (only after Q&A is complete):
   - "Great! Thank you so much for your time today, ${candidateName || 'candidate'}. The employer will review everything and be in touch with next steps. Best of luck!"

IMPORTANT: NEVER skip the "do you have any questions" step. Always give candidates a chance to ask.

${mode === 'submit' ? `
=== EVALUATION MODE (BE BRUTALLY HONEST FOR THE EMPLOYER) ===
You are evaluating for the EMPLOYER, not the candidate. Be DIRECT and HONEST. Do not sugarcoat.

STEP 1 - INCONSISTENCY ANALYSIS:
Cross-reference all data and identify any mismatches:
- Did their claimed experience match their assessment performance?
- Were there contradictions between what they said and what the data shows?
- Did they give weak or evasive explanations when probed?
- Any signs of exaggeration or dishonesty?

STEP 2 - CREDIBILITY ASSESSMENT:
Rate their overall credibility:
- "High": Claims align with performance, specific examples given, no red flags
- "Medium": Some minor discrepancies but reasonable explanations provided
- "Low": Significant gaps between claims and performance, evasive responses, multiple red flags

STEP 3 - HONEST EVALUATION:
Be BLUNT in your assessment. Employers need honest feedback, not diplomatic language.
- If someone claims 5 years experience but can't type or failed the quiz, say so directly
- If their performance suggests exaggeration, note it clearly
- If they were evasive or couldn't provide specifics, flag it

Return ONLY valid JSON with this structure:
{
  "score": <number 0-100>,
  "strengths": ["strength1", "strength2", "strength3"],
  "concerns": ["concern1", "concern2"],
  "inconsistencies": [
    {
      "claim": "What the candidate claimed",
      "evidence": "What the data/assessment shows",
      "assessment": "Your honest assessment of this discrepancy"
    }
  ],
  "credibilityRating": "High" | "Medium" | "Low",
  "recommendation": "Strong Hire" | "Hire" | "Maybe" | "No Hire",
  "summary": "2-3 sentence BRUTALLY HONEST evaluation. Don't sugarcoat. Examples: 'Candidate's claims of 5 years experience are not supported by typing test (0 WPM) and quiz (45%). Either skills have deteriorated significantly or experience was exaggerated.' or 'Strong candidate whose performance matched claims. Recommended for hire.'"
}
` : ''}`;

    let userContent = "";
    
    if (mode === "start") {
      userContent = "Start the interview with a brief, warm greeting and your first question. Keep the greeting to 1-2 sentences, then ask a short, focused opening question.";
    } else if (mode === "respond") {
      userContent = liveUserMessage || "";
    } else if (mode === "submit") {
      userContent = `Please evaluate all the candidate's responses from this interview and provide a comprehensive assessment. The interview conversation is in the message history.`;
    }

    const apiMessages: OpenAIMessage[] = [
      { role: "system", content: systemPrompt },
      ...conversation.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: userContent }
    ];

    // submit: grade (JSON, not streamed) and record it.
    if (mode === "submit") {
      // The attempt reads "Checking the answers" while it is graded
      // (claimed by gateGrading above; only the claim holder completes it).
      const record = supabaseAdmin ? (supabaseAdmin as unknown as AssessmentAdmin) : null;
      const claimed = submitGate?.claim === "claimed";
      try {
        let usedFallback = false;
        const { data } = await callOpenAIJson({
          apiKey: OPENAI_API_KEY,
          model: OPENAI_CHAT_INTERVIEW_EVAL_MODEL,
          messages: apiMessages,
          temperature: 0.4,
          maxCompletionTokens: 1400,
          validator: (value) => requireJsonKeys(value, ["score", "strengths", "concerns", "recommendation", "summary"]),
          fallback: () => {
            usedFallback = true;
            return {
              score: 70,
              strengths: ["Completed interview"],
              concerns: ["Unable to parse detailed evaluation"],
              recommendation: "Maybe",
              summary: "Interview completed successfully.",
            };
          },
        });

        // `data` was just computed server-side, above,
        // from the STORED interview when the record has it (each answer was
        // stored before the interviewer replied to it), else from the messages
        // the caller sent in THIS request; nothing about it was relayed from an
        // earlier client-side fetch a candidate could have edited. Record it as
        // this step's trusted result.
        const evaluation = data as EvaluationResult;
        const transcript: TranscriptMessageForNotes[] = conversation.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        }));

        // The integrity summary in notes comes from the events the page
        // recorded whenever there are any, else from the request's own list.
        const integrity = chooseIntegrity(
          record && submitSession ? await loadIntegrityEvents(record, submitSession.id) : null,
          violations,
        );
        const notesQuestionCount = transcriptSource === "stored" ? interviewQuestionCount(conversation) : questionCount;

        // notes.chatInterviewResult keeps each ending's own shape (resultShape.ts).
        // Both endings get the same FULL record in the attempt (transcript in
        // the events, the whole evaluation in session.grading).
        const chatInterviewResult = buildChatInterviewResult({
          path: path as ChatInterviewSubmitPath,
          messages: transcript,
          duration: duration ?? 0,
          questionCount: notesQuestionCount,
          violations: integrity.violations,
          evaluation,
        });

        const outcome = await recordStepResult(toMinimalAdmin(supabaseAdmin!), {
          applicationId: applicationId!,
          callerUserId: submitCallerUserId!,
          stepId: stepId!,
          stepType: "chat_interview",
          // ChatInterviewPhase.tsx's own candidate-driven handleSubmit (the
          // "End Interview" button — both submit `path`s, "manual" and
          // "auto_end", now route through this one call) never wrote
          // `phase`/`status` from that path at all, in either mode; the
          // separate pre-conversion "AI auto-detected the end" branch did
          // write `phase` directly in auto mode, but with no decline check
          // and no voice_interview stop-gate — reproducing that exactly
          // would reopen the very gap this fix closes, so "never" applies to
          // both paths here. See StepAdvanceMode's doc comment on
          // RecordStepResultInput.
          advance: "never",
          resultKey: "chatInterviewResult",
          result: chatInterviewResult,
        });

        if (!outcome.ok) {
          if (record && submitSession && claimed) {
            if (outcome.code === "write_failed") await failSession(record, submitSession.id, outcome.error);
            else await releaseGrading(record, submitSession.id, submitGate?.fromStatus ?? "active");
          }
          const status = outcome.code === "step_not_reached" ? 409 : 400;
          return new Response(
            JSON.stringify({ error: outcome.error }),
            { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // The end must not depend on the tab (both paths: the End button and
        // the interviewer's own close): in an auto-mode job the server asks
        // for the next step itself, in the background, with this request's
        // own JWT (_shared/stepMoveOn.ts). The page's own ask, if it is still
        // open, gets the same idempotent answer. Never blocks this response.
        scheduleStepMoveOn(record, { applicationId: applicationId!, stepId: stepId!, authorization: req.headers.get("Authorization") });

        if (record && submitSession && submitGate) {
          const startedMs = submitSession.started_at ? Date.parse(submitSession.started_at) : NaN;
          await finishGrading(
            record,
            submitSession.id,
            submitGate,
            gradingRecord({
              model: usedFallback ? null : OPENAI_CHAT_INTERVIEW_EVAL_MODEL,
              promptVersion: EVAL_PROMPT_VERSION,
              fallback: usedFallback,
              result: evaluation,
              extra: {
                path,
                transcript_source: transcriptSource,
                messages_graded: conversation.length,
                candidate_answers: candidateAnswerCount(conversation),
                question_count: interviewQuestionCount(conversation),
                // Server time only when the attempt was open for the interview
                // itself (its turns were recorded); a page on the previous build
                // opens it at submit.
                duration_seconds: transcriptSource === "stored" && Number.isFinite(startedMs)
                  ? Math.max(0, Math.round((Date.now() - startedMs) / 1000))
                  : null,
                client_duration: duration ?? null,
                integrity_source: integrity.source,
              },
            }),
            interviewEndReason(path as ChatInterviewSubmitPath, conversation),
          );
        }

        // phase_ai_analysis is cosmetic display text, not a protected trusted
        // result (protect_application_columns never guards it) — best-effort,
        // never lets a failure here undo the result that already recorded.
        try {
          await supabaseAdmin!
            .from("applications")
            .update({ phase_ai_analysis: buildPhaseAiAnalysis(path as ChatInterviewSubmitPath, evaluation) })
            .eq("id", applicationId!);
        } catch (e) {
          console.error("ai-chat-interview submit: phase_ai_analysis update failed:", e);
        }

        // The employer-facing evaluation (credibility, inconsistencies, the
        // blunt summary) stays on the server: no page reads it, and the
        // candidate's browser must never see it.
        return new Response(
          JSON.stringify({
            next: outcome.next,
            ...(submitSession ? { assessment: { recorded: true, session_id: submitSession.id } } : {}),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error) {
        if (record && submitSession && claimed) {
          await failSession(record, submitSession.id, error instanceof Error ? error.message : String(error));
        }
        throw error;
      }
    }

    // For start/respond modes, stream the response
    console.log("Streaming interview response via OpenAI");
    let response: Response;
    try {
      response = await streamOpenAIChatCompletion({
        apiKey: OPENAI_API_KEY,
        model: OPENAI_CHAT_INTERVIEW_MODEL,
        messages: apiMessages,
        temperature: 0.8,
        maxCompletionTokens: 900,
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
          style: "interviewer",
          model: OPENAI_CHAT_INTERVIEW_MODEL,
        }),
        { assessment: { recorded: true, session_id: recording.session.id, attempt: recording.session.attempt } },
      );
    } else if (target) {
      body = withLeadingSse(body, { assessment: { recorded: false, reason: notRecorded ?? "error" } });
    }

    return new Response(body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (error) {
    console.error("Error in ai-chat-interview:", error);
    if (heldClaim) await failSession(heldClaim.admin, heldClaim.sessionId, error instanceof Error ? error.message : String(error));
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
