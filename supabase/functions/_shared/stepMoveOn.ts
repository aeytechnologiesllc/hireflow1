/**
 * stepMoveOn.ts — the server asks for the next step itself, so the end of a
 * test never depends on the applicant's tab (docs/ASSESSMENT-RECORD.md
 * §5.1.9).
 *
 * In an auto-mode job a test's result is recorded by the function that
 * grades it (submit-typing-test, ai-chat-simulation "evaluate",
 * ai-chat-interview "submit", submit-sales-simulation; all with
 * recordStepResult's advance: "never"). Moving the applicant on, Ava's score
 * and, before a voice interview, the employer's heads-up all come from ONE
 * place: trigger-ava-analysis's auto path (handleAutoModeStep). Until
 * 2026-10-06 only the applicant's page asked for it, right after its submit
 * answered. Grading runs inside the submit request and takes seconds, so a
 * tab closed meanwhile left the result on file and the applicant on the step
 * for good: nobody moved them on and Ava never scored them.
 *
 * So, once a result is recorded, the grading function calls
 * scheduleStepMoveOn, which runs runStepMoveOn in the background
 * (EdgeRuntime.waitUntil) and never touches the submit's answer. It asks
 * trigger-ava-analysis with the SAME candidate JWT the request carried
 * (trigger-ava-analysis accepts only a user JWT, and its auto path is the
 * candidate's own request either way), with exactly the body the page sends:
 * {applicationId, autopilotDecision: true, currentPhaseId: stepId}.
 *
 * WHY IT WAITS INSTEAD OF ASKING AT ONCE. trigger-ava-analysis's move is
 * idempotent (a compare-and-set on `phase`; a repeat reads
 * "already_advanced"), but the analysis it starts is not, for its first ~40
 * seconds: a repeat is told apart only once a stored analysis has read this
 * step's result (analysisCoversStep), and that is saved when the run ENDS.
 * Asking at the same moment as the page would run Ava's analysis twice (two
 * model runs) on every auto-mode step and, before a voice interview, send
 * the employer two "ready for interview" notices and emails. So:
 *
 *   1. At once: is the job in auto mode, read from the database? If not,
 *      nothing (a manual job's page asks with autopilotDecision: false; the
 *      manual path with autopilotDecision: true would park or move people).
 *   2. After GRACE (20 s; the page asks within a second or two of the
 *      submit's answer, and once more 3 s later if that reply was not
 *      final), read the application again and plan the move exactly as
 *      trigger-ava-analysis will (planAutoAdvance):
 *        - "advance": still on the step, so nobody has asked: ask now.
 *        - "already_advanced": the page's request moved them, and that
 *          request started the analysis: nothing to do.
 *        - "needs_employer_approval": the next step is a voice interview the
 *          employer sets up, so the phase never moves and the page's request
 *          leaves no trace until its analysis is saved: look again at LATE.
 *        - refused (a manual job now, closed, moved elsewhere, no result):
 *          nothing.
 *   3. At LATE (75 s; the analysis takes 37-47 s), ask unless an analysis
 *      that started after the result is saved (analysisCoversStep) or the
 *      employer's interview notice for this application is already there
 *      (it is sent after the analysis even when the analysis failed).
 *
 * Both waits are cut short so the ask is made while the JWT is still valid
 * (its `exp`, read here only for timing: the function verified the token
 * with auth.getUser before anything was recorded). A failed ask (network,
 * timeout, 5xx) is tried once more, after reading the application again.
 * Nothing here ever throws, blocks or fails the submit's answer. The usual
 * case keeps the worker 20 s past the submit (75 s before a voice
 * interview); the worst (two failed asks before a voice interview) about two
 * minutes. The edge runtime's wall clock is 400 s on paid plans, 150 s on
 * free (where a slow grading plus that worst case could be cut off, and the
 * move lost as it was before this module).
 *
 * Imports only the other zero-dependency shared modules, so it runs under
 * plain Node (scripts/assessment_session_server*.test.mjs) as well as Deno.
 */

import { buildCandidateJourney, type WorkflowStepLike } from "./candidateJourney.ts";
import { analysisCoversStep, parseNotesObject, planAutoAdvance, type AutoAdvancePlan } from "./trustedResults.ts";
import { isUuid, runAfterResponse, type AssessmentAdmin, type RestError } from "./assessmentSession.ts";

// ============================================================================
// Timing
// ============================================================================

