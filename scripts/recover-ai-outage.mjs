#!/usr/bin/env node
/**
 * recover-ai-outage.mjs — put applicants right after an AI outage.
 *
 * Written for the outage of 2026-10-07 (the OpenAI account answered 429
 * insufficient_quota / credit_balance_exhausted from about 00:36 UTC): the
 * chat practice and the written interview got no AI replies, their grading
 * recorded `graded: false`, and every background analysis (ai-analyze, via
 * trigger-ava-analysis) failed, so finished applicants were left unscored.
 *
 * Everything below is worked out from the database AT RUN TIME. Nothing is
 * read from a list written during the incident, so the script stays correct
 * after applicants retake steps or staff hand steps back (the 02:15 reset
 * did both: it archived the ungraded results under notes.outageRetake and put
 * those applicants back on the step).
 *
 * What it does, in order:
 *
 *   1. Reads the state (read-only SQL through the Management API with
 *      read_only: true, so the database itself refuses any write).
 *   2. Builds the plan (planRecovery, a pure function: see
 *      scripts/recover_ai_outage.test.mjs).
 *   3. If anything needs the AI: ONE tiny health call through an existing
 *      function path (ai-chat-simulation "start" with no application: one
 *      short opening message on the cheap model, the same path that failed
 *      in the outage). It STOPS if OpenAI still says the credit is used up.
 *   4. Scores every finished applicant whose analysis is missing, was built
 *      while the judge was failing, or predates their last finished step:
 *      trigger-ava-analysis {applicationId, force: true}, the cockpit's
 *      score-only call. In auto mode that call writes ONLY the analysis
 *      fields (ai_score, ai_scorecard, ai_analysis, resume_score, the
 *      analysis notes); it never writes phase or status, never rejects and
 *      sends nothing. ONE at a time, with a pause, and it stops after two
 *      failures in a row or the first sign the credit is gone again, so a
 *      backlog cannot spike the account.
 *   5. Lists, without changing anything:
 *        - tests that were sent but never graded. They are NOT re-graded:
 *          no deployed code path can. ai-chat-simulation "evaluate" and
 *          ai-chat-interview "submit" answer the result already on file for
 *          a finished step without calling the model (gateGrading ->
 *          "on_file"), and they run only with the applicant's own session.
 *          In this outage the AI never spoke in those conversations, so
 *          there is nothing to grade anyway: the fix is a redo, which is the
 *          owner's call (hand the step back).
 *        - applicants whose chat or interview was cut off part-way, who were
 *          asked to redo a step, or whose grade came from a conversation the
 *          outage interrupted, each with what they (or staff) need to do.
 *
 * Idempotent: the plan is rebuilt from the database, and each applicant is
 * re-read just before it is scored. Someone already scored (by this script,
 * by their own next step, or by anyone else) is skipped. A second run with
 * nothing to do makes no AI call at all. A lock file stops two runs at once.
 *
 * Signing in for step 4: trigger-ava-analysis accepts only a USER session
 * (the applicant, the job's employer, a team member scoped to the job, or a
 * developer role); the service key is refused (no user in it). Two ways:
 *   - HF_ACTOR_TOKEN=<access token> of an account allowed on the job, or
 *   - --sign-in-as-employer: the script makes a one-run session for the
 *     job's employer with the service key (admin magic link, no email is
 *     sent), uses it only for these calls, and signs it out at the end.
 *
 * No secret is in this file. The Management API token comes from the macOS
 * keychain (the Supabase CLI's entry); the project's anon and service keys
 * are fetched with it at run time and never printed.
 *
 * Usage:
 *   node scripts/recover-ai-outage.mjs                     dry run: reads, prints the plan
 *   node scripts/recover-ai-outage.mjs --check             + the one health call, nothing else
 *   node scripts/recover-ai-outage.mjs --go --sign-in-as-employer
 *   HF_ACTOR_TOKEN=... node scripts/recover-ai-outage.mjs --go
 *
 * Options:
 *   --job <uuid>          job to cover (repeatable; default the live job)
 *   --since <iso time>    start of the outage window (default 2026-10-07T00:30Z)
 *   --pause <seconds>     wait between two scorings (default 20)
 *   --max <n>             score at most n applicants this run (a canary: --max 1)
 *   --settle <minutes>    leave alone anyone whose step ended this recently,
 *                         their own step is still scoring them (default 10)
 *   --include-midway      also score applicants still part-way through, except
 *                         those asked to redo a step (their redo scores them)
 *   --json                print the plan and results as JSON at the end
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

// ============================================================================
// Constants
// ============================================================================

export const PROJECT_REF = "yqklrkpptnhubsnijqze";
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const MANAGEMENT_API = "https://api.supabase.com/v1";

/** "Chat Support Team Leader (Zulu Royal & Zulu Rush)", the live job in the outage. */
export const DEFAULT_JOB_ID = "02f91311-a3a4-461c-a52d-5893cef7a9f3";
/** A few minutes before the first 429 (00:36:09 UTC). */
export const DEFAULT_SINCE = "2026-10-07T00:30:00.000Z";

/** candidateJourney.ts DECISION_STAGE_ID: every step is done. */
export const FINAL_PHASE = "decision";
/** autopilot-batch leaves these alone too. */
export const CLOSED_STATUSES = new Set(["rejected", "hired", "offered"]);

/** The AI-run steps and where each one's result is stored in notes. */
export const AI_STEPS = {
  chat_simulation: { resultKey: "chatSimulationResult", label: "chat practice" },
  chat_interview: { resultKey: "chatInterviewResult", label: "written interview" },
  sales_simulation: { resultKey: "salesSimulationResult", label: "sales practice" },
};

/** autopilot.ts JUDGE_FAILED_FLAG starts with this (riskFlags on the scorecard). */
export const JUDGE_FAILED_PREFIX = "Ava could not read the application";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CREDIT_GONE_RE = /insufficient_quota|credit_balance_exhausted|exceeded your current quota|billing_hard_limit/i;
const DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

const USAGE = `Usage:
  node scripts/recover-ai-outage.mjs                      dry run (default): reads only, prints the plan
  node scripts/recover-ai-outage.mjs --check              the plan, plus one tiny AI call to see if the AI answers
  node scripts/recover-ai-outage.mjs --go --sign-in-as-employer
  HF_ACTOR_TOKEN=<access token> node scripts/recover-ai-outage.mjs --go

Options: --job <uuid> (repeatable)  --since <iso>  --pause <seconds>  --max <n>
         --settle <minutes>  --include-midway  --json  --help`;

