/**
 * submit-sales-simulation's pure grading/shape logic, split out of
 * index.ts so it can run under plain Node too (see
 * scripts/sales_simulation_grading.test.mjs) — index.ts itself calls
 * `Deno.serve(...)` at module load, which would throw immediately under
 * Node, so nothing with a top-level side effect can live in the same file
 * as anything a plain-Node test needs to import.
 *
 * Zero imports, zero I/O — every function here is a straight port of what
 * SalesSimulationPhase.tsx's own (now-removed) client-side handleSubmit used
 * to compute locally before writing `applications.notes` itself. Keeping it
 * here, not inline in index.ts, is what lets a test actually prove the
 * server-side computation still matches that original client logic on
 * realistic inputs, rather than just asserting against itself.
 */

export interface EvalChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AntiCheatViolation {
  type: "tab_switch" | "copy_attempt" | "paste_attempt" | "screenshot_attempt" | "right_click";
  timestamp?: string;
  details?: string;
}

export interface SalesEvaluation {
  score: number;
  discovery: number;
  objectionHandling: number;
  valueProposition: number;
  closingSkills: number;
  rapport: number;
  strengths: string[];
  improvements: string[];
  wouldBuy: string;
  overallFeedback: string;
}

// Verbatim copy of ai-sales-simulation/index.ts's own evaluate-mode system
// prompt (the parts that apply regardless of mode, plus the EVALUATION MODE
// JSON block) — same scenario framing, same required JSON keys. Keep this in
// sync if that prompt is ever intentionally changed; this is the identical
// grading call, just moved out of the public, unauthenticated endpoint.
export function buildEvaluationPrompt(params: {
  prospectName: string;
  prospectCompany: string;
  scenario: string;
  productService: string;
  candidateName: string;
}): string {
  const { prospectName, prospectCompany, scenario, productService, candidateName } = params;
  return `You are roleplaying as ${prospectName}, a decision-maker at ${prospectCompany} in a sales meeting simulation.

The sales representative you're meeting with is named ${candidateName}.
IMPORTANT: Use their name "${candidateName}" only in your FIRST message as a greeting, then do NOT repeat their name. After the initial greeting, just respond naturally without using their name. NEVER use placeholder text like [Sales Rep's Name], [Name], or any brackets.

SCENARIO: ${scenario}
PRODUCT/SERVICE BEING SOLD: ${productService}

YOUR ROLE AS THE PROSPECT:
- You are a busy professional who has agreed to this meeting/call
- You have a real business problem that COULD be solved by what's being sold, but you're skeptical
- You're evaluating multiple options and don't want to waste time
- You have budget constraints and need to justify any purchase to leadership

YOUR PERSONALITY & OBJECTIONS:
- Start somewhat neutral but guarded - you've heard many sales pitches
- Ask tough but fair questions about pricing, ROI, implementation, and support
- Raise common objections: "We're happy with our current solution", "Budget is tight", "Need to talk to my team", "Can you send me some materials?"
- If the salesperson handles objections well, become more engaged
- If they're pushy or don't listen, become more resistant
- React realistically to good discovery questions - share more about your pain points

REALISTIC OBJECTIONS TO USE (pick appropriate ones):
- "What makes you different from [competitor]?"
- "That's more than we budgeted for this quarter"
- "We tried something similar before and it didn't work out"
- "I need to run this by my team/boss first"
- "Can you prove the ROI you're claiming?"
- "We don't have bandwidth for implementation right now"
- "Send me a proposal and I'll look it over"

BUYING SIGNALS (if salesperson does well):
- Ask more detailed questions about features
- Discuss internal processes and who else should be involved
- Ask about pricing/packaging options
- Mention specific timelines or upcoming projects
- Share more pain points without being asked

EVALUATION MODE: Analyze the sales rep's performance and return JSON:
{
  "score": <number 0-100>,
  "discovery": <number 0-100 - how well they uncovered needs>,
  "objectionHandling": <number 0-100 - how well they addressed concerns>,
  "valueProposition": <number 0-100 - how well they articulated value>,
  "closingSkills": <number 0-100 - how well they advanced the deal>,
  "rapport": <number 0-100 - how well they built relationship>,
  "strengths": ["strength1", "strength2"],
  "improvements": ["area1", "area2"],
  "wouldBuy": "yes" | "maybe" | "no",
  "overallFeedback": "Summary of sales performance"
}`;
}

