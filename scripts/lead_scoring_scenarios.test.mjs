#!/usr/bin/env node
/**
 * Six made-up applicants to the Chat Support Team Leader job, scored by the
 * real code, the way trigger-ava-analysis scores them (2026-10-06).
 *
 * The audit that wrote these profiles (six synthetic applicants, run through
 * the real scoring code and the live judge) found that the written application
 * decided about 79% of a lead's number: the job read as a "support" job, the
 * judge's score was blended in at 0.7 and again inside the phase blend, and
 * nothing in it measured leading. A fluent writer who had never led anyone
 * outranked an experienced lead who writes plainly, and four of six got the
 * same "advance" as the one clear hire.
 *
 * The profiles:
 *   A  strong, experienced working lead (8 agents, 2 years), adaptable
 *   B  polished writer, great typing, has never led a team
 *   C  experienced manager who wants only to manage, coasts on the chat
 *   D  great working lead who typed 38 WPM (bar 45) on a 6 Mbps line
 *   E  adaptable junior agent with some training duty
 *   F  claims five years leading 50+, contradicts himself everywhere
 *
 * Each runs twice: with the judge sub-scores the audit's deterministic run
 * used, and with the sub-scores the live judge returned (its first pass). The
 * audit had no leadership or adaptability sub-score, so those two are set here
 * by its own rules (never led: below 30; a vague claim: below 50). Everything
 * else (the notes, the quiz picks, the typing and connection results, the
 * written interview's credibility) is the audit's, in the shapes the live
 * pipeline stores.
 *
 * What must hold:
 *   - A ranks first; A above E and above B.
 *   - D is flagged (typing below the bar, the connection) but not sunk below B.
 *   - C carries the deal-breaker "Wants to mostly manage, not work the chat
 *     queue" from the FORM, whatever the judge wrote, and is not "advance".
 *   - F ranks last and is not "advance".
 *   - No more than two "advance".
 *
 * Run with: node scripts/lead_scoring_scenarios.test.mjs
 */

