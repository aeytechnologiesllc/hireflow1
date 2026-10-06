/**
 * assessmentSession.ts — the server's half of the assessment record
 * (docs/ASSESSMENT-RECORD.md §5.1; storage in
 * supabase/migrations/20261005230146_assessment_record.sql).
 *
 * The owner wants every answer and message kept as it is entered, so the
 * hiring team still sees how far an applicant got when they close the tab,
 * and the full record of each test: both chat transcripts, the typed text
 * against the passage, the full grading and the integrity timeline. The
 * edge functions that run the tests (ai-chat-simulation, ai-chat-interview,
 * submit-typing-test, submit-sales-simulation, connection-test) write that
 * record through this module, with the service-role client:
 *
 *   - resolveSession: the applicant's live attempt for a step, found or
 *     opened through open_assessment_session (never an INSERT into
 *     assessment_sessions, so attempt numbering and the one-live-row rule
 *     hold), after the database's own access rule (assessment_step_access:
 *     the caller is the candidate, the application is open, the step is
 *     reached and not finished).
 *   - recordCandidateTurn: the applicant's message is stored BEFORE the
 *     model is asked, idempotently on the page's own message id, and the
 *     history the model sees is rebuilt from the stored turns.
 *   - teeAndRecordReply: the model's streamed reply goes to the browser as
 *     it arrives AND is collected on a second branch of the same stream; the
 *     full reply is stored after the stream ends, inside
 *     EdgeRuntime.waitUntil, so a closed tab does not lose it.
 *   - chooseTranscript / chooseIntegrity: grading reads the STORED turns and
 *     the integrity events the page recorded, not the request body, whenever
 *     the record has them; the request body is the fallback for a browser
 *     still on the previous build.
 *   - awaitInFlightReply: a message sent again while its first reply is
 *     still streaming (a reload, a dropped connection) waits for THAT reply
 *     and plays it back, so the applicant sees the reply the record keeps;
 *     the model is asked again only when the first ask failed or died.
 *   - gateGrading / completeSession / failSession / releaseGrading: ONE
 *     request grades an attempt (active -> grading, compare-and-set). Another
 *     request that arrives meanwhile waits for it and answers with the
 *     result on file; a step whose result is already on file is never graded
 *     again from a request body. The full employer-facing grading lands in
 *     session.grading, which the applicant can never read.
 *   - (stepMoveOn.ts, beside this module) once a result is recorded, an
 *     auto-mode job's move to the next step is asked for by the server
 *     itself, in the background, so it never waits on the applicant's tab.
 *
 * RECORDING NEVER BLOCKS A TEST, with one exception. Every database call
 * here is best effort: a failure is logged and the caller carries on as it
 * did before this module existed (a function that is not deployed yet,
 * PGRST202, reads as "not recording"). The exception is the applicant's own
 * chat message on a page that records the test: it is retried, and if it
 * still cannot be stored the caller answers 503 (`turn_not_saved`) so the
 * page sends it again, rather than carrying on with an answer the record
 * would never have. Only the stored transcript changes what is graded, and
 * only when it exists.
 *
 * Imports only the other zero-dependency shared modules (candidateJourney.ts,
 * trustedResults.ts), so the pure functions still run under plain Node
 * (scripts/assessment_session_server.test.mjs) as well as Deno; the database
 * helpers take the client as a parameter. Call sites pass their supabase-js
 * client cast to AssessmentAdmin (the real builders are thenables,
 * structurally richer than this interface).
 */

import { buildCandidateJourney, type WorkflowStepLike } from "./candidateJourney.ts";
import { computeNextStepDecision, nextStepForCandidate, parseNotesObject } from "./trustedResults.ts";

// ============================================================================
// The client slice this module uses
// ============================================================================

export interface RestError {
  code?: string;
  message?: string;
}

export interface RestResult<T = unknown> {
  data: T | null;
  error: RestError | null;
}

export interface RestQuery extends PromiseLike<RestResult> {
  select(columns?: string): RestQuery;
  eq(column: string, value: unknown): RestQuery;
  in(column: string, values: readonly unknown[]): RestQuery;
  lt(column: string, value: unknown): RestQuery;
  order(column: string, options?: { ascending?: boolean }): RestQuery;
  limit(count: number): RestQuery;
  maybeSingle(): PromiseLike<RestResult>;
}

export interface AssessmentAdmin {
  from(table: string): {
    select(columns: string): RestQuery;
    insert(values: Record<string, unknown> | Record<string, unknown>[]): RestQuery;
    update(values: Record<string, unknown>): RestQuery;
  };
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RestResult>;
}

/** Builds and awaits a query and never throws: a thrown error (while the
 *  query is built, or while it runs) becomes `{ error }`. */
