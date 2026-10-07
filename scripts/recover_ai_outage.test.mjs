#!/usr/bin/env node
/**
 * Tests for scripts/recover-ai-outage.mjs: the plan it builds from database
 * rows (who gets scored, who is listed and why), how it reads the health call
 * and trigger-ava-analysis answers, and its options. Plain assertions, no
 * framework, no network: importing the script must not run it.
 *
 * The fixtures copy the shapes production held during and after the AI outage
 * of 2026-10-07 (notes as JSON text, Postgres timestamps, the outageRetake
 * marker the 02:15 reset wrote, reply_failed markers with no AI reply after).
 *
 * Run with: node scripts/recover_ai_outage.test.mjs
 */
import { readFileSync } from "node:fs";
import {
  JUDGE_FAILED_PREFIX,
  analysisNeed,
  buildStateQueries,
  classifyHealthResponse,
  classifyScoreResponse,
  judgeFailed,
  parseArgs,
  parseNotes,
  pickApiKeys,
  planRecovery,
  replyState,
  rowsToState,
  toMs,
} from "./recover-ai-outage.mjs";

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

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sid = (n, step) => `${String(n).padStart(8, "0")}-0000-4000-9000-${step === "chat" ? "000000000001" : step === "iv" ? "000000000002" : "000000000003"}`;

const JOB = {
  id: "02f91311-a3a4-461c-a52d-5893cef7a9f3",
  title: "Chat Support Team Leader (Zulu Royal & Zulu Rush)",
  employerId: "e32a8a14-695c-42e5-9ea3-75ed8d15f49c",
  processingMode: "auto",
  workflowSteps: [
    { id: "step_connection", type: "equipment_check" },
    { id: "step_chat", type: "chat_simulation" },
    { id: "step_interview", type: "chat_interview" },
  ],
};
const NOW = "2026-10-07T03:00:00.000Z";
const SINCE = "2026-10-07T00:30:00.000Z";
const RESET_AT = "2026-10-07T02:15:41.919689+00:00";
const QUIZ = { quiz: { type: "quiz", score: 100, total: 5, passed: true } };
const UNGRADED_CHAT = { graded: false, score: null, transcript: [{ role: "user", content: "hello?" }] };
const UNGRADED_IV = { graded: false, score: null, messages: [{ role: "user", content: "my answer" }] };

function app(n, fields) {
  return {
    id: id(n),
    jobId: JOB.id,
    name: `Applicant ${String(n).padStart(2, "0")}`,
    phase: "decision",
    status: "reviewing",
    aiScore: null,
    aiScorecard: null,
    notes: JSON.stringify(QUIZ),
    ...fields,
  };
}

function session(n, step, fields) {
  const stepId = step === "chat" ? "step_chat" : step === "iv" ? "step_interview" : "step_connection";
  const stepType = step === "chat" ? "chat_simulation" : step === "iv" ? "chat_interview" : "equipment_check";
  return { id: sid(n, step), applicationId: id(n), stepId, stepType, attempt: 1, status: "completed", endReason: "submitted", ...fields };
}

function summary(n, step, fields) {
  return { sessionId: sid(n, step), candidateTurns: 0, assistantTurns: 0, replyFailures: 0, replyFailuresSince: 0, lastAssistantAt: null, lastFailedAt: null, ...fields };
}

// Postgres timestamps exactly as the Management API returns them.
const pg = (hms) => `2026-10-07 ${hms}+00`;

