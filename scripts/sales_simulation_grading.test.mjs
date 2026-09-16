#!/usr/bin/env node
/**
 * Plain-Node test of submit-sales-simulation/grading.ts's pure logic —
 * same style as scripts/trusted_results_logic.test.mjs, runs directly
 * against the REAL server file (no copy).
 *
 * Compares the server-side computation against TODAY'S client logic —
 * reconstructed below, byte-for-byte, from SalesSimulationPhase.tsx's own
 * (now-removed) handleSubmit, git blob 40e17d8:src/pages/SalesSimulationPhase.tsx
 * lines 618-661 — on realistic transcripts/evaluations/violation logs, so
 * this proves the server didn't just invent a shape that happens to look
 * right, but reproduces the exact thing the candidate's own browser used to
 * compute.
 *
 * Run with: node scripts/sales_simulation_grading.test.mjs
 */
import {
  buildApiMessages,
  buildPhaseAiAnalysis,
  buildSalesSimulationResult,
  computeAntiCheatSummary,
  fetchFallbackEvaluation,
  parseFallbackEvaluation,
} from "../supabase/functions/submit-sales-simulation/grading.ts";

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ============================================================================
// Reference implementation — SalesSimulationPhase.tsx's own former
// client-side computation, transcribed verbatim (git blob
// 40e17d8:src/pages/SalesSimulationPhase.tsx:618-661), NOT imported from
// grading.ts, so this test actually compares two independent
// implementations rather than a function against itself.
// ============================================================================

function clientAntiCheatLog(violations) {
  return {
    violations,
    totalViolations: violations.length,
    tabSwitches: violations.filter((v) => v.type === "tab_switch").length,
    copyAttempts: violations.filter((v) => v.type === "copy_attempt").length,
    pasteAttempts: violations.filter((v) => v.type === "paste_attempt").length,
    screenshotAttempts: violations.filter((v) => v.type === "screenshot_attempt").length,
    rightClickAttempts: violations.filter((v) => v.type === "right_click").length,
  };
}

function clientSalesSimulationResult({ scenario, prospectCompany, messages, evaluation, violations }) {
  const antiCheatLog = clientAntiCheatLog(violations);
  return {
    scenario,
    prospectCompany,
    messageCount: messages.length,
    score: evaluation.score,
    discovery: evaluation.discovery,
    objectionHandling: evaluation.objectionHandling,
    valueProposition: evaluation.valueProposition,
    closingSkills: evaluation.closingSkills,
    wouldBuy: evaluation.wouldBuy,
    strengths: evaluation.strengths,
    improvements: evaluation.improvements,
    completed: true,
    antiCheatSummary: {
      hasViolations: violations.length > 0,
      violationCount: violations.length,
      tabSwitches: antiCheatLog.tabSwitches,
      copyPasteAttempts: antiCheatLog.copyAttempts + antiCheatLog.pasteAttempts,
    },
  };
}

