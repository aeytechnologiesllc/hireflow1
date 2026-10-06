#!/usr/bin/env node
/**
 * "Waiting to continue on a computer" for the hiring team
 * (docs/COMPUTER-ONLY-TESTS.md, "Staff"): how the record, the profile's rail
 * and the applicants list read notes.waiting_on_computer, the stamp the
 * "Continue on your computer" screen asks public.mark_waiting_on_computer to
 * write (scripts/waiting_on_computer.pglite.test.mjs proves the write).
 *
 *   - the record's step reads "Waiting to continue on a computer · opened on
 *     a phone 2 h ago" and record.live is that (state "waiting", amber);
 *   - the list's one line says "Waiting to continue on a computer" in amber,
 *     and the profile's rail the same words; the person sits on Part-way, not
 *     "Taking tests now"; reaching the screen counts as their last move;
 *   - the stamp is IGNORED once the step's result is on file, once the
 *     application is decided, when an attempt on the step is being taken or
 *     moved after the stamp, for a step the computer-only rule does not cover,
 *     for a step that is not theirs now, and when the stamp is malformed.
 *
 * The libs are loaded the way scripts/applicant_list.test.mjs loads them
 * ("@/" mapped to src/ by a resolve hook; Node 24 strips the types).
 *
 *   node scripts/waiting_on_computer.test.mjs
 */
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.TZ = "UTC";
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

const R = await import(pathToFileURL(path.join(ROOT, "src/cockpit/lib/assessmentRecord.ts")).href);
const L = await import(pathToFileURL(path.join(ROOT, "src/cockpit/lib/applicantList.ts")).href);
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

const NOW = Date.parse("2026-10-06T12:00:00.000Z");
const ago = (ms) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

// The live job's shape: the form, the skills check, the connection check
// first of the workflow, then the tests (invented people, example.com).
const JOB = {
  id: "job-1",
  title: "Chat Support Team Leader",
  workflow_steps: [
    { id: "wf-check", type: "equipment_check", title: "Your computer and connection" },
    { id: "wf-typing", type: "typing_test", title: "Typing speed and accuracy" },
    { id: "wf-chat", type: "chat_simulation", title: "Escalated chat practice" },
  ],
  quiz_questions: [{ id: "zu1", question: "Q?", options: ["a", "b"] }],
  application_questions: [],
  passing_score: 60,
  required_wpm: 45,
};
const BASE_NOTES = {
  applicationAnswers: [{ questionId: "q1", question: "Full name", answer: "Robin Okafor" }],
  quizResult: { score: 80, correct: 8, total: 10, completedAt: ago(3 * HOUR) },
};
const stamp = (over = {}) => ({ step_id: "wf-check", at: ago(2 * HOUR), device_kind: "phone", ...over });

function app(over = {}, notes = {}) {
  return {
    id: "app-1",
    job_id: JOB.id,
    candidate_id: "cand-1",
    status: "pending",
    phase: "wf-check",
    created_at: ago(5 * HOUR),
    updated_at: ago(2 * HOUR),
    notes: JSON.stringify({ ...BASE_NOTES, ...notes }),
    profiles: { full_name: "Robin Okafor", email: "robin@example.com" },
    jobs: JOB,
    ...over,
  };
}

function session(over = {}) {
  return {
    id: "s-1",
    application_id: "app-1",
    step_id: "wf-check",
    step_type: "equipment_check",
    attempt: 1,
    status: "active",
    started_at: ago(30 * MIN),
    last_activity_at: ago(MIN),
    progress: {},
    ...over,
  };
}

function read(a, sessions = []) {
  const record = R.buildAssessmentRecord(a, { sessions, now: NOW });
  const row = L.listRowFor(a, record, L.journeyForJob(JOB), NOW, { sessions });
  const dots = P.journeyDots(record, a.status);
  const rail = P.journeyLine(dots, a.status, { live: record.live, sessions, now: NOW });
  return { record, row, rail, entry: record.entries.find((e) => e.key === "wf-check") };
}

console.log("\nThe stamp, read:\n");
{
  const w = R.waitingOnComputerOf({ waiting_on_computer: stamp() });
  check("waitingOnComputerOf reads {step_id, at, device_kind}", w?.stepId === "wf-check" && w?.deviceKind === "phone" && w?.at === ago(2 * HOUR), JSON.stringify(w));
  check("a computer is no waiting device", R.waitingOnComputerOf({ waiting_on_computer: stamp({ device_kind: "computer" }) }) === null);
  check("no time, no stamp", R.waitingOnComputerOf({ waiting_on_computer: stamp({ at: "yesterday-ish" }) }) === null);
  check("no step, no stamp", R.waitingOnComputerOf({ waiting_on_computer: stamp({ step_id: "" }) }) === null);
  check("a string is no stamp", R.waitingOnComputerOf({ waiting_on_computer: "wf-check" }) === null);
  check("no notes, no stamp", R.waitingOnComputerOf(null) === null);
  // The applicant can write this key: a stamp dated in the future would read
  // "Active now" forever and outrank every later attempt.
  const future = new Date(NOW + 3 * 24 * HOUR).toISOString();
  check("a stamp dated in the future is ignored", R.waitingOnComputerOf({ waiting_on_computer: stamp({ at: future }) }, NOW) === null);
  check("…but a minute of clock skew is allowed", R.waitingOnComputerOf({ waiting_on_computer: stamp({ at: new Date(NOW + 30_000).toISOString() }) }, NOW)?.stepId === "wf-check");
  const forged = read(app({}, { waiting_on_computer: stamp({ at: future }) }));
  check("…and the record shows no waiting line for it, and the list does not say 'Active now'", forged.record.live?.state !== "waiting" && forged.row.activeWords !== "Active now", JSON.stringify({ live: forged.record.live, active: forged.row.activeWords }));
}

