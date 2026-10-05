import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { CandidateStanding } from "@/lib/journeyProgress";

/**
 * useAssessmentSession — the applicant's side of the assessment record
 * (docs/ASSESSMENT-RECORD.md §5.2).
 *
 * The owner wants every answer kept as it is entered: if an applicant closes
 * the tab, the hiring team still sees how far they got and that they left,
 * and nothing depends on the tab staying open. Until wave 2 the chat
 * transcripts, quiz picks and form answers lived only in the browser until
 * the final send.
 *
 * What this does, for one application × step:
 *
 *   - start / resume: `start_assessment_session` when the step page mounts on
 *     a step that is not finished. Its reply carries what the server already
 *     holds (chat turns, quiz picks with the time each question was first
 *     shown, the form draft) and the server's clock, so a reload — or another
 *     device — picks up where the applicant left off.
 *   - heartbeat: `touch_assessment_session` every 30 s while the page is
 *     visible, at once when it is hidden or shown, and with a keepalive fetch
 *     on `pagehide`, so staff can read "active 1 min ago" or "left at
 *     question 3". A beat alone is not activity (§2.4): it carries
 *     `p_active: true` only when the page saw input since the previous beat
 *     (a key — typing an answer not sent yet counts —, a pick, a click, a
 *     scroll), so an applicant writing a long reply never reads "Left", and
 *     one who walked away from a visible tab does. The page's hint
 *     (`p_progress`) is sent whole each time it changes: it replaces the last.
 *   - the form draft: `save_application_draft` 1.5 s after the last change,
 *     and at once when the page is hidden or closed.
 *   - the quiz: `record_quiz_answer(q, null)` when a question appears and
 *     `record_quiz_answer(q, answer)` on each pick, so time per question is
 *     measured on the server's clock.
 *
 * Recording must never block a test. Every call is best effort: a network
 * failure is retried later, and the error codes the contract lists (not
 * signed in, a closed application, a step not reached or already sent, the
 * function not deployed yet) stop that kind of recording quietly. Nothing here
 * throws into a page.
 *
 * The logic lives in plain functions (createSessionController and the resume
 * helpers) with every browser dependency passed in, so
 * scripts/assessment_session_client.test.mjs runs it in Node.
 */

/* ------------------------------------------------------------------ errors */

/** What a recording call does after an error: try again later, give up on this
 *  one item, or stop recording this kind of thing for the rest of the page. */
export type RecordingErrorAction = "retry" | "drop" | "stop";

// docs/ASSESSMENT-RECORD.md §4.1. Wrong person, closed application, unknown or
// unreached step, a full session, or a function this database does not have
// yet: nothing later in this page's life will change the answer.
const STOP_CODES = new Set(["42501", "HF001", "HF002", "HF003", "HF005", "PGRST202", "PGRST203"]);
// The item itself is unusable (a sent step, a malformed argument, a U+0000
// Postgres refused before the function ran): skip it, keep recording the rest.
// None of these can succeed on a retry.
const DROP_CODES = new Set(["HF004", "22023", "22P02", "22P05", "23514"]);

export function classifyRecordingError(error: unknown): RecordingErrorAction {
  if (!error || typeof error !== "object") return "retry";
  const code = String((error as { code?: unknown }).code ?? "");
  if (STOP_CODES.has(code)) return "stop";
  if (DROP_CODES.has(code)) return "drop";
  return "retry";
}

/* ------------------------------------------------------------ U+0000 */

/**
 * Postgres refuses a U+0000 anywhere in a jsonb argument (22P05, "unsupported
 * Unicode escape sequence") before the function body runs, so the server
 * cannot repair it, and the call can never succeed. One arrives in a pasted-in
 * form answer (a PDF through a phone keyboard's clipboard chip) or a page's
 * own state. Every string and every key sent in p_answers, p_answer, p_events
 * and p_progress goes through this first (docs/ASSESSMENT-RECORD.md §4.1).
 *
 * The same rule as the server's `withoutNul` (supabase/functions/_shared/
 * assessmentSession.ts): each NUL becomes U+FFFD, so two keys that differ
 * only by a NUL can never collapse into one, and the text keeps its length.
 * Arrays and plain objects are walked; numbers, booleans and null are kept.
 */
export function withoutNul<T>(value: T): T {
  if (typeof value === "string") {
    return (value.includes("\u0000") ? value.split("\u0000").join("\uFFFD") : value) as T;
  }
  if (Array.isArray(value)) return value.map((item) => withoutNul(item)) as T;
  const proto = value && typeof value === "object" ? Object.getPrototypeOf(value) : undefined;
  if (proto === Object.prototype || proto === null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item !== undefined) out[withoutNul(key)] = withoutNul(item);
    }
    return out as T;
  }
  return value;
}

/* ------------------------------------------------------------- the reply */

export interface AssessmentTurn {
  seq: number;
  kind: "candidate_turn" | "assistant_turn";
  content: string;
  client_msg_id: string | null;
  created_at: string;
}