import { readFileSync } from "node:fs";
import {
  buildAvaScorecard,
  computeJudgmentScore,
  formDealBreakersFrom,
  formReviewFlagsFrom,
  highSignalProgress,
  inferJobFamily,
  INTERVIEW_CREDIBILITY_FLAG,
  isPromiseWordsOnlyReason,
  leadTestsCoverage,
  orphanFlagOptions,
  phaseBlendScore,
  quizAreaBreakdown,
  readChatInterviewResult,
  readChatSimulationResult,
  readQuizResult,
} from "../supabase/functions/_shared/autopilot.ts";
import { recordedEquipmentCheck } from "../supabase/functions/_shared/connectionStamps.ts";
import { PROMISE_WORDS_REASON_PREFIX, buildChatSimulationResult, leadEvaluationFrom } from "../supabase/functions/ai-chat-simulation/grading.ts";
import { buildChatInterviewResult } from "../supabase/functions/ai-chat-interview/resultShape.ts";

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  ok    ${message}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${message}`);
  }
}

// ---------------------------------------------------------------------------
// The job (JOB-C84E85 as live on 2026-10-06), with the working-lead question
// the audit proposed: a select that does not give its answer away, and the
// owner's flag on the two answers that rule a working lead out.
// ---------------------------------------------------------------------------

const DEAL_BREAKER = "Wants to mostly manage, not work the chat queue";

const JOB = {
  title: "Chat Support Team Leader (Zulu Royal & Zulu Rush)",
  description:
    "Zulu runs player support for Zulu Royal and Zulu Rush. We're hiring an experienced Team Leader for our chat support team.\n\n" +
    "This is a working team lead role. You will answer players on your shifts, just like your team, and you will lead a team of six chat agents. " +
    "If you are looking for a role where you only manage other people, this isn't it.",
  requirements:
    "• At least 2 years of customer or chat support experience, including time leading, coaching or training a team\n" +
    "• Happy to work the chat queue on every shift as well as lead: this is a working lead role\n" +
    "• Adaptable: our games, tools and rules change often, and you learn the new way quickly and help the team adjust\n" +
    "• Fluent written English with correct spelling and grammar\n" +
    "• Typing speed of at least 45 words a minute with high accuracy\n" +
    "• Your own computer and a reliable internet connection",
  skills_required: ["Team leadership", "Working the queue", "Adaptability", "Fast, accurate typing", "Following money rules"],
  experience_level: "lead",
  passing_score: 60,
  processing_mode: "auto",
  required_wpm: 45,
  require_resume: false,
  workflow_steps: [
    { id: "step_connection", type: "equipment_check", title: "Computer and connection check" },
    { id: "step_typing", type: "typing_test", title: "Typing test" },
    { id: "step_chat", type: "chat_simulation", title: "Escalated chat practice" },
    { id: "step_interview", type: "chat_interview", title: "Written interview" },
  ],
  // jobs.quiz_questions keeps id and category; the answer key lives server-side.
  quiz_questions: [
    ["zu1", "coaching"], ["zu2", "staffing"], ["zu3", "handover"], ["zu4", "team_performance"], ["zu5", "attendance"],
    ["zu6", "integrity"], ["zu7", "escalation"], ["zu8", "money_rules"], ["zu9", "adaptability"], ["zu10", "written_english"],
  ].map(([id, category]) => ({ id, category, question: `(${category})`, options: ["a", "b", "c", "d"] })),
  application_questions: [
    { id: "q1", type: "text", question: "Full name", required: true },
    { id: "q12", type: "textarea", question: "Tell us about a team you have led, coached or trained: how many people, for how long, and one problem you fixed.", required: true },
    { id: "q13", type: "textarea", question: "Tell us about a time the rules, tools or way of working changed suddenly at your job. What did you do, and how did you help others adjust?", required: true },
    {
      id: "q14",
      type: "select",
      question: "On a normal shift, how much of your time do you expect to spend answering players yourself?",
      options: ["Most of the shift", "About half", "A little; mostly managing the team", "None"],
      flag_options: ["A little; mostly managing the team", "None"],
      flag_label: DEAL_BREAKER,
      required: true,
    },
  ],
};

// zu1..zu10's correct option (docs/ZULU-SKILLS-CHECK.md); only the fixtures use it.
const KEY = [1, 0, 2, 1, 3, 0, 2, 2, 0, 3];

// ---------------------------------------------------------------------------
// Stored shapes (what submit_quiz_attempt, recordStepResult and the form write)
// ---------------------------------------------------------------------------

function quizNotes(picks) {
  const answers = picks.map((pick, i) => ({
    questionId: `zu${i + 1}`,
    questionType: "multiple_choice",
    selectedAnswer: pick,
    isCorrect: pick === KEY[i],
  }));
  const correct = answers.filter((answer) => answer.isCorrect).length;
  const score = Math.round((correct / 10) * 100);
  return {
    quiz: { type: "quiz", answers, score, correct, total: 10, passed: score >= 60, completedAt: "2026-10-06T10:05:00Z" },
    quizResult: { score, correct, total: 10, passed: score >= 60 },
  };
}

function connectionNotes({ down, up, lat }) {
  const below = [];
  if (down < 10) below.push("download");
  if (up < 3) below.push("upload");
  if (lat > 200) below.push("latency");
  return {
    downloadMbps: down, uploadMbps: up, latencyMs: lat, jitterMs: 6, measuredBy: "server", runs: 1,
    usingThisComputer: "yes", deviceKind: "computer",
    device: { os: "Windows", osVersion: "11", browser: "Chrome", screen: "1366×768" },
    bars: { minDownloadMbps: 10, minUploadMbps: 3, maxLatencyMs: 200 },
    meetsBars: below.length === 0, below, measuredAt: "2026-10-06T10:08:00Z", attempt: 1,
    source: { oneAddress: true, sameAddress: true, sameBrowser: true }, _trusted: true,
  };
}

function typingNotes(wpm, accuracy) {
  return { wpm, accuracy, score: Math.round(Math.min(100, (wpm / 45) * 100) * (accuracy / 100)), passed: wpm >= 45, requiredWpm: 45 };
}

function notesFor(p) {
  return {
    applicationAnswers: [
      { questionId: "q1", question: "Full name", answer: p.name, type: "text" },
      { questionId: "q12", question: JOB.application_questions[1].question, answer: p.q12, type: "textarea" },
      { questionId: "q13", question: JOB.application_questions[2].question, answer: p.q13, type: "textarea" },
      { questionId: "q14", question: JOB.application_questions[3].question, answer: p.q14, type: "select" },
    ],
    ...quizNotes(p.quizPicks),
    equipmentCheckResult: connectionNotes(p.connection),
    typingTestResult: typingNotes(...p.typing),
    chatSimulationResult: { scenario: p.chat.scenario, messageCount: 6, completed: true, ...p.chat.scores, strengths: [], improvements: p.chat.improvements },
    chatInterviewResult: {
      completed: true, messageCount: 12, questionCount: 6,
      ...p.interview,
    },
    _trusted: {
      step_connection: { stepType: "equipment_check", completedAt: "2026-10-06T10:08:00Z" },
      step_typing: { stepType: "typing_test", completedAt: "2026-10-06T10:12:00Z" },
      step_chat: { stepType: "chat_simulation", completedAt: "2026-10-06T10:30:00Z" },
      step_interview: { stepType: "chat_interview", completedAt: "2026-10-06T10:50:00Z" },
    },
  };
}

// The narrative's enum lines are what buildAvaScorecard reads from the prose.
function narrative({ roleFit = "Good Match", decision = "Recommended", authenticity = "AUTHENTIC" }) {
  return `**DOCUMENT VALIDATION**\nStatus: RESUME_UNAVAILABLE\n**AUTHENTICITY ASSESSMENT**\nStatus: ${authenticity}\n**SKILLS ASSESSMENT**\nRole Fit: ${roleFit}\n**RECOMMENDATION**\nDecision: ${decision}\n`;
}

// ---------------------------------------------------------------------------
// The six profiles (audit: hf/profiles.mjs)
// ---------------------------------------------------------------------------

const PROFILES = {
  A: {
    name: "Maria Delacruz",
    q12: "I lead 8 chat agents on the overnight shift at Brightline, for 2 years now. Weekend first reply had drifted to about 4 minutes; I wrote a payment-check guide and moved one person to cover the queue, and it went down to about 80 seconds in 3 weeks.",
    q13: "Our client changed the refund rule overnight. I read the update before my shift, wrote a 3-line reply the team could use, ran a 10-minute huddle and checked the first 20 chats.",
    q14: "Most of the shift",
    quizPicks: [1, 0, 2, 3, 3, 0, 2, 2, 0, 3], // 9/10, missed team performance
    connection: { down: 48.2, up: 14.6, lat: 36 },
    typing: [58, 97],
    chat: { scenario: "lead-refund-promised", scores: { score: 88, empathy: 90, problemSolving: 86 }, improvements: ["Could have offered to message her when the manager replies"] },
    interview: { score: 86, recommendation: "Strong Hire", credibilityRating: "High", concerns: ["No direct sweepstakes experience"], summary: "Experienced working lead." },
    narrative: { roleFit: "Strong Match", decision: "Highly Recommended" },
    leadership: 90,
    adaptability: 88,
  },
  B: {
    name: "Daniel Okafor",
    q12: "I have not led a team formally. I was the person newer colleagues asked when a reply needed rewording, and I wrote our shared library of 40 saved replies.",
    q13: "When we moved from email to live chat in a week, I rewrote our saved replies for chat and answered questions in our group channel.",
    q14: "Most of the shift",
    quizPicks: [1, 1, 2, 1, 2, 0, 1, 2, 0, 3], // 7/10
    connection: { down: 96, up: 38, lat: 22 },
    typing: [82, 99],
    chat: { scenario: "lead-cashout-ignored", scores: { score: 82, empathy: 90, problemSolving: 76 }, improvements: ["Answered as an agent rather than as the lead taking over"] },
    interview: { score: 66, recommendation: "Maybe", credibilityRating: "High", concerns: ["No experience leading, coaching or training a team"], summary: "Excellent writer and agent; has not led a team." },
    narrative: { roleFit: "Partial Match", decision: "Proceed with Caution" },
    leadership: 25, // never led a team: below 30, however well written
    adaptability: 70,
  },
  C: {
    name: "Rahul Mehta",
    q12: "As operations manager I managed 3 team leaders and 25 agents for 4 years; CSAT went from 78% to 89% in two quarters.",
    q13: "When our client changed CRM with two weeks notice, I built the rollout plan and had the team leaders train their teams in waves.",
    q14: "A little; mostly managing the team",
    quizPicks: [1, 2, 2, 2, 3, 0, 2, 2, 0, 3], // 8/10
    connection: { down: 35, up: 10, lat: 55 },
    typing: [50, 96],
    chat: { scenario: "lead-rigged-rude", scores: { score: 60, empathy: 52, problemSolving: 60 }, improvements: ["Did not apologise for the agent's rude message"] },
    interview: { score: 64, recommendation: "Maybe", credibilityRating: "Medium", concerns: ["Said twice that they prefer not to answer players on shifts"], summary: "Capable manager who does not want to work the queue." },
    narrative: { roleFit: "Partial Match", decision: "Proceed with Caution" },
    leadership: 88,
    adaptability: 72,
  },
  D: {
    name: "Grace Mwangi",
    q12: "For 3 years I have been the working team lead for 10 chat agents on the overnight shift, still taking about a third of the chats. I wrote one approved cash-out answer and coached each agent on it; complaints fell by about half.",
    q13: "Our client added ID checks with one day notice. I did the first few myself, then shared a short guide and stayed on the team chat answering questions.",
    q14: "Most of the shift",
    quizPicks: [1, 0, 2, 3, 3, 0, 2, 2, 0, 3], // 9/10
    connection: { down: 6.2, up: 2.1, lat: 142 },
    typing: [38, 98],
    chat: { scenario: "lead-unsafe-request", scores: { score: 86, empathy: 88, problemSolving: 84 }, improvements: ["Replies were slightly slow"] },
    interview: { score: 84, recommendation: "Hire", credibilityRating: "High", concerns: ["Typing below the 45 WPM bar"], summary: "Strong working lead; typing and connection below the bars." },
    narrative: { roleFit: "Strong Match", decision: "Recommended" },
    leadership: 90,
    adaptability: 85,
  },
  E: {
    name: "Ana Torres",
    q12: "I have not been a team leader, but I buddy-trained 3 new agents over two weeks each, shadowing their chats; one kept promising times and her complaints dropped to zero.",
    q13: "Our company switched chat tools over one weekend. I practised in the test account, made a one-page cheat sheet with screenshots, shared it with my shift and helped two colleagues set up.",
    q14: "Most of the shift",
    quizPicks: [1, 1, 2, 1, 2, 0, 2, 2, 0, 3], // 8/10
    connection: { down: 22, up: 6, lat: 88 },
    typing: [52, 96],
    chat: { scenario: "lead-new-rule", scores: { score: 80, empathy: 84, problemSolving: 78 }, improvements: ["Could be more confident when the player pushes back"] },
    interview: { score: 74, recommendation: "Hire", credibilityRating: "High", concerns: ["Only one year of support"], summary: "Adaptable, honest agent with real training duty." },
    narrative: { roleFit: "Good Match", decision: "Recommended" },
    leadership: 48, // coached three people with specifics, never ran a team
    adaptability: 88,
  },
  F: {
    name: "Kevin Brandt",
    q12: "I have led teams of 50+ agents for over 5 years. I improved every metric on every account.",
    q13: "Change happens all the time and I always adapt quickly by motivating my team and keeping a positive attitude.",
    q14: "Most of the shift",
    quizPicks: [0, 1, 2, 0, 3, 1, 3, 0, 1, 3], // 3/10, wrong on integrity and money rules
    connection: { down: 40, up: 12, lat: 60 },
    typing: [47, 93],
    chat: { scenario: "lead-regular-favour", scores: { score: 32, empathy: 70, problemSolving: 20 }, improvements: ["Promised a bonus support cannot give"] },
    interview: {
      score: 38, recommendation: "No Hire", credibilityRating: "Low",
      concerns: ["Could not name an employer, a team size or a single measured result"],
      inconsistencies: [{ claim: "5+ years leading teams of 50+", evidence: "30% skills check; missed the integrity and money-rules questions" }],
      summary: "Claims are not supported by the skills check or the interview.",
    },
    narrative: { roleFit: "Partial Match", decision: "Not Recommended", authenticity: "QUESTIONABLE" },
    leadership: 35, // a vague claim: below 50
    adaptability: 25,
  },
};

// The judge's sub-scores, two sets. "expected": the audit's deterministic run
// (run_expected.mjs). "live": what the deployed judge returned on its first
// pass (live_pass1.json). Conflicts are the judge's own, adjusted only where
// C's new answer is quoted.
const C_CONFLICT = 'The job asks for someone "Happy to work the chat queue on every shift as well as lead"; the candidate answered "A little; mostly managing the team".';
const JUDGE = {
  expected: {
    A: { directMatchScore: 86, transferableFitScore: 80, learningSignalScore: 74, writingQualityScore: 86, attentionToDetailScore: 85, authenticityScore: 88, specificityScore: 86, hardRequirementConflicts: [] },
    B: { directMatchScore: 42, transferableFitScore: 66, learningSignalScore: 76, writingQualityScore: 95, attentionToDetailScore: 92, authenticityScore: 86, specificityScore: 72, hardRequirementConflicts: ['The job asks for "At least 2 years of customer or chat support experience, including time leading, coaching or training a team"; the candidate says they have not led a team.'] },
    C: { directMatchScore: 78, transferableFitScore: 76, learningSignalScore: 48, writingQualityScore: 82, attentionToDetailScore: 80, authenticityScore: 82, specificityScore: 80, hardRequirementConflicts: [C_CONFLICT] },
    D: { directMatchScore: 86, transferableFitScore: 80, learningSignalScore: 70, writingQualityScore: 85, attentionToDetailScore: 83, authenticityScore: 88, specificityScore: 85, hardRequirementConflicts: ['The job asks for "Typing speed of at least 45 words a minute with high accuracy"; the candidate typed 38 WPM.'] },
    E: { directMatchScore: 56, transferableFitScore: 76, learningSignalScore: 86, writingQualityScore: 82, attentionToDetailScore: 82, authenticityScore: 88, specificityScore: 78, hardRequirementConflicts: ['The job asks for "At least 2 years of customer or chat support experience, including time leading, coaching or training a team"; the candidate has about 1 year.'] },
    F: { directMatchScore: 58, transferableFitScore: 58, learningSignalScore: 38, writingQualityScore: 70, attentionToDetailScore: 48, authenticityScore: 45, specificityScore: 30, hardRequirementConflicts: [] },
  },
  live: {
    A: { directMatchScore: 94, transferableFitScore: 93, learningSignalScore: 89, writingQualityScore: 95, attentionToDetailScore: 94, authenticityScore: 83, specificityScore: 95, hardRequirementConflicts: [] },
    B: { directMatchScore: 67, transferableFitScore: 78, learningSignalScore: 82, writingQualityScore: 94, attentionToDetailScore: 88, authenticityScore: 78, specificityScore: 72, hardRequirementConflicts: ['The job asks for "At least 2 years of customer or chat support experience, including time leading, coaching or training a team"; the candidate reports "Eighteen months" of support experience and states, "I have not led a team formally."'] },
    C: { directMatchScore: 68, transferableFitScore: 88, learningSignalScore: 76, writingQualityScore: 88, attentionToDetailScore: 80, authenticityScore: 72, specificityScore: 82, hardRequirementConflicts: [C_CONFLICT] },
    D: { directMatchScore: 94, transferableFitScore: 91, learningSignalScore: 88, writingQualityScore: 94, attentionToDetailScore: 89, authenticityScore: 77, specificityScore: 88, hardRequirementConflicts: ['The job requires a "Typing speed of at least 45 words a minute with high accuracy"; the candidate recorded 38 WPM, although accuracy was 98%.'] },
    E: { directMatchScore: 74, transferableFitScore: 82, learningSignalScore: 86, writingQualityScore: 93, attentionToDetailScore: 88, authenticityScore: 80, specificityScore: 81, hardRequirementConflicts: ['The job asks for “At least 2 years of customer or chat support experience, including time leading, coaching or training a team”; the candidate states “1 year as a chat agent at Lumen Play Support.”'] },
    F: { directMatchScore: 38, transferableFitScore: 48, learningSignalScore: 25, writingQualityScore: 82, attentionToDetailScore: 45, authenticityScore: 40, specificityScore: 12, hardRequirementConflicts: [] },
  },
};

// ---------------------------------------------------------------------------
// Scoring, in trigger-ava-analysis's order, through the same shared helpers.
// (A guard below fails if trigger-ava-analysis stops calling them.)
// ---------------------------------------------------------------------------

function score(key, judgeSet, overrides = {}) {
  const p = { ...PROFILES[key], ...(overrides.profile || {}) };
  const notes = notesFor(p);
  if (overrides.notes) overrides.notes(notes);
  const judge = { ...JUDGE[judgeSet][key], ...(overrides.judge || {}) };

  const family = inferJobFamily(JOB.title, JOB.description);
  const quizReading = readQuizResult(notes);
  const quizAreas = quizAreaBreakdown(quizReading?.answers, JOB.quiz_questions);
  const chatSimulation = readChatSimulationResult(notes.chatSimulationResult);
  const chatInterview = readChatInterviewResult(notes.chatInterviewResult);
  const formDealBreakers = formDealBreakersFrom(JOB.application_questions, notes.applicationAnswers);
  const formReviewFlags = formReviewFlagsFrom(JOB.application_questions, notes.applicationAnswers);
  const equipmentCheck = recordedEquipmentCheck(notes, ["step_connection"]);
  const typingTest = notes.typingTestResult;
  const requiredWpm = typingTest?.requiredWpm ?? JOB.required_wpm;
  const ungradedPhases = [
    ...(chatSimulation && !chatSimulation.graded ? ["chat simulation"] : []),
    ...(chatInterview && !chatInterview.graded ? ["chat interview"] : []),
  ];

  const quizScore = quizReading?.score ?? null;
  const chatSimulationScore = chatSimulation?.score ?? null;
  const chatInterviewScore = chatInterview?.score ?? null;
  const browserTranscriptPhases = [
    ...(chatSimulationScore !== null && chatSimulation?.transcriptSource === "browser" ? ["chat simulation"] : []),
    ...(chatInterviewScore !== null && chatInterview?.transcriptSource === "browser" ? ["chat interview"] : []),
  ];
  const progress = highSignalProgress({
    quizScore, quizConfigured: true, workflowSteps: JOB.workflow_steps, typingScore: typingTest?.score,
    voiceScore: null, portfolioScore: null, chatSimulationScore, salesSimulationScore: null, chatInterviewScore,
    videoIntroScore: null, videoIntroSubmitted: false,
  });
  const newScore = computeJudgmentScore({
    ...judge,
    leadershipEvidenceScore: p.leadership,
    adaptabilityEvidenceScore: p.adaptability,
    jobFamily: family,
    pendingPhases: progress.pendingTopicPhases,
    takenPhases: progress.completed,
  });
  const finalScore = phaseBlendScore({
    family, judgmentScore: newScore, quizScore, typingTest, chatSimulationScore,
    salesSimulationScore: null, chatInterviewScore, voiceScore: null, portfolioScore: null,
  });
  const scorecard = buildAvaScorecard({
    finalScore, passingScore: JOB.passing_score, quizScore, quizConfigured: true, typingTest, requiredWpm, equipmentCheck,
    voiceScore: null, portfolioScore: null, chatSimulationScore, salesSimulationScore: null, chatInterviewScore,
    videoIntroScore: null, videoIntroSubmitted: false, analysisText: narrative(p.narrative),
    resumeUnavailable: true, resumeTextUsed: false, resumeImageCount: 0, applicationAnswerCount: notes.applicationAnswers.length,
    coverLetterProvided: false, workflowSteps: JOB.workflow_steps, jobTitle: JOB.title, jobDescription: JOB.description,
    jobRequirements: JOB.requirements, jobSkillsRequired: JOB.skills_required, experienceLevel: JOB.experience_level,
    processingMode: JOB.processing_mode, ...judge, leadershipEvidenceScore: p.leadership, adaptabilityEvidenceScore: p.adaptability,
    transferableEvidence: [], formDealBreakers, quizCorrect: quizReading?.correct ?? null, quizTotal: quizReading?.total ?? null,
    quizMissedAreas: quizAreas.missed, quizMustPassMissed: quizAreas.mustPassMissed,
    interviewCredibility: chatInterview?.credibilityRating ?? null, ungradedPhases, formReviewFlags,
    // The job asks for no resume and none was sent (trigger-ava-analysis: job.require_resume || a resume found).
    resumeRequested: JOB.require_resume === true,
    // The tests' own findings, handed over exactly as trigger-ava-analysis does.
    chatNewPromiseQuote: chatSimulation?.newPromiseMade ? chatSimulation.newPromiseQuote : null,
    chatDisrespectQuote: chatSimulation?.disrespectMade ? chatSimulation.disrespectQuote : null,
    chatNeedsReview: chatSimulation?.needsReview ?? false,
    chatReviewReasons: chatSimulation?.reviewReasons ?? [],
    interviewIncomplete: chatInterview?.incomplete ?? false,
    interviewMustCoverMissing: chatInterview?.mustCoverMissing ?? [],
    interviewLeadership: chatInterview?.leadership ?? null,
    interviewAdaptability: chatInterview?.adaptability ?? null,
    interviewWorkingLead: chatInterview?.workingLead ?? null,
    browserTranscriptPhases,
    evidenceFingerprint: `lead-${key}`,
  });
  return { key, family, newScore, finalScore, scorecard };
}

function ranked(results) {
  return [...results].sort((a, b) => b.scorecard.overallScore - a.scorecard.overallScore);
}

console.log("The job is a team lead:\n");
assert(inferJobFamily(JOB.title, JOB.description) === "team_lead", `"${JOB.title}" reads as team_lead`);
assert(inferJobFamily("Customer Support Chat Agent (Zulu Royal & Zulu Rush)", "Remote chat support for players. Pass anything you cannot solve to your team lead or supervisor.") === "support",
  "an agent job whose text mentions 'your team lead' and 'supervisor' stays support");
assert(inferJobFamily("Shift Lead", "Run the evening shift of our chat support team.") === "team_lead", "'Shift Lead' of a chat support team is a team lead");
assert(inferJobFamily("Chat Agent", "This is a working lead role: you answer players and lead the team.") === "team_lead", "a description calling the role a working lead is a team lead");
// 2026-10-06 (second pass): a sentence about somebody ELSE leading a team, or
// a lead job outside chat or customer support, does not switch the family.
for (const [title, description, family] of [
  ["Live Chat Agent", "Answer players in chat. Our supervisors lead a team of 10 agents; you report to one of them.", "general"],
  ["Customer Support Agent", "Join our support team. Your manager will lead a team of 8 agents and you will report to them.", "support"],
  ["Customer Support Representative", "You will work with the team lead role holders on escalations.", "support"],
  ["Nursing Supervisor", "Clinical role on a busy ward.", "healthcare"],
  ["Warehouse Shift Lead", "Pick and pack.", "general"],
  ["Team Leader", "Retail store.", "retail_hospitality"],
]) {
  assert(inferJobFamily(title, description) === family, `"${title}" / "${description.slice(0, 45)}…" stays ${family} (got ${inferJobFamily(title, description)})`);
}
assert(inferJobFamily("Senior Agent", "We're hiring a shift lead for our customer support team. You will lead a team of five.") === "team_lead",
  "a description that hires THIS role as a lead of a support team is a team lead");
assert(orphanFlagOptions(JOB.application_questions).length === 0, "the job's flag options all name a real option (a renamed option would silently catch nobody)");

for (const judgeSet of ["expected", "live"]) {
  console.log(`\n== Judge sub-scores: ${judgeSet} ==\n`);
  const results = Object.keys(PROFILES).map((key) => score(key, judgeSet));
  const by = Object.fromEntries(results.map((r) => [r.key, r]));
  const order = ranked(results);

  console.table(order.map((r) => ({
    who: r.key,
    overall: r.scorecard.overallScore,
    judgment: r.newScore,
    tests: r.finalScore,
    rec: r.scorecard.recommendedAction,
    status: r.scorecard.hardRequirementStatus,
    dealBreakers: (r.scorecard.dealBreakerFlags || []).join(" | ").slice(0, 50),
  })));
  for (const r of order) console.log(`  ${r.key}: ${r.scorecard.rationale.replace(/\n/g, "\n      ")}`);
  console.log("");

  assert(order[0].key === "A", `A ranks first (${order.map((r) => `${r.key} ${r.scorecard.overallScore}`).join(" > ")})`);
  assert(by.A.scorecard.overallScore > by.E.scorecard.overallScore, `A above E (${by.A.scorecard.overallScore} > ${by.E.scorecard.overallScore})`);
  assert(by.A.scorecard.overallScore > by.B.scorecard.overallScore, `A above B, the polished writer who never led (${by.A.scorecard.overallScore} > ${by.B.scorecard.overallScore})`);

  const dFlags = by.D.scorecard.riskFlags;
  assert(dFlags.includes("Typed 38 WPM; the job asks for 45"), `D is flagged for typing below the bar (${JSON.stringify(dFlags.filter((f) => /WPM/.test(f)))})`);
  assert(dFlags.some((f) => /^Connection below the job's bar \(download, upload\)$/.test(f)), "D is flagged for the connection");
  assert(by.D.scorecard.overallScore > by.B.scorecard.overallScore, `D is not sunk below B (${by.D.scorecard.overallScore} > ${by.B.scorecard.overallScore})`);
  assert(by.D.scorecard.recommendedAction !== "reject" && by.D.scorecard.hardRejectReason === null, `D is never recommended for decline over typing or the line (${by.D.scorecard.recommendedAction})`);
  assert(!dFlags.some((f) => /recorded 38 WPM|typed 38 WPM\./.test(f)), "the judge's own typing sentence is not shown twice beside the measured flag");

  assert(by.C.scorecard.dealBreakerFlags?.includes(DEAL_BREAKER), `C carries the deal-breaker "${DEAL_BREAKER}"`);
  assert(by.C.scorecard.recommendedAction !== "advance", `C is not "advance" (${by.C.scorecard.recommendedAction})`);
  assert(by.C.scorecard.overallScore < JOB.passing_score, `C's recommended decline sorts below the pass mark (${by.C.scorecard.overallScore})`);
  assert(by.C.scorecard.whyDown?.includes(DEAL_BREAKER), "C's 'Why down' says it in the owner's own words");

  assert(order[order.length - 1].key === "F", `F ranks last (${order.map((r) => r.key).join(" > ")})`);
  assert(by.F.scorecard.recommendedAction !== "advance", `F is not "advance" (${by.F.scorecard.recommendedAction})`);
  assert(by.F.scorecard.riskFlags.includes("Missed the integrity question on the skills check") && by.F.scorecard.riskFlags.includes("Missed the money rules question on the skills check"),
    "F's misses on the integrity and money questions are shown, not hidden in a 30%");

  const advancing = results.filter((r) => r.scorecard.recommendedAction === "advance").map((r) => r.key);
  assert(advancing.length <= 2, `no more than two "advance" (${advancing.join(", ") || "none"})`);
  assert(advancing.includes("A"), "and A is one of them");
  for (const r of results) {
    if (r.scorecard.recommendedAction === "advance") {
      assert(r.scorecard.hardRequirementStatus === "met", `${r.key}: "advance" only with every hard requirement met`);
    }
  }
  assert(/Why up: .*Clear evidence of leading a team \(90\/100\)/.test(by.A.scorecard.rationale), "A's rationale says why, from facts");
  assert(/Why down: .*Little evidence of leading a team \(25\/100\)/.test(by.B.scorecard.rationale), "B's rationale says what pulled the number down");
}