// ============================================================================
// Pure helpers (exported for scripts/recover_ai_outage.test.mjs)
// ============================================================================

export function parseArgs(argv) {
  const opts = {
    mode: "dry-run",
    jobIds: [],
    since: DEFAULT_SINCE,
    pauseSeconds: 20,
    max: Infinity,
    settleMinutes: 10,
    includeMidway: false,
    signInAsEmployer: false,
    json: false,
    help: false,
  };
  let modeFlag = null;
  const setMode = (mode) => {
    if (modeFlag && modeFlag !== mode) throw new Error(`--${modeFlag} and --${mode} cannot be used together`);
    modeFlag = mode;
    opts.mode = mode;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i]);
    const eq = arg.startsWith("--") ? arg.indexOf("=") : -1;
    const flag = eq > 0 ? arg.slice(0, eq) : arg;
    const inline = eq > 0 ? arg.slice(eq + 1) : undefined;
    const value = () => {
      if (inline !== undefined) return inline;
      const next = argv[i + 1];
      if (next === undefined || String(next).startsWith("--")) throw new Error(`${flag} needs a value`);
      i += 1;
      return String(next);
    };
    const number = (min) => {
      const raw = value();
      const n = Number(raw);
      if (!Number.isFinite(n) || n < min) throw new Error(`${flag} must be a number of at least ${min} (got "${raw}")`);
      return n;
    };
    switch (flag) {
      case "--dry-run": setMode("dry-run"); break;
      case "--check": setMode("check"); break;
      case "--go": setMode("go"); break;
      case "--job": {
        const id = value();
        if (!UUID_RE.test(id)) throw new Error(`--job must be a job id (uuid), got "${id}"`);
        opts.jobIds.push(id.toLowerCase());
        break;
      }
      case "--since": {
        const raw = value();
        const ms = toMs(raw);
        if (ms === null) throw new Error(`--since must be a date and time, got "${raw}"`);
        opts.since = new Date(ms).toISOString();
        break;
      }
      case "--pause": opts.pauseSeconds = number(0); break;
      case "--max": opts.max = Math.floor(number(1)); break;
      case "--settle": opts.settleMinutes = number(0); break;
      case "--include-midway": opts.includeMidway = true; break;
      case "--sign-in-as-employer": opts.signInAsEmployer = true; break;
      case "--json": opts.json = true; break;
      case "-h":
      case "--help": opts.help = true; break;
      default: throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (opts.jobIds.length === 0) opts.jobIds = [DEFAULT_JOB_ID];
  opts.jobIds = [...new Set(opts.jobIds)];
  return opts;
}

