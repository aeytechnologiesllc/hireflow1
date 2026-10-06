#!/usr/bin/env node
/**
 * The applicant pages keep every answer as it is entered, resume from what the
 * server holds, and tell the server they are still there — without ever
 * blocking a test (docs/ASSESSMENT-RECORD.md §5.2).
 *
 * Runs the real src/hooks/useAssessmentSession.ts (bundled with esbuild; only
 * the Supabase client is stubbed) and proves that:
 *
 *   - the start reply is read field by field (the contract's example), and a
 *     reply in any other shape is treated as "no record", never a crash;
 *   - a chat resumes as the page's own messages, the applicant's turns keep
 *     their message ids, times move onto this browser's clock, and a last
 *     message nobody answered is found; an edge function's resume reply
 *     (turns with `role`) reads the same;
 *   - a quiz resumes with its picks and question, and deadlines taken from
 *     when each question was first shown on the SERVER's clock — expired ones
 *     dropped, so a reopened quiz can never walk itself to a blank paper;
 *   - the form draft round-trips (strings, pick-several lists, the form's own
 *     `_` state), stays under the size limit, and ignores questions the job
 *     no longer has;
 *   - the controller: two opens of one step within a moment share one call
 *     (no spurious "reloaded"); a heartbeat every 30 s only while the page is
 *     visible; hidden/visible go at once; a session the server has closed
 *     stops the heartbeat and is reported; the draft is saved 1.5 s after the
 *     last change with the latest answers, stops on HF004, retries a network
 *     failure; quiz "shown" goes once per question and before any answer, picks
 *     are debounced with the latest winning, a flush sends what is waiting;
 *   - closing the page sends a hidden heartbeat, the pending draft and the
 *     pending picks with keepalive requests;
 *   - the contract's error codes stop, drop or retry as documented, and a
 *     U+0000 (which Postgres refuses in jsonb before the function runs, 22P05)
 *     never leaves the page: every string and key in p_answers, p_answer,
 *     p_events and p_progress is cleaned, live and by keepalive;
 *   - a heartbeat is activity only with input since the previous beat
 *     (`p_active: true`), so a long answer still being typed never reads
 *     "Left"; the page's hint is sent whole and replaces the last; an
 *     attempt the sweep marked "left" comes back when the applicant does;
 *   - the test functions' answers: 503 turn_not_saved is sent again and then
 *     given back, never left as an unanswered bubble; 409 already_checking /
 *     already_recorded mean "we have your answers", never an error.
 *
 * And, against the REAL migration in PGlite (as the candidate, through the
 * same controller and integrity monitor the pages run): a beat with input
 * moves last_activity_at and a plain one does not; the hint replaces the
 * last; a NUL that would be refused (22P05) is stored cleaned; a 1.2 s switch
 * reaches the owner's card and a 999 ms one does not; a swept attempt is
 * revived by the applicant's next input; a grading claim whose request died
 * reads 'failed' on the next beat, so the page sends the test again.
 *
 * Run with: node scripts/assessment_session_client.test.mjs
 */

import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";

// fileURLToPath, not URL.pathname: the checkout lives in "HireFlow 1", and a
// pathname keeps the space as %20.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const bundle = await build({
  stdin: {
    contents:
      'export * from "./src/hooks/useAssessmentSession.ts";\n' +
      'export { createIntegrityMonitor, SHORT_AWAY_MS } from "./src/hooks/useTestIntegrity.ts";\n',
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
      name: "stub-aliases",
      setup(b) {
        b.onResolve({ filter: /^(@\/|sonner$)/ }, (args) => {
          if (args.path === "@/integrations/supabase/client") return { path: args.path, namespace: "stub" };
          if (args.path === "@/integrations/supabase/types") return { path: args.path, namespace: "stub" };
          if (args.path === "sonner") return { path: args.path, namespace: "stub" };
          if (args.path === "@/hooks/useAssessmentSession") return { path: path.join(ROOT, "src/hooks/useAssessmentSession.ts") };
          throw new Error(`no stub for ${args.path}`);
        });
        b.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({
          contents:
            args.path === "@/integrations/supabase/types"
              ? "export {};"
              : args.path === "sonner"
                ? "export const toast = { warning() {}, info() {}, error() {}, success() {} };"
                : 'export const supabase = {};\nexport const SUPABASE_URL = "https://example.supabase.co";\nexport const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";\n',
          loader: "js",
        }));
      },
    },
  ],
});
const mod = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const {
  classifyRecordingError,
  parseSessionReply,
  serverOffsetMs,
  turnsToMessages,
  unansweredCandidateTurn,
  turnsFromJson,
  pinnedScenarioFrom,
  quizQuestionRecordId,
  quizResumeFromReply,
  formStateToDraft,
  draftToFormState,
  draftForKeepalive,
  KEEPALIVE_DRAFT_BYTES,
  createSessionController,
  serverConversationState,
  serverCheckOutcome,
  serverCheckBaseline,
  standingWithServerDone,
  storedResultKey,
  withoutNul,
  isTurnNotSaved,
  TurnNotSavedError,
  restoreUnsentText,
  gradingReplyOutcome,
  functionErrorReply,
  PROGRESS_HINT_BYTES,
  ACTIVITY_EVENTS,
  createIntegrityMonitor,
  SHORT_AWAY_MS,
} = mod;

let failures = 0;
function check(name, condition, detail) {
  if (condition) console.log(`  ok    ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`);
  }
}
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

/* ----------------------------------------------------------- the reply */

console.log("\nThe start reply:\n");
const CONTRACT_REPLY = {
  session_id: "4e97b1a3-0000-4000-8000-000000000001",
  step_id: "step_chat",
  step_type: "chat_simulation",
  attempt: 1,
  status: "active",
  started_at: "2026-10-06T15:48:40Z",
  last_activity_at: "2026-10-06T15:51:20Z",
  ended_at: null,
  progress: { candidate_turns: 1, assistant_turns: 1 },
  integrity: { total: 3, away_count: 2 },
  turns: [
    { seq: 3, kind: "candidate_turn", content: "Sorry to hear that…", client_msg_id: "m1", created_at: "2026-10-06T15:49:10Z" },
    { seq: 2, kind: "assistant_turn", content: "Hi, my deposit is missing.", client_msg_id: "opener", created_at: "2026-10-06T15:48:50Z" },
  ],
  draft: null,
  quiz: null,
  finished: false,
  resumed: true,
  server_now: "2026-10-06T15:51:31Z",
};
{
  const reply = parseSessionReply(CONTRACT_REPLY);
  check("the contract's example parses", reply?.session_id === CONTRACT_REPLY.session_id && reply.resumed === true);
  check("turns come back in seq order", reply?.turns.map((t) => t.seq).join() === "2,3");
  check("progress and integrity are kept", reply?.progress.candidate_turns === 1 && reply?.integrity.away_count === 2);
  check("anything else is no record (null), not a crash", parseSessionReply(null) === null && parseSessionReply({ hello: 1 }) === null && parseSessionReply("x") === null);
  const clientNow = Date.parse("2026-10-06T15:51:21Z");
  check("server offset: server_now − this clock", serverOffsetMs(reply, clientNow) === 10_000);
  check("no clock → offset 0", serverOffsetMs({ server_now: null }, clientNow) === 0);

  const messages = turnsToMessages(reply.turns, { candidate: "agent", other: "customer" }, 10_000);
  check("turns become the page's messages, roles mapped", messages.map((m) => m.role).join() === "customer,agent");
  check("the applicant's turn keeps its message id (the server's key for it)", messages[1].id === "m1");
  check("the other side is numbered by seq", messages[0].id === "turn-2");
  check("times move onto this browser's clock", messages[0].timestamp.toISOString() === "2026-10-06T15:48:40.000Z", messages[0].timestamp);
  check("a last message nobody answered is found", unansweredCandidateTurn(reply.turns)?.client_msg_id === "m1");
  check("…and an answered conversation has none", unansweredCandidateTurn(reply.turns.slice(0, 1)) === null);

  const fromEdge = turnsFromJson({
    resumed: true,
    turns: [
      { seq: 2, role: "assistant", content: "Hello", client_msg_id: "opener", created_at: "2026-10-06T15:48:50Z" },
      { seq: 3, role: "user", content: "Hi", client_msg_id: "m1", created_at: "2026-10-06T15:49:10Z" },
    ],
    scenario: { scenario: "Tasha's deposit", customerName: "Tasha", scenarioId: "zulu-deposit-missing" },
  });
  check("an edge function's resume reply (turns with role) reads the same", fromEdge?.map((t) => t.kind).join() === "assistant_turn,candidate_turn");
  check("a streamed reply is not mistaken for turns", turnsFromJson({ choices: [] }) === null);
  check("the pinned scenario is read from a resume reply", pinnedScenarioFrom({ scenario: { scenario: "S", customerName: "Tasha" } })?.customerName === "Tasha");
  check("…and from the leading SSE line", pinnedScenarioFrom({ assessment: { recorded: true, scenario: { scenario: "S", customerName: "Marcus" } } })?.customerName === "Marcus");
}