console.log("\nOpened on a phone, nothing since:\n");
{
  const { record, row, rail, entry } = read(app({}, { waiting_on_computer: stamp() }));
  check("the step's live words", entry?.statusLabel === "Waiting to continue on a computer · opened on a phone 2 h ago", entry?.statusLabel);
  check("…it is theirs now (in progress), not done", entry?.status === "in_progress");
  check("…the entry says when and on what", entry?.waiting?.at === ago(2 * HOUR) && entry?.waiting?.deviceKind === "phone", JSON.stringify(entry?.waiting));
  check("…the rail's receipt", entry?.receipt === "Needs a computer", entry?.receipt);
  check("record.live is the waiting", record.live?.state === "waiting" && record.live?.stepId === "wf-check", JSON.stringify(record.live));
  check("…its summary names the step", record.live?.summary === "Your computer and connection: waiting to continue on a computer · opened on a phone 2 h ago", record.live?.summary);
  check("…in amber", R.liveTone(record.live?.state) === "var(--amber-fg)");
  check("the list's one line says it, in amber", row.line[0]?.text === "Waiting to continue on a computer" && row.line[0]?.tone === "amber", JSON.stringify(row.line));
  check("…then the step, muted", row.lineText === "Waiting to continue on a computer · Your computer and connection · step 3 of 6", row.lineText);
  check("the profile's rail says the same words", rail === row.lineText, rail);
  check("Part-way, not 'Taking tests now'", row.tab === "part-way", row.tab);
  check("reaching the screen is their last move", row.lastActiveAt === ago(2 * HOUR) && row.activeWords === "Last active 2 h ago", `${row.lastActiveAt} · ${row.activeWords}`);
  check("the dot is 'now'", row.dots.find((d) => d.stepId === "wf-check")?.state === "now");
}
{
  const { entry } = read(app({}, { waiting_on_computer: stamp({ device_kind: "tablet", at: ago(20 * MIN) }) }));
  check("a tablet, 20 minutes ago", entry?.statusLabel === "Waiting to continue on a computer · opened on a tablet 20 min ago", entry?.statusLabel);
}
{
  // They took the check on a computer, walked away, then opened it on their
  // phone: the phone is the newer move.
  const older = session({ status: "abandoned", last_activity_at: ago(5 * HOUR), started_at: ago(5 * HOUR) });
  const { row } = read(app({}, { waiting_on_computer: stamp() }), [older]);
  check("an attempt left BEFORE the stamp: the waiting wins", row.lineText.startsWith("Waiting to continue on a computer"), row.lineText);
}

console.log("\nIgnored when it is no longer true:\n");
{
  // An attempt on the step since: they went to the computer.
  const doing = session({ last_activity_at: ago(MIN), started_at: ago(10 * MIN) });
  const { row, record, entry } = read(app({}, { waiting_on_computer: stamp() }), [doing]);
  check("an attempt being taken: its live line, not the waiting", record.live?.state === "doing" && !row.lineText.includes("Waiting"), row.lineText);
  check("…and the entry carries no waiting", !entry?.waiting, JSON.stringify(entry?.waiting));
}
{
  const leftAfter = session({ status: "abandoned", started_at: ago(HOUR), last_activity_at: ago(50 * MIN) });
  const { row } = read(app({}, { waiting_on_computer: stamp() }), [leftAfter]);
  check("an attempt that moved AFTER the stamp (and was left): 'Left …', not waiting", /^Left at/.test(row.lineText), row.lineText);
}
{
  const notes = { waiting_on_computer: stamp(), equipmentCheckResult: { download: 40, completedAt: ago(HOUR) } };
  const { row, entry } = read(app({ phase: "wf-typing" }, notes));
  check("the step's result landed: done, no waiting", entry?.status === "done" && !entry?.waiting, entry?.statusLabel);
  check("…and the next step reads not started, not waiting", !row.lineText.includes("Waiting"), row.lineText);
}
{
  const { row, record } = read(app({ status: "rejected" }, { waiting_on_computer: stamp() }));
  check("decided: no waiting", record.live == null && row.lineText === "Declined", row.lineText);
}
{
  // A stamp for the skills check (written by hand: the server refuses it).
  const { row, record } = read(app({ phase: "quiz" }, { quizResult: undefined, waiting_on_computer: stamp({ step_id: "quiz" }) }));
  check("a step the computer-only rule does not cover: ignored", record.live?.state !== "waiting" && !row.lineText.includes("Waiting"), row.lineText);
}
{
  // The stamp names a later step than the one that is theirs now.
  const { row } = read(app({ phase: "wf-check" }, { waiting_on_computer: stamp({ step_id: "wf-chat" }) }));
  check("a step that is not theirs now: ignored", !row.lineText.includes("Waiting"), row.lineText);
}
{
  const { row } = read(app({}, { waiting_on_computer: stamp({ device_kind: "desktop" }) }));
  check("a malformed stamp: ignored", !row.lineText.includes("Waiting"), row.lineText);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