async function settle(query: () => PromiseLike<RestResult>): Promise<RestResult> {
  try {
    const result = await query();
    return { data: result?.data ?? null, error: result?.error ?? null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asObject(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function errorText(error: RestError | null | undefined): string {
  if (!error) return "";
  return [error.code, error.message].filter(Boolean).join(" ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

// ============================================================================
// Request fields
// ============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export interface RecordingTarget {
  applicationId: string;
  stepId: string;
}

/**
 * The application and step a request names, when it names both usably. A
 * browser on the previous build sends neither on a chat turn, and is served
 * exactly as before.
 */
export function recordingTargetFrom(body: unknown): RecordingTarget | null {
  const b = asObject(body);
  const applicationId = b.applicationId;
  const stepId = typeof b.stepId === "string" ? b.stepId.trim() : "";
  if (!isUuid(applicationId) || !stepId || stepId.length > 200) return null;
  return { applicationId, stepId };
}

/** Ids the server writes itself; a page's own message id may never take one. */
const RESERVED_MSG_ID = /^(opener|final)$|^(reply|snap|submit|srv):/i;
/** reply:<id> must still fit the 128-character column. */
const MAX_CLIENT_MSG_ID = 120;

/** The page's own id for a message, if it is usable as an idempotency key. */
export function cleanClientMsgId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_CLIENT_MSG_ID || RESERVED_MSG_ID.test(trimmed)) return null;
  return trimmed;
}

/** A server id for a message the page sent without one (no retry safety). */
export function serverMsgId(): string {
  return `srv:${crypto.randomUUID()}`;
}

export function replyMsgId(candidateMsgId: string): string {
  return `reply:${candidateMsgId}`;
}

/** A page-reported time as ISO, or null when it is not a real time. */
export function cleanClientAt(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const ms = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const MAX_CONTENT = 100_000;

/** Postgres refuses NUL in text and in jsonb; everything else is kept. */
function withoutNul(text: string): string {
  return text.includes("\u0000") ? text.split("\u0000").join("\uFFFD") : text;
}

/** Fits the events table's content column (≤ 100,000 characters, no NUL). */
export function clampContent(text: string): string {
  const clean = withoutNul(text);
  return clean.length > MAX_CONTENT ? clean.slice(0, MAX_CONTENT) : clean;
}

function cleanJson<T>(value: T): T {
  if (typeof value === "string") return withoutNul(value) as T;
  if (Array.isArray(value)) return value.map((item) => cleanJson(item)) as T;
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) out[withoutNul(key)] = cleanJson(item);
    }
    return out as T;
  }
  return value;
}

// ============================================================================
// Sessions
// ============================================================================

/** The step types an edge function records through this module; the database's
 *  own list (assessment_step_access, the step_type CHECK) must say the same. */
export type RecordedStepType = "typing_test" | "chat_simulation" | "chat_interview" | "sales_simulation" | "equipment_check";

export interface SessionRow {
  id: string;
  status: string;
  attempt: number;
  step_type: string;
  context: Record<string, unknown>;
  progress: Record<string, unknown>;
  started_at: string | null;
  integrity_summary: Record<string, unknown>;
  /** Moves on every write to the row (trigger): how a stale grading claim is told apart from a live one. */
  updated_at: string | null;
}

export const SESSION_COLUMNS = "id, status, attempt, step_type, context, progress, started_at, integrity_summary, updated_at";

function normalizeSession(row: unknown): SessionRow | null {
  const r = asObject(row);
  if (typeof r.id !== "string" || typeof r.status !== "string") return null;
  return {
    id: r.id,
    status: r.status,
    attempt: typeof r.attempt === "number" ? r.attempt : Number(r.attempt) || 1,
    step_type: typeof r.step_type === "string" ? r.step_type : "",
    context: asObject(r.context),
    progress: asObject(r.progress),
    started_at: typeof r.started_at === "string" ? r.started_at : null,
    integrity_summary: asObject(r.integrity_summary),
    updated_at: typeof r.updated_at === "string" ? r.updated_at : null,
  };
}

/**
 * What a write is for, and so which existing attempt it may use:
 *   - "turns": a chat message. Only an active attempt takes new turns. An
 *     attempt being graded (or whose grading failed) takes none.
 *   - "submit": grading, or a typing run. An attempt already being graded
 *     (a retried submit) or whose grading failed (the server still owes the
 *     result) is the one to finish.
 * Anything else (none yet, left, finished and reopened by staff) is opened
 * through open_assessment_session, which revives a left attempt and starts
 * attempt n+1 after a finished one.
 */
export type SessionPurpose = "turns" | "submit";

const ACCEPTS: Record<SessionPurpose, readonly string[]> = {
  turns: ["active"],
  submit: ["active", "grading", "failed"],
};

export type SessionPlan = "use" | "open" | "busy";

export function planSessionUse(latestStatus: string | null, purpose: SessionPurpose): SessionPlan {
  if (latestStatus && ACCEPTS[purpose].includes(latestStatus)) return "use";
  if (latestStatus === "grading" || latestStatus === "failed") return "busy";
  return "open";
}

export type NoSessionReason =
  | "not_deployed"
  | "not_signed_in"
  | "not_your_application"
  | "application_closed"
  | "unknown_step"
  | "step_not_reached"
  | "wrong_step_type"
  | "step_finished"
  | "session_busy"
  | "error";

/** The contract's error codes (docs/ASSESSMENT-RECORD.md §4.1) as reasons. */
export function reasonFromError(error: RestError | null | undefined): NoSessionReason {
  const code = error?.code ?? "";
  if (code === "PGRST202" || code === "42883" || code === "42P01" || code === "PGRST205") return "not_deployed";
  if (code === "42501") return "not_your_application";
  if (code === "HF001") return "application_closed";
  if (code === "HF002") return "unknown_step";
  if (code === "HF003") return "step_not_reached";
  if (code === "HF004") return "step_finished";
  return "error";
}

export interface StepAccess {
  step_type: string;
  step_title: string | null;
  finished: boolean;
  reopened: boolean;
}

export type SessionResolution =
  | { ok: true; session: SessionRow; access: StepAccess; how: "existing" | "opened" }
  | { ok: false; reason: NoSessionReason; detail?: string };

/**
 * The attempt this write belongs to, or why there is none. Never throws.
 * The access rule runs in the database (assessment_step_access) with the
 * user id the caller verified from the JWT; job_id and candidate_id on the
 * session are copied from the application by a trigger, never from here.
 */
export async function resolveSession(
  admin: AssessmentAdmin,
  input: { applicationId: string; stepId: string; userId: string; stepType: RecordedStepType; purpose: SessionPurpose },
): Promise<SessionResolution> {
  const [accessRes, latestRes] = await Promise.all([
    settle(() => admin.rpc("assessment_step_access", {
      p_application_id: input.applicationId,
      p_step_id: input.stepId,
      p_caller: input.userId,
    })),
    settle(() =>
      admin
        .from("assessment_sessions")
        .select(SESSION_COLUMNS)
        .eq("application_id", input.applicationId)
        .eq("step_id", input.stepId)
        .order("attempt", { ascending: false })
        .limit(1),
    ),
  ]);

  if (accessRes.error) return { ok: false, reason: reasonFromError(accessRes.error), detail: errorText(accessRes.error) };
  const rawAccess = asObject(accessRes.data);
  const access: StepAccess = {
    step_type: typeof rawAccess.step_type === "string" ? rawAccess.step_type : "",
    step_title: typeof rawAccess.step_title === "string" ? rawAccess.step_title : null,
    finished: rawAccess.finished === true,
    reopened: rawAccess.reopened === true,
  };
  if (access.step_type !== input.stepType) {
    return { ok: false, reason: "wrong_step_type", detail: `step is ${access.step_type || "unknown"}` };
  }
  if (access.finished) return { ok: false, reason: "step_finished" };
  if (latestRes.error) return { ok: false, reason: reasonFromError(latestRes.error), detail: errorText(latestRes.error) };

  const latest = Array.isArray(latestRes.data) ? normalizeSession(latestRes.data[0]) : null;
  const plan = planSessionUse(latest?.status ?? null, input.purpose);
  if (plan === "use" && latest) return { ok: true, session: latest, access, how: "existing" };
  if (plan === "busy") return { ok: false, reason: "session_busy", detail: `latest attempt is ${latest?.status}` };

  const opened = await settle(() => admin.rpc("open_assessment_session", {
    p_application_id: input.applicationId,
    p_step_id: input.stepId,
    p_candidate_id: input.userId,
  }));
  if (opened.error) return { ok: false, reason: reasonFromError(opened.error), detail: errorText(opened.error) };
  const payload = asObject(opened.data);
  if (payload.finished === true) return { ok: false, reason: "step_finished" };
  const openedId = payload.session_id;
  if (typeof openedId !== "string") return { ok: false, reason: "error", detail: "no session id" };

  const row = await settle(() => admin.from("assessment_sessions").select(SESSION_COLUMNS).eq("id", openedId).maybeSingle());
  const session = normalizeSession(row.data);
  if (!session) return { ok: false, reason: "error", detail: errorText(row.error) || "session not readable" };
  if (planSessionUse(session.status, input.purpose) !== "use") {
    return { ok: false, reason: "session_busy", detail: `opened attempt is ${session.status}` };
  }
  return { ok: true, session, access, how: "opened" };
}

/** Merges `patch` into the session's server-only context. Returns the new context. */
export async function updateContext(
  admin: AssessmentAdmin,
  session: SessionRow,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const next = cleanJson({ ...session.context, ...patch });
  const res = await settle(() => admin.from("assessment_sessions").update({ context: next }).eq("id", session.id));
  if (res.error) {
    console.error("[assessment] context not saved:", errorText(res.error));
    return session.context;
  }
  session.context = next;
  return next;
}

// ============================================================================
// Events
// ============================================================================

export type EventKind = "candidate_turn" | "assistant_turn" | "typing_snapshot" | "system";

export interface EventInput {
  sessionId: string;
  kind: EventKind;
  content?: string | null;
  detail?: Record<string, unknown>;
  durationMs?: number | null;
  clientAt?: string | null;
  clientMsgId?: string | null;
}

function eventRow(input: EventInput): Record<string, unknown> {
  return {
    session_id: input.sessionId,
    kind: input.kind,
    content: typeof input.content === "string" ? clampContent(input.content) : null,
    detail: cleanJson(input.detail ?? {}),
    duration_ms: typeof input.durationMs === "number" && Number.isFinite(input.durationMs)
      ? Math.max(0, Math.round(input.durationMs))
      : null,
    client_at: input.clientAt ?? null,
    client_msg_id: input.clientMsgId ?? null,
  };
}

/**
 * Inserts one event. A repeated client_msg_id inserts nothing (the events
 * trigger skips it): `inserted: false`, no error.
 */
export async function insertEvent(
  admin: AssessmentAdmin,
  input: EventInput,
): Promise<{ inserted: boolean; seq: number | null; error: RestError | null }> {
  const res = await settle(() => admin.from("assessment_events").insert(eventRow(input)).select("seq"));
  if (res.error) return { inserted: false, seq: null, error: res.error };
  const rows = Array.isArray(res.data) ? res.data : [];
  const seq = Number(asObject(rows[0]).seq);
  return { inserted: rows.length > 0, seq: Number.isFinite(seq) ? seq : null, error: null };
}

export interface FoundEvent {
  seq: number;
  kind: string;
  detail: Record<string, unknown>;
  content: string | null;
  created_at: string | null;
}

export async function findEvent(
  admin: AssessmentAdmin,
  sessionId: string,
  clientMsgId: string,
): Promise<FoundEvent | null> {
  const res = await settle(() =>
    admin
      .from("assessment_events")
      .select("seq, kind, detail, content, created_at")
      .eq("session_id", sessionId)
      .eq("client_msg_id", clientMsgId)
      .maybeSingle(),
  );
  if (res.error || !isPlainObject(res.data)) return null;
  return {
    seq: Number(res.data.seq),
    kind: typeof res.data.kind === "string" ? res.data.kind : "",
    detail: asObject(res.data.detail),
    content: typeof res.data.content === "string" ? res.data.content : null,
    created_at: typeof res.data.created_at === "string" ? res.data.created_at : null,
  };
}

// ============================================================================
// Chat turns
// ============================================================================

export interface StoredTurn {
  seq: number;
  kind: "candidate_turn" | "assistant_turn";
  content: string;
  client_msg_id: string | null;
  created_at: string | null;
  detail: Record<string, unknown>;
}

export const TURN_COLUMNS = "seq, kind, content, client_msg_id, created_at, detail";

export function normalizeTurns(rows: unknown): StoredTurn[] {
  if (!Array.isArray(rows)) return [];
  const turns: StoredTurn[] = [];
  for (const row of rows) {
    const r = asObject(row);
    const seq = Number(r.seq);
    if (!Number.isFinite(seq)) continue;
    if (r.kind !== "candidate_turn" && r.kind !== "assistant_turn") continue;
    turns.push({
      seq,
      kind: r.kind,
      content: typeof r.content === "string" ? r.content : "",
      client_msg_id: typeof r.client_msg_id === "string" ? r.client_msg_id : null,
      created_at: typeof r.created_at === "string" ? r.created_at : null,
      detail: asObject(r.detail),
    });
  }
  return turns.sort((a, b) => a.seq - b.seq);
}

/** Every stored turn of a session in seq order, or null if they could not be read. */
export async function loadTurns(admin: AssessmentAdmin, sessionId: string): Promise<StoredTurn[] | null> {
  const res = await settle(() =>
    admin
      .from("assessment_events")
      .select(TURN_COLUMNS)
      .eq("session_id", sessionId)
      .in("kind", ["candidate_turn", "assistant_turn"])
      .order("seq", { ascending: true }),
  );
  if (res.error) {
    console.error("[assessment] turns not readable:", errorText(res.error));
    return null;
  }
  return normalizeTurns(res.data);
}

/**
 * The stored turns once the reply to the applicant's last message has landed.
 * That reply is saved in the background when its stream ends, and a page can
 * send End right after the stream finishes, so grading would otherwise miss
 * the last reply. Waits only when the conversation ends on the applicant's
 * own message, and at most `timeoutMs`; returns the latest read either way.
 */
export async function settleTrailingReply(
  admin: AssessmentAdmin,
  sessionId: string,
  turns: StoredTurn[] | null,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<StoredTurn[] | null> {
  const last = turns && turns.length ? turns[turns.length - 1] : null;
  if (!last || last.kind !== "candidate_turn" || !last.client_msg_id || last.client_msg_id.startsWith("submit:")) return turns;
  const reply = replyMsgId(last.client_msg_id);
  const deadline = Date.now() + (options.timeoutMs ?? 2000);
  let current = turns;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs ?? 250));
    const fresh = await loadTurns(admin, sessionId);
    if (!fresh) return current;
    current = fresh;
    if (fresh.some((t) => t.client_msg_id === reply)) return fresh;
  }
  return current;
}