/* ------------------------------------------------------------ the quiz */

console.log("\nResuming a quiz from the server's record:\n");
{
  const questions = [
    { id: "zq1", time_limit_seconds: 60 },
    { id: "zq2", time_limit_seconds: 30 },
    { id: "zq3", time_limit_seconds: 60 },
  ];
  // Server clock is 10 s ahead of this browser.
  const offsetMs = 10_000;
  const serverNow = Date.parse("2026-10-06T16:00:00Z");
  const nowMs = serverNow - offsetMs;
  const reply = parseSessionReply({
    ...CONTRACT_REPLY,
    step_id: "quiz",
    step_type: "quiz",
    turns: [],
    progress: { answered: 2, total: 3, current_question_id: "zq3", current_index: 2 },
    quiz: {
      answers: { zq1: 1, zq2: 0 },
      shown_at: {
        zq1: "2026-10-06T15:58:00Z", // 120 s ago on the server: its 60 s clock ran out
        zq2: "2026-10-06T15:59:50Z", // 10 s ago: 20 s left
        zq3: "2026-10-06T15:59:40Z", // 20 s ago: 40 s left
      },
    },
    server_now: "2026-10-06T16:00:00Z",
  });
  const resume = quizResumeFromReply(reply, questions, { offsetMs, nowMs });
  check("started (questions were shown)", resume.started === true);
  check("the picks come back keyed by question id", JSON.stringify(resume.answers) === '{"zq1":1,"zq2":0}', resume.answers);
  check("the question they were on comes back", resume.currentIndex === 2);
  check("an expired deadline is dropped (that question gets a fresh clock)", !("zq1" in resume.deadlines), resume.deadlines);
  check(
    "a live deadline is shown_at + limit on the server, moved onto this clock",
    resume.deadlines.zq2 === new Date(Date.parse("2026-10-06T15:59:50Z") - offsetMs + 30_000).toISOString() &&
      Date.parse(resume.deadlines.zq3) - nowMs === 40_000,
    resume.deadlines,
  );
  check("every deadline restored is in the future", Object.values(resume.deadlines).every((iso) => Date.parse(iso) > nowMs));
  check("a finished quiz resumes nothing", quizResumeFromReply({ ...reply, finished: true }, questions, { offsetMs, nowMs }).started === false);
  check("no record resumes nothing", quizResumeFromReply(null, questions, { offsetMs, nowMs }).started === false);
  check("a question with no id is recorded as __idx_<n>", quizQuestionRecordId({}, 4) === "__idx_4" && quizQuestionRecordId({ id: "zq9" }, 8) === "zq9");
  const outOfRange = quizResumeFromReply({ ...reply, progress: { current_index: 7 } }, questions, { offsetMs, nowMs });
  check("a question index the page does not have falls back to the furthest question shown", outOfRange.currentIndex === 2, outOfRange.currentIndex);
  // A pick on question 2 reached the server after question 3's "shown" (a
  // retry, a slow request): progress.current_index says 1, but they were on 3.
  const behind = quizResumeFromReply({ ...reply, progress: { current_index: 1 } }, questions, { offsetMs, nowMs });
  check("a current_index moved back by a late pick resumes at the furthest question shown", behind.currentIndex === 2, behind.currentIndex);
  const noIndex = quizResumeFromReply({ ...reply, progress: {} }, questions, { offsetMs, nowMs });
  check("no current_index at all: the furthest question shown", noIndex.currentIndex === 2);
  // The hiring team replaced every question while this attempt was open.
  const replaced = [{ id: "zr1", time_limit_seconds: 60 }, { id: "zr2", time_limit_seconds: 60 }, { id: "zr3", time_limit_seconds: 60 }];
  const foreign = quizResumeFromReply(reply, replaced, { offsetMs, nowMs });
  check("a record of questions the quiz no longer has resumes nothing", foreign.started === false && foreign.currentIndex === null && Object.keys(foreign.answers).length === 0, foreign);
  const partly = quizResumeFromReply(reply, [replaced[0], questions[2]], { offsetMs, nowMs });
  check("…but one it still has keeps the attempt going", partly.started === true && partly.currentIndex === 1, partly);
}

/* ------------------------------------------------------------ the form */

console.log("\nThe application draft:\n");
{
  const state = {
    answers: { q1: "Robin Okafor", q3: "555-0100", q9: "" },
    multiAnswers: { q5: ["Mornings", "Weekends"] },
    phoneCountryCodes: { q3: "+1" },
    questionFileUrls: { q12: "user/resume.pdf" },
    coverLetter: "Hello",
  };
  const draft = formStateToDraft(state);
  check("answers keyed by question id, lists for pick-several", draft.q1 === "Robin Okafor" && Array.isArray(draft.q5));
  check("the form's own state under _ keys", draft._phoneCountryCodes.q3 === "+1" && draft._coverLetter === "Hello" && draft._questionFileUrls.q12);
  const back = draftToFormState(draft, [{ id: "q1" }, { id: "q3" }, { id: "q5" }, { id: "q9" }]);
  check("round trip: strings, lists and _ state", back.answers.q1 === "Robin Okafor" && back.multiAnswers.q5.join() === "Mornings,Weekends" && back.phoneCountryCodes.q3 === "+1" && back.coverLetter === "Hello");
  check("filled counts answered questions and the cover letter (not blanks)", back.filled === 4, back.filled);
  check("a question the job no longer has is ignored", !("q12" in back.answers) && draftToFormState({ gone: "x" }, [{ id: "q1" }]).filled === 0);
  check("no draft → nothing to restore", draftToFormState(null, [{ id: "q1" }]) === null);
  check("a draft that fits the keepalive budget travels whole", draftForKeepalive(draft) === draft);
  const longLetter = draftForKeepalive({ ...draft, _coverLetter: "x".repeat(50_000) });
  check("…a long cover letter is left out of the keepalive (the ordinary save carried it)", longLetter && !("_coverLetter" in longLetter) && longLetter.q1 === "Robin Okafor" && JSON.stringify(longLetter).length <= KEEPALIVE_DRAFT_BYTES);
  check("…and a draft too big even then is not sent by keepalive", draftForKeepalive({ q1: "y".repeat(50_000) }) === null);
  const huge = formStateToDraft({ ...state, coverLetter: "x".repeat(70_000) });
  check("over the limit the cover letter goes first", huge && !("_coverLetter" in huge) && huge.q1 === "Robin Okafor");
  check("still too big → nothing is sent", formStateToDraft({ ...state, answers: { q1: "y".repeat(70_000) } }) === null);
}

/* ------------------------------------------------------------- errors */

console.log("\nError codes (§4.1):\n");
{
  const stop = ["42501", "HF001", "HF002", "HF003", "HF005", "PGRST202"].every((code) => classifyRecordingError({ code }) === "stop");
  check("wrong person, closed, unknown/unreached step, full, not deployed → stop", stop);
  check("HF004 (sent) and 22023 (bad argument) → drop", classifyRecordingError({ code: "HF004" }) === "drop" && classifyRecordingError({ code: "22023" }) === "drop");
  check("22P05 (a U+0000 Postgres refused before the function ran) → drop, never retried", classifyRecordingError({ code: "22P05" }) === "drop");
  check("a network failure → retry", classifyRecordingError({ message: "TypeError: Failed to fetch", code: "" }) === "retry");
  check("an expired token (PGRST301) → retry after supabase-js refreshes it", classifyRecordingError({ code: "PGRST301" }) === "retry");
}

/* ------------------------------------------------------- the controller */