export interface MoveOnTiming {
  /** The first look, after the result: the page has asked by then if it is open. */
  graceMs: number;
  /** The second look, only when the next step waits on the employer. */
  lateMs: number;
  /** Ask at least this long before the JWT expires. */
  tokenMarginMs: number;
  /** How long one ask may take (the auto path answers in a second or two). */
  askTimeoutMs: number;
  /** The pause before a failed ask is tried once more. */
  retryDelayMs: number;
}

export const MOVE_ON_TIMING: Readonly<MoveOnTiming> = Object.freeze({
  graceMs: 20_000,
  lateMs: 75_000,
  tokenMarginMs: 15_000,
  askTimeoutMs: 20_000,
  retryDelayMs: 3_000,
});

function timingWith(overrides: Partial<MoveOnTiming> | undefined): MoveOnTiming {
  return { ...MOVE_ON_TIMING, ...(overrides ?? {}) };
}

/**
 * Pure: when to look. `lateAtMs === firstAtMs` means the first look is the
 * last chance (the token would expire before the late one).
 */
export function moveOnTimes(input: {
  startMs: number;
  tokenExpiresAtMs: number | null;
  timing?: Partial<MoveOnTiming>;
}): { firstAtMs: number; lateAtMs: number } {
  const t = timingWith(input.timing);
  const deadline = input.tokenExpiresAtMs == null ? Infinity : input.tokenExpiresAtMs - t.tokenMarginMs;
  const firstAtMs = Math.max(input.startMs, Math.min(input.startMs + t.graceMs, deadline));
  const lateAtMs = Math.max(firstAtMs, Math.min(input.startMs + t.lateMs, deadline));
  return { firstAtMs, lateAtMs };
}

// ============================================================================
// The request
// ============================================================================

export interface JwtClaims {
  sub: string | null;
  role: string | null;
  /** Seconds since the epoch, as in the token. */
  exp: number | null;
}