console.log("\n== What a lead's number is made of ==\n");

// The tests half, alone: chat 0.35, skills check 0.30, written interview 0.25,
// typing 0.10. The judge's score is not in it (it is the other half, once).
const blend = (over) => phaseBlendScore({
  family: "team_lead", judgmentScore: 10, quizScore: 0, typingTest: { score: 0, wpm: 0, accuracy: 0 },
  chatSimulationScore: 0, salesSimulationScore: null, chatInterviewScore: 0, voiceScore: null, portfolioScore: null, ...over,
});
assert(blend({ quizScore: 80, typingTest: { score: 80 }, chatSimulationScore: 80, chatInterviewScore: 80 }) === 80, "the judge's score is not inside the tests half (counted once)");
assert(blend({ chatSimulationScore: 100 }) === 35, "escalated chat practice weighs 0.35 of the tests");
assert(blend({ quizScore: 100 }) === 30, "skills check 0.30");
assert(blend({ chatInterviewScore: 100 }) === 25, "written interview 0.25");
assert(blend({ typingTest: { score: 100 } }) === 10, "typing 0.10");
assert(blend({ quizScore: 100, typingTest: { score: 100, wpm: 70, accuracy: 99 } }) === 40, "no quiz or typing floor props up a lead's failed tests");

// The whole number once every test is done: judgment 0.35, tests 0.65.
// Effective weights for this job: judgment 0.35, chat 0.2275, skills check
// 0.195, interview 0.1625, typing 0.065 (before: judgment 0.793, chat 0.073,
// skills check 0.053, interview 0.040, typing 0.040).
const finishedLead = (judgmentSubs, tests) => buildAvaScorecard({
  finalScore: tests, passingScore: 60, quizScore: 90, quizConfigured: true, typingTest: { wpm: 60, score: 100, accuracy: 97 },
  voiceScore: null, portfolioScore: null, chatSimulationScore: 80, salesSimulationScore: null, chatInterviewScore: 80,
  videoIntroScore: null, videoIntroSubmitted: false, analysisText: "", resumeUnavailable: true, resumeTextUsed: false,
  resumeImageCount: 0, applicationAnswerCount: 4, coverLetterProvided: false, workflowSteps: JOB.workflow_steps,
  jobTitle: JOB.title, jobDescription: JOB.description, experienceLevel: "lead", processingMode: "auto",
  ...judgmentSubs, hardRequirementConflicts: [], evidenceFingerprint: "weights",
});
const zeroJudge = { directMatchScore: 0, transferableFitScore: 0, learningSignalScore: 0, writingQualityScore: 0, attentionToDetailScore: 0, specificityScore: 0, authenticityScore: 100, leadershipEvidenceScore: 0, adaptabilityEvidenceScore: 0 };
const fullJudge = { directMatchScore: 100, transferableFitScore: 100, learningSignalScore: 100, writingQualityScore: 100, attentionToDetailScore: 100, specificityScore: 100, authenticityScore: 100, leadershipEvidenceScore: 100, adaptabilityEvidenceScore: 100 };
assert(finishedLead(zeroJudge, 100).overallScore === 65, `tests decide 0.65 once they are done (${finishedLead(zeroJudge, 100).overallScore})`);
assert(finishedLead(fullJudge, 0).overallScore === 35, `the judgment decides 0.35 (${finishedLead(fullJudge, 0).overallScore})`);
for (const judgeSet of ["expected", "live"]) {
  for (const key of ["A", "B", "D", "E"]) {
    const r = score(key, judgeSet);
    assert(r.scorecard.overallScore === Math.round(0.35 * r.newScore + 0.65 * r.finalScore),
      `${judgeSet} ${key}: overall ${r.scorecard.overallScore} = 0.35 × ${r.newScore} + 0.65 × ${r.finalScore}`);
  }
}

