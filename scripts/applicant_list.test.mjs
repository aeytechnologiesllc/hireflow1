#!/usr/bin/env node
/**
 * The Applicants list (docs/APPLICANTS-LIST.md): src/cockpit/lib/applicantList.ts,
 * the slim load in src/cockpit/hooks/useApplicantList.ts and the in-place live
 * merge in src/cockpit/hooks/useEmployerLiveSync.ts.
 *
 * The owner, 2026-10-06: "Imagine I have 105 applicants. It's going to become a
 * nightmare … I can actually filter those out." These checks prove contract §5:
 *  - every applicant is in exactly one tab, for every status and live state;
 *  - the dots come from the RECORD, never from position, on the two real rows
 *    of the live Zulu job (job 02f91311, read 2026-10-06, names replaced by
 *    "Candidate 1" / "CANDIDATE 2", no emails, phones or free-text answers):
 *    Candidate 1's connection check is skipped (the job gained it after she
 *    passed), typing / chat / interview are below the bar, 6 flags; CANDIDATE 2
 *    is on the skills check with 5 flags from an attempt staff reset;
 *  - the one line, last active, score words, every filter, sort and search,
 *    the country normaliser, the URL round trip and the old links;
 *  - the slim load pages past PostgREST's 1,000-row cap and asks for profiles
 *    150 at a time, with no job embed and no grading, context or draft;
 *  - the live sync merges an UPDATE into the list in place with no refetch,
 *    and refetches it for an INSERT, a DELETE, a row it lacks, a cut-short
 *    payload and the reconnect catch-up.
 *
 * The lib is loaded the way scripts/assessment_record.test.mjs loads the
 * record builder ("@/" mapped to src/ by a resolve hook; Node 24 strips the
 * types). The two hook files are bundled with esbuild, their Supabase client
 * and auth hooks stubbed. Times are worded in UTC here (TZ below).
 *
 * Run with: node scripts/applicant_list.test.mjs
 */
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

process.env.TZ = "UTC";

// Decoded, so a checkout whose path has a space in it works too.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = pathToFileURL(path.join(ROOT, "src", specifier.slice(2))).href;
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

const L = await import(pathToFileURL(path.join(ROOT, "src/cockpit/lib/applicantList.ts")).href);
const { buildAssessmentRecord, withReopens } = await import(pathToFileURL(path.join(ROOT, "src/cockpit/lib/assessmentRecord.ts")).href);
const P = await import(pathToFileURL(path.join(ROOT, "src/cockpit/lib/applicantProfile.ts")).href);

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
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = (v) => JSON.stringify(v);

/* ── The live Zulu job and its two real applicants (read-only, 2026-10-06) ── */

const JOB_ID = "02f91311-a3a4-461c-a52d-5893cef7a9f3";
const JOB = {
  id: JOB_ID,
  title: "Chat Support Team Leader (Zulu Royal & Zulu Rush)",
  passing_score: 60,
  required_wpm: 45,
  processing_mode: "auto",
  updated_at: "2026-10-06T14:45:10.071363+00:00",
  workflow_steps: [
    { id: "step_connection", type: "equipment_check", title: "Computer and connection", config: { max_latency_ms: 200, min_upload_mbps: 3, min_download_mbps: 10 }, required: true },
    { id: "step_typing", type: "typing_test", title: "Typing speed and accuracy", config: { min_wpm: 45, min_accuracy_percent: 95 }, required: true },
    {
      id: "step_chat",
      type: "chat_simulation",
      title: "Player chat practice",
      config: { scenarios: [{ id: "zulu-rigged", customerName: "Devin", scenario: "Devin lost $200 tonight and says the game is rigged." }], minMessages: 5 },
      required: true,
    },
    { id: "step_interview", type: "chat_interview", title: "Written interview", config: {}, required: true },
  ],
  // The live form's questions (the job has gained q12–q14 since both applied).
  application_questions: [
    { id: "q1", type: "text", question: "Full name" },
    { id: "q2", type: "email", question: "Email address" },
    { id: "q3", type: "tel", question: "Phone number (WhatsApp if you have it)" },
    { id: "q4", type: "text", question: "Country and city you will work from" },
    { id: "q5", type: "multi_select", question: "Which shifts can you cover, in US Eastern time? Pick every one that works." },
    { id: "q6", type: "select", question: "How many hours a week can you work?" },
    { id: "q7", type: "select", question: "Do you have your own computer and a reliable internet connection for chat work?" },
    { id: "q8", type: "select", question: "How would you rate your written English?" },
    { id: "q9", type: "textarea", question: "Describe any customer support or chat support experience you have (apps, games, call centers, online shops)." },
    { id: "q12", type: "textarea", question: "Tell us about a team you have led, coached or trained: how many people, for how long, and one problem you fixed." },
    { id: "q13", type: "textarea", question: "Tell us about a time the rules, tools or way of working changed suddenly at your job." },
    { id: "q14", type: "select", question: "This is a working lead role. Is that what you're looking for?" },
    { id: "q10", type: "textarea", question: "Why do you want this job, and what makes you good with upset people?" },
    { id: "q11", type: "textarea", question: "Have you ever played or supported online sweepstakes or social casino games?" },
  ],
  // The job's quiz was rewritten after Candidate 1 took it (zq* → zr*).
  quiz_questions: Array.from({ length: 10 }, (_, i) => ({ id: `zr${i + 1}`, type: "multiple_choice", question: `Quiz question ${i + 1}`, options: ["A", "B", "C", "D"] })),
};

/** The form as both sent it, with the name, email, phone and free text replaced. */
function formAnswers(name, country, { phoneType = "tel", multi = false } = {}) {
  return [
    { type: "text", answer: name, question: "Full name", questionId: "q1" },
    { type: "email", answer: "(email removed)", question: "Email address", questionId: "q2" },
    { type: phoneType, answer: "(phone removed)", question: "Phone number (WhatsApp if you have it)", questionId: "q3" },
    { type: "text", answer: country, question: "Country and city you will work from", questionId: "q4" },
    multi
      ? {
          type: "multi_select",
          answer: "Daytime, 8am to 4pm Eastern; Evening, 4pm to midnight Eastern; Overnight, midnight to 8am Eastern",
          question: "Which shifts can you cover, in US Eastern time? Pick every one that works.",
          selected: ["Daytime, 8am to 4pm Eastern", "Evening, 4pm to midnight Eastern", "Overnight, midnight to 8am Eastern"],
          questionId: "q5",
        }
      : { type: "select", answer: "Daytime, 8am to 4pm Eastern", question: "Which shift can you cover, in US Eastern time?", questionId: "q5" },
    { type: "select", answer: "40 or more", question: "How many hours a week can you work?", questionId: "q6" },
    { type: "select", answer: "Yes", question: "Do you have your own computer and a reliable internet connection for chat work?", questionId: "q7" },
    { type: "select", answer: "Native or fluent", question: "How would you rate your written English?", questionId: "q8" },
    { type: "textarea", answer: "(answer removed)", question: "Describe any customer support or chat support experience you", questionId: "q9" },
    { type: "textarea", answer: "(answer removed)", question: "Why do you want this job, and what makes you good with upset", questionId: "q10" },
    { type: "textarea", answer: "(answer removed)", question: "Have you ever played or supported online sweepstakes or soci", questionId: "q11" },
  ];
}

const C1_PICKS = [1, 1, 1, 1, 0, 0, 2, 0, 0, 1];
const C1_INTERVIEW_TIMES = ["15:53:41.677", "15:54:57.064", "15:55:01.043", "15:55:59.663", "15:56:03.646", "15:56:38.076", "15:56:42.539", "15:57:44.583", "15:57:48.406"];

/** Candidate 1 (0ccadfc5…): every test done before the connection check
 *  existed; Ava recommends declining (34, final). */
const CANDIDATE_1 = {
  id: "0ccadfc5-130e-45ea-9a43-745e049242b3",
  job_id: JOB_ID,
  candidate_id: "c0000000-0000-4000-8000-000000000001",
  status: "reviewing",
  phase: "step_interview",
  created_at: "2026-10-05T15:39:19.619814+00:00",
  updated_at: "2026-10-05T15:58:41.256251+00:00",
  ai_score: 34,
  ai_scorecard: {
    overallScore: 34,
    decisionState: "ready_for_decision",
    recommendedAction: "reject",
    evidenceFloorMet: true,
    hardRejectReason: "A stated non-negotiable or deal-breaker appears to conflict with the application",
    riskFlags: [
      "Resume could not be analyzed",
      "Overall score is below the passing threshold",
      "Typing test result of 38 WPM is below the explicit 45 WPM minimum.",
    ],
    pendingHighSignalPhases: [],
  },
  resume_url: null,
  voice_interview_result: null,
  notes: JSON.stringify({
    quiz: {
      type: "quiz",
      score: 100,
      total: 10,
      passed: true,
      correct: 10,
      answers: C1_PICKS.map((pick, i) => ({ question: `Quiz question ${i + 1}`, isCorrect: true, questionId: `zq${i + 1}`, questionType: "multiple_choice", selectedAnswer: pick, selectedAnswerText: `Option ${pick + 1}` })),
      completedAt: "2026-10-05T15:45:43.768419+00:00",
      totalViolations: 0,
      violationSummary: "No violations detected",
      antiCheatViolations: [],
    },
    quizResult: { score: 100, total: 10, passed: true, correct: 10 },
    applicationAnswers: formAnswers("Candidate 1", "Phillipines"),
    typingTestResult: { wpm: 38, accuracy: 85, score: 72, passed: false, requiredWpm: 45, tabSwitches: 0, violations: [] },
    _trusted: {
      step_typing: { stepType: "typing_test", completedAt: "2026-10-05T15:47:40.146Z" },
      step_chat: { stepType: "chat_simulation", completedAt: "2026-10-05T15:51:46.150Z" },
      step_interview: { stepType: "chat_interview", completedAt: "2026-10-05T15:57:59.597Z" },
    },
    step_typing: { type: "typing_test", wpm: 38, accuracy: 85, score: 72, passed: false, requiredWpm: 45, tabSwitches: 0, violations: [], completedAt: "2026-10-05T15:47:40.116Z" },
    chatSimulationResult: {
      scenario: "Devin lost $200 tonight and says the game is rigged.",
      messageCount: 11,
      score: 18,
      empathy: 15,
      problemSolving: 12,
      strengths: ["(removed)"],
      improvements: ["(removed)"],
      completed: true,
      antiCheatSummary: { hasViolations: true, violationCount: 3, tabSwitches: 2, copyPasteAttempts: 1 },
    },
    chatInterviewResult: {
      messages: C1_INTERVIEW_TIMES.map((t, i) => ({ role: i % 2 ? "user" : "assistant", content: "(message)", timestamp: `2026-10-05T${t}Z` })),
      duration: "4:11",
      questionCount: 4,
      violations: [
        { type: "tab_switch", timestamp: "2026-10-05T15:53:41.072Z", details: "Window lost focus" },
        { type: "tab_switch", timestamp: "2026-10-05T15:53:50.456Z", details: "Window lost focus" },
        { type: "tab_switch", timestamp: "2026-10-05T15:57:14.643Z", details: "Window lost focus" },
      ],
      evaluation: { score: 25, credibilityRating: "Medium", recommendation: "No Hire" },
    },
  }),
  profiles: { user_id: "c0000000-0000-4000-8000-000000000001", full_name: "Candidate 1", email: null, avatar_url: null },
};

