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
 * The desktop profile (docs/APPLICANT-PROFILE.md) reads the same record and
 * the same stored answers: "At a glance" (the job's quick picks, flagged ones
 * the server's way), "In their words" (the two answers that matter for the
 * job), the test tiles, the header's line and "Ava suggests".
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
  APPLICANT_TAB_KEY,
  readApplicantTab,
  writeApplicantTab,
  scorecardWhy,
  avaSuggests,
  headerLine,
  questionLabel,
  atAGlance,
  contactFacts,
  isLeadJob,
  inTheirWords,
  splitHeadline,
  testTiles,
  notTakenGroups,
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

/* ── 11. The desktop profile: At a glance ──────────────────────────────── */
// A lead's form, shaped like the live chat-lead job: quick picks with the
// owner's flag_options, long answers, a phone, a file.
const LEAD_QUESTIONS = [
  { id: "q1", type: "text", question: "Full name", required: true },
  { id: "q2", type: "email", question: "Email address", required: true },
  { id: "q3", type: "tel", question: "Phone number (WhatsApp if you have it)", required: true },
  { id: "q4", type: "select", question: "How long have you worked in customer support?", label: "Support experience", options: ["Under a year", "1 to 2 years", "2 to 4 years", "More than 4 years"], required: true },
  {
    id: "q5",
    type: "select",
    question: "Do you still take chats yourself while leading the team?",
    options: ["Most of the shift", "Some of the shift", "A little; mostly managing the team", "None"],
    flag_options: ["A little; mostly managing the team", "None"],
    flag_label: "Would rather only manage",
    required: true,
  },
  {
    id: "q6",
    type: "multiselect",
    question: "Which shifts can you cover, in US Eastern time? Pick every one that works.",
    options: ["Daytime, 8am to 4pm Eastern", "Evening, 4pm to midnight Eastern", "Overnight, midnight to 8am Eastern", "None of these"],
    flag_options: ["None of these"],
    required: true,
  },
  { id: "q7", type: "select", question: "Hours?", options: [] },
  { id: "q8", type: "textarea", question: "Why do you want this job?", required: false },
  { id: "q9", type: "long_text", question: "Tell us about a team you have led, coached or trained.", required: true },
  { id: "q10", type: "textarea", question: "Tell us about a time the rules changed suddenly. What did you do?", required: true },
  { id: "q11", type: "file", question: "Screenshot of a speed test", required: false },
];
const LEAD_ANSWERS = [
  { type: "text", answer: "Pat Example", question: "Full name", questionId: "q1" },
  { type: "email", answer: "pat@example.com", question: "Email address", questionId: "q2" },
  { type: "tel", answer: "+63 917 123 4567", question: "Phone number (WhatsApp if you have it)", questionId: "q3" },
  { type: "select", answer: "2 to 4 years", question: "How long have you worked in customer support?", questionId: "q4" },
  // A single answer with a ";" in it is ONE pick, never split.
  { type: "select", answer: "A little; mostly managing the team", question: "Do you still take chats yourself while leading the team?", questionId: "q5" },
  {
    type: "multiselect",
    answer: "Evening, 4pm to midnight Eastern; Overnight, midnight to 8am Eastern",
    selected: ["Evening, 4pm to midnight Eastern", "Overnight, midnight to 8am Eastern"],
    question: "Which shifts can you cover, in US Eastern time? Pick every one that works.",
    questionId: "q6",
  },
  { type: "textarea", answer: "To lead a night team that players can count on.", question: "Why do you want this job?", questionId: "q8" },
  { type: "textarea", answer: "Team leader at a BPO for two years, 8 chat agents on nights. I split the queue by topic and coached two slower agents.", question: "Tell us about a team you have led, coached or trained.", questionId: "q9" },
  { type: "textarea", answer: "Refunds moved to manager review overnight. I wrote one reply for the team and ran a huddle on each shift.", question: "Tell us about a time the rules changed suddenly. What did you do?", questionId: "q10" },
  { type: "file", answer: "user/1_q11.png", question: "Screenshot of a speed test", questionId: "q11" },
];
let glance = atAGlance(LEAD_QUESTIONS, LEAD_ANSWERS);
check("At a glance: the quick picks only, in the job's order", glance.map((r) => r.id).join() === "q4,q5,q6", glance.map((r) => r.id).join());
check("…a question's own label wins; otherwise its words up to the question mark", glance[0].label === "Support experience" && glance[1].label === "Do you still take chats yourself while leading the team", glance.map((r) => r.label).join(" | "));
check("…a single answer containing ';' is one pick, and flagged as the server flags it", glance[1].values.length === 1 && glance[1].values[0].flagged && glance[1].flag === "Would rather only manage");
check("…a pick-several answer keeps each pick on its own, none flagged", glance[2].values.map((v) => v.text).join("|") === "Evening, 4pm to midnight Eastern|Overnight, midnight to 8am Eastern" && glance[2].values.every((v) => !v.flagged));
check("…an unflagged answer is not amber", !glance[0].values[0].flagged && glance[0].flag === null);
check("…a choice question with no options is not a quick pick", !glance.some((r) => r.id === "q7"));
// Matched the way the server matches: curly quotes and spacing do not hide a flag.
glance = atAGlance(
  [{ id: "x", type: "select", question: "Lead?", options: ["I’d rather manage"], flag_options: ["I'd  rather manage"] }],
  [{ questionId: "x", answer: "I’d rather manage" }],
);
check("…flag matching ignores curly quotes and doubled spaces", glance[0]?.values[0]?.flagged === true);
// An answer stored before ids were kept matches by the question's words.
glance = atAGlance([{ id: "q5", type: "select", question: "Hours a week?", options: ["40 or more", "20 to 30"], flag_options: ["20 to 30"] }], [{ question: "Hours a week?", answer: "20 to 30" }]);
check("…an answer with no questionId matches by the question's words", glance.length === 1 && glance[0].values[0].flagged);
// A pick-several answer with no `selected` list splits on "; ".
glance = atAGlance([LEAD_QUESTIONS[5]], [{ questionId: "q6", answer: "None of these" }]);
check("…a pick-several answer with no list splits on '; ' and is flagged by its pick", glance[0].values.length === 1 && glance[0].values[0].flagged);
check("nothing answered, nothing shown", atAGlance(LEAD_QUESTIONS, []).length === 0 && atAGlance(null, null).length === 0);
check("questionLabel drops a trailing note in brackets", questionLabel({ question: "Phone number (WhatsApp if you have it)" }) === "Phone number");