console.log("\n== The outcome does not hang on how the judge worded a sentence ==\n");

const cNoConflict = score("C", "expected", { judge: { hardRequirementConflicts: [] } });
assert(cNoConflict.scorecard.dealBreakerFlags?.includes(DEAL_BREAKER) && cNoConflict.scorecard.recommendedAction !== "advance",
  `C with NO conflict listed is still flagged and not "advance" (${cNoConflict.scorecard.recommendedAction})`);
const cNoShift = score("C", "expected", { judge: { hardRequirementConflicts: ["The job is a working lead role that answers players; the candidate would rather mostly manage."] } });
assert(cNoShift.scorecard.hardRejectReason === DEAL_BREAKER, `C worded without "shift": the form deal-breaker is the reason (${JSON.stringify(cNoShift.scorecard.hardRejectReason)})`);

const dRequired = score("D", "expected", { judge: { hardRequirementConflicts: ["Typing speed of 38 WPM is below the required 45 WPM."] } });
const dBase = score("D", "expected");
assert(dRequired.scorecard.hardRejectReason === null && dRequired.scorecard.recommendedAction === dBase.scorecard.recommendedAction,
  `D: "below the required 45 WPM" no longer turns review into decline (${dRequired.scorecard.recommendedAction})`);
assert(dRequired.scorecard.overallScore === dBase.scorecard.overallScore, `and costs nothing on top of the typing score (${dRequired.scorecard.overallScore} vs ${dBase.scorecard.overallScore})`);
const dConnection = score("D", "expected", { judge: { hardRequirementConflicts: ['The job asks for "a reliable internet connection"; the measured 6.2 Mbps download is below the 10 Mbps bar.'] } });
const dClean = score("D", "expected", { judge: { hardRequirementConflicts: [] } });
assert(dConnection.newScore === dClean.newScore && dConnection.scorecard.overallScore === dClean.scorecard.overallScore,
  `D: a connection conflict lowers neither the judgment nor the score (${dConnection.newScore}/${dConnection.scorecard.overallScore} vs ${dClean.newScore}/${dClean.scorecard.overallScore})`);

