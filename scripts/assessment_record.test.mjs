#!/usr/bin/env node
/**
 * buildAssessmentRecord (src/cockpit/lib/assessmentRecord.ts) — the one reader
 * behind the staff side's "What they submitted" list and its detail sheet.
 *
 * On 2026-10-05 the owner ran a test applicant through every step of the Zulu
 * chat-agent role and the applicant panel showed one tile, "SKILLS CHECK 10/10".
 * The answers, the typing result, the chat practice and the written interview
 * were all in applications.notes; nothing read them. These checks run the real
 * builder over a record shaped exactly like that run's (invented people, same
 * keys and nesting), plus the shapes that run did not exercise: the End-button
 * interview, a quiz kept on a workflow step, a half-written row, and an
 * applicant who has only pressed Apply.
 *
 * The builder imports through the app's "@/" alias, so this file maps "@/" to
 * src/ with a resolve hook before importing it. Node 24+ strips the types.
 *
 * Run with: node scripts/assessment_record.test.mjs
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

const {
  buildAssessmentRecord,
  correctOptionsFor,
  quizKeyMap,
  applicantBucket,
  applicantTab,
  applicantTabParam,
  defaultApplicantBucket,
  integrityOf,
  weighedPhrase,
  QUIZ_QUESTIONS_KEY_STEP,
} = await import("../src/cockpit/lib/assessmentRecord.ts");

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

/* ── The live role's shape ─────────────────────────────────────────────── */

const ZULU_STEPS = [
  { id: "step_typing", type: "typing_test", title: "Typing speed and accuracy", config: { min_wpm: 45, min_accuracy_percent: 95 } },
  {
    id: "step_chat",
    type: "chat_simulation",
    title: "Player chat practice",
    config: { scenarios: [{ id: "rigged", customerName: "Devin", scenario: "Devin lost $200 tonight and says the game is rigged." }] },
  },
  { id: "step_interview", type: "chat_interview", title: "Written interview" },
];
const QUIZ_QUESTIONS = Array.from({ length: 10 }, (_, i) => ({
  id: `zq${i + 1}`,
  type: i === 1 ? "true_false" : "multiple_choice",
  category: i % 2 ? "money_rules" : "payments",
  question: `Player situation ${i + 1}`,
  options: i === 1 ? ["True", "False"] : ["Wait it out", "Ask for the sender name and amount", "Ask for a bank login", "Ignore it"],
}));
const JOB = { id: "job-zulu", workflow_steps: ZULU_STEPS, quiz_questions: QUIZ_QUESTIONS, passing_score: 60, required_wpm: 45, processing_mode: "auto" };

const quizAnswers = QUIZ_QUESTIONS.map((q, i) => ({
  question: q.question,
  isCorrect: true,
  questionId: q.id,
  questionType: "multiple_choice",
  selectedAnswer: 1,
  selectedAnswerText: q.options[1],
}));