/** The shape the models and the existing notes results use. "user" is the applicant. */
export interface TranscriptMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export function turnsToTranscript(turns: readonly StoredTurn[]): TranscriptMessage[] {
  return turns.map((turn) => ({
    role: turn.kind === "candidate_turn" ? "user" : "assistant",
    content: turn.content,
    ...(turn.created_at ? { timestamp: turn.created_at } : {}),
  }));
}

export interface CandidateTurnPlan {
  /** The stored turns before this message, in order: the model's history. */
  history: StoredTurn[];
  /** The stored text of this message (a retry keeps the first text). */
  content: string;
  /** The reply already stored for this message (a retried request). */
  existingReply: StoredTurn | null;
  /** The message was already stored: a retry, a reload or a second tab.
   *  Its first reply may still be streaming (awaitInFlightReply). */
  repeat: boolean;
  /** When the first copy was stored, when the read saw it. */
  storedAt: string | null;
}

/**
 * Pure: where this message sits in the stored conversation. `insertedSeq`
 * is the seq the insert got (null when it was a repeat, or not stored).
 * `turns` may have been read just before or just after the insert.
 */
export function planCandidateTurn(
  turns: readonly StoredTurn[],
  clientMsgId: string,
  insertedSeq: number | null,
  sentContent: string,
): CandidateTurnPlan | null {
  const own = turns.find((t) => t.kind === "candidate_turn" && t.client_msg_id === clientMsgId);
  const seq = insertedSeq ?? own?.seq ?? null;
  if (seq == null) return null;
  return {
    history: turns.filter((t) => t.seq < seq),
    content: insertedSeq == null && own ? own.content : sentContent,
    existingReply: turns.find((t) => t.kind === "assistant_turn" && t.client_msg_id === replyMsgId(clientMsgId)) ?? null,
    repeat: insertedSeq == null,
    storedAt: own?.created_at ?? null,
  };
}

/**
 * Errors a write meets again however often it is retried: a full session
 * (HF005), a session or table that is gone, a malformed or refused row.
 * Anything else (a schema-cache reload, a timeout, a dropped connection) is
 * worth another try.
 */
const PERMANENT_WRITE_ERRORS = new Set(["HF005", "23503", "22023", "22P02", "23514", "42501", "42P01", "PGRST204", "PGRST205"]);

export function isPermanentWriteError(error: RestError | null | undefined): boolean {
  return !!error?.code && PERMANENT_WRITE_ERRORS.has(error.code);
}

/** Pauses between tries of the applicant's own message (three tries in all). */
const TURN_RETRY_DELAYS_MS: readonly number[] = [250, 750];

export type CandidateTurnRecording =
  | ({ ok: true } & Omit<CandidateTurnPlan, "history"> & {
    /** null: stored, but the conversation could not be read back (use the request's history). */
    history: StoredTurn[] | null;
  })
  /** turn_not_saved: worth sending again (the caller answers 503).
   *  turn_refused: will never be stored (a full session); carry on unrecorded. */
  | { ok: false; reason: "turn_not_saved" | "turn_refused" };

/**
 * Stores the applicant's message (before the model is asked) and returns the
 * stored history to send the model. The insert and the history read run
 * together; the seq the insert got decides which stored turns came first. A
 * failed insert is tried again (three tries in all) unless the error is one
 * no retry can fix.
 */
export async function recordCandidateTurn(
  admin: AssessmentAdmin,
  sessionId: string,
  input: { content: string; clientMsgId: string; clientAt: string | null; role: "agent" | "candidate" },
  options: { retryDelaysMs?: readonly number[] } = {},
): Promise<CandidateTurnRecording> {
  const content = clampContent(input.content);
  const row: EventInput = {
    sessionId,
    kind: "candidate_turn",
    content,
    clientMsgId: input.clientMsgId,
    clientAt: input.clientAt,
    detail: { role: input.role },
  };
  let [inserted, turns] = await Promise.all([insertEvent(admin, row), loadTurns(admin, sessionId)]);
  const delays = options.retryDelaysMs ?? TURN_RETRY_DELAYS_MS;
  for (let i = 0; inserted.error && !isPermanentWriteError(inserted.error) && i < delays.length; i++) {
    console.warn("[assessment] candidate turn not saved, trying again:", errorText(inserted.error));
    await sleep(delays[i]);
    inserted = await insertEvent(admin, row);
  }
  if (inserted.error) {
    console.error("[assessment] candidate turn not saved:", errorText(inserted.error));
    return { ok: false, reason: isPermanentWriteError(inserted.error) ? "turn_refused" : "turn_not_saved" };
  }
  const insertedSeq = inserted.inserted ? inserted.seq : null;
  let plan = turns ? planCandidateTurn(turns, input.clientMsgId, insertedSeq, content) : null;
  if (!plan) {
    // A repeat whose first copy the parallel read did not see, or a read
    // that failed: read once more.
    turns = await loadTurns(admin, sessionId);
    plan = turns ? planCandidateTurn(turns, input.clientMsgId, insertedSeq, content) : null;
  }
  if (!plan) {
    // Stored, but the conversation cannot be read back right now.
    return { ok: true, history: null, content, existingReply: null, repeat: insertedSeq == null, storedAt: null };
  }
  return { ok: true, ...plan };
}

// ============================================================================
// A reply that is still on its way
// ============================================================================

/** The opener's reply id, and the id of the first ask for it. */
export const OPENER_ID = "opener";
export const OPENER_ASK_ID = "srv:opener";

/** The reply id an answer to `forId` (a message id, or "opener") is stored under. */
export function replyIdFor(forId: string): string {
  return forId === OPENER_ID ? OPENER_ID : replyMsgId(forId);
}

/** The message a reply id answers ("opener" for the opener). */
export function forIdOfReply(replyId: string): string {
  return replyId.startsWith("reply:") ? replyId.slice("reply:".length) : replyId;
}

/**
 * How long a first ask is presumed alive: a streamed reply lands well inside
 * this (≤ 900 tokens). After it, a message sent again is answered afresh
 * (the first request died without saying so).
 */