/** CANDIDATE 2 (dc2d059f…): sent the form, then staff reset her skills check
 *  (the attempt that raised 5 flags is superseded); 48 so far. */
const CANDIDATE_2 = {
  id: "dc2d059f-90fb-46b9-88ad-5f45f6bf0463",
  job_id: JOB_ID,
  candidate_id: "c0000000-0000-4000-8000-000000000002",
  status: "reviewing",
  phase: "quiz",
  created_at: "2026-10-05T23:14:44.337388+00:00",
  updated_at: "2026-10-05T23:16:36.425614+00:00",
  ai_score: 48,
  ai_scorecard: {
    overallScore: 48,
    decisionState: "needs_more_evidence",
    recommendedAction: "review",
    evidenceFloorMet: false,
    hardRejectReason: null,
    riskFlags: ["Resume could not be analyzed", "Overall score is below the passing threshold"],
    pendingHighSignalPhases: ["quiz", "chat simulation", "chat interview", "typing test"],
  },
  resume_url: null,
  voice_interview_result: null,
  notes: JSON.stringify({ applicationAnswers: formAnswers("CANDIDATE 2", "PHILLIPINES", { phoneType: "phone", multi: true }) }),
  profiles: { user_id: "c0000000-0000-4000-8000-000000000002", full_name: "CANDIDATE 2", email: null, avatar_url: null },
};

const CANDIDATE_2_SESSIONS = [
  {
    id: "69174ce1-c7a5-43f3-9862-ae74f11c1816",
    application_id: CANDIDATE_2.id,
    job_id: JOB_ID,
    step_id: "application",
    step_type: "application",
    attempt: 1,
    status: "completed",
    end_reason: "submitted",
    started_at: "2026-10-05T23:14:47.902054+00:00",
    last_activity_at: "2026-10-05T23:16:04.233525+00:00",
    hidden_at: null,
    ended_at: "2026-10-05T23:16:04.233525+00:00",
    progress: { total: 11, client: { screen: "form" }, answered: 11, draft_saved_at: "2026-10-05T23:16:03.767466+00:00" },
    integrity_summary: { total: 1, counts: { right_click: 1 }, away_ms: 0, dropped: 0, short_away: 0 },
    updated_at: "2026-10-05T23:16:04.233525+00:00",
    draft: { q1: "CANDIDATE 2", q2: "(email removed)", q3: "(phone removed)", q4: "PHILLIPINES", q6: "40 or more", q7: "Yes", q8: "Native or fluent" },
  },
  {
    id: "4e65f1fe-a0fe-4945-8df1-8c725662d312",
    application_id: CANDIDATE_2.id,
    job_id: JOB_ID,
    step_id: "quiz",
    step_type: "quiz",
    attempt: 1,
    status: "superseded",
    end_reason: "staff_reset",
    started_at: "2026-10-05T23:16:07.678056+00:00",
    last_activity_at: "2026-10-05T23:25:11.174443+00:00",
    hidden_at: null,
    ended_at: "2026-10-05T23:32:46.462388+00:00",
    progress: { total: 10, client: { screen: "questions" }, current_index: 9, current_question_id: "zq10" },
    integrity_summary: { total: 5, counts: { tab_hidden: 1, window_blur: 3, screenshot_suspected: 1 }, away_ms: 562476, dropped: 0, short_away: 0 },
    updated_at: "2026-10-05T23:32:46.462388+00:00",
  },
];

/* ── Invented applicants for every other state (same job, plus a short one) ── */

/** Tuesday 2026-10-06, noon UTC. */
const NOW = Date.parse("2026-10-06T12:00:00Z");
const ago = (ms) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HR = 60 * MIN;

const CONNECTION_OK = { downloadMbps: 28.4, uploadMbps: 9.1, latencyMs: 42, measuredBy: "server", runs: 1, usingThisComputer: "yes", deviceKind: "computer", bars: { minDownloadMbps: 10, minUploadMbps: 3, maxLatencyMs: 200 }, meetsBars: true, below: [] };

/** A form sent, the skills check passed, and whichever results are given. */
function notesWith(name, country, results = {}, trustedAt = {}) {
  return JSON.stringify({
    applicationAnswers: formAnswers(name, country),
    quizResult: { score: 90, total: 10, passed: true, correct: 9 },
    ...results,
    _trusted: Object.fromEntries(Object.entries(trustedAt).map(([step, at]) => [step, { completedAt: at }])),
  });
}
const PASSING = {
  equipmentCheckResult: CONNECTION_OK,
  typingTestResult: { wpm: 62, accuracy: 97, score: 88, passed: false, requiredWpm: 45 },
  chatSimulationResult: { score: 82, empathy: 80, problemSolving: 84, completed: true },
  chatInterviewResult: { score: 80, recommendation: "Hire" },
};