/** Shaped like the owner's run: every key, every nesting, invented words. */
function finishedNotes(overrides = {}) {
  return {
    quiz: {
      type: "quiz",
      score: 100,
      total: 10,
      passed: true,
      correct: 10,
      answers: quizAnswers,
      completedAt: "2026-10-05T15:45:43.768Z",
      totalViolations: 0,
      violationSummary: "No violations detected",
      antiCheatViolations: [],
    },
    quizResult: { score: 100, total: 10, passed: true, correct: 10 },
    applicationAnswers: [
      { type: "text", answer: "Robin Example", question: "Full name", questionId: "q1" },
      { type: "email", answer: "robin@example.com", question: "Email address", questionId: "q2" },
      {
        type: "multi_select",
        answer: "Daytime, 8am to 4pm Eastern; Weekends (Saturday and Sunday)",
        selected: ["Daytime, 8am to 4pm Eastern", "Weekends (Saturday and Sunday)"],
        question: "Which shifts can you cover?",
        questionId: "q5",
      },
      { type: "select", answer: "40 or more", question: "How many hours a week can you work?", questionId: "q6" },
      { type: "textarea", answer: "Two years of chat support for a phone carrier.", question: "Describe your support experience.", questionId: "q9" },
    ],
    typingTestResult: { wpm: 38, accuracy: 85, score: 72, passed: false, requiredWpm: 45, tabSwitches: 0, violations: [] },
    step_typing: { type: "typing_test", wpm: 38, accuracy: 85, score: 72, passed: false, requiredWpm: 45, tabSwitches: 0, violations: [], completedAt: "2026-10-05T15:47:40.116Z" },
    _trusted: {
      step_typing: { stepType: "typing_test", completedAt: "2026-10-05T15:47:40.146Z" },
      step_chat: { stepType: "chat_simulation", completedAt: "2026-10-05T15:51:46.150Z" },
      step_interview: { stepType: "chat_interview", completedAt: "2026-10-05T15:57:59.597Z" },
    },
    chatSimulationResult: {
      scenario: "Devin lost $200 tonight and says the game is rigged.",
      messageCount: 11,
      score: 18,
      empathy: 15,
      problemSolving: 12,
      strengths: ["Apologised early"],
      improvements: ["Explain that results are random", "Offer a spending limit"],
      completed: true,
      antiCheatSummary: { hasViolations: true, violationCount: 3, tabSwitches: 2, copyPasteAttempts: 1 },
    },
    chatInterviewResult: {
      messages: [
        { role: "assistant", content: "Welcome. What drew you to player support?", timestamp: "2026-10-05T15:53:41.677Z" },
        { role: "user", content: "I like helping people when they are stuck.", timestamp: "2026-10-05T15:54:57.064Z" },
        { role: "assistant", content: "Tell me about an upset customer.", timestamp: "2026-10-05T15:55:30.000Z" },
        { role: "user", content: "I stayed calm and found the payment.", timestamp: "2026-10-05T15:56:10.000Z" },
      ],
      duration: "4:11",
      questionCount: 4,
      violations: [
        { type: "tab_switch", timestamp: "2026-10-05T15:53:41.072Z", details: "Window lost focus" },
        { type: "tab_switch", timestamp: "2026-10-05T15:53:50.456Z", details: "Window lost focus" },
        { type: "tab_switch", timestamp: "2026-10-05T15:57:14.643Z", details: "Window lost focus" },
      ],
      evaluation: {
        score: 25,
        strengths: ["Calm tone"],
        concerns: ["Answers were general"],
        inconsistencies: [
          { claim: "Says they resolve issues professionally", evidence: "Gave no example", assessment: "Not supported yet" },
          { claim: "Prior sweepstakes support", evidence: "No detail given", assessment: "Unverified" },
        ],
        credibilityRating: "Medium",
        recommendation: "No Hire",
        summary: "Kind tone, little evidence of resolving a case.",
      },
    },
    ...overrides,
  };
}

function finishedApp(overrides = {}) {
  return {
    id: "app-1",
    status: "reviewing",
    phase: "step_interview",
    created_at: "2026-10-05T15:39:19.619Z",
    notes: JSON.stringify(finishedNotes()),
    resume_url: null,
    cover_letter: null,
    ai_scorecard: {
      recommendedAction: "reject",
      riskFlags: [
        "Resume could not be analyzed",
        "A stated non-negotiable or deal-breaker appears to conflict with the application",
        "Typing test result of 38 WPM is below the explicit 45 WPM minimum.",
      ],
    },
    jobs: JOB,
    ...overrides,
  };
}

/* ── 1. The owner's run, every step ────────────────────────────────────── */

const rec = buildAssessmentRecord(finishedApp());
const byKey = Object.fromEntries(rec.entries.map((e) => [e.key, e]));