for (const [key, note] of [["B", "Lacks the required experience leading, coaching or training a team."], ["E", "Has about 1 year of support experience against the required 2 years."]]) {
  const r = score(key, "expected", { judge: { hardRequirementConflicts: [note] } });
  assert(r.scorecard.recommendedAction === "review" && r.scorecard.hardRejectReason === null, `${key}: "the required …" is a gap to review, not a decline (${r.scorecard.recommendedAction})`);
}

const fRewarded = score("F", "expected", { profile: { chat: { ...PROFILES.F.chat, scores: { score: 78, empathy: 88, problemSolving: 74 } } } });
const fieldWithRewardedF = ["A", "B", "C", "D", "E"].map((key) => score(key, "expected")).concat([fRewarded]);
assert(ranked(fieldWithRewardedF).at(-1).key === "F" && fRewarded.scorecard.recommendedAction !== "advance",
  `F stays last and not "advance" even if the chat grader rewards his promises (78): ${fRewarded.scorecard.overallScore} ${fRewarded.scorecard.recommendedAction}`);

console.log("\n== A real 0 is a score; an ungraded result is not ==\n");

const fZero = score("F", "expected", { profile: { quizPicks: [0, 1, 0, 0, 0, 1, 0, 0, 1, 0] } });
assert(fZero.scorecard.completedHighSignalPhases.includes("quiz") && !fZero.scorecard.pendingHighSignalPhases.includes("quiz"),
  `0/10 on the skills check counts as taken (pending: ${JSON.stringify(fZero.scorecard.pendingHighSignalPhases)})`);
assert(fZero.scorecard.recommendedAction === "reject", `and F with 0/10 is "reject", not "review" (${fZero.scorecard.recommendedAction})`);
const fThree = score("F", "expected");
assert(fZero.scorecard.overallScore <= fThree.scorecard.overallScore, `0/10 never scores above 3/10 (${fZero.scorecard.overallScore} vs ${fThree.scorecard.overallScore})`);

const aUngraded = score("A", "expected", {
  notes: (notes) => {
    notes.chatSimulationResult = { ...notes.chatSimulationResult, graded: false, score: 70, empathy: 70, problemSolving: 70 };
  },
});
assert(aUngraded.scorecard.pendingHighSignalPhases.includes("chat simulation"), "a chat practice stored as graded:false is not counted as taken");
assert(aUngraded.scorecard.riskFlags.includes("Escalated chat practice was not graded (the grader failed); open the transcript"),
  `and the owner is told the grader failed and where to look (${JSON.stringify(aUngraded.scorecard.riskFlags.filter((f) => /graded/.test(f)))})`);
assert(!aUngraded.scorecard.evidenceRefs.some((ref) => ref.startsWith("chat_simulation:")), "its placeholder 70 is not evidence");

console.log("\n== A gamed or thin profile does not carry 'advance' (2026-10-06, second pass) ==\n");

// The audit's runs, made from the six profiles' own numbers: each read
// "advance" with every requirement "met". Each is "review" now, with the
// number unchanged (a shortfall keeps the card off "advance"; it is never a
// penalty and never a decline).
const aBase = score("A", "expected");
const notAdvance = (label, r) => {
  assert(r.scorecard.recommendedAction === "review" && r.scorecard.hardRequirementStatus === "mixed" && r.scorecard.hardRejectReason === null,
    `${label}: "review", not "advance" or a decline (${r.scorecard.overallScore} ${r.scorecard.recommendedAction}/${r.scorecard.hardRequirementStatus})`);
};
const aMoney = score("A", "expected", { profile: { quizPicks: [1, 0, 2, 1, 3, 1, 2, 0, 0, 3] } }); // 8/10, wrong on integrity AND money rules
notAdvance("A who missed the integrity and money-rules questions (8/10)", aMoney);
assert(aMoney.scorecard.riskFlags.includes("Missed the integrity question on the skills check") && aMoney.scorecard.riskFlags.includes("Missed the money rules question on the skills check"),
  "and both misses are shown");
const aChat20 = score("A", "expected", {
  profile: { quizPicks: [1, 0, 2, 1, 3, 0, 2, 2, 0, 3], chat: { ...PROFILES.A.chat, scores: { score: 20, empathy: 40, problemSolving: 15 } }, interview: { ...PROFILES.A.interview, score: 80 } },
});
notAdvance("a perfect skills check behind an escalated chat practice of 20", aChat20);
const aInterview0 = score("A", "expected", { profile: { interview: { ...PROFILES.A.interview, score: 0, recommendation: "No Hire" } } });
notAdvance("a written interview of 0", aInterview0);
const bNoConflict = score("B", "expected", { judge: { hardRequirementConflicts: [] } });
notAdvance("B, never led (leadership 25), with no conflict listed by the judge", bNoConflict);
assert(bNoConflict.scorecard.whyDown?.some((line) => /Little evidence of leading a team \(25\/100\)/.test(line)), "and the card says why");
const aVague = score("A", "expected", { profile: { leadership: 45, adaptability: 40 } });
notAdvance("a vague, huge leading claim (leadership 45) with strong tests", aVague);
const aLowCred = score("A", "expected", { profile: { interview: { ...PROFILES.A.interview, credibilityRating: "Low" } } });
notAdvance("A with the interview's credibility rated Low", aLowCred);
assert(aLowCred.scorecard.overallScore === aBase.scorecard.overallScore && !(aLowCred.scorecard.dealBreakerFlags ?? []).length,
  `and Low credibility costs nothing and is no deal-breaker (${aLowCred.scorecard.overallScore} = ${aBase.scorecard.overallScore})`);