function harness({ rpc, hidden = false, applicationId = "app-1", stepId = "step_chat" } = {}) {
  let now = 5_000_000;
  let isHidden = hidden;
  let seq = 0;
  const timers = new Map();
  const calls = [];
  const keepalives = [];
  const replies = [];
  const statuses = [];
  const controller = createSessionController({
    applicationId,
    stepId,
    rpc: async (fn, args) => {
      calls.push({ fn, args: JSON.parse(JSON.stringify(args)) });
      return rpc ? rpc(fn, args, calls) : { data: null, error: null };
    },
    keepalive: (fn, args) => keepalives.push({ fn, args: JSON.parse(JSON.stringify(args)) }),
    now: () => now,
    setTimeout: (fn, ms) => {
      seq += 1;
      timers.set(seq, { fn, at: now + ms });
      return seq;
    },
    clearTimeout: (id) => timers.delete(id),
    isHidden: () => isHidden,
    onReply: (reply, offset) => replies.push({ reply, offset }),
    onServerStatus: (status) => statuses.push(status),
  });
  return {
    controller,
    calls,
    keepalives,
    replies,
    statuses,
    advance(ms) {
      now += ms;
    },
    setHidden(value) {
      isHidden = value;
    },
    async runDue() {
      for (let guard = 0; guard < 30; guard += 1) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at);
        if (due.length === 0) break;
        for (const [id, t] of due) {
          timers.delete(id);
          t.fn();
        }
        await settle();
      }
      await settle();
    },
    fns: (name) => calls.filter((c) => c.fn === name),
  };
}

const okStart = (fn) =>
  fn === "start_assessment_session"
    ? { data: { ...CONTRACT_REPLY, server_now: new Date().toISOString() }, error: null }
    : fn === "touch_assessment_session"
      ? { data: { updated: true, status: "active" }, error: null }
      : { data: { ok: true }, error: null };

console.log("\nOpening and heartbeat:\n");
{
  const a = harness({ rpc: okStart, applicationId: "app-share" });
  const b = harness({ rpc: okStart, applicationId: "app-share" });
  await Promise.all([a.controller.start(), b.controller.start()]);
  check("two opens of one step within a moment share one call", a.fns("start_assessment_session").length + b.fns("start_assessment_session").length === 1);
  check("…and both get the reply", a.replies[0]?.reply?.session_id === CONTRACT_REPLY.session_id && b.replies[0]?.reply?.session_id === CONTRACT_REPLY.session_id);

  const t = harness({ rpc: okStart, applicationId: "app-hb" });
  await t.controller.start();
  t.controller.setLive(true);
  t.advance(30_000);
  await t.runDue();
  check("a heartbeat after 30 s while visible", t.fns("touch_assessment_session").length === 1 && !("p_hidden" in t.fns("touch_assessment_session")[0].args));
  t.setHidden(true);
  t.advance(30_000);
  await t.runDue();
  check("no plain heartbeat while hidden", t.fns("touch_assessment_session").length === 1);
  t.controller.visibility(true);
  await settle();
  check("hidden goes at once with p_hidden true", t.fns("touch_assessment_session")[1]?.args.p_hidden === true);
  t.setHidden(false);
  t.controller.visibility(false);
  await settle();
  check("visible again goes at once with p_hidden false", t.fns("touch_assessment_session")[2]?.args.p_hidden === false);
  t.controller.setClientProgress({ screen: "conversation" });
  t.advance(300);
  await t.runDue();
  check("the page's hint goes in p_progress", t.fns("touch_assessment_session").at(-1)?.args.p_progress?.screen === "conversation", t.fns("touch_assessment_session").at(-1));
  const touchesBefore = t.fns("touch_assessment_session").length;
  t.advance(30_000);
  await t.runDue();
  check("…once (not again on every heartbeat)", t.fns("touch_assessment_session").length === touchesBefore + 1 && !("p_progress" in t.fns("touch_assessment_session").at(-1).args));
  t.controller.setLive(false);
  t.advance(90_000);
  await t.runDue();
  check("no heartbeat once the page is not live", t.fns("touch_assessment_session").length === touchesBefore + 1);
}
{
  const t = harness({
    applicationId: "app-closed",
    rpc: (fn) =>
      fn === "touch_assessment_session"
        ? { data: { updated: false, status: "completed" }, error: null }
        : okStart(fn),
  });
  await t.controller.start();
  t.controller.setLive(true);
  t.advance(30_000);
  await t.runDue();
  t.advance(60_000);
  await t.runDue();
  check("a session the server closed is reported to the page", t.statuses.join() === "completed");
  check("…and the heartbeat stops", t.fns("touch_assessment_session").length === 1);
}
{
  // A send being checked (or owed after a crash) keeps the heartbeat going:
  // it is how a page waiting on the check learns how it ended.
  const answers = ["grading", "grading", "failed", "failed"];
  const t = harness({
    applicationId: "app-grading",
    rpc: (fn) =>
      fn === "touch_assessment_session"
        ? { data: { updated: false, status: answers.shift() ?? "completed" }, error: null }
        : okStart(fn),
  });
  await t.controller.start();
  t.controller.setLive(true);
  for (let i = 0; i < 3; i += 1) {
    t.advance(30_000);
    await t.runDue();
  }
  check("while grading the heartbeat goes on and reports each status", t.statuses.join() === "grading,grading,failed", t.statuses);
}

console.log("\nA send the server is already checking:\n");
{
  check("an active session is open", serverConversationState({ status: "active", finished: false }, null) === "open");
  check("grading (End pressed before a reload) is checking", serverConversationState({ status: "grading", finished: false }, null) === "checking");
  check("failed (the check crashed) is owed", serverConversationState({ status: "failed", finished: false }, null) === "owed");
  check("a finished step is done", serverConversationState({ status: "completed", finished: true }, null) === "done");
  check("the heartbeat's status is newer than the start reply's", serverConversationState({ status: "grading", finished: false }, "failed") === "owed" && serverConversationState({ status: "active", finished: false }, "grading") === "checking");
  check("no record is open", serverConversationState(null, null) === "open");

  const base = { baselineKey: null, currentKey: null, serverStatus: null, statusAtBegin: null };
  check("waiting until something changes", serverCheckOutcome(base) === "waiting");
  check("the result appearing has landed", serverCheckOutcome({ ...base, currentKey: '{"score":80}' }) === "landed");
  check("an older result left by a staff reopen is not mistaken for it", serverCheckOutcome({ ...base, baselineKey: '{"score":40}', currentKey: '{"score":40}' }) === "waiting");
  check("…a new one replacing it has landed", serverCheckOutcome({ ...base, baselineKey: '{"score":40}', currentKey: '{"score":80}' }) === "landed");
  check("the heartbeat saying failed is owed", serverCheckOutcome({ ...base, serverStatus: "failed", statusAtBegin: "grading" }) === "owed");
  check("…but not a stale failed from before the wait began", serverCheckOutcome({ ...base, serverStatus: "failed", statusAtBegin: "failed" }) === "waiting");
  check("storedResultKey: absent → null, present → comparable", storedResultKey(undefined) === null && storedResultKey({ a: 1 }) === '{"a":1}');

  // The baseline of a wait (useServerCheck.begin).
  check("the page's own baseline wins (a 409 on its own send)", serverCheckBaseline('{"before":1}', null, '{"now":1}') === '{"before":1}' && serverCheckBaseline(null, '{"load":1}', '{"now":1}') === null);
  check("…else the result as the page first read it", serverCheckBaseline(undefined, '{"load":1}', '{"now":1}') === '{"load":1}' && serverCheckBaseline(undefined, null, '{"now":1}') === null);
  check("…else (a page that gives no first read) the result now", serverCheckBaseline(undefined, undefined, '{"now":1}') === '{"now":1}');
  // End pressed on the phone; the laptop's realtime refresh caches the new
  // result before its next heartbeat says "completed" and the wait begins.
  const landedKey = '{"score":81}';
  const atBeginNow = serverCheckBaseline(undefined, undefined, landedKey);
  const atBeginLoad = serverCheckBaseline(undefined, null, landedKey);
  check(
    "a wait begun after the result was already cached: a 'now' baseline never sees it land (the bug); the first read does",
    serverCheckOutcome({ baselineKey: atBeginNow, currentKey: landedKey, serverStatus: "completed", statusAtBegin: "completed" }) === "waiting"
      && serverCheckOutcome({ baselineKey: atBeginLoad, currentKey: landedKey, serverStatus: "completed", statusAtBegin: "completed" }) === "landed",
  );
  check(
    "…and a retake (an old result on file at first read) still waits for the NEW one",
    serverCheckOutcome({ baselineKey: serverCheckBaseline(undefined, '{"score":40}', '{"score":40}'), currentKey: '{"score":40}', serverStatus: "completed", statusAtBegin: "completed" }) === "waiting",
  );
}