let contact = contactFacts(LEAD_ANSWERS, null);
check("phone from the form's phone question, email from the form when the account has none", contact.phone === "+63 917 123 4567" && contact.email === "pat@example.com", JSON.stringify(contact));
contact = contactFacts([{ type: "text", question: "WhatsApp number", answer: "+234 803 000 1111" }], "acct@example.com");
check("…a free-text WhatsApp question still gives the phone; the account's email wins", contact.phone === "+234 803 000 1111" && contact.email === "acct@example.com", JSON.stringify(contact));
check("…none on file, none shown", JSON.stringify(contactFacts([], null)) === '{"phone":null,"email":null}');

/* ── 12. The desktop profile: In their words ───────────────────────────── */
check("a lead job is named by its title", isLeadJob("Chat Support Team Leader") && isLeadJob("Shift Supervisor") && !isLeadJob("Customer Support Chat Agent (Zulu Royal & Zulu Rush)"));
let words = inTheirWords(LEAD_QUESTIONS, LEAD_ANSWERS, "Chat Support Team Leader");
check("for a lead: the team they led, then the sudden change", words.forLead && words.picks.map((w) => w.id).join() === "q9,q10", words.picks.map((w) => w.id).join());
check("…'All N answers' counts every answer on the form", words.total === LEAD_ANSWERS.length);
words = inTheirWords(LEAD_QUESTIONS, LEAD_ANSWERS, "Customer Support Chat Agent");
check("not a lead: the first two long answers, in the order written", !words.forLead && words.picks.map((w) => w.id).join() === "q8,q9", words.picks.map((w) => w.id).join());
words = inTheirWords(LEAD_QUESTIONS, LEAD_ANSWERS.filter((a) => a.questionId !== "q10"), "Team Lead");
check("a lead whose form has no sudden-change answer: the team they led, then the first long answer left", !words.forLead && words.picks.map((w) => w.id).join() === "q9,q8", words.picks.map((w) => w.id).join());
words = inTheirWords(
  [{ id: "a", type: "text", question: "Anything else?" }, { id: "b", type: "select", question: "Pick", options: ["x"] }],
  [{ questionId: "a", type: "text", answer: "x".repeat(170) }, { questionId: "b", type: "select", answer: "y".repeat(200) }],
  null,
);
check("a free-text answer of 160+ characters counts as long; a pick never does", words.picks.map((w) => w.id).join() === "a", words.picks.map((w) => w.id).join());
check("no long answers: nothing to quote", inTheirWords(LEAD_QUESTIONS, LEAD_ANSWERS.slice(0, 6), "Team Leader").picks.length === 0);

