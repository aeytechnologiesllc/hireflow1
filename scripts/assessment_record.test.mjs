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
  integrityOf,
  weighedPhrase,
  QUIZ_QUESTIONS_KEY_STEP,
  sessionLiveStatus,
  sessionForStep,
  durationText,
  agoText,
  integrityFromSummary,
  integritySummary,
  integrityTimeline,
  timelineText,
  timelineTags,
  transcriptFromEvents,
  typingWords,
  quizTimings,
  withSessionEvents,
  parseIntegrityCard,
  LEFT_AFTER_MS,
  retakeMarker,
  withReopens,
  integrityCardCounts,
  integrityCardToast,
  createIntegrityToastGate,
  ordinal,
  chatTypingOf,
  chatTypingLine,
  chatTypingBelowBar,
  chatTypingNeedsALook,
  CHAT_TYPING_MIN_TIMED_REPLIES,
  CHAT_TYPING_DEFAULT_BAR,
} = await import("../src/cockpit/lib/assessmentRecord.ts");
// The server's reader of the same block, for the mirror check (docs/TYPING-IN-CHAT.md).
const { readChatTyping, chatTypingText, CHAT_TYPING_MIN_TIMED_REPLIES: SERVER_MIN_TIMED, CHAT_TYPING_DEFAULT_MIN_WPM, CHAT_TYPING_DEFAULT_MAX_MEDIAN_REPLY_SECONDS } =
  await import("../supabase/functions/_shared/autopilot.ts");

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