console.log("\nA step the server says is finished is never offered again:\n");
{
  const steps = [{ id: "application" }, { id: "quiz" }, { id: "step_typing" }, { id: "step_chat" }, { id: "decision" }];
  const take = (index) => ({ kind: "take", index, step: { ...steps[index], type: "x", title: "T" } });
  check("no word from the server: unchanged", standingWithServerDone(steps, take(2), null, "decision").kind === "take");
  check("another step finished: unchanged", standingWithServerDone(steps, take(2), "step_chat", "decision").kind === "take");
  const typingDone = standingWithServerDone(steps, take(2), "step_typing", "decision");
  check(
    "a manual-mode job on a finished typing test (status pending, phase still on it): 'saved, the next one is not open', never 'take'",
    typingDone.kind === "waiting" && typingDone.index === 2 && typingDone.step.id === "step_typing",
    JSON.stringify(typingDone),
  );
  const lastDone = standingWithServerDone(steps, take(3), "step_chat", "decision");
  check("the last real step finished: 'finished every step', at the Decision stage", lastDone.kind === "finished" && lastDone.index === 4, JSON.stringify(lastDone));
  const waiting = { kind: "waiting", index: 2, step: steps[2] };
  check("any other standing is left as it is", standingWithServerDone(steps, waiting, "step_typing", "decision") === waiting);
}
{
  const t = harness({ applicationId: "app-old", rpc: (fn) => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }) });
  const reply = await t.controller.start();
  t.controller.setLive(true);
  t.advance(120_000);
  await t.runDue();
  check("no record function (PGRST202): the page gets null and carries on", reply === null && t.replies[0]?.reply === null);
  check("…and nothing else is tried", t.calls.length === 1, t.calls.map((c) => c.fn));
}
{
  const t = harness({
    applicationId: "app-done",
    rpc: (fn) => (fn === "start_assessment_session" ? { data: { ...CONTRACT_REPLY, finished: true, resumed: false, turns: [] }, error: null } : okStart(fn)),
  });
  await t.controller.start();
  t.controller.setLive(true);
  t.advance(60_000);
  await t.runDue();
  check("a finished step opens nothing and sends no heartbeat", t.controller.sessionId === null && t.fns("touch_assessment_session").length === 0);
}

console.log("\nThe form draft:\n");
{
  const t = harness({ applicationId: "app-draft", stepId: "application", rpc: okStart });
  t.controller.saveDraft({ q1: "R" });
  t.advance(500);
  t.controller.saveDraft({ q1: "Ro" });
  t.advance(500);
  t.controller.saveDraft({ q1: "Robin" });
  t.advance(1_499);
  await t.runDue();
  check("nothing saved while they are still typing", t.fns("save_application_draft").length === 0);
  t.advance(1);
  await t.runDue();
  check("one save 1.5 s after the last change, with the latest answers", t.fns("save_application_draft").length === 1 && t.fns("save_application_draft")[0].args.p_answers.q1 === "Robin");
  check("…for this application", t.fns("save_application_draft")[0].args.p_application_id === "app-draft");
  t.controller.saveDraft({ q1: "Robin O" });
  t.controller.visibility(true);
  await settle();
  check("hiding the page saves at once", t.fns("save_application_draft").length === 2);
}
{
  let n = 0;
  const t = harness({
    applicationId: "app-draft-2",
    stepId: "application",
    rpc: (fn) => (fn === "save_application_draft" ? (++n === 1 ? { error: { message: "Failed to fetch" } } : { error: { code: "HF004" } }) : okStart(fn)),
  });
  t.controller.saveDraft({ q1: "A" });
  t.advance(1_500);
  await t.runDue();
  check("a network failure is retried", t.fns("save_application_draft").length === 1);
  t.advance(5_000);
  await t.runDue();
  check("…a few seconds later", t.fns("save_application_draft").length === 2);
  t.controller.saveDraft({ q1: "AB" });
  t.advance(1_500);
  await t.runDue();
  check("once the form is sent (HF004) drafts stop", t.fns("save_application_draft").length === 2);
}

{
  // Closing a tab: the browser hides the page (the ordinary save starts) and
  // then fires pagehide, and usually cancels that save as it unloads.
  const t = harness({
    applicationId: "app-draft-close",
    stepId: "application",
    rpc: (fn) => (fn === "save_application_draft" ? new Promise(() => {}) : okStart(fn)),
  });
  t.controller.saveDraft({ q1: "last words typed" });
  t.controller.visibility(true);
  await settle();
  t.controller.pageHide();
  const kept = t.keepalives.filter((k) => k.fn === "save_application_draft");
  check("a save cut off by the tab closing still goes by keepalive", kept.length === 1 && kept[0].args.p_answers.q1 === "last words typed", t.keepalives);
}
{
  const t = harness({ applicationId: "app-draft-acked", stepId: "application", rpc: okStart });
  t.controller.saveDraft({ q1: "saved" });
  t.advance(1_500);
  await t.runDue();
  t.controller.pageHide();
  check("a draft the server already acknowledged is not sent again on close", t.keepalives.filter((k) => k.fn === "save_application_draft").length === 0, t.keepalives);
}

console.log("\nQuiz picks on the server's clock:\n");
{
  const order = [];
  let inFlight = 0;
  let overlapped = false;
  const t = harness({
    applicationId: "app-quiz",
    stepId: "quiz",
    rpc: async (fn, args) => {
      // A pick must never be on the wire while the question's "shown" still
      // is: the server times the answer from the stored shown event.
      if (inFlight > 0) overlapped = true;
      inFlight += 1;
      order.push(`${args.p_answer === null ? "shown" : "answer"}:${args.p_question_id}`);
      await new Promise((resolve) => setTimeout(resolve, args.p_answer === null ? 15 : 2));
      inFlight -= 1;
      return { data: { recorded: true }, error: null };
    },
  });
  t.controller.quizShown("zq1", "2026-10-06T16:00:00.000Z");
  t.controller.quizShown("zq1", "2026-10-06T16:00:00.000Z");
  t.controller.quizAnswer("zq1", 2, "2026-10-06T16:00:00.000Z", 400);
  t.advance(100);
  t.controller.quizAnswer("zq1", 1, "2026-10-06T16:00:00.000Z", 400);
  t.advance(400);
  await t.runDue();
  await new Promise((resolve) => setTimeout(resolve, 20));
  check("'shown' goes once per question", order.filter((o) => o === "shown:zq1").length === 1, order);
  check("a change of mind inside the pause sends only the latest pick", t.calls.filter((c) => c.args.p_answer !== null).map((c) => c.args.p_answer).join() === "1");
  check("'shown' always reaches the server before the answer", order.join() === "shown:zq1,answer:zq1", order);
  check("…one call at a time (the answer waits for 'shown' to be stored)", !overlapped);
  check("the page's shown time rides along (p_shown_at)", t.calls[0].args.p_shown_at === "2026-10-06T16:00:00.000Z");
  t.controller.quizShown("zq2");
  t.controller.quizAnswer("zq2", "typed answer", null, 1_500);
  await t.controller.flushQuiz();
  check("a pick flushed right after its question appears still waits for 'shown'", !overlapped && order.slice(-2).join() === "shown:zq2,answer:zq2", order);
  check("flushQuiz sends a pick still waiting on its pause (before the quiz is graded)", t.calls.some((c) => c.args.p_question_id === "zq2"));
}
{
  // Pick on question 2, then Next within the pick's pause: the pick must reach
  // the server before question 3's "shown" (the answer moves current_index).
  const order = [];
  const t = harness({
    applicationId: "app-quiz-order",
    stepId: "quiz",
    rpc: async (fn, args) => {
      order.push(`${args.p_answer === null ? "shown" : "answer"}:${args.p_question_id}`);
      return { data: { recorded: true }, error: null };
    },
  });
  t.controller.quizShown("zq2");
  t.controller.quizAnswer("zq2", 1, null, 400);
  t.advance(150);
  t.controller.quizShown("zq3");
  t.advance(400);
  await t.runDue();
  await settle();
  check("a pick still on its pause goes before the next question's 'shown'", order.join() === "shown:zq2,answer:zq2,shown:zq3", order);
  t.controller.quizAnswer("zq3", 0, null, 400);
  t.advance(100);
  t.controller.quizShown("zq2"); // back to a question already shown
  await t.runDue();
  await settle();
  check("…also when going back to a question already shown", order.slice(-1)[0] === "answer:zq3" && order.filter((o) => o === "shown:zq2").length === 1, order);
}
{
  const t = harness({ applicationId: "app-quiz-2", stepId: "quiz", rpc: () => ({ error: { code: "HF004" } }) });
  t.controller.quizShown("zq1");
  await settle();
  t.controller.quizAnswer("zq1", 1, null, 10);
  t.advance(10);
  await t.runDue();
  check("a sent quiz (HF004) drops the call, never throws", t.calls.length === 2);
}