/** Milliseconds from an ISO or Postgres timestamp ("2026-10-07 00:39:23.09+00"), or null. */
export function toMs(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  const text = String(value).trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

function isoOrNull(ms) {
  return ms === null ? null : new Date(ms).toISOString();
}

/** applications.notes is JSON in a text column (sometimes encoded twice). Never throws. */
export function parseNotes(raw) {
  let value = raw;
  for (let i = 0; i < 2 && typeof value === "string"; i += 1) {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/** The scorecard was built while the judge (ai-analyze) failed. */
export function judgeFailed(scorecard) {
  const flags = Array.isArray(scorecard?.riskFlags) ? scorecard.riskFlags : [];
  return flags.some((flag) => typeof flag === "string" && flag.trim().startsWith(JUDGE_FAILED_PREFIX));
}

/** The job's AI-run steps, in the job's order. */
export function aiStepsOf(job) {
  const steps = Array.isArray(job?.workflowSteps) ? job.workflowSteps : [];
  return steps
    .filter((step) => step && typeof step.id === "string" && Object.hasOwn(AI_STEPS, step.type))
    .map((step) => ({ id: step.id, type: step.type, ...AI_STEPS[step.type] }));
}

/**
 * Where an attempt's conversation stands, from its stored events:
 *   "stuck":    the last thing that happened to a reply was a failure
 *               (no AI reply since the last reply_failed);
 *   "answered": the AI has replied since any failure;
 *   "idle":     nothing was asked of the AI yet.
 */
export function replyState(summary) {
  if (!summary) return "idle";
  const failed = toMs(summary.lastFailedAt);
  const answered = toMs(summary.lastAssistantAt);
  if (failed !== null && (answered === null || failed > answered)) return "stuck";
  return answered !== null ? "answered" : "idle";
}

/** The marker the 02:15 reset left on each application it handed back (notes.outageRetake). */
export function outageRetakeOf(notes) {
  const marker = notes?.outageRetake;
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) return null;
  const steps = Array.isArray(marker.steps) ? marker.steps.filter((step) => typeof step === "string") : [];
  return { at: typeof marker.at === "string" ? marker.at : null, atMs: toMs(marker.at), steps };
}

function byAttemptDesc(a, b) {
  return (Number(b.attempt) || 0) - (Number(a.attempt) || 0) || (toMs(b.startedAt) ?? 0) - (toMs(a.startedAt) ?? 0);
}

function latestSession(sessions) {
  return [...sessions].sort(byAttemptDesc)[0] ?? null;
}

function latestCompleted(sessions) {
  return [...sessions].filter((s) => s.status === "completed").sort(byAttemptDesc)[0] ?? null;
}

/** When the applicant last finished any step (a completed attempt), or null. */
export function lastFinishedAt(sessions) {
  let latest = null;
  for (const session of sessions) {
    if (session.status !== "completed") continue;
    const at = toMs(session.endedAt) ?? toMs(session.lastActivityAt);
    if (at !== null && (latest === null || at > latest)) latest = at;
  }
  return latest;
}

function lastActivityAt(sessions) {
  let latest = null;
  for (const session of sessions) {
    if (session.status !== "active") continue;
    const at = toMs(session.lastActivityAt) ?? toMs(session.startedAt);
    if (at !== null && (latest === null || at > latest)) latest = at;
  }
  return latest;
}

/**
 * Why the stored analysis cannot be used, or null when it can:
 *   "no_score":     ai_score is empty;
 *   "judge_failed": it was built while ai-analyze was failing (a neutral read);
 *   "stale":        it was built before the applicant's last finished step.
 */
export function analysisNeed(app, sessions) {
  const score = app.aiScore;
  if (score === null || score === undefined || !Number.isFinite(Number(score))) return "no_score";
  if (judgeFailed(app.aiScorecard ?? app.notes?.avaScorecard)) return "judge_failed";
  const analyzedAt = toMs(app.notes?.avaAnalysisMeta?.analyzedAt);
  const finishedAt = lastFinishedAt(sessions);
  if (analyzedAt !== null && finishedAt !== null && finishedAt > analyzedAt) return "stale";
  return null;
}

export function normalizeApplication(row) {
  const notes = row.notes && typeof row.notes === "object" && !Array.isArray(row.notes) ? row.notes : parseNotes(row.notes);
  const score = row.aiScore === null || row.aiScore === undefined || row.aiScore === "" ? null : Number(row.aiScore);
  return {
    id: row.id,
    jobId: row.jobId,
    name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : "(no name)",
    phase: typeof row.phase === "string" ? row.phase : "application",
    status: typeof row.status === "string" ? row.status : "",
    aiScore: Number.isFinite(score) ? score : null,
    aiScorecard: row.aiScorecard && typeof row.aiScorecard === "object" ? row.aiScorecard : null,
    notes,
  };
}

const NEED_WORDS = {
  no_score: "no score",
  judge_failed: "score built while Ava could not read the application",
  stale: "score older than their last finished step",
};

function listWords(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** What each listed applicant (or staff) has to do, in plain words. */
export function todoFor(entry) {
  const label = entry.label;
  switch (entry.kind) {
    case "ungraded_no_ai":
      return `Sent their ${label}, but it was never graded and the AI never answered them (${entry.candidateTurns} of their lines, 0 replies). There is nothing to grade. A redo needs the step handed back (the owner's call).`;
    case "ungraded_with_ai":
      return `Sent their ${label}, but it was never graded. It has ${entry.assistantTurns} AI replies, but nothing re-grades a finished step. Either keep it ungraded or hand the step back for a redo (the owner's call).`;
    case "redo_requested":
      return `Asked to redo the ${listWords(entry.labels)} (in-app notice ${entry.at ?? "sent"}). They open their application on a computer and press Start; each step starts fresh. Nothing for staff to do; they may need a reminder to come back.`;
    case "cut_off_at_start":
      return `Pressed Start on the ${label} during the outage and got no first message. They open it on a computer and press Start again; a fresh first message is asked for. Nothing for staff to do; they need to be told to come back.`;
    case "cut_off_midway":
      return `The ${label} stopped part-way: ${entry.candidateTurns} of their answers, ${entry.assistantTurns} AI replies, and the last answer never got one. Reopening it on a computer picks it up and asks for a reply to the last answer only (earlier unanswered ones stay in the history). For a clean redo: they send it, then staff hand the step back.`;
    case "graded_but_interrupted":
      return `The ${label} was graded ${entry.score ?? "(no number)"}, but ${entry.failures} of the AI's replies failed during the outage, so it was graded on a broken conversation. The owner's call: keep the grade, or hand the step back for a redo.`;
    default:
      return "";
  }
}

/**
 * The whole plan, from rows already read. Pure and deterministic: the same
 * input gives the same plan, and nothing here talks to the network.
 *
 * input.jobs:           [{ id, title, employerId, processingMode, workflowSteps }]
 * input.applications:   [{ id, jobId, name, phase, status, aiScore, aiScorecard, notes }]
 * input.sessions:       [{ id, applicationId, stepId, stepType, attempt, status, endReason,
 *                          startedAt, lastActivityAt, endedAt }]
 * input.eventSummaries: [{ sessionId, candidateTurns, assistantTurns, replyFailures,
 *                          replyFailuresSince, lastAssistantAt, lastFailedAt }]
 */
export function planRecovery(input) {
  const {
    jobs = [],
    applications = [],
    sessions = [],
    eventSummaries = [],
    now = Date.now(),
    since = DEFAULT_SINCE,
    settleMinutes = 10,
    includeMidway = false,
  } = input;
  const nowMs = toMs(now) ?? Date.now();
  const sinceMs = toMs(since);
  const settleMs = Math.max(0, Number(settleMinutes) || 0) * 60_000;

  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const summaryBySession = new Map(eventSummaries.map((summary) => [summary.sessionId, summary]));
  const sessionsByApp = new Map();
  for (const session of sessions) {
    if (!sessionsByApp.has(session.applicationId)) sessionsByApp.set(session.applicationId, []);
    sessionsByApp.get(session.applicationId).push(session);
  }

  const plan = { rescore: [], notNow: [], ungradedOnFile: [], attention: [], handedBack: [] };

  for (const row of applications) {
    const job = jobById.get(row.jobId);
    if (!job) continue;
    const app = normalizeApplication(row);
    if (CLOSED_STATUSES.has(app.status)) continue;
    // Still filling in the form: there is nothing to score or repair yet.
    if (app.status === "in_progress") continue;

    const appSessions = sessionsByApp.get(app.id) ?? [];
    const who = { applicationId: app.id, jobId: job.id, employerId: job.employerId ?? null, name: app.name, phase: app.phase };
    const steps = aiStepsOf(job);
    const retake = outageRetakeOf(app.notes);
    const ungradedLabels = [];
    const redoLabels = [];
    const redoStepIds = [];

    for (const step of steps) {
      const stepSessions = appSessions.filter((session) => session.stepId === step.id);
      const result = app.notes[step.resultKey];
      const hasResult = !!result && typeof result === "object" && !Array.isArray(result);

      if (hasResult) {
        const producing = latestCompleted(stepSessions);
        const summary = producing ? summaryBySession.get(producing.id) : null;
        const candidateTurns = Number(summary?.candidateTurns) || 0;
        const assistantTurns = Number(summary?.assistantTurns) || 0;
        if (result.graded === false) {
          ungradedLabels.push(step.label);
          const kind = assistantTurns === 0 ? "ungraded_no_ai" : "ungraded_with_ai";
          const entry = { ...who, stepId: step.id, stepType: step.type, label: step.label, sessionId: producing?.id ?? null, candidateTurns, assistantTurns, kind };
          plan.ungradedOnFile.push({ ...entry, todo: todoFor(entry) });
          continue;
        }
        const failures = Number(summary?.replyFailuresSince) || 0;
        if (failures > 0) {
          const score = Number.isFinite(Number(result.score)) && result.score !== null ? Number(result.score) : null;
          const entry = { ...who, stepId: step.id, stepType: step.type, label: step.label, kind: "graded_but_interrupted", score, failures, candidateTurns, assistantTurns };
          plan.attention.push({ ...entry, todo: todoFor(entry) });
        }
        continue;
      }

      // No result on file: only the step they are on now, or one handed back.
      const handedBack = !!retake && retake.steps.includes(step.id);
      if (app.phase !== step.id && !handedBack) continue;
      const latest = latestSession(stepSessions);
      const redoStarted =
        handedBack && !!latest && retake.atMs !== null && (toMs(latest.startedAt) ?? 0) > retake.atMs;
      if (handedBack && !redoStarted) {
        redoLabels.push(step.label);
        redoStepIds.push(step.id);
        continue;
      }
      if (!latest) continue;
      if (latest.status === "superseded" && latest.endReason === "outage_restart") {
        redoLabels.push(step.label);
        redoStepIds.push(step.id);
        continue;
      }
      if (latest.status !== "active") continue;
      const summary = summaryBySession.get(latest.id);
      if (replyState(summary) !== "stuck") continue;
      // A failure from before the outage window is some other problem.
      if (sinceMs !== null && (toMs(summary.lastFailedAt) ?? 0) < sinceMs) continue;
      const candidateTurns = Number(summary.candidateTurns) || 0;
      const entry = {
        ...who,
        stepId: step.id,
        stepType: step.type,
        label: step.label,
        kind: candidateTurns === 0 ? "cut_off_at_start" : "cut_off_midway",
        candidateTurns,
        assistantTurns: Number(summary.assistantTurns) || 0,
        redo: redoStarted,
        lastActivityAt: isoOrNull(toMs(latest.lastActivityAt)),
      };
      plan.attention.push({ ...entry, todo: todoFor(entry) });
    }

    if (redoLabels.length > 0) {
      const entry = { ...who, kind: "redo_requested", stepId: redoStepIds[0], stepIds: redoStepIds, labels: redoLabels, at: retake?.at ?? null };
      plan.attention.push({ ...entry, label: redoLabels[0], todo: todoFor(entry) });
    }
    if (retake) {
      const redone = retake.steps.filter((stepId) => {
        const step = steps.find((s) => s.id === stepId);
        const result = step ? app.notes[step.resultKey] : null;
        return !!result && typeof result === "object" && result.graded !== false;
      });
      plan.handedBack.push({ ...who, at: retake.at, steps: retake.steps, redone });
    }

    // Scoring.
    const need = analysisNeed(app, appSessions);
    if (!need) continue;
    const finished = app.phase === FINAL_PHASE;
    const finishedAtMs = lastFinishedAt(appSessions);
    const entry = {
      ...who,
      reason: need,
      reasonWords: NEED_WORDS[need],
      finished,
      ungradedTests: ungradedLabels,
      lastFinishedAt: isoOrNull(finishedAtMs),
    };
    if (!finished && !includeMidway) {
      plan.notNow.push({ ...entry, why: "midway" });
      continue;
    }
    const redoPending =
      !!retake &&
      retake.steps.some((stepId) => {
        const step = steps.find((s) => s.id === stepId);
        const result = step ? app.notes[step.resultKey] : null;
        return !(result && typeof result === "object" && result.graded !== false);
      });
    if (!finished && redoPending) {
      plan.notNow.push({ ...entry, why: "redo_pending" });
      continue;
    }
    if (finishedAtMs !== null && nowMs - finishedAtMs < settleMs) {
      plan.notNow.push({ ...entry, why: "just_finished" });
      continue;
    }
    const activeAt = lastActivityAt(appSessions);
    if (activeAt !== null && nowMs - activeAt < settleMs) {
      plan.notNow.push({ ...entry, why: "active_now" });
      continue;
    }
    plan.rescore.push(entry);
  }

  const byName = (a, b) => a.name.localeCompare(b.name) || a.applicationId.localeCompare(b.applicationId);
  plan.rescore.sort((a, b) => (toMs(a.lastFinishedAt) ?? 0) - (toMs(b.lastFinishedAt) ?? 0) || byName(a, b));
  plan.notNow.sort((a, b) => a.why.localeCompare(b.why) || byName(a, b));
  plan.ungradedOnFile.sort((a, b) => byName(a, b) || a.stepId.localeCompare(b.stepId));
  const kindOrder = ["cut_off_midway", "cut_off_at_start", "redo_requested", "graded_but_interrupted"];
  plan.attention.sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || byName(a, b) || String(a.stepId ?? "").localeCompare(String(b.stepId ?? "")));
  plan.handedBack.sort(byName);
  return plan;
}

/** The health call's answer: does the AI answer, and if not, is it the credit? */
export function classifyHealthResponse({ status, contentType = "", text = "" }) {
  const body = String(text ?? "");
  const snippet = body.replace(/\s+/g, " ").trim().slice(0, 200);
  if (CREDIT_GONE_RE.test(body)) {
    return { healthy: false, creditExhausted: true, reason: "OpenAI says the account is still out of credit (insufficient_quota)." };
  }
  if (status === 429 && /rate_limited/.test(body)) {
    return { healthy: false, creditExhausted: false, reason: "Our own rate limiter refused the check (60 calls an hour per caller). Wait a few minutes and run again." };
  }
  if (/invalid_api_key|Incorrect API key|OpenAI stream error 401/i.test(body)) {
    return { healthy: false, creditExhausted: false, reason: "OpenAI refused the API key." };
  }
  if (status === 200 && /event-stream/i.test(String(contentType))) {
    if (/"error"\s*:/.test(body)) return { healthy: false, creditExhausted: false, reason: `The reply stream carried an error: ${snippet}` };
    if (/"content"\s*:\s*"(?:[^"\\]|\\.)+"/.test(body) || /\[DONE\]/.test(body)) {
      return { healthy: true, creditExhausted: false, reason: "The AI answered." };
    }
    return { healthy: false, creditExhausted: false, reason: "The reply stream opened, but no words came back in time." };
  }
  return { healthy: false, creditExhausted: false, reason: `The AI call failed (HTTP ${status}): ${snippet || "no body"}` };
}