function base64UrlToText(part: string): string {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * Pure: the claims of a "Bearer <jwt>" header, UNVERIFIED. Used only to tell
 * a user token from none and to time the ask before it expires; the caller
 * has already verified the token (auth.getUser) before recording anything.
 */
export function jwtClaims(authorization: string | null | undefined): JwtClaims | null {
  if (typeof authorization !== "string") return null;
  const match = /^Bearer\s+([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]*)$/i.exec(authorization.trim());
  if (!match) return null;
  try {
    const payload = JSON.parse(base64UrlToText(match[2]));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return {
      sub: typeof payload.sub === "string" && payload.sub ? payload.sub : null,
      role: typeof payload.role === "string" ? payload.role : null,
      exp: typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp : null,
    };
  } catch {
    return null;
  }
}

export interface StepMoveOnInput {
  applicationId: string;
  stepId: string;
  /** The request's own Authorization header, passed on unchanged. */
  authorization: string | null | undefined;
  /** Default: the SUPABASE_URL / SUPABASE_ANON_KEY the function runs with. */
  supabaseUrl?: string | null;
  anonKey?: string | null;
  /** jobs.processing_mode when the caller already read it from the database. */
  processingMode?: string | null;
}

export type MoveOnRequestCheck =
  | { schedule: true; tokenExpiresAtMs: number | null }
  | { schedule: false; why: "no_ids" | "no_user_token" | "not_configured" | "not_auto_mode" };

/**
 * Pure: whether a recorded result should be followed by the server's own ask.
 * Needs both ids, a signed-in user's JWT (one with a subject; the anon key is
 * not one), and where to ask. A caller that already read the job's
 * processing_mode passes it, so a manual job schedules nothing at all.
 */
export function moveOnRequest(input: StepMoveOnInput & { supabaseUrl: string | null; anonKey: string | null }): MoveOnRequestCheck {
  if (!isUuid(input.applicationId) || typeof input.stepId !== "string" || !input.stepId.trim()) {
    return { schedule: false, why: "no_ids" };
  }
  if (input.processingMode !== undefined && input.processingMode !== "auto") return { schedule: false, why: "not_auto_mode" };
  const claims = jwtClaims(input.authorization);
  if (!claims?.sub || claims.role === "anon") return { schedule: false, why: "no_user_token" };
  if (!input.supabaseUrl || !input.anonKey) return { schedule: false, why: "not_configured" };
  return { schedule: true, tokenExpiresAtMs: claims.exp == null ? null : claims.exp * 1000 };
}

/** Exactly what the applicant's page sends after a submit in an auto-mode job. */
export function moveOnRequestBody(applicationId: string, stepId: string) {
  return { applicationId, autopilotDecision: true, currentPhaseId: stepId };
}

// ============================================================================
// The decision
// ============================================================================

export interface MoveOnState {
  processingMode: string | null;
  plan: AutoAdvancePlan;
  /** A stored analysis started after this step's result (it has read it). */
  analysisCovered: boolean;
  /** The employer's "ready for interview" notice for this application, sent after the result. */
  noticeSent: boolean;
  /** notes._trusted[step].completedAt, when there is one. */
  resultAt: string | null;
}

export type MoveOnSkip =
  | "unreadable"
  | "not_auto_mode"
  | "already_moved_on"
  | "analysis_started"
  | "employer_notified"
  | "application_closed"
  | "not_on_step"
  | "result_missing"
  | "unknown_step";

export type MoveOnCheck = { action: "ask" } | { action: "look_again" } | { action: "skip"; why: MoveOnSkip };

/**
 * Pure: what one look at the application decides. See the module comment:
 * "advance" means nobody has asked yet; "already_advanced" means the page's
 * own request moved them (and started the analysis); a step before a voice
 * interview is asked about only when nothing shows the page's request ran,
 * and only at the last look.
 */
export function planMoveOnCheck(input: { state: MoveOnState | null; lastChance: boolean }): MoveOnCheck {
  const { state, lastChance } = input;
  if (!state) return { action: "skip", why: "unreadable" };
  if (state.processingMode !== "auto") return { action: "skip", why: "not_auto_mode" };
  const plan = state.plan;
  switch (plan.kind) {
    case "advance":
      return { action: "ask" };
    case "already_advanced":
      return { action: "skip", why: "already_moved_on" };
    case "needs_employer_approval":
      if (state.analysisCovered) return { action: "skip", why: "analysis_started" };
      if (state.noticeSent) return { action: "skip", why: "employer_notified" };
      return lastChance ? { action: "ask" } : { action: "look_again" };
    case "refused":
      switch (plan.reason) {
        case "not_auto_mode":
          return { action: "skip", why: "not_auto_mode" };
        case "application_closed":
          return { action: "skip", why: "application_closed" };
        case "phase_mismatch":
          return { action: "skip", why: "not_on_step" };
        case "result_missing":
          return { action: "skip", why: "result_missing" };
        default:
          return { action: "skip", why: "unknown_step" };
      }
    default:
      return { action: "skip", why: "unknown_step" };
  }
}

export interface TriggerAnswer {
  ok: boolean;
  /** Worth one more try (network, timeout, 429, 5xx). Never for a 4xx. */
  retry: boolean;
  /** trigger-ava-analysis's own `decision` ("advanced", "needs_employer_approval", "not_ready", "stale", ...). */
  decision: string | null;
}

/** Pure: how to read trigger-ava-analysis's answer. `status` null: no answer (network, timeout). */
export function readTriggerAnswer(status: number | null, body: unknown): TriggerAnswer {
  if (status === null) return { ok: false, retry: true, decision: null };
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const decision = typeof b.decision === "string" ? b.decision : b.skipped === true ? "skipped" : null;
  if (status >= 200 && status < 300) return { ok: true, retry: false, decision };
  return { ok: false, retry: status === 429 || status >= 500, decision };
}

// ============================================================================
// Reading the application
// ============================================================================

async function settle(query: () => PromiseLike<{ data: unknown; error: RestError | null }>): Promise<{ data: unknown; error: RestError | null }> {
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

function errorText(error: RestError | null | undefined): string {
  return error ? [error.code, error.message].filter(Boolean).join(" ") : "";
}

/**
 * The application as trigger-ava-analysis will see it, planned the same way.
 * Null when it cannot be read (then nothing is asked: a manual job must
 * never be asked with autopilotDecision: true). The employer's notice is
 * looked up only when the next step waits on the employer.
 */
export async function readMoveOnState(
  admin: AssessmentAdmin,
  applicationId: string,
  stepId: string,
  options: { noticeSince?: string | null } = {},
): Promise<MoveOnState | null> {
  const appRes = await settle(() =>
    admin
      .from("applications")
      .select("phase, status, notes, voice_interview_result, job_id")
      .eq("id", applicationId)
      .maybeSingle(),
  );
  if (appRes.error || !isPlainObject(appRes.data)) {
    if (appRes.error) console.error("[step-move-on] application not readable:", errorText(appRes.error));
    return null;
  }
  const app = appRes.data;
  if (typeof app.job_id !== "string") return null;
  const jobRes = await settle(() =>
    admin.from("jobs").select("processing_mode, workflow_steps, quiz_questions").eq("id", app.job_id).maybeSingle(),
  );
  if (jobRes.error || !isPlainObject(jobRes.data)) {
    if (jobRes.error) console.error("[step-move-on] job not readable:", errorText(jobRes.error));
    return null;
  }
  const job = jobRes.data;
  const processingMode = typeof job.processing_mode === "string" ? job.processing_mode : null;
  const steps = buildCandidateJourney(
    (Array.isArray(job.workflow_steps) ? job.workflow_steps : []) as WorkflowStepLike[],
    { hasQuiz: Array.isArray(job.quiz_questions) && job.quiz_questions.length > 0 },
  );
  const plan = planAutoAdvance({
    steps,
    completedStepId: stepId,
    application: {
      phase: typeof app.phase === "string" ? app.phase : null,
      status: typeof app.status === "string" ? app.status : null,
      notes: app.notes,
      voice_interview_result: app.voice_interview_result,
    },
    processingMode,
  });
  const notes = parseNotesObject(app.notes);
  const marker = isPlainObject(notes._trusted) ? notes._trusted[stepId] : undefined;
  const resultAt = isPlainObject(marker) && typeof marker.completedAt === "string" ? marker.completedAt : null;

  let noticeSent = false;
  if (plan.kind === "needs_employer_approval") {
    const sinceMs = Date.parse(resultAt ?? options.noticeSince ?? "");
    const noticeRes = await settle(() =>
      admin
        .from("notifications")
        .select("created_at")
        .eq("link", `/applicants/${applicationId}`)
        .eq("type", "interview")
        .order("created_at", { ascending: false })
        .limit(1),
    );
    const latest = Array.isArray(noticeRes.data) && isPlainObject(noticeRes.data[0]) ? noticeRes.data[0].created_at : null;
    const latestMs = typeof latest === "string" ? Date.parse(latest) : NaN;
    noticeSent = Number.isFinite(latestMs) && (!Number.isFinite(sinceMs) || latestMs >= sinceMs);
    if (noticeRes.error) console.error("[step-move-on] notices not readable:", errorText(noticeRes.error));
  }

  return { processingMode, plan, analysisCovered: analysisCoversStep(stepId, app.notes), noticeSent, resultAt };
}

// ============================================================================
// Asking
// ============================================================================

export interface StepMoveOnDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timing?: Partial<MoveOnTiming>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function envValue(name: string): string | null {
  const deno = (globalThis as unknown as { Deno?: { env?: { get(key: string): string | undefined } } }).Deno;
  try {
    return deno?.env?.get(name) ?? null;
  } catch {
    return null;
  }
}

function withEnv(input: StepMoveOnInput): StepMoveOnInput & { supabaseUrl: string | null; anonKey: string | null } {
  return {
    ...input,
    supabaseUrl: input.supabaseUrl ?? envValue("SUPABASE_URL"),
    anonKey: input.anonKey ?? envValue("SUPABASE_ANON_KEY"),
  };
}

/** One POST to trigger-ava-analysis, with a deadline. Never throws. */
async function askOnce(
  input: { supabaseUrl: string; anonKey: string; authorization: string; applicationId: string; stepId: string },
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ status: number | null; body: unknown; error: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${input.supabaseUrl.replace(/\/+$/, "")}/functions/v1/trigger-ava-analysis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: input.anonKey,
        Authorization: input.authorization,
      },
      body: JSON.stringify(moveOnRequestBody(input.applicationId, input.stepId)),
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text.slice(0, 500);
      }
    }
    return { status: response.status, body, error: null };
  } catch (error) {
    return { status: null, body: null, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

export type StepMoveOnOutcome =
  | { kind: "skipped"; at: "request" | "start" | "first" | "late" | "retry"; why: MoveOnSkip | "no_ids" | "no_user_token" | "not_configured" }
  | {
    kind: "asked";
    at: "first" | "late";
    ok: boolean;
    status: number | null;
    decision: string | null;
    tries: number;
    error: string | null;
  }
  | { kind: "failed"; error: string };

/**
 * The background task: look, maybe look again, and ask trigger-ava-analysis
 * when nobody else has (see the module comment). Awaitable for tests; the
 * edge functions run it through scheduleStepMoveOn. Never throws.
 */
export async function runStepMoveOn(
  admin: AssessmentAdmin,
  rawInput: StepMoveOnInput,
  deps: StepMoveOnDeps = {},
): Promise<StepMoveOnOutcome> {
  try {
    const input = withEnv(rawInput);
    const request = moveOnRequest(input);
    if (!request.schedule) return { kind: "skipped", at: "request", why: request.why };
    const now = deps.now ?? Date.now;
    const sleep = deps.sleep ?? defaultSleep;
    const fetchImpl = deps.fetch ?? fetch;
    const timing = timingWith(deps.timing);
    const startMs = now();
    const startedAt = new Date(startMs).toISOString();
    const times = moveOnTimes({ startMs, tokenExpiresAtMs: request.tokenExpiresAtMs, timing });
    const look = () => readMoveOnState(admin, input.applicationId, input.stepId, { noticeSince: startedAt });
    const log = (what: string, detail: Record<string, unknown> = {}) =>
      console.log(`[step-move-on] ${what}`, { applicationId: input.applicationId, stepId: input.stepId, ...detail });

    // 1. Auto mode only (a read failure here is decided at the next look).
    const first = await look();
    if (first && first.processingMode !== "auto") {
      log("manual job: nothing to ask", { processingMode: first.processingMode });
      return { kind: "skipped", at: "start", why: "not_auto_mode" };
    }

    // 2. The first look, after the page has had its chance.
    await sleep(times.firstAtMs - now());
    let at: "first" | "late" = "first";
    let check = planMoveOnCheck({ state: await look(), lastChance: times.lateAtMs <= times.firstAtMs });

    // 3. A step before a voice interview: look again once its analysis would be saved.
    if (check.action === "look_again") {
      await sleep(times.lateAtMs - now());
      at = "late";
      check = planMoveOnCheck({ state: await look(), lastChance: true });
    }
    if (check.action !== "ask") {
      const why = check.action === "skip" ? check.why : "unreadable";
      log("nothing to ask", { at, why });
      return { kind: "skipped", at, why };
    }

    const ask = {
      supabaseUrl: input.supabaseUrl!,
      anonKey: input.anonKey!,
      authorization: String(input.authorization),
      applicationId: input.applicationId,
      stepId: input.stepId,
    };
    let tries = 1;
    let sent = await askOnce(ask, fetchImpl, timing.askTimeoutMs);
    let answer = readTriggerAnswer(sent.status, sent.body);
    if (!answer.ok && answer.retry) {
      log("ask failed, trying once more", { status: sent.status, error: sent.error });
      await sleep(timing.retryDelayMs);
      // The first ask may have landed after all: ask again only if it still looks unasked.
      const again = planMoveOnCheck({ state: await look(), lastChance: true });
      if (again.action !== "ask") {
        log("the first ask landed", { why: again.action === "skip" ? again.why : null });
        return { kind: "skipped", at: "retry", why: again.action === "skip" ? again.why : "unreadable" };
      }
      tries = 2;
      sent = await askOnce(ask, fetchImpl, timing.askTimeoutMs);
      answer = readTriggerAnswer(sent.status, sent.body);
    }
    if (answer.ok) log("asked trigger-ava-analysis", { at, status: sent.status, decision: answer.decision, tries });
    else console.error("[step-move-on] trigger-ava-analysis did not take the ask", { applicationId: input.applicationId, stepId: input.stepId, at, status: sent.status, error: sent.error, body: sent.body, tries });
    return { kind: "asked", at, ok: answer.ok, status: sent.status, decision: answer.decision, tries, error: sent.error };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[step-move-on] failed:", message);
    return { kind: "failed", error: message };
  }
}

/**
 * Called right after a test's result is recorded. Runs runStepMoveOn after
 * the response (EdgeRuntime.waitUntil keeps the worker alive for it) and
 * returns at once: true when it was scheduled. Never throws, never blocks.
 */
export function scheduleStepMoveOn(
  admin: AssessmentAdmin | null | undefined,
  rawInput: StepMoveOnInput,
  deps: StepMoveOnDeps = {},
): boolean {
  try {
    if (!admin) return false;
    const input = withEnv(rawInput);
    const request = moveOnRequest(input);
    if (!request.schedule) {
      if (request.why !== "not_auto_mode") {
        console.log("[step-move-on] not scheduled:", request.why, { applicationId: input.applicationId, stepId: input.stepId });
      }
      return false;
    }
    runAfterResponse("moving the applicant on", runStepMoveOn(admin, input, deps));
    return true;
  } catch (error) {
    console.error("[step-move-on] not scheduled:", error instanceof Error ? error.message : String(error));
    return false;
  }
}