check(
  "one entry per step the job gives, in journey order, then the integrity row",
  rec.entries.map((e) => e.key).join(",") === "application,quiz,step_typing,step_chat,step_interview,integrity",
  rec.entries.map((e) => e.key).join(","),
);
check("every test reads as done", rec.entries.every((e) => e.status === "done"), rec.entries.map((e) => `${e.key}:${e.status}`).join(","));
check("titles come from the job (journey titles)", byKey.step_typing.title === "Typing speed and accuracy" && byKey.quiz.title === "Skills check");
check("no Voice entry on a job with no voice step", !rec.entries.some((e) => e.kind === "voice_interview"));

check("application headline counts the answers", byKey.application.headline === "5 answers", byKey.application.headline);
const shifts = byKey.application.detail.answers.find((a) => a.id === "q5");
check(
  "a pick-several answer keeps every option picked, as a list",
  Array.isArray(shifts?.selected) && shifts.selected.length === 2 && shifts.selected[1] === "Weekends (Saturday and Sunday)",
  JSON.stringify(shifts),
);
check(
  "Ava's deal-breaker flag sits with the application answers",
  byKey.application.detail.flags.length === 1 && /deal-breaker/.test(byKey.application.detail.flags[0]),
  JSON.stringify(byKey.application.detail.flags),
);

check("skills check reads 10 / 10, Passed", byKey.quiz.headline === "10 / 10" && byKey.quiz.verdict === "Passed" && byKey.quiz.tone === "jade");
check("skills check keeps every question with the pick", byKey.quiz.detail.items.length === 10 && byKey.quiz.detail.items.every((q) => q.picked[0] === 1));
check("skills check options come from the job", byKey.quiz.detail.items[0].options.length === 4 && byKey.quiz.detail.items[1].options[1] === "False");
check("skills check keys are filed under the top-level quiz", byKey.quiz.detail.keyStepId === QUIZ_QUESTIONS_KEY_STEP);
check("the interview's rail receipt stays a number", byKey.step_interview.receipt === "25/100", byKey.step_interview.receipt);
check("a sent application reads Sent", byKey.application.statusLabel === "Sent");
check("skills check rail receipt keeps its old wording", byKey.quiz.receipt === "10/10 · passed", byKey.quiz.receipt);

check("typing reads 38 WPM", byKey.step_typing.headline === "38 WPM");
check("typing says which bar it missed", byKey.step_typing.verdict === "Below the 45 WPM bar", byKey.step_typing.verdict);
check("typing carries its accuracy and the job's accuracy bar", byKey.step_typing.subline === "85% accurate" && byKey.step_typing.detail.requiredAccuracy === 95);
check("typing admits the passage and typed text were not kept", byKey.step_typing.detail.passage === null && byKey.step_typing.detail.typed === null);
check("typing finished time comes from the trusted record", byKey.step_typing.completedAt === "2026-10-05T15:47:40.146Z", byKey.step_typing.completedAt);

check("chat practice reads 18 / 100", byKey.step_chat.headline === "18 / 100" && byKey.step_chat.tone === "amber");
check("chat practice names the player from the job's scenario", byKey.step_chat.detail.customerName === "Devin");
check("chat practice transcript is honestly absent", byKey.step_chat.detail.transcript === null);
check("chat practice counts its 3 flags (counts only)", byKey.step_chat.integrity.total === 3 && byKey.step_chat.integrity.countsOnly === true && byKey.step_chat.integrity.tabSwitches === 2);

check("AI-ended interview reads its score from .evaluation", byKey.step_interview.headline === "25 / 100", byKey.step_interview.headline);
check("AI-ended interview reads its recommendation from .evaluation", byKey.step_interview.verdict === "No Hire" && byKey.step_interview.tone === "amber");
check("interview keeps the transcript", byKey.step_interview.detail.transcript?.length === 4 && byKey.step_interview.detail.transcript[1].role === "candidate");
check("interview keeps the inconsistencies", byKey.step_interview.detail.inconsistencies.length === 2);
check("interview keeps the timed violation list", byKey.step_interview.integrity.events.length === 3 && byKey.step_interview.integrity.events[0].label === "Left the window");