console.log("\n== The escalated chat's and the interview's own findings (2026-10-06, third pass) ==\n");

// The escalated rubric's stored result (ai-chat-simulation/grading.ts
// buildChatSimulationResult): a new promise confirmed in the lead's own lines
// caps the stored score at 40 and carries the quote.
const PROMISE = "I'll make sure the bonus is in your account by tonight";
const leadChatResult = (extra) => ({
  scenario: "lead-refund-promised", scenarioId: "lead-refund-promised", messageCount: 8, completed: true,
  score: 88, empathy: 90, problemSolving: 86, strengths: [], improvements: [],
  rubric: "team_lead", ownership: 90, correctedAgent: 85, accuracy: 88, infoAsked: 86, nextStep: 84, tone: 90,
  newPromiseMade: false, newPromiseQuote: null, newPromiseUnverified: null, disrespectMade: false, disrespectQuote: null, cappedBy: [],
  antiCheatSummary: { hasViolations: false, violationCount: 0, tabSwitches: 0, copyPasteAttempts: 0 },
  ...extra,
});
assert(aBase.scorecard.recommendedAction === "advance", `A as the clean baseline is "advance" (${aBase.scorecard.recommendedAction})`);
const aPromise = score("A", "expected", {
  notes: (notes) => {
    notes.chatSimulationResult = leadChatResult({ score: 40, newPromiseMade: true, newPromiseQuote: PROMISE, newPromiseLine: 5, cappedBy: ["new_promise"] });
  },
});
const promiseFlag = `Made a new promise in the escalated chat: "${PROMISE}"`;
assert(aPromise.scorecard.riskFlags.includes(promiseFlag),
  `A whose escalated chat made a new promise carries the flag with the quote (${JSON.stringify(aPromise.scorecard.riskFlags.filter((f) => /promise/i.test(f)))})`);
assert(aPromise.scorecard.recommendedAction !== "advance" && aPromise.scorecard.hardRejectReason === null,
  `and is not "advance", and not a decline either (${aPromise.scorecard.overallScore} ${aPromise.scorecard.recommendedAction})`);
// The flag alone holds the card, even where the score was not capped (a
// result stored before the cap, or a cap changed later).
const aPromiseUncapped = score("A", "expected", {
  notes: (notes) => {
    notes.chatSimulationResult = leadChatResult({ newPromiseMade: true, newPromiseQuote: PROMISE });
  },
});
notAdvance("a new promise in the escalated chat, score left at 88", aPromiseUncapped);
assert(aPromiseUncapped.scorecard.riskFlags.includes(promiseFlag) && aPromiseUncapped.scorecard.overallScore === aBase.scorecard.overallScore,
  `and the flag costs nothing on top of the chat's own score (${aPromiseUncapped.scorecard.overallScore} = ${aBase.scorecard.overallScore})`);
const aUnconfirmed = score("A", "expected", {
  notes: (notes) => {
    notes.chatSimulationResult = leadChatResult({ newPromiseMade: false, newPromiseQuote: PROMISE });
  },
});
assert(!aUnconfirmed.scorecard.riskFlags.some((f) => /new promise/.test(f)), "a quote without a confirmed newPromiseMade is not a new-promise flag");
const aRude = score("A", "expected", {
  notes: (notes) => {
    notes.chatSimulationResult = leadChatResult({ score: 30, disrespectMade: true, disrespectQuote: "Read the rules next time", cappedBy: ["disrespect"] });
  },
});
assert(aRude.scorecard.riskFlags.includes('Was disrespectful to the player in the escalated chat: "Read the rules next time"') && aRude.scorecard.recommendedAction !== "advance",
  `disrespect in the escalated chat is shown in the lead's words and is not "advance" (${aRude.scorecard.recommendedAction})`);
const aReview = score("A", "expected", {
  notes: (notes) => {
    notes.chatSimulationResult = leadChatResult({ needsReview: true, reviewReasons: ['Possible new promise, not confirmed (not on a lead line): "we will refund you"'], newPromiseUnverified: "we will refund you" });
  },
});
notAdvance("an escalated chat the grader wants a person to read", aReview);
assert(aReview.scorecard.riskFlags.includes('Chat practice needs a person to read it: Possible new promise, not confirmed (not on a lead line): "we will refund you"'),
  "and the owner is told why");
const aCutShort = score("A", "expected", {
  profile: { interview: { ...PROFILES.A.interview, leadership: 88, adaptability: null, workingLead: 82, writtenEnglish: 90, incomplete: true, mustCoverMissing: ["a sudden change they handled"] } },
});
notAdvance("a lead interview that ended before its plan was covered", aCutShort);
assert(aCutShort.scorecard.riskFlags.includes("Interview ended before the lead plan was covered (not asked: a sudden change they handled)"),
  `and it names the topic never asked (${JSON.stringify(aCutShort.scorecard.riskFlags.filter((f) => /Interview ended/.test(f)))})`);
const aCutShortNested = score("A", "expected", {
  notes: (notes) => {
    notes.chatInterviewResult = {
      messages: [], duration: "12:00", questionCount: 6, incomplete: true,
      evaluation: { graded: true, score: 86, recommendation: "Strong Hire", credibilityRating: "High", leadership: 88, adaptability: null, workingLead: 82, writtenEnglish: 90, incomplete: true, mustCoverMissing: ["a sudden change they handled"] },
    };
  },
});
assert(aCutShortNested.scorecard.riskFlags.includes("Interview ended before the lead plan was covered (not asked: a sudden change they handled)"),
  "the auto-end (nested) shape says the same");
const nestedReading = readChatInterviewResult({ evaluation: { graded: true, score: 70, leadership: 60, adaptability: 55, workingLead: 80, writtenEnglish: 90, leadEvidence: { leadership: "I led 6 agents" } } });
assert(nestedReading.leadership === 60 && nestedReading.adaptability === 55 && nestedReading.workingLead === 80 && nestedReading.leadEvidence.leadership === "I led 6 agents",
  "the interview's lead marks and quotes are read from the nested shape too");
const aBrowser = score("A", "expected", {
  notes: (notes) => {
    notes.chatSimulationResult = { ...notes.chatSimulationResult, transcriptSource: "browser" };
  },
});
notAdvance("an escalated chat graded from the page's own transcript", aBrowser);
assert(aBrowser.scorecard.riskFlags.includes("Escalated chat practice was graded from the transcript the page sent, not our own record; read it before trusting the mark"),
  "and it is flagged as not trusted");
assert(aBrowser.scorecard.completedHighSignalPhases.includes("chat simulation") && aBrowser.scorecard.decisionState === "ready_for_decision",
  "but it still counts as taken: a job without the record system is never parked waiting for a test already done");
const aBrowserInterview = score("A", "expected", { profile: { interview: { ...PROFILES.A.interview, transcriptSource: "browser" } } });
assert(aBrowserInterview.scorecard.riskFlags.includes("Written interview was graded from the transcript the page sent, not our own record; read it before trusting the mark")
  && aBrowserInterview.scorecard.recommendedAction !== "advance", "an interview graded from the page's own answers is flagged and not \"advance\"");
const ungradedBrowser = readChatSimulationResult({ graded: false, score: null, transcriptSource: "browser", newPromiseMade: true, newPromiseQuote: PROMISE, needsReview: true, reviewReasons: ["x"] });
assert(ungradedBrowser.newPromiseMade === false && ungradedBrowser.newPromiseQuote === null && ungradedBrowser.needsReview === false,
  "a result nobody marked carries no findings");

console.log("\n== Promise words alone are a pointer, not a hold (2026-10-06, fourth pass) ==\n");

// The server's word check reads a lead line the reviewer did not flag. Only
// a finding holds the card: a reviewer flag the server could not confirm, or
// a confirmed promise or disrespect. "today" from the case's own facts used
// to turn a 91 "advance" into a 91 "review".
assert(isPromiseWordsOnlyReason(`${PROMISE_WORDS_REASON_PREFIX}: line 4: "x"`) && !isPromiseWordsOnlyReason('Possible new promise, not confirmed (not on a lead line): "x"'),
  "the scorecard recognises the word check's own reason (grading.ts PROMISE_WORDS_REASON_PREFIX), and only it");
const GRACE_CASE = "Since this morning, a new rule says every player must verify their phone number. A team leader has now taken over the chat.\n\nWhat the team leader knows: the phone check started today for every player, not just her. Nobody can speed it up or promise a time.";
const leadReview = Object.fromEntries(["ownership", "correctedAgent", "accuracy", "infoAsked", "nextStep", "tone"].map((k) => [k, { score: 90, quote: "" }]));
const gradedChat = (leadLine) => {
  const messages = [{ role: "assistant", content: "Why should I trust you?" }, { role: "user", content: leadLine }];
  const evaluation = leadEvaluationFrom({ ...leadReview, newPromiseMade: false, playerDisrespected: false, strengths: [], improvements: [] }, messages, { caseText: GRACE_CASE });
  return buildChatSimulationResult({ scenario: GRACE_CASE, messageCount: 2, evaluation, violations: [] });
};
const factToday = gradedChat("The phone check started today for every player, so everyone does the same step.");
const factMorning = gradedChat("The phone check started this morning for every player, so everyone does the same step.");
assert(factToday.needsReview !== true && factMorning.needsReview !== true,
  "a lead line stating the case's own fact ('started today') is not promise words at all");