const applications = [
  // 1. Finished during the outage: both tests sent but never graded, the AI never spoke, no score.
  app(1, { notes: JSON.stringify({ ...QUIZ, chatSimulationResult: UNGRADED_CHAT, chatInterviewResult: UNGRADED_IV }) }),
  // 2. Finished, scored after the last step: nothing to do.
  app(2, {
    aiScore: "72",
    aiScorecard: { riskFlags: [], decisionState: "ready_for_decision" },
    notes: JSON.stringify({ ...QUIZ, chatSimulationResult: { score: 80 }, chatInterviewResult: { score: 70, graded: true }, avaAnalysisMeta: { analyzedAt: "2026-10-07T01:40:00.000Z" } }),
  }),
  // 3. Finished, scored while the judge was failing.
  app(3, {
    aiScore: "57",
    aiScorecard: { riskFlags: [`${JUDGE_FAILED_PREFIX}; the score is the tests with a neutral read of it`] },
    notes: JSON.stringify({ ...QUIZ, chatSimulationResult: { score: 66 }, chatInterviewResult: { score: 60 }, avaAnalysisMeta: { analyzedAt: "2026-10-07T01:50:00.000Z" } }),
  }),
  // 4. Finished, but the score predates the interview (its own analysis failed).
  app(4, {
    aiScore: 65,
    aiScorecard: { riskFlags: [] },
    notes: JSON.stringify({ ...QUIZ, chatSimulationResult: { score: 70 }, chatInterviewResult: { score: 75 }, avaAnalysisMeta: { analyzedAt: "2026-10-07T00:20:00.000Z" } }),
  }),
  // 5. Finished two minutes ago: their own step is scoring them.
  app(5, { notes: JSON.stringify({ ...QUIZ, chatSimulationResult: { score: 70 }, chatInterviewResult: { score: 70 } }) }),
  // 6. Rejected: never touched.
  app(6, { status: "rejected" }),
  // 7. Still on the form.
  app(7, { phase: "application", status: "in_progress", notes: null }),
  // 8. On the chat now, cut off part-way (2 answers, 0 replies).
  app(8, { phase: "step_chat" }),
  // 9. On the chat now, cut off at Start.
  app(9, { phase: "step_chat" }),
  // 10. Handed back by the reset (both steps), redo not started.
  app(10, { phase: "step_chat", notes: JSON.stringify({ ...QUIZ, outageRetake: { reason: "ai_service_out_of_credit_2026-10-07", at: RESET_AT, steps: ["step_chat", "step_interview"] } }) }),
  // 11. Handed back (chat), redo started after the reset and going fine.
  app(11, { phase: "step_chat", notes: JSON.stringify({ ...QUIZ, outageRetake: { at: RESET_AT, steps: ["step_chat"] } }) }),
  // 12. Handed back (chat), redo started and stuck again.
  app(12, { phase: "step_chat", notes: JSON.stringify({ ...QUIZ, outageRetake: { at: RESET_AT, steps: ["step_chat"] } }) }),
  // 13. Chat graded 40 on a conversation the outage broke; now on the interview.
  app(13, { phase: "step_interview", notes: JSON.stringify({ ...QUIZ, chatSimulationResult: { score: 40, rubric: "team_lead" } }) }),
  // 14. Finished; ungraded chat that DID get AI replies.
  app(14, { aiScore: "61", aiScorecard: { riskFlags: [] }, notes: JSON.stringify({ ...QUIZ, chatSimulationResult: UNGRADED_CHAT, chatInterviewResult: { score: 70 }, avaAnalysisMeta: { analyzedAt: "2026-10-07T02:40:00.000Z" } }) }),
  // 15. On the chat, but the only failure is from before the outage window.
  app(15, { phase: "step_chat", aiScore: 50, aiScorecard: { riskFlags: [] }, notes: JSON.stringify({ ...QUIZ, avaAnalysisMeta: { analyzedAt: "2026-10-06T22:00:00.000Z" } }) }),
  // 16. On the chat, failed once, then the AI answered.
  app(16, { phase: "step_chat" }),
  // 17. Attempt restarted by staff (outage_restart), no marker.
  app(17, { phase: "step_interview", notes: JSON.stringify({ ...QUIZ, chatSimulationResult: { score: 70 } }) }),
  // 18. Another job's applicant: not in the jobs list, never touched.
  { ...app(18, {}), jobId: "11111111-1111-4111-8111-111111111111" },
];