export const REPLY_WINDOW_MS = 45_000;

export interface ReplyAsk {
  seq: number;
  created_at: string | null;
}

export interface ReplyMarker extends ReplyAsk {
  what: "asked" | "failed";
}

export type ReplyWaitPlan = { action: "replay" } | { action: "ask" } | { action: "wait"; untilMs: number };

/**
 * Pure: what to do with a message sent again (or a second start) whose reply
 * is not stored. `firstAsk` is the stored message itself (or the opener's
 * first ask); `markers` are the later asks and failures this server recorded
 * for it. The latest ask is presumed still streaming, unless a failure was
 * recorded after it or it is older than the window: then ask again.
 */
export function planReplyWait(input: {
  replyStored: boolean;
  firstAsk: ReplyAsk | null;
  markers: readonly ReplyMarker[];
  nowMs: number;
  windowMs?: number;
}): ReplyWaitPlan {
  if (input.replyStored) return { action: "replay" };
  const asks: ReplyAsk[] = [
    ...(input.firstAsk ? [input.firstAsk] : []),
    ...input.markers.filter((m) => m.what === "asked"),
  ];
  if (asks.length === 0) return { action: "ask" };
  const latest = asks.reduce((a, b) => (b.seq > a.seq ? b : a));
  if (input.markers.some((m) => m.what === "failed" && m.seq > latest.seq)) return { action: "ask" };
  const askedAt = latest.created_at ? Date.parse(latest.created_at) : NaN;
  if (!Number.isFinite(askedAt)) return { action: "ask" };
  const untilMs = askedAt + (input.windowMs ?? REPLY_WINDOW_MS);
  return input.nowMs >= untilMs ? { action: "ask" } : { action: "wait", untilMs };
}

async function insertReplyMarker(
  admin: AssessmentAdmin,
  sessionId: string,
  forId: string,
  what: "reply_asked" | "reply_failed",
  reason?: string,
): Promise<void> {
  const res = await insertEvent(admin, {
    sessionId,
    kind: "system",
    detail: { what, reply_for: forId, ...(reason ? { reason: reason.slice(0, 500) } : {}) },
  });
  if (res.error) console.error(`[assessment] ${what} marker not saved:`, errorText(res.error));
}

/** This server is asking the model again for `forId` (the earlier ask failed or died). */
export function markReplyAsked(admin: AssessmentAdmin, sessionId: string, forId: string): Promise<void> {
  return insertReplyMarker(admin, sessionId, forId, "reply_asked");
}

/** The ask for `forId` produced no stored reply (the model failed, or said nothing). */
export function markReplyFailed(admin: AssessmentAdmin, sessionId: string, forId: string, reason: string): Promise<void> {
  return insertReplyMarker(admin, sessionId, forId, "reply_failed", reason);
}

export async function loadReplyMarkers(admin: AssessmentAdmin, sessionId: string, forId: string): Promise<ReplyMarker[] | null> {
  const res = await settle(() =>
    admin
      .from("assessment_events")
      .select("seq, detail, created_at")
      .eq("session_id", sessionId)
      .eq("kind", "system")
      .eq("detail->>reply_for", forId)
      .order("seq", { ascending: true }),
  );
  if (res.error || !Array.isArray(res.data)) {
    if (res.error) console.error("[assessment] reply markers not readable:", errorText(res.error));
    return null;
  }
  const markers: ReplyMarker[] = [];
  for (const row of res.data) {
    const r = asObject(row);
    const what = asObject(r.detail).what;
    const seq = Number(r.seq);
    if (!Number.isFinite(seq) || (what !== "reply_asked" && what !== "reply_failed")) continue;
    markers.push({
      seq,
      what: what === "reply_asked" ? "asked" : "failed",
      created_at: typeof r.created_at === "string" ? r.created_at : null,
    });
  }
  return markers;
}

/**
 * Records that the opener is being asked for. `first` is false when another
 * start already asked (two tabs, or a reload while the opener streamed): that
 * start then waits for the opener rather than asking for a second one.
 */
export async function askForOpener(admin: AssessmentAdmin, sessionId: string): Promise<{ first: boolean }> {
  const res = await insertEvent(admin, {
    sessionId,
    kind: "system",
    clientMsgId: OPENER_ASK_ID,
    detail: { what: "reply_asked", reply_for: OPENER_ID },
  });
  if (res.error) {
    console.error("[assessment] opener ask not saved:", errorText(res.error));
    return { first: true };
  }
  return { first: res.inserted };
}

/**
 * Waits for the reply to `forId` (a message id, or "opener") that an earlier
 * request is still streaming, and returns it to be played back, so the
 * applicant sees the same reply the record keeps. Answers "ask" (ask the
 * model again; the caller records that with markReplyAsked) when the earlier
 * ask failed, died, or the record cannot be read. Never throws.
 */
export async function awaitInFlightReply(
  admin: AssessmentAdmin,
  sessionId: string,
  forId: string,
  options: { windowMs?: number; intervalMs?: number; now?: () => number } = {},
): Promise<{ action: "replay"; reply: StoredTurn } | { action: "ask" }> {
  const now = options.now ?? Date.now;
  const windowMs = options.windowMs ?? REPLY_WINDOW_MS;
  const replyId = replyIdFor(forId);
  const first = await findEvent(admin, sessionId, forId === OPENER_ID ? OPENER_ASK_ID : forId);
  const firstAsk = first ? { seq: first.seq, created_at: first.created_at } : null;
  // A hard stop, whatever later asks say: one window from now.
  const giveUpAt = now() + windowMs;
  for (;;) {
    const [reply, markers] = await Promise.all([
      findEvent(admin, sessionId, replyId),
      loadReplyMarkers(admin, sessionId, forId),
    ]);
    if (reply && reply.kind === "assistant_turn") {
      return {
        action: "replay",
        reply: {
          seq: reply.seq,
          kind: "assistant_turn",
          content: reply.content ?? "",
          client_msg_id: replyId,
          created_at: reply.created_at,
          detail: reply.detail,
        },
      };
    }
    if (!markers) return { action: "ask" };
    const plan = planReplyWait({ replyStored: false, firstAsk, markers, nowMs: now(), windowMs });
    if (plan.action !== "wait" || now() >= giveUpAt) return { action: "ask" };
    await sleep(Math.min(options.intervalMs ?? 500, plan.untilMs - now(), giveUpAt - now()));
  }
}

// ============================================================================
// Streaming replies
// ============================================================================

export interface CollectedStream {
  text: string;
  /** "[DONE]" or a finish_reason arrived: the reply is whole. */
  done: boolean;
  finishReason: string | null;
}

/**
 * Collects the text of an OpenAI chat-completions SSE stream, the way the
 * candidate pages read it: `data: ` lines, `choices[0].delta.content`, and
 * `data: [DONE]` at the end. Only whole lines are read, so a chunk may end
 * anywhere.
 */
export function createSseTextCollector() {
  let buffer = "";
  let text = "";
  let done = false;
  let finishReason: string | null = null;

  const readLine = (raw: string) => {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload) return;
    if (payload === "[DONE]") {
      done = true;
      return;
    }
    try {
      const parsed = JSON.parse(payload);
      const choice = Array.isArray(parsed?.choices) ? parsed.choices[0] : null;
      const content = choice?.delta?.content;
      if (typeof content === "string") text += content;
      if (typeof choice?.finish_reason === "string") finishReason = choice.finish_reason;
    } catch {
      // Not JSON: not part of the reply.
    }
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        readLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
    },
    finish(): CollectedStream {
      if (buffer) {
        readLine(buffer);
        buffer = "";
      }
      return { text, done: done || finishReason !== null, finishReason };
    },
  };
}

/**
 * Splits `body` in two: one branch for the browser (the response body, so it
 * still streams live) and one this function reads to the end, collecting the
 * reply. Cancelling the browser's branch (a closed tab) does not cancel the
 * source while the other branch is still reading, so the reply is still
 * collected and `onComplete` still runs. `recording` settles after it.
 */
export function teeForRecording(
  body: ReadableStream<Uint8Array>,
  onComplete: (result: CollectedStream & { error: unknown }) => Promise<void> | void,
): { clientBody: ReadableStream<Uint8Array>; recording: Promise<void> } {
  const [clientBody, recordBody] = body.tee();
  const recording = (async () => {
    const collector = createSseTextCollector();
    const decoder = new TextDecoder();
    const reader = recordBody.getReader();
    let error: unknown = null;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) collector.push(decoder.decode(value, { stream: true }));
      }
      collector.push(decoder.decode());
    } catch (e) {
      error = e;
    }
    await onComplete({ ...collector.finish(), error });
  })();
  return { clientBody, recording };
}