check("integrity row adds every flag across the tests", byKey.integrity.headline === "6 flags" && byKey.integrity.verdict === "in 2 tests", `${byKey.integrity.headline} ${byKey.integrity.verdict}`);
check("Ava's risk flags come through verbatim", rec.riskFlags.length === 3 && rec.riskFlags[2].startsWith("Typing test result"));
check("her weighed line counts a full record instead of listing it", weighedPhrase(rec.entries) === "all 5 steps", weighedPhrase(rec.entries));

/* ── 2. The End-button interview (flat fields, no transcript) ──────────── */

const manual = buildAssessmentRecord(
  finishedApp({
    notes: JSON.stringify(
      finishedNotes({
        chatInterviewResult: {
          messageCount: 12,
          duration: 251,
          score: 61,
          strengths: ["Specific examples"],
          concerns: ["Rushed the ending"],
          recommendation: "Hire",
          completed: true,
          antiCheatSummary: { hasViolations: false, violationCount: 0, tabSwitches: 0, copyPasteAttempts: 0 },
        },
      }),
    ),
  }),
).entries.find((e) => e.key === "step_interview");
check("End-button interview reads its flat score", manual.headline === "61 / 100" && manual.verdict === "Hire" && manual.tone === "jade");
check("End-button interview duration in seconds reads as m:ss", manual.detail.duration === "4:11", manual.detail.duration);
check("End-button interview transcript is honestly absent", manual.detail.transcript === null && manual.detail.messageCount === 12);

/* ── 3. A quiz kept on a workflow step ─────────────────────────────────── */

const wfQuizJob = {
  ...JOB,
  quiz_questions: [],
  workflow_steps: [
    { id: "wf-quiz", type: "quiz", config: { questions: [{ id: "a1", question: "Pick two", type: "multi_select", options: ["One", "Two", "Three"] }] } },
    ...ZULU_STEPS,
  ],
};
const wf = buildAssessmentRecord({
  status: "reviewing",
  phase: "step_typing",
  notes: JSON.stringify({
    applicationAnswers: [{ question: "Name", answer: "Robin" }],
    "wf-quiz": {
      score: 50,
      correct: 0.5,
      total: 1,
      passed: false,
      completedAt: "2026-10-01T10:00:00Z",
      answers: [{ questionId: "a1", question: "Pick two", questionType: "multi_select", selectedAnswers: ["One", "Three"], isCorrect: false, isPartialCredit: true }],
    },
    quizResult: { score: 50, total: 1, passed: false, correct: 0.5 },
  }),
  jobs: wfQuizJob,
});
const wfQuiz = wf.entries.find((e) => e.kind === "quiz");
check("a workflow-step quiz is read from notes[step.id]", wfQuiz?.status === "done" && wfQuiz.headline === "0.5 / 1", wfQuiz?.headline);
check("a workflow-step quiz files its keys under the step id", wfQuiz?.detail.keyStepId === "wf-quiz");
check("a pick-several quiz answer maps back to option indexes", JSON.stringify(wfQuiz?.detail.items[0].picked) === "[0,2]" && wfQuiz.detail.items[0].partial === true);
check("the step they are on now reads In progress", wf.entries.find((e) => e.key === "step_typing")?.status === "in_progress");
check("steps after it read Not started yet", wf.entries.find((e) => e.key === "step_chat")?.statusLabel === "Not started yet");
check("an unfinished step opens nothing", wf.entries.filter((e) => e.status !== "done").every((e) => !e.openable));

/* ── 4. Correct answers, matched three ways ────────────────────────────── */