/* ── 13. The desktop profile: the test tiles ───────────────────────────── */
check("splitHeadline: ratio, unit, percent, connection, words", JSON.stringify([splitHeadline("9 / 10"), splitHeadline("38 WPM"), splitHeadline("72%"), splitHeadline("↓ 28 · ↑ 9 Mbps"), splitHeadline("Sent"), splitHeadline(null)]) ===
  JSON.stringify([{ value: "9", unit: "/10" }, { value: "38", unit: "WPM" }, { value: "72", unit: "%" }, { value: "28 · 9", unit: "Mbps" }, { value: "Sent", unit: null }, null]));
const tileApp = finisher({ notes: JSON.stringify({ ...finisherNotes(), applicationAnswers: LEAD_ANSWERS }), jobs: { ...JOB, application_questions: LEAD_QUESTIONS } });
const tileRec = build(tileApp);
let tiles = testTiles(tileRec.entries, { passing: 60, questions: LEAD_QUESTIONS, answers: LEAD_ANSWERS, quizQuestions: QUIZ });
check(
  "one tile per test (not the integrity row), the scored tests first, the form, then what was not taken",
  tiles.map((t) => t.entry.kind).join() === "quiz,chat_simulation,chat_interview,typing_test,application,equipment_check",
  tiles.map((t) => t.entry.kind).join(),
);
check(
  "…what was not taken is said in the rail's words, one line per kind",
  JSON.stringify(notTakenGroups(tiles)) === JSON.stringify([{ words: "Skipped", titles: [tiles.find((t) => t.entry.kind === "equipment_check").entry.title] }]),
  JSON.stringify(notTakenGroups(tiles)),
);
const tileOf = (kind) => tiles.find((t) => t.entry.kind === kind);
check("skills check: the figure and the verdict", tileOf("quiz").big?.value === "10" && tileOf("quiz").big?.unit === "/10" && tileOf("quiz").verdict?.text === "Passed");
check("typing under the bar: the record's verdict, amber, accuracy as a row", tileOf("typing_test").verdict?.text === "Below the 45 WPM bar" && tileOf("typing_test").verdict?.tone === "amber" && tileOf("typing_test").rows[0]?.label === "Accuracy");
check("chat practice under the pass mark says so, with its two marks as rows", tileOf("chat_simulation").verdict?.text === "Below the 60 pass mark" && tileOf("chat_simulation").rows.map((r) => r.label).join() === "Empathy,Problem solving");
check("written interview: the recommendation is the verdict", tileOf("chat_interview").verdict?.text === "No Hire" && tileOf("chat_interview").big?.value === "25");
check("a step gone past with no result is a quiet tile that says so", tileOf("equipment_check").state === "none" && tileOf("equipment_check").entry.statusLabel === "No result on file" && !tileOf("equipment_check").entry.openable);
check("application: every required question answered, a flagged pick first among its rows", tileOf("application").verdict?.text === "All required answered" && tileOf("application").rows[0]?.tone === "amber", JSON.stringify(tileOf("application").rows));
check("every tile keeps to two rows", tiles.every((t) => t.rows.length <= 2));
tiles = testTiles(build(finisher({ notes: JSON.stringify({ ...finisherNotes(), applicationAnswers: LEAD_ANSWERS.slice(0, 2) }), jobs: { ...JOB, application_questions: LEAD_QUESTIONS } })).entries, { questions: LEAD_QUESTIONS, answers: LEAD_ANSWERS.slice(0, 2) });
check("application with required answers missing says how many, amber", /^6 required answers missing$/.test(tiles.find((t) => t.entry.kind === "application")?.verdict?.text ?? "") && tiles.find((t) => t.entry.kind === "application")?.verdict?.tone === "amber", tiles.find((t) => t.entry.kind === "application")?.verdict?.text);
// Someone on the skills check right now: that tile is live, the later ones not reached.
tiles = testTiles(build(finisher({ status: "reviewing", phase: "quiz", notes: JSON.stringify({ applicationAnswers: ANSWERS }) }), [sess({ application_id: "app-finisher", step_id: "quiz", progress: { current_index: 2, total: 10 } })]).entries);
check("a test being taken is a live tile with no figure, the rest not reached", tiles[0].entry.kind === "quiz" && tiles[0].state === "live" && tiles[0].big === null && tiles.filter((t) => t.state === "none").length === 4, tiles.map((t) => `${t.entry.kind}:${t.state}`).join());
{
  const liveEntries = build(finisher({ status: "reviewing", phase: "quiz", notes: JSON.stringify({ applicationAnswers: ANSWERS }) }), [sess({ application_id: "app-finisher", step_id: "quiz", progress: { current_index: 2, total: 10 } })]).entries;
  const inOrder = liveEntries.filter((e) => e.status !== "done" && e.status !== "in_progress" && e.kind !== "integrity" && e.kind !== "resume").map((e) => e.title);
  check(
    "…the ones not reached are one line, 'Not reached yet', in the record's (the rail's) order",
    notTakenGroups(tiles).length === 1 && notTakenGroups(tiles)[0].words === "Not reached yet" && notTakenGroups(tiles)[0].titles.join() === inOrder.join() && inOrder.length === 4,
    JSON.stringify(notTakenGroups(tiles)) + " vs " + inOrder.join(),
  );
}

