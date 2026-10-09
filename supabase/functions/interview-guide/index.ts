/**
 * interview-guide: writes the personal part of an applicant's interview guide
 * for the hiring team (docs/INTERVIEWS.md, "The interview guide").
 *
 *   POST { applicationId }  ->  { guide, generatedAt }
 *
 * A guide is a plan every applicant to the job gets (written by hand,
 * _shared/interviewGuide.ts, on the page with no call at all) plus this: a
 * few lines on who the applicant is on paper, three or four questions only
 * this person should be asked, and facts to confirm. It is written from the
 * applicant's own record, which this function reads itself: the request names
 * an application and nothing else, so nothing a browser sends can steer what
 * the guide says.
 *
 * Who may ask: the job's owner, or an active team member scoped to that job,
 * decided by the same SECURITY DEFINER functions the applications RLS uses
 * (is_job_owner / is_active_team_member_for_job), called with the CALLER's
 * own JWT so the functions' `p_user_id = auth.uid()` check holds. Any RPC
 * error denies (isScopedTeamMemberFromRpc). An application that does not
 * exist and one the caller may not see read the same: 404.
 *
 * Where it goes: public.interview_guides, one row per application, written
 * here with the service role. Only the job's hiring team can read that table.
 * The applicant can read their own applications row, so the guide is never
 * put there: they must not see what they will be asked.
 *
 * When the AI service refuses (out of credit, rate limited, down) the answer
 * is the shared 503 "ai_unavailable" and nothing is stored: the page keeps
 * showing the plan, and any guide written earlier stays as it was.
 *
 * verify_jwt = true (config.toml), plus auth.getUser() here.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { aiUnavailableResponse, callOpenAIJson, isAiUnavailable, requireJsonKeys } from "../_shared/openai.ts";
import { inferJobFamily } from "../_shared/autopilot.ts";
import { guardAuthenticatedAiCall } from "../_shared/rateLimit.ts";
import { isScopedTeamMemberFromRpc } from "../_shared/teamMemberRpcAccess.ts";
import { interviewJobFrom } from "../ai-chat-interview/interviewContext.ts";
import {
  buildGuideMessages,
  enoughToWriteFrom,
  guideFingerprint,
  GUIDE_PROMPT_VERSION,
  GUIDE_REQUIRED_KEYS,
  personalGuideFrom,
  type GuideRecord,
  type GuideTurn,
} from "./guideMaterial.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_MODEL = Deno.env.get("OPENAI_INTERVIEW_GUIDE_MODEL") || Deno.env.get("OPENAI_ANALYSIS_MODEL") || "gpt-5.6-terra";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A person preparing interviews writes a handful an hour; this only stops a loop. */
const GUIDES_PER_HOUR = 40;
const JOB_COLUMNS =
  "id, employer_id, title, description, requirements, responsibilities, benefits, skills_required, location, job_type, experience_level, required_wpm, salary_min, salary_max, salary_currency, salary_period, quiz_questions";

