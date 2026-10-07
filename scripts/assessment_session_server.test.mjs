#!/usr/bin/env node
/**
 * Plain-Node test of the pure parts of the server's assessment record
 * (supabase/functions/_shared/assessmentSession.ts, docs/ASSESSMENT-RECORD.md
 * §5.1), plus the message builders the chat functions grade with. Runs the
 * REAL modules (no copies), imported from their .ts paths (Node strips the
 * types). It also runs under Deno (`deno run --allow-read <this file>`), which
 * is the runtime the streams below really run on.
 *
 * Proves:
 *   - the request fields: which requests record at all (a page on the
 *     previous build sends no ids and is served as before), and that a page
 *     can never take a server id (opener, reply:, final, snap:, submit:);
 *   - the SSE collector reads a streamed reply the way the pages do, across
 *     chunk boundaries, CRLF, [DONE] and finish_reason;
 *   - teeForRecording: the browser's branch gets every byte unchanged, the
 *     recording branch gets the whole reply, and cancelling the browser's
 *     branch (a closed tab) does NOT stop the recording;
 *   - withLeadingSse / sseReplayText: a page's own parser reads the same
 *     reply and skips the leading {"assessment":…} line;
 *   - what is stored for a reply ([RESOLVED] -> resolved, the interviewer's
 *     closing -> closed, a broken stream -> incomplete, nothing -> nothing);
 *   - where a message sits in the stored conversation (history before it, a
 *     retry finds its first copy and its stored reply);
 *   - grading reads the stored turns whenever they hold the applicant's own
 *     messages, else the request's; a live record is never extended with
 *     turns the server did not see;
 *   - integrity: recorded events become the old notes violations (blips and
 *     after-the-end events left out), else the request's own list;
 *   - the session plan per purpose, the error-code reasons, end reasons;
 *   - the typing run bookkeeping, word errors, snapshot shape, graded text;
 *   - buildSimulationApiMessages builds the SAME model input from stored
 *     turns as the old inline code did from the request;
 *   - the server's own move to the next step (stepMoveOn.ts): when it is
 *     scheduled (a user JWT, both ids, an auto-mode job), when it looks and
 *     whether it asks trigger-ava-analysis (only when nobody else has), how
 *     it reads the answer, and that each of the four grading functions
 *     schedules it right after the result is recorded, without waiting.
 *
 * Run with: node scripts/assessment_session_server.test.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "../supabase/functions/_shared/assessmentSession.ts";
import * as M from "../supabase/functions/_shared/stepMoveOn.ts";
import { AiUnavailableError } from "../supabase/functions/_shared/openai.ts";
import { buildCandidateJourney } from "../supabase/functions/_shared/candidateJourney.ts";
import { planAutoAdvance } from "../supabase/functions/_shared/trustedResults.ts";
import { buildSimulationApiMessages, buildChatSimulationResult } from "../supabase/functions/ai-chat-simulation/grading.ts";
import { candidateAnswerCount } from "../supabase/functions/ai-chat-interview/resultShape.ts";
import { calculateTypingResults } from "../supabase/functions/submit-typing-test/calculateResults.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

const APP = "40000000-0000-4000-8000-000000000001";
const enc = new TextEncoder();

function streamOf(chunks, { delayMs = 0 } = {}) {
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]));
      else controller.close();
    },
  });
}

async function readAll(stream) {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out + dec.decode();
}

/** ChatInterviewPhase.tsx / ChatSimulationPhase.tsx's own SSE reading loop, reproduced. */
function pageParse(text) {
  let content = "";
  let buffer = text;
  let newlineIndex;
  while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
    let line = buffer.slice(0, newlineIndex);
    buffer = buffer.slice(newlineIndex + 1);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line.startsWith(":") || line.trim() === "") continue;
    if (!line.startsWith("data: ")) continue;
    const jsonStr = line.slice(6).trim();
    if (jsonStr === "[DONE]") break;
    try {
      const parsed = JSON.parse(jsonStr);
      const c = parsed.choices?.[0]?.delta?.content;
      if (c) content += c;
    } catch {
      break;
    }
  }
  return content;
}