function clientFetchFallbackEvaluation() {
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

// ai-sales-simulation/index.ts's own (pre-conversion) callOpenAIJson
// fallback for evaluate mode, git blob
// 40e17d8:supabase/functions/ai-sales-simulation/index.ts:161-178.
function serverParseFallbackEvaluation() {
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

// The old ai-sales-simulation/index.ts's own apiMessages role-flip (applied
// to messages the client had ALREADY pre-mapped salesRep -> "user",
// prospect -> "assistant"), git blob
// 40e17d8:supabase/functions/ai-sales-simulation/index.ts:139-146.
function clientApiMessages(systemPrompt, messages, userContent) {
  return [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({ role: m.role === "user" ? "assistant" : "user", content: m.content })),
    { role: "user", content: userContent },
  ];
}

// ============================================================================
// Realistic fixtures
// ============================================================================

const realisticTranscript = [
  { role: "user", content: "Hi, thanks for taking the call — I wanted to understand what's slowing down your ops team today." },
  { role: "assistant", content: "We're happy with our current solution, honestly." },
  { role: "user", content: "Totally fair — what does that vendor handle well that you'd want us to match?" },
  { role: "assistant", content: "Reporting mostly. Implementation was rough though." },
  { role: "user", content: "Got it — our onboarding is white-glove, two weeks typical. Would that timeline work for your team?" },
  { role: "assistant", content: "Maybe. Send me a proposal and I'll look it over." },
];

const realisticEvaluation = {
  score: 74,
  discovery: 80,
  objectionHandling: 65,
  valueProposition: 78,
  closingSkills: 60,
  rapport: 72,
  strengths: ["Asked strong discovery questions", "Handled the 'happy with current vendor' objection well"],
  improvements: ["Could have pushed harder for a concrete next step"],
  wouldBuy: "maybe",
  overallFeedback: "Solid discovery, needs a firmer close.",
};

const violationsHeavy = [
  { type: "tab_switch", timestamp: "t1", details: "switched tabs" },
  { type: "tab_switch", timestamp: "t2", details: "switched tabs" },
  { type: "copy_attempt", timestamp: "t3", details: "ctrl+c" },
  { type: "paste_attempt", timestamp: "t4", details: "ctrl+v" },
  { type: "paste_attempt", timestamp: "t5", details: "ctrl+v" },
  { type: "screenshot_attempt", timestamp: "t6", details: "printscreen" },
  { type: "right_click", timestamp: "t7", details: "right click" },
];

const violationsNone = [];

// ============================================================================
console.log("1. buildSalesSimulationResult matches the client's own shape:\n");

for (const [label, violations] of [["clean run", violationsNone], ["with anti-cheat violations", violationsHeavy]]) {
  const serverResult = buildSalesSimulationResult({
    scenario: "Mid-size tech company evaluating vendors.",
    prospectCompany: "TechFlow Solutions",
    messageCount: realisticTranscript.length,
    evaluation: realisticEvaluation,
    violations,
  });
  const clientResult = clientSalesSimulationResult({
    scenario: "Mid-size tech company evaluating vendors.",
    prospectCompany: "TechFlow Solutions",
    messages: realisticTranscript,
    evaluation: realisticEvaluation,
    violations,
  });

  check(
    `buildSalesSimulationResult (${label}): matches the client's own field-for-field shape`,
    deepEqual(serverResult, clientResult),
    `server=${JSON.stringify(serverResult)} client=${JSON.stringify(clientResult)}`,
  );
}

check(
  "buildSalesSimulationResult: completed is always the literal true",
  buildSalesSimulationResult({
    scenario: "s", prospectCompany: "c", messageCount: 0, evaluation: realisticEvaluation, violations: [],
  }).completed === true,
);

console.log("\n2. computeAntiCheatSummary matches the client's own tallies:\n");

for (const [label, violations] of [["empty", violationsNone], ["mixed violations", violationsHeavy]]) {
  const serverSummary = computeAntiCheatSummary(violations);
  const clientLog = clientAntiCheatLog(violations);
  const clientSummary = {
    hasViolations: violations.length > 0,
    violationCount: violations.length,
    tabSwitches: clientLog.tabSwitches,
    copyPasteAttempts: clientLog.copyAttempts + clientLog.pasteAttempts,
  };
  check(
    `computeAntiCheatSummary (${label}): matches the client's own tally`,
    deepEqual(serverSummary, clientSummary),
    `server=${JSON.stringify(serverSummary)} client=${JSON.stringify(clientSummary)}`,
  );
}

check(
  "computeAntiCheatSummary: screenshot/right-click violations count toward violationCount but not the two named tallies",
  deepEqual(computeAntiCheatSummary(violationsHeavy), {
    hasViolations: true,
    violationCount: 7,
    tabSwitches: 2,
    copyPasteAttempts: 3, // 1 copy + 2 paste
  }),
);

console.log("\n3. Fallback evaluations match the client's / old public function's own defaults exactly:\n");

check(
  "fetchFallbackEvaluation matches SalesSimulationPhase.tsx's own former client-side default",
  deepEqual(fetchFallbackEvaluation(), clientFetchFallbackEvaluation()),
);
check(
  "parseFallbackEvaluation matches ai-sales-simulation/index.ts's own former evaluate-mode fallback",
  deepEqual(parseFallbackEvaluation(), serverParseFallbackEvaluation()),
);
check(
  "the two fallbacks are deliberately different shapes (improvements text differs) — not accidentally merged into one",
  !deepEqual(fetchFallbackEvaluation(), parseFallbackEvaluation()),
);

console.log("\n4. buildApiMessages reproduces the old public function's exact double role-flip:\n");

for (const [label, messages] of [
  ["empty transcript", []],
  ["realistic transcript", realisticTranscript],
]) {
  const systemPrompt = "SYSTEM_PROMPT";
  const userContent = "USER_CONTENT";
  const serverMessages = buildApiMessages(systemPrompt, messages, userContent);
  const clientMessages = clientApiMessages(systemPrompt, messages, userContent);
  check(
    `buildApiMessages (${label}): identical to the old public function's own role-flip`,
    deepEqual(serverMessages, clientMessages),
    `server=${JSON.stringify(serverMessages)} client=${JSON.stringify(clientMessages)}`,
  );
}

// A message the client had pre-mapped to "user" (originally salesRep) must
// end up "assistant" for OpenAI — the double flip's net effect, whatever
// its own merits (see grading.ts's own comment on this).
check(
  "buildApiMessages: a client-mapped 'user' (originally salesRep) message nets out as 'assistant' to OpenAI",
  buildApiMessages("sp", [{ role: "user", content: "pitch" }], "uc")[1].role === "assistant",
);
check(
  "buildApiMessages: a client-mapped 'assistant' (originally prospect) message nets out as 'user' to OpenAI",
  buildApiMessages("sp", [{ role: "assistant", content: "objection" }], "uc")[1].role === "user",
);

console.log("\n5. buildPhaseAiAnalysis matches the client's own former phase_ai_analysis text:\n");

check(
  "buildPhaseAiAnalysis matches SalesSimulationPhase.tsx's own former template string exactly",
  buildPhaseAiAnalysis(realisticEvaluation) ===
    `Sales simulation: ${realisticEvaluation.score}%. Discovery: ${realisticEvaluation.discovery}%, Objection handling: ${realisticEvaluation.objectionHandling}%. Would buy: ${realisticEvaluation.wouldBuy}.`,
);

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exitCode = 1;