const item = { options: ["Wait it out", "Ask for the sender name and amount", "Ask for a bank login"] };
check("correct_answer as text finds its option", JSON.stringify(correctOptionsFor(item, { correct_answer: "ask for the sender name and amount " })?.indexes) === "[1]");
check("correctAnswer as an index", JSON.stringify(correctOptionsFor(item, { correctAnswer: 2 })?.indexes) === "[2]");
check("correct_answers for pick-several", JSON.stringify(correctOptionsFor({ options: ["One", "Two", "Three"] }, { correct_answers: ["Two", "Three"] })?.indexes) === "[1,2]");
check("a key with no answer (a fit question) gives nothing", correctOptionsFor(item, { fit_context: "x" }) === null && correctOptionsFor(item, null) === null);
const keys = quizKeyMap(
  [
    { step_id: QUIZ_QUESTIONS_KEY_STEP, question_id: "zq1", key: { correct_answer: "Ask for the sender name and amount" } },
    { step_id: "wf-quiz", question_id: "zq1", key: { correct_answer: "Other" } },
  ],
  QUIZ_QUESTIONS_KEY_STEP,
);
check("keys are read for this quiz only", keys.size === 1 && keys.get("zq1").correct_answer === "Ask for the sender name and amount");

/* ── 5. Someone who has only pressed Apply ─────────────────────────────── */

const started = buildAssessmentRecord({ status: "in_progress", phase: "application", notes: null, jobs: JOB, created_at: "2026-10-05T15:39:19Z" });
check("pressed Apply → filling in the form", started.fillingInForm === true);
check("their application row says so", started.entries[0].status === "in_progress" && started.entries[0].statusLabel === "Filling in the form");
check("every test after it is not started yet", started.entries.slice(1).every((e) => e.status === "not_started" && e.statusLabel === "Not started yet"));
check("nothing of theirs opens yet", started.entries.every((e) => !e.openable));

/* ── 6. Rows that must not throw or invent ─────────────────────────────── */

let malformed;
try {
  malformed = buildAssessmentRecord({ status: "pending", phase: "application", notes: "{not json", jobs: JOB });
} catch (err) {
  malformed = err;
}
check("malformed notes do not throw", !(malformed instanceof Error), String(malformed));
check("a sent application with unreadable notes still reads as sent", malformed.entries?.[0]?.status === "done" && malformed.entries[0].headline === "Sent");
check("showcase rows (no notes, no job) have no record", buildAssessmentRecord({ status: "pending" }).entries.length === 0);
check("null input is safe", buildAssessmentRecord(null).entries.length === 0);

const rejected = buildAssessmentRecord({ status: "rejected", phase: "quiz", notes: JSON.stringify({ applicationAnswers: [{ question: "Name", answer: "Robin" }] }), jobs: JOB });
check("a part-way record counts what is done", weighedPhrase(wf.entries) === "application and skills check", weighedPhrase(wf.entries));
check(
  "a decided application calls tests after where it stopped Not taken",
  rejected.entries.filter((e) => e.kind !== "application" && e.kind !== "quiz").every((e) => e.statusLabel === "Not taken"),
  rejected.entries.map((e) => `${e.key}:${e.statusLabel}`).join(","),
);
const hiredBlank = buildAssessmentRecord({ status: "hired", phase: "decision", notes: JSON.stringify({ applicationAnswers: [{ question: "Name", answer: "Robin" }] }), jobs: JOB });
check(
  "a step they went past with no result says so, never Not taken",
  hiredBlank.entries.filter((e) => e.kind !== "application").every((e) => e.statusLabel === "No result on file"),
  hiredBlank.entries.map((e) => `${e.key}:${e.statusLabel}`).join(","),
);

const withResume = buildAssessmentRecord(finishedApp({ resume_url: "resumes/robin.pdf" }));
check("a resume on file sits right after the application", withResume.entries[1].kind === "resume" && withResume.entries[1].openable);

const orphan = buildAssessmentRecord({
  status: "reviewing",
  notes: JSON.stringify({ applicationAnswers: [{ question: "Name", answer: "Robin" }], typingTestResult: { wpm: 60, accuracy: 98, passed: true } }),
  jobs: { workflow_steps: [], quiz_questions: [] },
});
check("a result for a step the job no longer lists is still shown", orphan.entries.some((e) => e.key === "extra-typing_test" && e.headline === "60 WPM" && e.verdict === "Passed"));

/* ── 7. Integrity shapes ───────────────────────────────────────────────── */