const sessions = [
  session(1, "chat", { startedAt: pg("00:50:00"), endedAt: pg("01:00:00") }),
  session(1, "iv", { startedAt: pg("01:05:00"), endedAt: pg("01:20:00"), endReason: "ended_early" }),
  session(2, "chat", { startedAt: pg("00:10:00"), endedAt: pg("00:20:00") }),
  session(2, "iv", { startedAt: pg("00:25:00"), endedAt: pg("01:30:00") }),
  session(3, "iv", { startedAt: pg("00:25:00"), endedAt: pg("01:25:00") }),
  session(4, "iv", { startedAt: pg("00:25:00"), endedAt: pg("01:10:00") }),
  session(5, "iv", { startedAt: pg("02:30:00"), endedAt: "2026-10-07T02:58:00.000Z" }),
  session(6, "iv", { startedAt: pg("00:25:00"), endedAt: pg("01:10:00") }),
  session(8, "conn", { startedAt: pg("00:40:00"), endedAt: pg("00:45:00") }),
  session(8, "chat", { status: "active", endReason: null, startedAt: pg("01:00:00"), lastActivityAt: pg("01:10:00") }),
  session(9, "chat", { status: "active", endReason: null, startedAt: pg("01:12:00"), lastActivityAt: pg("01:13:34") }),
  session(10, "chat", { startedAt: pg("00:50:00"), endedAt: pg("01:00:00") }),
  session(10, "iv", { startedAt: pg("01:05:00"), endedAt: pg("01:20:00"), endReason: "ended_early" }),
  session(11, "chat", { startedAt: pg("00:50:00"), endedAt: pg("01:00:00") }),
  { ...session(11, "chat", { status: "active", endReason: null, attempt: 2, startedAt: pg("02:30:00"), lastActivityAt: pg("02:40:00") }), id: id(911) },
  session(12, "chat", { startedAt: pg("00:50:00"), endedAt: pg("01:00:00") }),
  { ...session(12, "chat", { status: "active", endReason: null, attempt: 2, startedAt: pg("02:30:00"), lastActivityAt: pg("02:41:00") }), id: id(912) },
  session(13, "chat", { startedAt: pg("00:35:00"), endedAt: pg("00:41:11") }),
  session(13, "iv", { status: "superseded", endReason: "outage_restart", startedAt: pg("00:43:00") }),
  session(14, "chat", { startedAt: pg("00:30:00"), endedAt: pg("00:45:00") }),
  session(14, "iv", { startedAt: pg("00:50:00"), endedAt: pg("02:30:00") }),
  session(15, "chat", { status: "active", endReason: null, startedAt: pg("00:01:00"), lastActivityAt: pg("00:05:00") }),
  session(15, "conn", { startedAt: pg("00:00:00"), endedAt: pg("00:02:00") }),
  session(16, "chat", { status: "active", endReason: null, startedAt: pg("02:20:00"), lastActivityAt: pg("02:55:00") }),
  session(17, "chat", { startedAt: pg("00:10:00"), endedAt: pg("00:20:00") }),
  session(17, "iv", { status: "superseded", endReason: "outage_restart", startedAt: pg("01:00:00") }),
];

const eventSummaries = [
  summary(1, "chat", { candidateTurns: 3, replyFailures: 4, replyFailuresSince: 4, lastFailedAt: pg("00:59:00") }),
  summary(1, "iv", { candidateTurns: 4, replyFailures: 5, replyFailuresSince: 5, lastFailedAt: pg("01:19:00") }),
  summary(2, "chat", { candidateTurns: 5, assistantTurns: 5, lastAssistantAt: pg("00:19:00") }),
  summary(8, "chat", { candidateTurns: 2, replyFailures: 3, replyFailuresSince: 3, lastFailedAt: pg("01:10:00") }),
  summary(9, "chat", { candidateTurns: 0, replyFailures: 1, replyFailuresSince: 1, lastFailedAt: pg("01:12:01") }),
  summary(10, "chat", { candidateTurns: 1, replyFailures: 2, replyFailuresSince: 2, lastFailedAt: pg("00:59:00") }),
  { ...summary(11, "chat", { candidateTurns: 3, assistantTurns: 4, lastAssistantAt: pg("02:39:00") }), sessionId: id(911) },
  { ...summary(12, "chat", { candidateTurns: 2, assistantTurns: 1, replyFailures: 1, replyFailuresSince: 1, lastAssistantAt: pg("02:31:00"), lastFailedAt: pg("02:41:00") }), sessionId: id(912) },
  summary(13, "chat", { candidateTurns: 3, assistantTurns: 2, replyFailures: 4, replyFailuresSince: 4, lastAssistantAt: pg("00:39:23"), lastFailedAt: pg("00:40:30") }),
  summary(14, "chat", { candidateTurns: 4, assistantTurns: 1, replyFailures: 3, replyFailuresSince: 3, lastAssistantAt: pg("00:36:00"), lastFailedAt: pg("00:44:00") }),
  summary(15, "chat", { candidateTurns: 1, replyFailures: 1, replyFailuresSince: 0, lastFailedAt: pg("00:04:00") }),
  summary(16, "chat", { candidateTurns: 2, assistantTurns: 2, replyFailures: 1, replyFailuresSince: 1, lastFailedAt: pg("02:21:00"), lastAssistantAt: pg("02:29:00") }),
];