/** One trigger-ava-analysis answer: did it score, and should the run stop? */
export function classifyScoreResponse({ status, body = null, text = "", timedOut = false }) {
  if (timedOut) {
    return { ok: false, fatal: false, reason: "No answer in time. The analysis may still save; the next run will see it." };
  }
  const raw = body && typeof body === "object" ? JSON.stringify(body) : String(text ?? "");
  if (CREDIT_GONE_RE.test(raw)) return { ok: false, fatal: true, reason: "OpenAI is out of credit again." };
  const score = body && Number.isFinite(Number(body.score)) && body.score !== null ? Number(body.score) : null;
  if (status === 200 && body?.success) {
    if (body.skipped) return { ok: true, skipped: true, score, reason: String(body.message ?? "skipped") };
    if (judgeFailed(body.scorecard)) {
      return { ok: false, fatal: false, degraded: true, score, reason: "Saved, but Ava could not read the application again (the score is the tests with a neutral read)." };
    }
    return { ok: true, score, decisionState: body.scorecard?.decisionState ?? null, reason: "Scored." };
  }
  if (status === 401) return { ok: false, fatal: true, authExpired: true, reason: "The session was refused (expired or not valid)." };
  if (status === 403 && body?.limitReached) {
    return { ok: false, fatal: true, reason: `The employer's AI analysis limit is reached: ${body.message ?? ""}`.trim() };
  }
  if (status === 403) return { ok: false, fatal: true, reason: `Not allowed: ${body?.error ?? body?.message ?? "forbidden"}` };
  if (status === 404) return { ok: false, fatal: false, reason: "Application not found." };
  const details = [body?.error, body?.details].filter(Boolean).join(": ") || String(text ?? "").slice(0, 200);
  return { ok: false, fatal: false, reason: `HTTP ${status}${details ? ` ${details}` : ""}` };
}

