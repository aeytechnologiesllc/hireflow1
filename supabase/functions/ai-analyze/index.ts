import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  aiUnavailableResponse,
  callOpenAIChat,
  isAiUnavailable,
  parseJsonContent,
  requireNestedJsonPaths,
  type OpenAIMessage,
} from "../_shared/openai.ts";
import { guardAuthenticatedAiCall } from "../_shared/rateLimit.ts";
import { isAiAnalyzeCallAuthorized, type JobAccessFacts } from "../_shared/aiAccess.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_ANALYSIS_MODEL") || "gpt-5.6-terra";

// One time budget for every OpenAI call a request makes (2026-10-05).
//
// A full analysis normally takes 37-47 s. The old retries were stacked: a
// 90 s timeout x 3 HTTP tries x 2 JSON tries, then a narrative fallback with
// 3 more, then all of that again text-only after a failed resume-image read —
// well past 20 minutes in the worst case. Supabase answers a function that
// has not responded within 150 s with a 504 (the request idle timeout), and
// trigger-ava-analysis now calls this from EdgeRuntime.waitUntil, which is cut
// off at the 400 s wall clock on Pro. So every attempt below draws on one
// deadline measured from the start of the request: no attempt runs past it,
// and none starts with too little of it left to finish.
const ANALYSIS_DEADLINE_MS = 135_000;
/** The longest any single OpenAI call may run. */
const MAX_CALL_MS = 90_000;
/** Below this much time left, starting another call is pointless. */
const MIN_CALL_MS = 20_000;
/**
 * Kept back from the structured attempts for the narrative fallback, so a
 * structured call that hangs can never use up the time the fallback needs
 * (a call normally takes 35-45 s). The structured attempts therefore end by
 * 80 s into the request: a hung first attempt is cut off there, a second
 * structured attempt only starts if one failed fast, and the narrative then
 * has at least 55 s. Worst case: 80 s + 55 s = the 135 s deadline.
 */
const NARRATIVE_RESERVE_MS = 55_000;
const STRUCTURED_ATTEMPTS = 2;
const NARRATIVE_ATTEMPTS = 2;

// When the AI service refuses (2026-10-07, _shared/openai.ts
// AiUnavailableError): out of credit stops at once; a rate limit or a 5xx
// may use this step's remaining attempts. Either way it never falls back to
// the narrative or text-only read (a timeout aside: refusesFallback, below):
// a degraded read made during an outage
// ("could not read the application", a neutral score) was saved as the
// applicant's score and then reused for unchanged evidence. The request
// answers 503 `ai_unavailable` instead, trigger-ava-analysis saves nothing,
// and the next step (or a forced re-run) scores them properly.

/**
 * A refusal that must not be papered over with a lesser read: out of credit,
 * rate limited, the provider down, refusing us outright or unreachable.
 *
 * A timeout is left out on purpose. The structured read is the slow one, and
 * the narrative read exists for exactly the case where it runs out of time
 * (NARRATIVE_RESERVE_MS above); a picture-heavy read that times out is what
 * the text-only read is for. Both worked that way before a timeout was
 * classed as a refusal (_shared/openai.ts, provider_timeout), and a model
 * that is merely slow must not start leaving applicants unscored. If the
 * provider really is hanging, the lesser read times out too, and THAT
 * refusal is the one that answers 503 with nothing saved.
 */
function refusesFallback(error: unknown): boolean {
  return isAiUnavailable(error) && error.reason !== "provider_timeout";
}

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `call` up to `attempts` times, each with a timeout no longer than
 * MAX_CALL_MS or the time left before `deadline`, and stops early when less
 * than MIN_CALL_MS is left. Throws the last error (or an out-of-time error).
 */
async function withinDeadline<T>(
  label: string,
  deadline: number,
  attempts: number,
  call: (timeoutMs: number) => Promise<T>,
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_CALL_MS) {
      console.warn(`[ai-analyze] ${label}: ${Math.max(0, Math.round(remaining / 1000))} s left, not starting attempt ${attempt}`);
      break;
    }
    try {
      return await call(Math.min(MAX_CALL_MS, remaining));
    } catch (error) {
      lastError = error;
      console.warn(`[ai-analyze] ${label} attempt ${attempt}/${attempts} failed:`, error);
      if (isAiUnavailable(error) && error.reason === "credit_exhausted") break;
      if (attempt < attempts && deadline - Date.now() > MIN_CALL_MS + 1000) await pause(1000);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`[ai-analyze] ${label}: ran out of the ${ANALYSIS_DEADLINE_MS / 1000} s analysis budget`);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalyzeRequest {
  type: "application" | "job-bias" | "interview" | "phase" | "resume";
  content: string;
  context?: Record<string, unknown>;
  resumeUrl?: string;
  resumeText?: string;
  resumeImage?: string; // Base64-encoded image for vision analysis
  resumeImages?: Array<{ base64: string; mimeType?: string; page?: number; source?: string }>;
  applicantName?: string; // For cross-reference verification
  applicationAnswers?: Array<{ question: string; answer: string }>; // Structured answers
  coverLetter?: string; // Separate cover letter for cross-reference
  // Ownership anchors, required per `type` — see resolveJobAccessFacts()
  // below and the matrix documented in ../_shared/aiAccess.ts. Never used
  // for anything except the server-side ownership lookup; the analysis
  // itself still only sees `content`/`context`/the resume fields above.
  applicationId?: string;
  jobId?: string;
}

interface StructuredScore {
  overallScore: number;
  directMatchScore: number;
  transferableFitScore: number;
  learningSignalScore: number;
  writingQualityScore: number;
  attentionToDetailScore: number;
  authenticityScore: number;
  specificityScore: number;
  /**
   * Team-lead jobs only (context.job_family === "team_lead"): whether the
   * applicant has actually led a team, and has handled a sudden change.
   * Absent for every other job, and null when the model left one out, so
   * computeJudgmentScore uses its neutral default rather than a fake 0.
   */
  leadershipEvidenceScore?: number | null;
  adaptabilityEvidenceScore?: number | null;
  hardRequirementConflicts: string[];
  /**
   * Where each conflict came from, index for index with
   * hardRequirementConflicts (2026-10-06, second pass): "application",
   * "resume", "interview" (something the candidate wrote or said), or
   * "test:<name>" for a test's own measured result, which the scorer never
   * counts as a conflict (it already is that test's score). null when the
   * model gave no usable source. Built here, by the sanitizer, so the two
   * arrays always line up.
   */
  hardRequirementConflictSources?: Array<string | null>;
  transferableEvidence: string[];
  writingIssues: string[];
  personalityTraits: string[];
  personalitySummary: string;
  confidence: number;
  summary: string;
}

interface StructuredAnalyzeResponse {
  analysis: string;
  structuredScore: StructuredScore;
}