const STATE = { jobs: [JOB], applications, sessions, eventSummaries };
const base = { now: NOW, since: SINCE, settleMinutes: 10 };
const plan = planRecovery({ ...STATE, ...base });
const ids = (list) => list.map((entry) => entry.applicationId);
const find = (list, n, extra = () => true) => list.find((entry) => entry.applicationId === id(n) && extra(entry));

console.log("Small helpers:\n");
check("toMs reads a Postgres timestamp", toMs("2026-10-07 00:39:23.096927+00") === Date.parse("2026-10-07T00:39:23.096Z"));
check("toMs reads ISO and returns null for junk", toMs("2026-10-07T02:10:14.484Z") === Date.parse("2026-10-07T02:10:14.484Z") && toMs("not a time") === null && toMs(null) === null);
check("parseNotes reads JSON text, twice-encoded text, an object; junk is {}",
  parseNotes('{"a":1}').a === 1 && parseNotes(JSON.stringify('{"a":2}')).a === 2 && parseNotes({ a: 3 }).a === 3 && same(parseNotes("{oops"), {}) && same(parseNotes(null), {}) && same(parseNotes("[1]"), {}));
check("judgeFailed spots the judge-failed flag only", judgeFailed({ riskFlags: [`${JUDGE_FAILED_PREFIX}; x`] }) && !judgeFailed({ riskFlags: ["Overall score is below the passing threshold"] }) && !judgeFailed(null));
check("replyState: a failure after the last reply is stuck", replyState({ lastFailedAt: pg("01:10:00"), lastAssistantAt: pg("01:00:00") }) === "stuck");
check("replyState: a failure with no reply at all is stuck", replyState({ lastFailedAt: pg("01:10:00"), lastAssistantAt: null }) === "stuck");
check("replyState: a reply after the failure is answered", replyState({ lastFailedAt: pg("01:10:00"), lastAssistantAt: pg("01:11:00") }) === "answered");
check("replyState: nothing asked is idle", replyState(null) === "idle" && replyState({}) === "idle");
check("analysisNeed: a real 0 is a score, not missing", analysisNeed({ aiScore: 0, aiScorecard: { riskFlags: [] }, notes: {} }, []) === null);

console.log("\nWho gets scored (finished applicants only, by default):\n");
check("exactly the finished applicants with a missing, judge-failed or stale score", same(ids(plan.rescore), [id(4), id(1), id(3)]),
  JSON.stringify(ids(plan.rescore)));
check("oldest finish first", same(plan.rescore.map((e) => e.lastFinishedAt), ["2026-10-07T01:10:00.000Z", "2026-10-07T01:20:00.000Z", "2026-10-07T01:25:00.000Z"]));
check("no score -> no_score, with both untested steps named (interim score)",
  find(plan.rescore, 1)?.reason === "no_score" && same(find(plan.rescore, 1)?.ungradedTests, ["chat practice", "written interview"]));