console.log("\nClosing the page:\n");
{
  const t = harness({ rpc: okStart, applicationId: "app-close", stepId: "quiz" });
  await t.controller.start();
  t.controller.saveDraft({ q1: "unsaved" });
  t.controller.quizAnswer("zq3", 0, "2026-10-06T16:01:00.000Z", 1_500);
  t.controller.pageHide();
  const sent = t.keepalives.map((k) => k.fn).sort().join();
  check("a hidden heartbeat, the pending draft and the pending pick go by keepalive", sent === "record_quiz_answer,save_application_draft,touch_assessment_session", t.keepalives);
  check("the heartbeat says hidden", t.keepalives.find((k) => k.fn === "touch_assessment_session")?.args.p_hidden === true);
  t.advance(5_000);
  await t.runDue();
  t.controller.dispose();
  await settle();
  check("…and they are not sent twice afterwards (nor on unmount)", t.fns("save_application_draft").length === 0 && t.fns("record_quiz_answer").length === 0);
}


/* ------------------------------------------------------------- U+0000 */

console.log("\nNo U+0000 ever leaves the page (§4.1):\n");
{
  const input = {
    "fq1": "Robin\u0000 Okafor",
    "fq\u00002": ["Mornings\u0000", "Weekends"],
    "fq2": "kept apart",
    _phoneCountryCodes: { "fq\u00003": "+1\u0000" },
    n: 3,
    t: true,
    z: null,
  };
  const out = withoutNul(input);
  const json = JSON.stringify(out);
  check("strings, keys, nested lists and objects: no U+0000 left", !json.includes("\\u0000"), json);
  check("…each NUL becomes U+FFFD, the server's rule", out.fq1 === "Robin� Okafor" && out["fq�2"][0] === "Mornings�");
  check("…so two keys that differ only by a NUL stay two keys", out.fq2 === "kept apart" && Array.isArray(out["fq�2"]));
  check("…numbers, booleans and null are kept", out.n === 3 && out.t === true && out.z === null);
  check("…and a value with nothing to clean is unchanged", JSON.stringify(withoutNul({ a: "plain", b: [1, { c: "x" }] })) === '{"a":"plain","b":[1,{"c":"x"}]}');
}
{
  const t = harness({ rpc: okStart, applicationId: "app-nul", stepId: "application" });
  await t.controller.start();
  t.controller.setLive(true);
  t.controller.saveDraft({ "fq1": "pasted\u0000 from a PDF", "fq\u00009": "x" });
  t.advance(1_500);
  await t.runDue();
  t.controller.quizAnswer("zq1", "option\u0000 text", null, 10);
  t.advance(10);
  await t.runDue();
  t.controller.setClientProgress({ screen: "form\u0000" });
  t.advance(300);
  await t.runDue();
  const live = JSON.stringify(t.calls);
  check("draft, pick and hint go to the server without a U+0000", !live.includes("\\u0000") && t.fns("save_application_draft").length === 1 && t.fns("record_quiz_answer").length === 1 && t.fns("touch_assessment_session").some((c) => c.args.p_progress), live);
  check("…keys included", "fq�9" in t.fns("save_application_draft")[0].args.p_answers);
  t.controller.saveDraft({ "fq1": "typed\u0000 then closed" });
  t.controller.quizAnswer("zq2", "late\u0000", null, 1_500);
  t.controller.pageHide();
  const closing = JSON.stringify(t.keepalives);
  check("…and the keepalives on close do too", t.keepalives.length === 3 && !closing.includes("\\u0000"), closing);
}

/* ------------------------------------------------- activity (p_active) */

console.log("\nA heartbeat is activity only after input (§2.4):\n");
{
  const t = harness({ rpc: okStart, applicationId: "app-active" });
  await t.controller.start();
  t.controller.setLive(true);
  const beat = async () => {
    t.advance(30_000);
    await t.runDue();
    return t.fns("touch_assessment_session").at(-1)?.args;
  };
  let args = await beat();
  check("a beat with no input since the last one carries no p_active", args && !("p_active" in args), args);
  t.controller.noteActivity();
  args = await beat();
  check("input since the last beat (a key in a reply box nobody has sent) → p_active true", args?.p_active === true, args);
  args = await beat();
  check("…once: the next quiet beat carries none", args && !("p_active" in args), args);

  // A long answer, typed for twelve minutes without sending: every beat says so.
  let everyBeat = true;
  for (let i = 0; i < 24; i += 1) {
    t.controller.noteActivity();
    args = await beat();
    everyBeat = everyBeat && args?.p_active === true;
  }
  check("twelve minutes of typing an unsent answer: every beat is activity", everyBeat);

  t.controller.noteActivity();
  t.controller.visibility(true);
  await settle();
  args = t.fns("touch_assessment_session").at(-1)?.args;
  check("typing, then leaving: the hidden beat carries the input", args?.p_hidden === true && args?.p_active === true, args);
  t.controller.visibility(false);
  await settle();
  args = t.fns("touch_assessment_session").at(-1)?.args;
  check("coming back is p_hidden false (activity by itself), no stale p_active", args?.p_hidden === false && !("p_active" in args), args);
  t.controller.noteActivity();
  t.controller.pageHide();
  const closing = t.keepalives.find((k) => k.fn === "touch_assessment_session")?.args;
  check("typing right up to the close: the keepalive beat carries it", closing?.p_hidden === true && closing?.p_active === true, closing);
}
{
  // A beat that never reached the server keeps the input for the next one.
  let fail = true;
  const t = harness({
    applicationId: "app-active-retry",
    rpc: (fn) => (fn === "touch_assessment_session" && fail ? { data: null, error: { message: "Failed to fetch" } } : okStart(fn)),
  });
  await t.controller.start();
  t.controller.setLive(true);
  t.controller.noteActivity();
  t.advance(30_000);
  await t.runDue();
  fail = false;
  t.advance(30_000);
  await t.runDue();
  const beats = t.fns("touch_assessment_session");
  check("a failed beat's input is carried by the next beat", beats.length === 2 && beats[0].args.p_active === true && beats[1].args.p_active === true, beats);
}
{
  const source = await readFile(path.join(ROOT, "src/hooks/useAssessmentSession.ts"), "utf8");
  check("the hook listens for input on the whole document (keys, clicks, taps, wheel)", ["keydown", "input", "pointerdown", "touchstart", "wheel"].every((type) => ACTIVITY_EVENTS.includes(type)));
  check("…but not `scroll` (the page scrolls itself when the interviewer answers)", !ACTIVITY_EVENTS.includes("scroll"));
  check("…in the capture phase, passively, and only for real input", /addEventListener\(type, onInput, \{ capture: true, passive: true \}\)/.test(source) && /event\.isTrusted !== false/.test(source));
}

/* ------------------------------------------------- the page's hint */

console.log("\nThe page's hint is sent whole and replaces the last (§2.5):\n");
{
  const t = harness({ rpc: okStart, applicationId: "app-hint" });
  await t.controller.start();
  t.controller.setLive(true);
  t.controller.setClientProgress({ screen: "conversation", draft_chars: 120 });
  t.advance(300);
  await t.runDue();
  t.controller.setClientProgress({ screen: "review" });
  t.advance(300);
  await t.runDue();
  const hints = t.fns("touch_assessment_session").filter((c) => c.args.p_progress).map((c) => c.args.p_progress);
  check("each change sends the whole hint, never a part of it", hints.length === 2 && JSON.stringify(hints[1]) === '{"screen":"review"}', hints);

  t.controller.setClientProgress({ screen: "x".repeat(PROGRESS_HINT_BYTES + 10) });
  t.advance(300);
  await t.runDue();
  t.advance(30_000);
  await t.runDue();
  const after = t.fns("touch_assessment_session").slice(-2);
  check("a hint too big for the server (4 KB) is never sent, and the beats still go", after.length === 2 && after.every((c) => !("p_progress" in c.args)), after);
}
{
  let refused = false;
  const t = harness({
    applicationId: "app-hint-refused",
    rpc: (fn, args) => {
      if (fn === "touch_assessment_session" && args.p_progress) {
        refused = true;
        return { data: null, error: { code: "22023", message: "progress_must_be_a_small_object" } };
      }
      return okStart(fn);
    },
  });
  await t.controller.start();
  t.controller.setLive(true);
  t.controller.setClientProgress({ screen: "conversation" });
  t.advance(300);
  await t.runDue();
  t.advance(30_000);
  await t.runDue();
  t.advance(30_000);
  await t.runDue();
  const beats = t.fns("touch_assessment_session");
  check("a hint the server refused (22023) is not sent again; the heartbeat goes on without it", refused && beats.length === 3 && !("p_progress" in beats[1].args) && !("p_progress" in beats[2].args), beats);
}