function clampScore(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function sanitizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

const CONFLICT_SOURCE_TAG = /^\[\s*(application|resume|interview|test(?:\s*:\s*[\w -]+)?)\s*\]\s*/i;

/** "application" | "resume" | "interview" | "test:<name>", or null. */
function normalizeConflictSource(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const source = value.trim().toLowerCase();
  if (source === "application" || source === "resume" || source === "interview") return source;
  if (/^test\b/.test(source)) {
    const name = source.replace(/^test\s*:?\s*/, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return name ? `test:${name}` : "test";
  }
  return null;
}

/**
 * The judge's conflicts as text plus where each came from. It is asked for
 * { "text", "source" } objects; a plain string (an older reply) is kept as
 * text with no source, and a leading "[source]" tag on a string is read as
 * its source. At most 6, like every other list here.
 */
function sanitizeConflicts(value: unknown): { texts: string[]; sources: Array<string | null> } {
  const texts: string[] = [];
  const sources: Array<string | null> = [];
  if (!Array.isArray(value)) return { texts, sources };
  for (const entry of value) {
    let text = "";
    let source: string | null = null;
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const record = entry as Record<string, unknown>;
      text = String(record.text ?? record.conflict ?? "").trim();
      source = normalizeConflictSource(record.source);
    } else {
      text = String(entry || "").trim();
      const tag = CONFLICT_SOURCE_TAG.exec(text);
      if (tag) {
        source = normalizeConflictSource(tag[1]);
        text = text.slice(tag[0].length).trim();
      }
    }
    if (!text || texts.includes(text)) continue;
    texts.push(text);
    sources.push(source);
    if (texts.length >= 6) break;
  }
  return { texts, sources };
}

/** 0-100 when the model returned a number, else null (never a fake 0). */
function optionalScore(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function sanitizeStructuredScore(value: StructuredScore | null | undefined, options: { teamLead?: boolean } = {}): StructuredScore | null {
  if (!value) return null;
  const conflicts = sanitizeConflicts((value as { hardRequirementConflicts?: unknown }).hardRequirementConflicts);

  return {
    ...(options.teamLead
      ? {
          leadershipEvidenceScore: optionalScore(value.leadershipEvidenceScore),
          adaptabilityEvidenceScore: optionalScore(value.adaptabilityEvidenceScore),
        }
      : {}),
    overallScore: clampScore(value.overallScore, 0),
    directMatchScore: clampScore(value.directMatchScore, 0),
    transferableFitScore: clampScore(value.transferableFitScore, 0),
    learningSignalScore: clampScore(value.learningSignalScore, 0),
    writingQualityScore: clampScore(value.writingQualityScore, 70),
    attentionToDetailScore: clampScore(value.attentionToDetailScore, 70),
    authenticityScore: clampScore(value.authenticityScore, 80),
    specificityScore: clampScore(value.specificityScore, 50),
    hardRequirementConflicts: conflicts.texts,
    hardRequirementConflictSources: conflicts.sources,
    transferableEvidence: sanitizeStringArray(value.transferableEvidence),
    writingIssues: sanitizeStringArray(value.writingIssues),
    personalityTraits: sanitizeStringArray(value.personalityTraits),
    personalitySummary: String(value.personalitySummary || "").trim(),
    confidence: clampScore(value.confidence, 0),
    summary: String(value.summary || "").trim(),
  };
}

/**
 * The two sub-scores a team-lead job adds (trigger-ava-analysis sends
 * context.job_family = "team_lead"). No other job is asked for them, and no
 * other job's score reads them (computeJudgmentScore weighs them for
 * team_lead only).
 */
const TEAM_LEAD_SCORE_RULES = `
- TEAM-LEAD JOB: every structuredScore sub-score rates the APPLICATION FORM and any resume only. The tests (skills check, typing test, chat practice, written or voice interview) are scored separately by the system: no test result may raise or lower any sub-score here, or the same result is counted twice. Describe the tests in the narrative's PHASE PERFORMANCE SUMMARY only.
- leadershipEvidenceScore (team-lead role): how well the application and any resume show the person has ACTUALLY led, coached or trained a team. Read their answer about a team they led together with the resume. High needs all three: how many people, for how long, and one concrete problem they fixed as the lead (with what they did and what changed). Never led, coached or trained a team = below 30, however well written. A vague claim with no team size, no time span or no example ("I have led many teams", "I always improved every metric") = below 50. Buddy-training or covering for a lead with specifics = 40-60. Picked answers such as "More than 2 years" of leading or "9 or more people" are claims: they count only as far as the written answer about the team they led backs them with a team size, a time span and an example.
- adaptabilityEvidenceScore (team-lead role): how well the application shows the person handled a sudden change in rules, tools or way of working. Read their answer about a time things changed suddenly. High needs: what changed, what they did themselves (learned it first, wrote the new answer, practised), and how they got others to switch (a huddle, a guide, checking the next chats, pairing someone). Generic statements ("I always adapt quickly", "I keep a positive attitude") with no event = below 40. No answer about a change = below 30.`;

function getStructuredResponseInstruction(type: AnalyzeRequest["type"], options: { teamLead?: boolean } = {}) {
  if (type !== "resume" && type !== "application") {
    return null;
  }

  const teamLeadFields = options.teamLead
    ? `
    "leadershipEvidenceScore": 0,
    "adaptabilityEvidenceScore": 0,`
    : "";

  return `Return ONLY valid JSON with this exact shape:
{
  "analysis": "<the full narrative analysis report in the exact required format>",
  "structuredScore": {
    "overallScore": 0,
    "directMatchScore": 0,
    "transferableFitScore": 0,
    "learningSignalScore": 0,
    "writingQualityScore": 0,
    "attentionToDetailScore": 0,
    "authenticityScore": 0,
    "specificityScore": 0,${teamLeadFields}
    "hardRequirementConflicts": [{ "text": "...", "source": "application" }],
    "transferableEvidence": ["..."],
    "writingIssues": ["..."],
    "personalityTraits": ["..."],
    "personalitySummary": "...",
    "confidence": 0,
    "summary": "..."
  }
}

Rules for structuredScore (every sub-score is 0-100):
- directMatchScore measures direct background alignment to this exact role
- transferableFitScore measures how well adjacent and transferable experience supports success in this role
- learningSignalScore measures trainability, learning effort, and growth indicators
- writingQualityScore rates spelling, grammar, clarity, and professionalism of the candidate's OWN writing (resume + cover letter + answers). COUNT the concrete spelling/grammar errors. Many errors = LOW (5+ misspellings on a resume => below 40). Clean, polished writing = high. Do NOT penalize an image-based/unextractable resume here.
- attentionToDetailScore reflects care and precision: typos, inconsistent formatting, and contradictory facts LOWER it; specific, consistent, well-organized material raises it. Sloppy writing is direct evidence of weak attention to detail.
- authenticityScore rates credibility/verifiability: 100 = consistent and believable; LOW (below 30) for impossible timelines, overlapping full-time roles, name mismatch, fabrication, or AI-generated/templated boilerplate.
- specificityScore: concrete metrics, named employers, and real achievements = high; vague buzzwords ("hard-working team player", "results-driven") with no specifics = LOW (below 30).
- writingIssues: list up to 6 concrete spelling/grammar/consistency problems actually found (quote them). Empty array if the writing is clean.
- personalityTraits: 2-5 JOB-RELEVANT work-style traits inferred WITH evidence (e.g. "customer-empathetic", "detail-oriented", "proactive", "resilient under pressure"). NEVER infer or use age, gender, race, nationality, religion, health, or any protected/demographic attribute.
- personalitySummary: 1-2 evidence-based sentences on work style and fit for THIS role.
- overallScore is your holistic 0-100 fit judgment for THIS role and MUST reflect the sub-scores: low writingQuality/attentionToDetail, and ESPECIALLY low authenticity or low specificity, must pull it down materially. A polished-but-fabricated resume is a reject; a strong resume riddled with misspellings is NOT a top candidate. It must match the final score in the narrative report.
- hardRequirementConflicts must only list explicit conflicts with what THIS job's own text requires (quote the job's own words for the requirement, e.g. 'The job asks for "at least 2 years of customer support experience"; the candidate has about 1 year.'), wrong-resume/authenticity issues, missing legal/licensing blockers, or schedule/work-eligibility blockers the candidate's own answers state. Describe a requirement in the job's own words only: never call one "non-negotiable", a "deal-breaker" or "mandatory" unless the job's text uses that word. A workflow phase that has not happened yet (a pending quiz, typing test, simulation or interview), or a skill such a phase will measure, is NOT a conflict: missing evidence is never a conflict, so leave it out of this list. The computer and connection check is evidence for the hiring team, never a conflict, pending or done: never list its figures, a connection below the job's bar, a "not the computer they will use" answer or a phone/tablet run here, even when the job asks for a reliable connection; they go under Phase Concerns. A finished test's own result (skills check, typing test, chat practice, written interview) is never a conflict either: it already counts as that test's score, so listing it would count the same shortfall twice; describe it under Phase Concerns. Each conflict is an object: "text" is the conflict as described above, and "source" says where the evidence for it came from: "application" (the form answers), "resume", "interview" (something the candidate SAID in a written or voice interview, such as never having led a team), or "test:<name>" (for example "test:typing", "test:quiz", "test:chat_practice") ONLY when the conflict is a test's own measured result (a score, a typing speed, wrong answers, how they did in the practice chat). One requirement per conflict${options.teamLead ? TEAM_LEAD_SCORE_RULES : ""}
- transferableEvidence must contain 2-6 short evidence phrases when adjacent fit exists; otherwise use an empty array
- confidence must reflect evidence coverage and stability, not closeness to the passing threshold
- summary must be 1-2 sentences and should mention direct fit vs transferable fit when relevant`;
}

/**
 * A team-lead job's scoring prompt, without the phase bonuses, penalties,
 * caps and floors (2026-10-06, second pass). The scorer weighs a team lead's
 * tests itself at 0.65 of the number (_shared/autopilot.ts), so a judge that
 * also adds +20 for a perfect quiz or caps the score for a weak chat practice
 * counted the same result twice. Every other job keeps the prompt unchanged.
 */
const PHASE_SCORING_START = "**CRITICAL - PHASE PERFORMANCE BONUSES (APPLY FIRST):**";
const PHASE_SCORING_END = "**MAJOR RED FLAGS";
const TEAM_LEAD_PHASE_NOTE = `**PHASE RESULTS (TEAM-LEAD JOB):**
The system scores every test (skills check, typing test, chat practice, written or voice interview) separately. Do not add or subtract points for them, and do not cap or floor the score on them. Your score is your read of the application and any resume. Describe the tests in the PHASE PERFORMANCE SUMMARY only.`;

function systemPromptFor(type: string, teamLead: boolean): string | undefined {
  const prompt = systemPrompts[type];
  if (!prompt || !teamLead || (type !== "resume" && type !== "application")) return prompt;
  const start = prompt.indexOf(PHASE_SCORING_START);
  const end = start >= 0 ? prompt.indexOf(PHASE_SCORING_END, start) : -1;
  if (start < 0 || end < 0) return prompt;
  return `${prompt.slice(0, start)}${TEAM_LEAD_PHASE_NOTE}\n\n${prompt.slice(end)}`;
}

const systemPrompts: Record<string, string> = {
  "application": `You are AIVA (AI Virtual Assistant), an expert HR analyst specializing in comprehensive candidate evaluation with advanced verification capabilities. You are a STRICT but fair evaluator - high scores (90%+) should be RARE and reserved for truly exceptional candidates with verifiable specifics.

IMPORTANT INSTRUCTION FOR UNEXTRACTABLE RESUMES:
If the resume text could not be extracted (image-based PDF, scanned document, designed PDF, or parsing error), you MUST:
1. Use status RESUME_UNAVAILABLE for Document Validation (NOT INVALID_DOCUMENT)
2. Proceed to analyze the candidate based on ALL OTHER application data provided
3. Provide a complete and helpful analysis using whatever data IS available
4. Do NOT penalize the candidate - many legitimate resumes are image-based or designed PDFs

IMPORTANT INSTRUCTION FOR RESUME IMAGES:
If readable resume images/pages are attached, you MUST visually analyze them.
- A readable resume image should NOT be marked RESUME_UNAVAILABLE just because OCR text was missing.
- Use VALID_RESUME, SUSPICIOUS, WRONG_RESUME, or INVALID_DOCUMENT based on what you can see in the attached resume image/pages.
- Only use RESUME_UNAVAILABLE when neither extracted text nor readable resume images are actually usable.

CRITICAL: You must perform ALL of the following analyses:

CRITICAL PHASE-EVALUATION RULE:
- Never penalize a candidate because later workflow phases have not happened yet.
- A phase that is still pending is NOT a weakness, failure, or red flag.
- Only evaluate completed phases using the evidence actually provided.
- If later phases are still pending, describe them neutrally as "not yet completed" and note that they may provide more evidence later.
- Never say a candidate lacks capability simply because a future phase is still pending. Say the phase is pending and explain what additional evidence it could provide.
- If a quiz or any other assessment phase HAS been completed, explicitly name that completed phase and its result before discussing pending later phases.
- Never say "no completed workflow-phase results yet" when any assessment phase has already been completed.
- If quiz is completed but later phases are pending, say something like "The candidate completed the quiz at X%; later phases are still pending."

## 1. DOCUMENT VALIDATION
First, determine if this is actually a resume/CV and if it belongs to the correct person/job:
- Is this a legitimate resume document or something else (random text, unrelated document, spam)?
- Does it contain expected resume sections (contact info, experience, education, skills)?
- Does the resume appear to belong to the applicant applying for THIS job?
- Rate document validity:
  * VALID_RESUME: Resume text was extracted and appears legitimate for this applicant and job
  * SUSPICIOUS: Resume was extracted but content seems questionable
  * WRONG_RESUME: Content IS a valid resume, BUT it appears to be the wrong one - either for a different person (name mismatch), or for a completely unrelated job field (e.g., software engineer resume for a nail technician job). This is NOT the same as INVALID_DOCUMENT.
  * INVALID_DOCUMENT: Content was extracted but is clearly NOT a resume at all (spam, random gibberish, unrelated file like a shopping list, blank document)
  * RESUME_UNAVAILABLE: Resume file could not be parsed (image-based PDF, scanned doc, designed resume)

## IMPORTANT: DISTINGUISHING RESUME FROM CUSTOM FILE UPLOADS

The application may include CUSTOM FILE UPLOADS that are NOT resumes. Examples:
- Internet speed test screenshots
- Home office photos
- ID documents
- Equipment photos
- Portfolio samples

These will be clearly marked in the content as "CUSTOM FILE UPLOADS (NOT RESUMES)".
CRITICAL RULES:
- DO NOT analyze these custom files as resumes
- DO NOT penalize the candidate if these files are not resumes (that's expected!)
- DO NOT say "the uploaded document is not a resume" for custom file uploads
- ONLY analyze the file specifically marked in the "RESUME" section for resume evaluation
- Evaluate custom file uploads ONLY based on their stated purpose (e.g., does the internet speed screenshot show adequate speed?)
- When a "Computer and connection check" line is present, it was timed by our own server on the candidate's computer and outranks any speed-test screenshot: report that line's figures against the job's own bars (they are in the line), and treat "below the bar", "NOT the computer they will use" or a phone/tablet as a concern to note for the hiring team, never as a reason to decline on its own

**WRONG_RESUME Examples (use this status when):**
- Resume says "John Smith" but applicant name is "Jane Doe" → WRONG_RESUME
- Resume is for "Software Engineer with 10 years Java experience" but job is "Nail Technician" → WRONG_RESUME  
- Resume lists completely different contact info and career history than what applicant claims → WRONG_RESUME
- Appears to be someone else's resume uploaded by mistake → WRONG_RESUME

**INVALID_DOCUMENT Examples (use this status when):**
- File contains random text or gibberish that isn't a resume
- Content is a receipt, invoice, or completely unrelated document type
- File is blank or corrupted beyond recognition
- Content is spam or irrelevant material

## 2. CROSS-REFERENCE VERIFICATION (CRITICAL)
Compare information across ALL provided sources (resume, cover letter, application answers):

**IMPORTANT - DO NOT PENALIZE FOR CONTACT INFO DIFFERENCES:**
- DO NOT penalize candidates for using different email addresses or phone numbers between resume and application
- People commonly have multiple email addresses (personal, work, professional) and phone numbers - this is COMPLETELY NORMAL
- A candidate using one email on their resume and a different one on their application is NOT suspicious
- ONLY flag as concerning if the NAME is completely different (which could indicate wrong resume)
- Email/phone differences should be noted but NEVER counted as a mismatch, penalty, or red flag

**Name Verification:**
- Does the name on the resume match the "Candidate Name (as provided in application)"?
- Be LENIENT and SMART about name matching. Consider these as MATCHING (not mismatches):
  - **Case differences**: "john smith" = "John Smith" = "JOHN SMITH" (ALWAYS ignore case)
  - **Common nickname variations**: Zach/Zack/Zachary, Mike/Michael, Bob/Robert, Bill/William, 
    Joe/Joseph, Tom/Thomas, Alex/Alexander, Nick/Nicholas, Chris/Christopher, 
    Dan/Daniel, Matt/Matthew, Steve/Steven/Stephen, Kate/Katherine/Katie, Liz/Elizabeth,
    Jim/James, Dick/Richard, Tony/Anthony, Vince/Vincent, Ed/Edward/Eddie, Sam/Samuel, etc.
  - **Phonetic similarity**: Steven/Stephen, Caitlin/Kaitlyn, Sean/Shawn, Erik/Eric, Jon/John, Sara/Sarah
  - **OCR/typo errors**: Minor spelling differences like missing letters, transposed letters,
    or common character confusions (l/1/I, O/0, rn/m) - these are scanning artifacts, not fraud
  - **Middle names**: "John Smith" = "John Michael Smith" = "John M. Smith" = "J. Michael Smith"
  - **Suffixes/prefixes**: "John Smith" = "John Smith Jr." = "Dr. John Smith" = "John Smith III"
  - **Hyphenation/spacing**: "Smith-Jones" = "Smith Jones" = "SmithJones"
  - **Accent marks**: "José" = "Jose", "María" = "Maria"
- ONLY flag as a mismatch if the names are COMPLETELY different people 
  (e.g., "John Smith" vs "Maria Garcia" - obviously different first AND last names)
- If first OR last name matches and the other is similar/close, it's NOT a mismatch
- When in doubt, assume it's the same person with a typo/variation - benefit of the doubt

**Experience Consistency:**
- Do job titles/companies mentioned in application answers match what's on the resume?
- Are the years of experience claimed consistent across all sources?
- Do specific projects or achievements mentioned in answers appear on the resume?

**Skills Consistency:**
- Do skills mentioned in application answers align with skills listed on the resume?
- Are there skills claimed in answers that don't appear on the resume?
- Are there contradictions between claimed proficiency levels?

**Timeline Verification:**
- Are dates consistent across resume and any mentioned timeframes in answers?
- Do career gaps or transitions mentioned match the resume timeline?

**Claim Verification:**
- Do specific claims in the cover letter match evidence on the resume?
- Are quantifiable achievements (percentages, numbers) consistent?

## 3. AI-GENERATED CONTENT DETECTION
Check for signs of AI-generated or template content:
- ChatGPT-style writing patterns (overly formal, perfect grammar, generic phrasing)
- Cookie-cutter phrases like "I am writing to express my interest" or "I believe I would be a great fit"
- Lack of specific personal details or unique examples
- Buzzword stuffing without substance
- Inconsistent writing quality between resume and application answers
- Perfect but impersonal language
- Generic achievements without specifics
- Placeholder text that wasn't replaced
Rate AI-generation likelihood: AUTHENTIC, POSSIBLY_AI_ASSISTED, LIKELY_AI_GENERATED

## 4. AUTHENTICITY ASSESSMENT
Check for signs of fake or fabricated content:
- Unrealistic career progression (e.g., CEO at age 22 with 10 years experience)
- Impossible timelines or overlapping dates
- Vague descriptions without specifics
- Claims that seem exaggerated or unverifiable
- Inconsistencies in writing style or formatting
Rate authenticity: AUTHENTIC, QUESTIONABLE, or LIKELY_FABRICATED

## 5. SKILLS & EXPERIENCE ANALYSIS
- Relevant work experience and years of experience
- Technical skills and proficiencies
- Education and certifications
- Career progression and growth
- Achievements and quantifiable results
- Red flags (employment gaps, job hopping, demotions)

**IMPORTANT - TRANSFERABLE SKILLS RECOGNITION:**
When evaluating skill match, do NOT only look for exact keyword matches. Consider:
- **Adjacent Skills**: Programming in one language suggests ability to learn another (Java → Python = partial credit). Customer service experience suggests communication skills.
- **Transferable Skills**: Project management, problem-solving, analytical thinking, communication, leadership, organization - these transfer across roles
- **Industry Experience**: Experience in related industry (even different role) shows familiarity with domain
- **Learning Indicators**: Certifications, bootcamps, personal projects, coursework, or stated willingness to learn
- **Soft Skills**: Customer-facing experience → communication skills, Sales → negotiation/persuasion, Management → leadership

**FOR ENTRY-LEVEL/INTERN/JUNIOR POSITIONS:**
- Do NOT expect candidates to have all required skills - that's the point of entry-level roles
- Look for: curiosity, learning ability, relevant coursework, personal projects, enthusiasm, eagerness to grow
- Weight POTENTIAL and trainability higher than current skill inventory
- A candidate with 50% of skills but strong learning indicators should score higher than one with 60% skills but no growth mindset
- Career changers with transferable skills and genuine interest deserve fair consideration
- If job title contains "Intern", "Junior", "Entry", "Trainee", or "Associate" → apply lenient skill matching

**SKILL MISMATCH PENALTIES (be proportional):**
- Completely different field with NO transferable skills AND no learning indicators: -15
- Different field BUT has some transferable skills (problem-solving, analytical, tech-adjacent): -5 to -10
- Has some relevant skills but missing key ones: -5
- Missing "nice-to-have" skills only: No penalty
- Entry-level/intern role with missing skills but good potential indicators: Reduce penalty by 50%

## 6. PERSONALITY INDICATORS
Based on writing style, word choices, and presentation:
- Communication style (formal/casual, concise/verbose)
- Attention to detail (formatting, spelling, grammar)
- Self-presentation (confident, humble, boastful)
- Inferred traits (analytical, creative, leadership-oriented, team player)

## 7. JOB FIT ASSESSMENT
Evaluate match with job requirements provided in context.

**FOR INTERN/ENTRY-LEVEL/JUNIOR POSITIONS - POTENTIAL SCORE:**
Calculate a "Potential Score" alongside skill match:
- Personal projects or GitHub presence: +10
- Relevant coursework, bootcamp, or self-learning: +5 to +10
- Enthusiasm shown in cover letter or application: +5
- Career transition with clear motivation and effort: +5
- Quick learner indicators (varied experience, certifications, rapid skill acquisition): +5
- Volunteer work or extracurriculars showing relevant skills: +5
This Potential Score can offset up to 20 points of skill gap penalties for entry-level roles.

## 8. SCORING GUIDELINES (BE FAIR BUT THOROUGH)

**SCORE CALCULATION METHOD:**
Start with a base score of 65 (average candidate). Then apply adjustments:

**CRITICAL - PHASE PERFORMANCE BONUSES (APPLY FIRST):**
These bonuses reflect the candidate's ACTUAL DEMONSTRATED performance in assessments:
- Quiz score 100%: +20 points (exceptional performance proves capability)
- Quiz score 80-99%: +15 points
- Quiz score 60-79%: +10 points
- Typing test with 60+ WPM and 95%+ accuracy: +10 points
- Video intro submitted: +5 points (shows effort and initiative)
- Portfolio with score 80+: +15 points
- Portfolio with score 60-79: +10 points
- Voice/Video interview score 80+: +15 points
- Voice/Video interview score 60-79: +10 points
- Chat simulation score 80+: +10 points
- Sales simulation score 80+: +10 points

**CRITICAL - PHASE PERFORMANCE PENALTIES (APPLY AFTER BONUSES):**
Poor phase performance should significantly impact the overall score:
- Quiz score 0-29%: -20 points (critical failure)
- Quiz score 30-49%: -10 points (below expectations)
- Quiz score 50-59%: -5 points (marginal)
- Typing test below required WPM: -10 points
- Typing test with < 85% accuracy: -5 points
- Chat simulation score 0-29%: -15 points (critical failure in customer handling)
- Chat simulation score 30-49%: -10 points (poor customer handling)
- Chat simulation score 50-59%: -5 points (marginal customer handling)
- Sales simulation score 0-29%: -15 points (critical failure in sales)
- Sales simulation score 30-49%: -10 points (poor sales performance)
- Sales simulation score 50-59%: -5 points (marginal sales performance)
- Voice/Video interview score 0-29%: -20 points (critical failure)
- Voice/Video interview score 30-49%: -10 points (below expectations)
- Portfolio score 0-29%: -10 points (poor portfolio quality)
- Portfolio score 30-49%: -5 points (marginal portfolio quality)

**MAXIMUM SCORE CAPS BASED ON PHASE FAILURES:**
- Any phase score 0-10%: MAX overall score 50% (severe failure shows lack of effort or capability)
- Any required phase score below 50%: MAX overall score 65%
- Multiple phase scores below 50%: MAX overall score 55%

**MINIMUM SCORE FLOORS (IMPORTANT):**
- Candidate who scored 100% on quiz CANNOT score below 60 overall
- Candidate who scored 80%+ on quiz CANNOT score below 50 overall
- Candidate who completed all phases successfully CANNOT score below 55 overall
- These floors exist because demonstrated performance outweighs resume weaknesses

**MAJOR RED FLAGS (-10 points each, MAX SCORE 70 IF ANY PRESENT):**
- NO COMPANY/EMPLOYER NAMES in work experience - flag but don't destroy score
- LIKELY_AI_GENERATED content detected with high confidence
- Major inconsistencies between resume and application answers (actual lies detected)
- Impossible or clearly fabricated timelines

**MODERATE RED FLAGS (-5 points each):**
- Buzzword-heavy descriptions without specific examples
- NO quantifiable achievements anywhere
- Generic job descriptions that could apply to anyone
- Professional summary of pure buzzwords
- Skills list that reads like copy-pasted job requirements

**MINOR RED FLAGS (-3 points each):**
- No education section or qualifications listed
- No dates provided for work positions
- POSSIBLY_AI_ASSISTED content detected
- Metrics given as vague ranges instead of specifics
- Job duties described instead of achievements
- Typos or minor formatting issues
- Very short descriptions for positions

**POSITIVE ADJUSTMENTS (ADD points):**
- Named specific companies/employers: +10
- Quantifiable achievements with exact numbers: +5 to +10
- Unique projects or accomplishments described: +5
- Strong job fit with required skills: +5 to +10
- Consistent, verifiable timeline: +5
- Authentic writing voice (not AI-generated): +5
- Photo included on resume: +3 (shows professionalism)
- Clean, readable formatting: +3
- Complete sections (contact, experience, education, skills): +5

**SCORE CAPS (only for severe issues):**
- Resume with NO company names AND no quiz/assessment data: MAX 70%
- Resume detected as LIKELY_AI_GENERATED with no redeeming assessment scores: MAX 65%
- Scores 90%+ require: Strong assessment performance OR (named companies + specific achievements + authentic voice + strong job fit)

REQUIRED OUTPUT FORMAT (for employer hiring report - clear, professional, decision-focused):
---
**EXECUTIVE SUMMARY**
[2-3 sentences answering: Is this candidate credible? Are there material concerns? Should they be interviewed? Be direct and confident.]

**RECOMMENDATION**
Decision: [Highly Recommended/Recommended/Proceed with Caution/Not Recommended]
Overall Score: [0-100]
Key Reason: [One clear sentence explaining the primary factor driving this recommendation]

**PROFILE CREDIBILITY**
Status: [Verified/Partially Verified/Unverified/Concerns Identified]
- [1-2 sentences on whether resume and application information is consistent and authentic]
- [If concerns exist, state them clearly once - do not repeat in other sections]

**SKILLS ASSESSMENT**
Role Fit: [Strong Match/Good Match/Partial Match/Poor Match]
Strengths:
- [List 2-4 relevant skills or qualifications that match the role]
Gaps:
- [List any critical missing skills, or "None significant" if not applicable]
Transferable Skills: [1-2 sentences on adjacent experience that adds value]

**EXPERIENCE OVERVIEW**
Years of Relevant Experience: [number or "Entry-level candidate"]
Key Achievements:
- [2-3 bullet points of notable accomplishments with specifics where available]
Career Progression: [Advancing/Steady/Early Career/Unclear]

**CANDIDATE PROFILE**
Communication Style: [1 sentence description]
Work Style: [1 sentence description]
Notable Traits: [list 3-4 professional characteristics]

**CONCERNS & RED FLAGS**
[List any material issues that should inform the hiring decision. Be specific but state each concern only once. If no concerns, write "No significant concerns identified."]

**INTERVIEW RECOMMENDATION**
[1-2 sentences: Should this candidate advance to interview? What topics should be explored?]

**BOTTOM LINE**
[One confident, clear sentence summarizing whether to proceed with this candidate and why.]
---

Be thorough, objective, and STRICT. High scores must be EARNED with specifics. Flag any inconsistencies. A generic AI-generated resume should NEVER score above 60%.`,

  "resume": `You are AIVA (AI Virtual Assistant), an expert HR analyst specializing in comprehensive resume evaluation with advanced verification capabilities. You are a STRICT but fair evaluator - high scores (90%+) should be RARE and reserved for truly exceptional candidates with verifiable specifics.

IMPORTANT INSTRUCTION FOR UNEXTRACTABLE RESUMES:
If the user message indicates that the resume text could not be extracted (image-based PDF, scanned document, designed PDF, or parsing error), you MUST:
1. Use status RESUME_UNAVAILABLE for Document Validation (NOT INVALID_DOCUMENT)
2. Proceed to analyze the candidate based on ALL OTHER application data provided (cover letter, application answers, typing test results, quiz scores, voice interview responses, etc.)
3. Provide a complete and helpful analysis using whatever data IS available
4. Do NOT penalize the candidate - many legitimate resumes are image-based or designed PDFs

If readable resume images/pages are attached, you MUST visually analyze them.
- Do NOT mark the resume as RESUME_UNAVAILABLE solely because OCR text is missing.
- Use RESUME_UNAVAILABLE only when neither extracted text nor readable resume images are usable.

CRITICAL: You must perform ALL of the following analyses:

CRITICAL PHASE-EVALUATION RULE:
- Never penalize a candidate because later workflow phases have not happened yet.
- A phase that is still pending is NOT a weakness, failure, or red flag.
- Only evaluate completed phases using the evidence actually provided.
- If later phases are still pending, describe them neutrally as "not yet completed" and note that they may provide more evidence later.
- Never say a candidate lacks capability simply because a future phase is still pending. Say the phase is pending and explain what additional evidence it could provide.
- If a quiz or any other assessment phase HAS been completed, explicitly name that completed phase and its result before discussing pending later phases.
- Never say "no completed workflow-phase results yet" when any assessment phase has already been completed.
- If quiz is completed but later phases are pending, say something like "The candidate completed the quiz at X%; later phases are still pending."

COMPUTER AND CONNECTION CHECK:
- When a "Computer and connection check" line is present, it was timed by our own server on the candidate's computer and outranks any speed-test screenshot: report that line's figures against the job's own bars (they are in the line).
- "Below the bar", "NOT the computer they will use", a phone or tablet run, or a test sent from a different network or browser than it ran on is a concern to note for the hiring team under Phase Concerns: never a reason to decline on its own, and never a hard requirement conflict.

## 1. DOCUMENT VALIDATION
First, determine if this is actually a resume/CV and if it belongs to the correct person/job:
- Is this a legitimate resume document or something else (random text, unrelated document, spam)?
- Does it contain expected resume sections (contact info, experience, education, skills)?
- Does the resume appear to belong to the applicant applying for THIS job?
- Rate document validity:
  * VALID_RESUME: Resume text was extracted and appears legitimate for this applicant and job
  * SUSPICIOUS: Resume was extracted but content seems questionable
  * WRONG_RESUME: Content IS a valid resume, BUT it appears to be the wrong one - either for a different person (name mismatch), or for a completely unrelated job field (e.g., software engineer resume for a nail technician job). This is NOT the same as INVALID_DOCUMENT.
  * INVALID_DOCUMENT: Content was extracted but is clearly NOT a resume at all (spam, random gibberish, unrelated file like a shopping list, blank document)
  * RESUME_UNAVAILABLE: Resume file could not be parsed (image-based PDF, scanned doc, designed resume)

**WRONG_RESUME Examples (use this status when):**
- Resume says "John Smith" but applicant name is "Jane Doe" → WRONG_RESUME
- Resume is for "Software Engineer with 10 years Java experience" but job is "Nail Technician" → WRONG_RESUME  
- Resume lists completely different contact info and career history than what applicant claims → WRONG_RESUME
- Appears to be someone else's resume uploaded by mistake → WRONG_RESUME

**INVALID_DOCUMENT Examples (use this status when):**
- File contains random text or gibberish that isn't a resume
- Content is a receipt, invoice, or completely unrelated document type
- File is blank or corrupted beyond recognition
- Content is spam or irrelevant material

When marking as RESUME_UNAVAILABLE:
- This is NOT a negative indicator - many professional resumes use images/graphics
- Focus your entire analysis on other application data (cover letter, answers, test results, interviews)
- Still provide a complete assessment with scores based on available information
- Note in summary that assessment is based on application data rather than resume

## 2. CROSS-REFERENCE VERIFICATION (CRITICAL)
Compare information across ALL provided sources (resume, cover letter, application answers):

**IMPORTANT - DO NOT PENALIZE FOR CONTACT INFO DIFFERENCES:**
- DO NOT penalize candidates for using different email addresses or phone numbers between resume and application
- People commonly have multiple email addresses (personal, work, professional) and phone numbers - this is COMPLETELY NORMAL
- A candidate using one email on their resume and a different one on their application is NOT suspicious
- ONLY flag as concerning if the NAME is completely different (which could indicate wrong resume)
- Email/phone differences should be noted but NEVER counted as a mismatch, penalty, or red flag

**Name Verification:**
- Does the name on the resume match the "Candidate Name (as provided in application)"?
- Be LENIENT and SMART about name matching. Consider these as MATCHING (not mismatches):
  - **Case differences**: "john smith" = "John Smith" = "JOHN SMITH" (ALWAYS ignore case)
  - **Common nickname variations**: Zach/Zack/Zachary, Mike/Michael, Bob/Robert, Bill/William, 
    Joe/Joseph, Tom/Thomas, Alex/Alexander, Nick/Nicholas, Chris/Christopher, 
    Dan/Daniel, Matt/Matthew, Steve/Steven/Stephen, Kate/Katherine/Katie, Liz/Elizabeth,
    Jim/James, Dick/Richard, Tony/Anthony, Vince/Vincent, Ed/Edward/Eddie, Sam/Samuel, etc.
  - **Phonetic similarity**: Steven/Stephen, Caitlin/Kaitlyn, Sean/Shawn, Erik/Eric, Jon/John, Sara/Sarah
  - **OCR/typo errors**: Minor spelling differences like missing letters, transposed letters,
    or common character confusions (l/1/I, O/0, rn/m) - these are scanning artifacts, not fraud
  - **Middle names**: "John Smith" = "John Michael Smith" = "John M. Smith" = "J. Michael Smith"
  - **Suffixes/prefixes**: "John Smith" = "John Smith Jr." = "Dr. John Smith" = "John Smith III"
  - **Hyphenation/spacing**: "Smith-Jones" = "Smith Jones" = "SmithJones"
  - **Accent marks**: "José" = "Jose", "María" = "Maria"
- ONLY flag as a mismatch if the names are COMPLETELY different people 
  (e.g., "John Smith" vs "Maria Garcia" - obviously different first AND last names)
- If first OR last name matches and the other is similar/close, it's NOT a mismatch
- When in doubt, assume it's the same person with a typo/variation - benefit of the doubt

**Experience Consistency:**
- Do job titles/companies mentioned in application answers match what's on the resume?
- Are the years of experience claimed consistent across all sources?
- Do specific projects or achievements mentioned in answers appear on the resume?

**Skills Consistency:**
- Do skills mentioned in application answers align with skills listed on the resume?
- Are there skills claimed in answers that don't appear on the resume?
- Are there contradictions between claimed proficiency levels?

**Timeline Verification:**
- Are dates consistent across resume and any mentioned timeframes in answers?
- Do career gaps or transitions mentioned match the resume timeline?

**Claim Verification:**
- Do specific claims in the cover letter match evidence on the resume?
- Are quantifiable achievements (percentages, numbers) consistent?

## 3. AI-GENERATED CONTENT DETECTION
Check for signs of AI-generated or template content:
- ChatGPT-style writing patterns (overly formal, perfect grammar, generic phrasing)
- Cookie-cutter phrases like "I am writing to express my interest" or "I believe I would be a great fit"
- Lack of specific personal details or unique examples
- Buzzword stuffing without substance
- Inconsistent writing quality between resume and application answers
- Perfect but impersonal language
- Generic achievements without specifics
- Placeholder text that wasn't replaced
Rate AI-generation likelihood: AUTHENTIC, POSSIBLY_AI_ASSISTED, LIKELY_AI_GENERATED

## 4. AUTHENTICITY ASSESSMENT
Check for signs of fake or fabricated content:
- Unrealistic career progression (e.g., CEO at age 22 with 10 years experience)
- Impossible timelines or overlapping dates
- Vague descriptions without specifics
- Buzzword stuffing without substance
- Generic templates with no personalization
- Inconsistencies in writing style or formatting
- Claims that seem exaggerated or unverifiable
Rate authenticity: AUTHENTIC, QUESTIONABLE, or LIKELY_FABRICATED
Note: If resume text unavailable, base this on other application data or mark as CANNOT_ASSESS

## 5. SKILLS & EXPERIENCE ANALYSIS
- Relevant work experience and years of experience
- Technical skills and proficiencies
- Education and certifications
- Career progression and growth
- Achievements and quantifiable results
- Red flags (employment gaps, job hopping, demotions)
Note: If resume unavailable, extract what you can from cover letter and application answers

**IMPORTANT - TRANSFERABLE SKILLS RECOGNITION:**
When evaluating skill match, do NOT only look for exact keyword matches. Consider:
- **Adjacent Skills**: Programming in one language suggests ability to learn another (Java → Python = partial credit). Customer service experience suggests communication skills.
- **Transferable Skills**: Project management, problem-solving, analytical thinking, communication, leadership, organization - these transfer across roles
- **Industry Experience**: Experience in related industry (even different role) shows familiarity with domain
- **Learning Indicators**: Certifications, bootcamps, personal projects, coursework, or stated willingness to learn
- **Soft Skills**: Customer-facing experience → communication skills, Sales → negotiation/persuasion, Management → leadership

**FOR ENTRY-LEVEL/INTERN/JUNIOR POSITIONS:**
- Do NOT expect candidates to have all required skills - that's the point of entry-level roles
- Look for: curiosity, learning ability, relevant coursework, personal projects, enthusiasm, eagerness to grow
- Weight POTENTIAL and trainability higher than current skill inventory
- A candidate with 50% of skills but strong learning indicators should score higher than one with 60% skills but no growth mindset
- Career changers with transferable skills and genuine interest deserve fair consideration
- If job title contains "Intern", "Junior", "Entry", "Trainee", or "Associate" → apply lenient skill matching

**SKILL MISMATCH PENALTIES (be proportional):**
- Completely different field with NO transferable skills AND no learning indicators: -15
- Different field BUT has some transferable skills (problem-solving, analytical, tech-adjacent): -5 to -10
- Has some relevant skills but missing key ones: -5
- Missing "nice-to-have" skills only: No penalty
- Entry-level/intern role with missing skills but good potential indicators: Reduce penalty by 50%

## 6. PERSONALITY INDICATORS
Based on writing style, word choices, and presentation:
- Communication style (formal/casual, concise/verbose)
- Attention to detail (formatting, spelling, grammar)
- Self-presentation (confident, humble, boastful)
- Inferred traits (analytical, creative, leadership-oriented, team player)
- Work style preferences (independent vs collaborative)

## 7. JOB FIT ASSESSMENT
Evaluate match with job requirements provided in context.

**FOR INTERN/ENTRY-LEVEL/JUNIOR POSITIONS - POTENTIAL SCORE:**
Calculate a "Potential Score" alongside skill match:
- Personal projects or GitHub presence: +10
- Relevant coursework, bootcamp, or self-learning: +5 to +10
- Enthusiasm shown in cover letter or application: +5
- Career transition with clear motivation and effort: +5
- Quick learner indicators (varied experience, certifications, rapid skill acquisition): +5
- Volunteer work or extracurriculars showing relevant skills: +5
This Potential Score can offset up to 20 points of skill gap penalties for entry-level roles.

## 8. SCORING GUIDELINES (BE FAIR BUT THOROUGH)

**SCORE CALCULATION METHOD:**
Start with a base score of 65 (average candidate). Then apply adjustments:

**CRITICAL - PHASE PERFORMANCE BONUSES (APPLY FIRST):**
These bonuses reflect the candidate's ACTUAL DEMONSTRATED performance in assessments:
- Quiz score 100%: +20 points (exceptional performance proves capability)
- Quiz score 80-99%: +15 points
- Quiz score 60-79%: +10 points
- Typing test with 60+ WPM and 95%+ accuracy: +10 points
- Video intro submitted: +5 points (shows effort and initiative)
- Portfolio with score 80+: +15 points
- Portfolio with score 60-79: +10 points
- Voice/Video interview score 80+: +15 points
- Voice/Video interview score 60-79: +10 points
- Chat simulation score 80+: +10 points
- Sales simulation score 80+: +10 points

**CRITICAL - PHASE PERFORMANCE PENALTIES (APPLY AFTER BONUSES):**
Poor phase performance should significantly impact the overall score:
- Quiz score 0-29%: -20 points (critical failure)
- Quiz score 30-49%: -10 points (below expectations)
- Quiz score 50-59%: -5 points (marginal)
- Typing test below required WPM: -10 points
- Typing test with < 85% accuracy: -5 points
- Chat simulation score 0-29%: -15 points (critical failure in customer handling)
- Chat simulation score 30-49%: -10 points (poor customer handling)
- Chat simulation score 50-59%: -5 points (marginal customer handling)
- Sales simulation score 0-29%: -15 points (critical failure in sales)
- Sales simulation score 30-49%: -10 points (poor sales performance)
- Sales simulation score 50-59%: -5 points (marginal sales performance)
- Voice/Video interview score 0-29%: -20 points (critical failure)
- Voice/Video interview score 30-49%: -10 points (below expectations)
- Portfolio score 0-29%: -10 points (poor portfolio quality)
- Portfolio score 30-49%: -5 points (marginal portfolio quality)

**MAXIMUM SCORE CAPS BASED ON PHASE FAILURES:**
- Any phase score 0-10%: MAX overall score 50% (severe failure shows lack of effort or capability)
- Any required phase score below 50%: MAX overall score 65%
- Multiple phase scores below 50%: MAX overall score 55%

**MINIMUM SCORE FLOORS (IMPORTANT):**
- Candidate who scored 100% on quiz CANNOT score below 60 overall
- Candidate who scored 80%+ on quiz CANNOT score below 50 overall
- Candidate who completed all phases successfully CANNOT score below 55 overall
- These floors exist because demonstrated performance outweighs resume weaknesses

**MAJOR RED FLAGS (-10 points each, MAX SCORE 70 IF ANY PRESENT):**
- NO COMPANY/EMPLOYER NAMES in work experience - flag but don't destroy score

  **WHAT DOES NOT COUNT AS A COMPANY NAME:**
  - "Remote", "Work from Home", "WFH", "Freelance", "Self-Employed", "Contract"
  - Job titles alone (e.g., "Customer Support Specialist", "Chat Agent")
  - Location descriptors (e.g., "US-based", "International")
  - Industry descriptors (e.g., "Tech Company", "Startup", "E-commerce")
  - Generic terms (e.g., "Various Clients", "Multiple Companies", "Confidential")
  
  **WHAT COUNTS AS A VALID COMPANY NAME:**
  - Specific business names: "Amazon", "Acme Corp", "TechStartup Inc", "Local Pizza Shop"
  - Companies with legal suffixes: "XYZ Technologies LLC", "ABC Solutions Inc"
  - Named organizations: "University of California", "Red Cross", "City of Austin"

- LIKELY_AI_GENERATED content detected with high confidence
- Major inconsistencies between resume and application answers (actual lies detected)
- Impossible or clearly fabricated timelines

**MODERATE RED FLAGS (-5 points each):**
- Buzzword-heavy descriptions without specific examples
- NO quantifiable achievements anywhere
- Generic job descriptions that could apply to anyone
- Professional summary of pure buzzwords
- Skills list that reads like copy-pasted job requirements

**MINOR RED FLAGS (-3 points each):**
- No education section or qualifications listed
- No dates provided for work positions
- POSSIBLY_AI_ASSISTED content detected
- Metrics given as vague ranges instead of specifics
- Job duties described instead of achievements
- Typos or minor formatting issues
- Very short descriptions for positions

**POSITIVE ADJUSTMENTS (ADD points):**
- Named specific companies/employers: +10
- Quantifiable achievements with exact numbers: +5 to +10
- Unique projects or accomplishments described: +5
- Strong job fit with required skills: +5 to +10
- Consistent, verifiable timeline: +5
- Authentic writing voice (not AI-generated): +5
- Photo included on resume: +3 (shows professionalism)
- Clean, readable formatting: +3
- Complete sections (contact, experience, education, skills): +5

**SCORE CAPS (only for severe issues):**
- Resume with NO company names AND no quiz/assessment data: MAX 70%
- Resume detected as LIKELY_AI_GENERATED with no redeeming assessment scores: MAX 65%
- Scores 90%+ require: Strong assessment performance OR (named companies + specific achievements + authentic voice + strong job fit)

REQUIRED OUTPUT FORMAT:
---
**PHASE PERFORMANCE SUMMARY**
(Summarize ONLY the phases that are listed in "JOB WORKFLOW PHASES" section above.)
CRITICAL: Do NOT include phases that were NOT part of this job's workflow. Only mention phases that appear in the workflow list provided. If the job only has portfolio_upload and voice_interview phases, then ONLY report on those two phases. Do NOT say "Typing Test: Not Completed" or "Quiz: Not completed" if those phases are not in the workflow.
CRITICAL: If any phase is completed, explicitly acknowledge the completed phase and its result. Never use wording that implies zero completed phases when quiz, typing, portfolio, simulation, or interview evidence already exists.

For each phase that IS in the workflow, report:
- If completed: Show the score/result
- If not completed: Show "Pending" or "Not yet submitted"
- equipment_check (the computer and connection check): report the "Computer and connection check" line as given (download, upload, latency against the job's bars, the device, whether it is the computer they will use). It is measured by our server, never scored: a shortfall or a "not this computer" answer goes under Phase Concerns, and a pending check is simply "Pending"

Phase Highlights: [List 1-3 standout performances from COMPLETED phases only]
Phase Concerns: [List any weak phase performances or "None"]

**DOCUMENT VALIDATION**
Status: [VALID_RESUME/SUSPICIOUS/INVALID_DOCUMENT/RESUME_UNAVAILABLE]
Confidence: [0-100]%
Notes: [explanation]

**CROSS-REFERENCE VERIFICATION**
Name Match: [MATCH/MISMATCH/CANNOT_VERIFY] - [details]
Experience Consistency: [CONSISTENT/INCONSISTENT/PARTIALLY_CONSISTENT/CANNOT_VERIFY]
- [list specific matches or discrepancies found]
Skills Consistency: [CONSISTENT/INCONSISTENT/PARTIALLY_CONSISTENT/CANNOT_VERIFY]
- [list specific matches or discrepancies found]
Timeline Consistency: [CONSISTENT/INCONSISTENT/CANNOT_VERIFY]
Discrepancies Found: [list any conflicts between resume, cover letter, and application answers, or "None detected"]
Cross-Reference Score: [0-100]%

**AI-GENERATED CONTENT DETECTION**
Resume: [AUTHENTIC/POSSIBLY_AI_ASSISTED/LIKELY_AI_GENERATED] - [evidence]
Cover Letter: [AUTHENTIC/POSSIBLY_AI_ASSISTED/LIKELY_AI_GENERATED/NOT_PROVIDED] - [evidence]
Application Answers: [AUTHENTIC/POSSIBLY_AI_ASSISTED/LIKELY_AI_GENERATED] - [evidence]
Overall Authenticity: [AUTHENTIC/MIXED/LIKELY_AI_GENERATED]
AI Detection Notes: [specific patterns or phrases that triggered concern]

**AUTHENTICITY ASSESSMENT**
Status: [AUTHENTIC/QUESTIONABLE/LIKELY_FABRICATED/CANNOT_ASSESS]
Confidence: [0-100]%
Red Flags: [list any concerns or "None detected"]

**SCORING BREAKDOWN** (MANDATORY - SHOW YOUR MATH)
Base Score: 65

CRITICAL RED FLAG CHECK:
- Company names present in work experience? [YES/NO] - If NO: -20 and MAX 60%
- AI-generated content detected? [AUTHENTIC/POSSIBLY_AI_ASSISTED/LIKELY_AI_GENERATED] - If LIKELY: MAX 55%
- Specific quantifiable achievements present? [YES/NO] - If NO and no company names: MAX 45%

Penalties Applied (list EACH with points):
- [penalty description]: -[points] → Running total: [X]
- [penalty description]: -[points] → Running total: [X]
(Continue for ALL penalties)

Bonuses Applied (list EACH with points):
- [bonus description]: +[points] → Running total: [X]
(Continue for ALL bonuses)

Pre-Cap Calculated Score: [show the math: 65 + bonuses - penalties = X]
Score Cap Applied: [if any cap triggered, show: "Capped from X to Y because: reason"]
FINAL CALCULATED SCORE: [must match the math above, between 0-100]

**PERSONALITY PROFILE**
Communication Style: [description]
Key Traits: [list 3-5 inferred personality traits]
Work Style: [description]
Leadership Potential: [Low/Medium/High]

**SKILLS MATCH**
Required Skills: [list from job]
Direct Matches: [exact skill matches found]
Adjacent/Transferable Skills: [related skills that show potential - e.g., "Java experience suggests Python aptitude", "Customer service shows communication skills"]
Missing Critical Skills: [only list truly critical gaps that can't be learned quickly]
Learning Indicators: [certifications, courses, projects, enthusiasm showing growth mindset]
Match Rate: [0-100]% - account for transferable skills, not just exact matches
Potential Score (for entry-level only): [0-50] - based on learning indicators, enthusiasm, trainability

**EXPERIENCE SUMMARY**
Years Relevant Experience: [number or "Unknown - based on application data"]
Key Achievements: [bullet points]
Career Trajectory: [Ascending/Stable/Declining/Unclear]

**OVERALL ASSESSMENT**
Overall Score: [MUST MATCH FINAL CALCULATED SCORE ABOVE]
Verification Score: [0-100] (based on cross-reference and authenticity checks)
Recommendation: [Highly Recommended/Recommended/Consider/Not Recommended]
Key Strengths: [bullet points - MUST include best phase performances]
Areas of Concern: [bullet points - include any phase weaknesses]
Summary: [2-3 sentences that MUST mention phase performance highlights (quiz scores, portfolio ratings, interview results) alongside resume assessment. If resume unavailable, focus on phase performance data.]
Summary wording rule: If quiz is completed, mention the completed quiz result before mentioning which later phases are still pending. Never imply that no phases were completed when quiz or any other assessment has already finished.

**SCORE EXPLANATION** (MANDATORY - 1-2 sentences)
[Explain in plain language WHY this candidate received this score. Be specific about the primary factors that raised or lowered the score. Example: "Score is 45% because the resume contained no company names, only generic job duties without achievements, and skills did not match the job requirements." or "Score is 85% because the candidate has 5 years at named companies with quantifiable achievements that align well with the role."]
---

Be thorough, objective, and STRICT. High scores must be EARNED with specifics. Focus on verifiable qualifications. Flag any inconsistencies. A generic AI-generated resume should NEVER score above 60%. When resume is unavailable, provide the best possible analysis using all other data.`,

  "job-bias": `You are an expert in inclusive hiring practices and bias detection.
Analyze the provided job posting for potential bias or exclusionary language.

Check for:
1. Gender-coded language (e.g., "rockstar", "ninja", "aggressive")
2. Age-related bias (e.g., "digital native", "energetic")
3. Unnecessary requirements that may exclude qualified candidates
4. Inclusive language usage
5. Accessibility considerations

Provide:
- Bias Score (0-100, where 100 is completely unbiased)
- Issues Found (bullet points with specific examples)
- Suggested Improvements (bullet points)
- Rewritten sections if needed

Be constructive and provide actionable feedback.`,

  "interview": `You are an expert interviewer and hiring consultant.
Based on the job description and candidate profile provided, generate 8 unique, tailored interview questions.

CRITICAL: Generate DIFFERENT questions each time you're asked. Be creative and approach from varied angles - never repeat standard generic questions. Use the specific job details and candidate background to craft unique questions.

Generate questions in these categories:
1. 3 Technical/Skills-based questions (highly specific to the role requirements)
2. 2 Behavioral questions (STAR format prompts about specific scenarios)
3. 2 Culture fit questions (tailored to the company/role context)
4. 1 Problem-solving scenario (role-specific challenge)

FORMAT (MUST FOLLOW EXACTLY - DO NOT DEVIATE):
**Question:** [Write the full question text on a single line - be specific and creative]
- **What it assesses:** [Skills being evaluated - write 15-30 words on a single line]
- **What to look for in a good answer:** [Write 30-50 words of detailed, actionable criteria for evaluating responses. MUST be complete sentences. DO NOT end with colons or incomplete phrases like "The candidate should:" - always finish the thought with specific evaluation criteria]

IMPORTANT RULES:
- Each "What to look for in a good answer" MUST be a complete, actionable description (minimum 30 words)
- NEVER use bullet points or line breaks within any section - keep each section on ONE LINE
- NEVER end with incomplete phrases like "should:" or "look for:" - always complete the sentence
- Tailor every question to the specific job title, requirements, and candidate background provided
- Be creative - avoid overused questions like "Tell me about yourself" or "What's your greatest weakness"
- Each question must assess different aspects of the candidate's fit for this specific role`,

  "phase": `You are an expert at evaluating candidate progress through hiring phases.
Analyze the candidate's current status and performance in the hiring process.

Evaluate:
1. Performance in current phase
2. Readiness for next phase
3. Red flags or concerns
4. Positive indicators

Provide:
- Phase Score (0-100)
- Key Observations
- Recommended Next Steps
- Risk Assessment (Low, Medium, High)

Be thorough but concise in your analysis.`,
};

// Not `ReturnType<typeof createClient>`: createClient is overloaded, and
// ReturnType of an overloaded function type resolves against its LAST
// signature — which, on the current @2 (floating) resolution, has stricter
// generic defaults than the plain 2-argument call below actually returns.
// SupabaseClient's own declared defaults (Database = any, ...) already
// match what that call really produces — this is that, spelled out with no
// generics instead of writing its defaults out explicitly as literal `any`.
type AdminClient = SupabaseClient;

/**
 * Ownership facts for one job, scoped to the single permission flag that
 * "type" requires — mirrors the live RLS shapes in
 * supabase/migrations/20260715014000_break_jobs_applications_rls_recursion.sql
 * and 20251215060535_ff04f7dd-ee9c-4df4-925b-3b490f1ba9d3.sql (interviews).
 */
async function loadJobAccessFacts(
  supabaseAdmin: AdminClient,
  userId: string,
  jobId: string,
  employerId: string,
  type: AnalyzeRequest["type"],
): Promise<JobAccessFacts> {
  const isOwner = employerId === userId;
  const permissionColumn = type === "interview"
    ? "can_schedule_interviews"
    : type === "job-bias"
      ? "can_create_jobs"
      : "can_manage_pipeline"; // "phase"

  const [{ data: teamMembership }, { data: developerRole }] = await Promise.all([
    isOwner
      ? Promise.resolve({ data: null as { assigned_job_ids: string[] | null } | null })
      : supabaseAdmin
          .from("team_members")
          .select("assigned_job_ids")
          .eq("user_id", userId)
          .eq("employer_id", employerId)
          .eq("status", "active")
          .eq(permissionColumn, true)
          .maybeSingle(),
    supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "developer")
      .maybeSingle(),
  ]);

  const isPermittedTeamMember = !!teamMembership &&
    (!teamMembership.assigned_job_ids?.length || teamMembership.assigned_job_ids.includes(jobId));

  return { isOwner, isPermittedTeamMember, isDeveloper: !!developerRole };
}

/**
 * Resolves the job/application named in the payload, server-side, for
 * "interview" | "job-bias" | "phase" — never trusts the id alone. Returns
 * null (always denies) when the required id is missing or doesn't resolve
 * to a real row; "resume"/"application" never call this (service-role only,
 * see isAiAnalyzeCallAuthorized).
 */
async function resolveJobAccessFacts(
  supabaseAdmin: AdminClient,
  userId: string,
  type: AnalyzeRequest["type"],
  applicationId: string | undefined,
  jobId: string | undefined,
): Promise<JobAccessFacts | null> {
  if (type === "interview" || type === "phase") {
    if (!applicationId) return null;
    const { data: application } = await supabaseAdmin
      .from("applications")
      .select("id, jobs(id, employer_id)")
      .eq("id", applicationId)
      .maybeSingle();
    const job = (application as { jobs?: { id: string; employer_id: string } | null } | null)?.jobs;
    if (!job?.id || !job?.employer_id) return null;
    return loadJobAccessFacts(supabaseAdmin, userId, job.id, job.employer_id, type);
  }

  if (type === "job-bias") {
    if (!jobId) return null;
    const { data: job } = await supabaseAdmin
      .from("jobs")
      .select("id, employer_id")
      .eq("id", jobId)
      .maybeSingle();
    if (!job) return null;
    return loadJobAccessFacts(supabaseAdmin, userId, job.id, job.employer_id, type);
  }

  return null;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestStartedAt = Date.now();
  try {
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "OpenAI API key is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // verify_jwt=true at the platform level only checks that the bearer
    // token is a *validly signed* Supabase JWT — the public anon key is
    // itself one, so it clears that gate with no signed-in user behind it at
    // all. Every human caller must resolve to a real auth.getUser() identity
    // below; only the project's own service role key (used by
    // trigger-ava-analysis, which has already checked the requesting
    // human's permission on that application before it calls this function)
    // skips straight through as a trusted internal caller.
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isServiceRole = !!serviceRoleKey && bearerToken === serviceRoleKey;

    let callerId: string | null = null;
    if (!isServiceRole) {
      const supabaseUserClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: "Invalid authentication token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      callerId = user.id;
    }

    const {
      type,
      content,
      context,
      resumeUrl,
      resumeText,
      resumeImage,
      resumeImages,
      applicantName,
      applicationAnswers,
      coverLetter,
      applicationId,
      jobId,
    } = (await req.json()) as AnalyzeRequest;

    if (!type || !content) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: type and content" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // A team-lead job (trigger-ava-analysis says so in context.job_family)
    // is judged on the application only: see systemPromptFor.
    const systemPrompt = systemPromptFor(type, context?.job_family === "team_lead");
    if (!systemPrompt) {
      return new Response(
        JSON.stringify({ error: `Invalid analysis type: ${type}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isServiceRole) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
      const jobFacts = await resolveJobAccessFacts(supabaseAdmin, callerId!, type, applicationId, jobId);

      if (!isAiAnalyzeCallAuthorized({ type, isServiceRole: false, job: jobFacts })) {
        console.warn("[ai-analyze] Unauthorized analysis attempt", {
          requesterId: callerId,
          type,
          applicationId,
          jobId,
        });
        return new Response(
          JSON.stringify({ error: "You do not have permission to run this analysis" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const rateLimited = await guardAuthenticatedAiCall(`ai-analyze:${type}`, callerId!, corsHeaders, 20, 3600);
      if (rateLimited) return rateLimited;
    }

    const normalizedResumeImages = Array.isArray(resumeImages) && resumeImages.length > 0
      ? resumeImages.filter((entry) => !!entry?.base64)
      : resumeImage
        ? [{ base64: resumeImage, mimeType: "image/png" }]
        : [];
    const hasResumeText = !!resumeText?.trim();
    const hasResumeVisuals = normalizedResumeImages.length > 0;

    console.log(`Processing ${type} analysis request`);
    console.log(`Resume extraction: text=${hasResumeText}, imagePages=${normalizedResumeImages.length}, url=${!!resumeUrl}`);
    console.log(`Cross-reference data: applicantName=${!!applicantName}, answers=${applicationAnswers?.length || 0}, coverLetter=${!!coverLetter}`);

    let userContent = content;
    const resumeExtracted = hasResumeText || hasResumeVisuals;

    // Add cross-reference context data
    if (applicantName) {
      userContent += `\n\n--- APPLICANT NAME (for cross-reference) ---\n${applicantName}`;
    }

    if (coverLetter) {
      userContent += `\n\n--- COVER LETTER (for cross-reference) ---\n${coverLetter}`;
    }

    if (applicationAnswers && applicationAnswers.length > 0) {
      userContent += `\n\n--- APPLICATION ANSWERS (for cross-reference) ---`;
      applicationAnswers.forEach((qa, index) => {
        userContent += `\n\nQ${index + 1}: ${qa.question}\nA${index + 1}: ${qa.answer}`;
      });
    }

    // Add context if provided
    if (context) {
      userContent += `\n\n--- JOB CONTEXT ---\n${JSON.stringify(context, null, 2)}`;
    }

    if (hasResumeText) {
      userContent += `\n\n--- EXTRACTED RESUME TEXT ---\n${resumeText!.slice(0, 14000)}`;
    }

    if (type === "resume" || type === "application") {
      userContent += `\n\n--- RESUME EVIDENCE SUMMARY ---`;
      userContent += `\nResume URL: ${resumeUrl || "Not provided"}`;
      userContent += `\nResume text extracted: ${hasResumeText ? `Yes (${resumeText!.length} chars)` : "No"}`;
      userContent += `\nResume images attached: ${normalizedResumeImages.length}`;
    }

    // Build the messages array based on what resume data we have
    // Support vision for BOTH "resume" AND "application" types
    let messages: OpenAIMessage[];

    if ((hasResumeText || hasResumeVisuals) && (type === "resume" || type === "application")) {
      console.log(`Using resume evidence for ${type} analysis (text=${hasResumeText}, images=${normalizedResumeImages.length})`);

      const userMessageContent: NonNullable<OpenAIMessage["content"]> = [
        {
          type: "text",
          text:
            userContent +
            "\n\n--- ANALYSIS RULES ---\nUse the extracted resume text and attached resume pages together when both are available. If either source is incomplete or slightly inconsistent, note uncertainty instead of inventing details. Treat attached images as consecutive resume pages in order.",
        },
        ...normalizedResumeImages.slice(0, 3).map((image) => ({
          type: "image_url" as const,
          image_url: {
            url: `data:${image.mimeType || "image/png"};base64,${image.base64}`,
            detail: "high" as const,
          },
        })),
      ];

      messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: userMessageContent,
        },
      ];
    } else {
      // No resume image provided - analyze based on other application data
      console.log(`No direct resume evidence provided for ${type} analysis - will analyze based on other application data`);
      
      if (type === "resume" || type === "application") {
        userContent += `\n\n--- CRITICAL RESUME STATUS ---
**RESUME NOT PROVIDED FOR VISUAL ANALYSIS**

You MUST NOT claim to have reviewed, analyzed, or seen the resume/CV in any way.
You MUST NOT say things like "I reviewed the supporting document" or "based on the resume".
You MUST use status RESUME_UNAVAILABLE in your Document Validation section.
You MUST clearly state that your assessment is based ONLY on:
- Application form answers
- Assessment/phase results (quiz, typing test, interviews, etc.)
- Cover letter (if provided)

DO NOT CONTRADICT YOURSELF: If you mark resume as RESUME_UNAVAILABLE, you cannot later claim to have reviewed it.
Your skill match analysis should be based on what the candidate stated in their application answers, NOT a resume you did not see.`;
      }
      // No resume content available - analyze based on other data
      
      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ];
    }

    // A team-lead job (trigger-ava-analysis says so in context.job_family)
    // also gets the leadership and adaptability evidence sub-scores.
    const teamLead = context?.job_family === "team_lead";
    const structuredResponseInstruction = getStructuredResponseInstruction(type, { teamLead });
    const usedImages = hasResumeVisuals && (type === "resume" || type === "application");

    // Text-only fallback (no images) so screening NEVER dies on an unreadable/invalid resume
    // image — a candidate uploading a corrupt or unsupported scan must still get a real score.
    const textOnlyMessages: OpenAIMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          userContent +
          (usedImages
            ? "\n\n--- NOTE ---\nResume image(s) were attached but could not be processed. Assess from the application answers and any extracted resume text only; mark the resume as RESUME_UNAVAILABLE."
            : ""),
      },
    ];

    const withInstruction = (msgs: OpenAIMessage[]): OpenAIMessage[] =>
      structuredResponseInstruction
        ? msgs.length > 1
          ? [msgs[0], { role: "developer", content: structuredResponseInstruction }, ...msgs.slice(1)]
          : [{ role: "developer", content: structuredResponseInstruction }, ...msgs]
        : msgs;

    // Every call below shares this one deadline (see ANALYSIS_DEADLINE_MS);
    // the structured attempts stop early enough to leave the narrative
    // fallback its reserve (NARRATIVE_RESERVE_MS).
    const deadline = requestStartedAt + ANALYSIS_DEADLINE_MS;
    const structuredDeadline = deadline - NARRATIVE_RESERVE_MS;

    const runAnalysis = async (msgs: OpenAIMessage[]): Promise<{ analysis: string; structuredScore: StructuredScore | null }> => {
      if (structuredResponseInstruction) {
        try {
          // A bad or incomplete JSON reply counts as a failed attempt, the way
          // callOpenAIJson's validator did, but within the shared deadline.
          const structured = await withinDeadline(`structured ${type} analysis`, structuredDeadline, STRUCTURED_ATTEMPTS, async (timeoutMs) => {
            const result = await callOpenAIChat({
              apiKey: OPENAI_API_KEY!,
              model: OPENAI_MODEL,
              messages: withInstruction(msgs),
              maxCompletionTokens: 4500,
              temperature: 0,
              responseFormat: { type: "json_object" },
              timeoutMs,
              retries: 1,
            });
            const parsed = parseJsonContent<StructuredAnalyzeResponse>(result.content);
            const invalid = requireNestedJsonPaths(parsed, [
              "analysis",
              "structuredScore.overallScore",
              "structuredScore.directMatchScore",
              "structuredScore.transferableFitScore",
              "structuredScore.learningSignalScore",
              "structuredScore.hardRequirementConflicts",
              "structuredScore.transferableEvidence",
              "structuredScore.confidence",
              "structuredScore.summary",
            ]);
            if (invalid) throw new Error(invalid);
            return parsed;
          });
          return {
            analysis: structured.analysis ?? "",
            structuredScore: sanitizeStructuredScore(structured.structuredScore, { teamLead }),
          };
        } catch (structuredError) {
          if (refusesFallback(structuredError)) throw structuredError;
          console.warn(`[ai-analyze] Structured response failed for ${type}, falling back to narrative output:`, structuredError);
        }
      }
      const openAIResult = await withinDeadline(`narrative ${type} analysis`, deadline, NARRATIVE_ATTEMPTS, (timeoutMs) =>
        callOpenAIChat({
          apiKey: OPENAI_API_KEY!,
          model: OPENAI_MODEL,
          messages: msgs,
          maxCompletionTokens: 4000,
          ...(type === "interview" ? { temperature: 0.95 } : { temperature: 0 }),
          timeoutMs,
          retries: 1,
        }),
      );
      return { analysis: openAIResult.content ?? "", structuredScore: null };
    };

    let analysis = "";
    let structuredScore: StructuredScore | null = null;
    try {
      ({ analysis, structuredScore } = await runAnalysis(messages));
    } catch (visionError) {
      if (usedImages && !refusesFallback(visionError)) {
        console.warn(`[ai-analyze] vision analysis failed for ${type}, retrying text-only:`, visionError);
        ({ analysis, structuredScore } = await runAnalysis(textOnlyMessages));
      } else {
        throw visionError;
      }
    }

    const modelUsed = OPENAI_MODEL;
    const provider = "openai";

    console.log(`${type} analysis completed successfully via ${provider} (${modelUsed}), resumeExtracted: ${resumeExtracted}`);

    return new Response(
      JSON.stringify({
        analysis,
        type,
        timestamp: new Date().toISOString(),
        resumeExtracted,
        resumeDataUsed: {
          text: hasResumeText,
          imagePages: normalizedResumeImages.length,
        },
        structuredScore,
        model: modelUsed,
        provider,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    if (isAiUnavailable(error)) {
      // Nothing was read: no analysis to save, and nothing that would stop
      // a later run from scoring them.
      console.error(`[ai-analyze] AI service unavailable (${error.reason}); no analysis`);
      return aiUnavailableResponse(corsHeaders, { reason: error.reason });
    }
    console.error("Error in ai-analyze function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