function delta(text) {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })}\n\n`;
}
const FINISH = `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`;
const DONE = "data: [DONE]\n\n";

function turn(seq, kind, content, id, detail = {}) {
  return { seq, kind, content, client_msg_id: id, created_at: `2026-10-06T15:0${Math.min(seq, 9)}:00.000Z`, detail };
}

// ============================================================================
console.log("Request fields:\n");

check("applicationId + stepId: a recording target", same(A.recordingTargetFrom({ applicationId: APP, stepId: "step_chat" }), { applicationId: APP, stepId: "step_chat" }));
check("no ids (a page on the previous build): no target", A.recordingTargetFrom({ mode: "respond", agentMessage: "hi" }) === null);
check("a non-uuid application id: no target", A.recordingTargetFrom({ applicationId: "abc", stepId: "s" }) === null);
check("a blank step id: no target", A.recordingTargetFrom({ applicationId: APP, stepId: "  " }) === null);
check("a 201-character step id: no target", A.recordingTargetFrom({ applicationId: APP, stepId: "x".repeat(201) }) === null);

check("a page id is kept (trimmed)", A.cleanClientMsgId("  m-123  ") === "m-123");
for (const reserved of ["opener", "final", "reply:m1", "snap:1:end", "submit:0", "srv:abc", "OPENER", "Reply:x"]) {
  check(`a page can never use the server id "${reserved}"`, A.cleanClientMsgId(reserved) === null);
}
check("a 121-character page id is refused (reply:<id> must fit 128)", A.cleanClientMsgId("m".repeat(121)) === null);
check("a 120-character page id is kept", A.cleanClientMsgId("m".repeat(120)) === "m".repeat(120));
check("reply id fits the column for the longest page id", A.replyMsgId("m".repeat(120)).length <= 128);
check("server ids are srv:<uuid>", /^srv:[0-9a-f-]{36}$/.test(A.serverMsgId()));
check("clientAt: an ISO time is normalised", A.cleanClientAt("2026-10-06T15:49:58.120Z") === "2026-10-06T15:49:58.120Z");
check("clientAt: junk is dropped", A.cleanClientAt("yesterday-ish") === null && A.cleanClientAt({}) === null);
check("content: NUL becomes U+FFFD (Postgres refuses NUL)", A.clampContent("a\u0000b") === "a\uFFFDb");
check("content: cut to 100,000 characters", A.clampContent("x".repeat(100_005)).length === 100_000);

// ============================================================================
console.log("\nThe SSE collector:\n");
{
  const c = A.createSseTextCollector();
  const whole = delta("Hi, ") + delta("my deposit") + delta(" is missing.") + FINISH + DONE;
  // Feed it in awkward pieces, splitting lines and multi-byte boundaries alike.
  for (let i = 0; i < whole.length; i += 7) c.push(whole.slice(i, i + 7));
  const r = c.finish();
  check("text across chunk boundaries", r.text === "Hi, my deposit is missing.", JSON.stringify(r));
  check("done after [DONE]", r.done === true);
  check("finish_reason read", r.finishReason === "stop");
}
{
  const c = A.createSseTextCollector();
  c.push(delta("one").replace(/\n/g, "\r\n") + ": keep-alive comment\n" + "data: {not json}\n" + "event: x\n" + delta("two"));
  const r = c.finish();
  check("CRLF lines, comments, junk and other fields are skipped", r.text === "onetwo", r.text);
  check("no [DONE] and no finish_reason: not done", r.done === false);
}
{
  const c = A.createSseTextCollector();
  c.push('data:{"choices":[{"delta":{"content":"tight"}}]}');
  check("a last line with no newline is still read at finish", c.finish().text === "tight");
}

// ============================================================================
console.log("\nteeForRecording (the browser streams live, the reply is kept):\n");
{
  const chunks = [delta("Hello"), delta(" there"), FINISH, DONE];
  let recorded = null;
  const { clientBody, recording } = A.teeForRecording(streamOf(chunks), (result) => {
    recorded = result;
  });
  const clientText = await readAll(clientBody);
  await recording;
  check("the browser's branch gets every byte unchanged", clientText === chunks.join(""));
  check("the recording branch collected the reply", recorded?.text === "Hello there" && recorded.done === true);
  check("no error on a clean stream", recorded?.error === null);
}
{
  // A closed tab: the browser's branch is cancelled after the first chunk.
  const chunks = [delta("First "), delta("second "), delta("third."), FINISH, DONE];
  let recorded = null;
  const { clientBody, recording } = A.teeForRecording(streamOf(chunks, { delayMs: 5 }), (result) => {
    recorded = result;
  });
  const reader = clientBody.getReader();
  await reader.read();
  await reader.cancel("tab closed");
  await recording;
  check("cancelling the browser's branch does not stop the recording", recorded?.text === "First second third.", JSON.stringify(recorded));
  check("…and the recording still sees the end of the stream", recorded?.done === true);
}
{
  // The source breaks mid-reply.
  let n = 0;
  const broken = new ReadableStream({
    pull(controller) {
      n += 1;
      if (n === 1) controller.enqueue(enc.encode(delta("Partial")));
      else controller.error(new Error("socket hang up"));
    },
  });
  let recorded = null;
  const { clientBody, recording } = A.teeForRecording(broken, (result) => {
    recorded = result;
  });
  await readAll(clientBody).catch(() => {});
  await recording;
  check("a broken stream still reports what arrived, with the error", recorded?.text === "Partial" && recorded.error instanceof Error && recorded.done === false);
}

// ============================================================================
console.log("\nWhat the page reads:\n");
{
  const replay = A.sseReplayText("Stored reply [RESOLVED]");
  check("a replayed reply reads back as the same text in the page's parser", pageParse(replay) === "Stored reply [RESOLVED]");
  const meta = await readAll(A.withLeadingSse(replay, { assessment: { recorded: true, session_id: "s1" } }));
  check("the leading {assessment} line is skipped by the page's parser", pageParse(meta) === "Stored reply [RESOLVED]");
  check("…and is the first line, for a page that reads it", meta.startsWith('data: {"assessment":{"recorded":true,"session_id":"s1"}}\n\n'));
  const live = await readAll(A.withLeadingSse(streamOf([delta("Live "), delta("reply"), DONE]), { assessment: { recorded: false, reason: "not_signed_in" } }));
  check("a live stream with a leading line reads the same reply", pageParse(live) === "Live reply");
}
{
  // Cancelling a leading-line stream cancels the underlying branch.
  let cancelled = null;
  const src = new ReadableStream({
    pull(controller) {
      controller.enqueue(enc.encode(delta("x")));
    },
    cancel(reason) {
      cancelled = reason;
    },
  });
  const reader = A.withLeadingSse(src, { assessment: {} }).getReader();
  await reader.read();
  await reader.read();
  await reader.cancel("gone");
  check("cancelling the browser's stream reaches the branch under it", cancelled === "gone");
}

// ============================================================================
console.log("\nWhat is stored for a reply:\n");
{
  const customer = A.assistantTurnFromStream({ text: "Thanks so much! [RESOLVED]", done: true, finishReason: "stop" }, { style: "customer", model: "m" });
  check("[RESOLVED] is removed and becomes resolved: true", customer?.content === "Thanks so much!" && customer.detail.resolved === true && customer.detail.role === "customer" && customer.detail.model === "m");
  check("replaying a resolved turn puts the marker back for the page", A.replayTextFor({ content: "Thanks so much!", detail: { resolved: true } }) === "Thanks so much! [RESOLVED]");
  const closing = A.assistantTurnFromStream({ text: "Thank you for your time today. Best of luck!", done: true, finishReason: "stop" }, { style: "interviewer", model: "m" });
  check("the interviewer's closing message is closed: true", closing?.detail.closed === true && closing.detail.role === "interviewer");
  const question = A.assistantTurnFromStream({ text: "Good luck aside, what did you learn?", done: true, finishReason: "stop" }, { style: "interviewer", model: "m" });
  check("a closing phrase inside a question is not a close", question?.detail.closed === undefined);
  const partial = A.assistantTurnFromStream({ text: "Half a sent", done: false, finishReason: null }, { style: "customer", model: "m" });
  check("a stream that broke off is kept, marked incomplete", partial?.detail.incomplete === true);
  check("no text: nothing to store", A.assistantTurnFromStream({ text: "   ", done: true, finishReason: "stop" }, { style: "customer", model: "m" }) === null);
}
{
  // The page's own close test must stay the same as the server's, or the
  // record and the page disagree about who ended the interview.
  const page = readFileSync(path.join(ROOT, "src/pages/ChatInterviewPhase.tsx"), "utf8");
  const m = page.match(/const closingPhrases = \[([\s\S]*?)\];/);
  if (!m) {
    console.log("  note - ChatInterviewPhase.tsx no longer lists closingPhrases; nothing to compare");
  } else {
    const phrases = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    check("the server's closing phrases match ChatInterviewPhase.tsx's", phrases.length > 0 && phrases.every((p) => A.isInterviewClosingMessage(`Well, ${p}.`)), phrases.join(" | "));
  }
}

// ============================================================================
console.log("\nWhere a message sits in the stored conversation:\n");
{
  const turns = [
    turn(2, "assistant_turn", "My deposit is missing.", "opener"),
    turn(3, "candidate_turn", "Sorry to hear that.", "m1"),
    turn(4, "assistant_turn", "Can you fix it?", "reply:m1"),
  ];
  const fresh = A.planCandidateTurn(turns, "m2", 5, "Yes, I can.");
  check("a new message: history is every stored turn before it", same(fresh?.history.map((t) => t.seq), [2, 3, 4]) && fresh.existingReply === null && fresh.content === "Yes, I can.");
  const withItself = [...turns, turn(5, "candidate_turn", "Yes, I can.", "m2")];
  const raced = A.planCandidateTurn(withItself, "m2", 5, "Yes, I can.");
  check("history read just after the insert still leaves the message itself out", same(raced?.history.map((t) => t.seq), [2, 3, 4]));
  const retry = A.planCandidateTurn(turns, "m1", null, "Sorry to hear that!!");
  check("a retry: history before the first copy, and its stored reply", same(retry?.history.map((t) => t.seq), [2]) && retry.existingReply?.seq === 4);
  check("a retry keeps the stored text, not the resent one", retry?.content === "Sorry to hear that.");
  check("a repeat the read did not see: no plan (the caller reads again)", A.planCandidateTurn(turns, "m9", null, "x") === null);
  check("a new message is not a repeat", fresh?.repeat === false);
  check("a retry is a repeat, with the time its first copy was stored", retry?.repeat === true && retry.storedAt === turns[1].created_at);
}

// ============================================================================
console.log("\nA message sent again while its reply is still on its way:\n");
{
  const W = A.planReplyWait;
  const at = (s) => new Date(Date.parse("2026-10-06T15:00:00.000Z") + s * 1000).toISOString();
  const t0 = Date.parse(at(0));
  const firstAsk = { seq: 5, created_at: at(0) };
  check("its reply is stored: play it back", W({ replyStored: true, firstAsk, markers: [], nowMs: t0 + 1000 }).action === "replay");
  const reload = W({ replyStored: false, firstAsk, markers: [], nowMs: t0 + 1500 });
  check("sent 1.5 s ago and nothing back yet: WAIT for that reply, never ask a second time (the reload case)",
    reload.action === "wait" && reload.untilMs === t0 + A.REPLY_WINDOW_MS, JSON.stringify(reload));
  check("asked longer ago than the window: ask again (the first request died)", W({ replyStored: false, firstAsk, markers: [], nowMs: t0 + A.REPLY_WINDOW_MS }).action === "ask");
  check("a failure recorded after the ask: ask again at once",
    W({ replyStored: false, firstAsk, markers: [{ seq: 6, what: "failed", created_at: at(2) }], nowMs: t0 + 3000 }).action === "ask");
  const reasked = W({
    replyStored: false,
    firstAsk,
    markers: [{ seq: 6, what: "failed", created_at: at(2) }, { seq: 7, what: "asked", created_at: at(3) }],
    nowMs: t0 + 4000,
  });
  check("a failure, then a fresh ask: wait for the fresh one (a retry arriving during it never asks a third time)",
    reasked.action === "wait" && reasked.untilMs === Date.parse(at(3)) + A.REPLY_WINDOW_MS, JSON.stringify(reasked));
  check("only a failure AFTER the latest ask counts",
    W({ replyStored: false, firstAsk: { seq: 9, created_at: at(10) }, markers: [{ seq: 6, what: "failed", created_at: at(2) }], nowMs: Date.parse(at(11)) }).action === "wait");
  check("nothing on record about an ask: ask", W({ replyStored: false, firstAsk: null, markers: [], nowMs: t0 }).action === "ask");
  check("an ask with no time: ask", W({ replyStored: false, firstAsk: { seq: 5, created_at: null }, markers: [], nowMs: t0 }).action === "ask");
  check("a shorter window is honoured", W({ replyStored: false, firstAsk, markers: [], nowMs: t0 + 400, windowMs: 300 }).action === "ask");

  check("reply ids: the opener's, and reply:<id>", A.replyIdFor(A.OPENER_ID) === "opener" && A.replyIdFor("m1") === "reply:m1");
  check("…and back", A.forIdOfReply("reply:m1") === "m1" && A.forIdOfReply("opener") === "opener" && A.forIdOfReply(A.replyIdFor("reply-ish")) === "reply-ish");
  check("a page can never take the opener's ask id", A.cleanClientMsgId(A.OPENER_ASK_ID) === null);

  const P = A.isPermanentWriteError;
  check("a full session, a gone session, a malformed or refused row: never retried",
    ["HF005", "23503", "22023", "22P02", "23514", "42501", "42P01", "PGRST204", "PGRST205"].every((code) => P({ code })));
  check("a schema-cache reload, a timeout, a network error: worth another try",
    !P({ code: "PGRST102" }) && !P({ code: "57014" }) && !P({ code: "40001" }) && !P({ message: "fetch failed" }) && !P(null));
}

// ============================================================================
console.log("\nOne request grades an attempt:\n");
{
  const C = A.planClaim;
  const now = Date.parse("2026-10-06T16:00:00.000Z");
  const ago = (ms) => new Date(now - ms).toISOString();
  check("an open attempt (active, left, owed) is claimed", C("active", ago(0), now) === "claim" && C("abandoned", null, now) === "claim" && C("failed", ago(10), now) === "claim");
  check("one being graded right now is waited on, never graded twice", C("grading", ago(30_000), now) === "wait" && C("grading", ago(A.STALE_GRADING_MS - 1), now) === "wait");
  check("a grading claim older than any edge function can live is taken over", C("grading", ago(A.STALE_GRADING_MS), now) === "take_over");
  check("…but not when its age is unknown", C("grading", null, now) === "wait");
  check("finished or replaced: wait (the caller answers with what is on file)", C("completed", ago(0), now) === "wait" && C("superseded", ago(0), now) === "wait");
  check("the stale limit outlives an edge function (400 s)", A.STALE_GRADING_MS > 400_000);

  const finishedGate = await A.gateGrading(null, null, "step_finished");
  check("no attempt and the step is finished: answer with the result on file, grade nothing", !finishedGate.go && finishedGate.why === "on_file");
  const legacyGate = await A.gateGrading(null, null, "not_deployed");
  check("no attempt for any other reason (migration not applied, a page on the previous build): grade as before",
    legacyGate.go && legacyGate.claim === "none" && legacyGate.fromStatus === null);
}

// ============================================================================
console.log("\nThe test functions use the one gate:\n");
{
  const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
  const fns = {
    "ai-chat-simulation": { file: "supabase/functions/ai-chat-simulation/index.ts", grade: "callOpenAIJson(" },
    "ai-chat-interview": { file: "supabase/functions/ai-chat-interview/index.ts", grade: "callOpenAIJson(" },
    "submit-typing-test": { file: "supabase/functions/submit-typing-test/index.ts", grade: "calculateTypingResults(typedText" },
    "submit-sales-simulation": { file: "supabase/functions/submit-sales-simulation/index.ts", grade: "gradeTranscript({" },
  };
  for (const [name, { file, grade }] of Object.entries(fns)) {
    const src = read(file);
    const gate = src.indexOf("gateGrading(");
    const grading = src.indexOf(grade, src.indexOf("const gate"));
    const record = src.indexOf("recordStepResult(admin") >= 0 ? src.indexOf("recordStepResult(admin") : src.indexOf("recordStepResult(toMinimalAdmin");
    check(`${name}: the gate runs before anything is graded or recorded`, gate > 0 && grading > gate && record > gate, `${gate} ${grading} ${record}`);
    check(`${name}: a result on file is answered from the record, never graded again`, src.includes("readStepOnFile(") && src.includes("alreadyRecorded: true"));
    check(`${name}: only the gate's own completion is used`, src.includes("finishGrading(") && !src.includes("completeSession(") && !src.includes("claimGrading("));
  }
  const interview = read(fns["ai-chat-interview"].file);
  const submitResponse = interview.slice(interview.indexOf("next: outcome.next") - 400, interview.indexOf("next: outcome.next") + 200);
  check("the interview's submit answer no longer carries the employer-facing evaluation", !/\bevaluation,/.test(submitResponse) && !/evaluation:/.test(submitResponse), submitResponse);
  const sales = read(fns["submit-sales-simulation"].file);
  const salesResponse = sales.slice(sales.indexOf("success: true,\n      next: outcome.next") - 50, sales.indexOf("success: true,\n      next: outcome.next") + 200);
  check("…nor does the sales answer", salesResponse.includes("next: outcome.next") && !/\bevaluation\b/.test(salesResponse), salesResponse);
  // The interview's old "evaluate" mode ran the employer-facing grader on any
  // posted transcript, signed in or not: gone, refused before any model call.
  const unknownMode = interview.indexOf('code: "unknown_mode"');
  check(
    "ai-chat-interview: no unauthenticated 'evaluate' mode; an unknown mode is refused before anything is spent",
    !/mode === ["']evaluate["']/.test(interview) && unknownMode > 0
      && /if \(mode !== "start" && mode !== "respond" && mode !== "submit"\) \{/.test(interview)
      && unknownMode < interview.indexOf("callOpenAIJson(") && unknownMode < interview.indexOf("streamOpenAIChatCompletion("),
  );
  const chatSim = read(fns["ai-chat-simulation"].file);
  check(
    "ai-chat-simulation: an already-recorded answer never echoes the phase_ai_analysis column (the hiring team's analysis)",
    !chatSim.includes("onFile.phaseAiAnalysis") && chatSim.includes("phaseAiAnalysis: phaseAiAnalysisFromStoredResult(onFile.result)"),
  );
  const typingFn = read(fns["submit-typing-test"].file);
  const startAt = typingFn.indexOf('if (payload.action === "start") {');
  const upsertAt = typingFn.indexOf('.from("typing_test_starts")\n        .upsert(', startAt);
  const finishedAt = typingFn.indexOf('code: "step_finished" }, 409)', startAt);
  const checkingAt = typingFn.indexOf('code: "already_checking" }, 409)', startAt);
  check(
    "submit-typing-test: 'start' refuses a finished step (409 step_finished) and an attempt being checked (409 already_checking) before the start row is reset",
    startAt > 0 && upsertAt > startAt && finishedAt > startAt && finishedAt < upsertAt && checkingAt > startAt && checkingAt < upsertAt
      && /planClaim\(session\.status, session\.updated_at, Date\.now\(\)\) === "wait"/.test(typingFn.slice(startAt, upsertAt)),
    `${startAt} ${finishedAt} ${checkingAt} ${upsertAt}`,
  );
  // Since 2026-10-07 the catch around the model call hands the failure to
  // afterReplyAskFailed (assessmentSession.ts), and that writes the marker.
  // Both halves are proved: the hand-over in each function's source, and
  // what afterReplyAskFailed records, run for real against a stand-in client
  // that keeps every inserted event (a real database: the pglite test).
  const recordedAfter = async (input) => {
    const events = [];
    const query = (rows) => {
      const q = { then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject), maybeSingle: () => Promise.resolve({ data: null, error: null }) };
      for (const method of ["select", "eq", "in", "lt", "order", "limit"]) q[method] = () => q;
      return q;
    };
    const admin = {
      from: () => ({
        select: () => query([]),
        insert: (row) => {
          events.push(row);
          return query([{ seq: events.length }]);
        },
        update: () => query([]),
      }),
      rpc: () => Promise.resolve({ data: null, error: null }),
    };
    const answer = await A.afterReplyAskFailed(admin, "session-1", input);
    return { answer, events, failed: events.filter((e) => e.kind === "system" && e.detail.what === "reply_failed") };
  };
  const broken = new Error("OpenAI stream error 400: bad request");
  const refusal = new AiUnavailableError("credit_exhausted", "OpenAI stream error 429: insufficient_quota", 429);
  const storedBroken = await recordedAfter({ held: null, replyId: A.replyMsgId("m1"), error: broken });
  const openerBroken = await recordedAfter({ held: null, replyId: A.OPENER_ID, error: broken });
  const heldBroken = await recordedAfter({ held: A.holdCandidateTurn({ content: "Let me check.", clientMsgId: "m2", clientAt: null, role: "agent" }), replyId: A.replyMsgId("m2"), error: broken });
  const storedRefused = await recordedAfter({ held: null, replyId: A.replyMsgId("m3"), error: refusal });
  const heldRefused = await recordedAfter({ held: A.holdCandidateTurn({ content: "Is it there now?", clientMsgId: "m4", clientAt: null, role: "agent" }), replyId: A.replyMsgId("m4"), error: refusal });
  const marksFailed =
    storedBroken.answer === "failed" && storedBroken.failed.length === 1 && storedBroken.failed[0].detail.reply_for === "m1" && storedBroken.failed[0].detail.reason === broken.message
    && openerBroken.answer === "failed" && openerBroken.failed.length === 1 && openerBroken.failed[0].detail.reply_for === "opener"
    // A held message is stored first (the page shows it as sent), then marked.
    && heldBroken.answer === "failed" && heldBroken.events.length === 2 && heldBroken.events[0].kind === "candidate_turn" && heldBroken.events[0].client_msg_id === "m2"
    && heldBroken.events[1].detail.what === "reply_failed" && heldBroken.events[1].detail.reply_for === "m2"
    // The service refusing: a stored message is still marked failed (the next ask goes at once)…
    && storedRefused.answer === "ai_unavailable" && storedRefused.failed.length === 1 && storedRefused.failed[0].detail.reply_for === "m3"
    && String(storedRefused.failed[0].detail.reason).startsWith("ai_unavailable (credit_exhausted)")
    // …and a NEW message is not stored at all: its own marker, no reply_failed.
    && heldRefused.answer === "ai_unavailable" && heldRefused.events.length === 1 && heldRefused.events[0].kind === "system"
    && heldRefused.events[0].detail.what === "ai_unavailable" && heldRefused.events[0].detail.message_id === "m4";
  check(
    "afterReplyAskFailed records a failed model call (reply_failed for the opener, a stored message and any ordinary failure; an unstored message and its own marker when the service refuses a new one)",
    marksFailed,
    JSON.stringify([storedBroken, openerBroken, heldBroken, storedRefused, heldRefused].map((r) => [r.answer, r.events.map((e) => `${e.kind}:${e.detail?.what ?? e.client_msg_id}`)])),
  );
  for (const name of ["ai-chat-simulation", "ai-chat-interview"]) {
    const src = read(fns[name].file);
    check(`${name}: an answer that could not be stored is sent again (503 turn_not_saved)`, /turn\.reason === "turn_not_saved"[\s\S]{0,400}503/.test(src));
    check(`${name}: a message sent again waits for its reply in flight`, src.includes("awaitInFlightReply(admin, session.id, clientMsgId)") && src.includes("awaitInFlightReply(admin, session.id, OPENER_ID)"));
    // The catch of the try that asks the model for the reply: its first act,
    // whenever the turn is recorded, is the hand-over (nothing answers or
    // rethrows before it), and what is not answered as a refusal is rethrown.
    const askAt = src.indexOf("response = await streamOpenAIChatCompletion(");
    const catchAt = src.indexOf("} catch (error) {", askAt);
    const failedAsk = askAt > 0 && catchAt > askAt ? src.slice(catchAt, src.indexOf("\n    }\n", catchAt)) : "";
    check(
      `${name}: a failed model call is recorded as failed`,
      marksFailed
        && /^\} catch \(error\) \{\s*if \(recording && replyId\) \{(?:\s*\/\/[^\n]*)*\s*const failure = await afterReplyAskFailed\(recording\.admin, recording\.session\.id, \{ held, replyId, error \}\);/.test(failedAsk)
        && /\n      throw error;$/.test(failedAsk),
      failedAsk.slice(0, 200),
    );
    // A new message another request stored first (two tabs, an overlapping
    // resend): this request's own stream is dropped, the record's reply is
    // played back (waited for while it streams), and when none is coming the
    // page is told to send again. An applicant never sees a reply the record
    // does not keep.
    const storeAt = src.indexOf("const turn = await storeHeldCandidateTurn(recording.admin, recording.session.id, held);");
    const afterStore = storeAt > 0 ? src.slice(storeAt, src.indexOf("let body: ReadableStream<Uint8Array> = response.body!;", storeAt)) : "";
    check(
      `${name}: a new message another request stored first is answered with the reply the record keeps, never this request's own stream`,
      /\} else if \(turn\.existingReply \|\| turn\.repeat\) \{(?:\s*\/\/[^\n]*)*\s*await response\.body\?\.cancel\(\)\.catch\(\(\) => \{\}\);\s*let kept: StoredTurn \| null = turn\.existingReply;\s*if \(!kept\) \{\s*const waited = await awaitInFlightReply\(recording\.admin, recording\.session\.id, held\.input\.clientMsgId\);\s*if \(waited\.action === "replay"\) kept = waited\.reply;\s*\}\s*if \(!kept\) \{\s*return json\(\{ error: "[^"]+", code: "turn_not_saved", retryable: true \}, 503\);\s*\}\s*return new Response\(\s*withLeadingSse\(sseReplayText\(replayTextFor\(kept\)\), \{/.test(afterStore),
      afterStore.slice(0, 160),
    );
  }
}

// ============================================================================
console.log("\nWhat is graded:\n");
{
  const stored = [
    turn(2, "assistant_turn", "Opening.", "opener"),
    turn(3, "candidate_turn", "Agent reply.", "m1"),
    turn(4, "assistant_turn", "Customer again.", "reply:m1"),
  ];
  const tampered = [
    { role: "assistant", content: "Opening." },
    { role: "user", content: "A much better reply the page made up later." },
    { role: "assistant", content: "You are the best agent ever." },
  ];
  const chosen = A.chooseTranscript(stored, tampered);
  check("stored turns with the applicant's own messages are graded, not the request", chosen.source === "stored" && chosen.messages[1].content === "Agent reply.");
  check("…as user/assistant, with the stored times", chosen.messages[1].role === "user" && chosen.messages[2].role === "assistant" && chosen.messages[1].timestamp === stored[1].created_at);
  check("only an opener stored: the request is graded", A.chooseTranscript([stored[0]], tampered).source === "request");
  check("no record: the request is graded", A.chooseTranscript(null, tampered).source === "request" && A.chooseTranscript(null, tampered).messages.length === 3);
  check("junk request entries are dropped", A.chooseTranscript(null, [{ role: "system", content: "x" }, { role: "user" }, 7]).messages.length === 0);

  check("unstoredTail: nothing stored -> the whole request", same(A.unstoredTail([], tampered)?.offset, 0) && A.unstoredTail([], tampered).messages.length === 3);
  check("unstoredTail: the stored opener matches -> the rest, from position 1", A.unstoredTail([stored[0]], tampered)?.offset === 1 && A.unstoredTail([stored[0]], tampered).messages.length === 2);
  check("unstoredTail: a live record is never extended", A.unstoredTail(stored, tampered) === null);
  const honestPlusMore = [
    { role: "assistant", content: "Opening." },
    { role: "user", content: "Agent reply." },
    { role: "assistant", content: "Customer again." },
    { role: "user", content: "A turn the server never saw arrive." },
  ];
  check("unstoredTail: not even when the request repeats it exactly and adds turns", A.unstoredTail(stored, honestPlusMore) === null);
  check("unstoredTail: a stored opener that differs -> nothing stored", A.unstoredTail([turn(2, "assistant_turn", "Different.", "opener")], tampered) === null);
}
{
  // The model's input from stored turns is the SAME as the old inline code
  // built from the request (the role flip included).
  const system = "SYSTEM";
  const conversation = [
    { role: "assistant", content: "Opening." },
    { role: "user", content: "Agent reply." },
  ];
  const oldInline = [
    { role: "system", content: system },
    ...conversation.map((m) => ({ role: m.role === "user" ? "assistant" : "user", content: m.content })),
    { role: "user", content: "NOW" },
  ];
  check("buildSimulationApiMessages == the old inline assembly", same(buildSimulationApiMessages(system, conversation, "NOW"), oldInline));
  const fromStored = A.chooseTranscript(
    [turn(2, "assistant_turn", "Opening.", "opener"), turn(3, "candidate_turn", "Agent reply.", "m1")],
    [],
  ).messages.map(({ role, content }) => ({ role, content }));
  check("…and stored turns give the model exactly that input", same(buildSimulationApiMessages(system, fromStored, "NOW"), oldInline));
}
check("candidateAnswerCount counts the applicant's non-empty messages", candidateAnswerCount([{ role: "assistant", content: "Q?" }, { role: "user", content: "  " }, { role: "user", content: "A" }]) === 1);

// ============================================================================
console.log("\nIntegrity:\n");
{
  const rows = [
    { seq: 5, detail: { kind: "tab_hidden" }, duration_ms: 67000, client_at: "2026-10-06T15:49:58.000Z", created_at: "2026-10-06T15:51:05.000Z" },
    { seq: 6, detail: { kind: "window_blur" }, duration_ms: 400, client_at: null, created_at: "2026-10-06T15:51:06.000Z" },
    { seq: 7, detail: { kind: "paste", target: "reply" }, duration_ms: null, client_at: null, created_at: "2026-10-06T15:51:07.000Z" },
    { seq: 8, detail: { kind: "bulk_insert", via: "drop" }, duration_ms: null, client_at: null, created_at: "t8" },
    { seq: 9, detail: { kind: "screenshot_suspected" }, duration_ms: null, client_at: null, created_at: "t9" },
    { seq: 10, detail: { kind: "other", what: "shortcut", key: "p" }, duration_ms: null, client_at: null, created_at: "t10" },
    { seq: 11, detail: { kind: "page_closed", after_end: true }, duration_ms: null, client_at: null, created_at: "t11" },
  ];
  const v = A.integrityEventsToViolations(rows);
  check("events become the old violation types (blip and after-end left out)", same(v.map((x) => x.type), ["tab_switch", "paste_attempt", "paste_attempt", "screenshot_attempt", "other"]), v.map((x) => x.type).join());
  check("an away episode says how long, at the time they left", v[0].details === "Left the test page for 1m 7s" && v[0].timestamp === "2026-10-06T15:49:58.000Z");
  check("no client time: the server's", v[1].timestamp === "2026-10-06T15:51:07.000Z");
  check("dropped-in text says so", v[2].details === "Text was dropped in");
  check("an other event names what it was", v[4].details === "shortcut p");
  const summary = buildChatSimulationResult({ scenario: "s", messageCount: 3, evaluation: { score: 1, empathy: 1, problemSolving: 1, strengths: [], improvements: [] }, violations: v }).antiCheatSummary;
  check("the chat notes summary counts them in its existing shape", same(summary, { hasViolations: true, violationCount: 5, tabSwitches: 1, copyPasteAttempts: 2 }), JSON.stringify(summary));
  const fromEvents = A.chooseIntegrity(rows, [{ type: "tab_switch", timestamp: "x", details: "page-made" }]);
  check("recorded events win over the request's list", fromEvents.source === "events" && fromEvents.violations.length === 5);
  const fromRequest = A.chooseIntegrity([], [{ type: "tab_switch", timestamp: "x", details: "d", extra: 1 }, "junk", null]);
  check("no recorded events: the request's list, objects exactly as sent", fromRequest.source === "request" && same(fromRequest.violations, [{ type: "tab_switch", timestamp: "x", details: "d", extra: 1 }]));
  check("no record at all: the request's list", A.chooseIntegrity(null, []).source === "request");
}
for (const [ms, text] of [[null, "under 1s"], [999, "under 1s"], [1000, "1s"], [45_000, "45s"], [60_000, "1m"], [72_000, "1m 12s"], [3_600_000, "1h"], [3_900_000, "1h 5m"]]) {
  check(`durationText(${ms}) = "${text}" (as assessment_duration_text)`, A.durationText(ms) === text, A.durationText(ms));
}

// ============================================================================
console.log("\nSessions, reasons and endings:\n");
{
  const P = A.planSessionUse;
  check("turns: an active attempt is used", P("active", "turns") === "use");
  check("turns: one being graded takes no new turns", P("grading", "turns") === "busy" && P("failed", "turns") === "busy");
  check("turns: none, left, finished -> open", P(null, "turns") === "open" && P("abandoned", "turns") === "open" && P("completed", "turns") === "open" && P("superseded", "turns") === "open");
  check("submit: active, grading (a retry) and failed (owed) are finished in place", P("active", "submit") === "use" && P("grading", "submit") === "use" && P("failed", "submit") === "use");
  check("submit: left -> open (revived)", P("abandoned", "submit") === "open");
  // resolveSession with a client that answers "finished": it must stop before opening anything.
  const calls = [];
  const fakeFinished = {
    from: () => ({ select: () => ({ eq() { return this; }, order() { return this; }, limit() { return this; }, then: (r) => r({ data: [], error: null }) }) }),
    rpc: async (fn) => {
      calls.push(fn);
      return fn === "assessment_step_access"
        ? { data: { step_type: "chat_simulation", finished: true, reopened: false }, error: null }
        : { data: { session_id: "new-one", finished: false }, error: null };
    },
  };
  const finished = await A.resolveSession(fakeFinished, { applicationId: APP, stepId: "step_chat", userId: APP, stepType: "chat_simulation", purpose: "submit" });
  check("a finished step: refused before anything is opened", !finished.ok && finished.reason === "step_finished" && !calls.includes("open_assessment_session"), calls.join());
  const R = A.reasonFromError;
  check("error codes map to the contract's reasons", R({ code: "PGRST202" }) === "not_deployed" && R({ code: "42P01" }) === "not_deployed" && R({ code: "42501" }) === "not_your_application" &&
    R({ code: "HF001" }) === "application_closed" && R({ code: "HF002" }) === "unknown_step" && R({ code: "HF003" }) === "step_not_reached" &&
    R({ code: "HF004" }) === "step_finished" && R({ code: "XX000" }) === "error" && R(null) === "error");
}
{
  const close = { role: "assistant", content: "Thank you for your time today. Take care!" };
  const ask = { role: "assistant", content: "What drew you to support work?" };
  check("auto_end -> ai_closed", A.interviewEndReason("auto_end", [ask]) === "ai_closed");
  check("End after the interviewer closed -> submitted", A.interviewEndReason("manual", [ask, { role: "user", content: "a" }, close]) === "submitted");
  check("End before that -> ended_early", A.interviewEndReason("manual", [ask, { role: "user", content: "a" }]) === "ended_early");
  check("questions counted as the page counts them", A.interviewQuestionCount([ask, close, { role: "user", content: "?" }]) === 1);
  check("chat practice: the customer's [RESOLVED] -> customer_resolved", A.chatSimulationEndReason([turn(3, "assistant_turn", "Thanks", "reply:m1", { resolved: true })]) === "customer_resolved");
  check("chat practice otherwise -> submitted", A.chatSimulationEndReason([turn(3, "assistant_turn", "Hmm", "reply:m1")]) === "submitted" && A.chatSimulationEndReason(null) === "submitted");
}
{
  const g = A.gradingRecord({ model: "m", promptVersion: "v1", fallback: false, result: { score: 9 }, extra: { transcript_source: "stored" } });
  check("grading record: the contract's keys plus extras", g.model === "m" && g.prompt_version === "v1" && g.fallback === false && g.result.score === 9 && g.transcript_source === "stored" && !Number.isNaN(Date.parse(g.graded_at)));
}
{
  const session = { id: "s1", status: "active", attempt: 2, step_type: "chat_simulation", context: {}, progress: {}, started_at: null, integrity_summary: {} };
  const r = A.resumePayload(session, [turn(2, "assistant_turn", "Hi", "opener", { resolved: true }), turn(3, "candidate_turn", "Hello", "m1")], { scenario: { scenario: "s" } });
  check("resume payload: turns as user/assistant with ids, and extras", r.resumed === true && r.assessment.session_id === "s1" && r.turns[0].role === "assistant" && r.turns[0].resolved === true && r.turns[1].client_msg_id === "m1" && r.scenario.scenario === "s");
  check("resume payload never carries context or grading", !("context" in r) && !("grading" in r) && !JSON.stringify(r).includes("grading"));
}

// ============================================================================
console.log("\nTyping test:\n");
{
  check("run key from the server start time", A.typingRunKey("2026-10-06T15:48:40.123+00:00") === `snap:${Date.parse("2026-10-06T15:48:40.123Z")}:end`);
  check("the same instant in two spellings is one run", A.typingRunKey("2026-10-06T15:48:40.123+00:00") === A.typingRunKey("2026-10-06T15:48:40.123Z"));
  check("no start time: no key", A.typingRunKey(null) === null && A.typingRunKey("x") === null);
  const t0 = "2026-10-06T15:48:40.000Z";
  check("while typing: one snapshot key per 5 s slice of the run", A.typingProgressKey(t0, 4_999) === A.typingProgressKey(t0, 0) && A.typingProgressKey(t0, 5_000) !== A.typingProgressKey(t0, 4_999));
  check("…never the run's end key", A.typingProgressKey(t0, 1_000) !== A.typingRunKey(t0) && A.typingProgressKey(t0, 1_000).startsWith(`snap:${Date.parse(t0)}:`));
  check("…only in the run's first 5 minutes, never before it", A.typingProgressKey(t0, 300_001) === null && A.typingProgressKey(t0, -1) === null && A.typingProgressKey(null, 10) === null);
  const first = A.nextTypingContext({}, { targetText: "P1", requiredWpm: 40, startedAt: "2026-10-06T15:00:00.000Z" });
  const second = A.nextTypingContext(first.context, { targetText: "P2", requiredWpm: 40, startedAt: "2026-10-06T15:02:00.000Z" });
  check("a first start is run 1, a Try again run 2", first.run === 1 && second.run === 2);
  check("the context holds the current passage and every run", second.context.target_text === "P2" && second.context.required_wpm === 40 && second.context.runs.length === 2 && second.context.runs[0].target_text === "P1");
  check("which run a start time belongs to", A.typingRunFor(second.context, "2026-10-06T15:00:00.000+00:00") === 1 && A.typingRunFor(second.context, "2026-10-06T15:09:00Z") === null);
  check("attempts before submit", A.typingAttempts(second.context) === 2 && A.typingAttempts({}) === 1);
  let many = { context: {} };
  for (let i = 0; i < 25; i++) many = A.nextTypingContext(many.context, { targetText: `P${i}`, requiredWpm: 40, startedAt: new Date(Date.UTC(2026, 9, 6, 15, i)).toISOString() });
  check("runs are capped at 20 kept, numbering keeps counting", many.run === 25 && many.context.runs.length === 20 && A.typingAttempts(many.context) === 25);

  const target = "The quick brown fox jumps over the lazy dog.";
  const typed = "The quick brwn fox jumps over teh lazy dog. extra";
  const errors = A.typingWordErrors(typed, target);
  check("word errors by the score's own word-by-word rule", same(errors, [
    { index: 2, expected: "brown", typed: "brwn" },
    { index: 6, expected: "the", typed: "teh" },
    { index: 9, expected: null, typed: "extra" },
  ]), JSON.stringify(errors));
  const r = calculateTypingResults(typed, target, 60000, 40);
  const typedWords = typed.trim().split(/\s+/).length;
  check("word errors agree with the accuracy the score uses", r.accuracy === Math.round(((typedWords - errors.length) / typedWords) * 100));

  const detail = A.typingSnapshotDetail({ typedText: typed, targetText: target, wpm: 9, accuracy: 70, elapsedMs: 60000, final: true, run: 2, endedBy: "time_up", textSource: "complete" });
  check("final snapshot carries typed_text, target_text, wpm, accuracy, elapsed_ms", detail.final === true && detail.typed_text === typed && detail.target_text === target && detail.wpm === 9 && detail.accuracy === 70 && detail.elapsed_ms === 60000);
  check("…the run, how it ended and where the text came from", detail.attempt_run === 2 && detail.ended_by === "time_up" && detail.text_source === "complete");

  check("graded text: the text stored when typing stopped", same(A.chooseTypedText({ typed_text: "stored" }, "sent later"), { text: "stored", source: "complete" }));
  check("graded text: else the request's (a page on the previous build)", same(A.chooseTypedText(null, "sent"), { text: "sent", source: "request" }) && A.chooseTypedText(null, 5).text === "");
  check("how a run ended: only the two known words", A.cleanTypingEndedBy("time_up") === "time_up" && A.cleanTypingEndedBy("finished_early") === "finished_early" && A.cleanTypingEndedBy("whatever") === null);
  check("end reason: the page's word wins, else 60 s means time ran out",
    A.typingEndReason("time_up", 1000) === "time_up" && A.typingEndReason("finished_early", 61_000) === "submitted" &&
    A.typingEndReason(null, 60_400) === "time_up" && A.typingEndReason(undefined, 41_000) === "submitted");
}

// ============================================================================
console.log("\nMoving on after a result (stepMoveOn.ts):\n");
{
  const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const tokenFor = (claims) => `Bearer ${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(claims)}.c2ln`;
  const USER = "20000000-0000-4000-8000-000000000001";
  const exp = 1_900_000_000;
  const user = tokenFor({ sub: USER, role: "authenticated", exp, name: "Zoë" });

  const claims = M.jwtClaims(user);
  check("jwtClaims reads sub, role and exp (unverified; for timing only)", claims?.sub === USER && claims.role === "authenticated" && claims.exp === exp, JSON.stringify(claims));
  check("…and survives UTF-8 claims", M.jwtClaims(tokenFor({ sub: USER, note: "naïve 🎉" }))?.sub === USER);
  check("…and refuses what is not a Bearer JWT",
    M.jwtClaims(null) === null && M.jwtClaims("Bearer abc") === null && M.jwtClaims(user.replace("Bearer ", "")) === null &&
    M.jwtClaims(`Bearer x.${Buffer.from("not json").toString("base64url")}.y`) === null && M.jwtClaims(`Bearer x.${b64url([1])}.y`) === null);

  const base = { applicationId: APP, stepId: "step_chat", authorization: user, supabaseUrl: "https://x.supabase.co", anonKey: "anon" };
  const R = M.moveOnRequest;
  check("scheduled: both ids, a signed-in user's JWT and where to ask", same(R(base), { schedule: true, tokenExpiresAtMs: exp * 1000 }), JSON.stringify(R(base)));
  check("not without both ids", R({ ...base, applicationId: "x" }).why === "no_ids" && R({ ...base, stepId: " " }).why === "no_ids");
  check("not without a user's JWT (none, the anon key, no subject)",
    R({ ...base, authorization: null }).why === "no_user_token" &&
    R({ ...base, authorization: tokenFor({ role: "anon", iss: "supabase" }) }).why === "no_user_token" &&
    R({ ...base, authorization: tokenFor({ sub: USER, role: "anon" }) }).why === "no_user_token");
  check("not without the project's URL and key", R({ ...base, supabaseUrl: null }).why === "not_configured" && R({ ...base, anonKey: "" }).why === "not_configured");
  check("not for a job the caller already read as manual (or unset)", R({ ...base, processingMode: "manual" }).why === "not_auto_mode" && R({ ...base, processingMode: null }).why === "not_auto_mode");
  check("an auto job the caller read, or one it did not read (decided later from the database)", R({ ...base, processingMode: "auto" }).schedule && R(base).schedule);
  check("a token with no exp: still scheduled (the default waits)", same(R({ ...base, authorization: tokenFor({ sub: USER }) }), { schedule: true, tokenExpiresAtMs: null }));

  const T = M.MOVE_ON_TIMING;
  check("the waits: 20 s for the page's own ask, 75 s for an analysis to be saved (it takes 37-47 s)", T.graceMs === 20_000 && T.lateMs === 75_000 && T.lateMs > T.graceMs + 47_000);
  const t0 = 1_000_000;
  check("times: no token expiry -> 20 s and 75 s", same(M.moveOnTimes({ startMs: t0, tokenExpiresAtMs: null }), { firstAtMs: t0 + 20_000, lateAtMs: t0 + 75_000 }));
  check("times: the late look is moved up to 15 s before the token expires", same(M.moveOnTimes({ startMs: t0, tokenExpiresAtMs: t0 + 50_000 }), { firstAtMs: t0 + 20_000, lateAtMs: t0 + 35_000 }));
  check("times: a token about to expire -> one look, as soon as it can (the last chance)", same(M.moveOnTimes({ startMs: t0, tokenExpiresAtMs: t0 + 25_000 }), { firstAtMs: t0 + 10_000, lateAtMs: t0 + 10_000 }));
  check("times: never before the start", same(M.moveOnTimes({ startMs: t0, tokenExpiresAtMs: t0 - 60_000 }), { firstAtMs: t0, lateAtMs: t0 }));

  // Plans exactly as trigger-ava-analysis will make them.
  const steps = buildCandidateJourney([
    { id: "step_chat", type: "chat_simulation", title: "Chat" },
    { id: "step_typing", type: "typing_test", title: "Typing" },
    { id: "step_voice", type: "voice_interview", title: "Voice" },
  ], { hasQuiz: false });
  const resultNotes = (step, type) => ({ chatSimulationResult: { score: 80 }, typingTestResult: { wpm: 50 }, _trusted: { [step]: { stepType: type, completedAt: "2026-10-06T15:00:00.000Z" } } });
  const plan = (stepId, application, mode = "auto") => planAutoAdvance({ steps, completedStepId: stepId, application, processingMode: mode });
  const state = (p, extra = {}) => ({ processingMode: "auto", plan: p, analysisCovered: false, noticeSent: false, resultAt: null, ...extra });
  const onChat = plan("step_chat", { phase: "step_chat", status: "reviewing", notes: resultNotes("step_chat", "chat_simulation") });
  const movedOn = plan("step_chat", { phase: "step_typing", status: "reviewing", notes: resultNotes("step_chat", "chat_simulation") });
  const beforeVoice = plan("step_typing", { phase: "step_typing", status: "reviewing", notes: resultNotes("step_typing", "typing_test") });
  check("(the plans are the real ones)", onChat.kind === "advance" && movedOn.kind === "already_advanced" && beforeVoice.kind === "needs_employer_approval");
  const C = M.planMoveOnCheck;
  check("still on the step: nobody has asked -> ask", C({ state: state(onChat), lastChance: false }).action === "ask" && C({ state: state(onChat), lastChance: true }).action === "ask");
  check("already moved on: the page asked, and its request started Ava's analysis -> nothing", same(C({ state: state(movedOn), lastChance: true }), { action: "skip", why: "already_moved_on" }));
  check("before a voice interview, nothing seen yet -> look again", same(C({ state: state(beforeVoice), lastChance: false }), { action: "look_again" }));
  check("…at the last look -> ask", same(C({ state: state(beforeVoice), lastChance: true }), { action: "ask" }));
  check("…an analysis saved since the result -> nothing", same(C({ state: state(beforeVoice, { analysisCovered: true }), lastChance: true }), { action: "skip", why: "analysis_started" }));
  check("…the employer already told -> nothing", same(C({ state: state(beforeVoice, { noticeSent: true }), lastChance: true }), { action: "skip", why: "employer_notified" }));
  check("a manual job is never asked (its manual path would park or move people)",
    same(C({ state: state(onChat, { processingMode: "manual" }), lastChance: true }), { action: "skip", why: "not_auto_mode" }) &&
    same(C({ state: state(plan("step_chat", { phase: "step_chat", status: "reviewing", notes: resultNotes("step_chat", "chat_simulation") }, "manual"), { processingMode: null }), lastChance: true }), { action: "skip", why: "not_auto_mode" }));
  check("unreadable -> nothing (never guess the mode)", same(C({ state: null, lastChance: true }), { action: "skip", why: "unreadable" }));
  check("closed, moved elsewhere, no result, not a step -> nothing",
    C({ state: state(plan("step_chat", { phase: "step_chat", status: "rejected", notes: resultNotes("step_chat", "chat_simulation") })), lastChance: true }).why === "application_closed" &&
    C({ state: state(plan("step_chat", { phase: "step_voice", status: "reviewing", notes: resultNotes("step_chat", "chat_simulation") })), lastChance: true }).why === "not_on_step" &&
    C({ state: state(plan("step_chat", { phase: "step_chat", status: "reviewing", notes: { _trusted: {} } })), lastChance: true }).why === "result_missing" &&
    C({ state: state(plan("nope", { phase: "step_chat", status: "reviewing", notes: {} })), lastChance: true }).why === "unknown_step");

  const A2 = M.readTriggerAnswer;
  check("answer: no answer (network, timeout) -> one more try", same(A2(null, null), { ok: false, retry: true, decision: null }));
  check("answer: 200 with the decision the pages read", same(A2(200, { success: true, decision: "advanced", alreadyAdvanced: true }), { ok: true, retry: false, decision: "advanced" }) && A2(200, { success: true, skipped: true }).decision === "skipped");
  check("answer: 5xx and 429 -> one more try; 4xx -> never", A2(500, {}).retry && A2(503, "x").retry && A2(429, {}).retry && !A2(401, {}).retry && !A2(400, { error: "currentPhaseId is required" }).retry && !A2(403, {}).ok);
  check("the body is the page's own", same(M.moveOnRequestBody(APP, "step_chat"), { applicationId: APP, autopilotDecision: true, currentPhaseId: "step_chat" }));

  // The grading functions schedule it right after the result is recorded
  // (the connection check's `record` the same road as typing).
  const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
  const grading = {
    "submit-typing-test": "supabase/functions/submit-typing-test/index.ts",
    "ai-chat-simulation": "supabase/functions/ai-chat-simulation/index.ts",
    "ai-chat-interview": "supabase/functions/ai-chat-interview/index.ts",
    "submit-sales-simulation": "supabase/functions/submit-sales-simulation/index.ts",
    "connection-test": "supabase/functions/connection-test/index.ts",
  };
  for (const [name, file] of Object.entries(grading)) {
    const src = read(file);
    const calls = src.split("scheduleStepMoveOn(").length - 1;
    const record = src.search(/recordStepResult\((admin|toMinimalAdmin)/);
    const refused = src.indexOf("if (!outcome.ok)", record);
    const schedule = src.indexOf("scheduleStepMoveOn(", refused);
    const finish = src.indexOf("finishGrading(", refused);
    const call = src.slice(schedule, src.indexOf(");", schedule));
    check(`${name}: imports the one helper`, /import \{ (?:jwtClaims, )?scheduleStepMoveOn \} from "\.\.\/_shared\/stepMoveOn\.ts";/.test(src));
    check(`${name}: schedules the move once, after the result is recorded and before the attempt is closed`,
      calls === 1 && record > 0 && refused > record && schedule > refused && finish > schedule, `${calls} ${record} ${refused} ${schedule} ${finish}`);
    check(`${name}: with the request's own JWT, never waiting on it`,
      /authorization: (req\.headers\.get\("Authorization"\)|authHeader)/.test(call) && !/await\s+scheduleStepMoveOn/.test(src), call);
  }
  check("submit-typing-test: a manual job (read from the database) schedules nothing", /processingMode: job\.processing_mode/.test(read(grading["submit-typing-test"])));

  // What it relies on in trigger-ava-analysis: the auto path, decided from the database, idempotent.
  const trigger = read("supabase/functions/trigger-ava-analysis/index.ts");
  check("trigger-ava-analysis still takes the page's body and decides auto mode from the database",
    /applicationId,[\s\S]{0,120}autopilotDecision = false,[\s\S]{0,80}currentPhaseId = null/.test(trigger) && trigger.includes('const autoMode = job?.processing_mode === "auto";') &&
    trigger.includes("if (autoMode && (autopilotDecision || previewOnly))"));
  check("…moves by compare-and-set and starts an analysis only when none has read the step",
    trigger.includes("await advanceAfterStep(") && trigger.includes("shouldScoreAfterStep(outcome, application.notes)"));
  check("…and accepts the candidate's own JWT", trigger.includes("const isCandidateOwner = application.candidate_id === requestingUser.id;"));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
