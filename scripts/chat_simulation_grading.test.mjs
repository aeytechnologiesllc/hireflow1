#!/usr/bin/env node
/**
 * Plain-Node test of supabase/functions/ai-chat-simulation/grading.ts —
 * the pure pieces of the server-side "evaluate" write (everything except
 * the actual OpenAI scoring call). Same style as
 * scripts/trusted_results_logic.test.mjs: runs directly against the REAL
 * source file (no copy), imported straight from its .ts path (Node strips
 * types natively on this engines.node — see package.json).
 *
 * Proves buildChatSimulationResult/buildPhaseAiAnalysis reproduce EXACTLY
 * the shape ChatSimulationPhase.tsx's own client code used to build locally
 * before this conversion (see the git history of that file's handleSubmit,
 * and docs/TRUSTED-RESULTS.md's result_key table for chatSimulationResult):
 *
 *   chatSimulationResult: {
 *     scenario, messageCount, score, empathy, problemSolving,
 *     strengths, improvements, completed: true,
 *     antiCheatSummary: { hasViolations, violationCount, tabSwitches, copyPasteAttempts },
 *   }
 *   phase_ai_analysis: `Chat simulation: ${score}%. Empathy: ${empathy}%, Problem-solving: ${problemSolving}%.`
 *
 * across realistic inputs: no violations, a mix of every violation type,
 * repeated violations of the same type, and an evaluation carrying extra
 * fields (as the real OpenAI JSON response always does) that must NOT leak
 * into the result.
 *
 * Run with: node scripts/chat_simulation_grading.test.mjs
 */
import {
  buildAntiCheatLog,
  buildChatSimulationResult,
  buildPhaseAiAnalysis,
} from "../supabase/functions/ai-chat-simulation/grading.ts";

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
console.log("buildAntiCheatLog:\n");

const noViolations = buildAntiCheatLog([]);
check("no violations: every counter is 0", deepEqual(noViolations, {
  violations: [],
  totalViolations: 0,
  tabSwitches: 0,
  copyAttempts: 0,
  pasteAttempts: 0,
  screenshotAttempts: 0,
  rightClickAttempts: 0,
}));

const mixedViolations = [
  { type: "tab_switch", timestamp: "t1", details: "switched tabs" },
  { type: "tab_switch", timestamp: "t2", details: "switched tabs again" },
  { type: "copy_attempt", timestamp: "t3", details: "tried to copy" },
  { type: "paste_attempt", timestamp: "t4", details: "tried to paste" },
  { type: "screenshot_attempt", timestamp: "t5", details: "printscreen" },
  { type: "right_click", timestamp: "t6", details: "right click" },
];
const mixedLog = buildAntiCheatLog(mixedViolations);
check("mixed violations: totalViolations counts every entry", mixedLog.totalViolations === 6);
check("mixed violations: tabSwitches counts only tab_switch entries", mixedLog.tabSwitches === 2);
check("mixed violations: copyAttempts counts only copy_attempt entries", mixedLog.copyAttempts === 1);
check("mixed violations: pasteAttempts counts only paste_attempt entries", mixedLog.pasteAttempts === 1);
check("mixed violations: screenshotAttempts counts only screenshot_attempt entries", mixedLog.screenshotAttempts === 1);
check("mixed violations: rightClickAttempts counts only right_click entries", mixedLog.rightClickAttempts === 1);
check("mixed violations: the raw violations array passes through unchanged", deepEqual(mixedLog.violations, mixedViolations));

// ============================================================================
console.log("\nbuildChatSimulationResult:\n");

const realisticEvaluation = {
  score: 82,
  empathy: 90,
  problemSolving: 75,
  communication: 80,
  professionalism: 85,
  strengths: ["Stayed calm", "Offered a clear resolution"],
  improvements: ["Could confirm details sooner"],
  overallFeedback: "Solid performance overall.",
};

const resultNoViolations = buildChatSimulationResult({
  scenario: "Billing dispute - charged twice.",
  messageCount: 7,
  evaluation: realisticEvaluation,
  violations: [],
});

check(
  "no violations: matches the exact legacy client shape",
  deepEqual(resultNoViolations, {
    scenario: "Billing dispute - charged twice.",
    messageCount: 7,
    score: 82,
    empathy: 90,
    problemSolving: 75,
    strengths: ["Stayed calm", "Offered a clear resolution"],
    improvements: ["Could confirm details sooner"],
    completed: true,
    antiCheatSummary: {
      hasViolations: false,
      violationCount: 0,
      tabSwitches: 0,
      copyPasteAttempts: 0,
    },
  }),
  JSON.stringify(resultNoViolations),
);

check(
  "extra fields on `evaluation` (communication, professionalism, overallFeedback — real OpenAI JSON always has more keys than the shape) do not leak into the result",
  !("communication" in resultNoViolations) &&
    !("professionalism" in resultNoViolations) &&
    !("overallFeedback" in resultNoViolations),
);

const resultWithViolations = buildChatSimulationResult({
  scenario: "Delivery issue - stuck in transit.",
  messageCount: 5,
  evaluation: { ...realisticEvaluation, score: 40 },
  violations: mixedViolations,
});

check(
  "with violations: antiCheatSummary.hasViolations is true",
  resultWithViolations.antiCheatSummary.hasViolations === true,
);
check(
  "with violations: antiCheatSummary.violationCount counts every entry, same as totalViolations",
  resultWithViolations.antiCheatSummary.violationCount === 6,
);
check(
  "with violations: antiCheatSummary.tabSwitches matches buildAntiCheatLog's own tabSwitches",
  resultWithViolations.antiCheatSummary.tabSwitches === mixedLog.tabSwitches,
);
check(
  "with violations: antiCheatSummary.copyPasteAttempts is copyAttempts + pasteAttempts combined (legacy client's own formula)",
  resultWithViolations.antiCheatSummary.copyPasteAttempts === mixedLog.copyAttempts + mixedLog.pasteAttempts,
);
check(
  "with violations: the raw per-violation log (timestamps, details) is NOT part of chatSimulationResult — only the summary is (legacy client's notes[stepId] carried the raw log; chatSimulationResult never did)",
  !("violations" in resultWithViolations.antiCheatSummary) && !("violations" in resultWithViolations),
);

check(
  "completed is always the literal `true`",
  resultNoViolations.completed === true && resultWithViolations.completed === true,
);

// ============================================================================
console.log("\nbuildPhaseAiAnalysis:\n");

check(
  "matches the exact legacy client string, including punctuation/spacing",
  buildPhaseAiAnalysis(realisticEvaluation) ===
    "Chat simulation: 82%. Empathy: 90%, Problem-solving: 75%.",
  buildPhaseAiAnalysis(realisticEvaluation),
);

check(
  "a fallback-shaped evaluation (score 70, the callOpenAIJson default) formats the same way",
  buildPhaseAiAnalysis({
    score: 70,
    empathy: 70,
    problemSolving: 70,
    strengths: ["Completed simulation"],
    improvements: ["Unable to parse detailed evaluation"],
  }) === "Chat simulation: 70%. Empathy: 70%, Problem-solving: 70%.",
);

check(
  "a score of 0 still renders (falsy-but-valid number, not swallowed)",
  buildPhaseAiAnalysis({ ...realisticEvaluation, score: 0, empathy: 0, problemSolving: 0 }) ===
    "Chat simulation: 0%. Empathy: 0%, Problem-solving: 0%.",
);

// ============================================================================
console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