/* --------------------------------------- swept "left", and coming back */

console.log("\nAn attempt marked 'left' while the page is open comes back with the applicant:\n");
{
  let touchStatus = "abandoned";
  const t = harness({
    applicationId: "app-swept",
    rpc: (fn) =>
      fn === "touch_assessment_session"
        ? touchStatus === "active"
          ? { data: { updated: true, status: "active" }, error: null }
          : { data: { updated: false, status: touchStatus }, error: null }
        : okStart(fn),
  });
  await t.controller.start();
  t.controller.setLive(true);
  t.advance(30_000);
  await t.runDue();
  t.advance(30_000);
  await t.runDue();
  check("a plain beat on a swept attempt: the heartbeat goes on, nothing is revived", t.fns("touch_assessment_session").length === 2 && t.fns("start_assessment_session").length === 1, t.calls.map((c) => c.fn));
  check("…and the page is told", t.statuses.join() === "abandoned,abandoned", t.statuses);
  touchStatus = "active";
  t.controller.noteActivity();
  await settle();
  check("the applicant's next input brings it back (start_assessment_session)", t.fns("start_assessment_session").length === 2);
  check("…and the page hears it is active again", t.statuses.at(-1) === "active", t.statuses);
  t.controller.noteActivity();
  await settle();
  check("…once (no second start for the next key)", t.fns("start_assessment_session").length === 2);
  t.advance(30_000);
  await t.runDue();
  check("the heartbeat carries on", t.fns("touch_assessment_session").length === 3 && t.fns("touch_assessment_session").at(-1).args.p_active === true);
}
{
  const t = harness({
    applicationId: "app-swept-back",
    rpc: (fn) => (fn === "touch_assessment_session" ? { data: { updated: false, status: "abandoned" }, error: null } : okStart(fn)),
  });
  await t.controller.start();
  t.controller.setLive(true);
  t.controller.visibility(false);
  await settle();
  check("coming back to the page (p_hidden false) on a swept attempt revives it at once", t.fns("start_assessment_session").length === 2, t.calls.map((c) => c.fn));
  t.controller.visibility(true);
  t.controller.visibility(false);
  await settle();
  check("…at most once a minute", t.fns("start_assessment_session").length === 2);
}

/* ------------------------------------------- the test functions' answers */