/** The anon and service keys from GET /v1/projects/{ref}/api-keys?reveal=true (legacy JWT keys preferred). */
export function pickApiKeys(list) {
  const rows = Array.isArray(list) ? list : [];
  const find = (match) => rows.find((row) => row && typeof row.api_key === "string" && row.api_key && match(row))?.api_key ?? null;
  const anon = find((row) => row.name === "anon") ?? find((row) => row.type === "publishable");
  const service = find((row) => row.name === "service_role") ?? find((row) => row.type === "secret");
  if (!anon || !service) throw new Error("The project's API keys did not include both an anon key and a service key.");
  return { anon, service };
}

function keyHeaders(key) {
  // Legacy keys are JWTs and go in both headers; the newer sb_ keys only in apikey.
  return key.startsWith("eyJ") ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}

function shortId(id) {
  return String(id ?? "").slice(0, 8);
}

// ============================================================================
// Reading (read-only SQL through the Management API)
// ============================================================================

function readManagementToken() {
  let raw;
  try {
    raw = execFileSync("security", ["find-generic-password", "-s", "Supabase CLI", "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error('No "Supabase CLI" entry in the macOS keychain. Run `npx supabase login` first.');
  }
  raw = raw.replace(/^go-keyring-base64:/, "");
  const token = raw.startsWith("sbp_") ? raw : Buffer.from(raw, "base64").toString("utf8").trim();
  if (!token.startsWith("sbp_")) throw new Error("The keychain entry is not a Supabase access token.");
  return token;
}

async function readSql(mgmtToken, query) {
  const res = await fetch(`${MANAGEMENT_API}/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${mgmtToken}`, "Content-Type": "application/json" },
    // read_only: the query runs as supabase_read_only_user in a read-only transaction.
    body: JSON.stringify({ query, read_only: true }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Read failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) throw new Error("Read returned no rows array.");
  return rows;
}

function sqlUuidList(ids) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error("No ids to read.");
  return ids
    .map((id) => {
      if (!UUID_RE.test(String(id))) throw new Error(`Not a uuid: ${id}`);
      return `'${String(id).toLowerCase()}'`;
    })
    .join(", ");
}

const AI_STEP_TYPES_SQL = Object.keys(AI_STEPS).map((type) => `'${type}'`).join(", ");

/** The four read-only SELECTs the state is built from. Pure; ids are checked as uuids before they reach SQL. */
export function buildStateQueries({ jobIds, applicationIds = null, since }) {
  const jobs = sqlUuidList(jobIds);
  const appsA = applicationIds ? ` and a.id in (${sqlUuidList(applicationIds)})` : "";
  const appsS = applicationIds ? ` and s.application_id in (${sqlUuidList(applicationIds)})` : "";
  const sinceLiteral = `'${new Date(toMs(since) ?? toMs(DEFAULT_SINCE)).toISOString()}'::timestamptz`;
  return {
    jobs: `select j.id, j.title, j.employer_id, j.processing_mode, j.workflow_steps
       from public.jobs j where j.id in (${jobs})`,
    applications: `select a.id, a.job_id, a.phase, a.status::text as status, a.ai_score, a.ai_scorecard, a.notes, p.full_name
       from public.applications a
       left join public.profiles p on p.user_id = a.candidate_id
      where a.job_id in (${jobs})${appsA}`,
    sessions: `select s.id, s.application_id, s.step_id, s.step_type, s.attempt, s.status, s.end_reason,
            s.started_at, s.last_activity_at, s.ended_at
       from public.assessment_sessions s
      where s.job_id in (${jobs})${appsS}`,
    eventSummaries: `select e.session_id,
            count(*) filter (where e.kind = 'candidate_turn') as candidate_turns,
            count(*) filter (where e.kind = 'assistant_turn') as assistant_turns,
            count(*) filter (where e.kind = 'system' and e.detail->>'what' = 'reply_failed') as reply_failures,
            count(*) filter (where e.kind = 'system' and e.detail->>'what' = 'reply_failed' and e.created_at >= ${sinceLiteral}) as reply_failures_since,
            max(e.created_at) filter (where e.kind = 'assistant_turn') as last_assistant_at,
            max(e.created_at) filter (where e.kind = 'system' and e.detail->>'what' = 'reply_failed') as last_failed_at
       from public.assessment_events e
       join public.assessment_sessions s on s.id = e.session_id
      where s.job_id in (${jobs}) and s.step_type in (${AI_STEP_TYPES_SQL})${appsS}
      group by e.session_id`,
  };
}

async function loadState(mgmtToken, filter) {
  const queries = buildStateQueries(filter);
  const rows = {};
  for (const [name, query] of Object.entries(queries)) rows[name] = await readSql(mgmtToken, query);
  return rowsToState(rows);
}

/** Database rows (snake_case, as the Management API returns them) into planRecovery's input. Pure. */
export function rowsToState({ jobs: jobRows, applications: appRows, sessions: sessionRows, eventSummaries: summaryRows }) {
  return {
    jobs: jobRows.map((r) => ({
      id: r.id,
      title: r.title ?? "",
      employerId: r.employer_id ?? null,
      processingMode: r.processing_mode ?? null,
      workflowSteps: Array.isArray(r.workflow_steps) ? r.workflow_steps : [],
    })),
    applications: appRows.map((r) => ({
      id: r.id,
      jobId: r.job_id,
      name: r.full_name,
      phase: r.phase,
      status: r.status,
      aiScore: r.ai_score,
      aiScorecard: r.ai_scorecard,
      notes: r.notes,
    })),
    sessions: sessionRows.map((r) => ({
      id: r.id,
      applicationId: r.application_id,
      stepId: r.step_id,
      stepType: r.step_type,
      attempt: r.attempt,
      status: r.status,
      endReason: r.end_reason,
      startedAt: r.started_at,
      lastActivityAt: r.last_activity_at,
      endedAt: r.ended_at,
    })),
    eventSummaries: summaryRows.map((r) => ({
      sessionId: r.session_id,
      candidateTurns: Number(r.candidate_turns) || 0,
      assistantTurns: Number(r.assistant_turns) || 0,
      replyFailures: Number(r.reply_failures) || 0,
      replyFailuresSince: Number(r.reply_failures_since) || 0,
      lastAssistantAt: r.last_assistant_at,
      lastFailedAt: r.last_failed_at,
    })),
  };
}

async function fetchApiKeys(mgmtToken) {
  const res = await fetch(`${MANAGEMENT_API}/projects/${PROJECT_REF}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${mgmtToken}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Could not read the project's API keys (HTTP ${res.status}).`);
  return pickApiKeys(await res.json());
}

// ============================================================================
// Calls that reach the AI (only in --check and --go)
// ============================================================================

async function readStreamUntil(stream, done, timeoutMs, maxChars) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + timeoutMs;
  let text = "";
  try {
    while (Date.now() < deadline && text.length < maxChars) {
      const left = deadline - Date.now();
      let timer;
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve({ timeout: true }), left);
      });
      const chunk = await Promise.race([reader.read(), timeout]);
      clearTimeout(timer);
      if (chunk.timeout || chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
      if (done(text)) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text;
}