const encoder = new TextEncoder();

/** One SSE data line. */
export function sseData(payload: unknown): string {
  return `data: ${typeof payload === "string" ? payload : JSON.stringify(payload)}\n\n`;
}

/**
 * A stored reply played back in the OpenAI delta shape the pages already
 * read, for a retried message whose reply is already stored (no second
 * model call, no second reply).
 */
export function sseReplayText(text: string): string {
  return sseData({ choices: [{ index: 0, delta: { content: text }, finish_reason: null }] }) +
    sseData({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) +
    sseData("[DONE]");
}

/**
 * `body` with one leading SSE line, `{"assessment": …}`, that tells a new
 * page what was recorded. The pages' parsers read only
 * `choices[0].delta.content`, so a page on the previous build skips it.
 */
export function withLeadingSse(body: ReadableStream<Uint8Array> | string, payload: unknown): ReadableStream<Uint8Array> {
  const head = encoder.encode(sseData(payload));
  if (typeof body === "string") {
    const bytes = encoder.encode(body);
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(head);
        controller.enqueue(bytes);
        controller.close();
      },
    });
  }
  const reader = body.getReader();
  let sentHead = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!sentHead) {
        sentHead = true;
        controller.enqueue(head);
        return;
      }
      try {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else if (value) controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

const RESOLVED_MARKER = "[RESOLVED]";

/** The chat-practice customer's hidden end marker, removed (as the page removes it). */
export function stripResolvedMarker(text: string): { content: string; resolved: boolean } {
  if (!text.includes(RESOLVED_MARKER)) return { content: text, resolved: false };
  return { content: text.split(RESOLVED_MARKER).join("").trim(), resolved: true };
}

/** ChatInterviewPhase.tsx's own test for the interviewer's closing message. */
const INTERVIEW_CLOSING_PHRASES = [
  "take care",
  "be in touch with next steps",
  "best of luck",
  "good luck",
  "thank you for your time today",
];

export function isInterviewClosingMessage(text: string): boolean {
  const lower = text.toLowerCase();
  return INTERVIEW_CLOSING_PHRASES.some((phrase) => lower.includes(phrase)) && !lower.includes("?");
}

export type ReplyStyle = "customer" | "interviewer";

/**
 * Pure: what is stored for a streamed reply, or null when there is nothing
 * to store (the stream produced no text). The customer's [RESOLVED] marker
 * becomes `resolved: true`; the interviewer's closing message becomes
 * `closed: true`; a stream that broke off is kept, marked `incomplete`.
 */
export function assistantTurnFromStream(
  result: CollectedStream & { error?: unknown },
  options: { style: ReplyStyle; model: string },
): { content: string; detail: Record<string, unknown> } | null {
  if (!result.text.trim()) return null;
  const detail: Record<string, unknown> = { role: options.style, model: options.model };
  let content = result.text;
  if (options.style === "customer") {
    const stripped = stripResolvedMarker(content);
    content = stripped.content;
    if (stripped.resolved) detail.resolved = true;
  } else if (isInterviewClosingMessage(content)) {
    detail.closed = true;
  }
  if (!result.done || result.error) detail.incomplete = true;
  return { content: clampContent(content), detail };
}

/** The text a stored reply is played back as: the marker goes back on, as the page expects it. */
export function replayTextFor(turn: StoredTurn): string {
  return turn.detail.resolved === true ? `${turn.content} ${RESOLVED_MARKER}` : turn.content;
}

/**
 * Runs `task` after the response when the runtime allows it
 * (EdgeRuntime.waitUntil keeps the worker alive for it); elsewhere it simply
 * runs. Never throws.
 */
export function runAfterResponse(label: string, task: Promise<unknown>): void {
  const guarded = task.catch((error) => {
    console.error(`[assessment] ${label} failed:`, error);
  });
  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime && typeof runtime.waitUntil === "function") {
    runtime.waitUntil(guarded);
  }
}

/**
 * The browser's half of a streamed model reply, with the reply stored as
 * `assistant_turn` (client_msg_id `opener` or `reply:<message id>`) once the
 * stream has ended, in the background. A stream that produced nothing, or a
 * reply that could not be stored, leaves a `reply_failed` marker, so a
 * message sent again is answered at once instead of waiting for a reply that
 * will never come (awaitInFlightReply).
 */
export function teeAndRecordReply(
  admin: AssessmentAdmin,
  body: ReadableStream<Uint8Array>,
  options: { sessionId: string; clientMsgId: string; style: ReplyStyle; model: string },
): ReadableStream<Uint8Array> {
  const forId = forIdOfReply(options.clientMsgId);
  const { clientBody, recording } = teeForRecording(body, async (result) => {
    const turn = assistantTurnFromStream(result, { style: options.style, model: options.model });
    if (!turn) {
      console.warn("[assessment] reply produced no text; nothing stored", { error: String(result.error ?? "") });
      await markReplyFailed(admin, options.sessionId, forId, result.error ? `stream: ${String(result.error)}` : "no_text");
      return;
    }
    const saved = await insertEvent(admin, {
      sessionId: options.sessionId,
      kind: "assistant_turn",
      content: turn.content,
      clientMsgId: options.clientMsgId,
      detail: turn.detail,
    });
    if (saved.error) {
      console.error("[assessment] reply not saved:", errorText(saved.error));
      await markReplyFailed(admin, options.sessionId, forId, `not_saved: ${errorText(saved.error)}`);
    } else if (!saved.inserted) {
      // Only after the window: an earlier ask landed first; the record keeps that one.
      console.warn("[assessment] a second reply was not stored; the first one is on file", { reply: options.clientMsgId });
    }
  });
  runAfterResponse("saving the reply", recording);
  return clientBody;
}

/** The JSON a "start" answers with when the attempt already has turns (a reload). */
export function resumePayload(session: SessionRow, turns: readonly StoredTurn[], extra: Record<string, unknown> = {}) {
  return {
    resumed: true,
    assessment: { recorded: true, session_id: session.id, attempt: session.attempt },
    turns: turns.map((turn) => ({
      seq: turn.seq,
      role: turn.kind === "candidate_turn" ? "user" : "assistant",
      content: turn.content,
      client_msg_id: turn.client_msg_id,
      created_at: turn.created_at,
      ...(turn.detail.resolved === true ? { resolved: true } : {}),
      ...(turn.detail.closed === true ? { closed: true } : {}),
    })),
    ...extra,
  };
}

// ============================================================================
// Grading from the record
// ============================================================================