// The tiles' rows, from entries shaped as the record builds them.
const doneEntry = (kind, detail, over = {}) => ({
  key: `k-${kind}`, kind, stepType: kind, title: kind, status: "done", statusLabel: "Done", headline: "7 / 10", tone: "jade",
  verdict: null, subline: null, receipt: null, completedAt: null, integrity: { total: 0 }, openable: true, detail, ...over,
});
const quizItems = (marks) => marks.map(([category, isCorrect], index) => ({ id: `q${index + 1}`, index, category, isCorrect }));
let rows = testTiles([doneEntry("quiz", { kind: "quiz", items: quizItems([["money_rules", false], ["accounts", false], ["security", false], ["bonuses", true]]) })])[0].rows;
check("skills check: the must-pass area missed has its own row and is not said again under Missed", JSON.stringify(rows) === JSON.stringify([{ label: "Missed", value: "Accounts, Security", tone: "amber" }, { label: "Money rules", value: "Missed", tone: "amber" }]), JSON.stringify(rows));
rows = testTiles([doneEntry("quiz", { kind: "quiz", items: quizItems([["money_rules", false], ["bonuses", true]]) })])[0].rows;
check("…only the must-pass area missed: its row alone, no 'Missed: None' beside it", JSON.stringify(rows) === JSON.stringify([{ label: "Money rules", value: "Missed", tone: "amber" }]), JSON.stringify(rows));
rows = testTiles([doneEntry("quiz", { kind: "quiz", items: quizItems([["money_rules", true], ["accounts", false]]) })])[0].rows;
check("…the area right: Missed lists the rest, the area says Right", JSON.stringify(rows) === JSON.stringify([{ label: "Missed", value: "Accounts", tone: "amber" }, { label: "Money rules", value: "Right", tone: "jade" }]), JSON.stringify(rows));
rows = testTiles([doneEntry("chat_interview", { kind: "chat_interview", credibility: "High", questionCount: 4, duration: "5:28" }, { verdict: "No Hire" })])[0].rows;
check("written interview: credibility, and the questions with their length on one row (the cap never drops the length)", JSON.stringify(rows) === JSON.stringify([{ label: "Credibility", value: "High" }, { label: "Questions", value: "4 in 5:28" }]), JSON.stringify(rows));
// An application saved before ids were kept: its answers are matched to the
// required questions by their words, never counted missing.
const oldForm = doneEntry(
  "application",
  { kind: "application", answers: [{ id: "answer-0", question: "Full  name", answer: "Pat", file: null }, { id: "answer-1", question: "Why this job?", answer: "Because", file: null }] },
  { headline: "2 answers", subline: "Cover letter" },
);
let verdict = testTiles([oldForm], { questions: [{ id: "a1", question: "Full name", required: true }, { id: "a2", question: "Why this job?", required: true }] })[0].verdict;
check("application: answers with no question id still count, by the question's words; the cover letter is said beside", verdict?.text === "All required answered · Cover letter" && verdict?.tone === "jade", JSON.stringify(verdict));
verdict = testTiles([oldForm], { questions: [{ id: "a1", question: "Full name", required: true }, { id: "a3", question: "Phone?", required: true }] })[0].verdict;
check("…a required question with no answer by id or words is still missing", verdict?.text === "1 required answer missing · Cover letter" && verdict?.tone === "amber", JSON.stringify(verdict));
// The connection check's flags and the chat practice's typing are never cut.
const connected = finisher({
  notes: JSON.stringify({
    ...finisherNotes(),
    equipmentCheckResult: { downloadMbps: 18.6, uploadMbps: 1.2, latencyMs: 74, runs: 3, usingThisComputer: "ran_here_anyway", deviceKind: "computer", device: { os: "Windows", osVersion: "10", browser: "Edge", browserVersion: "130" }, bars: { minDownloadMbps: 10, minUploadMbps: 3, maxLatencyMs: 200 } },
    chatSimulationResult: { messageCount: 8, score: 72, empathy: 70, problemSolving: 74, completed: true, typing: { wpm: 32, correctionsPct: 9, medianReplySeconds: 140, repliesTimed: 6, bar: { minWpm: 40, maxMedianReplySeconds: 90 } } },
    _trusted: { ...finisherNotes()._trusted, step_connection: { stepType: "equipment_check", completedAt: "2026-10-05T15:46:00.000Z" } },
  }),
});
tiles = testTiles(build(connected).entries, { passing: 60 });
const conn = tiles.find((t) => t.entry.kind === "equipment_check");
check("connection: download · upload as the figure (rounded down; the missed one with its decimal), the computer and the answer as rows", conn?.big?.value === "18 · 1.2" && conn?.big?.unit === "Mbps" && conn?.rows.map((r) => r.label).join() === "Computer,Their work computer" && conn?.rows[0].value === "Windows 10 · Edge", JSON.stringify(conn?.rows));
check("…its flags each a line of their own", conn?.notes.some((n) => n.kind === "flag" && /ran here anyway/.test(n.text)) && conn?.notes.some((n) => /3 runs/.test(n.text)), JSON.stringify(conn?.notes));
const chatTile = tiles.find((t) => t.entry.kind === "chat_simulation");
check("chat practice: its typing line, amber when it needs a look (the job has a typing test: information only)", chatTile?.notes.some((n) => n.kind === "typing" && /32 WPM/.test(n.text)) === true, JSON.stringify(chatTile?.notes));
check("…over the pass mark says so", chatTile?.verdict?.text === "Meets the 60 pass mark" && chatTile?.verdict?.tone === "jade");

