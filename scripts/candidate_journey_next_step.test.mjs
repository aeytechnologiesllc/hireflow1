/**
 * nextJourneyStep — the one rule behind the employer's "Let them take the
 * next test" control (src/lib/candidateJourney.ts), proved against the
 * journeys real jobs produce. Imported live, never re-implemented.
 *
 *   node scripts/candidate_journey_next_step.test.mjs
 */
import { buildCandidateJourney, nextJourneyStep, DECISION_STAGE_ID } from "../src/lib/candidateJourney.ts";

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

// The Zulu job's shape: quiz on its own column, then typing → chat → interview.
const ZULU_STEPS = [
  { id: "step_typing", type: "typing_test", title: "Typing speed and accuracy" },
  { id: "step_chat", type: "chat_simulation", title: "Player chat practice" },
  { id: "step_interview", type: "chat_interview", title: "Written interview" },
];
const zulu = buildCandidateJourney(ZULU_STEPS, { hasQuiz: true });
const noQuiz = buildCandidateJourney(ZULU_STEPS, { hasQuiz: false });

check("journey shape is application → quiz → 3 steps → decision",
  zulu.map((s) => s.id).join(",") === `application,quiz,step_typing,step_chat,step_interview,${DECISION_STAGE_ID}`,
  zulu.map((s) => s.id).join(","));

// Held at the application (Ava recommended declining) → the quiz opens.
let next = nextJourneyStep(zulu, { phase: "application", status: "reviewing" });
check("held at the application → next is the quiz", next?.id === "quiz" && next.title === "Skills check", JSON.stringify(next));

// Same job without a quiz → the first workflow step opens.
next = nextJourneyStep(noQuiz, { phase: "application", status: "reviewing" });
check("no quiz → next is the typing test", next?.id === "step_typing", JSON.stringify(next));

// Mid-journey holds walk the configured order, titles intact.
next = nextJourneyStep(zulu, { phase: "quiz", status: "reviewing" });
check("after the quiz → typing test", next?.id === "step_typing" && next.title === "Typing speed and accuracy", JSON.stringify(next));
next = nextJourneyStep(zulu, { phase: "step_typing", status: "reviewing" });
check("after typing → chat practice", next?.id === "step_chat", JSON.stringify(next));
next = nextJourneyStep(zulu, { phase: "step_chat", status: "reviewing" });
check("after chat → written interview", next?.id === "step_interview", JSON.stringify(next));

// The last real step: what comes next is the team's decision, not a step to
// unlock — the control must disappear rather than push the phase to "decision".
next = nextJourneyStep(zulu, { phase: "step_interview", status: "reviewing" });
check("after the last real step → nothing to open", next === null, JSON.stringify(next));

// With the computer and connection check first among the workflow steps
// (docs/EQUIPMENT-CHECK.md §2): the hold after the quiz opens it, the hold
// after it opens typing, and an untitled step gets the candidate title.
const withConnection = buildCandidateJourney([{ id: "step_connection", type: "equipment_check" }, ...ZULU_STEPS], { hasQuiz: true });
check("connection first: application → quiz → connection → typing → chat → interview → decision",
  withConnection.map((s) => s.id).join(",") === `application,quiz,step_connection,step_typing,step_chat,step_interview,${DECISION_STAGE_ID}`,
  withConnection.map((s) => s.id).join(","));
next = nextJourneyStep(withConnection, { phase: "quiz", status: "reviewing" });
check("after the quiz → the connection check, titled for the candidate", next?.id === "step_connection" && next.title === "Your computer and connection", JSON.stringify(next));
next = nextJourneyStep(withConnection, { phase: "step_connection", status: "reviewing" });
check("after the connection check → typing", next?.id === "step_typing", JSON.stringify(next));

// Legacy / terminal phases resolve to the Decision stage and offer nothing.
for (const phase of ["review", "interview", "hired", "rejected", DECISION_STAGE_ID]) {
  next = nextJourneyStep(zulu, { phase, status: "reviewing" });
  check(`phase "${phase}" → nothing to open`, next === null, JSON.stringify(next));
}

// A phase id the job doesn't know, with a submitted status, lands on Decision too.
next = nextJourneyStep(zulu, { phase: "step_from_an_older_plan", status: "pending" });
check("unknown phase + submitted → nothing to open", next === null, JSON.stringify(next));

// A journey with nothing but application + decision has no step to open.
next = nextJourneyStep(buildCandidateJourney([], { hasQuiz: false }), { phase: "application", status: "reviewing" });
check("application-only job → nothing to open", next === null, JSON.stringify(next));

// Machine words never reach the employer either: the title is sanitised the
// same way the candidate sees it.
const avaNamed = buildCandidateJourney([{ id: "s1", type: "chat_interview", title: "Interview with Ava" }], { hasQuiz: false });
next = nextJourneyStep(avaNamed, { phase: "application", status: "reviewing" });
check("'Interview with Ava' is shown as the fallback title", next?.title === "Chat interview", JSON.stringify(next));

// Empty steps never throw.
check("empty journey → null", nextJourneyStep([], { phase: "application", status: "reviewing" }) === null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

// ---------------------------------------------------------------------------
// stepHasResult — the "is the candidate parked here?" half of the control.
// ---------------------------------------------------------------------------
const { stepHasResult } = await import("../src/lib/journeyProgress.ts");
const app = { id: "application", type: "application" };
check("application with answers on file is done", stepHasResult({ applicationAnswers: [{ q: "a" }] }, null, app) === true);
check("application with no answers is not done", stepHasResult({}, null, app) === false);
check("quiz is done once quizResult is on file", stepHasResult({ quizResult: { score: 70 } }, null, { id: "quiz", type: "quiz" }) === true);
check("quiz is done once its own record is completed", stepHasResult({ quiz: { completedAt: "2026-10-04" } }, null, { id: "quiz", type: "quiz" }) === true);
check("quiz not taken is not done", stepHasResult({}, null, { id: "quiz", type: "quiz" }) === false);
check("typing test done", stepHasResult({ typingTestResult: { wpm: 50 } }, null, { id: "s", type: "typing_test" }) === true);
check("typing test not done", stepHasResult({}, null, { id: "s", type: "typing_test" }) === false);
check("connection check done once equipmentCheckResult is on file", stepHasResult({ equipmentCheckResult: { downloadMbps: 28.4 } }, null, { id: "step_connection", type: "equipment_check" }) === true);
check("connection check not done", stepHasResult({}, null, { id: "step_connection", type: "equipment_check" }) === false);
check("connection check: its legacy entry alone is not a result (an explicit case, not the fallback)", stepHasResult({ step_connection: { type: "equipment_check" } }, null, { id: "step_connection", type: "equipment_check" }) === false);
check("chat simulation done", stepHasResult({ chatSimulationResult: { score: 80 } }, null, { id: "s", type: "chat_simulation" }) === true);
check("chat interview done", stepHasResult({ chatInterviewResult: { score: 80 } }, null, { id: "s", type: "chat_interview" }) === true);
check("voice interview done only via its own column", stepHasResult({}, { score: 1 }, { id: "s", type: "voice_interview" }) === true && stepHasResult({}, null, { id: "s", type: "voice_interview" }) === false);
check("decision counts as done", stepHasResult({}, null, { id: "decision", type: "decision" }) === true);
check("unknown step type falls back to its own notes record", stepHasResult({ s9: { anything: 1 } }, null, { id: "s9", type: "mystery" }) === true && stepHasResult({}, null, { id: "s9", type: "mystery" }) === false);

console.log(`\n${passed} passed, ${failed} failed (with stepHasResult)`);
if (failed > 0) process.exit(1);