function requestMessages(value: unknown): TranscriptMessage[] {
  if (!Array.isArray(value)) return [];
  const out: TranscriptMessage[] = [];
  for (const item of value) {
    const m = asObject(item);
    if ((m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") continue;
    const timestamp = cleanClientAt(m.timestamp);
    out.push({ role: m.role, content: m.content, ...(timestamp ? { timestamp } : {}) });
  }
  return out;
}

export interface ChosenTranscript {
  source: "stored" | "request";
  messages: TranscriptMessage[];
  storedTurns: number;
  requestTurns: number;
}

/**
 * Pure: which transcript is graded. The stored turns, whenever the record
 * holds at least one of the applicant's own messages (the server saw every
 * one of those before the model answered it). Otherwise the transcript the
 * page sent: a page on the previous build, which never recorded turns.
 */
export function chooseTranscript(stored: readonly StoredTurn[] | null, requestBody: unknown): ChosenTranscript {
  const fromRequest = requestMessages(requestBody);
  const turns = stored ?? [];
  if (turns.some((t) => t.kind === "candidate_turn")) {
    return { source: "stored", messages: turnsToTranscript(turns), storedTurns: turns.length, requestTurns: fromRequest.length };
  }
  return { source: "request", messages: fromRequest, storedTurns: turns.length, requestTurns: fromRequest.length };
}

/**
 * Pure: the part of the page's transcript the record does not have, when the
 * page did not record the applicant's turns (a page on the previous build,
 * or one whose turn calls all failed). Null when the record has any of the
 * applicant's own turns (a live record is never extended with turns the
 * server did not see arrive), or when what is stored is not the start of
 * what the page sent. `offset` is where the tail starts in the page's list.
 */
export function unstoredTail(
  stored: readonly StoredTurn[],
  requestBody: unknown,
): { offset: number; messages: TranscriptMessage[] } | null {
  if (stored.some((t) => t.kind === "candidate_turn")) return null;
  const sent = requestMessages(requestBody);
  if (stored.length > sent.length) return null;
  for (let i = 0; i < stored.length; i++) {
    const turn = stored[i];
    const role = turn.kind === "candidate_turn" ? "user" : "assistant";
    if (sent[i].role !== role || sent[i].content.trim() !== turn.content.trim()) return null;
  }
  return { offset: stored.length, messages: sent.slice(stored.length) };
}

/**
 * Stores a transcript the page sent at submit time (a page on the previous
 * build kept the conversation only in the browser), so the hiring team
 * still has it: the tail unstoredTail found, marked
 * `source: "submitted_transcript"`. One insert, in order; a retried submit
 * inserts nothing (`submit:<position>` ids).
 */
export async function storeSubmittedTranscript(
  admin: AssessmentAdmin,
  sessionId: string,
  tail: { offset: number; messages: readonly TranscriptMessage[] },
  roles: { candidate: "agent" | "candidate"; assistant: ReplyStyle },
): Promise<boolean> {
  const rows = tail.messages.slice(0, 400).map((m, index) => ({ m, position: tail.offset + index }))
    .filter(({ m }) => m.content.trim())
    .map(({ m, position }) =>
      eventRow({
        sessionId,
        kind: m.role === "user" ? "candidate_turn" : "assistant_turn",
        content: m.content,
        clientMsgId: `submit:${position}`,
        clientAt: m.timestamp ?? null,
        detail: { role: m.role === "user" ? roles.candidate : roles.assistant, source: "submitted_transcript" },
      })
    );
  if (rows.length === 0) return true;
  const res = await settle(() => admin.from("assessment_events").insert(rows));
  if (res.error) {
    console.error("[assessment] submitted transcript not stored:", errorText(res.error));
    return false;
  }
  return true;
}

// ---------------------------------------------------------------- integrity

export interface IntegrityEventRow {
  seq: number;
  detail: Record<string, unknown>;
  duration_ms: number | null;
  client_at: string | null;
  created_at: string | null;
}

export async function loadIntegrityEvents(admin: AssessmentAdmin, sessionId: string): Promise<IntegrityEventRow[] | null> {
  const res = await settle(() =>
    admin
      .from("assessment_events")
      .select("seq, detail, duration_ms, client_at, created_at")
      .eq("session_id", sessionId)
      .eq("kind", "integrity")
      .order("seq", { ascending: true }),
  );
  if (res.error || !Array.isArray(res.data)) {
    if (res.error) console.error("[assessment] integrity events not readable:", errorText(res.error));
    return null;
  }
  return res.data.map((row) => {
    const r = asObject(row);
    const duration = Number(r.duration_ms);
    return {
      seq: Number(r.seq),
      detail: asObject(r.detail),
      duration_ms: r.duration_ms == null || !Number.isFinite(duration) ? null : duration,
      client_at: typeof r.client_at === "string" ? r.client_at : null,
      created_at: typeof r.created_at === "string" ? r.created_at : null,
    };
  });
}

/** The shape every existing notes result keeps its violations in. */
export interface LegacyViolation {
  type: string;
  timestamp: string;
  details: string;
}

/** "1m 12s", "45s", "1h 5m": public.assessment_duration_text, in TypeScript. */
export function durationText(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 1000) return "under 1s";
  const whole = Math.floor(ms);
  if (whole < 60_000) return `${Math.floor(whole / 1000)}s`;
  if (whole < 3_600_000) {
    const seconds = Math.floor((whole % 60_000) / 1000);
    return `${Math.floor(whole / 60_000)}m${seconds > 0 ? ` ${seconds}s` : ""}`;
  }
  const minutes = Math.floor((whole % 3_600_000) / 60_000);
  return `${Math.floor(whole / 3_600_000)}h${minutes > 0 ? ` ${minutes}m` : ""}`;
}

/** Integrity kinds (docs/ASSESSMENT-RECORD.md §3.1) in the old notes' violation types. */
const LEGACY_TYPE: Record<string, string> = {
  tab_hidden: "tab_switch",
  window_blur: "tab_switch",
  copy: "copy_attempt",
  cut: "copy_attempt",
  paste: "paste_attempt",
  bulk_insert: "paste_attempt",
  screenshot_key: "screenshot_attempt",
  screenshot_suspected: "screenshot_attempt",
  right_click: "right_click",
  devtools: "devtools",
  page_closed: "page_closed",
};

/** Away episodes shorter than this are on the timeline but are not counted (the owner's card rule). */
const SHORT_AWAY_MS = 1000;

function violationDetails(kind: string, row: IntegrityEventRow): string {
  switch (kind) {
    case "tab_hidden":
      return `Left the test page for ${durationText(row.duration_ms)}`;
    case "window_blur":
      return `Left the test window for ${durationText(row.duration_ms)}`;
    case "copy":
      return "Tried to copy";
    case "cut":
      return "Tried to cut";
    case "paste":
      return "Tried to paste";
    case "bulk_insert":
      return row.detail.via === "drop" ? "Text was dropped in" : "Text arrived all at once (pasted in)";
    case "screenshot_key":
      return "Pressed the screenshot key";
    case "screenshot_suspected":
      return "Possible screenshot";
    case "right_click":
      return "Right-clicked";
    case "devtools":
      return "Developer tools opened";
    case "page_closed":
      return "Closed or reloaded the test page";
    default: {
      const what = typeof row.detail.what === "string" ? row.detail.what : null;
      const key = typeof row.detail.key === "string" ? row.detail.key : null;
      const reported = typeof row.detail.reported_kind === "string" ? row.detail.reported_kind : null;
      return [what, key, reported].filter(Boolean).join(" ") || "Other";
    }
  }
}

/**
 * Pure: the recorded integrity events as the old notes violations, for the
 * notes summaries every current reader uses (antiCheatSummary, violations).
 * Away blips under a second and events sent after the test ended (the flush
 * from a closing tab) are left out of these counts, as they are on the
 * owner's card; the timeline keeps them.
 */
export function integrityEventsToViolations(rows: readonly IntegrityEventRow[]): LegacyViolation[] {
  const out: LegacyViolation[] = [];
  for (const row of rows) {
    if (row.detail.after_end === true) continue;
    const kind = typeof row.detail.kind === "string" ? row.detail.kind : "other";
    if ((kind === "tab_hidden" || kind === "window_blur") && row.duration_ms != null && row.duration_ms < SHORT_AWAY_MS) continue;
    out.push({
      type: LEGACY_TYPE[kind] ?? "other",
      timestamp: row.client_at ?? row.created_at ?? "",
      details: violationDetails(kind, row),
    });
  }
  return out;
}

/** The request's own list, as the page sent it (only non-objects dropped):
 *  the notes keep exactly what they kept before for a page on the previous
 *  build. */
function requestViolations(value: unknown): LegacyViolation[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => isPlainObject(item)) as unknown as LegacyViolation[];
}

/**
 * Pure: whose integrity record the notes summary is built from. The events
 * the page recorded (record_integrity_events), whenever there are any; a
 * page on the previous build never records them and sends its own list in
 * the request, which is used then.
 */
export function chooseIntegrity(
  rows: readonly IntegrityEventRow[] | null,
  requestBody: unknown,
): { source: "events" | "request"; violations: LegacyViolation[] } {
  if (rows && rows.length > 0) return { source: "events", violations: integrityEventsToViolations(rows) };
  return { source: "request", violations: requestViolations(requestBody) };
}

// ---------------------------------------------------------------- status

/**
 * A grading claim older than this belongs to a request that died: no edge
 * function runs past 400 s, and a live grading only moves updated_at forward.
 */
export const STALE_GRADING_MS = 7 * 60_000;

/** How long a second submit waits for the request already grading the attempt. */
export const GRADING_WAIT_MS = 45_000;

export type ClaimPlan = "claim" | "take_over" | "wait";

/**
 * Pure: how to claim an attempt for grading. An open one (active, left, or
 * failed: the server still owes it) is claimed by compare-and-set on its
 * status; one already being graded is waited on, unless that claim is stale
 * (its request died), when it is taken over.
 */
export function planClaim(status: string, updatedAt: string | null, nowMs: number, staleMs = STALE_GRADING_MS): ClaimPlan {
  if (status === "active" || status === "failed" || status === "abandoned") return "claim";
  if (status === "grading") {
    const at = updatedAt ? Date.parse(updatedAt) : NaN;
    return Number.isFinite(at) && nowMs - at >= staleMs ? "take_over" : "wait";
  }
  return "wait";
}

export type ClaimResult =
  | { kind: "claimed"; fromStatus: string }
  | { kind: "taken"; status: string | null }
  | { kind: "unavailable" };