export interface AssessmentSessionReply {
  session_id: string | null;
  step_id: string;
  step_type: string | null;
  attempt: number | null;
  status: string | null;
  started_at: string | null;
  last_activity_at: string | null;
  ended_at: string | null;
  progress: Record<string, unknown>;
  integrity: { total: number; away_count: number };
  turns: AssessmentTurn[];
  draft: Record<string, unknown> | null;
  quiz: { answers: Record<string, unknown>; shown_at: Record<string, string> } | null;
  finished: boolean;
  resumed: boolean;
  server_now: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

function parseTurns(value: unknown): AssessmentTurn[] {
  if (!Array.isArray(value)) return [];
  const turns: AssessmentTurn[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    // The start RPC names each turn's `kind`; an edge function's resume reply
    // names its `role` ("user" is the applicant).
    const kind =
      item.kind === "candidate_turn" || item.kind === "assistant_turn"
        ? item.kind
        : item.role === "user"
          ? "candidate_turn"
          : item.role === "assistant"
            ? "assistant_turn"
            : null;
    if (!kind) continue;
    if (typeof item.content !== "string") continue;
    turns.push({
      seq: typeof item.seq === "number" ? item.seq : turns.length + 1,
      kind,
      content: item.content,
      client_msg_id: str(item.client_msg_id),
      created_at: str(item.created_at) ?? new Date(0).toISOString(),
    });
  }
  return turns.sort((a, b) => a.seq - b.seq);
}

/**
 * The start reply, checked field by field. Anything that is not the contract's
 * shape (a fixture client, a function from a different build) comes back as
 * null, and the page carries on as if the record did not exist.
 */
export function parseSessionReply(data: unknown, stepId?: string): AssessmentSessionReply | null {
  if (!isRecord(data)) return null;
  if (!("session_id" in data) || !("server_now" in data)) return null;
  const integrity = isRecord(data.integrity) ? data.integrity : {};
  const quiz = isRecord(data.quiz) ? data.quiz : null;
  return {
    session_id: str(data.session_id),
    step_id: str(data.step_id) ?? stepId ?? "",
    step_type: str(data.step_type),
    attempt: typeof data.attempt === "number" ? data.attempt : null,
    status: str(data.status),
    started_at: str(data.started_at),
    last_activity_at: str(data.last_activity_at),
    ended_at: str(data.ended_at),
    progress: isRecord(data.progress) ? data.progress : {},
    integrity: {
      total: typeof integrity.total === "number" ? integrity.total : 0,
      away_count: typeof integrity.away_count === "number" ? integrity.away_count : 0,
    },
    turns: parseTurns(data.turns),
    draft: isRecord(data.draft) ? data.draft : null,
    quiz: quiz
      ? {
          answers: isRecord(quiz.answers) ? quiz.answers : {},
          shown_at: isRecord(quiz.shown_at)
            ? (Object.fromEntries(
                Object.entries(quiz.shown_at).filter(([, at]) => typeof at === "string"),
              ) as Record<string, string>)
            : {},
        }
      : null,
    finished: data.finished === true,
    resumed: data.resumed === true,
    server_now: str(data.server_now),
  };
}

/** server clock − this browser's clock, in ms. A server time T happened at
 *  (T − offset) on this browser's clock. 0 when the reply has no clock. */
export function serverOffsetMs(reply: Pick<AssessmentSessionReply, "server_now"> | null, clientNowMs: number): number {
  const at = reply?.server_now ? Date.parse(reply.server_now) : Number.NaN;
  return Number.isFinite(at) ? at - clientNowMs : 0;
}

/* ------------------------------------------------------- resuming a chat */

export interface ConversationMessage<R extends string> {
  id: string;
  role: R;
  content: string;
  timestamp: Date;
}

/**
 * The stored turns as the page's own messages. The applicant's turns keep the
 * page's id for them (their client_msg_id), so a reply can still be asked for
 * by that id; the other side's turns are numbered by `seq`. Times are moved
 * onto this browser's clock.
 */
export function turnsToMessages<C extends string, O extends string>(
  turns: AssessmentTurn[],
  roles: { candidate: C; other: O },
  offsetMs = 0,
): ConversationMessage<C | O>[] {
  return turns.map((turn) => {
    const at = Date.parse(turn.created_at);
    const isCandidate = turn.kind === "candidate_turn";
    return {
      id: isCandidate ? turn.client_msg_id ?? `turn-${turn.seq}` : `turn-${turn.seq}`,
      role: isCandidate ? roles.candidate : roles.other,
      content: turn.content,
      timestamp: new Date(Number.isFinite(at) ? at - offsetMs : Date.now()),
    };
  });
}

/** The applicant's last message, when nothing has answered it yet (the tab
 *  closed while the reply was coming). */
export function unansweredCandidateTurn(turns: AssessmentTurn[]): AssessmentTurn | null {
  const last = turns[turns.length - 1];
  return last && last.kind === "candidate_turn" ? last : null;
}

/** The stored turns a JSON reply carries (a "start" for a conversation the
 *  server already holds answers with them instead of a second opener). */
export function turnsFromJson(body: unknown): AssessmentTurn[] | null {
  if (!isRecord(body) || !Array.isArray(body.turns)) return null;
  return parseTurns(body.turns);
}

/** The scenario a chat-practice reply says the attempt is pinned to (the
 *  server keeps the first one an attempt started with). */
export function pinnedScenarioFrom(body: unknown): { scenario: string; customerName: string } | null {
  if (!isRecord(body)) return null;
  const holder = isRecord(body.assessment) && isRecord(body.assessment.scenario) ? body.assessment.scenario : body.scenario;
  if (!isRecord(holder)) return null;
  const scenario = str(holder.scenario);
  const customerName = str(holder.customerName);
  return scenario && customerName ? { scenario, customerName } : null;
}

/* ------------------------------------------------------- resuming a quiz */

interface QuizQuestionLike {
  id?: string;
  time_limit_seconds?: number;
}

/** The id record_quiz_answer and submit_quiz_attempt use for a question:
 *  its own id, else `__idx_<n>`. */
export function quizQuestionRecordId(question: QuizQuestionLike | null | undefined, index: number): string {
  return question?.id && question.id.length > 0 ? question.id : `__idx_${index}`;
}

export interface QuizResume {
  /** The quiz had been started before (a question was shown or answered). */
  started: boolean;
  /** Keyed the way the page keys its answers: by question id. */
  answers: Record<string, unknown>;
  /** The question the applicant was on, if the server knows it. */
  currentIndex: number | null;
  /** Deadlines (ISO, this browser's clock) still in the future. */
  deadlines: Record<string, string>;
  startedAt: string | null;
}

/**
 * What the server's record says about a quiz in progress, in the page's terms.
 *
 * A deadline is when the question was first shown (server time) plus its time
 * limit, moved onto this browser's clock. Deadlines already past are dropped,
 * exactly as the page drops its own stored ones: a question the applicant
 * comes back to gets a fresh clock. Minting already-expired deadlines is what
 * once walked a reopened quiz through every remaining question and sent a
 * blank paper (see QuizPhase's syncTimerState).
 */
export function quizResumeFromReply(
  reply: AssessmentSessionReply | null,
  questions: QuizQuestionLike[],
  opts: { offsetMs: number; nowMs: number; defaultLimitSeconds?: number },
): QuizResume {
  const empty: QuizResume = { started: false, answers: {}, currentIndex: null, deadlines: {}, startedAt: null };
  if (!reply || reply.finished || !reply.quiz) return empty;

  const byRecordId = new Map<string, { index: number; question: QuizQuestionLike }>();
  questions.forEach((question, index) => byRecordId.set(quizQuestionRecordId(question, index), { index, question }));

  // A record that names questions this quiz no longer has is a record of a
  // different test: the hiring team replaced the questions while an attempt
  // was open (2026-10-05, the whole set was rewritten under a live applicant).
  // Resuming it would put them on "question 4" of a quiz whose first three
  // they never saw, so it resumes nothing and the quiz starts from the top.
  const recorded = [...Object.keys(reply.quiz.answers), ...Object.keys(reply.quiz.shown_at)];
  if (recorded.length > 0 && !recorded.some((qid) => byRecordId.has(qid))) return empty;

  const answers: Record<string, unknown> = {};
  for (const [qid, answer] of Object.entries(reply.quiz.answers)) {
    const match = byRecordId.get(qid);
    if (!match?.question.id || answer === null || answer === undefined) continue;
    answers[match.question.id] = answer;
  }

  const deadlines: Record<string, string> = {};
  for (const [qid, shownAt] of Object.entries(reply.quiz.shown_at)) {
    const match = byRecordId.get(qid);
    const shownMs = Date.parse(shownAt);
    if (!match?.question.id || !Number.isFinite(shownMs)) continue;
    const limit = match.question.time_limit_seconds || opts.defaultLimitSeconds || 30;
    const deadlineMs = shownMs - opts.offsetMs + limit * 1000;
    if (deadlineMs > opts.nowMs) deadlines[match.question.id] = new Date(deadlineMs).toISOString();
  }

  // Where they were: the server's current question, or the furthest question
  // they had been shown if that is later. A pick that reached the server
  // after the next question's "shown" (a retry, a slow request) moves
  // progress.current_index back; the furthest question shown never goes back,
  // and the clock only ever moved them forward.
  const rawIndex = reply.progress.current_index;
  const serverIndex =
    typeof rawIndex === "number" && Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < questions.length
      ? rawIndex
      : null;
  let furthestShown: number | null = null;
  for (const qid of Object.keys(reply.quiz.shown_at)) {
    const match = byRecordId.get(qid);
    if (match && (furthestShown === null || match.index > furthestShown)) furthestShown = match.index;
  }
  const currentIndex =
    serverIndex === null ? furthestShown : furthestShown === null ? serverIndex : Math.max(serverIndex, furthestShown);

  const started = Object.keys(reply.quiz.shown_at).length > 0 || Object.keys(reply.quiz.answers).length > 0;
  return { started, answers, currentIndex, deadlines, startedAt: started ? reply.started_at : null };
}

/* ---------------------------------------------------- the browser plumbing */

let cachedAccessToken: string | null = null;
let watchingToken = false;

/** Keeps the signed-in user's access token at hand, so a `pagehide` handler
 *  can send a keepalive request synchronously (it cannot wait for a promise). */
export function watchAccessToken(): void {
  if (watchingToken || typeof window === "undefined") return;
  watchingToken = true;
  try {
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        cachedAccessToken = data.session?.access_token ?? cachedAccessToken;
      })
      .catch(() => undefined);
    supabase.auth.onAuthStateChange((_event, session) => {
      cachedAccessToken = session?.access_token ?? null;
    });
  } catch {
    watchingToken = false;
  }
}