check("score built while the judge failed -> judge_failed", find(plan.rescore, 3)?.reason === "judge_failed");
check("score older than the last finished step -> stale", find(plan.rescore, 4)?.reason === "stale");
check("a fresh score is left alone", !find(plan.rescore, 2) && !find(plan.notNow, 2));
check("a score with an ungraded test on file but fresh analysis is left alone", !find(plan.rescore, 14));
check("someone who finished 2 minutes ago is not scored (their own step is)", find(plan.notNow, 5)?.why === "just_finished" && !find(plan.rescore, 5));
check("rejected, on-the-form and other-job applicants are nowhere",
  [6, 7, 18].every((n) => ![...plan.rescore, ...plan.notNow, ...plan.attention, ...plan.ungradedOnFile, ...plan.handedBack].some((e) => e.applicationId === id(n))));
check("part-way applicants without a score wait for their next step", ["8", "9", "10", "13"].every((n) => find(plan.notNow, Number(n))?.why === "midway"));

const midway = planRecovery({ ...STATE, ...base, includeMidway: true });
check("--include-midway scores part-way applicants not waiting on a redo",
  ids(midway.rescore).includes(id(8)) && ids(midway.rescore).includes(id(13)) && ids(midway.rescore).includes(id(9)));
check("--include-midway still leaves alone anyone asked to redo a step", find(midway.notNow, 10)?.why === "redo_pending" && find(midway.notNow, 12)?.why === "redo_pending");
check("--include-midway leaves alone anyone in a step right now", find(midway.notNow, 16)?.why === "active_now" && !find(midway.rescore, 16));
check("--include-midway catches a stale part-way score too", find(midway.rescore, 15)?.reason === "stale");
check("…but a stale part-way score waits without it", find(plan.notNow, 15)?.why === "midway" && !find(plan.rescore, 15));

console.log("\nWhat is listed (nothing changes):\n");
check("sent-but-ungraded tests with no AI reply are listed for a redo",
  plan.ungradedOnFile.filter((e) => e.applicationId === id(1)).map((e) => `${e.stepId}:${e.kind}`).join(",") === "step_chat:ungraded_no_ai,step_interview:ungraded_no_ai");
check("the transcript counts come from the attempt that was sent", find(plan.ungradedOnFile, 1, (e) => e.stepId === "step_interview")?.candidateTurns === 4);
check("an ungraded test that did get AI replies is listed as not re-gradable", find(plan.ungradedOnFile, 14)?.kind === "ungraded_with_ai" && find(plan.ungradedOnFile, 14)?.assistantTurns === 1);
check("every ungraded entry says why nothing re-grades it", plan.ungradedOnFile.every((e) => /graded/.test(e.todo) && /hand(ed)? the step back|handed back/.test(e.todo)));
const kinds = Object.fromEntries(plan.attention.map((e) => [`${Number(e.applicationId.slice(-12))}:${e.stepId ?? ""}`, e.kind]));
check("cut off part-way", kinds["8:step_chat"] === "cut_off_midway");
check("cut off at Start", kinds["9:step_chat"] === "cut_off_at_start");
check("handed back, redo not started: one entry naming both steps",
  kinds["10:step_chat"] === "redo_requested" && same(find(plan.attention, 10)?.labels, ["chat practice", "written interview"]) && plan.attention.filter((e) => e.applicationId === id(10)).length === 1);
check("handed back and redoing it fine: not listed", !find(plan.attention, 11));
check("handed back and stuck again on the redo: cut off, marked as a redo", find(plan.attention, 12)?.kind === "cut_off_midway" && find(plan.attention, 12)?.redo === true);
const broken13 = find(plan.attention, 13, (e) => e.kind === "graded_but_interrupted");
check("graded on a conversation the outage broke", broken13?.stepId === "step_chat" && broken13?.score === 40 && broken13?.failures === 4);
check("…and its interview, restarted by staff, is asked for again", find(plan.attention, 13, (e) => e.kind === "redo_requested")?.stepId === "step_interview");
check("restarted by staff (outage_restart) without a marker: asked to redo", find(plan.attention, 17)?.kind === "redo_requested");
check("a failure from before the outage window is not this outage", !find(plan.attention, 15));
check("answered after a failure: not listed", !find(plan.attention, 16));
check("every listed entry has something to do", plan.attention.every((e) => typeof e.todo === "string" && e.todo.length > 20));
check("the reset's hand-backs are counted, none redone yet here", plan.handedBack.length === 3 && plan.handedBack.every((e) => e.redone.length === 0));