/** ONE short opening message from the chat practice's player, on the cheap model. Nothing is recorded. */
async function healthCheck(keys) {
  const started = Date.now();
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat-simulation`, {
      method: "POST",
      headers: { ...keyHeaders(keys.anon), "Content-Type": "application/json", "User-Agent": DESKTOP_UA },
      // No applicationId / stepId: served without a record (no attempt opened, nothing written).
      body: JSON.stringify({
        mode: "start",
        scenario: "Outage health check: say hello in one short sentence.",
        customerName: "Health Check",
        messageCount: 0,
        deviceKind: "computer",
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    return { healthy: false, creditExhausted: false, reason: `Could not reach the function: ${error?.message ?? error}`, ms: Date.now() - started };
  }
  const contentType = res.headers.get("content-type") ?? "";
  let text = "";
  if (res.ok && res.body && /event-stream/i.test(contentType)) {
    text = await readStreamUntil(
      res.body,
      (t) => /"content"\s*:\s*"(?:[^"\\]|\\.)+"/.test(t) || /\[DONE\]/.test(t) || /"error"\s*:/.test(t),
      30_000,
      16_384,
    );
  } else {
    text = await res.text().catch(() => "");
  }
  return { ...classifyHealthResponse({ status: res.status, contentType, text }), status: res.status, ms: Date.now() - started };
}

async function callTriggerAnalysis(keys, accessToken, applicationId) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/trigger-ava-analysis`, {
      method: "POST",
      headers: { apikey: keys.anon, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      // Score only: no autopilotDecision, so even on an auto job it never moves anyone.
      body: JSON.stringify({ applicationId, force: true }),
      signal: AbortSignal.timeout(200_000),
    });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { status: res.status, body, text };
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return { status: 0, body: null, text: String(error?.message ?? error), timedOut };
  }
}

// ============================================================================
// Who the scoring calls run as
// ============================================================================

async function fetchJson(url, init, what) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (!res.ok) {
    const why = body?.msg ?? body?.message ?? body?.error_description ?? body?.error ?? `HTTP ${res.status}`;
    throw new Error(`${what} failed: ${why}`);
  }
  return body ?? {};
}