export async function readSessionState(
  admin: AssessmentAdmin,
  sessionId: string,
): Promise<{ status: string; updated_at: string | null } | null> {
  const res = await settle(() => admin.from("assessment_sessions").select("status, updated_at").eq("id", sessionId).maybeSingle());
  if (res.error || !isPlainObject(res.data) || typeof res.data.status !== "string") return null;
  return { status: res.data.status, updated_at: typeof res.data.updated_at === "string" ? res.data.updated_at : null };
}

/**
 * The claim itself (docs/ASSESSMENT-RECORD.md §5.1.4): `-> grading` only if
 * the row still says what was read. No row back means another request got
 * there first ("taken"). A database error is "unavailable": the caller grades
 * as it did before the record existed.
 */
export async function claimForGrading(
  admin: AssessmentAdmin,
  session: Pick<SessionRow, "id" | "status" | "updated_at">,
  options: { now?: () => number; staleMs?: number } = {},
): Promise<ClaimResult> {
  const nowMs = (options.now ?? Date.now)();
  const staleMs = options.staleMs ?? STALE_GRADING_MS;
  const plan = planClaim(session.status, session.updated_at, nowMs, staleMs);
  if (plan === "wait") return { kind: "taken", status: session.status };
  const res = await settle(() =>
    plan === "claim"
      ? admin.from("assessment_sessions").update({ status: "grading" }).eq("id", session.id).eq("status", session.status).select("id")
      : admin
        .from("assessment_sessions")
        .update({ status: "grading" })
        .eq("id", session.id)
        .eq("status", "grading")
        .lt("updated_at", new Date(nowMs - staleMs).toISOString())
        .select("id")
  );
  if (res.error) {
    console.error("[assessment] grading claim failed:", errorText(res.error));
    return { kind: "unavailable" };
  }
  if (Array.isArray(res.data) && res.data.length > 0) {
    if (plan === "take_over") console.warn("[assessment] took over a stale grading claim", { session: session.id });
    return { kind: "claimed", fromStatus: session.status };
  }
  const current = await readSessionState(admin, session.id);
  return { kind: "taken", status: current?.status ?? null };
}

/** Polls an attempt being graded by another request until it leaves "grading" (or the wait ends). */
export async function awaitGradingOutcome(
  admin: AssessmentAdmin,
  sessionId: string,
  options: { maxWaitMs?: number; intervalMs?: number } = {},
): Promise<{ status: string; updated_at: string | null } | null> {
  const deadline = Date.now() + (options.maxWaitMs ?? GRADING_WAIT_MS);
  let state = await readSessionState(admin, sessionId);
  while (state?.status === "grading" && Date.now() < deadline) {
    await sleep(Math.min(options.intervalMs ?? 1000, deadline - Date.now()));
    state = (await readSessionState(admin, sessionId)) ?? state;
  }
  return state;
}

/**
 * Whether this request may grade, decided before anything is spent:
 *   - go, claimed: this request holds the attempt; only it completes it.
 *   - go, none: no record (a page on the previous build, the migration not
 *     applied, a database error): grade as before.
 *   - on_file: the result is already recorded (the step is finished, or the
 *     request that was grading it has just finished). Answer with it; never
 *     grade a request body over it.
 *   - checking: another request is still grading it after the wait.
 */
export type GradingGate =
  | { go: true; claim: "claimed" | "none"; fromStatus: string | null }
  | { go: false; why: "on_file" | "checking" };

export async function gateGrading(
  admin: AssessmentAdmin,
  session: SessionRow | null,
  noSessionReason: NoSessionReason | null,
  options: { now?: () => number; staleMs?: number; maxWaitMs?: number; intervalMs?: number } = {},
): Promise<GradingGate> {
  if (!session) {
    return noSessionReason === "step_finished" ? { go: false, why: "on_file" } : { go: true, claim: "none", fromStatus: null };
  }
  const first = await claimForGrading(admin, session, options);
  if (first.kind === "claimed") return { go: true, claim: "claimed", fromStatus: first.fromStatus };
  if (first.kind === "unavailable") return { go: true, claim: "none", fromStatus: null };

  // Another request is grading it: wait for that one to finish.
  const settled = await awaitGradingOutcome(admin, session.id, options);
  if (!settled || settled.status === "grading") return { go: false, why: "checking" };
  if (settled.status === "completed") return { go: false, why: "on_file" };
  // It let go (the step refused the result, or the grading crashed): one more claim.
  const second = await claimForGrading(admin, { id: session.id, status: settled.status, updated_at: settled.updated_at }, options);
  if (second.kind === "claimed") return { go: true, claim: "claimed", fromStatus: second.fromStatus };
  if (second.kind === "unavailable") return { go: true, claim: "none", fromStatus: null };
  return { go: false, why: "checking" };
}

/** Puts a claimed attempt back the way it was (the step refused the result). */
export async function releaseGrading(admin: AssessmentAdmin, sessionId: string, previousStatus: string): Promise<void> {
  const back = previousStatus === "grading" ? "active" : previousStatus;
  const res = await settle(() => admin.from("assessment_sessions").update({ status: back }).eq("id", sessionId).eq("status", "grading"));
  if (res.error) console.error("[assessment] grading claim not released:", errorText(res.error));
}

/**
 * The result is on file: the attempt is complete, with the full grading.
 * `fromStatuses` is what the row may say before: "grading" when this request
 * holds the claim (the default), the open statuses when the claim could not
 * be made at all. Tried twice; a second failure leaves the attempt in
 * "grading" with no grading stored, and says so loudly in the log.
 */
export async function completeSession(
  admin: AssessmentAdmin,
  sessionId: string,
  grading: Record<string, unknown>,
  endReason: string,
  fromStatuses: readonly string[] = ["grading"],
  options: { retryDelayMs?: number } = {},
): Promise<boolean> {
  const write = () =>
    settle(() =>
      admin
        .from("assessment_sessions")
        .update({
          status: "completed",
          grading: cleanJson(grading),
          end_reason: endReason.slice(0, 64),
          ended_at: new Date().toISOString(),
          hidden_at: null,
        })
        .eq("id", sessionId)
        .in("status", fromStatuses)
        .select("id")
    );
  let res = await write();
  if (res.error) {
    console.warn("[assessment] session not completed, trying again:", errorText(res.error));
    await sleep(options.retryDelayMs ?? 500);
    res = await write();
  }
  if (res.error) {
    console.error(
      "[assessment] SESSION LEFT UNFINISHED: the result is on file but the attempt was not completed and its grading is lost",
      { session: sessionId, error: errorText(res.error) },
    );
    return false;
  }
  return Array.isArray(res.data) && res.data.length > 0;
}

/** completeSession with the statuses the gate allows: only a held claim, or the open ones when no claim could be made. */
export function finishGrading(
  admin: AssessmentAdmin,
  sessionId: string,
  gate: { claim: "claimed" | "none" },
  grading: Record<string, unknown>,
  endReason: string,
): Promise<boolean> {
  return completeSession(admin, sessionId, grading, endReason, gate.claim === "claimed" ? ["grading"] : ["active", "failed", "abandoned"]);
}

/** Grading crashed: the server still owes this result. */
export async function failSession(admin: AssessmentAdmin, sessionId: string, message: string): Promise<void> {
  const res = await settle(() =>
    admin
      .from("assessment_sessions")
      .update({ status: "failed", grading: { last_error: message.slice(0, 2000), failed_at: new Date().toISOString() } })
      .eq("id", sessionId)
      .eq("status", "grading"),
  );
  if (res.error) console.error("[assessment] session not marked failed:", errorText(res.error));
}

/**
 * The result already on file for a step, and what the applicant sees next:
 * the answer to a submit that must not grade again. Deliberately not the
 * applications.phase_ai_analysis column: the hiring team's own analysis
 * overwrites it (a decline note included), and this goes to the applicant.
 */
export interface StepOnFile {
  result: unknown;
  next: { id: string; type: string; title: string } | "waiting";
}