let seq = 0;
function app(name, fields) {
  seq += 1;
  const id = `a0000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
  return {
    id,
    job_id: JOB_ID,
    candidate_id: `c1000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    status: "reviewing",
    phase: "application",
    created_at: ago(2 * HR),
    updated_at: ago(HR),
    ai_score: null,
    ai_scorecard: null,
    resume_url: null,
    voice_interview_result: null,
    notes: null,
    profiles: { user_id: `c1000000-0000-4000-8000-${String(seq).padStart(12, "0")}`, full_name: name, email: null, avatar_url: null },
    ...fields,
  };
}
function session(appRow, stepId, stepType, fields) {
  seq += 1;
  return {
    id: `50000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    application_id: appRow.id,
    job_id: appRow.job_id,
    step_id: stepId,
    step_type: stepType,
    attempt: 1,
    status: "active",
    end_reason: null,
    started_at: ago(30 * MIN),
    last_activity_at: ago(MIN),
    hidden_at: null,
    ended_at: null,
    progress: {},
    integrity_summary: null,
    updated_at: ago(MIN),
    ...fields,
  };
}
const soFar = (score) => ({ ai_score: score, ai_scorecard: { overallScore: score, decisionState: "needs_more_evidence", recommendedAction: "review" } });
const final = (score, recommendedAction = "review") => ({ ai_score: score, ai_scorecard: { overallScore: score, decisionState: "ready_for_decision", recommendedAction } });

const ADA = app("Ada Okafor", { phase: "step_typing", created_at: ago(3 * HR), notes: notesWith("Ada Okafor", "Lagos, Nigeria", { equipmentCheckResult: CONNECTION_OK }), ...soFar(64), profiles: { user_id: "u-ada", full_name: "Ada Okafor", email: "ada@example.com", avatar_url: null } });
const BEN = app("Ben Castillo", { phase: "quiz", created_at: ago(40 * MIN), notes: JSON.stringify({ applicationAnswers: formAnswers("Ben Castillo", "Davao, Philippines") }) });
const CARA = app("Cara Hernández", {
  phase: "step_chat",
  created_at: ago(26 * HR),
  notes: notesWith("Cara Hernández", "Guadalajara, Mexico", { equipmentCheckResult: CONNECTION_OK, typingTestResult: { wpm: 40, accuracy: 96, score: 60, passed: false, requiredWpm: 45 } }),
  ...soFar(58),
});
const DEV = app("Dev Mwangi", { phase: "step_typing", created_at: ago(5 * HR), notes: notesWith("Dev Mwangi", "Mombasa, Kenya", { equipmentCheckResult: CONNECTION_OK }), ...soFar(66) });
const EVE = app("Eve Bello", { status: "in_progress", phase: "application", created_at: ago(5 * MIN), notes: null });
const FINN = app("Finn Tan", { status: "in_progress", phase: "application", created_at: ago(3 * HR), notes: null });
const GIA = app("Gia Siddiqui", { phase: "review", created_at: ago(30 * HR), notes: notesWith("Gia Siddiqui", "Lahore, Pakistan", PASSING, { step_interview: ago(40 * MIN) }), ...final(86, "advance") });
const HAL = app("Hal Wanjiru", {
  status: "interview",
  phase: "review",
  created_at: ago(28 * HR),
  notes: notesWith("Hal Wanjiru", "Nairobi, Kenya", { ...PASSING, equipmentCheckResult: { ...CONNECTION_OK, uploadMbps: 1.2, meetsBars: false, below: ["upload"] } }),
  ...final(71, "advance"),
});
const IVY = app("Ivy Reyes", { status: "offered", phase: "review", updated_at: "2026-10-05T09:00:00Z", notes: notesWith("Ivy Reyes", "Cebu, Philippines", PASSING), ...final(75, "advance") });
const JON = app("Jon Riaz", { status: "hired", phase: "review", notes: notesWith("Jon Riaz", "Karachi, Pakistan", PASSING), ...final(88, "advance") });
const KAI = app("Kai Mendoza", {
  status: "rejected",
  phase: "step_chat",
  created_at: ago(6 * 24 * HR),
  updated_at: "2026-10-01T09:00:00Z",
  notes: JSON.stringify({
    applicationAnswers: formAnswers("Kai Mendoza", "Bogotá, Colombia"),
    quizResult: { score: 40, total: 10, passed: false, correct: 4 },
    equipmentCheckResult: { ...CONNECTION_OK, deviceKind: "phone", downloadMbps: 6.2, meetsBars: false, below: ["download"] },
    typingTestResult: { wpm: 50, accuracy: 96, score: 70, passed: false, requiredWpm: 45 },
  }),
  ...final(41, "reject"),
});
const LEA = app("Léa Dubois", { phase: "step_typing", created_at: ago(4 * HR), notes: notesWith("Léa Dubois", "Casablanca, Morocco", { equipmentCheckResult: CONNECTION_OK }), ...soFar(55) });
const MO = app("Mo Rahman", { status: "pending", phase: "step_typing", created_at: ago(48 * HR), notes: notesWith("Mo Rahman", "Dhaka, Bangladesh", { equipmentCheckResult: CONNECTION_OK, typingTestResult: PASSING.typingTestResult }, { step_typing: ago(47 * HR) }), ...soFar(52) });

/** A second, shorter job: no skills check, one typing test, and a form that asks "where" differently. */
const JOB_B = {
  id: "0b000000-0000-4000-8000-000000000002",
  title: "Night chat agent",
  passing_score: 60,
  required_wpm: 40,
  updated_at: "2026-10-01T00:00:00Z",
  workflow_steps: [{ id: "step_typing_b", type: "typing_test", title: "Typing test", config: { min_wpm: 40, min_accuracy_percent: 90 } }],
  application_questions: [{ id: "w1", type: "text", question: "Where will you work from?" }],
  quiz_questions: [],
};
const NOOR = app("Noor Aziz", {
  job_id: JOB_B.id,
  phase: "review",
  created_at: ago(10 * HR),
  notes: JSON.stringify({
    applicationAnswers: [{ type: "text", answer: "Cebu, PH", question: "Where will you work from?", questionId: "w1" }],
    typingTestResult: { wpm: 55, accuracy: 95, score: 80, passed: false, requiredWpm: 40 },
  }),
  ...final(77, "review"),
});

const SESSIONS = [
  ...CANDIDATE_2_SESSIONS,
  session(ADA, "step_typing", "typing_test", { started_at: ago(2 * MIN), last_activity_at: ago(30_000) }),
  session(BEN, "quiz", "quiz", { last_activity_at: ago(6 * MIN), progress: { current_index: 5, total: 10 } }),
  session(CARA, "step_chat", "chat_simulation", {
    started_at: ago(20 * HR + 5 * MIN),
    last_activity_at: ago(20 * HR),
    progress: { candidate_turns: 3, assistant_turns: 4 },
    integrity_summary: { counts: { tab_hidden: 2, paste: 1 }, away_ms: 30_000, short_away: 0 },
  }),
  session(DEV, "step_typing", "typing_test", { last_activity_at: ago(4 * MIN), hidden_at: ago(3 * MIN) }),
  session(EVE, "application", "application", { started_at: ago(5 * MIN), last_activity_at: ago(30_000), progress: { answered: 3, total: 11 }, draft: { q1: "Eve Bello", q4: "Kingston, Jamaica" } }),
  session(LEA, "step_typing", "typing_test", { status: "grading", last_activity_at: ago(5 * MIN) }),
];
const INTERVIEWS = [{ application_id: HAL.id, scheduled_at: "2026-10-08T15:00:00Z", status: "scheduled" }];
const APPS = [CANDIDATE_1, CANDIDATE_2, ADA, BEN, CARA, DEV, EVE, FINN, GIA, HAL, IVY, JON, KAI, LEA, MO, NOOR];

const build1 = L.createApplicantRowBuilder();
const rows = build1({ apps: APPS, sessions: SESSIONS, reopens: [], jobs: [JOB, JOB_B], interviews: INTERVIEWS, now: NOW });
const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
const names = (list) => list.map((r) => r.name).sort();
const dots = (r) => r.dots.map((d) => d.state).join(" ");

/* ── 1. The two real applicants ────────────────────────────────────────── */

console.log("\n1. Candidate 1 and CANDIDATE 2, as the live job reads them");
{
  const c1 = byName["Candidate 1"];
  check("Candidate 1: seven dots, the connection check skipped, typing / chat / interview below the bar, Decision on", dots(c1) === "done done skipped below below below now", dots(c1));
  check("…the dots are the job's own steps in order", eq(c1.dots.map((d) => d.stepId), ["application", "quiz", "step_connection", "step_typing", "step_chat", "step_interview", "decision"]));
  check("…finished every test, not decided: Needs review", c1.finished && !c1.decided && c1.tab === "needs-review" && c1.chip?.label === "Needs review" && c1.chip.tone === "amber");
  check("…the line says Ava suggests declining, in amber", c1.lineText === "Finished every test · Ava suggests: decline" && c1.line.at(-1).tone === "amber", c1.lineText);
  check("…6 flags, from leaving the window and a paste", c1.flags.count === 6 && eq(c1.flags.kinds, ["left-window", "copy-paste"]), show(c1.flags));
  check("…the flag tooltip lists them", c1.flags.tooltip === "Left the window 5× · 1 copy or paste", c1.flags.tooltip);
  check("…below the bar on typing and chat practice (the interview has no filter)", eq(c1.below, ["typing", "chat-practice"]), show(c1.below));
  check("…34 is final (ready_for_decision), ink", c1.score === 34 && c1.scoreKind === "final" && c1.scoreTone === "ink" && c1.scoreWords === null);
  check("…from Philippines (her answer was 'Phillipines')", c1.country === "Philippines", c1.country);
  check("…last active = her last result (no attempts on file), never updated_at", c1.lastActiveAt === "2026-10-05T15:57:59.597Z", c1.lastActiveAt);
  check("…'Done 20 h ago', 'applied 20 h ago'", c1.activeWords === "Done 20 h ago" && c1.appliedWords === "applied 20 h ago", `${c1.activeWords} / ${c1.appliedWords}`);
  check("…not where-filterable to a step once finished", c1.stepIndex === null && c1.currentStepId === null && c1.stepTotal === 7);

  const c2 = byName["CANDIDATE 2"];
  check("CANDIDATE 2: on the skills check (ring), nothing after it reached", dots(c2) === "done now todo todo todo todo todo", dots(c2));
  check("…Part-way: no live attempt (hers was reset)", c2.tab === "part-way" && c2.chip === null && c2.liveState === null);
  check("…the line: 'Skills check · step 2 of 7 · not started'", c2.lineText === "Skills check · step 2 of 7 · not started", c2.lineText);
  check("…5 flags, all from the attempt staff reset", c2.flags.count === 5 && eq(c2.flags.kinds, ["left-window"]), show(c2.flags));
  check("…the tooltip in the bell card's words", c2.flags.tooltip === "Left the window 4 times (9m 22s away) · possible screenshot ×1", c2.flags.tooltip);
  check("…48 so far, ink (under 50)", c2.score === 48 && c2.scoreKind === "so_far" && c2.scoreWords === "so far" && c2.scoreTone === "ink");
  check("…from Philippines ('PHILLIPINES')", c2.country === "Philippines");
  check("…last active = the reset attempt's last move (any attempt counts)", c2.lastActiveAt === "2026-10-05T23:25:11.174Z", c2.lastActiveAt);
  check("…'Last active 12 h ago'", c2.activeWords === "Last active 12 h ago", c2.activeWords);
  check("…applied = when Apply was pressed (created_at), the moment the profile's header and timeline show", c2.appliedAt === "2026-10-05T23:14:44.337Z", c2.appliedAt);
  check("…where they are: the skills check", c2.currentStepId === "quiz" && c2.stepIndex === 1);

  // The list and the full profile read the same record.
  const profileRecord = buildAssessmentRecord({ ...CANDIDATE_2, jobs: JOB }, { sessions: withReopens(CANDIDATE_2_SESSIONS, []), now: NOW });
  check("the row's flag count is the profile's", profileRecord.integrityTotal === c2.flags.count);
  const direct = L.listRowFor({ ...CANDIDATE_2, jobs: JOB }, profileRecord, L.journeyForJob(JOB), NOW, { sessions: CANDIDATE_2_SESSIONS });
  check("listRowFor(app, record, journey, now) gives the same row as the builder", direct.lineText === c2.lineText && dots(direct) === dots(c2) && direct.lastActiveAt === c2.lastActiveAt);
  const openOnly = buildAssessmentRecord({ ...CANDIDATE_2, jobs: JOB }, { sessions: withReopens(CANDIDATE_2_SESSIONS.filter((s) => s.status === "active"), []), now: NOW });
  check("…and loading only open attempts would have said 0 flags (why the list loads every attempt)", openOnly.integrityTotal === 0);
}

/* ── 2. Every other state ──────────────────────────────────────────────── */

console.log("\n2. One row per state");
{
  const r = byName;
  check("typing live: 'Typing speed and accuracy · step 4 of 7 · live', live in jade", r["Ada Okafor"].lineText === "Typing speed and accuracy · step 4 of 7 · live" && r["Ada Okafor"].line.at(-1).tone === "jade", r["Ada Okafor"].lineText);
  check("…its ring is on the typing test", dots(r["Ada Okafor"]) === "done done done now todo todo todo" && !r["Ada Okafor"].dots[3].left);
  check("…'Active now' with the avatar's live dot", r["Ada Okafor"].activeWords === "Active now" && r["Ada Okafor"].activeTone === "jade" && r["Ada Okafor"].liveNow);
  check("quiz live: 'Skills check · question 6 of 10 · step 2 of 7 · live'", r["Ben Castillo"].lineText === "Skills check · question 6 of 10 · step 2 of 7 · live", r["Ben Castillo"].lineText);
  check("…'Active 6 min ago', no live dot past two minutes", r["Ben Castillo"].activeWords === "Active 6 min ago" && !r["Ben Castillo"].liveNow);
  check("…not scored yet", r["Ben Castillo"].score === null && r["Ben Castillo"].scoreKind === "none" && r["Ben Castillo"].scoreWords === "not scored yet");
  check("left: 'Left at player chat practice, reply 3' in amber", r["Cara Hernández"].lineText === "Left at player chat practice, reply 3" && r["Cara Hernández"].line[0].tone === "amber", r["Cara Hernández"].lineText);
  check("…its ring is drawn as left, the typing dot below the bar", dots(r["Cara Hernández"]) === "done done done below now todo todo" && r["Cara Hernández"].dots[4].left);
  check("…'Last active 20 h ago' (the mockup's words; the line already says Left), Part-way", r["Cara Hernández"].activeWords === "Last active 20 h ago" && r["Cara Hernández"].tab === "part-way", r["Cara Hernández"].activeWords);
  check("…3 flags from the chat attempt", r["Cara Hernández"].flags.count === 3 && eq(r["Cara Hernández"].flags.kinds, ["left-window", "copy-paste"]));
  check("away: 'Away from the test for 3 min', still Taking tests now", r["Dev Mwangi"].lineText === "Away from the test for 3 min" && r["Dev Mwangi"].tab === "taking-tests", r["Dev Mwangi"].lineText);
  check("on the form, live: 'Filling in the form · 3 of 11 answered · live'", r["Eve Bello"].lineText === "Filling in the form · 3 of 11 answered · live" && r["Eve Bello"].tab === "taking-tests", r["Eve Bello"].lineText);
  check("…country from the form's draft, 'started 5 min ago'", r["Eve Bello"].country === "Jamaica" && r["Eve Bello"].appliedWords === "started 5 min ago" && r["Eve Bello"].onForm);
  check("on the form, quiet, no attempt: 'Filling in the form', Part-way, Unknown country", r["Finn Tan"].lineText === "Filling in the form" && r["Finn Tan"].tab === "part-way" && r["Finn Tan"].country === "Unknown");
  check("finished, Ava says interview: the suffix in jade", r["Gia Siddiqui"].lineText === "Finished every test · Ava suggests: interview" && r["Gia Siddiqui"].line.at(-1).tone === "jade");
  check("…'Done 40 min ago', 86 final in jade", r["Gia Siddiqui"].activeWords === "Done 40 min ago" && r["Gia Siddiqui"].scoreTone === "jade" && r["Gia Siddiqui"].scoreKind === "final");
  check("interview: chip Interview, 'Moved to interview', every dot done (connection below the bar)", r["Hal Wanjiru"].chip?.label === "Interview" && r["Hal Wanjiru"].lineText === "Moved to interview" && dots(r["Hal Wanjiru"]) === "done done below done done done done");
  check("…'Interview Thu 3 PM' when one is booked", r["Hal Wanjiru"].activeWords === "Interview Thu 3 PM", r["Hal Wanjiru"].activeWords);
  check("offered: chip Offer, 'Decided yesterday'", r["Ivy Reyes"].chip?.label === "Offer" && r["Ivy Reyes"].lineText === "Offer made" && r["Ivy Reyes"].activeWords === "Decided yesterday", r["Ivy Reyes"].activeWords);
  check("hired: chip Hired, on the Interview tab", r["Jon Riaz"].chip?.label === "Hired" && r["Jon Riaz"].tab === "interview");
  check("declined: chip Declined (crit), 'Declined', 'Decided Thu'", r["Kai Mendoza"].chip?.tone === "crit" && r["Kai Mendoza"].lineText === "Declined" && r["Kai Mendoza"].activeWords === "Decided Thu", r["Kai Mendoza"].activeWords);
  check("…decided before reaching chat: those dots are not reached, Decision done", dots(r["Kai Mendoza"]) === "done below below done todo todo done", dots(r["Kai Mendoza"]));
  check("…below the bar on the skills check, the connection, and ran on a phone", eq(r["Kai Mendoza"].below, ["skills-check", "connection", "phone"]), show(r["Kai Mendoza"].below));
  check("being checked: 'Typing speed and accuracy · checking the answers · step 4 of 7'", r["Léa Dubois"].lineText === "Typing speed and accuracy · checking the answers · step 4 of 7" && r["Léa Dubois"].tab === "taking-tests", r["Léa Dubois"].lineText);
  check("…'Active 5 min ago' in jade, inside the server's 7-minute claim", r["Léa Dubois"].activeWords === "Active 5 min ago" && r["Léa Dubois"].activeTone === "jade", r["Léa Dubois"].activeWords);
  check("parked on a finished step: no ring; the next step 'not opened yet' (the team's turn, as the profile says)", dots(r["Mo Rahman"]) === "done done done done todo todo todo" && r["Mo Rahman"].lineText === "Player chat practice · step 5 of 7 · not opened yet", `${dots(r["Mo Rahman"])} / ${r["Mo Rahman"].lineText}`);
  check("a shorter job has its own number of dots", r["Noor Aziz"].stepTotal === 3 && dots(r["Noor Aziz"]) === "done done now" && r["Noor Aziz"].jobTitle === "Night chat agent");
  check("…and its own 'where' question ('Cebu, PH' → Philippines)", r["Noor Aziz"].country === "Philippines");

  // One rule for the line: the profile's rail draws the same words from the
  // same record (journeyLineRuns), for every state above.
  const sessionsOf = (row) => SESSIONS.filter((x) => x.application_id === row.id);
  const disagree = rows.filter((row) => {
    const rail = P.journeyLine(P.journeyDots(row.record, row.status), row.status, {
      live: row.record.live,
      sessions: sessionsOf(row),
      recommendedAction: row.recommendedAction,
      now: NOW,
    });
    return rail !== row.lineText;
  });
  check("every row's line is the profile rail's summary, word for word", disagree.length === 0, disagree.map((r) => r.name).join(", "));

  // On the form and switched to another tab: the form is not a test.
  const eveAway = SESSIONS.map((x) => (x.application_id === EVE.id ? { ...x, hidden_at: ago(2 * MIN), last_activity_at: ago(3 * MIN) } : x));
  const away = L.createApplicantRowBuilder()({ apps: [EVE], sessions: eveAway, reopens: [], jobs: [JOB], now: NOW })[0];
  check("on the form, away: 'Away from the form for 2 min', amber, still Taking tests now", away.lineText === "Away from the form for 2 min" && away.line[0].tone === "amber" && away.tab === "taking-tests", `${away.lineText} / ${away.tab}`);
}

/* ── 3. Tabs: exactly one each ─────────────────────────────────────────── */

console.log("\n3. The tabs partition everyone");
{
  const counts = L.tabCounts(rows);
  check("All counts everyone", counts.all === rows.length && counts.all === 16);
  check("the five tabs add up to All", counts["needs-review"] + counts["taking-tests"] + counts["part-way"] + counts.interview + counts.declined === counts.all, show(counts));
  const members = (tab) => names(rows.filter((r) => r.tab === tab));
  check("Needs review", eq(members("needs-review"), ["Candidate 1", "Gia Siddiqui", "Noor Aziz"]), show(members("needs-review")));
  check("Taking tests now", eq(members("taking-tests"), ["Ada Okafor", "Ben Castillo", "Dev Mwangi", "Eve Bello", "Léa Dubois"]), show(members("taking-tests")));
  check("Part-way", eq(members("part-way"), ["CANDIDATE 2", "Cara Hernández", "Finn Tan", "Mo Rahman"]), show(members("part-way")));
  check("Interview (interview, offer, hired)", eq(members("interview"), ["Hal Wanjiru", "Ivy Reyes", "Jon Riaz"]));
  check("Declined", eq(members("declined"), ["Kai Mendoza"]));

  // Every status against every finished / live combination: one tab, in precedence.
  const statuses = ["in_progress", "pending", "reviewing", "interview", "offered", "hired", "rejected"];
  const lives = [null, "doing", "away", "checking", "left", "failed", "finished"];
  let ok = true;
  const bad = [];
  for (const status of statuses) {
    for (const finished of [false, true]) {
      for (const liveState of lives) {
        const tab = L.tabFor({ status, finished, liveState });
        const want =
          status === "rejected"
            ? "declined"
            : ["interview", "offered", "hired"].includes(status)
              ? "interview"
              : finished
                ? "needs-review"
                : ["doing", "away", "checking"].includes(liveState)
                  ? "taking-tests"
                  : "part-way";
        if (tab !== want || !L.APPLICANT_TABS.includes(tab) || tab === "all") {
          ok = false;
          bad.push(`${status}/${finished}/${liveState}→${tab}`);
        }
      }
    }
  }
  check(`tabFor places all ${statuses.length * 2 * lives.length} combinations in exactly one tab, by precedence`, ok, bad.join(", "));
  check("tab order on screen", eq(L.TAB_OPTIONS.map((o) => o.label), ["All", "Needs review", "Taking tests now", "Part-way", "Interview", "Declined"]));
}

/* ── 4. Filters, search, sort ──────────────────────────────────────────── */

console.log("\n4. Filters, search and sort");
{
  const S = (over) => ({ ...L.DEFAULT_LIST_STATE, ...over });
  const view = (over) => L.applyListState(rows, S(over), NOW);
  const got = (over) => names(view(over).matched);

  check("score 70 and up", eq(got({ score: "70-up" }), ["Gia Siddiqui", "Hal Wanjiru", "Ivy Reyes", "Jon Riaz", "Noor Aziz"]));
  check("score 50 and up", got({ score: "50-up" }).length === 10);
  check("score under 50 (a real low score, never the unscored)", eq(got({ score: "under-50" }), ["CANDIDATE 2", "Candidate 1", "Kai Mendoza"]));
  check("not scored yet = ai_score null", eq(got({ score: "not-scored" }), ["Ben Castillo", "Eve Bello", "Finn Tan"]));
  const counts = L.optionCounts(rows, S({}), "score", L.SCORE_OPTIONS.map((o) => o.value), NOW);
  check("the sheet's score counts", eq(counts, { any: 16, "70-up": 5, "50-up": 10, "under-50": 3, "not-scored": 3 }), show(counts));
  const inPH = L.optionCounts(rows, S({ country: "Philippines" }), "score", ["any", "70-up", "not-scored"], NOW);
  check("…counted with the other filters on", eq(inPH, { any: 5, "70-up": 2, "not-scored": 1 }), show(inPH));

  check("flags: no flags", !got({ flags: "none" }).includes("Candidate 1") && got({ flags: "none" }).length === 13);
  check("flags: left the test window", eq(got({ flags: "left-window" }), ["CANDIDATE 2", "Candidate 1", "Cara Hernández"]));
  check("flags: tried to copy or paste", eq(got({ flags: "copy-paste" }), ["Candidate 1", "Cara Hernández"]));
  check("flags: any flag", got({ flags: "any-flag" }).length === 3);

  check("below the bar on typing speed", eq(got({ below: "typing" }), ["Candidate 1", "Cara Hernández"]));
  check("below the bar on chat practice", eq(got({ below: "chat-practice" }), ["Candidate 1"]));
  check("below the bar on connection", eq(got({ below: "connection" }), ["Hal Wanjiru", "Kai Mendoza"]));
  check("below the bar on the skills check", eq(got({ below: "skills-check" }), ["Kai Mendoza"]));
  check("ran on a phone", eq(got({ below: "phone" }), ["Kai Mendoza"]));

  check("country", eq(got({ country: "Philippines" }), ["Ben Castillo", "CANDIDATE 2", "Candidate 1", "Ivy Reyes", "Noor Aziz"]));
  check("country Unknown", eq(got({ country: "Unknown" }), ["Finn Tan"]));
  const countries = L.countryOptions(rows);
  check("country options: All, most common first, Unknown last", countries[0].value === "all" && countries[1].value === "Philippines" && countries[1].count === 5 && countries.at(-1).value === "Unknown", show(countries.slice(0, 3)));

  check("applied today", got({ applied: "today" }).length === 9, show(got({ applied: "today" })));
  check("applied this week leaves out nobody here but the oldest", got({ applied: "week" }).length === 16 && got({ applied: "month" }).length === 16);

  check("where: the typing test", eq(got({ where: "step_typing" }), ["Ada Okafor", "Dev Mwangi", "Léa Dubois"]));
  check("where: chat practice (live or not)", eq(got({ where: "step_chat" }), ["Cara Hernández", "Mo Rahman"]));
  check("where: the skills check", eq(got({ where: "quiz" }), ["Ben Castillo", "CANDIDATE 2"]));
  check("where: the application", eq(got({ where: "application" }), ["Eve Bello", "Finn Tan"]));
  check("where: finished every test (any tab)", eq(got({ where: "finished" }), ["Candidate 1", "Gia Siddiqui", "Hal Wanjiru", "Ivy Reyes", "Jon Riaz", "Noor Aziz"]));
  const where = L.whereOptions([L.journeyForJob(JOB), L.journeyForJob(JOB_B)]);
  check("where options: Any step, each step by title, Finished every test", eq(where.map((o) => o.label), ["Any step", "Application", "Skills check", "Computer and connection", "Typing speed and accuracy", "Player chat practice", "Written interview", "Typing test", "Finished every test"]), show(where.map((o) => o.label)));

  check("search by name, any case", eq(got({ q: "candidate" }), ["CANDIDATE 2", "Candidate 1"]));
  check("search ignores accents", eq(got({ q: "lea dubois" }), ["Léa Dubois"]));
  check("search by email", eq(got({ q: "example.com" }), ["Ada Okafor"]));
  check("search by country", got({ q: "philipp" }).length === 5 && eq(got({ q: "NIGERIA" }), ["Ada Okafor"]));

  check("the tab and a filter together", eq(got({ tab: "needs-review", score: "70-up" }), ["Gia Siddiqui", "Noor Aziz"]));
  const scoped = L.applyListState(rows, S({ job: JOB_B.id, score: "70-up" }), NOW);
  check("the job (?roleId=) scopes the list and the tab counts", scoped.total === 1 && scoped.tabCounts.all === 1 && scoped.tabCounts["needs-review"] === 1);
  check("tab counts ignore every other filter", eq(view({ score: "70-up", q: "zzz" }).tabCounts, L.tabCounts(rows)));

  const byScore = view({ sort: "score" }).matched.map((r) => r.name);
  check("score, high to low", eq(byScore.slice(0, 5), ["Jon Riaz", "Gia Siddiqui", "Noor Aziz", "Ivy Reyes", "Hal Wanjiru"]), show(byScore));
  check("…unscored last, most recently active first", eq(byScore.slice(-3), ["Eve Bello", "Ben Castillo", "Finn Tan"]), show(byScore.slice(-3)));
  const newest = view({ sort: "newest" }).matched.map((r) => r.name);
  check("newest", newest[0] === "Eve Bello" && newest.at(-1) === "Kai Mendoza", show(newest));
  const active = view({ sort: "last-active" }).matched.map((r) => r.name);
  check("last active (ties by name)", eq(active.slice(0, 5), ["Ada Okafor", "Eve Bello", "Dev Mwangi", "Léa Dubois", "Ben Castillo"]), show(active.slice(0, 5)));

  check("words for the active filters", eq(L.filterWords(S({ score: "50-up", flags: "none", below: "phone", country: "Kenya", applied: "week", where: "step_typing" }), (id) => (id === "step_typing" ? "Typing speed and accuracy" : null)), [
    "at typing speed and accuracy",
    "score 50 and up",
    "no flags",
    "ran on a phone",
    "from Kenya",
    "applied this week",
  ]));
  check("the phone's Filters count", L.activeFilterCount(S({ score: "50-up" })) === 1 && L.activeFilterCount(S({ q: "x", job: "j", sort: "newest" })) === 0);

  // 25 at a time.
  const many = L.createApplicantRowBuilder()({
    apps: Array.from({ length: 60 }, (_, i) => ({ ...CANDIDATE_2, id: `b0000000-0000-4000-8000-${String(i).padStart(12, "0")}` })),
    sessions: [],
    jobs: [JOB],
    now: NOW,
  });
  const page1 = L.applyListState(many, S({}), NOW);
  check("25 drawn, 'Show 25 more' while more match", page1.shown.length === 25 && page1.total === 60 && page1.hasMore);
  const page3 = L.applyListState(many, S({ shown: 75 }), NOW);
  check("…all of them once shown passes the total", page3.shown.length === 60 && !page3.hasMore);
}

/* ── 4b. Typing measured in the chat practice (docs/TYPING-IN-CHAT.md) ──── */

console.log("\n4b. Typing measured in the chat practice");
{
  // The live job once step_typing is dropped: typing is measured while they
  // write their chat replies (notes.chatSimulationResult.typing).
  const JOB_T = { ...JOB, id: "0c000000-0000-4000-8000-000000000003", workflow_steps: JOB.workflow_steps.filter((st) => st.type !== "typing_test") };
  const typingBlock = ({ wpm = 47, correctionsPct = 6, medianReplySeconds = 38, repliesTimed = 6, bar = { minWpm: 40, maxMedianReplySeconds: 90 } } = {}) => {
    const below = [];
    if (wpm !== null && wpm < bar.minWpm) below.push("speed");
    if (medianReplySeconds !== null && medianReplySeconds > bar.maxMedianReplySeconds) below.push("reply_time");
    return { wpm, correctionsPct, medianReplySeconds, typosPer100Words: 1.2, repliesTimed, pasteLike: 0, bar, meetsBar: below.length ? false : wpm === null ? null : true, below, measuredBy: { speed: "page", replyTime: "server", typos: "grader" } };
  };
  const finishedOn = (job, name, chat, typing, extra = {}) =>
    app(name, {
      job_id: job.id,
      phase: "review",
      created_at: ago(9 * HR),
      notes: notesWith(name, "Accra, Ghana", {
        equipmentCheckResult: CONNECTION_OK,
        chatSimulationResult: { score: chat, empathy: chat, problemSolving: chat, completed: true, ...(typing ? { typing } : {}) },
        chatInterviewResult: { score: 80, recommendation: "Hire" },
        ...extra,
      }),
      ...final(75, "review"),
    });
  const TOM = finishedOn(JOB_T, "Tom Slow", 82, typingBlock({ wpm: 32, medianReplySeconds: 140 }));
  const UMA = finishedOn(JOB_T, "Uma Quick", 82, typingBlock({ wpm: 50, medianReplySeconds: 40 }));
  const VIC = finishedOn(JOB_T, "Vic Weakchat", 40, typingBlock({ wpm: 55, medianReplySeconds: 30 }));
  const WES = finishedOn(JOB_T, "Wes Waits", 82, typingBlock({ wpm: 47, medianReplySeconds: 150 }));
  const XIA = finishedOn(JOB_T, "Xia Brief", 82, typingBlock({ wpm: null, correctionsPct: null, repliesTimed: 2 }));
  const YUL = finishedOn(JOB_T, "Yul Older", 82, null);
  // The same slow chat typing on the job that still has its typing step,
  // with a typing test over its bar: nothing about that job changes.
  const ZED = finishedOn(JOB, "Zed Typist", 82, typingBlock({ wpm: 25, medianReplySeconds: 200 }), { typingTestResult: PASSING.typingTestResult });
  const tApps = [TOM, UMA, VIC, WES, XIA, YUL, ZED];
  const tRows = L.createApplicantRowBuilder()({ apps: tApps, sessions: [], reopens: [], jobs: [JOB, JOB_T], interviews: [], now: NOW });
  const tBy = Object.fromEntries(tRows.map((r) => [r.name, r]));
  const chatDot = (r) => r.dots.find((d) => d.stepType === "chat_simulation")?.state;

  check("a job with no typing step: the chat's typing under the bar is 'below the bar on typing', not on chat practice",
    eq(tBy["Tom Slow"].below, ["typing"]) && chatDot(tBy["Tom Slow"]) === "below", `${show(tBy["Tom Slow"].below)} ${chatDot(tBy["Tom Slow"])}`);
  check("…slow replies alone count too", eq(tBy["Wes Waits"].below, ["typing"]) && chatDot(tBy["Wes Waits"]) === "below", show(tBy["Wes Waits"].below));
  check("…at or over both bars: nothing, and the chat's dot is done", eq(tBy["Uma Quick"].below, []) && chatDot(tBy["Uma Quick"]) === "done");
  check("…a chat mark under the pass mark is still 'chat practice', and good typing is not 'typing'", eq(tBy["Vic Weakchat"].below, ["chat-practice"]), show(tBy["Vic Weakchat"].below));
  check("…not enough typing to time is never below the bar", eq(tBy["Xia Brief"].below, []) && chatDot(tBy["Xia Brief"]) === "done");
  check("…a chat graded before the typing was measured reads as before", eq(tBy["Yul Older"].below, []) && chatDot(tBy["Yul Older"]) === "done");
  check("a job with a typing step reads typing from its test: the chat's slow typing changes nothing",
    eq(tBy["Zed Typist"].below, []) && chatDot(tBy["Zed Typist"]) === "done", `${show(tBy["Zed Typist"].below)} ${chatDot(tBy["Zed Typist"])}`);

  const S = (over) => ({ ...L.DEFAULT_LIST_STATE, ...over });
  const tGot = (over) => names(L.applyListState(tRows, S(over), NOW).matched);
  check("the Typing filter finds them", eq(tGot({ below: "typing" }), ["Tom Slow", "Wes Waits"]), show(tGot({ below: "typing" })));
  check("the Chat practice filter keeps to the mark", eq(tGot({ below: "chat-practice" }), ["Vic Weakchat"]));
  check("the filter is called Typing (a typing test, or the typing measured in the chat)", L.BELOW_OPTIONS.find((o) => o.value === "typing")?.label === "Typing");
  check("…and its words say so", eq(L.filterWords(S({ below: "typing" }), () => null), ["below the bar on typing"]), show(L.filterWords(S({ below: "typing" }), () => null)));
}

/* ── 5. Country (contract §3) ──────────────────────────────────────────── */

console.log("\n5. Country");
{
  const cases = [
    ["PHILLIPINES", "Philippines"],
    ["Phillipines", "Philippines"],
    ["Manila, Philippines", "Philippines"],
    ["Accra, Ghana", "Ghana"],
    ["chennai, INDIA", "India"],
    ["Nigerria", "Nigeria"],
    ["côte d'ivoire", "Côte d’Ivoire"],
    ["USA", "United States"],
    ["uk", "United Kingdom"],
    ["PH", "Philippines"],
    ["Lagos", "Lagos"],
    ["springfield", "Springfield"],
    // A US address: the state, never a region code or a country it looks like.
    ["Atlanta, GA", "United States"],
    ["Los Angeles, CA", "United States"],
    ["Boston, MA", "United States"],
    ["Chicago, IL", "United States"],
    ["Portland, OR", "United States"],
    ["Indianapolis, IN", "United States"],
    ["Pittsburgh, PA", "United States"],
    ["Wilmington, DE", "United States"],
    ["Charlotte, NC", "United States"],
    ["Albany, NY", "United States"],
    ["Austin, Texas", "United States"],
    ["new york", "United States"],
    ["TX", "United States"],
    ["Regina, SK", "Canada"],
    // ...and a country that is also a state's name stays the country.
    ["Tbilisi, Georgia", "Georgia"],
    // Two letters on their own, or after a city, are a region code otherwise.
    ["Cebu, PH", "Philippines"],
    ["CA", "Canada"],
    // A city is never fuzzy-matched into a country.
    ["Siberia", "Siberia"],
    // No comma: the country among the words.
    ["Manila Philippines", "Philippines"],
    ["Philippines Manila", "Philippines"],
    ["Lagos Nigeria", "Nigeria"],
    ["Lahore Pakistan", "Pakistan"],
    ["Quezon City Philippines, 1100", "Philippines"],
    ["London UK", "United Kingdom"],
    ["Port Moresby Papua New Guinea", "Papua New Guinea"],
    ["NA", "Unknown"],
    ["   ", "Unknown"],
    [null, "Unknown"],
  ];
  for (const [input, want] of cases) check(`${show(input)} → ${want}`, L.normaliseCountry(input) === want, L.normaliseCountry(input));
  check("two countries equally close is not a match ('Austrlia')", L.normaliseCountry("Austrlia") === "Austrlia");
  check("short names never match loosely ('Nigr' is not Niger)", L.normaliseCountry("Nigr") === "Nigr");
  check("location questions are recognised", ["Country and city you will work from", "Where will you work from?", "Your location", "Which city do you live in?"].every(L.isLocationQuestion));
  check("…and other questions are not", !["Do you have your own computer and a reliable internet connection for chat work?", "Which shifts can you cover?", "Where did you hear about us?"].some(L.isLocationQuestion));
  const questions = JOB.application_questions;
  check("countryFrom: the answer to the job's question", L.countryFrom(formAnswers("x", "Lahore, Pakistan"), questions, null) === "Pakistan");
  check("…matched by the answer's own question words when the job's ids changed", L.countryFrom([{ questionId: "old7", question: "Country and city you will work from", answer: "Kenya" }], questions, null) === "Kenya");
  check("…else the form's draft", L.countryFrom([], questions, { q4: "Kingston, Jamaica" }) === "Jamaica");
  check("…else Unknown", L.countryFrom([], questions, { q1: "Someone" }) === "Unknown");
  const quiet = [
    { id: "w1", question: "Do you have a quiet location to work?" },
    { id: "w2", question: "Which country will you work from?" },
  ];
  check(
    "…a 'where' answer that is not a place is passed over ('Yes' to a quiet location, then Kenya)",
    L.countryFrom([{ questionId: "w1", question: quiet[0].question, answer: "Yes" }, { questionId: "w2", question: quiet[1].question, answer: "Kenya" }], quiet, null) === "Kenya",
  );
  check(
    "…a question naming the country is read before a looser 'location' one",
    L.countryFrom([{ questionId: "w1", question: quiet[0].question, answer: "Ghana" }, { questionId: "w2", question: quiet[1].question, answer: "Kenya" }], quiet, null) === "Kenya",
  );
  check(
    "…and a loose one counts only when it names a country ('Home' is not one)",
    L.countryFrom([{ questionId: "w9", question: "Your location", answer: "Home" }], [], null) === "Unknown" &&
      L.countryFrom([{ questionId: "w9", question: "Your location", answer: "Davao, Philippines" }], [], null) === "Philippines",
  );
}

/* ── 6. Words for times ────────────────────────────────────────────────── */

console.log("\n6. Words for times");
{
  check("ago words", eq([30_000, 6 * MIN, 20 * HR, 30 * HR, 3 * 24 * HR, 10 * 24 * HR].map((ms) => L.agoWords(NOW - ms, NOW)), ["just now", "6 min ago", "20 h ago", "yesterday", "3 days ago", "Sep 26"]));
  check("day words", eq([0, 1, 5, 9].map((d) => L.dayWords(NOW - d * 24 * HR, NOW)), ["today", "yesterday", "Thu", "Sep 27"]));
  check("clock words", eq(["2026-10-08T15:00:00Z", "2026-10-08T15:30:00Z", "2026-10-08T12:00:00Z", "2026-10-08T00:05:00Z"].map((t) => L.clockWords(Date.parse(t))), ["3 PM", "3:30 PM", "12 PM", "12:05 AM"]));
  check("interview words", eq(["2026-10-06T15:00:00Z", "2026-10-07T09:00:00Z", "2026-10-08T15:00:00Z", "2026-10-20T15:00:00Z"].map((t) => L.interviewWords(Date.parse(t), NOW)), ["Interview today 3 PM", "Interview tomorrow 9 AM", "Interview Thu 3 PM", "Interview Oct 20, 3 PM"]));
}

/* ── 7. The URL ────────────────────────────────────────────────────────── */

console.log("\n7. The URL");
{
  check("an empty URL is the default list", eq(L.parseListState(""), L.DEFAULT_LIST_STATE));
  const full = { tab: "needs-review", where: "step_typing", score: "50-up", flags: "none", below: "typing", country: "Côte d’Ivoire", applied: "week", job: JOB_ID, sort: "last-active", q: "maria reyes", shown: 50 };
  const url = L.serializeListState(full, "?__preview=1&__previewScenario=zulu");
  check("every part of the state round-trips", eq(L.parseListState(url), full), url.toString());
  check("params it does not own are kept, in place", url.toString().startsWith("__preview=1&__previewScenario=zulu&"), url.toString());
  check("defaults are left off", L.serializeListState(L.DEFAULT_LIST_STATE, "?__preview=1&foo=bar").toString() === "__preview=1&foo=bar");
  check("roleId is the job filter, read and written", L.parseListState("?roleId=abc").job === "abc" && L.serializeListState({ ...L.DEFAULT_LIST_STATE, job: null }, "?roleId=abc&x=1").toString() === "x=1");
  check("old links: applying / started / reading → Part-way", ["applying", "started", "reading"].every((t) => L.parseListState(`?tab=${t}`).tab === "part-way"));
  check("old links: sealed → All, passed → Declined", L.parseListState("?tab=sealed").tab === "all" && L.parseListState("?tab=passed").tab === "declined");
  check("an old link is rewritten in place on the next write", L.serializeListState(L.parseListState("?tab=applying&roleId=abc"), "?tab=applying&roleId=abc").toString() === "tab=part-way&roleId=abc");
  check("unknown values fall back to the default", eq(L.parseListState("?tab=everyone&score=99&flags=x&sort=y&applied=z"), L.DEFAULT_LIST_STATE));
  check("shown: whole pages past the first, never below 25", L.parseListState("?shown=50").shown === 50 && L.parseListState("?shown=10").shown === 25 && L.parseListState("?shown=abc").shown === 25);
  check("?applicationId= goes to the profile", L.profileRedirectFor("?applicationId=dc2d059f-90fb-46b9-88ad-5f45f6bf0463") === "/applicants/dc2d059f-90fb-46b9-88ad-5f45f6bf0463");
  check("…and nowhere when it is not an id", L.profileRedirectFor("?applicationId=../x") === null && L.profileRedirectFor("?roleId=1") === null);
}

/* ── 8. Memoised per row ───────────────────────────────────────────────── */

console.log("\n8. Each record is rebuilt only when its own inputs change");
{
  const b = L.createApplicantRowBuilder();
  const input = { apps: APPS, sessions: SESSIONS, reopens: [], jobs: [JOB, JOB_B], interviews: INTERVIEWS, now: NOW };
  const first = b(input);
  const again = b({ ...input, jobs: [{ ...JOB }, { ...JOB_B }] });
  check("a refetched job list with the same jobs rebuilds nothing", first.every((r, i) => r.record === again[i].record));
  const changed = SESSIONS.map((s) => (s.application_id === BEN.id ? { ...s, progress: { current_index: 6, total: 10 } } : s));
  const third = b({ ...input, sessions: changed });
  const ben = third.find((r) => r.name === "Ben Castillo");
  check("one attempt merged: only that person's record is rebuilt", ben.record !== again.find((r) => r.name === "Ben Castillo").record && ben.lineText.includes("question 7 of 10") && third.filter((r, i) => r.record !== again[i].record).length === 1);
  const tick = b({ ...input, sessions: changed, now: NOW + 30_000 });
  const rebuilt = names(tick.filter((r, i) => r.record !== third[i].record));
  // Not Cara (left 20 h ago: her record cannot change without a new event),
  // not Léa (a claim being checked: its 7-minute limit is read by the row,
  // not the record), not the decided, not anyone who abandoned a step.
  check("the 30-second tick rebuilds only people in a test right now", eq(rebuilt, ["Ada Okafor", "Ben Castillo", "Dev Mwangi", "Eve Bello"]), show(rebuilt));
  const later = b({ ...input, sessions: changed, now: NOW + 8 * MIN });
  const lea = later.find((r) => r.name === "Léa Dubois");
  check(
    "…while a claim checked past the server's 7 minutes still leaves Taking tests now (a dead request)",
    lea.tab === "part-way" && lea.lineText === "Typing speed and accuracy · step 4 of 7 · checking failed, retrying" && lea.activeTone !== "jade",
    `${lea.tab} / ${lea.lineText} / ${lea.activeTone}`,
  );
  check("…and every row's words still age", tick.find((r) => r.name === "Candidate 1").activeWords === "Done 20 h ago");
}

/* ── 9. The slim load (useApplicantList's queries) and the live merge ──── */

const STUBS = {
  "@/integrations/supabase/client": "export const supabase = new Proxy({}, { get: (_t, key) => globalThis.__fakeSupabase[key] });",
  "@/hooks/useAuth": "export const useAuth = () => ({ user: null, role: null });",
  "@/hooks/useSchemaMode": "export const useSchemaMode = () => ({ data: undefined });",
  "@/hooks/useJobs": "export const useEmployerJobs = () => ({ data: [] });",
  "@/hooks/useApplications": "export {};",
};
const bundle = await build({
  stdin: {
    contents:
      'export * from "./src/cockpit/hooks/useEmployerLiveSync.ts";\n' +
      'export { fetchListApplications, fetchListSessions, fetchListReopens, applicantListKeys, LIST_SESSION_COLUMNS } from "./src/cockpit/hooks/useApplicantList.ts";\n' +
      'export { QueryClient, QueryObserver } from "@tanstack/react-query";\n',
    resolveDir: ROOT,
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "silent",
  plugins: [
    {
      name: "aliases",
      setup(b) {
        b.onResolve({ filter: /^@\// }, async (args) => {
          if (args.path in STUBS) return { path: args.path, namespace: "stub" };
          const base = path.join(ROOT, "src", args.path.slice(2));
          for (const suffix of [".ts", ".tsx", "/index.ts"]) {
            const r = await b.resolve(base + suffix, { kind: args.kind, resolveDir: ROOT });
            if (!r.errors.length) return { path: r.path };
          }
          throw new Error(`cannot resolve ${args.path}`);
        });
        b.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: STUBS[args.path], loader: "js" }));
      },
    },
  ],
});
const H = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

/** A PostgREST stand-in that, like this project's, never returns more than 1,000 rows. */
function fakeSupabase(tables) {
  const calls = [];
  return {
    calls,
    from(table) {
      const q = { table, columns: "", filters: [], orders: [], range: null };
      calls.push(q);
      const b = {
        select(columns) {
          q.columns = columns;
          return b;
        },
        in(col, values) {
          q.filters.push((r) => values.includes(r[col]));
          q.inSize = Math.max(q.inSize ?? 0, values.length);
          return b;
        },
        eq(col, value) {
          q.filters.push((r) => r[col] === value);
          return b;
        },
        order(col, opts) {
          q.orders.push([col, opts?.ascending !== false]);
          return b;
        },
        range(from, to) {
          q.range = [from, to];
          return b;
        },
        then(resolve, reject) {
          let rows = (tables[table] ?? []).filter((r) => q.filters.every((f) => f(r)));
          rows = [...rows].sort((a, c) => {
            for (const [col, asc] of q.orders) {
              const d = String(a[col] ?? "").localeCompare(String(c[col] ?? ""));
              if (d) return asc ? d : -d;
            }
            return 0;
          });
          const [from, to] = q.range ?? [0, Infinity];
          rows = rows.slice(from, Math.min(to + 1, from + 1000));
          const cols = q.columns.split(",").map((c) => c.trim());
          const data = rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])));
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return b;
    },
  };
}

console.log("\n9. The slim load pages past 1,000 rows");
{
  const jobs = ["job-a", "job-b"];
  const apps = Array.from({ length: 1234 }, (_, i) => ({
    id: `app-${String(i).padStart(5, "0")}`,
    job_id: i < 1100 ? "job-a" : "job-b",
    candidate_id: `user-${i}`,
    status: "reviewing",
    phase: "quiz",
    created_at: new Date(NOW - i * MIN).toISOString(),
    updated_at: new Date(NOW).toISOString(),
    notes: "{}",
    ai_score: i % 100,
    ai_scorecard: {},
    ai_analysis: "x".repeat(50),
    resume_url: null,
    voice_interview_result: null,
  }));
  const sessions = Array.from({ length: 2600 }, (_, i) => ({
    id: `s-${String(i).padStart(5, "0")}`,
    application_id: apps[i % 1234].id,
    job_id: apps[i % 1234].job_id,
    step_id: i < 1234 ? "application" : "quiz",
    step_type: i < 1234 ? "application" : "quiz",
    attempt: 1,
    status: "completed",
    started_at: new Date(NOW - i * 1000).toISOString(),
    last_activity_at: new Date(NOW - i * 1000).toISOString(),
    progress: {},
    integrity_summary: null,
    grading: { secret: true },
    context: { big: true },
    draft: i < 1234 ? { q4: "Accra, Ghana" } : null,
    updated_at: new Date(NOW).toISOString(),
  }));
  const profiles = apps.map((a, i) => ({ user_id: a.candidate_id, full_name: `Person ${i}`, email: `p${i}@example.com`, avatar_url: null, bio: "long" }));
  const reopens = Array.from({ length: 1500 }, (_, i) => ({ application_id: apps[i % 1234].id, step_id: i < 1234 ? "quiz" : "step_typing", job_id: apps[i % 1234].job_id, reopened_at: new Date(NOW - i * 1000).toISOString(), reopened_by: null, reopen_count: 1 }));
  globalThis.__fakeSupabase = fakeSupabase({ applications: apps, assessment_sessions: sessions, profiles, assessment_step_reopens: reopens });
  const calls = globalThis.__fakeSupabase.calls;

  const gotApps = await H.fetchListApplications(jobs);
  check("all 1,234 applications, not the first 1,000", gotApps.length === 1234 && new Set(gotApps.map((a) => a.id)).size === 1234, String(gotApps.length));
  const appCalls = calls.filter((c) => c.table === "applications");
  check("…in two pages of the slim columns, no job embed", appCalls.length === 2 && appCalls.every((c) => c.columns === "id, job_id, candidate_id, status, phase, created_at, updated_at, notes, ai_score, ai_scorecard, resume_url, voice_interview_result"), show(appCalls.map((c) => c.columns)));
  check("…no heavy column came back", !gotApps.some((a) => "ai_analysis" in a || "jobs" in a));
  const profileCalls = calls.filter((c) => c.table === "profiles");
  check("profiles 150 ids at a time, four columns", profileCalls.length === 9 && profileCalls.every((c) => c.inSize <= 150 && c.columns === "user_id, full_name, email, avatar_url"), show(profileCalls.map((c) => c.inSize)));
  check("every applicant has their profile", gotApps.every((a) => a.profiles?.full_name?.startsWith("Person ") && !("bio" in a.profiles)));

  calls.length = 0;
  const gotSessions = await H.fetchListSessions(jobs);
  check("all 2,600 attempts, every status", gotSessions.length === 2600, String(gotSessions.length));
  const sessionCalls = calls.filter((c) => c.table === "assessment_sessions" && !c.columns.includes("draft"));
  check("…three pages, without grading, context or draft", sessionCalls.length === 3 && sessionCalls.every((c) => c.columns === H.LIST_SESSION_COLUMNS && !/grading|context|draft/.test(c.columns)));
  check("…nothing heavy came back", !gotSessions.some((s) => "grading" in s || "context" in s));
  check("drafts only on form attempts", gotSessions.filter((s) => "draft" in s).length === 1234 && gotSessions.every((s) => ("draft" in s) === (s.step_type === "application")));
  check("…with their answers", gotSessions.find((s) => s.step_type === "application").draft.q4 === "Accra, Ghana");

  calls.length = 0;
  const gotReopens = await H.fetchListReopens(jobs);
  check("every hand-back, past 1,000 too", gotReopens.length === 1500 && calls.length === 2);
}

console.log("\n10. Live: an UPDATE merges in place with no refetch; an INSERT refetches");
{
  const { QueryClient, QueryObserver, startEmployerLiveSync, mergeIntoList, applicantListKeys, LIVE_SYNC_LIST_KEYS, isMergedListKey } = H;
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  function fakeTimers() {
    let n = 0;
    const pending = new Map();
    return {
      setTimeout(fn) {
        n += 1;
        pending.set(n, fn);
        return n;
      },
      clearTimeout(id) {
        pending.delete(id);
      },
      async fire() {
        for (let i = 0; i < 4; i += 1) {
          const due = [...pending.values()];
          pending.clear();
          due.forEach((fn) => fn());
          await settle();
          await settle();
        }
      },
    };
  }
  function fakeClient() {
    const channels = new Map();
    return {
      channels,
      channel(topic) {
        const chan = {
          topic,
          bindings: [],
          on(_type, _filter, cb) {
            chan.bindings.push(cb);
            return chan;
          },
          subscribe(cb) {
            chan.status = cb;
            return chan;
          },
          emit(payload) {
            chan.bindings.forEach((cb) => cb(payload));
          },
        };
        channels.set(topic, chan);
        return chan;
      },
      async removeChannel(chan) {
        channels.delete(chan.topic);
      },
    };
  }
  /** A cached query with an active observer, counting its refetches. */
  function watch(queryClient, queryKey, data) {
    const counter = { fetches: 0 };
    queryClient.setQueryData(queryKey, data);
    const observer = new QueryObserver(queryClient, {
      queryKey,
      queryFn: async () => {
        counter.fetches += 1;
        return queryClient.getQueryData(queryKey);
      },
      staleTime: Infinity,
    });
    counter.stop = observer.subscribe(() => {});
    return counter;
  }

  const USER = "e32a8a14-0000-4000-8000-000000000001";
  const JOBS_KEY = [JOB_ID, JOB_B.id].sort().join(",");
  const appsKey = applicantListKeys.applications(JOBS_KEY);
  const sessKey = applicantListKeys.sessions(JOBS_KEY);
  check("the list's keys are the live sync's merged lists", eq(appsKey.slice(0, 2), LIVE_SYNC_LIST_KEYS.applications) && eq(sessKey.slice(0, 2), LIVE_SYNC_LIST_KEYS.sessions) && isMergedListKey(appsKey) && isMergedListKey(sessKey));
  check("…and the reopen markers are not (a hand-back must refetch them)", !isMergedListKey(applicantListKeys.reopens(JOBS_KEY)));

  /** A row as the list's select returns it: its columns, plus the profile. */
  const slim = (a) => ({ ...Object.fromEntries(L.APPLICANT_LIST_COLUMNS.split(", ").map((c) => [c, a[c] ?? null])), profiles: a.profiles });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const timers = fakeTimers();
  const client = fakeClient();
  const appRows = [slim(CANDIDATE_1), slim(CANDIDATE_2)];
  const sessionRows = CANDIDATE_2_SESSIONS.map((s) => ({ ...s }));
  const list = watch(queryClient, appsKey, appRows);
  const attempts = watch(queryClient, sessKey, sessionRows);
  const employer = watch(queryClient, ["applications", "employer", USER], []);
  const panel = watch(queryClient, ["assessment-sessions", "application", CANDIDATE_2.id], sessionRows);
  const stop = startEmployerLiveSync({ client, queryClient, userId: USER, instanceId: ":r1:", timers });
  const apps = [...client.channels.values()].find((c) => c.topic.startsWith("employer-live-"));
  const live = [...client.channels.values()].find((c) => c.topic.startsWith("employer-sessions-"));
  const counts = () => ({ list: list.fetches, attempts: attempts.fetches, employer: employer.fetches, panel: panel.fetches });

  // Ava scores CANDIDATE 2 again: the payload is the whole row, heavy columns included.
  const { profiles: _p, ...c2Row } = CANDIDATE_2;
  apps.emit({ eventType: "UPDATE", errors: null, new: { ...c2Row, ai_score: 52, phase: "step_connection", ai_analysis: "x".repeat(8000), updated_at: "2026-10-06T11:59:00Z" }, old: { id: CANDIDATE_2.id } });
  const merged = queryClient.getQueryData(appsKey);
  check("the UPDATE is in the list at once", merged[1].ai_score === 52 && merged[1].phase === "step_connection");
  check("…without the columns the list never selected", !("ai_analysis" in merged[1]) && merged[1].profiles?.full_name === "CANDIDATE 2");
  check("…and the other row keeps its identity", merged[0] === appRows[0]);
  await timers.fire();
  check("…no refetch of the list (the employer query still refreshes)", counts().list === 0 && counts().employer === 1, show(counts()));

  apps.emit({ eventType: "UPDATE", errors: null, new: { ...c2Row, ai_score: 10, updated_at: "2026-10-01T00:00:00Z" }, old: { id: CANDIDATE_2.id } });
  await timers.fire();
  check("an older UPDATE never rolls the list back, and refetches nothing", queryClient.getQueryData(appsKey)[1].ai_score === 52 && counts().list === 0);

  apps.emit({ eventType: "INSERT", errors: null, new: { id: "new-app", job_id: JOB_ID, status: "in_progress" }, old: {} });
  await timers.fire();
  check("an INSERT refetches the list", counts().list === 1, show(counts()));

  apps.emit({ eventType: "UPDATE", errors: null, new: { id: "missing", job_id: JOB_B.id, status: "reviewing", updated_at: "2026-10-06T12:00:00Z" }, old: { id: "missing" } });
  await timers.fire();
  check("an UPDATE for a row it lacks (on its jobs) refetches it", counts().list === 2);
  apps.emit({ eventType: "UPDATE", errors: null, new: { id: "elsewhere", job_id: "another-employer-job", status: "reviewing" }, old: { id: "elsewhere" } });
  await timers.fire();
  check("…one on a job it does not cover does not", counts().list === 2);

  apps.emit({ eventType: "UPDATE", errors: ["Error 413: Payload Too Large"], new: { id: CANDIDATE_1.id, job_id: JOB_ID }, old: { id: CANDIDATE_1.id } });
  await timers.fire();
  check("a payload the server cut short refetches it", counts().list === 3);

  apps.status("SUBSCRIBED");
  await timers.fire();
  check("the reconnect catch-up refetches it", counts().list === 4);

  apps.emit({ eventType: "DELETE", errors: null, new: {}, old: { ...c2Row } });
  check("a DELETE drops the row at once", queryClient.getQueryData(appsKey).every((r) => r.id !== CANDIDATE_2.id));
  await timers.fire();
  check("…and refetches the list", counts().list === 5);

  // The attempts: a heartbeat every few seconds while someone is in a test.
  const before = counts();
  for (let i = 1; i <= 10; i += 1) {
    live.emit({
      eventType: "UPDATE",
      errors: null,
      new: { ...CANDIDATE_2_SESSIONS[1], status: "active", last_activity_at: `2026-10-06T11:5${i % 10}:00Z`, updated_at: `2026-10-06T11:5${i % 10}:0${i % 10}Z`, grading: { secret: true }, context: { scenario: "x" }, draft: null },
      old: { id: CANDIDATE_2_SESSIONS[1].id },
    });
  }
  const held = queryClient.getQueryData(sessKey);
  check("ten heartbeats land in the attempts list in place", held[1].status === "active" && held[1].last_activity_at.startsWith("2026-10-06T11:5"));
  check("…without grading, context or a draft the row never had", !("grading" in held[1]) && !("context" in held[1]) && !("draft" in held[1]));
  await timers.fire();
  check("…and never re-download it", counts().attempts === before.attempts, show(counts()));
  check("…while an open record panel still refetches as before", counts().panel > before.panel);

  live.emit({ eventType: "UPDATE", errors: null, new: { ...CANDIDATE_2_SESSIONS[0], draft: { q4: "Cebu, Philippines" }, updated_at: "2026-10-06T11:59:30Z" }, old: { id: CANDIDATE_2_SESSIONS[0].id } });
  check("a form attempt's saved answers merge into its draft", queryClient.getQueryData(sessKey)[0].draft.q4 === "Cebu, Philippines");

  live.emit({ eventType: "INSERT", errors: null, new: { id: "s-new", application_id: CANDIDATE_2.id, job_id: JOB_ID, step_id: "quiz", step_type: "quiz", status: "active" }, old: {} });
  await timers.fire();
  check("a new attempt (INSERT) refetches the attempts list", counts().attempts === before.attempts + 1);

  live.emit({ eventType: "UPDATE", errors: null, new: { id: "s-unknown", application_id: CANDIDATE_2.id, job_id: JOB_ID, status: "active" }, old: { id: "s-unknown" } });
  await timers.fire();
  check("an attempt it lacks refetches it", counts().attempts === before.attempts + 2);

  live.emit({ eventType: "DELETE", errors: null, new: {}, old: { id: CANDIDATE_2_SESSIONS[0].id } });
  await timers.fire();
  check("a DELETE drops the attempt and refetches", counts().attempts === before.attempts + 3 && queryClient.getQueryData(sessKey).every((s) => s.id !== CANDIDATE_2_SESSIONS[0].id));

  live.status("SUBSCRIBED");
  await timers.fire();
  check("the reconnect catch-up refetches it", counts().attempts === before.attempts + 4);

  stop();
  for (const w of [list, attempts, employer, panel]) w.stop();

  // mergeIntoList on its own.
  const rowsA = [{ id: "x", job_id: "j1", status: "a", updated_at: "2026-10-06T10:00:00Z" }];
  const key = ["applications", "list", "j1,j2"];
  const ev = (eventType, n, o = {}, errors = null) => ({ eventType, errors, new: n, old: o });
  check("merge: UPDATE held → merged, no refetch", eq(mergeIntoList(rowsA, ev("UPDATE", { id: "x", job_id: "j1", status: "b", extra: 1, updated_at: "2026-10-06T11:00:00Z" }), key), { rows: [{ id: "x", job_id: "j1", status: "b", updated_at: "2026-10-06T11:00:00Z" }], refetch: false }));
  check("merge: INSERT on a covered job → refetch; on another job → not", mergeIntoList(rowsA, ev("INSERT", { id: "y", job_id: "j2" }), key).refetch && !mergeIntoList(rowsA, ev("INSERT", { id: "y", job_id: "j9" }), key).refetch);
  check("merge: nothing cached yet → refetch for its jobs only", mergeIntoList(undefined, ev("UPDATE", { id: "x", job_id: "j1" }), key).refetch);
  check("merge: DELETE of a row it lacks → nothing", eq(mergeIntoList(rowsA, ev("DELETE", {}, { id: "zz" }), key), { rows: rowsA, refetch: false }));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