const tonightPromise = gradedChat("Don't worry Grace, you'll have it by tonight.");
assert(tonightPromise.needsReview === true && tonightPromise.reviewReasons.every(isPromiseWordsOnlyReason),
  "a time promise the reviewer missed is still caught by the word check");
const aWords = score("A", "expected", { notes: (notes) => { notes.chatSimulationResult = { ...leadChatResult({}), needsReview: true, reviewReasons: tonightPromise.reviewReasons }; } });
assert(aWords.scorecard.recommendedAction === aBase.scorecard.recommendedAction && aWords.scorecard.hardRequirementStatus === aBase.scorecard.hardRequirementStatus && aWords.scorecard.overallScore === aBase.scorecard.overallScore,
  `promise words alone leave the card as it was (${aWords.scorecard.overallScore} ${aWords.scorecard.recommendedAction}/${aWords.scorecard.hardRequirementStatus})`);
assert(aWords.scorecard.riskFlags.some((f) => f.startsWith(`Chat practice may be worth a read: ${PROMISE_WORDS_REASON_PREFIX}`)) && !aWords.scorecard.riskFlags.some((f) => /needs a person to read it/.test(f)),
  "but the owner is shown the line, as a pointer");
const aWordsAndFlag = score("A", "expected", {
  notes: (notes) => {
    notes.chatSimulationResult = { ...leadChatResult({ newPromiseUnverified: "we will refund you" }), needsReview: true,
      reviewReasons: [...tonightPromise.reviewReasons, 'Possible new promise, not confirmed (not on a lead line): "we will refund you"'] };
  },
});
notAdvance("promise words AND a reviewer flag the server could not confirm", aWordsAndFlag);
assert(aWordsAndFlag.scorecard.riskFlags.includes('Chat practice needs a person to read it: Possible new promise, not confirmed (not on a lead line): "we will refund you"'),
  "and the hold names the reviewer's flag, not the words");
const aNoReason = score("A", "expected", { notes: (notes) => { notes.chatSimulationResult = { ...leadChatResult({}), needsReview: true, reviewReasons: [] }; } });
notAdvance("a chat marked for a person with no reason given", aNoReason);

console.log("\n== The interview's own lead marks reach the card (2026-10-06, fourth pass) ==\n");

// The judge read the application as clear leading (88); the interview marked
// leading a team at 35. The number is the interview's own (already in its
// score): the card says so and stays on "review".
const aLeadLow = score("A", "expected", {
  profile: { leadership: 88, interview: { ...PROFILES.A.interview, leadership: 35, adaptability: 40, workingLead: 82, writtenEnglish: 90 } },
});
notAdvance("A whose interview marked leading a team 35 and a sudden change 40", aLeadLow);
assert(aLeadLow.scorecard.riskFlags.includes("Interview: little evidence of leading a team (35/100)")
  && aLeadLow.scorecard.riskFlags.includes("Interview: little evidence of handling a sudden change (40/100)"),
  `and both are flags (${JSON.stringify(aLeadLow.scorecard.riskFlags.filter((f) => /^Interview:/.test(f)))})`);
assert(aLeadLow.scorecard.whyDown.includes("Interview: little evidence of leading a team (35/100)"), "and a reason down");
assert(!aLeadLow.scorecard.whyUp.some((line) => /Clear evidence of leading a team|Clear example of handling a sudden change/.test(line)),
  `and the judge's "Clear evidence of leading" no longer stands beside it (${JSON.stringify(aLeadLow.scorecard.whyUp)})`);
assert(aLeadLow.scorecard.overallScore === score("A", "expected", { profile: { leadership: 88 } }).scorecard.overallScore,
  "and the marks cost nothing on top of the interview's own score");
const aLeadFine = score("A", "expected", { profile: { interview: { ...PROFILES.A.interview, leadership: 82, adaptability: 76, workingLead: 80, writtenEnglish: 90 } } });
assert(aLeadFine.scorecard.recommendedAction === "advance" && !aLeadFine.scorecard.riskFlags.some((f) => /^Interview:/.test(f)),
  "lead marks of 50 and up add nothing");
const workingLow = score("A", "expected", { profile: { interview: { ...PROFILES.A.interview, leadership: 82, adaptability: 76, workingLead: 30, writtenEnglish: 90 } } });
assert(workingLow.scorecard.riskFlags.includes("Interview: little evidence of splitting a shift between players and leading (30/100)") && workingLow.scorecard.recommendedAction !== "advance",
  "a working-lead mark under 50 is named too");

console.log("\n== The End button keeps the grader's review (2026-10-06, fourth pass) ==\n");

// The same "Low" interview, recorded by both endings.
const lowEvaluation = {
  graded: true, score: 86, strengths: [], concerns: [], recommendation: "Hire", credibilityRating: "Low",
  summary: "Claims do not match the record.", inconsistencies: [{ claim: "Led 8 agents", evidence: "Could not name one", assessment: "Doubtful" }],
};
for (const path of ["auto_end", "manual"]) {
  const stored = buildChatInterviewResult({ path, messages: [{ role: "user", content: "x" }], duration: path === "manual" ? 600 : "10:00", questionCount: 6, violations: [], evaluation: lowEvaluation });
  const reading = readChatInterviewResult(stored);
  const r = score("A", "expected", { notes: (notes) => { notes.chatInterviewResult = stored; } });
  assert(reading.credibilityRating === "Low" && reading.summary === lowEvaluation.summary && reading.inconsistencies.length === 1
    && r.scorecard.riskFlags.includes(INTERVIEW_CREDIBILITY_FLAG) && r.scorecard.recommendedAction === "review",
    `${path}: credibility, summary and inconsistencies are read, and Low credibility is flagged (${r.scorecard.recommendedAction})`);
}

console.log("\n== A decline-grade flag sorts low before the last test, too ==\n");

// C (form: wants to mostly manage) who stopped after the skills check and the
// typing test sat at 84, above E (honest, finished) and near A: a manage-only
// applicant scored higher by not finishing.
const cMidway = score("C", "expected", {
  notes: (notes) => {
    delete notes.chatSimulationResult;
    delete notes.chatInterviewResult;
  },
});
const eDone = score("E", "expected");
assert(cMidway.scorecard.decisionState === "needs_more_evidence" && cMidway.scorecard.autopilotAction === "defer" && cMidway.scorecard.hardRejectReason === null,
  "C mid-way is still not stopped: the reason waits for the end");
assert(cMidway.scorecard.overallScore < JOB.passing_score && cMidway.scorecard.overallScore < eDone.scorecard.overallScore,
  `but the number already sorts below the pass mark and below E (${cMidway.scorecard.overallScore} < ${eDone.scorecard.overallScore})`);

console.log("\n== A lead job with fewer tests ==\n");

// The tests' 0.65 is for the four tests the weights were built on; a job with
// fewer gives them that share in proportion.
assert(leadTestsCoverage({ quizScore: 80, typingScore: 80, chatSimulationScore: 80, chatInterviewScore: 80 }) === 1, "all four tests: full coverage");
assert(leadTestsCoverage({ typingScore: 90 }) === 0.1 && leadTestsCoverage({ voiceScore: 30 }) === 0.25, "typing only: 0.10; a voice interview only: 0.25");
const fewerTests = (steps, tests, judge, extra = {}) => {
  const typingTest = tests.typing ?? null;
  return buildAvaScorecard({
    finalScore: phaseBlendScore({
      family: "team_lead", judgmentScore: judge, quizScore: tests.quiz ?? null, typingTest, chatSimulationScore: tests.chat ?? null,
      salesSimulationScore: null, chatInterviewScore: tests.interview ?? null, voiceScore: tests.voice ?? null, portfolioScore: null,
    }),
    passingScore: 60, quizScore: tests.quiz ?? null, quizConfigured: tests.quiz !== undefined, typingTest, requiredWpm: 45, voiceScore: tests.voice ?? null,
    portfolioScore: null, chatSimulationScore: tests.chat ?? null, salesSimulationScore: null, chatInterviewScore: tests.interview ?? null,
    videoIntroScore: null, videoIntroSubmitted: false, analysisText: "", resumeUnavailable: true, resumeRequested: false, resumeTextUsed: false,
    resumeImageCount: 0, applicationAnswerCount: 6, coverLetterProvided: false, workflowSteps: steps, jobTitle: "Support Shift Lead",
    jobDescription: "Lead the evening chat support team.", experienceLevel: "lead", processingMode: "auto", judgmentScoreOverride: judge,
    hardRequirementConflicts: [], evidenceFingerprint: "fewer", ...extra,
  });
};
const typingOnly = [{ id: "t", type: "typing_test" }];
const weakWriterTyped50 = fewerTests(typingOnly, { typing: { wpm: 50, accuracy: 97, score: 97, requiredWpm: 45 } }, 38);
assert(weakWriterTyped50.overallScore <= 45, `typing only: one typing test no longer decides 65% of a weak never-led writer's number (${weakWriterTyped50.overallScore}; was 76)`);
const voiceOnly = [{ id: "v", type: "voice_interview" }];
const voice30 = fewerTests(voiceOnly, { voice: 30 }, 83);
assert(voice30.overallScore >= 70, `voice only: a 30 voice interview weighs 0.1625, not 0.65 (${voice30.overallScore}; was 49)`);
const twoTests = [{ id: "t", type: "typing_test" }, { id: "s", type: "chat_simulation" }];
const strongTwo = fewerTests(twoTests, { typing: { wpm: 60, accuracy: 98, score: 98, requiredWpm: 45 }, chat: 88 }, 86,
  { directMatchScore: 86, leadershipEvidenceScore: 90, adaptabilityEvidenceScore: 85 });