console.log("\nThe test functions' answers (503 turn_not_saved, 409):\n");
{
  check("503 turn_not_saved is an unsaved turn", isTurnNotSaved(503, { error: "x", code: "turn_not_saved", retryable: true }));
  check("…a plain 503 with retryable too", isTurnNotSaved(503, { retryable: true }));
  check("…but not a 500, or a 503 without a body", !isTurnNotSaved(500, { error: "boom" }) && !isTurnNotSaved(503, null));
  check("TurnNotSavedError is an Error", new TurnNotSavedError() instanceof Error);
  check("the text goes back into an empty box as it was", restoreUnsentText("", "my answer") === "my answer");
  check("…ahead of anything typed since", restoreUnsentText("and more", "my answer") === "my answer\nand more");

  check("200 (graded now, or alreadyRecorded) is ok", gradingReplyOutcome(200, { alreadyRecorded: true }) === "ok");
  check("409 already_checking: we have it, it is being checked", gradingReplyOutcome(409, { code: "already_checking" }) === "checking");
  check("409 already_recorded: we have it, it is on file", gradingReplyOutcome(409, { code: "already_recorded" }) === "on_file");
  check("anything else is an error", gradingReplyOutcome(409, { error: "x" }) === "error" && gradingReplyOutcome(500, null) === "error");

  const response = new Response(JSON.stringify({ error: "This typing test is already being checked.", code: "already_checking" }), { status: 409 });
  const reply = await functionErrorReply({ name: "FunctionsHttpError", context: response });
  check("a functions.invoke error gives its status and body", reply?.status === 409 && reply.body?.code === "already_checking", reply);
  check("…none when the request never got an answer", (await functionErrorReply({ name: "FunctionsFetchError", context: new TypeError("x") })) === null && (await functionErrorReply(null)) === null);
}
{
  const read = (rel) => readFile(path.join(ROOT, rel), "utf8");
  const PAGES = {
    "src/pages/ChatSimulationPhase.tsx": { send: "streamCustomerReply", record: "session" },
    "src/pages/ChatInterviewPhase.tsx": { send: "streamChat", record: "session" },
    "src/pages/SalesSimulationPhase.tsx": { send: "streamProspectReply", record: "record" },
  };
  for (const [rel] of Object.entries(PAGES)) {
    const text = await read(rel);
    const name = rel.split("/").pop();
    check(`${name}: a 503 turn_not_saved is sent once more under the same id`, /isTurnNotSaved\(response\.status, errorData\)/.test(text) && /if \(resent\) throw new TurnNotSavedError\(\);\s*\/\/[^\n]*\n\s*await new Promise\(\(resolve\) => setTimeout\(resolve, TURN_RESEND_DELAY_MS\)\);\s*response = await request\(\);/.test(text) && /clientMsgId: opts\.clientMsgId|clientMsgId,\n/.test(text));
    check(`${name}: …then the bubble comes off and the text goes back in the box`, /error instanceof TurnNotSavedError/.test(text) && /prev\.filter\(\(m\) => m\.id !== /.test(text) && /restoreUnsentText\(current, /.test(text));
    check(`${name}: a fresh send (and a local-draft resend) can be given back`, (text.match(/giveBack: true|, true\);/g) ?? []).length >= 2);
    check(`${name}: 409 already_checking / already_recorded waits for the result, no error`, /gradingReplyOutcome\(\w+\.status, \w+\)/.test(text) && /waitForServerCheck\(outcome === "on_file", resultBeforeSend\)/.test(text) && /serverCheck\.begin\(baselineKey\)/.test(text));
  }
  for (const [rel] of Object.entries(PAGES)) {
    const text = await read(rel);
    const name = rel.split("/").pop();
    check(
      `${name}: a wait it did not start with its own send compares against the result as first read`,
      /const loadResultKey = useResultKeyAtFirstLoad\(isFetchedAfterMount && !!application, stored\w+Result\);/.test(text)
        && /useServerCheck\(\{\s*storedResultKey: stored\w+Result,\s*serverStatus: \w+\.serverStatus,\s*loadResultKey,/.test(text),
    );
  }
  const typing = await read("src/pages/TypingTestPhase.tsx");
  check(
    "TypingTestPhase.tsx: reads the server's word before offering Start (finished → done, checking → wait)",
    /const where = serverConversationState\(session\.reply, session\.serverStatus\);\s*if \(where === "done"\) showFinishedOnServer\(\);\s*else if \(where === "checking"\) waitForCheckFromBefore\(\);/.test(typing),
  );
  check(
    "TypingTestPhase.tsx: manual mode shows 'saved' with a card that never offers this step again",
    /if \(finishedOnServer\) \{\s*return <NextStepCard applicationId=\{id!\} completedTitle=\{journeyStep\.title\} doneStepId=\{stepId\} \/>;/.test(typing),
  );
  check(
    "TypingTestPhase.tsx: a start the server refuses (409 step_finished / already_checking) never opens a run",
    /if \(code === "step_finished"\) \{\s*startRefusedRef\.current\.finished\(\);\s*return;/.test(typing)
      && /if \(code === "already_checking"\) \{\s*startRefusedRef\.current\.checking\(\);\s*return;/.test(typing),
  );
  check(
    "TypingTestPhase.tsx: a check that crashed for a send from before a reload reopens the test (no run of its own to resend)",
    /onOwed: \(\) => \{\s*setServerCheckWaiting\(false\);\s*if \(!results\) \{[\s\S]{0,300}setTestState\("intro"\);/.test(typing),
  );
  check("TypingTestPhase.tsx: a 409 is read from the invoke error", /functionErrorReply\(submitError\)/.test(typing) && /gradingReplyOutcome\(reply\.status, reply\.body\)/.test(typing));
  check("TypingTestPhase.tsx: on file → the usual 'saved' path; checking → wait for the result", /outcome === "on_file"\) \{\s*await afterTypingSaved\(isAutoMode\);/.test(typing) && /serverCheck\.begin\(resultBeforeSend\)/.test(typing) && /useServerCheck\(\{/.test(typing));
  check("TypingTestPhase.tsx: no second send while it is being checked", /disabled=\{isSubmitting \|\| serverCheckWaiting\}/.test(typing));

  // The computer and connection check (docs/EQUIPMENT-CHECK.md): `record` is
  // graded like a typing submit, so the page follows the same rules.
  const connection = await read("src/pages/ConnectionCheckPhase.tsx");
  check(
    "ConnectionCheckPhase.tsx: reads the server's word before offering Yes (finished → done, checking → wait)",
    /const where = serverConversationState\(session\.reply, session\.serverStatus\);\s*if \(where === "done"\) showFinishedOnServer\(\);\s*else if \(where === "checking"\) waitForCheckFromBefore\(\);/.test(connection),
  );
  check(
    "ConnectionCheckPhase.tsx: manual mode shows 'saved' with a card that never offers this step again",
    /if \(finishedOnServer\) \{\s*return <NextStepCard applicationId=\{id!\} completedTitle=\{journeyStep\.title\} doneStepId=\{stepId\} \/>;/.test(connection),
  );
  check(
    "ConnectionCheckPhase.tsx: a check that crashed for a send from before a reload opens the question again (no run of its own to resend)",
    /onOwed: \(\) => \{\s*setServerCheckWaiting\(false\);\s*if \(!runsRef\.current\.length\) \{[\s\S]{0,400}setScreen\("computer"\);/.test(connection),
  );
  check("ConnectionCheckPhase.tsx: a 409 is read from the invoke error", /functionErrorReply\(submitError\)/.test(connection) && /gradingReplyOutcome\(reply\.status, reply\.body\)/.test(connection));
  check("ConnectionCheckPhase.tsx: on file → the usual 'saved' path; checking → wait for the result", /outcome === "on_file"[^)]*\)\) \{\s*await afterCheckSaved\(isAutoMode\);/.test(connection) && /serverCheck\.begin\(resultBeforeSend\)/.test(connection) && /useServerCheck\(\{/.test(connection));
  check("ConnectionCheckPhase.tsx: no second send while it is being checked", /disabled=\{isSubmitting \|\| serverCheckWaiting/.test(connection));
  check(
    "ConnectionCheckPhase.tsx: a wait it did not start with its own send compares against the result as first read",
    /const loadResultKey = useResultKeyAtFirstLoad\(isFetchedAfterMount && !!application, storedCheckResult\);/.test(connection)
      && /useServerCheck\(\{\s*storedResultKey: storedCheckResult,\s*serverStatus: session\.serverStatus,\s*loadResultKey,/.test(connection),
  );
}

/* --------------------------------- against the real migration (PGlite) */

console.log("\nAgainst the real migration (PGlite), as the candidate:\n");
await (async () => {
  const MIGRATION = await readFile(path.join(ROOT, "supabase/migrations/20261005230146_assessment_record.sql"), "utf8").catch(() => null);
  if (!MIGRATION) {
    check("the migration is on disk", false);
    return;
  }
  const CANDIDATE = "20000000-0000-4000-8000-0000000000c1";
  const EMPLOYER = "10000000-0000-4000-8000-0000000000e1";
  const JOB = "30000000-0000-4000-8000-0000000000b1";
  const APP_CHAT = "40000000-0000-4000-8000-0000000000a1";
  const APP_FORM = "40000000-0000-4000-8000-0000000000a2";
  const db = new PGlite();
  // Just enough of the live schema (the same shape the schema proof uses:
  // scripts/assessment_record_schema.pglite.test.mjs).
  await db.exec(`
    create schema auth;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant anon to postgres; grant authenticated to postgres; grant service_role to postgres;
    grant usage on schema auth to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant execute on function auth.role() to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create type public.application_status as enum ('pending', 'reviewing', 'interview', 'offered', 'hired', 'rejected', 'in_progress');
    create type public.notification_type as enum ('message', 'application', 'interview', 'status_update', 'team', 'system');
    create table public.profiles (user_id uuid primary key, email text, full_name text);
    create table public.jobs (id uuid primary key default gen_random_uuid(), employer_id uuid not null, title text not null,
      workflow_steps jsonb default '[]'::jsonb, quiz_questions jsonb default '[]'::jsonb,
      application_questions jsonb default '[]'::jsonb, processing_mode text default 'auto');
    create table public.applications (id uuid primary key default gen_random_uuid(),
      job_id uuid not null references public.jobs(id) on delete cascade, candidate_id uuid not null,
      status public.application_status not null default 'pending', phase text default 'application', notes text,
      voice_interview_result jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create table public.team_members (id uuid primary key default gen_random_uuid(), user_id uuid not null, employer_id uuid not null,
      status text default 'active', can_create_jobs boolean default false, can_delete_jobs boolean default false,
      can_manage_pipeline boolean default false, assigned_job_ids uuid[] default '{}');
    create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null,
      type public.notification_type not null, title text not null, message text not null, link text,
      is_read boolean not null default false, created_at timestamptz not null default now(), push_sent_at timestamptz);
    CREATE OR REPLACE FUNCTION public.is_job_owner(p_job_id uuid, p_user_id uuid)
     RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
    AS $f$ SELECT (p_user_id = auth.uid() OR auth.role() = 'service_role')
      AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = p_job_id AND j.employer_id = p_user_id); $f$;
    CREATE OR REPLACE FUNCTION public.is_active_team_member_for_job(p_job_id uuid, p_user_id uuid,
      p_require_manage_pipeline boolean DEFAULT false, p_require_create_jobs boolean DEFAULT false,
      p_require_delete_jobs boolean DEFAULT false)
     RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
    AS $f$ SELECT false $f$;
    alter table public.applications enable row level security;
    create policy "candidate reads own" on public.applications for select using (auth.uid() = candidate_id);
    create policy "candidate updates own" on public.applications for update using (auth.uid() = candidate_id);
    alter table public.notifications enable row level security;
    create policy "own notifications" on public.notifications for select using (auth.uid() = user_id);
    create publication supabase_realtime;
    alter publication supabase_realtime add table public.applications, public.notifications;
  `);
  const WORKFLOW = [
    { id: "step_typing", type: "typing_test", title: "Typing speed and accuracy" },
    { id: "step_chat", type: "chat_simulation", title: "Player chat practice" },
  ];
  await db.query(`insert into public.profiles values ($1, 'owner@example.com', 'Owner Person'), ($2, 'robin@example.com', 'Robin Okafor')`, [EMPLOYER, CANDIDATE]);
  await db.query(
    `insert into public.jobs (id, employer_id, title, workflow_steps, application_questions) values ($1, $2, 'Chat agent', $3, $4)`,
    [JOB, EMPLOYER, JSON.stringify(WORKFLOW), JSON.stringify([{ id: "fq1", question: "Full name", type: "text" }, { id: "fq2", question: "Why us", type: "textarea" }])],
  );
  await db.query(
    `insert into public.applications (id, job_id, candidate_id, status, phase, notes) values
       ($1, $3, $4, 'pending', 'step_chat', '{"typingTestResult":{"wpm":40}}'),
       ($2, $3, $4, 'in_progress', 'application', '{}')`,
    [APP_CHAT, APP_FORM, JOB, CANDIDATE],
  );
  try {
    await db.exec(MIGRATION);
  } catch (e) {
    check("the migration applies", false, e.message);
    return;
  }

  const asOwner = async () => {
    await db.exec(`reset role;`);
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    await db.query(`select set_config('request.jwt.claim.role', '', false)`);
  };
  // supabase.rpc(fn, args) as the candidate: named arguments, jsonb as JSON
  // text — the way PostgREST hands them to Postgres, U+0000 escapes and all.
  const replies = [];
  const candidateRpc = async (fn, args) => {
    await db.exec(`reset role;`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [CANDIDATE]);
    await db.query(`select set_config('request.jwt.claim.role', 'authenticated', false)`);
    await db.exec(`set role authenticated;`);
    const names = Object.keys(args);
    const values = names.map((n) => (args[n] !== null && typeof args[n] === "object" ? JSON.stringify(args[n]) : args[n]));
    try {
      const res = await db.query(`select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as r`, values);
      replies.push({ fn, r: res.rows[0].r });
      return { data: res.rows[0].r, error: null };
    } catch (e) {
      replies.push({ fn, error: e.code });
      return { data: null, error: { code: e.code, message: e.message } };
    } finally {
      await asOwner();
    }
  };
  const session = async (app, step) => {
    await asOwner();
    return (await db.query(`select * from public.assessment_sessions where application_id = $1 and step_id = $2 order by attempt desc limit 1`, [app, step])).rows[0];
  };
  const quiet = async (id, minutes) => {
    await asOwner();
    await db.query(`update public.assessment_sessions set last_activity_at = now() - make_interval(mins => $2) where id = $1`, [id, minutes]);
  };
  const minutesQuiet = (row) => (Date.now() - new Date(row.last_activity_at).getTime()) / 60_000;

  // The real controller, its timers driven by hand, its clock the real one.
  function realController(applicationId, stepId) {
    const timers = new Map();
    let seq = 0;
    const keepalives = [];
    const statuses = [];
    const controller = createSessionController({
      applicationId,
      stepId,
      rpc: candidateRpc,
      keepalive: (fn, args) => keepalives.push({ fn, args }),
      now: () => Date.now(),
      setTimeout: (fn, ms) => {
        seq += 1;
        timers.set(seq, { fn, ms });
        return seq;
      },
      clearTimeout: (id) => timers.delete(id),
      isHidden: () => false,
      onServerStatus: (s) => statuses.push(s),
    });
    return {
      controller,
      keepalives,
      statuses,
      async beat() {
        // Fire the heartbeat (and anything else due), once.
        const due = [...timers.entries()];
        timers.clear();
        for (const [, t] of due) t.fn();
        for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r));
      },
    };
  }

  // -- p_active: the long unsent answer --------------------------------------
  const chat = realController(APP_CHAT, "step_chat");
  const opened = await chat.controller.start();
  check("start_assessment_session opens the chat attempt through the controller", opened?.status === "active" && !!opened.session_id, JSON.stringify(replies.at(-1)));
  chat.controller.setLive(true);
  await quiet(opened.session_id, 12);
  await chat.beat();
  let row = await session(APP_CHAT, "step_chat");
  check("a plain heartbeat after 12 quiet minutes is not activity: still 12 minutes quiet (reads 'Left')", minutesQuiet(row) > 11 && row.last_heartbeat_at !== null, `${minutesQuiet(row)} min`);
  chat.controller.noteActivity(); // a key in the reply box, nothing sent
  await chat.beat();
  row = await session(APP_CHAT, "step_chat");
  check("typing an answer nobody has sent yet: the next beat moves last_activity_at (not 'Left')", minutesQuiet(row) < 0.5, `${minutesQuiet(row)} min`);

  // -- p_progress replaces -----------------------------------------------------
  chat.controller.setClientProgress({ screen: "conversation", draft_chars: 340 });
  await chat.beat();
  chat.controller.setClientProgress({ screen: "review" });
  await chat.beat();
  row = await session(APP_CHAT, "step_chat");
  check("the page's hint replaces the last (progress.client is the latest whole hint)", JSON.stringify(row.progress.client) === '{"screen":"review"}', JSON.stringify(row.progress));
  chat.controller.setClientProgress({ screen: "conversation\u0000" });
  await chat.beat();
  row = await session(APP_CHAT, "step_chat");
  check("a hint with a U+0000 is stored, cleaned", row.progress.client?.screen === "conversation�" && replies.filter((r) => r.error === "22P05").length === 0, JSON.stringify(row.progress));

  // -- U+0000: what Postgres would refuse ---------------------------------------
  const raw = await candidateRpc("save_application_draft", { p_application_id: APP_FORM, p_answers: { fq1: "Robin\u0000" } });
  check("(the reason) a draft with a raw U+0000 is refused by Postgres: 22P05", raw.error?.code === "22P05", JSON.stringify(raw.error));
  const form = realController(APP_FORM, "application");
  await form.controller.start();
  form.controller.saveDraft({ fq1: "Robin\u0000 Okafor", "fq\u00002": "pasted from a PDF\u0000" });
  await form.controller.flushDraft();
  row = await session(APP_FORM, "application");
  check("through the controller the same draft is saved, cleaned", row?.draft?.fq1 === "Robin� Okafor" && row.draft["fq�2"] === "pasted from a PDF�", JSON.stringify(row?.draft));

  // -- the integrity monitor: 1 s, and NUL --------------------------------------
  let clock = Date.now();
  const sent = [];
  const monitor = createIntegrityMonitor({
    applicationId: APP_CHAT,
    stepId: "step_chat",
    mode: "test",
    now: () => clock,
    setTimeout: () => 0,
    clearTimeout: () => {},
    isHidden: () => false,
    send: async (events) => {
      const res = await candidateRpc("record_integrity_events", { p_application_id: APP_CHAT, p_step_id: "step_chat", p_events: events });
      sent.push(res);
      return { error: res.error };
    },
    keepalive: () => {},
    storage: null,
  });
  monitor.setActive(true);
  monitor.handle.blur({ type: "blur" });
  clock += 999;
  monitor.handle.focus({ type: "focus" });
  await monitor.flush();
  let r = replies.filter((x) => x.fn === "record_integrity_events").at(-1)?.r;
  check("a 999 ms switch is stored as short and does not ping the owner", sent.at(-1)?.error === null && r?.alerted === false && monitor.snapshot().flagged === 0, JSON.stringify(r));
  monitor.handle.blur({ type: "blur" });
  clock += 1_200;
  monitor.handle.focus({ type: "focus" });
  await monitor.flush();
  r = replies.filter((x) => x.fn === "record_integrity_events").at(-1)?.r;
  row = await session(APP_CHAT, "step_chat");
  check("a 1.2 s switch pings the owner AND is counted for the applicant (one threshold)", r?.alerted === true && monitor.snapshot().flagged === 1 && row.integrity_summary.short_away === 1, JSON.stringify({ r, summary: row.integrity_summary }));
  const cards = (await db.query(`select * from public.notifications where user_id = $1 and type = 'integrity'`, [EMPLOYER])).rows;
  check("…on the owner's one live card", cards.length === 1 && /left the window 1 time/.test(cards[0].message), cards[0]?.message);
  monitor.handle.focusin({ type: "focusin", target: { tagName: "TEXTAREA", value: "", closest: () => null } });
  monitor.handle.input({ type: "input", inputType: "insertText\u0000", data: "x".repeat(30), target: { tagName: "TEXTAREA", value: "x".repeat(30), closest: () => null } });
  await monitor.flush();
  check("an event carrying a U+0000 is stored (cleaned), not refused", sent.at(-1)?.error === null && monitor.pending === 0, JSON.stringify(sent.at(-1)));

  // -- swept "left", and coming back -------------------------------------------
  await quiet(opened.session_id, 45);
  await db.exec(`set role service_role;`);
  await db.query(`select public.mark_stale_assessment_sessions()`);
  await asOwner();
  row = await session(APP_CHAT, "step_chat");
  check("(fixture) the sweep marks the quiet attempt left", row.status === "abandoned", row.status);
  await chat.beat();
  check("a plain beat on it changes nothing; the page is told", (await session(APP_CHAT, "step_chat")).status === "abandoned" && chat.statuses.at(-1) === "abandoned", chat.statuses);
  chat.controller.noteActivity();
  for (let i = 0; i < 20; i += 1) await new Promise((res) => setImmediate(res));
  row = await session(APP_CHAT, "step_chat");
  const marker = (await db.query(`select detail from public.assessment_events where session_id = $1 and kind = 'system' order by seq desc limit 1`, [row.id])).rows[0];
  check("the applicant's next input brings the same attempt back, with a came_back marker", row.id === opened.session_id && row.status === "active" && marker?.detail?.what === "came_back" && chat.statuses.at(-1) === "active", JSON.stringify({ status: row.status, marker }));
  await chat.beat();
  row = await session(APP_CHAT, "step_chat");
  check("…and the heartbeat goes on", minutesQuiet(row) < 0.5);

  // -- a grading claim whose request died -----------------------------------------
  // End was pressed (the server claimed the attempt) and then the request was
  // killed before it completed it or marked it failed. The page waits on
  // "being checked"; the heartbeat is how it learns the claim is dead.
  await asOwner();
  await db.query(`update public.assessment_sessions set status = 'grading' where id = $1`, [opened.session_id]);
  await chat.beat();
  row = await session(APP_CHAT, "step_chat");
  check("a claim being checked: the beat reports 'grading', changes nothing, and the beats go on", chat.statuses.at(-1) === "grading" && row.status === "grading", chat.statuses);
  await db.exec(`alter table public.assessment_sessions disable trigger assessment_sessions_before_write`);
  await db.query(`update public.assessment_sessions set updated_at = now() - interval '8 minutes' where id = $1`, [opened.session_id]);
  await db.exec(`alter table public.assessment_sessions enable trigger assessment_sessions_before_write`);
  await chat.beat();
  row = await session(APP_CHAT, "step_chat");
  check(
    "untouched for 8 minutes (its request died): the next beat reads 'failed' (claim_expired), so the page sends it again, never 'being checked' for ever",
    chat.statuses.at(-1) === "failed" && row.status === "failed" && row.grading?.last_error === "claim_expired" && row.id === opened.session_id,
    JSON.stringify({ statuses: chat.statuses, status: row.status, grading: row.grading }),
  );
})();

if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