/** The live job's bars for the connection check (docs/EQUIPMENT-CHECK.md §2). */
const CONNECTION_BARS = { min_download_mbps: 10, min_upload_mbps: 3, max_latency_ms: 200 };
const ZULU_STEPS = [
  // First of the workflow steps on the live job (docs/EQUIPMENT-CHECK.md §2).
  { id: "step_connection", type: "equipment_check", title: "Your computer and connection", config: CONNECTION_BARS },
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

/** The contract's own example result (docs/EQUIPMENT-CHECK.md §5), on the
 *  fixture's clock. Every figure in it was timed by the server. */
const ROBIN_CONNECTION = {
  downloadMbps: 28.4,
  uploadMbps: 9.1,
  latencyMs: 42,
  jitterMs: 6,
  measuredBy: "server",
  runs: 2,
  usingThisComputer: "yes",
  deviceKind: "computer",
  device: {
    os: "Windows", osVersion: "11", browser: "Chrome", browserVersion: "131", screen: "1920×1080", dpr: 1, cores: 8, memoryGb: 8,
    touch: false, language: "en-PH", timezone: "Asia/Manila", connectionType: "wifi", model: null,
  },
  bars: { minDownloadMbps: 10, minUploadMbps: 3, maxLatencyMs: 200 },
  meetsBars: true,
  below: [],
  measuredAt: "2026-10-05T15:45:56.000Z",
  attempt: 1,
  _trusted: true,
};

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
    // The connection check, as connection-test records it (docs/EQUIPMENT-CHECK.md §5).
    equipmentCheckResult: ROBIN_CONNECTION,
    step_connection: { type: "equipment_check", ...ROBIN_CONNECTION, completedAt: "2026-10-05T15:45:58.000Z" },
    typingTestResult: { wpm: 38, accuracy: 85, score: 72, passed: false, requiredWpm: 45, tabSwitches: 0, violations: [] },
    step_typing: { type: "typing_test", wpm: 38, accuracy: 85, score: 72, passed: false, requiredWpm: 45, tabSwitches: 0, violations: [], completedAt: "2026-10-05T15:47:40.116Z" },
    _trusted: {
      step_connection: { stepType: "equipment_check", completedAt: "2026-10-05T15:45:58.031Z" },
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
  rec.entries.map((e) => e.key).join(",") === "application,quiz,step_connection,step_typing,step_chat,step_interview,integrity",
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
check("her weighed line counts a full record instead of listing it", weighedPhrase(rec.entries) === "all 6 steps", weighedPhrase(rec.entries));

/* ── 1b. The computer and connection check (docs/EQUIPMENT-CHECK.md §6) ── */
// Every figure was timed by the server; the job's bars decide the verdict;
// the flags are plain words, each its own line; nothing here declines anyone.

const conn = byKey.step_connection;
check("the connection row reads '↓ 28 · ↑ 9 Mbps'", conn.headline === "↓ 28 · ↑ 9 Mbps", conn.headline);
check("…and 'Meets the bar', jade", conn.verdict === "Meets the bar" && conn.tone === "jade", `${conn.verdict} ${conn.tone}`);
check("…with no flags on a clean run (no second line)", conn.subline === null && conn.detail.flags.length === 0, JSON.stringify([conn.subline, conn.detail.flags]));
check("…its rail receipt is the figures alone when the bar is met", conn.receipt === "↓ 28 · ↑ 9 Mbps", conn.receipt);
check("…its finished time comes from the trusted record", conn.completedAt === "2026-10-05T15:45:58.031Z", conn.completedAt);
check("…and it opens on its own detail", conn.openable && conn.detail.kind === "equipment_check" && conn.detail.live === false);
check("the figures are the server's, with the jitter", conn.detail.download === 28.4 && conn.detail.upload === 9.1 && conn.detail.latencyMs === 42 && conn.detail.jitterMs === 6 && conn.detail.measuredBy === "server");
check("the bars are the result's own snapshot", JSON.stringify(conn.detail.bars) === JSON.stringify({ minDownload: 10, minUpload: 3, maxLatency: 200 }), JSON.stringify(conn.detail.bars));
check("nothing is below the bar", conn.detail.below.length === 0 && conn.detail.meetsBars === true);
const deviceRow = (label) => conn.detail.device.find((r) => r.label === label)?.value;
check(
  "the device is a table: OS, browser, screen, cores, memory, touch, language, time zone, connection type",
  conn.detail.device.map((r) => r.label).join("|") === "Operating system|Browser|Screen|Processor cores|Memory|Touch screen|Language|Time zone|Connection type",
  conn.detail.device.map((r) => r.label).join("|"),
);
check("…with the facts in plain words", deviceRow("Operating system") === "Windows 11" && deviceRow("Browser") === "Chrome 131" && deviceRow("Screen") === "1920×1080" && deviceRow("Memory") === "8 GB" && deviceRow("Touch screen") === "No" && deviceRow("Connection type") === "wifi", JSON.stringify(conn.detail.device));
check("the answer to the computer question is kept", conn.detail.usingThisComputer === "yes" && conn.detail.deviceKind === "computer" && conn.detail.runs === 2);
check("the IP is not in notes: it waits for the attempt's grading", conn.detail.ip === null && conn.detail.userAgent === null);
check("the connection check raises no integrity flags (rule 5)", conn.integrity.total === 0);

// Below one bar, not their computer, three runs (the amber row).
const JORDAN_CONNECTION = {
  ...ROBIN_CONNECTION,
  downloadMbps: 18.6, uploadMbps: 1.2, latencyMs: 74, jitterMs: 21, runs: 3, usingThisComputer: "ran_here_anyway",
  device: { ...ROBIN_CONNECTION.device, os: "Windows", osVersion: "10", browser: "Edge", browserVersion: "130", screen: "1366×768", cores: 4, memoryGb: 4, connectionType: "cellular" },
  meetsBars: false, below: ["upload"],
};
const connNotes = (result) => JSON.stringify(finishedNotes({ equipmentCheckResult: result, step_connection: { type: "equipment_check", ...result, completedAt: "2026-10-05T15:45:58.000Z" } }));
const jordan = buildAssessmentRecord(finishedApp({ notes: connNotes(JORDAN_CONNECTION) })).entries.find((e) => e.key === "step_connection");
check("a result under one bar: '↓ 18 · ↑ 1.2 Mbps', amber (whole Mbps rounded down; the missed figure with its decimal)", jordan.headline === "↓ 18 · ↑ 1.2 Mbps" && jordan.tone === "amber", `${jordan.headline} ${jordan.tone}`);
check("…says which bar, with the figure: 'Below the bar: upload 1.2 Mbps'", jordan.verdict === "Below the bar: upload 1.2 Mbps", jordan.verdict);
check(
  "…flags in plain words, each its own line",
  JSON.stringify(jordan.detail.flags) === JSON.stringify(["Not the computer they'll work from (ran here anyway)", "Sent after 3 runs"]),
  JSON.stringify(jordan.detail.flags),
);
check("…never joined into one truncated line: the row draws each flag on its own line from detail.flags", jordan.subline === null && jordan.verdict === "Below the bar: upload 1.2 Mbps", JSON.stringify([jordan.subline, jordan.verdict]));
check("…and the gem says which bar, against what the job asks for", jordan.receipt === "↓ 18 · ↑ 1.2 Mbps · upload under 3", jordan.receipt);

// A figure just under its bar never reads AT the bar, and under 1 Mbps never reads 0.
const underBar = (over) => buildAssessmentRecord(finishedApp({ notes: connNotes({ ...ROBIN_CONNECTION, ...over, meetsBars: false }) })).entries.find((e) => e.key === "step_connection");
const up26 = underBar({ uploadMbps: 2.6, below: ["upload"] });
check("upload 2.6 against a 3 bar: '↑ 2.6', never '↑ 3'", up26.headline === "↓ 28 · ↑ 2.6 Mbps" && up26.receipt === "↓ 28 · ↑ 2.6 Mbps · upload under 3", `${up26.headline} | ${up26.receipt}`);
const down96 = underBar({ downloadMbps: 9.6, below: ["download"] });
check("download 9.6 against a 10 bar: '↓ 9.6', never '↓ 10'", down96.headline === "↓ 9.6 · ↑ 9 Mbps" && down96.verdict === "Below the bar: download 9.6 Mbps", `${down96.headline} | ${down96.verdict}`);
const up04 = underBar({ uploadMbps: 0.4, below: ["upload"] });
check("upload 0.4: '↑ 0.4', never '↑ 0'", up04.headline === "↓ 28 · ↑ 0.4 Mbps", up04.headline);
const bigUnder = underBar({ downloadMbps: 24.9, below: ["download"], bars: { minDownloadMbps: 25, minUploadMbps: 3, maxLatencyMs: 200 } });
check("24.9 against a 25 bar: '↓ 24.9' in the number and the verdict, never '25'", bigUnder.headline === "↓ 24.9 · ↑ 9 Mbps" && bigUnder.verdict === "Below the bar: download 24.9 Mbps", `${bigUnder.headline} | ${bigUnder.verdict}`);

// "Timed by our server" only with the server's own marker: a value with
// measuredBy "server" in it and no _trusted marker is not the server's word.
const unmarked = buildAssessmentRecord(finishedApp({ notes: JSON.stringify(finishedNotes({ equipmentCheckResult: ROBIN_CONNECTION, step_connection: undefined, _trusted: undefined })) })).entries.find((e) => e.key === "step_connection");
check("a result with no server marker is never said to be timed by our server", unmarked.detail.measuredBy === null, JSON.stringify(unmarked.detail.measuredBy));

// Where the test ran against where it was sent from: flags, each its own line.
const relayed = buildAssessmentRecord(finishedApp({ notes: connNotes({ ...ROBIN_CONNECTION, source: { oneAddress: true, sameAddress: false, sameBrowser: false } }) })).entries.find((e) => e.key === "step_connection");
check(
  "a test run from one network and sent from another is flagged, in the server's own words",
  JSON.stringify(relayed.detail.flags) === JSON.stringify(["Sent from a different network than the test ran on", "Sent from a different browser than the test ran in"]),
  JSON.stringify(relayed.detail.flags),
);

// Two bars missed: both named, in the fixed order.
const twoBars = buildAssessmentRecord(finishedApp({ notes: connNotes({ ...ROBIN_CONNECTION, downloadMbps: 4.2, uploadMbps: 9.1, latencyMs: 310, meetsBars: false, below: ["download", "latency"] }) })).entries.find((e) => e.key === "step_connection");
check("two bars missed are both named", twoBars.verdict === "Below the bar: download 4.2 Mbps, latency 310 ms", twoBars.verdict);

// The job's bars decide, not the stored verdict: a result that says it meets
// the bar but does not (the job raised its bar after) reads as under it.
const raised = buildAssessmentRecord(finishedApp({ notes: connNotes({ ...ROBIN_CONNECTION, uploadMbps: 2.5, bars: undefined }), jobs: { ...JOB, workflow_steps: [{ ...ZULU_STEPS[0], config: { min_download_mbps: 10, min_upload_mbps: 3, max_latency_ms: 200 } }, ...ZULU_STEPS.slice(1)] } })).entries.find((e) => e.key === "step_connection");
check("without a snapshot the step's config is the bar, and the figures decide over the stored meetsBars", raised.verdict === "Below the bar: upload 2.5 Mbps" && raised.tone === "amber", raised.verdict);
const noBars = buildAssessmentRecord(finishedApp({ notes: connNotes({ ...ROBIN_CONNECTION, bars: undefined, meetsBars: undefined, below: undefined }), jobs: { ...JOB, workflow_steps: [{ id: "step_connection", type: "equipment_check", title: "Your computer and connection" }, ...ZULU_STEPS.slice(1)] } })).entries.find((e) => e.key === "step_connection");
check("with no bar anywhere nothing is judged: the number, no verdict, ink", noBars.headline === "↓ 28 · ↑ 9 Mbps" && noBars.verdict === null && noBars.tone === "ink" && noBars.detail.meetsBars === null, `${noBars.verdict} ${noBars.tone}`);

// A phone run that still met the bar: jade number, a flag the team sees.
const phone = buildAssessmentRecord(finishedApp({ notes: connNotes({ ...ROBIN_CONNECTION, deviceKind: "phone", usingThisComputer: "ran_here_anyway", device: { ...ROBIN_CONNECTION.device, os: "Android", osVersion: "14", touch: true, model: "Pixel 8", memoryGb: null, connectionType: null } }) })).entries.find((e) => e.key === "step_connection");
check("a phone run keeps its verdict and says so in the flags", phone.verdict === "Meets the bar" && JSON.stringify(phone.detail.flags) === JSON.stringify(["Not the computer they'll work from (ran here anyway)", "Ran on a phone"]), JSON.stringify(phone.detail.flags));
check("…the device table says what the browser did not report, and the model when it did", phone.detail.device.find((r) => r.label === "Memory").value === "Not reported" && phone.detail.device.find((r) => r.label === "Model").value === "Pixel 8" && phone.detail.device.find((r) => r.label === "Touch screen").value === "Yes");
const switched = buildAssessmentRecord(finishedApp({ notes: connNotes({ ...ROBIN_CONNECTION, usingThisComputer: "no_switched" }) })).entries.find((e) => e.key === "step_connection");
check(
  "a switch to the right computer is said, never as a fault: no flag at all, the answer itself says it",
  switched.tone === "jade" && switched.detail.flags.length === 0 && switched.detail.usingThisComputer === "no_switched",
  JSON.stringify(switched.detail.flags),
);

// Done is decided by the flat result (stepHasResult), never by the legacy entry alone.
const legacyOnly = buildAssessmentRecord(finishedApp({ notes: JSON.stringify(finishedNotes({ equipmentCheckResult: undefined })) })).entries.find((e) => e.key === "step_connection");
check("a per-step entry without equipmentCheckResult is not a result: 'No result on file'", legacyOnly.status !== "done" && legacyOnly.statusLabel === "No result on file", `${legacyOnly.status} ${legacyOnly.statusLabel}`);
const connOrphan = buildAssessmentRecord({ status: "reviewing", notes: connNotes(ROBIN_CONNECTION), jobs: { workflow_steps: [], quiz_questions: [] } });
check("a result for a job that dropped the step is still shown", connOrphan.entries.some((e) => e.key === "extra-equipment_check" && e.headline === "↓ 28 · ↑ 9 Mbps" && e.title === "Your computer and connection"), connOrphan.entries.map((e) => `${e.key}:${e.title}`).join(","));

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
// The list's own rule (src/cockpit/lib/applicantList.ts, docs/APPLICANTS-LIST.md
// §1), replacing the four old buckets (Sealed / Still reading / Applying /
// Didn't make it) and their helpers, which are deleted with the right-hand
// panel. Nothing is "followed" any more: there is no selected person on the
// list, a row opens the profile. The full partition is in
// scripts/applicant_list.test.mjs; these pin the cases the old checks covered.
const AL = await import("../src/cockpit/lib/applicantList.ts");
check(
  "someone filling in the form is on Taking tests now while live, Part-way once quiet",
  AL.tabFor({ status: "in_progress", finished: false, liveState: "doing" }) === "taking-tests" &&
    AL.tabFor({ status: "in_progress", finished: false, liveState: null }) === "part-way" &&
    AL.tabFor({ status: "in_progress", finished: false, liveState: "left" }) === "part-way",
);
check("a declined person stays Declined even mid-form", AL.tabFor({ status: "rejected", finished: false, liveState: "doing" }) === "declined");
check("finished every test and undecided waits on the team: Needs review", AL.tabFor({ status: "reviewing", finished: true, liveState: null }) === "needs-review");
check(
  "interview, offer and hired share the Interview tab, live or not",
  ["interview", "offered", "hired"].every((status) => AL.tabFor({ status, finished: true, liveState: "doing" }) === "interview"),
);
check("?tab=applying (an old link) opens Part-way, ?tab=passed Declined", AL.tabFromParam("applying") === "part-way" && AL.tabFromParam("passed") === "declined");
check("an unknown or missing ?tab= opens All", AL.tabFromParam("everyone") === "all" && AL.tabFromParam(null) === "all" && AL.tabFromParam("sealed") === "all");
check("…and the page parses ?tab= with that rule", AL.parseListState("?tab=applying").tab === "part-way" && AL.parseListState("?tab=part-way").tab === "part-way");

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

/* ── 10. Live labels: the lazy "left" rule (contract §5.3) ─────────────── */
// Wave 2 (2026-10-06). The owner: "live progress ('answering question 3 ·
// active 1 min ago', 'Left at question 3 · last active 25 min ago')". The
// rule is lazy — no sweep — so the label must turn into "Left" by itself
// once an active attempt has been quiet for ten minutes.

const NOW = Date.parse("2026-10-06T16:00:00Z");
const ago = (ms) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const sess = (over = {}) => ({
  id: "s-1",
  application_id: "app-1",
  step_id: "quiz",
  step_type: "quiz",
  attempt: 1,
  status: "active",
  started_at: ago(5 * MIN),
  last_activity_at: ago(MIN),
  hidden_at: null,
  ended_at: null,
  progress: { answered: 2, total: 10, current_question_id: "zq3", current_index: 2 },
  integrity_summary: {},
  ...over,
});

let live = sessionLiveStatus(sess(), NOW);
check("active quiz: 'Answering question 3 of 10 · active 1 min ago'", live?.text === "Answering question 3 of 10 · active 1 min ago" && live.state === "doing", live?.text);
check("active quiz: the rail receipt is the question", live?.receipt === "Question 3 of 10", live?.receipt);
live = sessionLiveStatus(sess({ last_activity_at: ago(25 * MIN) }), NOW);
check("quiet 25 min: 'Left at question 3 · last active 25 min ago'", live?.text === "Left at question 3 · last active 25 min ago" && live.state === "left", live?.text);
check("just under ten minutes quiet is still 'active'", sessionLiveStatus(sess({ last_activity_at: ago(LEFT_AFTER_MS - 1000) }), NOW)?.state === "doing");
check("ten minutes quiet reads as left", sessionLiveStatus(sess({ last_activity_at: ago(LEFT_AFTER_MS) }), NOW)?.state === "left");
check("an abandoned attempt (the sweep) reads as left", sessionLiveStatus(sess({ status: "abandoned", last_activity_at: ago(40 * MIN) }), NOW)?.text === "Left at question 3 · last active 40 min ago");
live = sessionLiveStatus(sess({ hidden_at: ago(3 * MIN), last_activity_at: ago(3 * MIN) }), NOW);
check("page hidden, under ten minutes: 'Away from the test for 3 min'", live?.text === "Away from the test for 3 min" && live.state === "away", live?.text);
check("left beats away once it is ten minutes", sessionLiveStatus(sess({ hidden_at: ago(12 * MIN), last_activity_at: ago(12 * MIN) }), NOW)?.state === "left");
live = sessionLiveStatus(sess({ step_id: "application", step_type: "application", progress: { answered: 6, total: 11 }, last_activity_at: ago(30_000) }), NOW);
check("the form: 'Filling in the form · 6 of 11 answered · active just now'", live?.text === "Filling in the form · 6 of 11 answered · active just now", live?.text);
check("the form left: 'Left the form at 6 of 11'", sessionLiveStatus(sess({ step_id: "application", step_type: "application", progress: { answered: 6, total: 11 }, last_activity_at: ago(15 * MIN) }), NOW)?.text === "Left the form at 6 of 11 · last active 15 min ago");
live = sessionLiveStatus(sess({ step_id: "step_interview", step_type: "chat_interview", progress: { candidate_turns: 4, assistant_turns: 5 } }), NOW, "Written interview");
check("a chat: 'In the conversation · 4 replies · active 1 min ago'", live?.text === "In the conversation · 4 replies · active 1 min ago", live?.text);
check("a chat, said about the person, names the test", live?.summary === "Written interview: in the conversation · 4 replies · active 1 min ago", live?.summary);
check("a quiz line about the person needs no test name", sessionLiveStatus(sess(), NOW, "Skills check")?.summary === "Answering question 3 of 10 · active 1 min ago");
check("one reply is singular", sessionLiveStatus(sess({ step_type: "chat_simulation", progress: { candidate_turns: 1 }, last_activity_at: ago(11 * MIN) }), NOW)?.text === "Left after 1 reply · last active 11 min ago");
check("typing left: 'Left during the typing test'", sessionLiveStatus(sess({ step_type: "typing_test", progress: {}, last_activity_at: ago(12 * MIN) }), NOW)?.text === "Left during the typing test · last active 12 min ago");
check("grading: 'Checking the answers'", sessionLiveStatus(sess({ status: "grading" }), NOW)?.text === "Checking the answers");
check("failed: 'Checking failed. Retrying'", sessionLiveStatus(sess({ status: "failed" }), NOW)?.text === "Checking failed. Retrying");
check("completed: 'Finished 5 min ago'", sessionLiveStatus(sess({ status: "completed", ended_at: ago(5 * MIN) }), NOW)?.text === "Finished 5 min ago");
check("superseded: no label (a newer attempt exists)", sessionLiveStatus(sess({ status: "superseded" }), NOW) === null);
check("hours and days read as hours and days", agoText(3 * 60 * MIN) === "3 h ago" && agoText(49 * 60 * MIN) === "2 days ago" && agoText(59_000) === "just now");

check(
  "durations read like the bell card (assessment_duration_text)",
  durationText(999) === "under 1s" && durationText(45_000) === "45s" && durationText(72_000) === "1m 12s" && durationText(60_000) === "1m" && durationText(3_900_000) === "1h 5m" && durationText(3_600_000) === "1h",
  [999, 45_000, 72_000, 60_000, 3_900_000, 3_600_000].map(durationText).join(" | "),
);

const attempts = [
  sess({ id: "a1", attempt: 1, status: "completed" }),
  sess({ id: "a2", attempt: 2, status: "active" }),
  sess({ id: "x", step_id: "step_typing", step_type: "typing_test" }),
];
check("the live attempt is the one shown", sessionForStep(attempts, "quiz")?.id === "a2");
check("a replaced attempt is never shown", sessionForStep([sess({ id: "a1", attempt: 1, status: "completed" }), sess({ id: "a2", attempt: 2, status: "superseded" })], "quiz")?.id === "a1");
check("no attempt for the step: null", sessionForStep(attempts, "step_chat") === null && sessionForStep(null, "quiz") === null);

/* ── 11. The server's integrity tally, in the owner's card words ──────── */

const contractSummary = { counts: { tab_hidden: 2, window_blur: 1, paste: 1, right_click: 1 }, total: 5, away_ms: 75000, short_away: 0, dropped: 0 };
const tally = integrityFromSummary(contractSummary);
check("flags count every switch away and the paste, never the right-click", tally.total === 4 && tally.tabSwitches === 3 && tally.copyPaste === 1 && tally.recordedOnly === 1, JSON.stringify(tally));
check("the card's words: 'left the window 3 times (1m 15s away)', 'paste attempt ×1'", tally.parts[0] === "left the window 3 times (1m 15s away)" && tally.parts[1] === "paste attempt ×1", JSON.stringify(tally.parts));
check("the row line reads like the card", integritySummary(tally) === "Left the window 3 times (1m 15s away) · paste attempt ×1", integritySummary(tally));
const blip = integrityFromSummary({ counts: { tab_hidden: 1, window_blur: 1 }, away_ms: 67400, short_away: 1 });
check("a sub-second blip is not a flag", blip.total === 1 && blip.tabSwitches === 1 && blip.shortAway === 1);
check("screenshots, devtools and a closed page are flags", integrityFromSummary({ counts: { screenshot_key: 1, screenshot_suspected: 2, devtools: 1, page_closed: 1, bulk_insert: 1 } }).total === 6);
check("nothing recorded: no tally", integrityFromSummary({}) === null && integrityFromSummary(null) === null);

/* ── 12. The builder with the server's attempts ────────────────────────── */

const APP_QUESTIONS = [
  { id: "q1", type: "text", question: "Full name" },
  { id: "q3", type: "tel", question: "Phone number" },
  { id: "q5", type: "multi_select", question: "Which shifts?", options: ["Daytime", "Evening", "Weekends"] },
  { id: "q9", type: "textarea", question: "Your support experience" },
  { id: "q11", type: "file", question: "Speed test screenshot" },
];
const JOB2 = { ...JOB, application_questions: APP_QUESTIONS };

const quizNow = buildAssessmentRecord(
  { id: "app-2", status: "pending", phase: "quiz", notes: JSON.stringify({ applicationAnswers: [{ question: "Name", answer: "Robin" }] }), jobs: JOB2 },
  { sessions: [sess()], now: NOW },
);
const quizEntry = quizNow.entries.find((e) => e.key === "quiz");
check("a quiz being taken reads live on its row", quizEntry.status === "in_progress" && quizEntry.statusLabel === "Answering question 3 of 10 · active 1 min ago", quizEntry.statusLabel);
check("…and its rail receipt says where", quizEntry.receipt === "Question 3 of 10", quizEntry.receipt);
check("…and it opens on what is there so far", quizEntry.openable && quizEntry.detail.kind === "quiz" && quizEntry.detail.live === true && quizEntry.detail.questions.length === 10);
check("the record knows what they are doing right now", quizNow.live?.text === quizEntry.statusLabel && quizNow.live.stepId === "quiz");
const leftNow = buildAssessmentRecord(
  { id: "app-2", status: "pending", phase: "quiz", notes: JSON.stringify({ applicationAnswers: [{ question: "Name", answer: "Robin" }] }), jobs: JOB2 },
  { sessions: [sess({ last_activity_at: ago(25 * MIN), hidden_at: ago(25 * MIN) })], now: NOW },
);
check("…and turns into 'Left at question 3' on its own", leftNow.entries.find((e) => e.key === "quiz").statusLabel === "Left at question 3 · last active 25 min ago" && leftNow.live.state === "left");

const healed = buildAssessmentRecord(finishedApp(), {
  sessions: [sess({ id: "old", step_id: "step_interview", step_type: "chat_interview", last_activity_at: ago(30 * MIN), progress: { candidate_turns: 4 } })],
  now: NOW,
});
check("a result on file wins over an attempt still marked active", healed.entries.find((e) => e.key === "step_interview").status === "done" && healed.live === null);
const passedOn = buildAssessmentRecord(
  { id: "app-3", status: "rejected", phase: "quiz", notes: JSON.stringify({ applicationAnswers: [{ question: "Name", answer: "Robin" }] }), jobs: JOB2 },
  { sessions: [sess()], now: NOW },
);
check("a decided application shows nobody as taking a test", passedOn.live === null && passedOn.entries.find((e) => e.key === "quiz").status === "not_started");

const formNow = buildAssessmentRecord(
  { id: "app-4", status: "in_progress", phase: "application", notes: null, jobs: JOB2 },
  {
    sessions: [
      sess({
        id: "f1",
        step_id: "application",
        step_type: "application",
        last_activity_at: ago(MIN),
        progress: { answered: 3, total: 5, draft_saved_at: ago(MIN) },
        draft: { q1: "Dana Example", q3: "555 123 0100", q5: ["Evening", "Weekends"], q9: "", _phoneCountryCodes: { q3: "+1" }, _coverLetter: "Hello" },
        // Two trips away from the form (finding a resume, a speed test).
        integrity_summary: { counts: { tab_hidden: 2 }, total: 2, away_ms: 95000, short_away: 0 },
      }),
    ],
    now: NOW,
  },
);
const formEntry = formNow.entries[0];
check("the form row: 'Filling in the form · 3 of 5 answered · active 1 min ago'", formEntry.statusLabel === "Filling in the form · 3 of 5 answered · active 1 min ago", formEntry.statusLabel);
check("the form opens on the saved draft, in the job's question order", formEntry.openable && formEntry.detail.kind === "application" && formEntry.detail.answers.map((a) => a.id).join(",") === "q1,q3,q5,q9,q11");
check("the phone answer carries its country code, as it will be saved", formEntry.detail.answers[1].answer === "+1 555-123-0100", formEntry.detail.answers[1].answer);
{
  // The half-filled form reads the number the way submit will SAVE it
  // (phoneAnswer): the national 0 off, and never the code twice.
  const draftPhone = (q3, code) =>
    buildAssessmentRecord(
      { id: "app-4b", status: "in_progress", phase: "application", notes: null, jobs: JOB2 },
      { sessions: [sess({ id: "f2", step_id: "application", step_type: "application", last_activity_at: ago(MIN), draft: { q3, _phoneCountryCodes: code ? { q3: code } : {} } })], now: NOW },
    ).entries[0].detail.answers[1].answer;
  check("a Manila draft '0917 123 4567' under +63 reads '+63 917 123 4567' (not '+63 0917 …')", draftPhone("0917 123 4567", "+63") === "+63 917 123 4567", draftPhone("0917 123 4567", "+63"));
  check("a code still being typed reads '+6391', never '+1 +6391'", draftPhone("+6391", "+1") === "+6391", draftPhone("+6391", "+1"));
  check("a number with no code picked yet reads as typed", draftPhone("917 123 4567", null) === "917 123 4567", draftPhone("917 123 4567", null));
}
check("a pick-several draft is a list", JSON.stringify(formEntry.detail.answers[2].selected) === '["Evening","Weekends"]');
check("the draft says how far and when it was saved", formEntry.detail.draft.answered === 3 && formEntry.detail.draft.total === 5 && formEntry.detail.coverLetter === "Hello");
check("the form never raises a flag, even with switches away", formEntry.integrity.total === 0);

const graded = buildAssessmentRecord(finishedApp(), {
  sessions: [
    sess({
      id: "c1",
      step_id: "step_chat",
      step_type: "chat_simulation",
      status: "completed",
      ended_at: "2026-10-05T15:51:46Z",
      context: { scenario: "Devin lost $200 tonight and says the game is rigged.", customer_name: "Devin" },
      grading: { result: { score: 18, empathy: 15, problemSolving: 12, communication: 26, professionalism: 31, overallFeedback: "Polite, but suggested more play." } },
      integrity_summary: { counts: { tab_hidden: 2, window_blur: 1, paste: 1 }, away_ms: 72800, short_away: 1 },
    }),
    sess({ id: "t1", step_id: "step_typing", step_type: "typing_test", status: "completed", context: { target_text: "The quick brown fox", required_wpm: 45 } }),
    sess({
      id: "q1",
      step_id: "quiz",
      step_type: "quiz",
      status: "completed",
      grading: { result: { answers: QUIZ_QUESTIONS.map((q, i) => ({ question_id: q.id, correct_answer: q.options[1], seconds_on_question: 10 + i })) } },
    }),
  ],
  now: NOW,
});
const gChat = graded.entries.find((e) => e.key === "step_chat");
check("chat practice adds the grading notes never kept", gChat.detail.scores.map((x) => x.label).join(",") === "Empathy,Problem solving,Communication,Professionalism" && gChat.detail.feedback === "Polite, but suggested more play.");
check("chat practice flags come from the server's tally when it has one", gChat.integrity.fromSession === true && gChat.integrity.total === 3 && gChat.integrity.parts[0] === "left the window 2 times (1m 12s away)", JSON.stringify(gChat.integrity.parts));
check("the typing passage comes from the attempt's pinned context", graded.entries.find((e) => e.key === "step_typing").detail.passage === "The quick brown fox");
const manualGraded = buildAssessmentRecord(
  finishedApp({ notes: JSON.stringify(finishedNotes({ chatInterviewResult: { messageCount: 8, score: 40, recommendation: "Maybe", completed: true } })) }),
  {
    sessions: [
      sess({
        id: "i2",
        step_id: "step_interview",
        step_type: "chat_interview",
        status: "completed",
        grading: { result: { score: 40, credibilityRating: "Low", summary: "Short answers." }, question_count: 5, duration_seconds: 251 },
      }),
    ],
    now: NOW,
  },
).entries.find((e) => e.key === "step_interview");
check(
  "an End-button interview gets what the server kept: credibility, summary, questions, length",
  manualGraded.detail.credibility === "Low" && manualGraded.detail.summary === "Short answers." && manualGraded.detail.questionCount === 5 && manualGraded.detail.duration === "4:11",
  JSON.stringify(manualGraded.detail),
);
const gQuiz = graded.entries.find((e) => e.key === "quiz");
check("the quiz carries seconds per question and this attempt's right answers", gQuiz.detail.items[3].seconds === 13 && gQuiz.detail.items[0].correctTexts?.[0] === QUIZ_QUESTIONS[0].options[1]);
check("the integrity row counts the server's flags", graded.entries.find((e) => e.key === "integrity").detail.groups.some((g) => g.sessionId === "c1"));
const twoTests = buildAssessmentRecord(
  finishedApp({ notes: JSON.stringify(finishedNotes({ chatInterviewResult: { ...finishedNotes().chatInterviewResult, violations: [] } })) }),
  {
    sessions: [
      sess({ id: "c1", step_id: "step_chat", step_type: "chat_simulation", status: "completed", integrity_summary: { counts: { tab_hidden: 2, paste: 1 }, away_ms: 72000 } }),
      sess({ id: "i1", step_id: "step_interview", step_type: "chat_interview", status: "completed", integrity_summary: { counts: { tab_hidden: 1, screenshot_suspected: 1 }, away_ms: 41000 } }),
    ],
    now: NOW,
  },
).entries.find((e) => e.key === "integrity");
check(
  "the integrity row adds the tests up in the card's words",
  twoTests.subline === "Left the window 3 times (1m 53s away) · paste attempt ×1 · possible screenshot ×1" && twoTests.headline === "5 flags",
  `${twoTests.headline} | ${twoTests.subline}`,
);

const sam = buildAssessmentRecord(
  finishedApp({
    notes: JSON.stringify(finishedNotes({ typingTestResult: { wpm: 52, accuracy: 96, score: 96, passed: false, requiredWpm: 45 }, step_typing: undefined })),
  }),
).entries.find((e) => e.key === "step_typing");
check("typing at or over the job's bars meets it, whatever the always-false `passed` says", sam.verdict === "Meets the bar" && sam.tone === "jade", `${sam.verdict} ${sam.tone}`);

/* ── 13. One attempt's events folded in (the record sheet) ─────────────── */

let seq = 0;
const ev = (kind, over = {}) => ({ session_id: "s-1", seq: ++seq, kind, created_at: ago((100 - seq) * 1000), ...over });

seq = 0;
const chatEvents = [
  ev("system", { detail: { what: "started", attempt: 1 } }),
  ev("assistant_turn", { content: "My deposit is missing.", detail: { role: "customer" } }),
  ev("candidate_turn", { content: "Sorry to hear that. Which name did you send it from?", detail: { role: "agent" } }),
  ev("integrity", { duration_ms: 67000, client_at: ago(80_000), detail: { kind: "tab_hidden", duration_ms: 67000 } }),
  ev("integrity", { duration_ms: 400, detail: { kind: "window_blur", duration_ms: 400 } }),
  ev("integrity", { detail: { kind: "paste", target: "reply" } }),
  ev("integrity", { detail: { kind: "right_click" } }),
  ev("assistant_turn", { content: "Robin Example.", detail: { role: "customer" } }),
  ev("integrity", { detail: { kind: "page_closed", after_end: true } }),
  ev("system", { detail: { what: "came_back", away_ms: 1_500_000 } }),
];
const turns = transcriptFromEvents(chatEvents);
check("the transcript is both sides, in the server's order", turns.length === 3 && turns[0].role === "other" && turns[1].role === "candidate" && turns[2].text === "Robin Example.");
const tl = integrityTimeline(chatEvents);
check("the timeline keeps every integrity event and the markers", tl.length === 7, String(tl.length));
check("a switch away says how long: 'Left the window for 1m 7s'", timelineText(tl[1]) === "Left the window for 1m 7s" && tl[1].flag && tl[1].at === ago(80_000));
check("a sub-second blip is on the timeline, marked, never a flag", tl[2].short && !tl[2].flag && timelineText(tl[2]) === "Clicked out of the window for under 1s" && timelineTags(tl[2]).includes("not counted"));
check("a blocked paste is a flag", tl[3].label === "Tried to paste" && tl[3].flag);
check("a right-click is recorded only", !tl[4].flag && timelineTags(tl[4]).includes("recorded only"));
check("a flush from a closing tab is marked 'after sending'", tl[5].afterEnd && timelineTags(tl[5]).includes("after sending"));
check("coming back says how long they were gone", timelineText(tl[6]) === "Came back after 25m", timelineText(tl[6]));

const chatEntry = withSessionEvents(graded.entries.find((e) => e.key === "step_chat"), chatEvents);
check("chat practice gets its transcript from the events", chatEntry.detail.transcript.length === 3 && chatEntry.detail.messageCount === 3);
check("…and its timeline", chatEntry.timeline.length === 7);
check("no events: the entry is unchanged", withSessionEvents(gChat, []) === gChat && withSessionEvents(gChat, null) === gChat);

const robinTyped = "Customer service is about creating positive experiences for every client. Active listning, empathy, and clear comunication are esential skills. A great suport representative can turn a frustrated";
const passage = "Customer service is about creating positive experiences for every client. Active listening, empathy, and clear communication are essential skills. A great support representative can turn a frustrated customer into a loyal advocate.";
const words = typingWords(robinTyped, passage);
check("typed vs the passage: 4 wrong words, the grader's own rule (85% of 27)", words.wrong === 4 && Math.round(((27 - 4) / 27) * 100) === 85, String(words.wrong));
check("a wrong word knows the passage's word", words.typed[11].state === "wrong" && words.typed[11].expected === "listening,");
check("passage words they never reached are marked", words.passage.filter((w) => w.state === "missed").length === 5);
check("words typed past the end of the passage are extra", typingWords("a b c", "a b").typed[2].state === "extra");
check("a word is checked against the word at the SAME place, not anywhere", typingWords("one three two", "one two three").wrong === 2);

seq = 0;
const typingEvents = [
  ev("typing_snapshot", { detail: { typed_text: "Customer service", elapsed_ms: 5000, final: false } }),
  ev("typing_snapshot", { detail: { typed_text: robinTyped, target_text: passage, wpm: 38, accuracy: 85, elapsed_ms: 61600, final: true } }),
  ev("typing_snapshot", { detail: { typed_text: "Customer", elapsed_ms: 2000, final: false, attempt_run: 2 } }),
];
const typingEntry = withSessionEvents(buildAssessmentRecord(finishedApp()).entries.find((e) => e.key === "step_typing"), typingEvents);
check("the final snapshot is what they sent, even with a later one", typingEntry.detail.typed === robinTyped && typingEntry.detail.passage === passage && typingEntry.detail.seconds === 62);
check("…marked word by word", typingEntry.detail.words.wrong === 4);
check("…and a second run is counted", typingEntry.detail.runs === 2);

seq = 0;
const quizEvents = [
  ev("quiz_shown", { detail: { question_id: "zq1", question_index: 0 } }),
  ev("quiz_answer", { duration_ms: 12000, detail: { question_id: "zq1", answer: 1, seconds_on_question: 12, timing_source: "server" } }),
  ev("quiz_shown", { detail: { question_id: "zq2", question_index: 1 } }),
  ev("quiz_answer", { detail: { question_id: "zq2", answer: 0, seconds_on_question: 19, timing_source: "server" } }),
  ev("quiz_answer", { detail: { question_id: "zq2", answer: "False", seconds_on_question: 31, timing_source: "previous_answer", changed: true } }),
  ev("quiz_shown", { detail: { question_id: "zq3", question_index: 2 } }),
];
const timings = quizTimings(quizEvents);
check("seconds per question come from the latest pick", timings.get("zq1").seconds === 12 && timings.get("zq2").seconds === 31);
check("a changed pick is counted, and a non-server time is approximate", timings.get("zq2").changes === 1 && timings.get("zq2").approximate && !timings.get("zq1").approximate);
const doneQuiz = withSessionEvents(buildAssessmentRecord(finishedApp()).entries.find((e) => e.key === "quiz"), quizEvents);
check("a finished quiz gets each question's seconds", doneQuiz.detail.items[0].seconds === 12 && doneQuiz.detail.items[1].changes === 1);
const liveQuiz = withSessionEvents(quizEntry, quizEvents);
check("a quiz in progress lists only the questions seen so far", liveQuiz.detail.items.map((i) => i.id).join(",") === "zq1,zq2,zq3");
check("…with the pick so far, never marked right or wrong", JSON.stringify(liveQuiz.detail.items[1].picked) === "[1]" && liveQuiz.detail.items.every((i) => i.isCorrect === null));
check("…and the one on screen now", liveQuiz.detail.items[2].onScreen && !liveQuiz.detail.items[0].onScreen);

const combined = graded.entries.find((e) => e.key === "integrity");
const combinedShown = withSessionEvents(combined, chatEvents.map((e) => ({ ...e, session_id: "c1" })));
check("the integrity sheet gives each test its own timeline", combinedShown.detail.groups.find((g) => g.sessionId === "c1").timeline.length === 7);

/* ── 13b. The connection check's attempt: live words, grading, events ──── */
// docs/EQUIPMENT-CHECK.md rule 5: the session, heartbeat and live progress
// still run so staff see "running the speed test · active just now"; §5: the
// stamps, the IP and the browser's line are staff-only, in the grading.

const connSess = (over = {}) => sess({ id: "k-1", step_id: "step_connection", step_type: "equipment_check", progress: { screen: "test", run: 1 }, context: { bars: CONNECTION_BARS }, ...over });
live = sessionLiveStatus(connSess(), NOW, "Your computer and connection");
check("the live row: 'Running the speed test · active 1 min ago'", live?.text === "Running the speed test · active 1 min ago" && live.state === "doing", live?.text);
check("…its rail receipt", live?.receipt === "Speed test", live?.receipt);
check("…said about the person, names the step", live?.summary === "Your computer and connection: running the speed test · active 1 min ago", live?.summary);
check("a second run says so", sessionLiveStatus(connSess({ progress: { screen: "test", run: 2 } }), NOW)?.text === "Running the speed test · run 2 · active 1 min ago" && sessionLiveStatus(connSess({ progress: { screen: "test", run: 2 } }), NOW)?.receipt === "Run 2");
check("on the first screen: 'Choosing the computer'", sessionLiveStatus(connSess({ progress: { screen: "which" } }), NOW)?.text === "Choosing the computer · active 1 min ago");
check("on the result screen: 'Looking at the result'", sessionLiveStatus(connSess({ progress: { screen: "result", run: 2 } }), NOW)?.text === "Looking at the result · run 2 · active 1 min ago");
check("a page that wrote no progress is on the test", sessionLiveStatus(connSess({ progress: {} }), NOW)?.text === "Running the speed test · active 1 min ago");
check("left: 'Left during the speed test · last active 25 min ago'", sessionLiveStatus(connSess({ last_activity_at: ago(25 * MIN) }), NOW)?.text === "Left during the speed test · last active 25 min ago");
// The page's hint lives in progress.client (touch_assessment_session puts it
// there, docs/ASSESSMENT-RECORD.md §2.5): the words are read from there.
check(
  "the page's own hint (progress.client) names the screen and the run",
  sessionLiveStatus(connSess({ progress: { client: { screen: "computer", device_kind: "computer" } } }), NOW)?.text === "Choosing the computer · active 1 min ago" &&
    sessionLiveStatus(connSess({ progress: { client: { screen: "test", run: 2, step: 7 } } }), NOW)?.text === "Running the speed test · run 2 · active 1 min ago" &&
    sessionLiveStatus(connSess({ progress: { client: { screen: "result", runs_done: 2 } } }), NOW)?.text === "Looking at the result · run 2 · active 1 min ago",
  sessionLiveStatus(connSess({ progress: { client: { screen: "result", runs_done: 2 } } }), NOW)?.text,
);

const connLive = buildAssessmentRecord(
  { id: "app-5", status: "pending", phase: "step_connection", notes: JSON.stringify({ ...finishedNotes({ equipmentCheckResult: undefined, step_connection: undefined, _trusted: undefined }) }), jobs: JOB },
  { sessions: [connSess()], now: NOW },
);
const connLiveEntry = connLive.entries.find((e) => e.key === "step_connection");
check("a check being taken reads live on its row", connLiveEntry.status === "in_progress" && connLiveEntry.statusLabel === "Running the speed test · active 1 min ago", connLiveEntry.statusLabel);
check("…opens on what is there so far, with the bars pinned at the start", connLiveEntry.openable && connLiveEntry.detail.kind === "equipment_check" && connLiveEntry.detail.live === true && connLiveEntry.detail.bars.minDownload === 10 && connLiveEntry.detail.runs === 1 && connLiveEntry.detail.download === null);
check("…and the record says they are running the speed test", connLive.live?.stepId === "step_connection" && connLive.live.text === connLiveEntry.statusLabel);
const connHinted = buildAssessmentRecord(
  { id: "app-5", status: "pending", phase: "step_connection", notes: JSON.stringify({ ...finishedNotes({ equipmentCheckResult: undefined, step_connection: undefined, _trusted: undefined }) }), jobs: JOB },
  { sessions: [connSess({ progress: { client: { screen: "test", device_kind: "phone", answer: "ran_here_anyway", run: 1 } } })], now: NOW },
).entries.find((e) => e.key === "step_connection");
check(
  "…the page's hint fills the device kind, the answer and their flags before any event loads",
  connHinted.detail.deviceKind === "phone" && connHinted.detail.usingThisComputer === "ran_here_anyway" && connHinted.detail.runs === 1 &&
    JSON.stringify(connHinted.detail.flags) === JSON.stringify(["Not the computer they'll work from (ran here anyway)", "Ran on a phone"]),
  JSON.stringify(connHinted.detail.flags),
);

const connGraded = buildAssessmentRecord(finishedApp(), {
  sessions: [
    connSess({
      status: "completed",
      ended_at: "2026-10-05T15:45:58Z",
      progress: { screen: "result", run: 2 },
      grading: {
        graded_at: "2026-10-05T15:45:58Z",
        stamps: [{ kind: "ping", nonce: "0123456789abcdef", at: 1, bytes: 0, prev_nonce: null, prev_at: 1, candidate: "u1", sig: "x" }],
        ip: "197.251.144.23",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0",
        raw: { downloadMbps: 29.0, uploadMbps: 9.4, latencyMs: 41 },
      },
    }),
  ],
  now: NOW,
}).entries.find((e) => e.key === "step_connection");
check("a finished check adds the IP and the browser's line from the grading (staff-only)", connGraded.detail.ip === "197.251.144.23" && /Chrome\/131/.test(connGraded.detail.userAgent), JSON.stringify([connGraded.detail.ip, connGraded.detail.userAgent]));
check("…and the figures stay the recorded ones, never the page's estimate", connGraded.detail.download === 28.4 && connGraded.detail.upload === 9.1 && connGraded.headline === "↓ 28 · ↑ 9 Mbps");
const connPinned = buildAssessmentRecord(
  finishedApp({ notes: connNotes({ ...ROBIN_CONNECTION, bars: undefined }), jobs: { ...JOB, workflow_steps: [{ id: "step_connection", type: "equipment_check", title: "Your computer and connection" }, ...ZULU_STEPS.slice(1)] } }),
  { sessions: [connSess({ status: "completed", context: { bars: { min_download_mbps: 25, min_upload_mbps: 10, max_latency_ms: 100 } } })], now: NOW },
).entries.find((e) => e.key === "step_connection");
check("a result with no bars of its own gets the ones pinned when the attempt started", connPinned.detail.bars.minDownload === 25 && connPinned.detail.bars.maxLatency === 100, JSON.stringify(connPinned.detail.bars));

seq = 0;
const connEvents = [
  ev("system", { session_id: "k-1", detail: { what: "started", attempt: 1 } }),
  ev("system", { session_id: "k-1", detail: { what: "device_read", device_kind: "computer", os: "Windows 11", browser: "Chrome 131", screen: "1920×1080" } }),
  ev("system", { session_id: "k-1", detail: { what: "computer_answer", answer: "yes" } }),
  ev("system", { session_id: "k-1", detail: { what: "test_started", run: 1 } }),
  ev("system", { session_id: "k-1", detail: { what: "test_finished", run: 1, download_mbps: 24.9, upload_mbps: 8.1, latency_ms: 50 } }),
  ev("system", { session_id: "k-1", detail: { what: "test_run", run: 1, download_mbps: 24.1, upload_mbps: 7.8, latency_ms: 51, jitter_ms: 9 } }),
  ev("system", { session_id: "k-1", detail: { what: "test_started", run: 2 } }),
  ev("system", { session_id: "k-1", detail: { what: "record_refused", reason: "stale", index: 3 } }),
  ev("system", { session_id: "k-1", detail: { what: "test_finished", run: 2, download_mbps: 29.0, upload_mbps: 9.4, latency_ms: 41 } }),
  // Production-shaped: the page's test_finished wrote this run's test_run
  // first (no `sent`), and record's copy on the same key inserted nothing.
  ev("system", { session_id: "k-1", detail: { what: "test_run", run: 2, download_mbps: 28.4, upload_mbps: 9.1, latency_ms: 42, jitter_ms: 6 } }),
  ev("system", { session_id: "k-1", detail: { what: "submitted", run: 2 } }),
];
const connShown = withSessionEvents(connGraded, connEvents);
const story = connShown.detail.timeline.map((t) => timelineText(t) + (t.note ? ` [${t.note}]` : ""));
check(
  "the sheet's timeline tells the check's story from the attempt's events",
  story.join("\n") ===
    [
      "Opened the check",
      "Read the computer [Windows 11 · Chrome 131 · 1920×1080]",
      "Said this is the computer they'll work from",
      "Run 1 started",
      "Run 1 finished [the page's estimate: ↓ 24.9 · ↑ 8.1 Mbps · 50 ms]",
      "Run 1 timed by our server [↓ 24.1 · ↑ 7.8 Mbps · 51 ms ±9]",
      "Run 2 started",
      "A sent run was refused [the run was more than 20 minutes old]",
      "Run 2 finished [the page's estimate: ↓ 29 · ↑ 9.4 Mbps · 41 ms]",
      "Run 2 timed by our server [↓ 28.4 · ↑ 9.1 Mbps · 42 ms ±6 · the run that was sent]",
      "Sent run 2",
    ].join("\n"),
  story.join(" | "),
);
check("…every line is a marker, never a flag", connShown.detail.timeline.every((t) => !t.flag && t.kind.startsWith("system:")));
check("…and the recorded result keeps its own facts over the events", connShown.detail.runs === 2 && connShown.detail.usingThisComputer === "yes" && connShown.detail.device.length === 9);
const connLiveShown = withSessionEvents(connLiveEntry, connEvents.slice(0, 4));
check(
  "a check still being taken reads the device and the answer from its events",
  connLiveShown.detail.live === true && connLiveShown.detail.usingThisComputer === "yes" && connLiveShown.detail.deviceKind === "computer" && connLiveShown.detail.device.map((r) => r.value).join("|") === "Windows 11|Chrome 131|1920×1080",
  JSON.stringify(connLiveShown.detail.device),
);
const phoneLive = withSessionEvents(connLiveEntry, [
  ev("system", { session_id: "k-1", detail: { what: "device_read", device_kind: "phone", os: "Android 14", browser: "Chrome 131", screen: "412×915" } }),
  ev("system", { session_id: "k-1", detail: { what: "computer_answer", answer: "ran_here_anyway" } }),
]);
check("…and a phone running it anyway is flagged before anything is sent", JSON.stringify(phoneLive.detail.flags) === JSON.stringify(["Not the computer they'll work from (ran here anyway)", "Ran on a phone"]) && timelineText(phoneLive.detail.timeline[0]) === "Read the device: looks like a phone", JSON.stringify(phoneLive.detail.flags));
check("no events: the entry is unchanged", withSessionEvents(connGraded, []) === connGraded);

// "No, go to that computer" (§1 rule 2): the attempt is open, waiting on the
// right computer. The answer is kept, never dropped to "Not answered yet".
const saidNoHint = buildAssessmentRecord(
  { id: "app-5", status: "pending", phase: "step_connection", notes: JSON.stringify({ ...finishedNotes({ equipmentCheckResult: undefined, step_connection: undefined, _trusted: undefined }) }), jobs: JOB },
  { sessions: [connSess({ progress: { client: { screen: "computer", device_kind: "computer", answer: "no" } }, last_activity_at: ago(25 * MIN) })], now: NOW },
).entries.find((e) => e.key === "step_connection");
check("a hint answer of 'no' is kept on the live record, with no flag", saidNoHint.detail.usingThisComputer === "no" && saidNoHint.detail.flags.length === 0, JSON.stringify([saidNoHint.detail.usingThisComputer, saidNoHint.detail.flags]));
const freshPageAfterNo = buildAssessmentRecord(
  { id: "app-5", status: "pending", phase: "step_connection", notes: JSON.stringify({ ...finishedNotes({ equipmentCheckResult: undefined, step_connection: undefined, _trusted: undefined }) }), jobs: JOB },
  { sessions: [connSess({ progress: { client: { screen: "computer", device_kind: "computer" } } })], now: NOW },
).entries.find((e) => e.key === "step_connection");
const noEvent = withSessionEvents(freshPageAfterNo, [ev("system", { session_id: "k-1", detail: { what: "computer_answer", answer: "no" } })]);
check("…and a 'no' event fills it in when the hint carries none", noEvent.detail.usingThisComputer === "no", String(noEvent.detail.usingThisComputer));
const noThenYes = withSessionEvents(freshPageAfterNo, [
  ev("system", { session_id: "k-1", detail: { what: "computer_answer", answer: "no" } }),
  ev("system", { session_id: "k-1", detail: { what: "computer_answer", answer: "no_switched" } }),
]);
check("…while a later answer on the right computer reads as that answer", noThenYes.detail.usingThisComputer === "no_switched", String(noThenYes.detail.usingThisComputer));

// The live note follows the screen they are on, the way the row does.
check("the live detail knows the screen: the computer question", saidNoHint.detail.liveScreen === "computer");
check("…the speed test", connLiveEntry.detail.liveScreen === "test");
const resultScreen = buildAssessmentRecord(
  { id: "app-5", status: "pending", phase: "step_connection", notes: JSON.stringify({ ...finishedNotes({ equipmentCheckResult: undefined, step_connection: undefined, _trusted: undefined }) }), jobs: JOB },
  { sessions: [connSess({ progress: { client: { screen: "result", runs_done: 1 } } })], now: NOW },
).entries.find((e) => e.key === "step_connection");
check("…the result", resultScreen.detail.liveScreen === "result");

// A run that did not finish leaves them on its Try again screen.
const failedLive = sessionLiveStatus(connSess({ progress: { client: { screen: "test", run: 1, failed: true } } }), NOW);
check("a failed run: 'The speed test did not finish · run 1', receipt 'Did not finish'", failedLive?.text === "The speed test did not finish · run 1 · active 1 min ago" && failedLive.receipt === "Did not finish", `${failedLive?.text} | ${failedLive?.receipt}`);
const failedEntry = buildAssessmentRecord(
  { id: "app-5", status: "pending", phase: "step_connection", notes: JSON.stringify({ ...finishedNotes({ equipmentCheckResult: undefined, step_connection: undefined, _trusted: undefined }) }), jobs: JOB },
  { sessions: [connSess({ progress: { client: { screen: "test", run: 2, failed: true } } })], now: NOW },
).entries.find((e) => e.key === "step_connection");
check("…and the sheet's live note says so", failedEntry.detail.liveScreen === "failed");

/* ── 14. The owner's integrity card ────────────────────────────────────── */

const cardIn = {
  type: "integrity",
  group_key: "integrity:0ccadfc5-130e-45ea-9a43-745e049242b3:step_chat",
  message: "During Player chat practice: left the window 2 times (1m 12s away), paste attempt x1",
  link: "/applicants/0ccadfc5-130e-45ea-9a43-745e049242b3",
};
const card = parseIntegrityCard(cardIn);
check("the card names the test", card.during === "Player chat practice" && card.stepId === "step_chat");
check("the tally is split into its parts", card.parts.length === 2 && card.parts[0] === "left the window 2 times (1m 12s away)" && card.parts[1] === "paste attempt ×1", JSON.stringify(card.parts));
check("a tap opens that test's timeline", card.link === "/applicants/0ccadfc5-130e-45ea-9a43-745e049242b3?record=step_chat&focus=integrity", card.link);
check("any other notification is not an integrity card", parseIntegrityCard({ type: "application", group_key: null, message: "x" }) === null && parseIntegrityCard({ group_key: "integrity:not-a-uuid:quiz" }) === null);

/* ── 15. Review fixes (2026-10-06) ─────────────────────────────────────── */
// Each check below is a case an independent review proved wrong in the first
// build of this wave.

// A right-click and a blocked Ctrl+P are recorded, never flags: the page's
// own counter, the server and the bell all say so, and so must the record.
const rcOnly = integrityOf({ violations: [
  { type: "right_click", timestamp: "2026-10-06T15:50:00Z", details: "Right-click attempted" },
  { type: "keyboard_shortcut", timestamp: "2026-10-06T15:50:05Z", details: "Blocked P shortcut" },
] });
check("old lists: a right-click and a blocked shortcut are kept but are not flags", rcOnly.total === 0 && rcOnly.recordedOnly === 2 && rcOnly.events.length === 2 && rcOnly.events.every((e) => e.recordedOnly), JSON.stringify(rcOnly));
check("…and the server's own 'other' in a list is recorded only too", integrityOf({ violations: [{ type: "other" }, { type: "tab_switch" }] }).total === 1);
const RC_VIOLATIONS = [
  { type: "right_click", timestamp: "2026-10-05T15:46:00Z", details: "Right-click attempted" },
  { type: "keyboard_shortcut", timestamp: "2026-10-05T15:46:05Z", details: "Blocked P shortcut" },
];
const rcRecord = buildAssessmentRecord(
  finishedApp({
    notes: JSON.stringify(finishedNotes({
      chatSimulationResult: { ...finishedNotes().chatSimulationResult, antiCheatSummary: undefined },
      chatInterviewResult: { ...finishedNotes().chatInterviewResult, violations: [] },
      typingTestResult: { ...finishedNotes().typingTestResult, violations: RC_VIOLATIONS },
      step_typing: { ...finishedNotes().step_typing, violations: RC_VIOLATIONS },
    })),
  }),
  { sessions: [sess({ id: "t9", step_id: "step_typing", step_type: "typing_test", status: "completed", integrity_summary: { counts: { right_click: 1, other: 1 }, total: 2, away_ms: 0, short_away: 0 } })], now: NOW },
);
check("a typing test with only a right-click and a shortcut has no flags", rcRecord.entries.find((e) => e.key === "step_typing").integrity.total === 0);
check("…and the record has no 'Integrity checks' row", !rcRecord.entries.some((e) => e.key === "integrity") && rcRecord.integrityTotal === 0);
const serverZero = buildAssessmentRecord(
  finishedApp(),
  { sessions: [sess({ id: "c0", step_id: "step_chat", step_type: "chat_simulation", status: "completed", integrity_summary: { counts: { right_click: 1 }, total: 1, away_ms: 0, short_away: 0 } })], now: NOW },
).entries.find((e) => e.key === "step_chat");
check("the server's tally wins whenever it has one, even at zero (the bell said nothing)", serverZero.integrity.total === 0 && serverZero.integrity.fromSession === true);

// A step handed back for a retake: the old result is still in notes, the new
// attempt is being taken. Nothing of attempt 2 may be laid over attempt 1.
// A hand-back is the staff marker (assessment_step_reopens), newer than the
// result on file — here attempt 1's end, 170 min ago.
const retakeNotes = JSON.stringify(finishedNotes({ chatInterviewResult: undefined, _trusted: undefined }));
const chatReopen = { application_id: "app-1", step_id: "step_chat", job_id: "job-1", reopened_at: ago(30 * MIN), reopened_by: "owner-1", reopen_count: 1 };
const s1Done = sess({
  id: "r1", step_id: "step_chat", step_type: "chat_simulation", attempt: 1, status: "completed",
  started_at: ago(3 * 60 * MIN), ended_at: ago(170 * MIN), last_activity_at: ago(170 * MIN),
  integrity_summary: { counts: { tab_hidden: 5 }, total: 5, away_ms: 300000, short_away: 0 },
});
const s2Live = sess({
  id: "r2", step_id: "step_chat", step_type: "chat_simulation", attempt: 2, status: "active",
  started_at: ago(4 * MIN), last_activity_at: ago(MIN), progress: { candidate_turns: 1, assistant_turns: 2 },
  context: { scenario: "A new scenario", customer_name: "Mo" },
});
const retaking = buildAssessmentRecord(
  finishedApp({ status: "pending", phase: "step_chat", notes: retakeNotes }),
  { sessions: [s1Done, s2Live], reopens: [chatReopen], now: NOW },
);
const rtChat = retaking.entries.find((e) => e.key === "step_chat");
check("a retake being taken reads live, not 'Done'", rtChat.status === "in_progress" && rtChat.statusLabel === "In the conversation · 1 reply · active 1 min ago", rtChat.statusLabel);
check("…shows the new attempt, never the old score over it", rtChat.session?.id === "r2" && rtChat.detail?.live === true && rtChat.detail.scores.length === 0 && rtChat.detail.scenario === "A new scenario" && rtChat.headline === null);
check("…keeps the earlier attempt's flags in view", rtChat.earlierIntegrity?.length === 1 && rtChat.earlierIntegrity[0].attempt === 1 && rtChat.earlierIntegrity[0].tally.total === 5, JSON.stringify(rtChat.earlierIntegrity));
const rtAll = retaking.entries.find((e) => e.key === "integrity");
check("…and the integrity row counts them, as their own attempt", retaking.integrityTotal === 5 && rtAll?.detail.groups.some((g) => g.sessionId === "r1" && g.title === "Player chat practice · attempt 1"), JSON.stringify(rtAll?.detail.groups));
const twoAttempts = buildAssessmentRecord(
  finishedApp({ status: "pending", phase: "step_chat", notes: retakeNotes }),
  { sessions: [s1Done, { ...s2Live, integrity_summary: { counts: { tab_hidden: 1 }, total: 1, away_ms: 12000, short_away: 0 } }], reopens: [chatReopen], now: NOW },
).entries.find((e) => e.key === "integrity");
check(
  "…both attempts named, in attempt order, added up as one test",
  twoAttempts.detail.groups.map((g) => g.title).join("|") === "Player chat practice · attempt 1|Player chat practice · attempt 2" && twoAttempts.headline === "6 flags" && twoAttempts.verdict === "in 1 test",
  JSON.stringify(twoAttempts.detail.groups.map((g) => g.title)),
);
const reopened = buildAssessmentRecord(
  finishedApp({ status: "pending", phase: "step_chat", notes: retakeNotes }),
  { sessions: [s1Done], reopens: [chatReopen], now: NOW },
).entries.find((e) => e.key === "step_chat");
check("reopened, not started yet: says so, and still opens the earlier result", reopened.status === "in_progress" && reopened.statusLabel === "Reopened for a retake" && reopened.retake === "open" && reopened.openable && reopened.detail.scores.length > 0 && reopened.session?.id === "r1", reopened.statusLabel);
check("…and carries when staff handed it back", reopened.reopen?.at === chatReopen.reopened_at && reopened.reopen?.count === 1, JSON.stringify(reopened.reopen));

/* ── 15b. A hand-back is a staff marker, never status and phase alone ──── */
// The applicant can set their own status to 'pending' (the server's
// protect_application_columns allows it), and an auto-mode step whose move
// was never triggered leaves phase on the step. Neither is a retake.
const selfPending = buildAssessmentRecord(
  finishedApp({ status: "pending", phase: "step_chat", notes: retakeNotes }),
  { sessions: [s1Done], now: NOW },
).entries.find((e) => e.key === "step_chat");
check("status pending + phase on a finished step, no marker: still Done", selfPending.status === "done" && selfPending.statusLabel === "Done" && !selfPending.retake && !selfPending.reopen && selfPending.session?.id === "r1", selfPending.statusLabel);
check("…with its score, not 'Reopened for a retake'", selfPending.headline != null && !/Reopened/.test(selfPending.statusLabel));
const staleMarker = buildAssessmentRecord(
  finishedApp({ status: "pending", phase: "step_chat", notes: retakeNotes }),
  { sessions: [s1Done], reopens: [{ ...chatReopen, reopened_at: ago(4 * 60 * MIN) }], now: NOW },
).entries.find((e) => e.key === "step_chat");
check("a marker older than the result on file reopens nothing", staleMarker.status === "done" && !staleMarker.retake);
const trustedLater = buildAssessmentRecord(
  finishedApp({ status: "pending", phase: "step_chat", notes: JSON.stringify(finishedNotes({ chatInterviewResult: undefined, _trusted: { step_chat: { stepType: "chat_simulation", completedAt: ago(10 * MIN) } } })) }),
  { sessions: [s1Done], reopens: [chatReopen], now: NOW },
).entries.find((e) => e.key === "step_chat");
check("…nor one older than the server's own completedAt (the retake's result landed)", trustedLater.status === "done" && !trustedLater.retake);
const retakeLanded = buildAssessmentRecord(
  finishedApp({ status: "pending", phase: "step_chat", notes: retakeNotes }),
  { sessions: [s1Done, { ...s2Live, status: "completed", ended_at: ago(5 * MIN), last_activity_at: ago(5 * MIN) }], reopens: [chatReopen], now: NOW },
).entries.find((e) => e.key === "step_chat");
check("the retake sent and recorded: done again, on the new attempt, phase unmoved", retakeLanded.status === "done" && retakeLanded.session?.id === "r2" && !retakeLanded.reopen);
const legacyResult = buildAssessmentRecord(
  finishedApp({ status: "pending", phase: "step_chat", notes: retakeNotes }),
  { sessions: [], reopens: [chatReopen], now: NOW },
).entries.find((e) => e.key === "step_chat");
check("a result with no time at all is older than any marker (and still opens)", legacyResult.statusLabel === "Reopened for a retake" && legacyResult.retake === "open" && legacyResult.openable, legacyResult.statusLabel);
const riding = buildAssessmentRecord(
  finishedApp({ status: "pending", phase: "step_chat", notes: retakeNotes }),
  { sessions: withReopens([s1Done, s2Live], [chatReopen]), now: NOW },
).entries.find((e) => e.key === "step_chat");
check("the markers ride on the hooks' session list (withReopens)", riding.status === "in_progress" && riding.session?.id === "r2" && riding.reopen?.count === 1);
const othersMarker = buildAssessmentRecord(
  finishedApp({ status: "pending", phase: "step_chat", notes: retakeNotes }),
  { sessions: withReopens([s1Done], [{ ...chatReopen, application_id: "app-2" }]), now: NOW },
).entries.find((e) => e.key === "step_chat");
check("another application's marker is not this one's", othersMarker.status === "done" && !othersMarker.retake);
const wrongStep = buildAssessmentRecord(
  finishedApp({ status: "pending", phase: "step_chat", notes: retakeNotes }),
  { sessions: [s1Done], reopens: [{ ...chatReopen, step_id: "step_typing" }], now: NOW },
).entries.find((e) => e.key === "step_chat");
check("a marker on another step reopens nothing here", wrongStep.status === "done");
const neverTaken = buildAssessmentRecord(
  finishedApp({ status: "pending", phase: "step_chat", notes: JSON.stringify(finishedNotes({ chatSimulationResult: undefined, chatInterviewResult: undefined, _trusted: undefined })) }),
  { sessions: [], now: NOW },
).entries.find((e) => e.key === "step_chat");
check("pending on a step never taken: in progress, not 'Reopened for a retake'", neverTaken.status === "in_progress" && neverTaken.statusLabel === "In progress", neverTaken.statusLabel);
check(
  "retakeMarker: the quiz and the form are never reopened by a marker",
  retakeMarker({ status: "pending", phase: "quiz" }, { id: "quiz", type: "quiz" }, {}, [], [{ step_id: "quiz", reopened_at: ago(MIN) }]) === null &&
    retakeMarker({ status: "pending", phase: "application" }, { id: "application", type: "application" }, {}, [], [{ step_id: "application", reopened_at: ago(MIN) }]) === null,
);
check(
  "retakeMarker: a marker with no time is not proof",
  retakeMarker({ status: "pending", phase: "step_chat" }, { id: "step_chat", type: "chat_simulation" }, {}, [], [{ step_id: "step_chat", reopened_at: null }]) === null,
);
check(
  "retakeMarker: a decision or a moved phase closes it",
  retakeMarker({ status: "reviewing", phase: "step_chat" }, { id: "step_chat", type: "chat_simulation" }, {}, [], [chatReopen]) === null &&
    retakeMarker({ status: "pending", phase: "step_interview" }, { id: "step_chat", type: "chat_simulation" }, {}, [], [chatReopen]) === null,
);
const rechecking = buildAssessmentRecord(
  finishedApp({ status: "pending", phase: "step_interview", notes: retakeNotes }),
  { sessions: [s1Done, { ...s2Live, status: "grading" }], now: NOW },
).entries.find((e) => e.key === "step_chat");
check("a retake sent and being checked reads 'Checking', not the old result", rechecking.status === "in_progress" && rechecking.statusLabel === "Checking the answers" && rechecking.session?.id === "r2", rechecking.statusLabel);
const movedOn = buildAssessmentRecord(
  finishedApp({ notes: retakeNotes }),
  { sessions: [s1Done, s2Live], now: NOW },
).entries.find((e) => e.key === "step_chat");
check("done with a later attempt left open: the result's own attempt is shown", movedOn.status === "done" && movedOn.session?.id === "r1" && movedOn.integrity.total === 5);
const decidedRecheck = buildAssessmentRecord(
  finishedApp({ status: "rejected", notes: retakeNotes }),
  { sessions: [s1Done, { ...s2Live, status: "grading" }], now: NOW },
).entries.find((e) => e.key === "step_chat");
check("decided: the result on file is done, with its own attempt", decidedRecheck.status === "done" && decidedRecheck.session?.id === "r1");

// Flags are placed in the conversation by the server's clock, not the
// laptop's: a clock 3 minutes slow must not move them or the offsets.
const T0 = Date.parse("2026-10-06T15:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
const slow = 180_000;
seq = 0;
const skewEvents = [
  ev("assistant_turn", { content: "Hi, my deposit is gone.", created_at: iso(T0), detail: { role: "customer" } }),
  ev("candidate_turn", { content: "Sorry! Which name did you send it from?", created_at: iso(T0 + 35_000), client_at: iso(T0 + 35_000 - slow), detail: { role: "agent" } }),
  ev("integrity", { kind: "integrity", created_at: iso(T0 + 50_300), client_at: iso(T0 + 50_000 - slow), detail: { kind: "paste" } }),
  ev("integrity", { kind: "integrity", duration_ms: 67_000, created_at: iso(T0 + 60_000 + 67_000 + 400), client_at: iso(T0 + 60_000 - slow), detail: { kind: "tab_hidden", duration_ms: 67_000 } }),
  ev("assistant_turn", { content: "Robin Example.", created_at: iso(T0 + 130_000), detail: { role: "customer" } }),
];
const skewTl = integrityTimeline(skewEvents);
const near = (a, b, tol = 1500) => a != null && Math.abs(Date.parse(a) - b) <= tol;
check("each flag also carries the server's time for it", near(skewTl[0].serverAt, T0 + 50_000) && near(skewTl[1].serverAt, T0 + 60_000), `${skewTl[0].serverAt} ${skewTl[1].serverAt}`);
check("…while the timeline still shows the page's own time", skewTl[0].at === iso(T0 + 50_000 - slow));
check("an event the page sent no time for reads the server's", integrityTimeline([ev("integrity", { created_at: iso(T0), detail: { kind: "copy" } })])[0].serverAt === iso(T0));

// The step's own title may contain ": " — the card's words must not be cut there.
const colonCard = parseIntegrityCard({
  type: "integrity",
  group_key: "integrity:0ccadfc5-130e-45ea-9a43-745e049242b3:step_chat",
  message: "During Chat practice: refunds: left the window 2 times (1m 12s away), paste attempt x1",
});
check("a test title with ': ' in it keeps its words", colonCard.during === "Chat practice: refunds" && colonCard.parts.join("|") === "left the window 2 times (1m 12s away)|paste attempt ×1", JSON.stringify(colonCard));

// A resent pick, or a written answer saved in bursts, is not a changed answer.
seq = 0;
const resent = quizTimings([
  ev("quiz_answer", { detail: { question_id: "zq1", answer: 1, seconds_on_question: 9, timing_source: "server" } }),
  ev("quiz_answer", { detail: { question_id: "zq1", answer: 1, seconds_on_question: 9.4, timing_source: "server", changed: true } }),
  ev("quiz_answer", { detail: { question_id: "zq4", answer: ["b", "a"], seconds_on_question: 9, timing_source: "server" } }),
  ev("quiz_answer", { detail: { question_id: "zq4", answer: ["a", "b"], seconds_on_question: 11, timing_source: "server", changed: true } }),
  ev("quiz_answer", { detail: { question_id: "zq5", answer: 0, seconds_on_question: 4, timing_source: "server" } }),
  ev("quiz_answer", { detail: { question_id: "zq5", answer: 2, seconds_on_question: 6, timing_source: "server", changed: true } }),
  ev("quiz_answer", { detail: { question_id: "zq5", answer: 2, seconds_on_question: 7, timing_source: "server", changed: true } }),
]);
check("a pick sent twice is not a change", resent.get("zq1").changes === 0);
check("the same picks in another order are not a change", resent.get("zq4").changes === 0);
check("a real change is counted once, not once per resend", resent.get("zq5").changes === 1);
const textQuizJob = { ...JOB, quiz_questions: [...QUIZ_QUESTIONS.slice(0, 9), { id: "zq10", type: "text", category: "payments", question: "Write a reply", options: [] }] };
seq = 0;
const textBursts = [
  ev("quiz_shown", { detail: { question_id: "zq10", question_index: 9 } }),
  ev("quiz_answer", { detail: { question_id: "zq10", answer: "I would", seconds_on_question: 5, timing_source: "server" } }),
  ev("quiz_answer", { detail: { question_id: "zq10", answer: "I would ask the player", seconds_on_question: 12, timing_source: "server", changed: true } }),
];
const textLive = withSessionEvents(
  buildAssessmentRecord({ id: "app-t", status: "pending", phase: "quiz", notes: JSON.stringify({ applicationAnswers: [{ question: "Name", answer: "Robin" }] }), jobs: textQuizJob }, { sessions: [sess()], now: NOW }).entries.find((e) => e.key === "quiz"),
  textBursts,
);
const textItem = textLive.detail.items.find((i) => i.id === "zq10");
check("a written answer saved as they type is never 'changed N×'", textItem && textItem.changes === 0 && textItem.textAnswer === "I would ask the player", JSON.stringify(textItem));
const textDone = withSessionEvents(buildAssessmentRecord(finishedApp({ jobs: textQuizJob })).entries.find((e) => e.key === "quiz"), textBursts);
const textDoneItem = textDone.detail.items.find((i) => i.id === "zq10");
check("…nor once the quiz is sent", textDoneItem && textDoneItem.type === "text" && textDoneItem.changes === 0 && textDoneItem.seconds === 12, JSON.stringify(textDoneItem));

/* ── 16. A live toast for every new flag on the owner's card ───────────── */
// The owner: told EVERY time an applicant copies, pastes, tries a screenshot
// or switches windows. After the first flag the server UPDATEs one card per
// applicant per test (new tally, unread again, created_at = now()), so the
// toast has to come from those updates — once per batch, never twice for the
// same update, never for a mark-as-read.
const APP_T = "0ccadfc5-130e-45ea-9a43-745e049242b3";
const cardRow = (message, created_at, over = {}) => ({
  id: "n-1",
  user_id: "owner-1",
  type: "integrity",
  title: "Integrity — Robin Okafor",
  message: `During Player chat practice: ${message}`,
  link: `/applicants/${APP_T}`,
  group_key: `integrity:${APP_T}:step_chat`,
  is_read: false,
  created_at,
  ...over,
});
const c1 = cardRow("left the window 1 time (12s away)", "2026-10-06T15:49:58.100Z");
const c2 = cardRow("left the window 2 times (40s away)", "2026-10-06T15:50:31.400Z");
const c3 = cardRow("left the window 3 times (1m 12s away)", "2026-10-06T15:51:02.900Z");
const c3p = cardRow("left the window 3 times (1m 12s away), paste attempt x1", "2026-10-06T15:51:20.000Z");
check("the card's counts are read back from its words", JSON.stringify(integrityCardCounts(parseIntegrityCard(c3p).parts)) === JSON.stringify({ away: 3, paste: 1 }));
check(
  "every part the server writes is counted",
  JSON.stringify(integrityCardCounts(["left the window 1 time", "pasted-in text ×2", "copy attempt x3", "screenshot attempt x1", "possible screenshot x4", "developer tools opened x1", "closed the test page x2"])) ===
    JSON.stringify({ away: 1, bulk_insert: 2, copy: 3, screenshot_key: 1, screenshot_suspected: 4, devtools: 1, page_closed: 2 }),
);
check("ordinals", [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal).join(" ") === "1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 23rd 101st 111th");

let tt = integrityCardToast(c2, c3);
check("one more switch: 'Robin Okafor left the window during Player chat practice (3rd time)'", tt?.title === "Robin Okafor left the window during Player chat practice (3rd time)", tt?.title);
check("…with the running tally under it", tt?.description === "So far: left the window 3 times (1m 12s away)", tt?.description);
check("…opening that test's timeline", tt?.link === `/applicants/${APP_T}?record=step_chat&focus=integrity`);
tt = integrityCardToast(c3, c3p);
check("a paste: 'Robin Okafor tried to paste during Player chat practice'", tt?.title === "Robin Okafor tried to paste during Player chat practice", tt?.title);
tt = integrityCardToast(null, c1);
check("the first flag (a new card): no count on a first time", tt?.title === "Robin Okafor left the window during Player chat practice", tt?.title);
tt = integrityCardToast(c1, cardRow("left the window 3 times (1m 12s away)", "2026-10-06T15:52:00Z"));
check("two switches in one batch: said as two more, with the total", tt?.title === "Robin Okafor left the window 2 more times during Player chat practice (3 in all)", tt?.title);
tt = integrityCardToast(c2, cardRow("left the window 3 times (1m 12s away), possible screenshot x1", "2026-10-06T15:52:00Z"));
check("two kinds in one batch: both named", tt?.title === "Robin Okafor left the window and may have taken a screenshot during Player chat practice", tt?.title);
check("nothing grew: no toast", integrityCardToast(c3, cardRow("left the window 3 times (1m 12s away)", "2026-10-06T15:59:00Z")) === null);
tt = integrityCardToast(undefined, c3);
check("an update of a card never seen: said without a count", tt?.title === "Robin Okafor was flagged again during Player chat practice", tt?.title);
check("no name on the card: the server's own 'A candidate'", integrityCardToast(null, { ...c1, title: "Integrity — A candidate" })?.title.startsWith("A candidate left the window"));
check("not an integrity card: no toast", integrityCardToast(null, { ...c1, type: "application", group_key: null }) === null);
tt = integrityCardToast(c1, { ...c2, message: "During Chat practice: refunds: left the window 2 times (40s away)" });
check("a test title with ': ' stays whole in the sentence", tt?.title === "Robin Okafor left the window during Chat practice: refunds (2nd time)", tt?.title);

// The gate: what the toast host runs every realtime write through.
let gate = createIntegrityToastGate();
gate.seed([c1]);
const shownIds = [];
const consider = (event, row) => {
  const t = gate.consider(event, row);
  if (t) shownIds.push(t.id);
  return t;
};
check("an UPDATE whose tally grew toasts", consider("UPDATE", c2)?.title === "Robin Okafor left the window during Player chat practice (2nd time)");
check("the same UPDATE delivered again does not", consider("UPDATE", { ...c2 }) === null);
check("a mark-as-read UPDATE does not", consider("UPDATE", { ...c2, is_read: true }) === null);
check("the next flag after it was read toasts", consider("UPDATE", c3)?.title === "Robin Okafor left the window during Player chat practice (3rd time)");
check("an older write arriving late does not", consider("UPDATE", { ...c2, is_read: false }) === null);
check("…nor does a mark-all-read", consider("UPDATE", { ...c3, is_read: true }) === null);
check("a paste on the same card toasts as a paste", consider("UPDATE", c3p)?.title === "Robin Okafor tried to paste during Player chat practice");
check("every toast has its own id (one per batch)", new Set(shownIds).size === shownIds.length && shownIds.length === 3, JSON.stringify(shownIds));
check("an ordinary notification never goes through it", consider("UPDATE", { id: "n-9", type: "application", title: "New application", message: "x", group_key: null, is_read: false, created_at: c3.created_at }) === null);
gate = createIntegrityToastGate();
check("a brand-new card (INSERT) toasts its first flag", gate.consider("INSERT", c1)?.title === "Robin Okafor left the window during Player chat practice");
check("…and the same INSERT twice toasts once", gate.consider("INSERT", { ...c1 }) === null);
check("a card deleted and written again is compared with what it said", gate.consider("INSERT", { ...c3, id: "n-2" })?.title === "Robin Okafor left the window 2 more times during Player chat practice (3 in all)");
gate = createIntegrityToastGate();
gate.seed([c1]);
gate.consider("UPDATE", c3);
check("a late, older write is not a flag…", gate.consider("UPDATE", { ...c2, created_at: "2026-10-06T15:50:59.000Z" }) === null);
check("…and the next one is still compared with the newest", gate.consider("UPDATE", c3p)?.title === "Robin Okafor tried to paste during Player chat practice");
gate = createIntegrityToastGate();
check("an UPDATE of a card the tab never saw toasts, without a count", gate.consider("UPDATE", c3)?.title === "Robin Okafor was flagged again during Player chat practice");
gate = createIntegrityToastGate();
gate.seed([c3]);
check("the seed read this very write before its message: still toasted", gate.consider("UPDATE", c3)?.title === "Robin Okafor was flagged again during Player chat practice");
check("…once", gate.consider("UPDATE", c3) === null);
gate = createIntegrityToastGate();
gate.consider("UPDATE", { ...c3, is_read: true });
gate.seed([c2]);
check("a late seed never steps back over a newer write", gate.consider("UPDATE", c3p)?.title === "Robin Okafor tried to paste during Player chat practice");
gate = createIntegrityToastGate();
gate.seed([c3]);
check("after a mark-as-read, the same write unread again is not a new flag", gate.consider("UPDATE", { ...c3, is_read: true }) === null && gate.consider("UPDATE", { ...c3 }) === null);

/* ── 9. Where it is mounted (source checks) ────────────────────────────── */
// Since 2026-10-06 the Applicants page is a list and nothing else
// (docs/APPLICANTS-LIST.md): no right-hand panel, no "What they submitted",
// no live strip. Each row opens the full profile, which holds the record list
// and its sheet. The full profile once fell back to applications[0], putting
// someone else's record behind this person's name.
const { readFile } = await import("node:fs/promises");
const src = (rel) => readFile(new URL(`../${rel}`, import.meta.url), "utf8");
const applicantsPage = await src("src/cockpit/pages/Applicants.tsx");
const applicantRow = await src("src/cockpit/components/ApplicantRow.tsx");
const listLib = await src("src/cockpit/lib/applicantList.ts");
const applicantListHook = await src("src/cockpit/hooks/useApplicantList.ts");
const detailPage = await src("src/cockpit/pages/CandidateDetail.tsx");
check(
  "the Applicants page is a list: no record list on it, every row opens /applicants/:id",
  !/<AssessmentRecordList/.test(applicantsPage) && (applicantRow.match(/to=\{`\/applicants\/\$\{row\.id\}`\}/g) ?? []).length === 2,
);
check("the old EvidenceTiles are gone", !/EvidenceTiles/.test(applicantsPage));
check("the record sheet opens on the full profile, not on the list", !/<AssessmentRecordSheet/.test(applicantsPage) && /<AssessmentRecordSheet/.test(detailPage));
check("the full profile lists what they submitted", /<AssessmentRecordList/.test(detailPage) && /What they submitted/.test(detailPage));
// On a desktop (docs/APPLICANT-PROFILE.md) the same record is drawn as tiles,
// one per entry but the integrity row (the right column's), and a tile opens
// the same sheet through the same openRecord as the phone's rows.
const tilesSrc = await src("src/cockpit/components/ApplicantTestTiles.tsx");
const integritySrc = await src("src/cockpit/components/ApplicantIntegrityPanel.tsx");
check(
  "the desktop profile draws the record as tiles that open the same sheet",
  /testTiles\(record\.entries,/.test(detailPage) && /<ApplicantTestTiles tiles=\{tiles\} onOpen=\{openRecord\} \/>/.test(detailPage) && /onClick=\{\(\) => onOpen\(tile\.entry\)\}/.test(tilesSrc),
);
check(
  "…and the integrity row becomes the right column's count and words, opening the same sheet",
  /entries\.find\(\(e\) => e\.kind === "integrity"\)/.test(integritySrc) && /entry\.subline/.test(integritySrc) && /onClick=\{\(\) => onOpen\(entry\)\}/.test(integritySrc) && /<ApplicantIntegrityPanel record=\{record\} onOpen=\{openRecord\} \/>/.test(detailPage),
);
check("the full profile no longer shows a Quiz/Voice grid", !/label: "Voice", v: c\.voice/.test(detailPage));
check("the full profile looks again before saying it cannot find someone", /stillLooking/.test(detailPage) && /refetch\(\)/.test(detailPage));
// The list's state: 25 at a time, and the tab, filters, sort, search and
// how many are shown live in the URL (replace, not push), so Back from a
// profile lands on the same view. Decisions (Pass, Move, Hire) are made on the
// profile, which pages through the list's own order.
check("the list draws 25 at a time and Show 25 more adds the next 25", /export const PAGE_SIZE = 25;/.test(listLib) && /update\(\{ shown: state\.shown \+ PAGE_SIZE \}\)/.test(applicantsPage));
check(
  "the list's state is written to the URL with replace, from the URL it was read",
  /setSearchParams\(\s*\(current\) => serializeListState\(\{ \.\.\.parseListState\(current\), shown: PAGE_SIZE, \.\.\.patch \}, current\),\s*\{ replace: true \},?\s*\)/.test(applicantsPage),
);
check("the job filter IS ?roleId=", /set\("roleId", state\.job, ""\)/.test(listLib) && /job: str\(p\.get\("roleId"\)\)/.test(listLib) && /update\(\{ job: value \|\| null \}\)/.test(applicantsPage));
check("the profile's pager gets the order on screen; Back restores the scroll", /writeApplicantOrder\(ids\)/.test(applicantsPage) && /navigationType !== "POP"/.test(applicantsPage) && /readScroll\(location\.search\)/.test(applicantsPage));
check("an old ?applicationId= link opens that person's profile", /const redirect = profileRedirectFor\(searchParams\);\s*if \(redirect\) return <Navigate to=\{redirect\} replace \/>/.test(applicantsPage));
const dashboardPage = await src("src/cockpit/pages/Dashboard.tsx");
check(
  "the Dashboard names someone applying even when others are sealed, and opens the list on the form's step",
  /applying > 0 && \(sealed\.length > 0 \|\| stillReading > 0\)/.test(dashboardPage) &&
    (dashboardPage.match(/navigate\("\/applicants\?where=application"\)/g) ?? []).length === 2 &&
    !/\/applicants\?tab=applying/.test(dashboardPage),
);
const hooks = await src("src/cockpit/hooks/useCockpitData.ts");
check("useCockpitCandidate never falls back to someone else's row", !/applications\[0\]/.test(hooks));
// Wave 2: both staff pages build the record WITH the server's attempts, the
// sheet loads an attempt's events only while open, and the alert link opens
// the right test.
check(
  "the Applicants list reads EVERY attempt of its jobs, not only open ones (flag counts and last active)",
  /useApplicantList\(\)/.test(applicantsPage) && !/useOpenSessions\(/.test(applicantsPage) &&
    /\.from\("assessment_sessions"\)\s*\.select\(LIST_SESSION_COLUMNS\)\s*\.in\("job_id", ids\)\s*\.order/.test(applicantListHook),
);
check("…and builds each row with the profile's own reader, hand-backs included", /buildAssessmentRecord\(\{ \.\.\.app, notes: app\.notes \?\? null, jobs: job \}, \{ sessions: withReopens\(sessions, reopens\), now: input\.now \}\)/.test(listLib));
check("the full profile reads the attempts and opens ?record=", /useApplicationSessions\(id/.test(detailPage) && /searchParams\.get\("record"\)/.test(detailPage));
const sheet = await src("src/cockpit/components/AssessmentRecordSheet.tsx");
check("the sheet folds in the attempt's events", /useSessionEvents\(/.test(sheet) && /withSessionEvents\(/.test(sheet) && /useApplicationIntegrityEvents\(/.test(sheet));
const sessionsHook = await src("src/cockpit/hooks/useAssessmentSessions.ts");
check("the record reads as empty, not broken, before the tables exist", /PGRST205/.test(sessionsHook) && /isRecordNotDeployed\(error\)\) return \[\]/.test(sessionsHook));
check("the record hooks open no realtime channel of their own (the shell's live sync does)", !/\.channel\(/.test(sessionsHook));
const notificationsPage = await src("src/pages/Notifications.tsx");
check("the bell has an icon for integrity cards", /integrity:\s*ShieldAlert/.test(notificationsPage) && /parseIntegrityCard\(/.test(notificationsPage));
// Review fixes: the phone sees live lines, links outlive five minutes, the
// open list is bounded, and transcript flags sit on the server's clock.
check(
  "on a phone every card says where they are and who is live (no separate strip)",
  /export function ApplicantCard\(/.test(applicantRow) && /<JourneyDots dots=\{row\.dots\} size=\{17\} \/>/.test(applicantRow) &&
    /<CardLine row=\{row\} \/>/.test(applicantRow) && /row\.liveNow &&/.test(applicantRow) && !/data-ck-live-strip/.test(applicantsPage),
);
check("file links are re-minted while on screen and on return", /refetchInterval: FILE_LINK_REFRESH_MS/.test(sessionsHook) && /useApplicantFileUrl[\s\S]{0,900}refetchOnWindowFocus: true/.test(sessionsHook));
// The open-only list (newest 200) is gone: the list loads every attempt,
// paged past PostgREST's 1,000-row cap, without the heavy columns.
check(
  "the list's attempts are paged past 1,000 rows, without grading, context or draft",
  /\.select\(LIST_SESSION_COLUMNS\)[\s\S]{0,200}\.range\(from, to\)/.test(applicantListHook) &&
    !/grading|context|draft/.test(/LIST_SESSION_COLUMNS =\s*"([^"]*)"/.exec(applicantListHook)?.[1] ?? "grading") &&
    !/useOpenSessions|OPEN_SESSION_LIMIT/.test(sessionsHook),
);
// Someone on the form is no longer named on other tabs (docs/APPLICANTS-LIST.md
// §1 says why); the header counts them instead.
check("the header counts who is still on the form", /\{onForm > 0 && ` · \$\{onForm\} on the form`\}/.test(applicantsPage));
check("the timeline's times are on the same clock as its markers", /when\(item\.serverAt \?\? item\.at, "h:mm:ss a"\)/.test(sheet));
check("transcript flags use the server's clock, offsets count from the first turn", /at: t\.serverAt \?\? t\.at/.test(sheet) && /const origin = start \?\? flagStart/.test(sheet));
check("an old list marks a right-click as recorded only", /function FlagList/.test(sheet) && /e\.recordedOnly && <span[^>]*> · recorded only/.test(sheet));
check("a reopened step says so in its sheet", /shown\.retake === "open"/.test(sheet) && /Reopened for a retake/.test(sheet));
// Wave 3: the owner hears about every new flag, a hand-back is a staff
// marker, and a quiz still being answered shows no answer key.
const toastsHost = await src("src/components/GlobalNotificationToasts.tsx");
const toastChannel = toastsHost.slice(toastsHost.indexOf(".channel("), toastsHost.indexOf(".subscribe("));
check(
  "the toast host listens for UPDATEs of the card, not only INSERTs, before it subscribes",
  /event: "UPDATE",\s*schema: "public",\s*table: "notifications"/.test(toastChannel) && /event: "INSERT",\s*schema: "public",\s*table: "notifications"/.test(toastChannel),
);
check("…runs every write through one gate per tab", /^const integrityToasts = createIntegrityToastGate\(\);/m.test(toastsHost) && /integrityToasts\.consider\("UPDATE"/.test(toastsHost) && /integrityToasts\.consider\("INSERT"/.test(toastsHost));
check("…reads the cards as they stand on every (re)join", /status === "SUBSCRIBED"[\s\S]{0,80}seedIntegrityCards\(/.test(toastsHost));
check("…and shows the ONE toast design, under a per-update id", /toast\(t\.title, \{\s*id: t\.id,/.test(toastsHost) && !/toast\.custom|toast\.warning|toast\.error\(t\./.test(toastsHost));
const notificationsHook = await src("src/hooks/useNotifications.ts");
const listHook = notificationsHook.slice(notificationsHook.indexOf("export function useNotifications"), notificationsHook.indexOf("export function useUnreadCount"));
check("the bell's list refetches on a card's UPDATE too", /event: "\*"/.test(listHook) && !/event: "INSERT"/.test(listHook));
check("a quiz still being answered never loads or shows the answer key", /enabled: enabled && !!jobId && sent,/.test(sheet) && /const keysReady = sent &&/.test(sheet) && /const correct = !sent\s*\?\s*null/.test(sheet));
// The person's hand-backs in useApplicationSessions; the list's own in
// useApplicantList (every hand-back of its jobs, folded in per row).
check(
  "the record reads the staff hand-backs for the person and for the list",
  (sessionsHook.match(/\.from\("assessment_step_reopens"\)/g) ?? []).length === 1 && /withReopens\(query\.data, reopens\.data\)/.test(sessionsHook) &&
    /\.from\("assessment_step_reopens"\)/.test(applicantListHook) && /withReopens\(sessions, reopens\)/.test(listLib),
);
check("…under the applications keys the live sync refetches on a hand-back", /reopens: \(applicationId[^)]*\) => \["applications", "step-reopens"/.test(sessionsHook));
const fixturesSrc = await src("src/dev-preview/fixtures.ts");
check("the preview's reopened applicant carries a staff marker", /assessment_step_reopens: onlyApplying \? \[\] : \[\{ \.\.\.jordanChatReopen \}\]/.test(fixturesSrc));
// The computer and connection check on the staff side (docs/EQUIPMENT-CHECK.md §6).
check("the sheet renders the connection check's own body", /case "equipment_check":\s*body = <EquipmentBody detail=\{detail\} loading=\{loading\} \/>;/.test(sheet) && /function EquipmentBody\(/.test(sheet));
check("…says the figures were timed by our server, under them", /Timed by our server\./.test(sheet));
check("…its live note follows the screen they are on", /detail\.liveScreen === "computer"/.test(sheet) && /Choosing the computer now/.test(sheet) && /Looking at the result now/.test(sheet));
check("…says a plain 'No' in words, never 'Not answered yet'", /detail\.usingThisComputer === "no"/.test(sheet) && /it has not been run there yet/.test(sheet));
check("…and shows where the test ran and where it was sent from", /label: "Test ran from"/.test(sheet) && /label: "Sent from"/.test(sheet) && /counted by their page/.test(sheet));
check("…and draws no integrity block under it (contract rule 5)", /shown\.kind !== "integrity" && shown\.kind !== "equipment_check" && !notesFlagsInline/.test(sheet));
const listSrc = await src("src/cockpit/components/AssessmentRecordList.tsx");
const journeyRail = await src("src/cockpit/components/ApplicantJourneyRail.tsx");
check(
  "the row and the profile's gem wear the step's own mark",
  /equipment_check: GlyphEcho/.test(listSrc) && /import \{ EntryIcon \} from "\.\/AssessmentRecordList";/.test(journeyRail) && /<EntryIcon entry=\{\{ stepType \}\}/.test(journeyRail),
);
check(
  "the record list draws each connection flag on its own line, uncut, and says who timed it (§6)",
  /equipment\.flags\.map\(\(flag\) =>/.test(listSrc) && /equipment \? "break-words" : "truncate"/.test(listSrc) && /equipment\?\.measuredBy === "server"/.test(listSrc),
);
check("the preview's finished applicant carries the recorded result", /equipmentCheckResult: ROBIN_CONNECTION/.test(fixturesSrc) && /"step_connection", "equipment_check"/.test(fixturesSrc));
check("the preview shows the chat's typing both ways: on the job with its typing test (information) and on the job without it (Kwame, below the bar)",
  /typing: chatTypingFixture\(\{ wpm: 35,/.test(fixturesSrc) && /filter\(\(s\) => s\.type !== "typing_test"\)/.test(fixturesSrc) &&
    /typing: chatTypingFixture\(\{ wpm: 32, correctionsPct: 9, medianReplySeconds: 140,/.test(fixturesSrc) && /\n  zuluJobNoTypingStep,\n\);/.test(fixturesSrc));


/* ── Typing measured in the chat practice (docs/TYPING-IN-CHAT.md) ──────── */

console.log("\nTyping in the chat practice:\n");
/** notes.chatSimulationResult.typing, in the doc's shape. */
function chatTypingBlock({ wpm = 47, correctionsPct = 6, medianReplySeconds = 38, typosPer100Words = 1.2, repliesTimed = 6, pasteLike = 0, bar = { minWpm: 40, maxMedianReplySeconds: 90 }, notTimed } = {}) {
  const below = [];
  if (wpm !== null && wpm < bar.minWpm) below.push("speed");
  if (medianReplySeconds !== null && medianReplySeconds > bar.maxMedianReplySeconds) below.push("reply_time");
  return {
    wpm, correctionsPct, medianReplySeconds, typosPer100Words, repliesTimed, pasteLike, bar,
    meetsBar: below.length > 0 ? false : wpm === null ? null : true, below,
    // Left out unless given: a block from before notTimed was stored.
    ...(notTimed !== undefined ? { notTimed } : {}),
    measuredBy: { speed: "page", replyTime: "server", typos: "grader" },
  };
}
// The live job once step_typing is dropped: six steps, typing measured in the chat.
const NO_TYPING_JOB = { ...JOB, workflow_steps: ZULU_STEPS.filter((s) => s.type !== "typing_test") };
/** A finished applicant whose chat scored 80, with this typing block (or none). */
function typedChatApp(block, { job = NO_TYPING_JOB, score = 80, keepTypingTest = false } = {}) {
  const base = finishedNotes();
  const notes = {
    ...base,
    chatSimulationResult: { ...base.chatSimulationResult, score, empathy: 82, problemSolving: 78, ...(block ? { typing: block } : {}) },
  };
  if (!keepTypingTest) {
    delete notes.typingTestResult;
    delete notes.step_typing;
    notes._trusted = { ...notes._trusted };
    delete notes._trusted.step_typing;
  }
  return finishedApp({ jobs: job, notes: JSON.stringify(notes) });
}
const typedChatEntry = (app, opts) => buildAssessmentRecord(app, opts).entries.find((e) => e.key === "step_chat");

const typedOk = typedChatEntry(typedChatApp(chatTypingBlock()));
check("the chat practice's tile carries the typing line, word for word",
  typedOk.detail.typing?.line === "Typing 47 WPM · 6% corrections · replies in 38 s (median)", typedOk.detail.typing?.line);
check("…at or over the bars: the step keeps its mark's tone, the receipt adds the speed",
  typedOk.tone === "jade" && typedOk.receipt === "80/100 · 47 WPM" && typedOk.detail.typing.jobMeasure === true && typedOk.detail.typing.below.length === 0,
  `${typedOk.tone} ${typedOk.receipt}`);
check("…its own mark is kept beside it (score, under the pass mark or not)", typedOk.detail.score === 80 && typedOk.detail.belowPassMark === false);

const typedSlow = typedChatEntry(typedChatApp(chatTypingBlock({ wpm: 32, correctionsPct: 9, medianReplySeconds: 140 })));
check("under the speed bar and over the reply bar: the step reads below the bar (amber)",
  typedSlow.tone === "amber" && chatTypingBelowBar(typedSlow.detail.typing) && typedSlow.detail.typing.below.join(",") === "speed,reply_time",
  `${typedSlow.tone} ${JSON.stringify(typedSlow.detail.typing?.below)}`);
check("…the receipt stays short enough for a gem on a phone: the mark and the speed", typedSlow.receipt === "80/100 · 32 WPM", typedSlow.receipt);
check("…while the mark itself is not under the pass mark", typedSlow.detail.belowPassMark === false);
const typedSlowReplies = typedChatEntry(typedChatApp(chatTypingBlock({ medianReplySeconds: 120 })));
check("slow replies alone: below the bar, and the receipt says why", typedSlowReplies.tone === "amber" && typedSlowReplies.receipt === "80/100 · slow replies", typedSlowReplies.receipt);
const ownBars = typedChatEntry(typedChatApp(chatTypingBlock({ wpm: 44, medianReplySeconds: 50, bar: { minWpm: 45, maxMedianReplySeconds: 60 } })));
check("the chat step's own bars decide (44 under 45)", ownBars.tone === "amber" && ownBars.detail.typing.below.join(",") === "speed" && ownBars.receipt === "80/100 · 44 WPM", ownBars.receipt);

const typedThin = typedChatEntry(typedChatApp(chatTypingBlock({ wpm: null, correctionsPct: null, repliesTimed: 2 })));
check("fewer than 3 timed replies: 'not enough typing to time', never a fail",
  typedThin.detail.typing?.line === "Typing: not enough typing to time · replies in 38 s (median)" && typedThin.tone === "jade" && typedThin.receipt === "80/100",
  `${typedThin.detail.typing?.line} | ${typedThin.tone} | ${typedThin.receipt}`);
const typedThinWithNumber = chatTypingOf(chatTypingBlock({ wpm: 33, repliesTimed: 2 }));
check("…even when a number came with it", typedThinWithNumber.wpm === null && !typedThinWithNumber.enoughToTime && typedThinWithNumber.below.length === 0);

const typedTooShort = chatTypingOf(chatTypingBlock({ wpm: null, correctionsPct: null, repliesTimed: 2, notTimed: "too_short" }));
check("why no speed, in the line: too few long replies", typedTooShort.line === "Typing: not enough typing to time · replies in 38 s (median)" && typedTooShort.notTimed === "too_short");
const typedNotSent = chatTypingOf(chatTypingBlock({ wpm: null, correctionsPct: null, repliesTimed: 0, notTimed: "not_sent" }));
check("…the page did not time them (an older page): said as such, not as 'too short'", typedNotSent.line === "Typing: not timed by the page · replies in 38 s (median)" && !typedNotSent.arrivedWithoutTyping, typedNotSent.line);
const jumps = typedChatEntry(typedChatApp(chatTypingBlock({ wpm: null, correctionsPct: null, repliesTimed: 1, pasteLike: 4, notTimed: "arrived_without_typing" })));
check("…replies that arrived without typing: said, and worth a look (amber line), but not 'below the bar'",
  jumps.detail.typing.line === "Typing: replies arrived without typing · replies in 38 s (median)" && jumps.detail.typing.arrivedWithoutTyping &&
    chatTypingNeedsALook(jumps.detail.typing) && !chatTypingBelowBar(jumps.detail.typing) && jumps.tone === "jade",
  `${jumps.detail.typing.line} | ${jumps.tone}`);
check("one reply in jumps beside five timed ones is not worth a look; two are, and so is one beside one timed",
  !chatTypingOf(chatTypingBlock({ pasteLike: 1, repliesTimed: 5 })).arrivedWithoutTyping &&
    chatTypingOf(chatTypingBlock({ pasteLike: 2, repliesTimed: 5 })).arrivedWithoutTyping &&
    chatTypingOf(chatTypingBlock({ wpm: null, pasteLike: 1, repliesTimed: 1 })).arrivedWithoutTyping);

const untyped = typedChatEntry(typedChatApp(null));
check("an older chat with no typing block reads exactly as before", untyped.detail.typing === null && untyped.receipt === "80/100" && untyped.tone === "jade");
const typedFailed = typedChatEntry(typedChatApp(chatTypingBlock({ wpm: 32 }), { score: 30 }));
check("a mark under the pass mark AND typing under the bar: both are said", typedFailed.tone === "amber" && typedFailed.detail.belowPassMark === true && chatTypingBelowBar(typedFailed.detail.typing));

// A job that still has its typing step: the typing test is its measure, so
// the chat's typing is shown, never judged.
const withTypingStep = typedChatEntry(typedChatApp(chatTypingBlock({ wpm: 25, medianReplySeconds: 200 }), { job: JOB, keepTypingTest: true }));
check("a job with a typing step: the chat's typing is shown for information, the step keeps its mark's tone",
  withTypingStep.detail.typing?.line === "Typing 25 WPM · 6% corrections · replies in 200 s (median)" && withTypingStep.detail.typing.jobMeasure === false &&
    !chatTypingBelowBar(withTypingStep.detail.typing) && !chatTypingNeedsALook(withTypingStep.detail.typing) && withTypingStep.tone === "jade",
  `${withTypingStep.tone} ${withTypingStep.receipt}`);
check("…and its gem shows only the mark: the typing test's gem has the WPM that counts, so one row never shows two", withTypingStep.receipt === "80/100", withTypingStep.receipt);

// One value: the notes' block. The session's grading holds no copy of it
// (grading.result is the reviewer's evaluation; grading.typing is the
// per-reply extra), so it is never read from there.
const gradedTyping = typedChatEntry(typedChatApp(null), {
  sessions: [sess({ id: "ct1", step_id: "step_chat", step_type: "chat_simulation", status: "completed", grading: { graded_at: ago(5 * MIN), result: { score: 80 }, typing: { replies: [{ reply: 1, chars: 60, replySeconds: 30, typing: null, wpm: null, correctionsPct: null, timed: false, pasteLike: false }], spelling_mistakes: null } } })],
  now: NOW,
});
check("…the typing is read from the notes only, never from the session's grading", gradedTyping.detail.typing === null && gradedTyping.receipt === "80/100" && gradedTyping.tone === "jade", JSON.stringify(gradedTyping.detail.typing));
check("the live attempt carries no typing until it is graded", (() => {
  const live = buildAssessmentRecord(
    finishedApp({ jobs: NO_TYPING_JOB, status: "pending", phase: "step_chat", notes: JSON.stringify(finishedNotes({ chatSimulationResult: undefined, chatInterviewResult: undefined, typingTestResult: undefined, step_typing: undefined, _trusted: { step_connection: { stepType: "equipment_check", completedAt: ago(30 * MIN) } } })) }),
    { sessions: [sess({ id: "cl1", step_id: "step_chat", step_type: "chat_simulation", status: "active", progress: { candidate_turns: 2 }, last_activity_at: ago(MIN) })], now: NOW },
  ).entries.find((e) => e.key === "step_chat");
  return live.status === "in_progress" && live.detail?.kind === "chat_simulation" && live.detail.typing === null;
})());

// The record and Ava's scorecard read the block by the same rules.
check("the record's defaults and minimum match the server's", CHAT_TYPING_MIN_TIMED_REPLIES === SERVER_MIN_TIMED &&
  CHAT_TYPING_DEFAULT_BAR.minWpm === CHAT_TYPING_DEFAULT_MIN_WPM && CHAT_TYPING_DEFAULT_BAR.maxMedianReplySeconds === CHAT_TYPING_DEFAULT_MAX_MEDIAN_REPLY_SECONDS);
const MIRROR_BLOCKS = [
  chatTypingBlock(),
  chatTypingBlock({ wpm: 32, medianReplySeconds: 140 }),
  chatTypingBlock({ wpm: null, correctionsPct: null, repliesTimed: 1 }),
  chatTypingBlock({ wpm: 33, repliesTimed: 2 }),
  chatTypingBlock({ wpm: 44, bar: { minWpm: 45, maxMedianReplySeconds: 60 }, medianReplySeconds: 61 }),
  { wpm: 41, medianReplySeconds: 95, repliesTimed: 4 },
  { wpm: 50, repliesTimed: 5, bar: { min_wpm: 55, max_median_reply_seconds: 30 }, medianReplySeconds: 31 },
  { bar: { minWpm: 40 } },
  null,
  "47",
  chatTypingBlock({ wpm: null, correctionsPct: null, repliesTimed: 0, notTimed: "not_sent" }),
  chatTypingBlock({ wpm: null, correctionsPct: null, repliesTimed: 1, pasteLike: 3, notTimed: "arrived_without_typing" }),
  chatTypingBlock({ pasteLike: 2, repliesTimed: 6 }),
  chatTypingBlock({ wpm: null, correctionsPct: null, repliesTimed: 2, notTimed: "something new" }),
];
for (const [i, block] of MIRROR_BLOCKS.entries()) {
  const mine = chatTypingOf(block);
  const server = readChatTyping(block);
  const same = mine === null || server === null
    ? mine === server
    : mine.wpm === server.wpm && mine.correctionsPct === server.correctionsPct && mine.medianReplySeconds === server.medianReplySeconds &&
      mine.typosPer100Words === server.typosPer100Words && mine.repliesTimed === server.repliesTimed && mine.minWpm === server.minWpm &&
      mine.maxMedianReplySeconds === server.maxMedianReplySeconds && mine.enoughToTime === server.enoughToTime &&
      mine.below.includes("speed") === server.speedBelow && mine.below.includes("reply_time") === server.replyTimeBelow &&
      mine.notTimed === server.notTimed && mine.arrivedWithoutTyping === server.arrivedWithoutTyping && mine.pasteLike === server.pasteLike &&
      mine.line === chatTypingText(server) && mine.line === chatTypingLine(mine);
  check(`block ${i + 1}: the record and the scorecard read it the same way`, same, JSON.stringify({ mine, server }));
}

// What the hiring team sees.
check("the list row draws the typing line under the chat practice, uncut, amber only when it counts",
  /entry\.detail\?\.kind === "chat_simulation" \? entry\.detail\.typing : null/.test(listSrc) && /chatTypingNeedsALook\(chatTyping\)/.test(listSrc) &&
    /<span className="break-words">\{chatTyping\.line\}<\/span>/.test(listSrc) && /chatTyping\?\.line \?\? null/.test(listSrc));
check("the sheet shows it in the chat practice's own section", /\{detail\.typing && <ChatTypingSection typing=\{detail\.typing\} \/>\}/.test(sheet) && /<Section title="Typing in the chat">/.test(sheet) && /\{typing\.line\}/.test(sheet));
check("…with the bars, 'not enough typing to time' as not a fail, and where each figure was measured",
  /The job asks for \$\{Math\.round\(typing\.minWpm\)\} WPM or more/.test(sheet) && /That is not a fail\./.test(sheet) && /timed on their computer; reply time by our server/.test(sheet));
check("…and why no speed was timed, by its real cause (too short, arrived without typing, the page did not time it)",
  /typing\.notTimed === "arrived_without_typing"/.test(sheet) && /typing\.notTimed === "not_sent"/.test(sheet) && /typing\.notTimed === "too_short"/.test(sheet) && /each pause counts as 1 s at most/.test(sheet));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