console.log("\nIdempotent:\n");
check("the same rows give the same plan", same(planRecovery({ ...STATE, ...base }), plan));
// What a successful scoring writes: a score, a scorecard without the judge
// flag, and avaAnalysisMeta.analyzedAt = now.
const scoredApps = applications.map((row) => {
  if (!ids(plan.rescore).includes(row.id)) return row;
  const notes = parseNotes(row.notes);
  return { ...row, aiScore: "62", aiScorecard: { riskFlags: [], decisionState: "needs_more_evidence" }, notes: JSON.stringify({ ...notes, avaAnalysisMeta: { analyzedAt: NOW } }) };
});
const again = planRecovery({ ...STATE, applications: scoredApps, ...base });
check("after a run that scored them, a second run has nobody to score", again.rescore.length === 0, JSON.stringify(ids(again.rescore)));
check("…and lists exactly what it listed before", same(again.attention, plan.attention) && same(again.ungradedOnFile, plan.ungradedOnFile));
const weak = applications.map((row) => (row.id === id(1)
  ? { ...row, aiScore: "55", aiScorecard: { riskFlags: [`${JUDGE_FAILED_PREFIX}; again`] }, notes: JSON.stringify({ ...parseNotes(row.notes), avaAnalysisMeta: { analyzedAt: NOW } }) }
  : row));
check("a scoring where the judge failed again is picked up by the next run", find(planRecovery({ ...STATE, applications: weak, ...base }).rescore, 1)?.reason === "judge_failed");
// Applicant 10 redoes the chat: a graded result and a new attempt after the reset.
const redone = {
  ...STATE,
  applications: applications.map((row) => (row.id === id(10)
    ? { ...row, phase: "step_interview", notes: JSON.stringify({ ...parseNotes(row.notes), chatSimulationResult: { score: 74 } }) }
    : row)),
  sessions: [...sessions, { ...session(10, "chat", { attempt: 2, startedAt: pg("02:30:00"), endedAt: pg("02:45:00") }), id: id(910) }],
};
const afterRedo = planRecovery({ ...redone, ...base });
check("after a redo of the chat, only the interview is still asked for",
  same(find(afterRedo.attention, 10)?.labels, ["written interview"]) && same(find(afterRedo.handedBack, 10)?.redone, ["step_chat"]));

console.log("\nThe health call's answer:\n");
const quota500 = classifyHealthResponse({ status: 500, contentType: "application/json", text: '{"error":"OpenAI stream error 429: {\\"error\\":{\\"code\\":\\"insufficient_quota\\",\\"type\\":\\"insufficient_quota\\"}}"}' });
check("insufficient_quota -> not healthy, credit exhausted", !quota500.healthy && quota500.creditExhausted);
check("credit_balance_exhausted -> credit exhausted", classifyHealthResponse({ status: 500, text: "credit_balance_exhausted" }).creditExhausted);
check("a stream with words -> healthy", classifyHealthResponse({ status: 200, contentType: "text/event-stream", text: 'data: {"choices":[{"delta":{"content":"Hi there"}}]}\n\n' }).healthy);
check("a stream that only finished -> healthy (the call was accepted)", classifyHealthResponse({ status: 200, contentType: "text/event-stream", text: 'data: {"choices":[{"delta":{"content":""}}]}\n\ndata: [DONE]\n\n' }).healthy);
check("a stream with only empty deltas so far -> not healthy", !classifyHealthResponse({ status: 200, contentType: "text/event-stream", text: 'data: {"choices":[{"delta":{"role":"assistant","content":""}}]}\n\n' }).healthy);
const limited = classifyHealthResponse({ status: 429, contentType: "application/json", text: '{"error":"rate_limited","message":"Too many requests."}' });
check("our own rate limiter -> not healthy, not the credit", !limited.healthy && !limited.creditExhausted && /rate limiter/.test(limited.reason));
check("any other failure -> not healthy, says the status", /HTTP 500/.test(classifyHealthResponse({ status: 500, text: '{"error":"boom"}' }).reason));