/** A one-run session for the job's employer: admin magic link (no email sent), verified, signed out at the end. */
async function mintEmployerSession(keys, employerId) {
  const service = keyHeaders(keys.service);
  const user = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/users/${employerId}`, { headers: service }, "Reading the employer's account");
  if (!user?.email) throw new Error("The employer's account has no email, so no session can be made for it.");
  const link = await fetchJson(
    `${SUPABASE_URL}/auth/v1/admin/generate_link`,
    { method: "POST", headers: { ...service, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: user.email }) },
    "Making a one-run sign-in link",
  );
  const tokenHash = link.hashed_token ?? link.properties?.hashed_token;
  const verifyType = link.verification_type ?? link.properties?.verification_type ?? "magiclink";
  if (!tokenHash) throw new Error("The sign-in link came back without a token.");
  const verified = await fetchJson(
    `${SUPABASE_URL}/auth/v1/verify`,
    { method: "POST", headers: { ...keyHeaders(keys.anon), "Content-Type": "application/json" }, body: JSON.stringify({ type: verifyType, token_hash: tokenHash }) },
    "Signing in with the one-run link",
  );
  if (!verified.access_token || verified.user?.id !== employerId) throw new Error("The one-run sign-in did not give a session for the employer.");

  const session = { accessToken: verified.access_token, refreshToken: verified.refresh_token ?? null };
  const actor = {
    label: `the job's employer (one-run session, user ${shortId(employerId)}…)`,
    get accessToken() {
      return session.accessToken;
    },
    refresh: async () => {
      if (!session.refreshToken) throw new Error("No refresh token for the one-run session.");
      const next = await fetchJson(
        `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
        { method: "POST", headers: { ...keyHeaders(keys.anon), "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: session.refreshToken }) },
        "Refreshing the one-run session",
      );
      session.accessToken = next.access_token;
      session.refreshToken = next.refresh_token ?? session.refreshToken;
    },
    signOut: async () => {
      const logout = () =>
        fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
          method: "POST",
          headers: { apikey: keys.anon, Authorization: `Bearer ${session.accessToken}` },
          signal: AbortSignal.timeout(30_000),
        });
      let res = await logout().catch(() => null);
      if (res && res.status === 401 && session.refreshToken) {
        await actor.refresh().catch(() => {});
        res = await logout().catch(() => null);
      }
      return !!res && (res.ok || res.status === 204);
    },
  };
  return actor;
}

class Actors {
  constructor(keys, opts, env) {
    this.keys = keys;
    this.opts = opts;
    this.envToken = typeof env.HF_ACTOR_TOKEN === "string" && env.HF_ACTOR_TOKEN.trim() ? env.HF_ACTOR_TOKEN.trim() : null;
    this.envActor = null;
    this.minted = new Map();
  }

  static describe(opts, env) {
    if (typeof env.HF_ACTOR_TOKEN === "string" && env.HF_ACTOR_TOKEN.trim()) return "the account in HF_ACTOR_TOKEN";
    if (opts.signInAsEmployer) return "a one-run session for the job's employer (--sign-in-as-employer), signed out at the end";
    return null;
  }

  async for(employerId) {
    if (this.envToken) {
      if (!this.envActor) {
        const user = await fetchJson(
          `${SUPABASE_URL}/auth/v1/user`,
          { headers: { apikey: this.keys.anon, Authorization: `Bearer ${this.envToken}` } },
          "Checking HF_ACTOR_TOKEN",
        );
        if (!user?.id) throw new Error("HF_ACTOR_TOKEN was refused.");
        this.envActor = { label: `the account in HF_ACTOR_TOKEN (user ${shortId(user.id)}…)`, accessToken: this.envToken, refresh: null, signOut: null };
      }
      return this.envActor;
    }
    if (!this.opts.signInAsEmployer) throw new Error("No session to score with: set HF_ACTOR_TOKEN or pass --sign-in-as-employer.");
    if (!employerId) throw new Error("The job has no employer to sign in as.");
    if (!this.minted.has(employerId)) this.minted.set(employerId, await mintEmployerSession(this.keys, employerId));
    return this.minted.get(employerId);
  }

  async signOutAll(log) {
    for (const [employerId, actor] of this.minted) {
      const ok = await actor.signOut().catch(() => false);
      log(ok
        ? `Signed out the one-run session for the employer (user ${shortId(employerId)}…).`
        : `WARNING: could not sign out the one-run session for user ${shortId(employerId)}…; sign that account out of other sessions to end it.`);
    }
    this.minted.clear();
  }
}

// ============================================================================
// Lock: two runs at once could score the same applicant twice
// ============================================================================

function acquireLock() {
  const file = path.join(os.tmpdir(), `hireflow-recover-ai-outage-${PROJECT_REF}.lock`);
  for (let tries = 0; tries < 2; tries += 1) {
    try {
      const fd = fs.openSync(file, "wx");
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return () => {
        try {
          fs.unlinkSync(file);
        } catch {
          // already gone
        }
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const pid = Number(fs.readFileSync(file, "utf8").trim());
      let alive = false;
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
          alive = true;
        } catch (probe) {
          alive = probe?.code === "EPERM";
        }
      }
      if (alive) throw new Error(`Another run is in progress (pid ${pid}). Let it finish first.`);
      fs.unlinkSync(file);
    }
  }
  throw new Error("Could not take the run lock.");
}

// ============================================================================
// Printing
// ============================================================================

function printPlan(log, plan, state, opts) {
  for (const job of state.jobs) {
    const count = state.applications.filter((a) => a.jobId === job.id).length;
    log(`Job: ${job.title || "(untitled)"} [${shortId(job.id)}] · ${job.processingMode ?? "manual"} mode · ${count} applications`);
  }
  const missing = opts.jobIds.filter((id) => !state.jobs.some((job) => job.id === id));
  for (const id of missing) log(`WARNING: job ${id} was not found.`);
  log(`Outage window starts: ${opts.since}`);
  log("");

  log(`1) Score with trigger-ava-analysis (score only; never moves, rejects or emails anyone): ${plan.rescore.length}`);
  if (plan.rescore.length === 0) log("   Nobody who needs it right now.");
  for (const entry of plan.rescore) {
    const interim = entry.ungradedTests.length > 0 ? ` (their ${listWords(entry.ungradedTests)} are not graded, so the score is an interim one)` : "";
    log(`   ${entry.finished ? "finished" : `on ${entry.phase}`}  ${entry.name} [${shortId(entry.applicationId)}]: ${entry.reasonWords}${interim}`);
  }
  const notNowWords = {
    just_finished: "just finished a step; that step is scoring them now",
    active_now: "in the middle of a step right now; it will score them",
    redo_pending: "asked to redo a step; the redo will score them",
    midway: "part-way through; their next finished step scores them (or use --include-midway)",
  };
  for (const why of Object.keys(notNowWords)) {
    const group = plan.notNow.filter((entry) => entry.why === why);
    if (group.length === 0) continue;
    log(`   Not now, ${notNowWords[why]} (${group.length}): ${group.map((e) => `${e.name} [${shortId(e.applicationId)}]`).join(", ")}`);
  }
  log("");

  log(`2) Sent but never graded: ${plan.ungradedOnFile.length} (listed only; no deployed code can re-grade a finished step)`);
  if (plan.ungradedOnFile.length > 0) {
    log("   The grading calls answer the result already on file without asking the model, and run only as the applicant.");
  }
  for (const entry of plan.ungradedOnFile) log(`   ${entry.name} [${shortId(entry.applicationId)}] ${entry.stepId}: ${entry.todo}`);
  log("");

  log(`3) Cut off, asked to redo, or graded on a broken conversation: ${plan.attention.length} (listed only)`);
  for (const entry of plan.attention) {
    log(`   [${entry.kind}] ${entry.name} [${shortId(entry.applicationId)}]${entry.stepId ? ` ${entry.stepId}` : ""}: ${entry.todo}`);
  }
  log("");

  if (plan.handedBack.length > 0) {
    const redoneSteps = plan.handedBack.reduce((n, entry) => n + entry.redone.length, 0);
    const allSteps = plan.handedBack.reduce((n, entry) => n + entry.steps.length, 0);
    log(`4) Handed back by the outage reset: ${plan.handedBack.length} applicants, ${redoneSteps} of ${allSteps} steps redone so far.`);
    log("");
  }
}

// ============================================================================
// Main
// ============================================================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function main(argv = process.argv.slice(2), env = process.env) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    return 1;
  }
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }

  const lines = [];
  const log = (line = "") => {
    lines.push(line);
    if (!opts.json) console.log(line);
  };
  const report = { mode: opts.mode, jobIds: opts.jobIds, since: opts.since, health: null, results: [], stoppedBecause: null, plan: null };
  const finish = (code) => {
    if (opts.json) console.log(JSON.stringify({ ...report, exitCode: code }, null, 2));
    return code;
  };

  const titles = { "dry-run": "DRY RUN (reads only; no AI call, nothing changed)", check: "CHECK (reads, plus one tiny AI call)", go: "GO" };
  log(`HireFlow AI outage recovery: ${titles[opts.mode]}`);

  const mgmtToken = readManagementToken();
  const planInput = { now: Date.now(), since: opts.since, settleMinutes: opts.settleMinutes, includeMidway: opts.includeMidway };
  const state = await loadState(mgmtToken, { jobIds: opts.jobIds, since: opts.since });
  const plan = planRecovery({ ...state, ...planInput });
  report.plan = plan;
  printPlan(log, plan, state, opts);

  const actorSource = Actors.describe(opts, env);
  if (opts.mode === "dry-run") {
    if (plan.rescore.length > 0) {
      log(`--go would first make one tiny AI call, then score the ${plan.rescore.length} above one at a time, ${opts.pauseSeconds} s apart${Number.isFinite(opts.max) ? `, at most ${opts.max}` : ""},`);
      log(`signed in as ${actorSource ?? "(nobody yet: add --sign-in-as-employer, or set HF_ACTOR_TOKEN)"}.`);
    } else {
      log("--go has nothing to score right now and would make no AI call.");
    }
    return finish(0);
  }

  const keys = await fetchApiKeys(mgmtToken);

  if (opts.mode === "check") {
    const health = await healthCheck(keys);
    report.health = health;
    log(`AI health: ${health.healthy ? "OK" : "NOT OK"} (${health.ms} ms). ${health.reason}`);
    return finish(health.healthy ? 0 : 2);
  }

  // --go
  if (plan.rescore.length === 0) {
    log("Nothing to score. No AI call was made.");
    return finish(0);
  }
  if (!actorSource) {
    log("Scoring needs a signed-in account allowed on the job (the service key is refused by trigger-ava-analysis).");
    log("Run again with --sign-in-as-employer, or set HF_ACTOR_TOKEN to such an account's access token. Nothing was called.");
    report.stoppedBecause = "no_actor";
    return finish(1);
  }

  const release = acquireLock();
  const actors = new Actors(keys, opts, env);
  let stopRequested = false;
  const onSigint = () => {
    if (stopRequested) process.exit(130);
    stopRequested = true;
    console.error("\nStopping after the current applicant (Ctrl-C again to quit at once).");
  };
  process.on("SIGINT", onSigint);
  let exitCode = 0;
  try {
    const health = await healthCheck(keys);
    report.health = health;
    log(`AI health: ${health.healthy ? "OK" : "NOT OK"} (${health.ms} ms). ${health.reason}`);
    if (!health.healthy) {
      log(health.creditExhausted ? "STOPPED: the credit is still used up. Nothing was scored." : "STOPPED: the AI is not answering. Nothing was scored.");
      report.stoppedBecause = health.creditExhausted ? "credit_exhausted" : "ai_unhealthy";
      return finish(2);
    }

    log(`Scoring as ${Actors.describe(opts, env)}, one at a time, ${opts.pauseSeconds} s apart.`);
    let consecutiveFailures = 0;
    let attempted = 0;
    const jobById = new Map(state.jobs.map((job) => [job.id, job]));
    for (let index = 0; index < plan.rescore.length; index += 1) {
      const target = plan.rescore[index];
      if (stopRequested) {
        report.stoppedBecause = "interrupted";
        break;
      }
      if (attempted >= opts.max) {
        log(`Reached --max ${opts.max}; ${plan.rescore.length - index} left for the next run.`);
        break;
      }

      // Re-read this one applicant: someone may have scored them since the plan was made.
      const fresh = await loadState(mgmtToken, { jobIds: [target.jobId], applicationIds: [target.applicationId], since: opts.since });
      const still = planRecovery({ ...fresh, ...planInput, now: Date.now() }).rescore.find((e) => e.applicationId === target.applicationId);
      if (!still) {
        log(`   SKIP   ${target.name} [${shortId(target.applicationId)}]: no longer needs a score.`);
        report.results.push({ applicationId: target.applicationId, name: target.name, outcome: "skipped_already_done" });
        continue;
      }

      const actor = await actors.for(jobById.get(target.jobId)?.employerId ?? target.employerId);
      if (attempted > 0) await sleep(opts.pauseSeconds * 1000);
      attempted += 1;
      let response = await callTriggerAnalysis(keys, actor.accessToken, target.applicationId);
      let verdict = classifyScoreResponse(response);
      if (verdict.authExpired && typeof actor.refresh === "function") {
        await actor.refresh();
        response = await callTriggerAnalysis(keys, actor.accessToken, target.applicationId);
        verdict = classifyScoreResponse(response);
      }
      const tag = verdict.ok ? (verdict.skipped ? "SKIPPED" : "SCORED") : verdict.degraded ? "WEAK" : "FAILED";
      const scoreText = verdict.score !== null && verdict.score !== undefined ? ` ${verdict.score}` : "";
      log(`   ${tag.padEnd(7)}${target.name} [${shortId(target.applicationId)}]${scoreText}${verdict.decisionState ? ` (${verdict.decisionState})` : ""}: ${verdict.reason}`);
      report.results.push({ applicationId: target.applicationId, name: target.name, outcome: tag.toLowerCase(), score: verdict.score ?? null, reason: verdict.reason, httpStatus: response.status });

      if (verdict.ok) consecutiveFailures = 0;
      else consecutiveFailures += 1;
      if (verdict.fatal) {
        log(`STOPPED: ${verdict.reason}`);
        report.stoppedBecause = "fatal";
        exitCode = 3;
        break;
      }
      if (consecutiveFailures >= 2) {
        log("STOPPED: two in a row did not score. Look at trigger-ava-analysis / ai-analyze logs before running again.");
        report.stoppedBecause = "two_failures";
        exitCode = 3;
        break;
      }
    }
    const scored = report.results.filter((r) => r.outcome === "scored").length;
    log(`Done: ${scored} scored, ${report.results.length - scored} not. Running again picks up only what is still missing.`);
    return finish(exitCode);
  } finally {
    await actors.signOutAll(log);
    process.removeListener("SIGINT", onSigint);
    release();
  }
}

const invokedDirectly = (() => {
  try {
    return !!process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`recover-ai-outage: ${error?.message ?? error}`);
      process.exit(1);
    },
  );
}