/* ── 14. The desktop profile: the header ───────────────────────────────── */
check("scorecardWhy reads whyUp / whyDown, deduped, empty on an older scorecard", JSON.stringify(scorecardWhy({ whyUp: ["a", "a", " b "], whyDown: ["c", 3] })) === '{"up":["a","b"],"down":["c"]}' && JSON.stringify(scorecardWhy(null)) === '{"up":[],"down":[]}');
check("Ava suggests: move on (jade), every requirement met", JSON.stringify(avaSuggests({ recommendedAction: "advance", hardRequirementStatus: "met" }, "reviewing", "Interview")) === JSON.stringify({ tone: "jade", text: "Move to interview. Every requirement met." }));
check("…look closer (amber)", avaSuggests({ recommendedAction: "review", hardRequirementStatus: "mixed" }, "reviewing", "Interview")?.tone === "amber");
check("…decline (crit), with her reason", avaSuggests({ recommendedAction: "reject", hardRejectReason: "Typing 38 WPM is below 45." }, "reviewing", "Interview")?.text === "Decline. Typing 38 WPM is below 45." && avaSuggests({ recommendedAction: "reject" }, "pending", "Shortlist")?.tone === "crit");
check("…nothing once a person has decided, while on the form, or before she has a view", avaSuggests({ recommendedAction: "advance" }, "interview", "Offer") === null && avaSuggests({ recommendedAction: "advance" }, "in_progress", null) === null && avaSuggests({}, "reviewing", "Interview") === null);
const words2 = (ms, now) => (ms == null ? "a while ago" : `${Math.round((now - ms) / MIN)} min ago`);
const rowBase = { decided: false, finished: false, liveState: null, lastActiveAt: null, activeWords: "", lineText: "" };
check("header line: finished every test, when", JSON.stringify(headerLine({ ...rowBase, finished: true, lastActiveAt: ago(40 * MIN) }, null, words2, NOW)) === JSON.stringify({ text: "Finished every test 40 min ago", tone: "jade" }));
check("…a live attempt in its own words; amber once they have gone", headerLine({ ...rowBase, liveState: "away" }, { summary: "Player chat practice: away from the test for under a minute" }, words2, NOW)?.tone === "amber" &&
  headerLine({ ...rowBase, liveState: "doing" }, { summary: "Skills check: answering question 3" }, words2, NOW)?.text === "Skills check: answering question 3");
