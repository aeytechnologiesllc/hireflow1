#!/usr/bin/env node
/**
 * Plain-Node test of supabase/functions/ai-chat-interview/resultShape.ts —
 * the pure, import-free builders the new "submit" mode uses to produce
 * notes.chatInterviewResult / applications.phase_ai_analysis server-side.
 *
 * Proves buildChatInterviewResult reproduces, byte-for-byte, what
 * src/pages/ChatInterviewPhase.tsx used to compute client-side in its two
 * write sites (the auto-end effect and handleSubmit), for realistic inputs
 * — matching "today's client logic" this conversion moved server-side,
 * never inventing a new merged shape. See resultShape.ts's own header
 * comment for the two shapes this pins.
 *
 * Run with: node scripts/chat_interview_result_shape.test.mjs
 */
import { buildChatInterviewResult, buildPhaseAiAnalysis } from "../supabase/functions/ai-chat-interview/resultShape.ts";

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

const evaluation = {
  score: 82,
  strengths: ["Clear communicator", "Strong technical depth"],
  concerns: ["Vague on team conflict example"],
  recommendation: "Hire",
  summary: "Solid candidate, matched their claimed experience.",
};

const messages = [
  { role: "assistant", content: "Hi! Tell me about your background.", timestamp: "2026-09-16T10:00:00.000Z" },
  { role: "user", content: "I've been a support lead for 4 years.", timestamp: "2026-09-16T10:00:20.000Z" },
];

const violations = [
  { type: "tab_switch", timestamp: "2026-09-16T10:01:00.000Z", details: "Window lost focus" },
  { type: "tab_switch", timestamp: "2026-09-16T10:02:00.000Z", details: "User switched to another tab or window" },
  { type: "copy_attempt", timestamp: "2026-09-16T10:03:00.000Z", details: "User pressed Ctrl/Cmd+C" },
  { type: "paste_attempt", timestamp: "2026-09-16T10:03:10.000Z", details: "User pressed Ctrl/Cmd+V" },
];

console.log("buildChatInterviewResult — auto_end path (old ChatInterviewPhase.tsx autoEndTriggered effect):\n");

const autoEndNoViolations = buildChatInterviewResult({
  path: "auto_end",
  messages,
  duration: "3:45",
  questionCount: 6,
  violations: [],
  evaluation,
});

check(
  "matches the client's old shape exactly: { messages, duration, questionCount, violations, evaluation }",
  deepEqual(autoEndNoViolations, {
    messages,
    duration: "3:45",
    questionCount: 6,
    evaluation,
  }),
  JSON.stringify(autoEndNoViolations),
);
check(
  "duration stays a string (the client's own getDuration() mm:ss format) — never coerced to a number",
  typeof autoEndNoViolations.duration === "string",
);
check(
  "zero violations means the key is absent after JSON.stringify (undefined), same as the old ternary",
  JSON.parse(JSON.stringify(autoEndNoViolations)).violations === undefined,
);

const autoEndWithViolations = buildChatInterviewResult({
  path: "auto_end",
  messages,
  duration: "3:45",
  questionCount: 6,
  violations,
  evaluation,
});

check(
  "non-empty violations array is carried through verbatim",
  deepEqual(autoEndWithViolations.violations, violations),
);
check(
  "auto_end evaluation is nested as-is — score/recommendation live under .evaluation, not flattened",
  autoEndWithViolations.evaluation === evaluation && autoEndWithViolations.score === undefined,
);
check(
  "auto_end shape never carries messageCount, strengths, concerns, completed, or antiCheatSummary — those are the manual shape's fields",
  autoEndWithViolations.messageCount === undefined &&
    autoEndWithViolations.strengths === undefined &&
    autoEndWithViolations.completed === undefined &&
    autoEndWithViolations.antiCheatSummary === undefined,
);

console.log("\nbuildChatInterviewResult — manual path (old ChatInterviewPhase.tsx handleSubmit):\n");

const manualResult = buildChatInterviewResult({
  path: "manual",
  messages,
  duration: 225,
  questionCount: 6,
  violations,
  evaluation,
});

check(
  "matches the client's old flattened shape exactly",
  deepEqual(manualResult, {
    messageCount: 2,
    duration: 225,
    score: 82,
    strengths: ["Clear communicator", "Strong technical depth"],
    concerns: ["Vague on team conflict example"],
    recommendation: "Hire",
    completed: true,
    antiCheatSummary: {
      hasViolations: true,
      violationCount: 4,
      tabSwitches: 2,
      copyPasteAttempts: 2,
    },
  }),
  JSON.stringify(manualResult),
);
check(
  "duration stays a number (elapsed seconds) — never coerced to a string, unlike the auto_end path",
  typeof manualResult.duration === "number",
);
check(
  "messageCount is derived from messages.length, matching the old messages.length write",
  manualResult.messageCount === messages.length,
);
check(
  "manual shape never carries the raw transcript or a nested evaluation object — those are the auto_end shape's fields",
  manualResult.messages === undefined && manualResult.evaluation === undefined,
);

const manualNoViolations = buildChatInterviewResult({
  path: "manual",
  messages,
  duration: 60,
  questionCount: 5,
  violations: [],
  evaluation,
});
check(
  "antiCheatSummary.hasViolations is false and every count is 0 with no violations logged",
  deepEqual(manualNoViolations.antiCheatSummary, {
    hasViolations: false,
    violationCount: 0,
    tabSwitches: 0,
    copyPasteAttempts: 0,
  }),
);

console.log("\nbuildChatInterviewResult — anti-cheat counting matches the client's own per-type filters:\n");

const mixedViolations = [
  { type: "tab_switch", timestamp: "t", details: "d" },
  { type: "screenshot_attempt", timestamp: "t", details: "d" },
  { type: "right_click", timestamp: "t", details: "d" },
  { type: "right_click", timestamp: "t", details: "d" },
];
const mixedResult = buildChatInterviewResult({
  path: "manual",
  messages,
  duration: 10,
  questionCount: 1,
  violations: mixedViolations,
  evaluation,
});
check(
  "tabSwitches counts only tab_switch; copyPasteAttempts is copy_attempt + paste_attempt (0 here); screenshot/right_click don't inflate either bucket",
  deepEqual(mixedResult.antiCheatSummary, {
    hasViolations: true,
    violationCount: 4,
    tabSwitches: 1,
    copyPasteAttempts: 0,
  }),
);

console.log("\nbuildPhaseAiAnalysis — matches each entry point's own client-side string:\n");

check(
  "auto_end: evaluation.summary verbatim (old: evaluation?.summary || null)",
  buildPhaseAiAnalysis("auto_end", evaluation) === evaluation.summary,
);
check(
  "auto_end: falls back to null when summary is missing, same as the old || null",
  buildPhaseAiAnalysis("auto_end", { score: 50 }) === null,
);
check(
  "manual: 'Interview: {recommendation} ({score}%). {summary}', matching the old template literal exactly",
  buildPhaseAiAnalysis("manual", evaluation) ===
    "Interview: Hire (82%). Solid candidate, matched their claimed experience.",
);

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