assert(strongTwo.recommendedAction === "advance" && strongTwo.confidence >= 62, `a strong lead on a two-test job can be "advance" (${strongTwo.recommendedAction}, confidence ${strongTwo.confidence})`);
assert(!strongTwo.riskFlags.includes("Resume could not be analyzed"), "and a job that asks for no resume carries no resume warning");

console.log("\n== When the judge fails, the evidence is not thrown away ==\n");

const narrativeOnly = (judgmentScoreOverride, extra = {}) => buildAvaScorecard({
  finalScore: 80, passingScore: 60, quizScore: 80, quizConfigured: true, typingTest: { wpm: 58, accuracy: 97, score: 97, requiredWpm: 45 },
  voiceScore: null, portfolioScore: null, chatSimulationScore: 80, salesSimulationScore: null, chatInterviewScore: 80, videoIntroScore: null,
  videoIntroSubmitted: false, analysisText: "", resumeUnavailable: true, resumeRequested: false, resumeTextUsed: false, resumeImageCount: 0,
  applicationAnswerCount: 6, coverLetterProvided: false, workflowSteps: JOB.workflow_steps, jobTitle: JOB.title, jobDescription: JOB.description,
  experienceLevel: "lead", processingMode: "auto", hardRequirementConflicts: [], judgmentScoreOverride, evidenceFingerprint: "judge", ...extra,
});
assert(narrativeOnly(90).overallScore > narrativeOnly(30).overallScore + 15,
  `the narrative's own number is the judgment when no sub-scores came back (${narrativeOnly(90).overallScore} vs ${narrativeOnly(30).overallScore}; both were 71)`);
const judgeDown = narrativeOnly(null, { judgeFailed: true });
assert(judgeDown.riskFlags.some((flag) => /Ava could not read the application/.test(flag)) && judgeDown.recommendedAction !== "advance",
  `no judge at all: said plainly, and never "advance" on a placeholder (${judgeDown.recommendedAction})`);
const leadBlend = (quizScore, typing, chat, interview) => phaseBlendScore({
  family: "team_lead", judgmentScore: 56, quizScore, typingTest: { score: typing }, chatSimulationScore: chat, salesSimulationScore: null,
  chatInterviewScore: interview, voiceScore: null, portfolioScore: null,
});
assert(leadBlend(100, 99, 95, 95) > 90 && leadBlend(20, 31, 10, 15) < 20,
  `a lead's tests blend does not need the judge (${leadBlend(100, 99, 95, 95)} vs ${leadBlend(20, 31, 10, 15)}), so trigger-ava-analysis computes it either way`);

console.log("\n== trigger-ava-analysis runs this same sequence ==\n");
const trigger = readFileSync(new URL("../supabase/functions/trigger-ava-analysis/index.ts", import.meta.url), "utf8");
for (const [what, pattern] of [
  ["reads the skills check with readQuizResult", /readQuizResult\(parsedNotes\)/],
  ["joins it to the job's categories", /quizAreaBreakdown\(quizReading\?\.answers, job\?\.quiz_questions\)/],
  ["reads the chat practice with readChatSimulationResult", /readChatSimulationResult\(parsedNotes\.chatSimulationResult\)/],
  ["reads the form's deal-breakers", /formDealBreakersFrom\(job\?\.application_questions, applicationAnswers\)/],
  ["computes the progress once", /highSignalProgress\(\{/],
  ["passes the tests ahead and the tests taken to the judgment", /pendingPhases: progress\.pendingTopicPhases,\s*takenPhases: progress\.completed/],
  ["passes the family to the judgment", /jobFamily: inferredFamily/],
  // The written interview (ai-chat-interview isLeadRole) and the scorecard
  // (buildAvaScorecard) decide a lead with this same helper, so grading and
  // scoring agree; the "Lead / Principal" seniority level alone is not a lead
  // (lead_practice_grading.test.mjs).
  ["decides a lead with inferJobFamily on the title and description, as the interview does", /const inferredFamily = inferJobFamily\(job\?\.title \|\| null, job\?\.description \|\| null\);\s*const teamLead = inferredFamily === "team_lead";/],
  ["blends with phaseBlendScore", /phaseBlendScore\(blendInputs\)/],
  ["hands the form deal-breakers to the scorecard", /formDealBreakers,\n/],
  ["hands the ungraded tests to the scorecard", /ungradedPhases,\n/],
  ["hands the typing bar to the scorecard", /requiredWpm: typingRequiredWpmForFlag/],
  ["reads the form's review-level flags", /formReviewFlagsFrom\(job\?\.application_questions, applicationAnswers\)/],
  ["hands them to the scorecard", /formReviewFlags,\n/],
  ["passes the judge's conflicts with their sources", /hardRequirementConflicts: sourcedConflictNotes\(structuredScore\)/],
  ["uses the narrative's number when no sub-scores came back", /judgmentScoreOverride: structuredScore \? null : newScore/],
  ["says when the judge failed", /judgeFailed: !structuredScore && newScore === null/],
  ["only counts a resume asked for or sent", /resumeRequested: job\?\.require_resume === true \|\| !!detectedResumeUrl/],
  ["hands the escalated chat's new promise to the scorecard", /chatNewPromiseQuote: chatSimulation\?\.newPromiseMade \? chatSimulation\.newPromiseQuote : null/],
  ["hands the escalated chat's disrespect to the scorecard", /chatDisrespectQuote: chatSimulation\?\.disrespectMade \? chatSimulation\.disrespectQuote : null/],
  ["hands a chat that needs a person to the scorecard", /chatNeedsReview: chatSimulation\?\.needsReview \?\? false,\s*chatReviewReasons: chatSimulation\?\.reviewReasons \?\? \[\]/],
  ["hands an interview cut short to the scorecard", /interviewIncomplete: chatInterview\?\.incomplete \?\? false,\s*interviewMustCoverMissing: chatInterview\?\.mustCoverMissing \?\? \[\]/],
  ["hands the interview's own lead marks to the scorecard", /interviewLeadership: chatInterview\?\.leadership \?\? null,\s*interviewAdaptability: chatInterview\?\.adaptability \?\? null,\s*interviewWorkingLead: chatInterview\?\.workingLead \?\? null/],
  ["hands the tests graded from the page's transcript to the scorecard", /browserTranscriptPhases,\n/],
  ["puts the escalated chat's findings in the fingerprint", /newPromiseMade: chatSimulation\.newPromiseMade,[\s\S]{0,400}needsReview: chatSimulation\.needsReview,[\s\S]{0,120}transcriptSource: chatSimulation\.transcriptSource/],
  ["puts the whole interview reading in the fingerprint", /\n\s*chatInterview,\n\s*salesSimulation:/],
  ["blends a lead's tests even with no judge number", /if \(newScore !== null \|\| teamLead\)/],
  ["selects the columns it reads", /jobs\(title, description, requirements, responsibilities, [^)]*application_questions, require_resume, required_wpm/],
]) {
  assert(pattern.test(trigger), `trigger-ava-analysis ${what}`);
}
assert(!/quizData\?\.score \|\||chatSimulationResult\?\.overallScore \|\|/.test(trigger), "trigger-ava-analysis no longer reads a score with `||` (0 used to become 'not taken')");

console.log(failures ? `\n${failures} assertion(s) failed.` : "\nAll assertions passed.");
process.exit(failures ? 1 : 0);