console.log("\nThe trigger-ava-analysis answer:\n");
const scored = classifyScoreResponse({ status: 200, body: { success: true, score: 63.5, scorecard: { riskFlags: [], decisionState: "needs_more_evidence" } } });
check("success -> ok with the score", scored.ok && scored.score === 63.5 && scored.decisionState === "needs_more_evidence");
const weakScore = classifyScoreResponse({ status: 200, body: { success: true, score: 55, scorecard: { riskFlags: [`${JUDGE_FAILED_PREFIX}; x`] } } });
check("saved but the judge failed again -> not ok, not fatal", !weakScore.ok && !weakScore.fatal && weakScore.degraded);
check("analysis failed (500) -> not ok, not fatal", (() => { const v = classifyScoreResponse({ status: 500, body: { error: "AI analysis failed", details: "Edge Function returned a non-2xx status code" } }); return !v.ok && !v.fatal && /AI analysis failed/.test(v.reason); })());
check("quota text anywhere -> fatal", classifyScoreResponse({ status: 500, body: { error: "x", details: "insufficient_quota" } }).fatal);
check("limit reached -> fatal", classifyScoreResponse({ status: 403, body: { error: "AI analysis limit reached", limitReached: true, message: "15/15" } }).fatal);
check("not allowed -> fatal", classifyScoreResponse({ status: 403, body: { error: "You do not have permission to analyze this application" } }).fatal);
check("401 -> fatal and marked expired (the run refreshes once)", (() => { const v = classifyScoreResponse({ status: 401, body: { error: "Invalid authentication token" } }); return v.fatal && v.authExpired; })());
check("timed out -> not ok, not fatal", (() => { const v = classifyScoreResponse({ status: 0, timedOut: true }); return !v.ok && !v.fatal; })());

console.log("\nKeys and options:\n");
const keys = pickApiKeys([
  { name: "default", type: "publishable", api_key: "sb_publishable_x" },
  { name: "anon", type: "legacy", api_key: "anon-jwt" },
  { name: "service_role", type: "legacy", api_key: "service-jwt" },
  { name: "default", type: "secret", api_key: "sb_secret_x" },
]);
check("legacy anon and service keys are preferred", keys.anon === "anon-jwt" && keys.service === "service-jwt");
check("new-style keys are used when there are no legacy ones", same(pickApiKeys([{ type: "publishable", api_key: "p" }, { type: "secret", api_key: "s" }]), { anon: "p", service: "s" }));
check("missing keys -> a clear error", (() => { try { pickApiKeys([{ name: "anon", api_key: "a" }]); return false; } catch (e) { return /service key/.test(e.message); } })());

const defaults = parseArgs([]);
check("default is a dry run on the live job", defaults.mode === "dry-run" && same(defaults.jobIds, ["02f91311-a3a4-461c-a52d-5893cef7a9f3"]) && defaults.since === SINCE);
check("--go, --check", parseArgs(["--go"]).mode === "go" && parseArgs(["--check"]).mode === "check");
check("--go with --dry-run is refused", (() => { try { parseArgs(["--go", "--dry-run"]); return false; } catch { return true; } })());
check("--job takes a uuid, repeatable, de-duplicated", same(parseArgs(["--job", JOB.id, `--job=${JOB.id.toUpperCase()}`]).jobIds, [JOB.id]));
check("--job refuses anything else (it reaches SQL)", (() => { try { parseArgs(["--job", "x' or 1=1 --"]); return false; } catch { return true; } })());
check("--since is normalised to ISO", parseArgs(["--since", "2026-10-07 00:36:00+00"]).since === "2026-10-07T00:36:00.000Z");
check("--pause, --max, --settle, flags", (() => { const o = parseArgs(["--pause", "5", "--max=1", "--settle", "0", "--include-midway", "--sign-in-as-employer", "--json"]); return o.pauseSeconds === 5 && o.max === 1 && o.settleMinutes === 0 && o.includeMidway && o.signInAsEmployer && o.json; })());
check("--max 0 and an unknown option are refused", (() => { let n = 0; try { parseArgs(["--max", "0"]); } catch { n += 1; } try { parseArgs(["--force"]); } catch { n += 1; } return n === 2; })());