check("typing's tabSwitches is not double-counted beside its list", integrityOf({ tabSwitches: 1, violations: [{ type: "tab_switch", timestamp: "t" }] }).total === 1);
check("quiz antiCheatViolations are read as events", integrityOf({ antiCheatViolations: [{ type: "paste_attempt" }], totalViolations: 1 }).copyPaste === 1);
check("an empty record has no flags", integrityOf({}).total === 0 && integrityOf(null).total === 0);

/* ── 8. The Applicants page's tabs ─────────────────────────────────────── */

check("someone filling in the form is on the started tab", applicantBucket({ stage: "Application", analyzed: false, fillingInForm: true }) === "started");
check("a scored person is sealed", applicantBucket({ stage: "Shortlist", analyzed: true }) === "sealed");
check("a passed person stays passed even mid-form", applicantBucket({ stage: "Rejected", analyzed: false, fillingInForm: true }) === "passed");
check("a lone applicant who pressed Apply opens their own tab", defaultApplicantBucket({ sealed: 0, reading: 0, started: 1, passed: 0 }) === "started");
check("anyone sealed opens Sealed", defaultApplicantBucket({ sealed: 2, reading: 1, started: 1, passed: 0 }) === "sealed");
check("nobody at all opens Sealed", defaultApplicantBucket({ sealed: 0, reading: 0, started: 0, passed: 0 }) === "sealed");

// The tab the page shows, with someone on screen. A reviewer found the page
// followed the owner's own Pass onto "Didn't make it"; triage stays put.
const counts = (sealed, reading, started, passed) => ({ sealed, reading, started, passed });
check(
  "the form is sent: the page follows them from Applying to Still reading",
  applicantTab({ counts: counts(1, 1, 0, 0), chosen: "started", onScreen: "reading" }) === "reading",
);
check(
  "Ava seals them: the page follows them to Sealed",
  applicantTab({ counts: counts(2, 0, 0, 0), chosen: null, onScreen: "sealed" }) === "sealed",
);
check(
  "a Pass is not followed: the owner stays on Sealed",
  applicantTab({ counts: counts(1, 0, 0, 1), chosen: "sealed", onScreen: "passed" }) === "sealed",
);
check(
  "a teammate's Pass on a data-picked tab is not followed either",
  applicantTab({ counts: counts(1, 2, 0, 1), chosen: null, onScreen: "passed" }) === "sealed",
);
check(
  "on Didn't make it, someone there stays on screen",
  applicantTab({ counts: counts(1, 0, 0, 2), chosen: "passed", onScreen: "passed" }) === "passed",
);
check(
  "with nobody on screen the owner's tab wins, then the data",
  applicantTab({ counts: counts(3, 0, 1, 0), chosen: "started", onScreen: null }) === "started" &&
    applicantTab({ counts: counts(0, 0, 1, 0), chosen: null, onScreen: null }) === "started",
);
check("?tab=applying opens the Applying tab", applicantTabParam("applying") === "started" && applicantTabParam("passed") === "passed");
check("an unknown ?tab= is ignored", applicantTabParam("everyone") === null && applicantTabParam(null) === null);