check("…otherwise where they are on the journey, muted; decided, the row's own words", headerLine({ ...rowBase, lineText: "Typing test · step 4 of 7 · not started" }, null, words2, NOW)?.tone === "muted" && headerLine({ ...rowBase, decided: true, activeWords: "Decided Mon" }, null, words2, NOW)?.text === "Decided Mon");

// The list's tab, carried to "Back to applicants · Needs review".
const tabMem = new Map();
const tabStore = { getItem: (k) => tabMem.get(k) ?? null, setItem: (k, v) => tabMem.set(k, v) };
writeApplicantTab("needs-review", tabStore);
check("the list's tab, written beside its order and read back", readApplicantTab(tabStore) === "needs-review" && tabMem.has(APPLICANT_TAB_KEY) && APPLICANT_TAB_KEY === "applicantList.tab.v1");
tabMem.set(APPLICANT_TAB_KEY, "<script>");
check("…anything that is not a tab key is ignored; blocked storage reads nothing", readApplicantTab(tabStore) === null && readApplicantTab(broken) === null && (writeApplicantTab("all", broken), true));

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

// The desktop profile (docs/APPLICANT-PROFILE.md): the phone keeps its
// layout; from 768 the sections go full width; from 1200 the two columns.
const css = await src("src/cockpit/cockpit.css");
const glanceSrc = await src("src/cockpit/components/ApplicantAtAGlance.tsx");
const cardSrc = await src("src/cockpit/components/ApplicantDecisionCard.tsx");
check("three layouts by the same width road: the phone under 768, the column, then the desktop from 1200", /const isMobile = useIsMobile\(\);/.test(profile) && /useMinWidth\(1200\)/.test(profile) && /if \(!isMobile\) \{/.test(profile) && /data-profile-layout="desktop"/.test(profile) && /data-profile-layout="column"/.test(profile));
check("…and the Applicants list reads the same hook, not a copy of its own", !/function useMinWidth/.test(listPage) && /useMinWidth\(1024\)/.test(listPage));
check("the phone's bar is still portalled", /\{isMobile \? createPortal\(barNode, document\.body\) : barNode\}/.test(profile));
check(
  "the column's foot bar is the card's own buttons, shown only once the card has scrolled away",
  /<ApplicantDecisionCard actions=\{cardActions\} outcome=\{outcome\} layout="bar" \/>/.test(profile) && /data-shown=\{cardGone \? "" : undefined\}/.test(profile) && /useScrolledPast\(/.test(profile) && /\.ckp-footbar:not\(\[data-shown\]\) \{\s*visibility: hidden;/.test(css),
);
check("the layout follows the page's own width, not the window's", /const pageWidth = useClientWidth\(topEl\)/.test(profile) && /width >= DESKTOP_PAGE/.test(profile) && /const DESKTOP_PAGE = 900;/.test(profile));
check("Back and the pager stay on screen, on a solid ground once the page scrolls under them", /className="ckp-topline"/.test(profile) && /\.ckp-topline \{\s*position: sticky;/.test(css) && /\.ckp-topline\[data-stuck\] \{ background: var\(--ground\);/.test(css));
check("the desktop's decision card draws the page's own actions (one set, two ways)", /<ApplicantDecisionCard actions=\{cardActions\}/.test(profile) && /primary: lead,/.test(profile) && /quiet: passAction/.test(profile) && /extra: continueAction \? \[continueAction\] : \[\]/.test(profile) && /export interface DecisionAction/.test(cardSrc));
check("Pass reads 'Pass on <first name>' on the card, still 'Pass' on the phone", /text: "Pass", cardText: `Pass on \$\{first\}`/.test(profile));
check("the tiles, In their words and At a glance read the record and the stored answers", /testTiles\(record\.entries, \{ passing: deskApp\?\.jobs\?\.passing_score \?\? null, questions, answers, quizQuestions/.test(profile) && /inTheirWords\(questions, answers,/.test(profile) && /atAGlance\(questions, answers\)/.test(profile) && /parseApplicationNotes\(deskApp\?\.notes \?\? null\)\.applicationAnswers/.test(profile));
check("a tile and 'All N answers' open the same record sheet as the phone's rows", /<ApplicantTestTiles tiles=\{tiles\} onOpen=\{openRecord\} \/>/.test(profile) && /onAll=\{applicationEntry \? \(\) => openRecord\(applicationEntry\) : null\}/.test(profile));
check("phone and email are copied, never a tel: link", /writeText/.test(glanceSrc) && !/href=\{?["'`]tel:/.test(glanceSrc) && !/["'`]tel:/.test(glanceSrc) && !/tel:/.test(profile));
check(
  "the right column stays whole on screen when it fits; otherwise the decision card stays and the panels scroll with the page (no box of its own)",
  /\.ckp-aside\[data-fit="whole"\] \{\s*position: sticky;/.test(css) && /\.ckp-aside\[data-fit="card"\] > \.ckp-decide-wrap \{\s*position: sticky;/.test(css) && /data-fit=\{fit\}/.test(profile) && !/\.ckp-aside[^{]*\{[^}]*overflow-y: auto/.test(css),
);
check(
  "the tiles' grid: auto-fill from 270px, never more than three across; the right column grows with the page",
  /grid-template-columns: repeat\(auto-fill, minmax\(max\(270px, calc\(\(100% - 28px\) \/ 3\)\), 1fr\)\)/.test(css) && /grid-template-columns: minmax\(0, 1fr\) clamp\(316px, 32%, 440px\)/.test(css),
);
const shellSrc = await src("src/cockpit/Shell.tsx");
check("the cockpit lets the profile, and only the profile, use 1680px", /PROFILE_ROUTE = \/\^\\\/applicants\\\/\[\^\/\]\+\\\/\?\$\//.test(shellSrc) && /PROFILE_ROUTE\.test\(pathname\) \? "max-w-\[1680px\]" : "max-w-\[1240px\]"/.test(shellSrc));
const tilesSrc = await src("src/cockpit/components/ApplicantTestTiles.tsx");
check("a live tile shows the flags on the attempt in progress", /tile\.state === "live" && tile\.flags > 0/.test(tilesSrc));
check("the rail's sealed pill takes each theme's button ink (contrast in Day)", /\.ck-rail-receipt\.show\.is-sealed \{[^}]*color: var\(--btn-fg\);/.test(css));
check("Back names the list's tab only when the pager came from that list", /readApplicantTab\(\)/.test(profile) && /const tabWords = pager && listTab/.test(profile) && /writeApplicantTab\(state\.tab\)/.test(listPage));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