console.log("\nReading rows:\n");
const queries = buildStateQueries({ jobIds: [JOB.id], applicationIds: [id(1)], since: "2026-10-07 00:36:00+00" });
check("four read queries, all SELECTs", Object.keys(queries).join(",") === "jobs,applications,sessions,eventSummaries" && Object.values(queries).every((q) => /^\s*select\b/i.test(q) && !/\b(update|insert|delete|alter|drop)\b/i.test(q)));
check("the one-applicant re-read is filtered to that applicant", queries.applications.includes(`a.id in ('${id(1)}')`) && queries.sessions.includes(`s.application_id in ('${id(1)}')`));
check("the window start reaches the failure count as a timestamp", queries.eventSummaries.includes("'2026-10-07T00:36:00.000Z'::timestamptz"));
check("a non-uuid id never reaches SQL", (() => { try { buildStateQueries({ jobIds: ["x'); drop table jobs; --"], since: SINCE }); return false; } catch { return true; } })());
const mapped = rowsToState({
  jobs: [{ id: JOB.id, title: JOB.title, employer_id: JOB.employerId, processing_mode: "auto", workflow_steps: JOB.workflowSteps }],
  applications: [{ id: id(1), job_id: JOB.id, phase: "decision", status: "reviewing", ai_score: null, ai_scorecard: null, notes: JSON.stringify({ chatSimulationResult: UNGRADED_CHAT }), full_name: "Applicant 01" }],
  sessions: [{ id: sid(1, "chat"), application_id: id(1), step_id: "step_chat", step_type: "chat_simulation", attempt: 1, status: "completed", end_reason: "submitted", started_at: pg("00:50:00"), last_activity_at: pg("01:00:00"), ended_at: pg("01:00:00") }],
  eventSummaries: [{ session_id: sid(1, "chat"), candidate_turns: "3", assistant_turns: "0", reply_failures: "4", reply_failures_since: "4", last_assistant_at: null, last_failed_at: pg("00:59:00") }],
});
const mappedPlan = planRecovery({ ...mapped, ...base });
check("database rows map into the planner's shape (counts arrive as text)", mapped.eventSummaries[0].candidateTurns === 3 && mapped.jobs[0].employerId === JOB.employerId);
check("…and give the same answer as the hand-built fixture", ids(mappedPlan.rescore).join() === id(1) && mappedPlan.ungradedOnFile[0]?.kind === "ungraded_no_ai" && mappedPlan.ungradedOnFile[0]?.candidateTurns === 3);

console.log("\nThe script itself:\n");
const source = readFileSync(new URL("./recover-ai-outage.mjs", import.meta.url), "utf8");
check("carries no secret", !/eyJ[A-Za-z0-9_-]{20,}|sbp_[0-9a-f]{16,}|sb_secret_[A-Za-z0-9]{8,}|sk-[A-Za-z0-9]{20,}/.test(source));
check("reads only through read_only SQL and never writes a table directly", /read_only: true/.test(source) && !/read_only:\s*false/.test(source) && !/\/rest\/v1\//.test(source));
const functionsCalled = [...new Set([...source.matchAll(/functions\/v1\/([a-z0-9-]+)/g)].map((m) => m[1]))].sort();
check("calls only the health path and the score-only analysis", same(functionsCalled, ["ai-chat-simulation", "trigger-ava-analysis"]), functionsCalled.join(","));
check("the analysis call never asks to move anyone", !/autopilotDecision\s*:\s*true/.test(source) && /JSON\.stringify\(\{ applicationId, force: true \}\)/.test(source));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