export async function readStepOnFile(
  admin: AssessmentAdmin,
  applicationId: string,
  stepId: string,
  resultKey: string,
): Promise<StepOnFile | null> {
  const appRes = await settle(() =>
    admin.from("applications").select("phase, notes, job_id").eq("id", applicationId).maybeSingle(),
  );
  if (appRes.error || !isPlainObject(appRes.data)) {
    if (appRes.error) console.error("[assessment] application not readable:", errorText(appRes.error));
    return null;
  }
  const app = appRes.data;
  const jobId = app.job_id;
  const jobRes = typeof jobId === "string"
    ? await settle(() => admin.from("jobs").select("processing_mode, workflow_steps, quiz_questions").eq("id", jobId).maybeSingle())
    : { data: null, error: null };
  const job = asObject(jobRes.data);
  const quiz = job.quiz_questions;
  const steps = buildCandidateJourney(
    (Array.isArray(job.workflow_steps) ? job.workflow_steps : []) as WorkflowStepLike[],
    { hasQuiz: Array.isArray(quiz) && quiz.length > 0 },
  );
  const decision = computeNextStepDecision(
    steps,
    stepId,
    typeof app.phase === "string" ? app.phase : null,
    typeof job.processing_mode === "string" ? job.processing_mode : null,
  );
  return {
    result: parseNotesObject(app.notes)[resultKey] ?? null,
    next: nextStepForCandidate(decision),
  };
}

/** session.grading (docs/ASSESSMENT-RECORD.md §2.6) plus the step's own extras. */
export function gradingRecord(input: {
  model: string | null;
  promptVersion: string;
  fallback: boolean;
  result: unknown;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    graded_at: new Date().toISOString(),
    model: input.model,
    prompt_version: input.promptVersion,
    fallback: input.fallback,
    result: input.result,
    ...(input.extra ?? {}),
  };
}

/** Pure: why a chat-practice attempt ended. */
export function chatSimulationEndReason(stored: readonly StoredTurn[] | null): "customer_resolved" | "submitted" {
  const lastReply = [...(stored ?? [])].reverse().find((t) => t.kind === "assistant_turn");
  return lastReply?.detail.resolved === true ? "customer_resolved" : "submitted";
}

/**
 * Pure: why a written interview ended. The interviewer's own closing
 * ("auto_end"); the End button after the interviewer had already closed;
 * or the End button before that: ended early, graded on what exists.
 */
export function interviewEndReason(
  path: "auto_end" | "manual",
  messages: readonly TranscriptMessage[],
): "ai_closed" | "submitted" | "ended_early" {
  if (path === "auto_end") return "ai_closed";
  const lastReply = [...messages].reverse().find((m) => m.role === "assistant");
  return lastReply && isInterviewClosingMessage(lastReply.content) ? "submitted" : "ended_early";
}

/** ChatInterviewPhase.tsx's own question count: interviewer messages with a "?". */
export function interviewQuestionCount(messages: readonly TranscriptMessage[]): number {
  return messages.filter((m) => m.role === "assistant" && m.content.includes("?")).length;
}

// ============================================================================
// Typing test
// ============================================================================

const MAX_TYPED = 20_000;
const MAX_RUNS_KEPT = 20;

/**
 * The idempotency key of a typing run's end snapshot. A run is named by its
 * server start time (typing_test_starts.started_at), which "complete" and
 * "submit" both read back from the same row.
 */
export function typingRunKey(startedAt: unknown): string | null {
  const ms = typeof startedAt === "string" ? Date.parse(startedAt) : NaN;
  return Number.isFinite(ms) ? `snap:${ms}:end` : null;
}

/** Snapshots while typing: one per 5 s of the run, only in its first 5 minutes. */
const SNAPSHOT_BUCKET_MS = 5_000;
const SNAPSHOT_WINDOW_MS = 5 * 60_000;

/**
 * Pure: the idempotency key of a while-typing snapshot, or null when none is
 * taken (no run, or the run is older than 5 minutes: the test lasts 60 s).
 * At most one is stored per 5-second slice of the run, so a page that sends
 * them too often stores no more.
 */
export function typingProgressKey(startedAt: unknown, elapsedMs: number): string | null {
  const ms = typeof startedAt === "string" ? Date.parse(startedAt) : NaN;
  if (!Number.isFinite(ms) || !Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > SNAPSHOT_WINDOW_MS) return null;
  return `snap:${ms}:${Math.floor(elapsedMs / SNAPSHOT_BUCKET_MS)}`;
}

interface TypingRun {
  run: number;
  started_at: string;
  target_text: string;
}

function typingRuns(context: Record<string, unknown>): TypingRun[] {
  if (!Array.isArray(context.runs)) return [];
  return context.runs.filter((r): r is TypingRun => isPlainObject(r) && typeof r.run === "number" && typeof r.started_at === "string");
}

/**
 * Pure: the session context after a "start" (a first run or a "Try again"):
 * the passage and the speed target the server picked, and the runs so far.
 */
export function nextTypingContext(
  context: Record<string, unknown>,
  run: { targetText: string; requiredWpm: number; startedAt: string },
): { context: Record<string, unknown>; run: number } {
  const runs = typingRuns(context);
  const last = runs.length ? runs[runs.length - 1].run : 0;
  const number = Math.max(last, runs.length) + 1;
  const kept = [...runs, { run: number, started_at: run.startedAt, target_text: run.targetText }].slice(-MAX_RUNS_KEPT);
  return {
    context: {
      ...context,
      target_text: run.targetText,
      required_wpm: run.requiredWpm,
      run: number,
      run_started_at: run.startedAt,
      runs: kept,
    },
    run: number,
  };
}

/** Pure: which run a start time belongs to, if the context has it. */
export function typingRunFor(context: Record<string, unknown>, startedAt: unknown): number | null {
  const ms = typeof startedAt === "string" ? Date.parse(startedAt) : NaN;
  if (!Number.isFinite(ms)) return null;
  const match = typingRuns(context).find((r) => Date.parse(r.started_at) === ms);
  return match ? match.run : null;
}

/** Pure: how many runs the applicant started before submitting (at least 1). */
export function typingAttempts(context: Record<string, unknown>): number {
  const runs = typingRuns(context);
  const last = runs.length ? runs[runs.length - 1].run : 0;
  return Math.max(1, last, runs.length);
}

/**
 * Pure: the words that do not match the passage, by the same word-by-word
 * rule the score uses (calculateResults.ts): word i of what was typed
 * against word i of the passage.
 */
export function typingWordErrors(
  typedText: string,
  targetText: string,
  cap = 200,
): Array<{ index: number; expected: string | null; typed: string }> {
  const typedWords = typedText.trim().split(/\s+/).filter((w) => w.length > 0);
  const targetWords = targetText.trim().split(/\s+/).filter((w) => w.length > 0);
  const errors: Array<{ index: number; expected: string | null; typed: string }> = [];
  for (let i = 0; i < typedWords.length && errors.length < cap; i++) {
    const expected = i < targetWords.length ? targetWords[i] : null;
    if (typedWords[i] !== expected) errors.push({ index: i, expected, typed: typedWords[i] });
  }
  return errors;
}

/** Pure: a typing_snapshot event's detail (docs/ASSESSMENT-RECORD.md §3). */
export function typingSnapshotDetail(input: {
  typedText: string;
  targetText: string | null;
  wpm: number | null;
  accuracy: number | null;
  elapsedMs: number | null;
  final: boolean;
  run: number | null;
  endedBy?: string | null;
  textSource?: "complete" | "request" | null;
}): Record<string, unknown> {
  return {
    typed_text: input.typedText.slice(0, MAX_TYPED),
    ...(input.targetText != null ? { target_text: input.targetText } : {}),
    wpm: input.wpm,
    accuracy: input.accuracy,
    elapsed_ms: input.elapsedMs,
    final: input.final,
    ...(input.run != null ? { attempt_run: input.run } : {}),
    ...(input.endedBy ? { ended_by: input.endedBy } : {}),
    ...(input.textSource ? { text_source: input.textSource } : {}),
  };
}

/** How a typing run ended, as the page says it ("complete" `reason`). */
export function cleanTypingEndedBy(value: unknown): "time_up" | "finished_early" | null {
  return value === "time_up" || value === "finished_early" ? value : null;
}

/**
 * Pure: the text that is graded. The text stored when typing stopped (the
 * page sends it with "complete"), whenever it was stored; otherwise what
 * "submit" carries (a page on the previous build sends it only there).
 */
export function chooseTypedText(storedDetail: Record<string, unknown> | null, requestTypedText: unknown): {
  text: string;
  source: "complete" | "request";
} {
  if (storedDetail && typeof storedDetail.typed_text === "string") {
    return { text: storedDetail.typed_text, source: "complete" };
  }
  return { text: typeof requestTypedText === "string" ? requestTypedText.slice(0, MAX_TYPED) : "", source: "request" };
}

/** Pure: the end reason of a typing attempt. The test runs for 60 s. */
export function typingEndReason(endedBy: unknown, elapsedMs: number): "time_up" | "submitted" {
  if (endedBy === "time_up") return "time_up";
  if (endedBy === "finished_early") return "submitted";
  return elapsedMs >= 60_000 ? "time_up" : "submitted";
}