// ai-sales-simulation/index.ts's own callOpenAIJson fallback for evaluate
// mode (repeated JSON parse/validation failure from OpenAI itself).
export function parseFallbackEvaluation(): SalesEvaluation {
  return {
    score: 70,
    discovery: 70,
    objectionHandling: 70,
    valueProposition: 70,
    closingSkills: 70,
    rapport: 70,
    strengths: ["Completed simulation"],
    improvements: ["Unable to parse detailed evaluation"],
    wouldBuy: "maybe",
    overallFeedback: "Sales simulation completed successfully.",
  };
}

// SalesSimulationPhase.tsx's own former client-side default — used there
// whenever the (old, public) evaluate call didn't come back `ok` at all
// (missing OPENAI_API_KEY, network failure, non-2xx). Reproduced here so a
// candidate still completes the phase with the same generic passing scores
// on an AI outage, exactly as before, instead of getting stuck.
export function fetchFallbackEvaluation(): SalesEvaluation {
  return {
    score: 70,
    discovery: 70,
    objectionHandling: 70,
    valueProposition: 70,
    closingSkills: 70,
    rapport: 70,
    strengths: ["Completed simulation"],
    improvements: [],
    wouldBuy: "maybe",
    overallFeedback: "Simulation completed.",
  };
}

// Same double role-flip ai-sales-simulation/index.ts always applied to
// `messages` (which the browser had already pre-mapped salesRep -> "user",
// prospect -> "assistant" before sending): flip again here so the net
// mapping into the OpenAI call is byte-for-byte identical to today's
// (removed) evaluate call, whatever that mapping's own merits.
export function buildApiMessages(
  systemPrompt: string,
  messages: EvalChatMessage[],
  userContent: string,
): { role: "system" | "user" | "assistant"; content: string }[] {
  return [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role === "user" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
    { role: "user" as const, content: userContent },
  ];
}

export interface AntiCheatSummary {
  hasViolations: boolean;
  violationCount: number;
  tabSwitches: number;
  copyPasteAttempts: number;
}

// Exactly SalesSimulationPhase.tsx's own (former) antiCheatLog computation —
// see its handleSubmit's client-side antiCheatLog/antiCheatSummary object.
export function computeAntiCheatSummary(violations: AntiCheatViolation[]): AntiCheatSummary {
  const tabSwitches = violations.filter((v) => v.type === "tab_switch").length;
  const copyAttempts = violations.filter((v) => v.type === "copy_attempt").length;
  const pasteAttempts = violations.filter((v) => v.type === "paste_attempt").length;
  return {
    hasViolations: violations.length > 0,
    violationCount: violations.length,
    tabSwitches,
    copyPasteAttempts: copyAttempts + pasteAttempts,
  };
}

export interface SalesSimulationResult {
  scenario: string;
  prospectCompany: string;
  messageCount: number;
  score: number;
  discovery: number;
  objectionHandling: number;
  valueProposition: number;
  closingSkills: number;
  wouldBuy: string;
  strengths: string[];
  improvements: string[];
  completed: true;
  antiCheatSummary: AntiCheatSummary;
}

// Matches SalesSimulationPhase.tsx's own (former) `updatedNotes.salesSimulationResult`
// shape exactly, field for field — see docs/TRUSTED-RESULTS.md's result_key
// table (salesSimulationResult: no legacyStepEntry, no extraNotesEntries;
// the fuller transcript/messages/metrics object it used to also write at
// notes[stepId] has no live reader — see that table's citations — so it is
// not reproduced here).
export function buildSalesSimulationResult(params: {
  scenario: string;
  prospectCompany: string;
  messageCount: number;
  evaluation: SalesEvaluation;
  violations: AntiCheatViolation[];
}): SalesSimulationResult {
  const { scenario, prospectCompany, messageCount, evaluation, violations } = params;
  return {
    scenario,
    prospectCompany,
    messageCount,
    score: evaluation.score,
    discovery: evaluation.discovery,
    objectionHandling: evaluation.objectionHandling,
    valueProposition: evaluation.valueProposition,
    closingSkills: evaluation.closingSkills,
    wouldBuy: evaluation.wouldBuy,
    strengths: evaluation.strengths,
    improvements: evaluation.improvements,
    completed: true,
    antiCheatSummary: computeAntiCheatSummary(violations),
  };
}

// SalesSimulationPhase.tsx's own (former) client-side write of
// phase_ai_analysis, unchanged — see index.ts's best-effort follow-up write.
export function buildPhaseAiAnalysis(evaluation: SalesEvaluation): string {
  return `Sales simulation: ${evaluation.score}%. Discovery: ${evaluation.discovery}%, Objection handling: ${evaluation.objectionHandling}%. Would buy: ${evaluation.wouldBuy}.`;
}