// SupabaseClient's own declared defaults (Database = any) are what createClient(url, key) returns here.
type Admin = SupabaseClient;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** applications.notes is stored as text; anything that is not a JSON object reads as empty. */
function parseNotes(notes: unknown): Record<string, unknown> {
  if (notes && typeof notes === "object" && !Array.isArray(notes)) return notes as Record<string, unknown>;
  if (typeof notes !== "string" || !notes.trim()) return {};
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * The applicant's latest attempt at one kind of step, as a conversation,
 * oldest first. An attempt we closed ourselves (superseded: an outage, a
 * reset by staff) is never the one read. Empty when there is none.
 */
async function latestConversation(admin: Admin, applicationId: string, stepType: string): Promise<GuideTurn[]> {
  const { data: session } = await admin
    .from("assessment_sessions")
    .select("id")
    .eq("application_id", applicationId)
    .eq("step_type", stepType)
    .neq("status", "superseded")
    .order("attempt", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sessionId = (session as { id?: string } | null)?.id;
  if (!sessionId) return [];
  const { data: events } = await admin
    .from("assessment_events")
    .select("kind, content, seq")
    .eq("session_id", sessionId)
    .in("kind", ["assistant_turn", "candidate_turn"])
    .order("seq", { ascending: true })
    .limit(240);
  const turns: GuideTurn[] = [];
  for (const event of (events as Array<{ kind: string; content: string | null }> | null) ?? []) {
    if (typeof event.content !== "string" || !event.content.trim()) continue;
    turns.push({ role: event.kind === "candidate_turn" ? "user" : "assistant", content: event.content });
  }
  return turns;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error("[interview-guide] Supabase env vars missing");
      return jsonResponse({ error: "Server not configured" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let body: { applicationId?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }
    const applicationId = body?.applicationId;
    if (typeof applicationId !== "string" || !UUID_RE.test(applicationId)) {
      return jsonResponse({ error: "applicationId is required" }, 400);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: application, error: appError } = await admin
      .from("applications")
      .select(`id, job_id, notes, jobs(${JOB_COLUMNS})`)
      .eq("id", applicationId)
      .maybeSingle();
    const jobRow = (application as { jobs?: Record<string, unknown> | null } | null)?.jobs ?? null;
    const jobId = (application as { job_id?: string } | null)?.job_id ?? null;

    // Staff on THIS job only, by the functions the applications RLS uses,
    // called as the caller. An RPC error denies. Not found and not allowed
    // read the same, so an id says nothing about whether it exists.
    let allowed = false;
    if (!appError && application && jobRow && jobId) {
      const [ownerRpc, teamMemberRpc] = await Promise.all([
        supabaseUserClient.rpc("is_job_owner", { p_job_id: jobId, p_user_id: user.id }),
        supabaseUserClient.rpc("is_active_team_member_for_job", { p_job_id: jobId, p_user_id: user.id }),
      ]);
      if (ownerRpc.error) console.error("[interview-guide] is_job_owner RPC error:", ownerRpc.error);
      if (teamMemberRpc.error) console.error("[interview-guide] is_active_team_member_for_job RPC error:", teamMemberRpc.error);
      // The same fail-closed mapping for both: only `true` without an error grants.
      allowed = isScopedTeamMemberFromRpc(ownerRpc) || isScopedTeamMemberFromRpc(teamMemberRpc);
    }
    if (!allowed || !application || !jobRow || !jobId) {
      console.warn("[interview-guide] refused", { requesterId: user.id, applicationId });
      return jsonResponse({ error: "not_found", message: "That applicant could not be found." }, 404);
    }

    // Counted only once we know it is their own applicant: a refused request
    // costs nothing and is not held against anyone.
    const limited = await guardAuthenticatedAiCall("interview-guide", user.id, corsHeaders, GUIDES_PER_HOUR, 3600);
    if (limited) return limited;

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.error("[interview-guide] OPENAI_API_KEY is not set");
      return aiUnavailableResponse(corsHeaders);
    }

    const job = interviewJobFrom(jobRow);
    if (!job) return jsonResponse({ error: "not_found", message: "That applicant could not be found." }, 404);
    const [interview, practice, planRow] = await Promise.all([
      latestConversation(admin, applicationId, "chat_interview"),
      latestConversation(admin, applicationId, "chat_simulation"),
      // The job's own changes to the questions everyone is asked. A table
      // that is not there, or a failed read, is "no changes": the plan as
      // written is still a true list of questions not to repeat.
      admin.from("interview_plans").select("edits").eq("job_id", jobId).maybeSingle(),
    ]);
    const record: GuideRecord = {
      job,
      family: inferJobFamily(job.title, job.description),
      notes: parseNotes((application as { notes?: unknown }).notes),
      interview,
      practiceLines: practice.filter((t) => t.role === "user").map((t) => t.content),
      planEdits: (planRow.data as { edits?: unknown } | null)?.edits ?? null,
    };
    if (!enoughToWriteFrom(record)) {
      return jsonResponse({ error: "nothing_yet", message: "They have not sent their application yet, so there is nothing to write from." }, 409);
    }

    let written: unknown;
    try {
      const { data } = await callOpenAIJson<Record<string, unknown>>({
        apiKey: OPENAI_API_KEY,
        model: OPENAI_MODEL,
        messages: buildGuideMessages(record),
        maxCompletionTokens: 2200,
        validator: (value) => requireJsonKeys(value, GUIDE_REQUIRED_KEYS),
        // The service refusing is not a guide: say so, store nothing.
        throwWhenUnavailable: true,
      });
      written = data;
    } catch (error) {
      if (isAiUnavailable(error)) {
        console.warn("[interview-guide] AI service unavailable:", error.reason);
        return aiUnavailableResponse(corsHeaders);
      }
      console.error("[interview-guide] the writer's answer could not be used:", error instanceof Error ? error.message : error);
      return jsonResponse({ error: "could_not_write", message: "The questions could not be written just now. Please try again." }, 502);
    }

    const guide = personalGuideFrom(written, record);
    if (!guide) {
      console.error("[interview-guide] the writer's answer held too few usable questions", { applicationId });
      return jsonResponse({ error: "could_not_write", message: "The questions could not be written just now. Please try again." }, 502);
    }

    const generatedAt = new Date().toISOString();
    const { error: saveError } = await admin
      .from("interview_guides")
      .upsert(
        {
          application_id: applicationId,
          job_id: jobId,
          guide,
          fingerprint: guideFingerprint(record),
          prompt_version: GUIDE_PROMPT_VERSION,
          model: OPENAI_MODEL,
          generated_by: user.id,
          generated_at: generatedAt,
        },
        { onConflict: "application_id" },
      );
    if (saveError) {
      // Written but not kept: still worth showing, and the page says it was not saved.
      console.error("[interview-guide] could not save the guide:", saveError);
      return jsonResponse({ guide, generatedAt, saved: false });
    }

    console.log("[interview-guide] written", { applicationId, questions: guide.questions.length, quoted: guide.questions.filter((q) => q.quote).length });
    return jsonResponse({ guide, generatedAt, saved: true });
  } catch (error) {
    console.error("[interview-guide] Unhandled error:", error);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
