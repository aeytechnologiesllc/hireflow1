#!/usr/bin/env node
/**
 * The full profile's rules (src/cockpit/lib/applicantProfile.ts), and where
 * the profile mounts what the Applicants list gave up (docs/APPLICANTS-LIST.md §4).
 *
 * The journey dots are decided by the RECORD, never by position. The old rail
 * drew a check and "Completed" on a step the job gained after the applicant
 * had passed it, while the record beside it said "No result on file". These
 * checks run the real builder (buildAssessmentRecord) over rows shaped like
 * production's (invented people, same keys and nesting) and read the dots
 * off it: a skipped connection check, typing, chat and interview below the
 * job's bar; someone on the skills check after a staff reset; live, left,
 * parked, on the form, decided.
 *
 * Imports go through the app's "@/" alias, mapped to src/ with a resolve
 * hook. Node 24+ strips the types.
 *
 * Run with: node scripts/applicant_profile.test.mjs
 */
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = new URL(`../src/${specifier.slice(2)}`, import.meta.url).href;
      for (const suffix of [".ts", ".tsx", "/index.ts"]) {
        try {
          return nextResolve(base + suffix, context);
        } catch {
          // try the next spelling
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const { buildAssessmentRecord } = await import("../src/cockpit/lib/assessmentRecord.ts");
const {
  journeyDots,
  journeyEntries,
  finishedEveryTest,
  needsReview,
  railIndex,
  applicantChip,
  decisionWord,
  dotReceipt,
  dotStateWords,
  journeyLine,
  journeyLineRuns,
  effectiveLiveState,
  softHyphenate,
  STALE_CLAIM_MS,
  applicantScore,
  APPLICANT_ORDER_KEY,
  parseApplicantOrder,
  readApplicantOrder,
  writeApplicantOrder,
  pagerFor,
  splitActionBar,
  timelineMoments,
} = await import("../src/cockpit/lib/applicantProfile.ts");
const { avaProse, extractLabeledLine, extractReportSection, clip, firstName, pullQuote } = await import("../src/cockpit/lib/avaProse.ts");

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
const states = (dots) => dots.map((d) => d.state).join(",");

/* ── A job shaped like the live chat-agent role ────────────────────────── */
// application > skills check > connection > typing > chat > interview > decision: 7 dots.
const STEPS = [
  { id: "step_connection", type: "equipment_check", title: "Computer and connection", config: { min_download_mbps: 10, min_upload_mbps: 3, max_latency_ms: 200 } },
  { id: "step_typing", type: "typing_test", title: "Typing test", config: { min_wpm: 45, min_accuracy_percent: 95 } },
  { id: "step_chat", type: "chat_simulation", title: "Player chat practice" },
  { id: "step_interview", type: "chat_interview", title: "Written interview" },
];
const QUIZ = Array.from({ length: 10 }, (_, i) => ({ id: `q${i + 1}`, type: "multiple_choice", question: `Situation ${i + 1}`, options: ["A", "B", "C", "D"] }));
const JOB = { id: "job-1", workflow_steps: STEPS, quiz_questions: QUIZ, passing_score: 60, required_wpm: 45 };
const ANSWERS = [
  { type: "text", answer: "Pat Example", question: "Full name", questionId: "q1" },
  { type: "text", answer: "Cebu, Philippines", question: "Country and city you will work from", questionId: "q4" },
];
const QUIZ_DONE = {
  quiz: { type: "quiz", score: 100, total: 10, passed: true, correct: 10, answers: [], completedAt: "2026-10-05T15:45:43.000Z" },
  quizResult: { score: 100, total: 10, passed: true, correct: 10 },
};

/** Finished every test the job had when they took it: the connection check
 *  was added to the job afterwards, so there is no result for it. Typing 38
 *  WPM under a 45 bar, chat 18 under the 60 pass mark, a "No Hire" interview. */
function finisherNotes() {
  return {
    ...QUIZ_DONE,
    applicationAnswers: ANSWERS,
    typingTestResult: { wpm: 38, accuracy: 85, score: 72, passed: false, requiredWpm: 45 },
    step_typing: { type: "typing_test", wpm: 38, accuracy: 85, score: 72, passed: false, requiredWpm: 45, completedAt: "2026-10-05T15:47:40.000Z" },
    chatSimulationResult: { messageCount: 11, score: 18, empathy: 15, problemSolving: 12, completed: true },
    chatInterviewResult: {
      messages: [
        { role: "assistant", content: "What drew you to player support?", timestamp: "2026-10-05T15:53:41.000Z" },
        { role: "user", content: "I like helping people.", timestamp: "2026-10-05T15:54:57.000Z" },
      ],
      evaluation: { score: 25, recommendation: "No Hire", summary: "Kind tone, little evidence." },
    },
    _trusted: {
      step_typing: { stepType: "typing_test", completedAt: "2026-10-05T15:47:40.000Z" },
      step_chat: { stepType: "chat_simulation", completedAt: "2026-10-05T15:51:46.000Z" },
      step_interview: { stepType: "chat_interview", completedAt: "2026-10-05T15:57:59.000Z" },
    },
  };
}
const finisher = (over = {}) => ({
  id: "app-finisher",
  status: "reviewing",
  // A decline recommendation leaves phase where it was: on the last step.
  phase: "step_interview",
  created_at: "2026-10-05T15:39:19.000Z",
  updated_at: "2026-10-05T16:10:00.000Z",
  notes: JSON.stringify(finisherNotes()),
  ai_score: 34,
  ai_scorecard: { decisionState: "ready_for_decision", recommendedAction: "reject", riskFlags: [] },
  jobs: JOB,
  ...over,
});

const NOW = Date.parse("2026-10-06T16:00:00Z");
const MIN = 60_000;
const ago = (ms) => new Date(NOW - ms).toISOString();
const sess = (over = {}) => ({
  id: "s-1",
  application_id: "app-x",
  job_id: "job-1",
  step_id: "quiz",
  step_type: "quiz",
  attempt: 1,
  status: "active",
  started_at: ago(5 * MIN),
  last_activity_at: ago(MIN),
  hidden_at: null,
  ended_at: null,
  progress: {},
  integrity_summary: {},
  ...over,
});
const build = (app, sessions = []) => buildAssessmentRecord(app, { sessions, now: NOW });
const dotsOf = (app, sessions = []) => journeyDots(build(app, sessions), app.status);

/* ── 1. The finisher: a step added later is Skipped, never Completed ───── */
let rec = build(finisher());
let dots = journeyDots(rec, "reviewing");
check("one dot per journey step plus Decision (7)", dots.length === 7 && dots.at(-1).id === "decision", `${dots.length}`);
check("the dots skip the resume, integrity and extra rows", journeyEntries(rec.entries).every((e) => e.kind !== "integrity" && e.kind !== "resume" && !e.key.startsWith("extra-")));
check(
  "finisher: application done, quiz done, connection skipped, typing/chat/interview below the bar, Decision on it now",
  states(dots) === "done,done,skipped,below,below,below,now",
  states(dots),
);
const connection = dots.find((d) => d.id === "step_connection");
check("the step added after they passed it says Skipped", dotReceipt(connection) === "Skipped" && /Skipped/.test(dotStateWords(connection)), dotReceipt(connection));
check("…and nothing on the rail says Completed", dots.every((d) => dotReceipt(d) !== "Completed"));
check("…while the record row beside it says No result on file", connection.entry?.statusLabel === "No result on file");
check("a below-the-bar receipt is the record's own figure", dotReceipt(dots.find((d) => d.id === "step_typing"))?.includes("38") === true, dotReceipt(dots.find((d) => d.id === "step_typing")));
check("finished every test (a skipped step counts as passed by)", finishedEveryTest(dots));
check("…so Needs review, while undecided", needsReview(dots, "reviewing") && applicantChip("reviewing", true)?.label === "Needs review");
check("the traveller sits on Decision", railIndex(dots) === 6);
check("the line says so", journeyLine(dots, "reviewing") === "Finished every test", journeyLine(dots, "reviewing"));
check("a flagged finisher is not a below-the-bar step: flags never colour a dot", dots.find((d) => d.id === "quiz").state === "done");

// Position alone would have put the traveller on the written interview (phase), which is done.
check("phase on a finished step does not make it 'on it now'", dots.find((d) => d.id === "step_interview").state === "below");

/* ── 2. Decided: the Decision dot is done, Needs review is gone ─────────── */
for (const [status, word, chip] of [
  ["rejected", "Declined", "Declined"],
  ["interview", "Interview", "Interview"],
  ["offered", "Offer", "Offer"],
  ["hired", "Hired", "Hired"],
]) {
  const d = dotsOf(finisher({ status }));
  check(`${status}: Decision is done`, d.at(-1).state === "done" && railIndex(d) === 6, states(d));
  check(`${status}: never Needs review`, !needsReview(d, status) && applicantChip(status, finishedEveryTest(d))?.label === chip);
  check(`${status}: the seal says ${word}`, decisionWord(status) === word);
}
check("the lines for a decision", journeyLine(dotsOf(finisher({ status: "interview" })), "interview") === "Moved to interview" && journeyLine(dotsOf(finisher({ status: "rejected" })), "rejected") === "Declined");

// Declined before they reached the later tests: those read Not taken, never skipped.
const earlyNo = finisher({ status: "rejected", phase: "quiz", notes: JSON.stringify({ ...QUIZ_DONE, applicationAnswers: ANSWERS }) });
dots = dotsOf(earlyNo);
check("declined at the skills check: later steps not reached (Not taken), not skipped", states(dots) === "done,done,not_reached,not_reached,not_reached,not_reached,done", states(dots));
check("…the record says Not taken", dots.slice(2, 6).every((d) => d.entry?.statusLabel === "Not taken"));

/* ── 3. On the skills check after a staff reset (no live attempt) ──────── */
const resetQuiz = {
  id: "app-quiz",
  status: "reviewing",
  phase: "quiz",
  created_at: "2026-10-06T10:00:00.000Z",
  notes: JSON.stringify({ applicationAnswers: ANSWERS }),
  ai_score: 48,
  ai_scorecard: { decisionState: "needs_more_evidence", recommendedAction: "review" },
  jobs: JOB,
};
const superseded = sess({
  id: "s-old",
  application_id: "app-quiz",
  status: "superseded",
  end_reason: "staff_reset",
  integrity_summary: { tab_hidden: 1, window_blur: 3, screenshot_suspected: 1 },
});
dots = dotsOf(resetQuiz, [superseded]);
check("on the skills check: application done, quiz on it now, the rest not reached", states(dots) === "done,now,not_reached,not_reached,not_reached,not_reached,not_reached", states(dots));
check("…the traveller is on the skills check", railIndex(dots) === 1);
check("…not finished, not Needs review", !finishedEveryTest(dots) && !needsReview(dots, "reviewing") && applicantChip("reviewing", false) === null);
check("…its line names the step and where it sits", /^Skills check · step 2 of 7/.test(journeyLine(dots, "reviewing") ?? ""), journeyLine(dots, "reviewing"));
check("…a score so far reads so far", applicantScore(resetQuiz).soFar && applicantScore(resetQuiz).value === 48 && applicantScore(resetQuiz).band === "lo");

/* ── 4. Live, left, parked, on the form ────────────────────────────────── */
const midApp = (over = {}) => ({
  id: "app-mid",
  status: "reviewing",
  phase: "step_typing",
  created_at: "2026-10-06T12:00:00.000Z",
  notes: JSON.stringify({
    ...QUIZ_DONE,
    applicationAnswers: ANSWERS,
    equipmentCheckResult: { downloadMbps: 28, uploadMbps: 9, latencyMs: 40, measuredBy: "server", bars: { minDownloadMbps: 10, minUploadMbps: 3, maxLatencyMs: 200 }, meetsBars: true, below: [], measuredAt: "2026-10-06T12:30:00.000Z" },
    step_connection: { type: "equipment_check", completedAt: "2026-10-06T12:30:00.000Z" },
    _trusted: { step_connection: { stepType: "equipment_check", completedAt: "2026-10-06T12:30:00.000Z" } },
  }),
  ai_score: 64,
  ai_scorecard: { decisionState: "needs_more_evidence" },
  jobs: JOB,
  ...over,
});
const typing = (over = {}) => sess({ id: "s-typing", application_id: "app-mid", step_id: "step_typing", step_type: "typing_test", ...over });
rec = build(midApp(), [typing()]);
dots = journeyDots(rec, "reviewing");
check("typing now, live: the connection check is done before it", states(dots) === "done,done,done,now,not_reached,not_reached,not_reached", states(dots));
check("…'Typing test · step 4 of 7 · live'", journeyLine(dots, "reviewing") === "Typing test · step 4 of 7 · live", journeyLine(dots, "reviewing"));
check("…on it now, not left", dots[3].left === false && dotStateWords(dots[3]) === "On it now");
rec = build(midApp(), [typing({ last_activity_at: ago(40 * MIN) })]);
dots = journeyDots(rec, "reviewing");
check("quiet 40 min: still their step, drawn as left", dots[3].state === "now" && dots[3].left === true, `${dots[3].state} ${dots[3].left}`);
// The list's words for the same attempt (one rule: journeyLineRuns).
check("…'Left at typing test', in amber (the list's row says the same)", journeyLine(dots, "reviewing", { live: rec.live, sessions: [typing({ last_activity_at: ago(40 * MIN) })], now: NOW }) === "Left at typing test" && journeyLineRuns(dots, "reviewing", { live: rec.live })?.[0].tone === "amber", journeyLine(dots, "reviewing"));
check("…and the traveller follows the attempt they touched last", railIndex(dots, rec.live?.stepId) === 3);
dots = dotsOf(midApp());
check("on the step with no attempt yet: on it now, 'not started'", dots[3].state === "now" && dotReceipt(dots[3]) === "Not started" && /not started$/.test(journeyLine(dots, "reviewing")), journeyLine(dots, "reviewing"));

// The other live states read as the list reads them, never as a bare "live".
rec = build(midApp(), [typing({ hidden_at: ago(3 * MIN), last_activity_at: ago(4 * MIN) })]);
dots = journeyDots(rec, "reviewing");
check("away from the test: 'Away from the test for 3 min'", journeyLine(dots, "reviewing", { live: rec.live, now: NOW }) === "Away from the test for 3 min", journeyLine(dots, "reviewing", { live: rec.live, now: NOW }));
const grading = typing({ status: "grading", last_activity_at: ago(2 * MIN), updated_at: ago(2 * MIN) });
rec = build(midApp(), [grading]);
dots = journeyDots(rec, "reviewing");
check("being checked: 'Typing test · checking the answers · step 4 of 7'", journeyLine(dots, "reviewing", { live: rec.live, sessions: [grading], now: NOW }) === "Typing test · checking the answers · step 4 of 7", journeyLine(dots, "reviewing", { live: rec.live, sessions: [grading], now: NOW }));
check("…a claim older than the server's 7 minutes reads as failed", STALE_CLAIM_MS === 7 * MIN && effectiveLiveState(rec.live, grading, NOW + 6 * MIN) === "failed" && effectiveLiveState(rec.live, grading, NOW) === "checking");
check("…and its line says so", journeyLine(dots, "reviewing", { live: rec.live, sessions: [grading], now: NOW + 6 * MIN }) === "Typing test · step 4 of 7 · checking failed, retrying");
const failedRun = typing({ status: "failed", updated_at: ago(MIN) });
rec = build(midApp(), [failedRun]);
dots = journeyDots(rec, "reviewing");
check("checking failed: '… · checking failed, retrying'", journeyLine(dots, "reviewing", { live: rec.live, sessions: [failedRun], now: NOW }) === "Typing test · step 4 of 7 · checking failed, retrying", journeyLine(dots, "reviewing", { live: rec.live, sessions: [failedRun], now: NOW }));

// Parked: their typing result is in, the team has not opened chat practice.
const parked = midApp({
  status: "pending",
  phase: "step_typing",
  notes: JSON.stringify({ ...finisherNotes(), chatSimulationResult: undefined, chatInterviewResult: undefined, _trusted: { step_typing: { stepType: "typing_test", completedAt: "2026-10-05T15:47:40.000Z" } } }),
});
dots = dotsOf(parked);
check("parked: no dot is 'on it now'", dots.every((d) => d.state !== "now"), states(dots));
check("…the traveller rests on the last step behind them", railIndex(dots) === 3, `${railIndex(dots)}`);
check("…the line names what waits on the team", journeyLine(dots, "pending") === "Player chat practice · step 5 of 7 · not opened yet", journeyLine(dots, "pending"));

// On the form: nothing sent yet.
const onForm = { id: "app-form", status: "in_progress", phase: "application", created_at: "2026-10-06T15:50:00.000Z", notes: null, ai_score: null, jobs: JOB };
dots = dotsOf(onForm);
check("on the form: the application dot is on it now", dots[0].state === "now" && railIndex(dots) === 0, states(dots));
check("…'Filling in the form'", journeyLine(dots, "in_progress") === "Filling in the form");
const formRun = (over = {}) => sess({ id: "s-form", application_id: "app-form", step_id: "application", step_type: "application", progress: { answered: 3, total: 11 }, ...over });
let formRec = build(onForm, [formRun()]);
dots = journeyDots(formRec, "in_progress");
check("…live on the form: 'Filling in the form · 3 of 11 answered · live'", journeyLine(dots, "in_progress", { live: formRec.live, sessions: [formRun()], now: NOW }) === "Filling in the form · 3 of 11 answered · live", journeyLine(dots, "in_progress", { live: formRec.live, sessions: [formRun()], now: NOW }));
formRec = build(onForm, [formRun({ hidden_at: ago(2 * MIN) })]);
dots = journeyDots(formRec, "in_progress");
check("…switched tabs: 'Away from the form for 2 min' (the form is not a test)", journeyLine(dots, "in_progress", { live: formRec.live, now: NOW }) === "Away from the form for 2 min", journeyLine(dots, "in_progress", { live: formRec.live, now: NOW }));
formRec = build(onForm, [formRun({ last_activity_at: ago(30 * MIN) })]);
dots = journeyDots(formRec, "in_progress");
check("…quiet 30 min: 'Left the form at 3 of 11'", journeyLine(dots, "in_progress", { live: formRec.live, sessions: [formRun({ last_activity_at: ago(30 * MIN) })], now: NOW }) === "Left the form at 3 of 11", journeyLine(dots, "in_progress", { live: formRec.live, now: NOW }));
check("…not scored yet: no number, never a quiz percentage", applicantScore(onForm).value === null && applicantScore(onForm).band === null);

check("no record steps (a showcase row): no dots, no line", journeyDots({ entries: [] }, "pending").length === 0 && journeyLine([], "pending") === null);

/* ── 4b. Long words on a phone's rail ──────────────────────────────────── */
// A browser will not hyphenate a capitalised word, so the rail cut
// "Application" at any letter in a 42px column; soft hyphens give it a real break.
const shy = (t) => softHyphenate(t).replace(/\u00ad/g, "|");
check(
  "the rail's long words get a soft hyphen near their middle",
  shy("Application") === "Appli|cation" && shy("Interview") === "Inter|view" && shy("Decision") === "Deci|sion" && shy("Your computer and connection") === "Your com|puter and connec|tion",
  [shy("Application"), shy("Interview"), shy("Decision")].join(" "),
);
check("…short words and numbers are left alone", softHyphenate("Skills check · 9/10 · passed") === "Skills check · 9/10 · passed" && softHyphenate("58 WPM") === "58 WPM");
check("…and the text reads the same without them", softHyphenate("Pass, or move to Interview").replace(/\u00ad/g, "") === "Pass, or move to Interview");

/* ── 5. The score words ────────────────────────────────────────────────── */
check("70 is jade, 69 brass", applicantScore({ ai_score: 70 }).band === "hi" && applicantScore({ ai_score: 69.4 }).band === "mid");
check("50 is brass, 49 ink", applicantScore({ ai_score: 50 }).band === "mid" && applicantScore({ ai_score: 49 }).band === "lo");
check("a real 0 is a score, not 'not scored yet'", applicantScore({ ai_score: 0 }).value === 0);
check("numeric text from PostgREST reads as the number", applicantScore({ ai_score: "86" }).value === 86);
check("ready_for_decision is final, not 'so far'", applicantScore({ ai_score: 34, ai_scorecard: { decisionState: "ready_for_decision" } }).soFar === false);

/* ── 6. "3 of 64 ‹ ›" ──────────────────────────────────────────────────── */
check("the key is the list's", APPLICANT_ORDER_KEY === "applicantList.order.v1");
check("no order: no pager (opened from a link)", pagerFor(null, "b") === null);
check("not in the order: no pager", pagerFor(["a", "b", "c"], "z") === null);
check("alone in the order: no pager", pagerFor(["a"], "a") === null);
let pg = pagerFor(["a", "b", "c"], "b");
check("middle: 2 of 3, both ways", pg?.position === 2 && pg.total === 3 && pg.prevId === "a" && pg.nextId === "c");
pg = pagerFor(["a", "b", "c"], "a");
check("first: no previous", pg?.position === 1 && pg.prevId === null && pg.nextId === "b");
pg = pagerFor(["a", "b", "c"], "c");
check("last: no next", pg?.position === 3 && pg.nextId === null && pg.prevId === "b");
check("junk in storage is no order", parseApplicantOrder("{not json") === null && parseApplicantOrder('{"a":1}') === null && parseApplicantOrder("[]") === null);
check("only ids survive", JSON.stringify(parseApplicantOrder('["a", 3, null, "", "b"]')) === '["a","b"]');
const mem = new Map();
const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
writeApplicantOrder(["x", "y"], store);
check("what the list writes, the profile reads", JSON.stringify(readApplicantOrder(store)) === '["x","y"]' && mem.has("applicantList.order.v1"));
const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
check("blocked storage: no pager, no crash", readApplicantOrder(broken) === null && (writeApplicantOrder(["a"], broken), true));

/* ── 7. The phone's action bar: at most three on screen ────────────────── */
let bar = splitActionBar(["a", "b", "c"], 3);
check("three fit: all shown, no More", bar.shown.length === 3 && bar.more.length === 0);
bar = splitActionBar(["next", "move", "pass", "setup", "message"], 3);
check("five: two shown and More holds the rest, in order", bar.shown.join() === "next,move" && bar.more.join() === "pass,setup,message");
bar = splitActionBar(["move", "pass", "setup", "message"], 3);
check("four: two and More (three buttons on screen)", bar.shown.length + (bar.more.length > 0 ? 1 : 0) === 3);

/* ── 8. The timeline: applied, each test, the decision ─────────────────── */
let tl = timelineMoments(finisher({ status: "rejected" }), build(finisher({ status: "rejected" })));
check("applied first, the decision last", tl[0]?.label === "Applied" && tl.at(-1)?.label === "Declined" && tl.at(-1)?.at === "2026-10-05T16:10:00.000Z", tl.map((m) => m.label).join(" → "));
check("each finished test at its own time, in order", tl.filter((m) => m.kind === "step").map((m) => m.label).join() === "Skills check,Typing test,Player chat practice,Written interview", tl.map((m) => m.label).join(" → "));
check("a skipped step has no moment", !tl.some((m) => m.key === "step_connection"));
tl = timelineMoments(finisher(), build(finisher()));
check("undecided: no decision moment (updated_at is not a move)", !tl.some((m) => m.kind === "decision"));
tl = timelineMoments(onForm, build(onForm));
check("on the form: 'Started', not 'Applied'", tl.length === 1 && tl[0].label === "Started");
check("interview reads 'Moved to interview'", timelineMoments(finisher({ status: "interview" }), null).at(-1)?.label === "Moved to interview");
// The voice tools write no completedAt: the transcript says when it ended.
const TRANSCRIPT = [
  { role: "assistant", content: "Hi, I'm Ava.", timestamp: "2026-10-05T11:00:00.000Z" },
  { role: "user", content: "Hello.", timestamp: "2026-10-05T11:06:00.000Z" },
];
const VOICE_JOB = { ...JOB, workflow_steps: [...STEPS, { id: "step_voice", type: "voice_interview", title: "Voice interview" }] };
const voiced = finisher({ jobs: VOICE_JOB, voice_interview_result: { overall_score: 72 }, voice_interview_transcript: TRANSCRIPT });
tl = timelineMoments(voiced, build(voiced));
check("a voice interview keeps its moment, at the transcript's end", tl.some((m) => m.key === "step_voice" && m.label === "Voice interview" && m.at === "2026-10-05T11:06:00.000Z"), tl.map((m) => `${m.key}@${m.at}`).join(" "));
const oldVoice = finisher({ voice_interview_result: { overall_score: 72 }, voice_interview_transcript: TRANSCRIPT });
tl = timelineMoments(oldVoice, build(oldVoice));
check("…and so does one from before the job dropped the step", tl.some((m) => m.key === "extra-voice_interview"), tl.map((m) => m.key).join(" "));

/* ── 9. Ava's prose (one copy, both pages) ─────────────────────────────── */
const report = "**RESUME ANALYSIS**\nStatus: VALID_RESUME\nSummary: Two years of chat support.\n**SCORE EXPLANATION**\nStrong on tone.\nWeak on detail.\n**FLAGS**\n- none";
check("the Summary line", extractLabeledLine(report, "Summary") === "Two years of chat support.");
check("the SCORE EXPLANATION section", extractReportSection(report, "SCORE EXPLANATION") === "Strong on tone. Weak on detail.");
check("structured report → its two prose passages", avaProse(report) === "Two years of chat support. Strong on tone. Weak on detail.");
check("plain prose keeps its words, loses bullets and bare headers", avaProse("DECLINE NOTE\n- **Below** the typing bar.") === "Below the typing bar.");
check("clip cuts at a sentence when one is near", clip("One two three. Four five six seven eight nine.", 20) === "One two three.");
check("firstName", firstName("  Pat  Example ") === "Pat");
const quote = pullQuote([
  { role: "assistant", content: "Tell me about a hard case.", timestamp: "2026-10-05T15:00:00Z" },
  { role: "user", content: "A player said the game was rigged, so I walked them through how results are drawn.", timestamp: "2026-10-05T15:01:05Z" },
]);
check("the longest answer, with its time into the interview", quote?.at === "1:05" && /rigged/.test(quote.text), JSON.stringify(quote));

/* ── 10. Where the profile mounts it (source checks) ───────────────────── */
const { readFile } = await import("node:fs/promises");
const src = (rel) => readFile(new URL(`../${rel}`, import.meta.url), "utf8");
const profile = await src("src/cockpit/pages/CandidateDetail.tsx");
const listPage = await src("src/cockpit/pages/Applicants.tsx");
const rail = await src("src/cockpit/components/ApplicantJourneyRail.tsx");
const gemRail = await src("src/components/rail/GemRail.tsx");
const avasRead = await src("src/cockpit/components/AvasRead.tsx");
check("the profile draws the journey rail from the record's dots", /journeyDots\(record, status\)/.test(profile) && /<ApplicantJourneyRail/.test(profile));
check("the rail hands each gem its state, and GemRail honours it over position", /state: dot\.state === "done"/.test(rail) && /const stated = node\.state != null/.test(gemRail) && /node\.state === "skipped"/.test(gemRail));
check("Set up interview lives on the profile: the wizard and the 'propose times?' moment", /<InterviewSchedulingWizard/.test(profile) && /<InterviewMoment/.test(profile) && /text: "Set up interview"/.test(profile));
check("…moving them to interview offers it", /movingToInterview = advanceLabel === "Interview"/.test(profile) && /if \(movingToInterview\) setInterviewMoment\(true\)/.test(profile));
check("the pager reads the list's order and replaces history", /readApplicantOrder\(\)/.test(profile) && /pagerFor\(order, id\)/.test(profile) && /navigate\(`\/applicants\/\$\{target\}`, \{ replace: true \}\)/.test(profile));
check("the phone bar shows three at most, the rest behind More", /splitActionBar\(actions, 3\)/.test(profile) && /<MoreMenu/.test(profile));
check("…and More's menu is portalled, so a transformed ancestor cannot trap it", /createPortal\(/.test(profile) && /document\.body/.test(profile));
check("the Needs review pill is the tab's rule, not Ava's recommendation", /applicantChip\(status, finishedEveryTest\(dots\)\)/.test(profile) && !/declineRecommended \? \(\s*<span/.test(profile));
check("the profile URL is unchanged", /navigate\(`\/applicants\/\$\{target\}`/.test(profile));
// Since the Applicants page became a list (docs/APPLICANTS-LIST.md §1) it
// shows none of Ava's prose; the profile reads it through AvasRead, from the
// one module, and neither page writes its own copy.
check(
  "Ava's prose lives in one module, read by the profile; the list shows none",
  !/function avaProse\(/.test(profile) &&
    !/avaProse|AvasRead/.test(listPage) &&
    /<AvasRead\b/.test(profile) &&
    /from "\.\.\/lib\/avaProse"/.test(avasRead) &&
    !/function avaProse\(/.test(avasRead),
);
check("the profile's phone header has no dead account button", !/account\.name/.test(profile));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