export function currentAccessToken(): string | null {
  return cachedAccessToken;
}

/** The applicant's own access token (never the publishable key alone): the
 *  server only stores a conversation when it can tell whose it is. */
export async function candidateAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      cachedAccessToken = data.session.access_token;
      return data.session.access_token;
    }
  } catch {
    /* fall through */
  }
  return cachedAccessToken;
}

/**
 * Headers for a request to a test's edge function: the applicant's own JWT
 * when there is one, so the server can verify who is talking and keep the
 * conversation (docs/ASSESSMENT-RECORD.md §5.1). Without a session it falls
 * back to the publishable key, which is what every request sent before this
 * build — the server then simply does not store anything.
 */
export async function assessmentRequestHeaders(): Promise<Record<string, string>> {
  const token = await candidateAccessToken();
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${token ?? SUPABASE_PUBLISHABLE_KEY}`,
  };
}

/** A fresh id for a message or an event (the server's idempotency key). */
export function newClientId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      /* not a secure context — fall through */
    }
  }
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A fire-and-forget POST that survives the page closing. supabase-js cannot
 * send keepalive requests, and `sendBeacon` cannot carry the Authorization
 * header, so this is a plain fetch to the PostgREST RPC endpoint (or an edge
 * function) with the same URL and key the client uses. Bodies stay under the
 * 64 KB keepalive limit or are not sent.
 */
export function keepalivePost(path: string, body: unknown, accessToken: string | null = currentAccessToken()): boolean {
  if (!accessToken || typeof fetch !== "function") return false;
  let payload: string;
  try {
    payload = JSON.stringify(body);
  } catch {
    return false;
  }
  if (payload.length > 60_000) return false;
  try {
    void fetch(`${SUPABASE_URL}${path}`, {
      method: "POST",
      keepalive: true,
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: payload,
    }).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

/** A keepalive call to one of the record's functions (U+0000 stripped: §4.1). */
export function keepaliveRpc(fn: string, args: Record<string, unknown>): boolean {
  return keepalivePost(`/rest/v1/rpc/${fn}`, withoutNul(args));
}

/* --------------------------------------------------------- the controller */

type RpcResult = { data: unknown; error: unknown };

export interface SessionControllerDeps {
  applicationId: string;
  stepId: string;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
  keepalive: (fn: string, args: Record<string, unknown>) => void;
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  isHidden: () => boolean;
  onReply?: (reply: AssessmentSessionReply | null, offsetMs: number) => void;
  /** The session is no longer open on the server (grading, completed, …). */
  onServerStatus?: (status: string) => void;
  heartbeatMs?: number;
  draftDelayMs?: number;
}

export interface SessionController {
  start(): Promise<AssessmentSessionReply | null>;
  setLive(live: boolean): void;
  /** The page saw input (a key, a pick, a click, a scroll): the next beat is activity. */
  noteActivity(): void;
  setClientProgress(progress: Record<string, unknown> | null): void;
  visibility(hidden: boolean): void;
  pageHide(): void;
  saveDraft(answers: Record<string, unknown>): void;
  flushDraft(): Promise<void>;
  quizShown(questionId: string, shownAt?: string | null): void;
  quizAnswer(questionId: string, answer: unknown, shownAt?: string | null, delayMs?: number): void;
  flushQuiz(): Promise<void>;
  dispose(): void;
  readonly sessionId: string | null;
}

/** Session states in which the server still owes the step's result. */
const STILL_OWED = new Set(["grading", "failed"]);

/** The page's hint is at most this much JSON. The server refuses a hint over
 *  4 KB measured as jsonb text, which is longer than JSON.stringify's. */
export const PROGRESS_HINT_BYTES = 3_000;

/** An attempt marked "left" while the page is open is brought back at most this often. */
const REVIVE_EVERY_MS = 60_000;

const byteLength = (text: string): number => {
  try {
    return new TextEncoder().encode(text).length;
  } catch {
    return text.length * 3;
  }
};

// Two hook instances (or React's development double-mount) opening the same
// step within a moment of each other share one call, so the record does not
// get a spurious "reloaded" marker.
const startsInFlight = new Map<string, { at: number; promise: Promise<RpcResult> }>();
const START_SHARE_MS = 3000;

export function createSessionController(deps: SessionControllerDeps): SessionController {
  const heartbeatMs = deps.heartbeatMs ?? 30_000;
  const draftDelayMs = deps.draftDelayMs ?? 1_500;

  let disposed = false;
  let sessionId: string | null = null;
  let sessionStopped = false;
  let draftStopped = false;
  let quizStopped = false;
  let live = false;
  let heartbeatTimer: unknown = null;
  let progressTimer: unknown = null;
  let clientProgress: Record<string, unknown> | null = null;
  let progressSentKey: string | null = null;
  let startRetries = 0;
  let startRetryTimer: unknown = null;
  // Input seen since the last beat the server took (§2.4).
  let sawInput = false;
  // The sweep marked the attempt "left" while this page is still open.
  let abandoned = false;
  let reviving = false;
  let lastReviveAt = Number.NEGATIVE_INFINITY;

  let pendingDraft: Record<string, unknown> | null = null;
  let draftTimer: unknown = null;
  let draftInFlight: Promise<void> | null = null;

  let quizChain: Promise<void> = Promise.resolve();
  const shownSent = new Set<string>();
  const pendingAnswers = new Map<string, { answer: unknown; shownAt: string | null }>();
  const answerTimers = new Map<string, unknown>();

  const clear = (handle: unknown) => {
    if (handle !== null && handle !== undefined) deps.clearTimeout(handle);
  };

  // Every argument goes without U+0000 (§4.1): Postgres refuses one in jsonb
  // before the function runs, and that call could never succeed.
  const call = async (fn: string, args: Record<string, unknown>): Promise<RpcResult> => {
    try {
      const result = await deps.rpc(fn, withoutNul(args));
      return { data: result?.data ?? null, error: result?.error ?? null };
    } catch (error) {
      return { data: null, error: error ?? { message: "request failed" } };
    }
  };

  /* -- start / resume -- */

  const start = async (): Promise<AssessmentSessionReply | null> => {
    const key = `${deps.applicationId}:${deps.stepId}`;
    const now = deps.now();
    let entry = startsInFlight.get(key);
    if (!entry || now - entry.at > START_SHARE_MS) {
      entry = {
        at: now,
        promise: call("start_assessment_session", { p_application_id: deps.applicationId, p_step_id: deps.stepId }),
      };
      startsInFlight.set(key, entry);
    }
    const { data, error } = await entry.promise;
    if (disposed) return null;

    if (error) {
      const action = classifyRecordingError(error);
      if (action === "retry" && startRetries < 3) {
        startRetries += 1;
        startRetryTimer = deps.setTimeout(() => {
          startRetryTimer = null;
          if (!disposed && !sessionId) void start();
        }, 5_000 * startRetries);
      } else {
        sessionStopped = true;
      }
      deps.onReply?.(null, 0);
      return null;
    }

    const reply = parseSessionReply(data, deps.stepId);
    if (!reply) {
      sessionStopped = true;
      deps.onReply?.(null, 0);
      return null;
    }
    sessionId = reply.finished ? null : reply.session_id;
    if (reply.finished) sessionStopped = true;
    deps.onReply?.(reply, serverOffsetMs(reply, deps.now()));
    scheduleHeartbeat();
    if (clientProgress) scheduleProgress(0);
    return reply;
  };

  /* -- heartbeat -- */

  const touch = async (hidden: boolean | null, withProgress: boolean) => {
    if (!sessionId || sessionStopped || disposed) return;
    const args: Record<string, unknown> = { p_session_id: sessionId };
    if (hidden !== null) args.p_hidden = hidden;
    // A beat is activity only when the page saw input since the last one
    // (§2.4, §4.3): otherwise a long answer still being typed reads "Left"
    // after ten quiet minutes. Omitted (not false) when there was none.
    const active = sawInput;
    sawInput = false;
    if (active) args.p_active = true;
    let sentKey: string | null = null;
    if (withProgress && clientProgress) {
      // The whole hint, each time it changes: it REPLACES progress.client.
      const key = JSON.stringify(clientProgress);
      if (key !== progressSentKey) {
        if (byteLength(key) <= PROGRESS_HINT_BYTES) {
          args.p_progress = clientProgress;
          sentKey = key;
        } else {
          // Too big to ever be taken (22023): never sent, never retried, and
          // never the reason a beat fails.
          progressSentKey = key;
        }
      }
    }
    const { data, error } = await call("touch_assessment_session", args);
    if (error) {
      const action = classifyRecordingError(error);
      if (action === "stop") {
        sessionStopped = true;
        return;
      }
      // Not stored: the input still counts on the next beat.
      if (active) sawInput = true;
      // A hint the server refused is not sent again; the next beat goes without it.
      if (action === "drop" && sentKey) progressSentKey = sentKey;
      return;
    }
    if (sentKey) progressSentKey = sentKey;
    if (isRecord(data) && data.updated === false) {
      if (data.reason === "application_closed") sessionStopped = true;
      if (typeof data.status === "string") {
        if (data.status === "abandoned" && !sessionStopped) {
          // The sweep marked the attempt "left" while this page is still
          // open. Beats go on; the next sign the applicant is here
          // (input, coming back to the page) brings it back to life.
          abandoned = true;
          if (active || hidden === false) void revive();
        } else if (!STILL_OWED.has(data.status)) {
          // While the server is checking a send (or owes it after a crash)
          // the page keeps asking, so it learns how that ends; any other
          // closed state ends the heartbeat.
          sessionStopped = true;
        }
        deps.onServerStatus?.(data.status);
      }
    }
  };

  /**
   * An attempt the sweep marked "left" (`abandoned`) comes back to life when
   * the applicant returns (§2.3): start_assessment_session revives it with a
   * `came_back` marker. The page's own reply (its resume) is not replaced.
   */
  const revive = async () => {
    if (!abandoned || reviving || sessionStopped || disposed) return;
    const now = deps.now();
    if (now - lastReviveAt < REVIVE_EVERY_MS) return;
    lastReviveAt = now;
    reviving = true;
    const { data, error } = await call("start_assessment_session", {
      p_application_id: deps.applicationId,
      p_step_id: deps.stepId,
    });
    reviving = false;
    if (disposed) return;
    if (error) {
      // Tried again on the next sign of input, a minute on at the earliest.
      if (classifyRecordingError(error) === "stop") sessionStopped = true;
      return;
    }
    const reply = parseSessionReply(data, deps.stepId);
    if (!reply) return;
    if (reply.finished || !reply.session_id) {
      sessionStopped = true;
      if (reply.status) deps.onServerStatus?.(reply.status);
      return;
    }
    abandoned = false;
    sessionId = reply.session_id;
    if (reply.status) deps.onServerStatus?.(reply.status);
    scheduleHeartbeat();
  };

  function scheduleHeartbeat() {
    clear(heartbeatTimer);
    heartbeatTimer = null;
    if (!live || !sessionId || sessionStopped || disposed) return;
    heartbeatTimer = deps.setTimeout(() => {
      heartbeatTimer = null;
      // A hidden page has already said so; a plain heartbeat from it would
      // only keep "last heartbeat" moving.
      if (!deps.isHidden()) void touch(null, true);
      scheduleHeartbeat();
    }, heartbeatMs);
  }

  function scheduleProgress(delay: number) {
    clear(progressTimer);
    progressTimer = deps.setTimeout(() => {
      progressTimer = null;
      if (live && !deps.isHidden()) void touch(null, true);
    }, delay);
  }

  /* -- form draft -- */

  // `pendingDraft` is the latest form state the server has not acknowledged:
  // it stays set while its save is in flight, so a page closing mid-save
  // still sends it by keepalive (the browser hides the page — and starts the
  // ordinary save — just before `pagehide`, then usually cancels that save).
  const flushDraft = async (): Promise<void> => {
    clear(draftTimer);
    draftTimer = null;
    if (draftInFlight) await draftInFlight;
    if (!pendingDraft || draftStopped) return;
    const answers = pendingDraft;
    draftInFlight = (async () => {
      const { error } = await call("save_application_draft", {
        p_application_id: deps.applicationId,
        p_answers: answers,
      });
      if (!error) {
        if (pendingDraft === answers) pendingDraft = null;
        return;
      }
      const action = classifyRecordingError(error);
      if (action === "stop" || (error as { code?: string }).code === "HF004") {
        draftStopped = true;
        pendingDraft = null;
        return;
      }
      if (action === "drop") {
        if (pendingDraft === answers) pendingDraft = null;
        return;
      }
      if (!disposed && draftTimer === null) {
        draftTimer = deps.setTimeout(() => {
          draftTimer = null;
          void flushDraft();
        }, 5_000);
      }
    })();
    try {
      await draftInFlight;
    } finally {
      draftInFlight = null;
    }
  };

  const saveDraft = (answers: Record<string, unknown>) => {
    if (draftStopped || disposed) return;
    pendingDraft = answers;
    clear(draftTimer);
    draftTimer = deps.setTimeout(() => {
      draftTimer = null;
      void flushDraft();
    }, draftDelayMs);
  };

  /* -- quiz -- */

  const enqueueQuiz = (fn: () => Promise<void>) => {
    quizChain = quizChain.then(fn, fn);
    return quizChain;
  };

  // A pick still waiting on its debounce for another question goes before
  // this question's "shown": record_quiz_answer moves progress.current_index
  // to the question it is about, so a pick that arrived after the next
  // "shown" put the record (and a resume on another device) back a question.
  const sendOtherPicks = (questionId: string) => {
    for (const [otherId, handle] of [...answerTimers]) {
      if (otherId === questionId) continue;
      clear(handle);
      answerTimers.delete(otherId);
      void sendAnswer(otherId);
    }
  };

  const quizShown = (questionId: string, shownAt: string | null = null) => {
    if (quizStopped || disposed) return;
    sendOtherPicks(questionId);
    if (shownSent.has(questionId)) return;
    shownSent.add(questionId);
    void enqueueQuiz(async () => {
      if (quizStopped) return;
      const { error } = await call("record_quiz_answer", {
        p_application_id: deps.applicationId,
        p_question_id: questionId,
        p_answer: null,
        ...(shownAt ? { p_shown_at: shownAt } : {}),
      });
      if (!error) return;
      const action = classifyRecordingError(error);
      if (action === "stop") quizStopped = true;
      else if (action === "retry") shownSent.delete(questionId); // asked again next time it is on screen
    });
  };

  const sendAnswer = (questionId: string) => {
    const pending = pendingAnswers.get(questionId);
    if (!pending) return Promise.resolve();
    pendingAnswers.delete(questionId);
    return enqueueQuiz(async () => {
      if (quizStopped) return;
      const { error } = await call("record_quiz_answer", {
        p_application_id: deps.applicationId,
        p_question_id: questionId,
        p_answer: pending.answer,
        ...(pending.shownAt ? { p_shown_at: pending.shownAt } : {}),
      });
      if (!error) return;
      const action = classifyRecordingError(error);
      if (action === "stop") quizStopped = true;
      else if (action === "retry" && !disposed && !pendingAnswers.has(questionId)) {
        // Only the latest pick matters: a newer one already waiting wins.
        pendingAnswers.set(questionId, pending);
        answerTimers.set(
          questionId,
          deps.setTimeout(() => {
            answerTimers.delete(questionId);
            void sendAnswer(questionId);
          }, 4_000),
        );
      }
    });
  };

  const quizAnswer = (questionId: string, answer: unknown, shownAt: string | null = null, delayMs = 500) => {
    if (quizStopped || disposed) return;
    pendingAnswers.set(questionId, { answer, shownAt });
    clear(answerTimers.get(questionId));
    answerTimers.set(
      questionId,
      deps.setTimeout(() => {
        answerTimers.delete(questionId);
        void sendAnswer(questionId);
      }, delayMs),
    );
  };

  const flushQuiz = async () => {
    for (const [questionId, handle] of answerTimers) {
      clear(handle);
      answerTimers.delete(questionId);
    }
    const ids = [...pendingAnswers.keys()];
    for (const id of ids) void sendAnswer(id);
    await quizChain;
  };

  /* -- page lifecycle -- */

  // Keepalive bodies go without U+0000 too (§4.1).
  const keepalive = (fn: string, args: Record<string, unknown>) => deps.keepalive(fn, withoutNul(args));

  const pageHide = () => {
    if (disposed) return;
    if (sessionId && !sessionStopped) {
      keepalive("touch_assessment_session", {
        p_session_id: sessionId,
        p_hidden: true,
        // Typing right up to the close is the last activity.
        ...(sawInput ? { p_active: true } : {}),
      });
      sawInput = false;
    }
    if (pendingDraft && !draftStopped) {
      const answers = draftForKeepalive(withoutNul(pendingDraft));
      if (answers) keepalive("save_application_draft", { p_application_id: deps.applicationId, p_answers: answers });
      // Sent: a save still in flight, or a retry, finds nothing to send.
      pendingDraft = null;
      clear(draftTimer);
      draftTimer = null;
    }
    if (!quizStopped) {
      for (const [questionId, pending] of pendingAnswers) {
        keepalive("record_quiz_answer", {
          p_application_id: deps.applicationId,
          p_question_id: questionId,
          p_answer: pending.answer,
          ...(pending.shownAt ? { p_shown_at: pending.shownAt } : {}),
        });
        clear(answerTimers.get(questionId));
        answerTimers.delete(questionId);
      }
      pendingAnswers.clear();
    }
  };

  return {
    start,
    setLive(next: boolean) {
      if (live === next) return;
      live = next;
      if (live) {
        scheduleHeartbeat();
        if (clientProgress) scheduleProgress(0);
      } else {
        clear(heartbeatTimer);
        heartbeatTimer = null;
      }
    },
    noteActivity() {
      if (disposed) return;
      sawInput = true;
      if (abandoned && live && !deps.isHidden()) void revive();
    },
    setClientProgress(progress) {
      clientProgress = progress && Object.keys(progress).length > 0 ? withoutNul(progress) : null;
      if (clientProgress && JSON.stringify(clientProgress) !== progressSentKey && sessionId) scheduleProgress(300);
    },
    visibility(hidden: boolean) {
      if (hidden && pendingDraft) void flushDraft();
      if (live) void touch(hidden, !hidden);
    },
    pageHide,
    saveDraft,
    flushDraft,
    quizShown,
    quizAnswer,
    flushQuiz,
    dispose() {
      if (disposed) return;
      // Answers still waiting on their debounce go now: leaving the page
      // must not lose the last pick or the last keystrokes of the form.
      if (pendingDraft) void flushDraft();
      if (pendingAnswers.size > 0) void flushQuiz();
      disposed = true;
      clear(heartbeatTimer);
      clear(progressTimer);
      clear(startRetryTimer);
    },
    get sessionId() {
      return sessionId;
    },
  };
}

/* --------------------------------------------------------------- the hook */

export type AssessmentSessionStatus = "idle" | "loading" | "ready" | "unavailable";

export interface UseAssessmentSessionOptions {
  applicationId: string | undefined;
  stepId: string | undefined;
  /** Open (or resume) the record. Only for a step that is not finished. */
  enabled: boolean;
  /** Send heartbeats. Defaults to `enabled`; turn off once the step is sent. */
  live?: boolean;
  /** The page's own hint for staff (`{ screen: "intro" }`). Sent whole each
   *  time it changes; it REPLACES progress.client (§2.5). Never anything
   *  secret: it is returned to the applicant. */
  clientProgress?: Record<string, unknown> | null;
  /** How long a page waits for the record before carrying on without it. */
  settleAfterMs?: number;
}

export interface AssessmentSession {
  status: AssessmentSessionStatus;
  /** Settled: the reply came back, or the page stopped waiting for it. */
  settled: boolean;
  reply: AssessmentSessionReply | null;
  offsetMs: number;
  sessionId: string | null;
  /** Set when a heartbeat learns the server has closed the session. */
  serverStatus: string | null;
  /** The page saw input the document listeners cannot see (they cover keys,
   *  clicks, taps and scrolling already). */
  noteActivity: () => void;
  saveDraft: (answers: Record<string, unknown>) => void;
  flushDraft: () => Promise<void>;
  quizShown: (questionId: string, shownAt?: string | null) => void;
  quizAnswer: (questionId: string, answer: unknown, shownAt?: string | null, delayMs?: number) => void;
  /** Sends every pick still waiting on its debounce; resolves within `maxWaitMs`. */
  flushQuiz: (maxWaitMs?: number) => Promise<void>;
}

/** What counts as input for the heartbeat's `p_active` (§2.4): a key (typing
 *  in a reply box nobody has sent yet counts), a click or tap, a pick, and the
 *  applicant's own scrolling. Not `scroll` itself: the page scrolls by itself
 *  when the interviewer answers, and an interviewer reply is not activity. */
export const ACTIVITY_EVENTS = ["keydown", "input", "pointerdown", "touchstart", "wheel"] as const;

const browserRpc = async (fn: string, args: Record<string, unknown>) => {
  // The functions are typed in types.ts; this one path serves all five.
  const result = await supabase.rpc(fn as "start_assessment_session", args as never);
  return { data: result.data as unknown, error: result.error as unknown };
};

export function useAssessmentSession({
  applicationId,
  stepId,
  enabled,
  live,
  clientProgress,
  settleAfterMs = 5_000,
}: UseAssessmentSessionOptions): AssessmentSession {
  const [state, setState] = useState<{ status: AssessmentSessionStatus; reply: AssessmentSessionReply | null; offsetMs: number }>(
    { status: "idle", reply: null, offsetMs: 0 },
  );
  const [serverStatus, setServerStatus] = useState<string | null>(null);
  const controllerRef = useRef<SessionController | null>(null);
  const isLive = live ?? enabled;

  useEffect(() => {
    if (!enabled || !applicationId || !stepId) {
      setState((current) => (current.status === "idle" ? current : { status: "idle", reply: null, offsetMs: 0 }));
      return;
    }
    watchAccessToken();
    const controller = createSessionController({
      applicationId,
      stepId,
      rpc: browserRpc,
      keepalive: (fn, args) => {
        keepaliveRpc(fn, args);
      },
      now: () => Date.now(),
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
      isHidden: () => document.visibilityState === "hidden",
      onReply: (reply, offsetMs) => setState({ status: reply ? "ready" : "unavailable", reply, offsetMs }),
      onServerStatus: setServerStatus,
    });
    controllerRef.current = controller;
    setState({ status: "loading", reply: null, offsetMs: 0 });
    setServerStatus(null);
    void controller.start();

    // A slow or missing record never holds a test up.
    const settleTimer = window.setTimeout(() => {
      setState((current) => (current.status === "loading" ? { ...current, status: "unavailable" } : current));
    }, settleAfterMs);

    const onVisibility = () => controller.visibility(document.visibilityState === "hidden");
    const onPageHide = () => controller.pageHide();
    // Input anywhere on the page, seen before any handler can stop it. Only a
    // flag is set here; the next beat carries it.
    const onInput = (event: Event) => {
      if (event.isTrusted !== false) controller.noteActivity();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    for (const type of ACTIVITY_EVENTS) document.addEventListener(type, onInput, { capture: true, passive: true });

    return () => {
      window.clearTimeout(settleTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      for (const type of ACTIVITY_EVENTS) document.removeEventListener(type, onInput, { capture: true });
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [enabled, applicationId, stepId, settleAfterMs]);

  const sessionId = state.reply?.finished ? null : state.reply?.session_id ?? null;

  useEffect(() => {
    controllerRef.current?.setLive(isLive);
  }, [isLive, sessionId]);

  const progressKey = clientProgress ? JSON.stringify(clientProgress) : "";
  useEffect(() => {
    controllerRef.current?.setClientProgress(progressKey ? (JSON.parse(progressKey) as Record<string, unknown>) : null);
  }, [progressKey, sessionId]);

  const noteActivity = useCallback(() => controllerRef.current?.noteActivity(), []);
  const saveDraft = useCallback((answers: Record<string, unknown>) => controllerRef.current?.saveDraft(answers), []);
  const flushDraft = useCallback(async () => {
    await controllerRef.current?.flushDraft();
  }, []);
  const quizShown = useCallback(
    (questionId: string, shownAt?: string | null) => controllerRef.current?.quizShown(questionId, shownAt ?? null),
    [],
  );
  const quizAnswer = useCallback(
    (questionId: string, answer: unknown, shownAt?: string | null, delayMs?: number) =>
      controllerRef.current?.quizAnswer(questionId, answer as Json, shownAt ?? null, delayMs),
    [],
  );
  const flushQuiz = useCallback(async (maxWaitMs = 1_500) => {
    const controller = controllerRef.current;
    if (!controller) return;
    await Promise.race([
      controller.flushQuiz(),
      new Promise<void>((resolve) => window.setTimeout(resolve, maxWaitMs)),
    ]);
  }, []);

  return useMemo(
    () => ({
      status: state.status,
      settled: state.status === "ready" || state.status === "unavailable",
      reply: state.reply,
      offsetMs: state.offsetMs,
      sessionId,
      serverStatus,
      noteActivity,
      saveDraft,
      flushDraft,
      quizShown,
      quizAnswer,
      flushQuiz,
    }),
    [state, sessionId, serverStatus, noteActivity, saveDraft, flushDraft, quizShown, quizAnswer, flushQuiz],
  );
}

/* ------------------------------------------- the test functions' answers */

/**
 * A chat function's answer (start or respond) that the applicant's message
 * could not be stored, even after the server's own retries: 503
 * `{code: "turn_not_saved", retryable: true}`. The server sent no reply, so the
 * page sends the message again under the SAME clientMsgId (stored once), and
 * if that fails too it gives the text back to the reply box. A bubble nobody
 * will ever answer is never left on screen.
 */
export function isTurnNotSaved(status: number, body: unknown): boolean {
  if (!isRecord(body)) return false;
  return body.code === "turn_not_saved" || (status === 503 && body.retryable === true);
}

/** Thrown inside a page's send when the server answered `turn_not_saved`. */
export class TurnNotSavedError extends Error {
  constructor() {
    super("turn_not_saved");
    this.name = "TurnNotSavedError";
  }
}

/** How long a page waits before sending an unsaved message once more. */
export const TURN_RESEND_DELAY_MS = 2_000;

/**
 * The reply box after a message is given back: the unsent text first, then
 * anything typed since (the box is normally empty: it is disabled while the
 * reply is on its way).
 */
export function restoreUnsentText(current: string, unsent: string): string {
  return current.trim() ? `${unsent}\n${current}` : unsent;
}

/**
 * What a grading call's answer (chat practice `evaluate`, the interview's and
 * the sales `submit`, typing `submit`) means for the page:
 *
 *   - "ok": graded and recorded now, or already on file (200, with
 *     `alreadyRecorded: true` for a send that was graded before);
 *   - "checking": 409 `already_checking`, another request (another tab, a
 *     retry whose first reply was lost) is grading this attempt now;
 *   - "on_file": 409 `already_recorded`, the result is on file;
 *   - "error": anything else. Only this one is shown as an error.
 *
 * "checking" and "on_file" mean "we have your answers": the page waits for the
 * result and the next step (useServerCheck, useStepAdvance), never shows an
 * error and never offers a second send.
 */
export type GradingReplyOutcome = "ok" | "checking" | "on_file" | "error";

export function gradingReplyOutcome(status: number, body: unknown): GradingReplyOutcome {
  if (status >= 200 && status < 300) return "ok";
  const code = isRecord(body) ? body.code : null;
  if (status === 409 && code === "already_checking") return "checking";
  if (status === 409 && code === "already_recorded") return "on_file";
  return "error";
}

/**
 * The status and body of a failed `supabase.functions.invoke` call (a non-2xx
 * answer is a FunctionsHttpError whose `context` is the Response). Null when
 * the request never got an answer.
 */
export async function functionErrorReply(error: unknown): Promise<{ status: number; body: unknown } | null> {
  const context = isRecord(error) ? (error as { context?: unknown }).context : null;
  if (!context || typeof context !== "object") return null;
  const response = context as { status?: unknown; json?: () => Promise<unknown>; clone?: () => { json: () => Promise<unknown> } };
  if (typeof response.status !== "number") return null;
  let body: unknown = null;
  try {
    body = typeof response.clone === "function" ? await response.clone().json() : await response.json?.();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

/* ------------------------------------- a send the server is already checking */

/**
 * Where the server says a conversation is, for a page about to resume it or
 * still showing it (docs/ASSESSMENT-RECORD.md §2.3 and §4.3):
 *
 *   - "open": carry on (resume the conversation, or show the intro);
 *   - "checking": End was pressed — on this page before a reload, or on
 *     another device — and the server is grading it (`grading`), or has just
 *     finished (`completed`). The page shows its waiting screen, never a live
 *     chat the server no longer records;
 *   - "owed": grading crashed (`failed`) and the result is still owed: the
 *     page sends the conversation again, once;
 *   - "done": the result is on file (`finished`).
 *
 * The heartbeat's status, when there is one, is newer than the start reply's.
 */
export type ServerConversationState = "open" | "checking" | "owed" | "done";

export function serverConversationState(
  reply: Pick<AssessmentSessionReply, "status" | "finished"> | null | undefined,
  heartbeatStatus?: string | null,
): ServerConversationState {
  if (reply?.finished) return "done";
  const status = heartbeatStatus || reply?.status || null;
  if (status === "grading" || status === "completed") return "checking";
  if (status === "failed") return "owed";
  return "open";
}

/**
 * While waiting on a check this page did not send (or no longer sees through):
 * "landed" once the step's stored result differs from what was there when the
 * wait began (a staff reopen leaves an older result in place, so presence alone
 * proves nothing), "owed" once the heartbeat says grading failed, else "waiting".
 */
export function serverCheckOutcome(input: {
  baselineKey: string | null;
  currentKey: string | null;
  serverStatus: string | null;
  statusAtBegin: string | null;
}): "landed" | "owed" | "waiting" {
  if (input.currentKey && input.currentKey !== input.baselineKey) return "landed";
  if (input.serverStatus === "failed" && input.statusAtBegin !== "failed") return "owed";
  return "waiting";
}

/**
 * The baseline a wait compares the stored result against: the one the page
 * gave (`baselineKey`: the stored result before its own send went out), else
 * the result as the page first read it (`loadResultKey`), else the stored
 * result now. `undefined` means "not given"; `null` is a real baseline (no
 * result on file).
 */
export function serverCheckBaseline(
  baselineKey: string | null | undefined,
  loadResultKey: string | null | undefined,
  currentKey: string | null,
): string | null {
  if (baselineKey !== undefined) return baselineKey;
  if (loadResultKey !== undefined) return loadResultKey;
  return currentKey;
}

/**
 * The candidate's standing (journeyProgress.whereCandidateStands), corrected
 * by the server's word that one step is FINISHED (start_assessment_session:
 * its result is on file and the hiring team has not handed it back).
 * whereCandidateStands reads "status pending + phase on the step" as a
 * retake, and a manual-mode job (it never moves phase) shows exactly that
 * after every test, so it would offer the finished step again: the applicant
 * takes it and the server throws the new answers away. Here that step is
 * "saved, the next one is not open" ("waiting"), or "finished every step"
 * when nothing real comes after it; never "take".
 */
export function standingWithServerDone(
  steps: readonly { id: string }[],
  standing: CandidateStanding,
  doneStepId: string | null | undefined,
  decisionStageId: string,
): CandidateStanding {
  if (!doneStepId || standing.kind !== "take" || standing.step.id !== doneStepId) return standing;
  const laterRealStep = steps.slice(standing.index + 1).some((s) => s.id !== decisionStageId);
  if (laterRealStep) return { kind: "waiting", index: standing.index, step: standing.step };
  const decision = steps.findIndex((s) => s.id === decisionStageId);
  return { kind: "finished", index: decision === -1 ? Math.max(steps.length - 1, 0) : decision };
}

/** The step's result as stored in the notes, as a comparable string (null when absent). */
export function storedResultKey(result: unknown): string | null {
  if (result === null || result === undefined || result === false) return null;
  try {
    return JSON.stringify(result);
  } catch {
    return null;
  }
}

export interface ServerCheck {
  /** Waiting for the server's check of a send this page did not see through. */
  waiting: boolean;
  /** Start waiting (the page has put up its waiting screen). `baselineKey`:
   *  the stored result as it was before this page's own send went out (a 409
   *  `already_checking`), so a result that lands while the reply was on its
   *  way still counts. Default: `loadResultKey` (the stored result when the
   *  page first read the application) when the page gives one, else the
   *  stored result now. */
  begin: (baselineKey?: string | null) => void;
  /** Stop waiting (the page is sending it itself now). */
  cancel: () => void;
}

/**
 * The step's stored result (as a key) the first time this page read the
 * application after mounting (`fetchedAfterMount`, as useResultAtFirstLoad):
 * the baseline for a wait the page did not start with its own send.
 *
 * A wait begun on the heartbeat's word (End pressed on another device, or a
 * reload while the server is checking) must not take "the stored result now"
 * as its baseline. The page's own realtime subscription re-reads the
 * application within a second of the result landing, and heartbeats come every
 * 30 s, so the beat that first says "completed" usually arrives after the new
 * result is already cached: a baseline taken then equals it, the wait never
 * sees it land, and the page sits on "being checked" until a reload.
 */
export function useResultKeyAtFirstLoad(fetchedAfterMount: boolean, key: string | null): string | null {
  const ref = useRef<{ key: string | null } | null>(null);
  if (ref.current === null && fetchedAfterMount) ref.current = { key };
  return ref.current ? ref.current.key : null;
}

/**
 * The wait itself. The page passes the step's stored result (as a key) and the
 * heartbeat's status; while waiting it keeps the heartbeat live, so a crashed
 * check is noticed within one beat. `onLanded` runs once when the result is on
 * file, `onOwed` once when it is owed, `onStale` whenever the session says
 * "completed" but the page has not seen the result yet (re-read the row).
 * `loadResultKey` (useResultKeyAtFirstLoad) is the default baseline of a wait
 * begun without one.
 */
export function useServerCheck(opts: {
  storedResultKey: string | null;
  serverStatus: string | null;
  loadResultKey?: string | null;
  onLanded: () => void;
  onOwed: () => void;
  onStale?: () => void;
}): ServerCheck {
  const [waiting, setWaiting] = useState(false);
  const baselineRef = useRef<string | null>(null);
  const statusAtBeginRef = useRef<string | null>(null);
  const latest = useRef(opts);
  latest.current = opts;

  const begin = useCallback((baselineKey?: string | null) => {
    baselineRef.current = serverCheckBaseline(baselineKey, latest.current.loadResultKey, latest.current.storedResultKey);
    statusAtBeginRef.current = latest.current.serverStatus;
    setWaiting(true);
  }, []);
  const cancel = useCallback(() => setWaiting(false), []);

  const { storedResultKey: currentKey, serverStatus } = opts;
  useEffect(() => {
    if (!waiting) return;
    const outcome = serverCheckOutcome({
      baselineKey: baselineRef.current,
      currentKey,
      serverStatus,
      statusAtBegin: statusAtBeginRef.current,
    });
    if (outcome === "landed") {
      setWaiting(false);
      latest.current.onLanded();
    } else if (outcome === "owed") {
      setWaiting(false);
      latest.current.onOwed();
    } else if (serverStatus === "completed") {
      latest.current.onStale?.();
    }
  }, [waiting, currentKey, serverStatus]);

  return useMemo(() => ({ waiting, begin, cancel }), [waiting, begin, cancel]);
}

/* ------------------------------------------------- the application draft */

/** What the form holds, as the page keeps it. */
export interface FormDraftState {
  answers: Record<string, string>;
  multiAnswers: Record<string, string[]>;
  phoneCountryCodes: Record<string, string>;
  questionFileUrls: Record<string, string>;
  coverLetter: string;
}

const DRAFT_LIMIT = 60_000;

/**
 * The form as a `save_application_draft` payload: keyed by the job's question
 * id (a string, or the ticked options of a pick-several question), with the
 * form's own extra state under `_` keys, which the server does not count.
 * Over the 64 KB limit the cover letter goes first; if it is still too big
 * nothing is sent (null).
 */
export function formStateToDraft(state: FormDraftState): Record<string, unknown> | null {
  const draft: Record<string, unknown> = { ...state.answers };
  for (const [questionId, selected] of Object.entries(state.multiAnswers)) {
    if (Array.isArray(selected)) draft[questionId] = selected;
  }
  if (Object.keys(state.phoneCountryCodes).length > 0) draft._phoneCountryCodes = state.phoneCountryCodes;
  if (Object.keys(state.questionFileUrls).length > 0) draft._questionFileUrls = state.questionFileUrls;
  if (state.coverLetter) draft._coverLetter = state.coverLetter;
  if (JSON.stringify(draft).length <= DRAFT_LIMIT) return draft;
  delete draft._coverLetter;
  return JSON.stringify(draft).length <= DRAFT_LIMIT ? draft : null;
}

/** Room for the draft in the keepalive budget the page has as it closes
 *  (about 64 KB in flight, shared with the integrity batch and the heartbeat). */
export const KEEPALIVE_DRAFT_BYTES = 40_000;

/**
 * The draft as it can travel in a keepalive request: whole when it fits, else
 * without the cover letter (the longest field, saved by the ordinary save a
 * moment earlier), else not at all (null).
 */
export function draftForKeepalive(
  draft: Record<string, unknown>,
  maxBytes = KEEPALIVE_DRAFT_BYTES,
): Record<string, unknown> | null {
  const size = (value: unknown) => {
    try {
      return JSON.stringify(value).length;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  };
  if (size(draft) <= maxBytes) return draft;
  if (!("_coverLetter" in draft)) return null;
  const rest = { ...draft };
  delete rest._coverLetter;
  return size(rest) <= maxBytes ? rest : null;
}

/** A draft value the server counts as answered. */
export function draftValueFilled(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

const stringRecord = (value: unknown): Record<string, string> =>
  isRecord(value)
    ? (Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === "string")) as Record<string, string>)
    : {};

/**
 * A saved draft back into the form's state. Only the job's own questions are
 * restored (a question removed since is ignored), strings into answers and
 * lists into the pick-several state. `filled` counts answered questions, so
 * the page only says "we kept your answers" when there was something to keep.
 */
export function draftToFormState(
  draft: Record<string, unknown> | null,
  questions: Array<{ id: string }>,
): (FormDraftState & { filled: number }) | null {
  if (!draft) return null;
  const answers: Record<string, string> = {};
  const multiAnswers: Record<string, string[]> = {};
  let filled = 0;
  for (const question of questions) {
    if (!question?.id || !(question.id in draft)) continue;
    const value = draft[question.id];
    if (typeof value === "string") {
      answers[question.id] = value;
    } else if (Array.isArray(value)) {
      multiAnswers[question.id] = value.filter((option): option is string => typeof option === "string");
    } else {
      continue;
    }
    if (draftValueFilled(value)) filled += 1;
  }
  const coverLetter = typeof draft._coverLetter === "string" ? draft._coverLetter : "";
  if (coverLetter.trim()) filled += 1;
  return {
    answers,
    multiAnswers,
    phoneCountryCodes: stringRecord(draft._phoneCountryCodes),
    questionFileUrls: stringRecord(draft._questionFileUrls),
    coverLetter,
    filled,
  };
}