/* ── 8b. A quiz whose options were edited after it was taken ───────────── */
// The stored index points at the options as they were. Reordered since, the
// option now at that index is somebody else's answer; the stored text wins.
const reordered = QUIZ_QUESTIONS.map((q, i) =>
  i === 0 ? { ...q, options: ["Ask for the sender name and amount", "Wait it out", "Ask for a bank login", "Ignore it"] } : q,
);
const editedQ = buildAssessmentRecord(finishedApp({ jobs: { ...JOB, quiz_questions: reordered } })).entries.find((e) => e.key === "quiz");
check(
  "reordered options: their pick follows the text, not the old index",
  JSON.stringify(editedQ.detail.items[0].picked) === "[0]",
  JSON.stringify(editedQ.detail.items[0].picked),
);
const reworded = QUIZ_QUESTIONS.map((q, i) =>
  i === 0 ? { ...q, options: ["Wait it out", "Ask who sent it", "Ask for a bank login", "Ignore it"] } : q,
);
const rewordedQ = buildAssessmentRecord(finishedApp({ jobs: { ...JOB, quiz_questions: reworded } })).entries.find((e) => e.key === "quiz");
check(
  "a reworded option: no option is marked theirs, the stored text is kept",
  rewordedQ.detail.items[0].picked.length === 0 && rewordedQ.detail.items[0].pickedText[0] === "Ask for the sender name and amount",
);
check("an untouched question still uses the index", JSON.stringify(rewordedQ.detail.items[2].picked) === "[1]");
const noText = buildAssessmentRecord(
  finishedApp({ notes: JSON.stringify(finishedNotes({ quiz: { ...finishedNotes().quiz, answers: quizAnswers.map(({ selectedAnswerText, ...a }) => a) } })) }),
).entries.find((e) => e.key === "quiz");
check("an old record with only the index still shows the pick", JSON.stringify(noText.detail.items[0].picked) === "[1]");

/* ── 9. Where it is mounted (source checks) ────────────────────────────── */
// The panel's old tiles were two viewport-specific copies split at 1160px;
// replacing only one left the other width on the old tiles. And the full
// profile once fell back to applications[0], putting someone else's record
// behind this person's name.
const { readFile } = await import("node:fs/promises");
const src = (rel) => readFile(new URL(`../${rel}`, import.meta.url), "utf8");
const applicantsPage = await src("src/cockpit/pages/Applicants.tsx");
const lists = applicantsPage.match(/<AssessmentRecordList[\s\S]*?\/>/g) ?? [];
check("the Applicants panel mounts the record list at both widths", lists.length === 2 && lists.some((m) => /min-\[1160px\]:block/.test(m)) && lists.some((m) => /min-\[1160px\]:hidden/.test(m)), `${lists.length} mounts`);
check("the old EvidenceTiles are gone", !/EvidenceTiles/.test(applicantsPage));
check("the Applicants panel opens the record sheet", /<AssessmentRecordSheet/.test(applicantsPage));
const detailPage = await src("src/cockpit/pages/CandidateDetail.tsx");
check("the full profile lists what they submitted", /<AssessmentRecordList/.test(detailPage) && /What they submitted/.test(detailPage));
check("the full profile no longer shows a Quiz/Voice grid", !/label: "Voice", v: c\.voice/.test(detailPage));
check("the full profile looks again before saying it cannot find someone", /stillLooking/.test(detailPage) && /refetch\(\)/.test(detailPage));
// Selection on the Applicants page: paging shows that page's first person (an
// auto-held selection used to pin the panel to page 1), a Pass fixes the tab,
// and the tab choice belongs to the job it was made on.
check("the page buttons turn to that page's first person", (applicantsPage.match(/goToPage\(pageClamped [-+] 1\)/g) ?? []).length === 2 && !/setPage\(\(p\) =>/.test(applicantsPage));
check("a Pass keeps the owner on his tab", /const confirmReject[\s\S]{0,600}setBucketChoice\(\{ roleId: roleIdFilter, bucket \}\)/.test(applicantsPage));
check("the tab choice is kept per job", /bucketChoice\.roleId === roleIdFilter/.test(applicantsPage) && /applicantTab\(\{/.test(applicantsPage));
check("someone on the form is named while another tab is open", /bucket !== "started" && applyingNow\.length > 0/.test(applicantsPage));
const dashboardPage = await src("src/cockpit/pages/Dashboard.tsx");
check(
  "the Dashboard names someone applying even when others are sealed",
  /applying > 0 && \(sealed\.length > 0 \|\| stillReading > 0\)/.test(dashboardPage) && /\/applicants\?tab=applying/.test(dashboardPage),
);
const hooks = await src("src/cockpit/hooks/useCockpitData.ts");
check("useCockpitCandidate never falls back to someone else's row", !/applications\[0\]/.test(hooks));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
