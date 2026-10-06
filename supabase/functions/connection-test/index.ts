/**
 * connection-test — the computer and connection check, timed by the server
 * (docs/EQUIPMENT-CHECK.md; the contract every part of the step follows).
 *
 * One function, routed by `?op=`:
 *
 *   ping      GET            answers at once, with a stamp (`at` = response sent).
 *   download  GET &bytes=N   streams N bytes (cap 3 MB) of random data in 64 KB
 *                            chunks; the stamp (`at` = streaming began) is in the
 *                            `x-stamp` header (a `head` copy, never a chain link)
 *                            AND in the last 512 bytes of the body, space-padded
 *                            JSON: the copy the page must hand back, because it
 *                            cannot be known before the whole body has arrived.
 *   upload    POST raw body  reads the body in chunks (cap 1.5 MB) and stamps
 *                            when the last chunk is in (`at`). The stamp's
 *                            `timing` ("stream" | "chain") is a diagnostic
 *                            label only: every upload is timed from the
 *                            previous upload's `at` (figuresFromChain).
 *   event     POST JSON      writes one of the page's markers on the attempt as
 *                            it happens (device_read, computer_answer,
 *                            test_started, test_finished); a test_finished
 *                            that carries its run's stamps also gets that
 *                            run's server figures, as a `test_run` marker and
 *                            in the reply, so the result screen shows them
 *                            and staff see every run, not only the one sent.
 *                            Writes nothing to the application.
 *   record    POST JSON      verifies the chain of stamps, computes the three
 *                            figures from them alone, records the result and
 *                            moves the applicant on.
 *
 * Every response carries `x-stamp`: `{kind, nonce, at, bytes, prev_nonce,
 * prev_at, candidate, timing?, head?, ip?, ua, sig}`, signed with a key
 * derived once per worker from the service-role key
 * (_shared/connectionStamps.ts). `ip` is the address the request came from
 * as the platform reports it (bestEffortIp) and `ua` a short hash of its
 * User-Agent: a chain that names two browsers is refused, and `record`
 * compares both with its own request, so a test timed from one machine and
 * sent from another is on the record as a flag, never hidden.
 * `prev_nonce`/`prev_at` come from the stamp the request handed in
 * (`x-prev-stamp` header, or `prev` query) after its signature was verified;
 * `prev_at` is the server time this request ARRIVED, which is what proves the
 * previous step was complete. ping/download/upload need only a valid JWT
 * (the gateway checks it: verify_jwt = true; its subject binds the chain);
 * `event` and `record` need the application's own candidate (auth.getUser),
 * like submit-typing-test.
 *
 * `record` never reads a figure from the page: it refuses (400, with a reason
 * the page shows in plain words) a chain with fewer than 4 pings, 2 downloads
 * or 2 uploads, a broken signature, a stamp older than 20 minutes, a nonce
 * used twice, or a chain bound to another sign-in. What it records
 * (docs/EQUIPMENT-CHECK.md §5): notes.equipmentCheckResult through
 * recordStepResult (resultKey "equipmentCheckResult", advance "never": this
 * step decides nothing itself; in an auto-mode job the move to the next step
 * is the server's own ask through _shared/stepMoveOn.ts, exactly as
 * submit-typing-test does it), the assessment session completed with
 * grading {stamps, ip, userAgent, raw} and end_reason "submitted", and two
 * `system` markers: `test_run` with the server's figures for the sent run
 * (a no-op when `event` already wrote it) and `submitted` naming that run.
 * Nothing here declines anyone: the result is evidence for Ava and the
 * hiring team.
 *
 * The assessment record is best effort and never blocks the test, with the
 * same two refusals as typing: a finished step (409 step_finished) and an
 * attempt being checked right now (409 already_checking). A result already
 * on file is answered back (alreadyRecorded: true), never graded again from
 * a request body. A crash while this request holds the grading claim marks
 * the attempt failed (the result is still owed), never leaves it "grading".
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCandidateJourney, type WorkflowStepLike } from "../_shared/candidateJourney.ts";
import { hasReachedStep, recordStepResult, type MinimalSupabaseAdmin } from "../_shared/trustedResults.ts";
import {
  cleanClientMsgId,
  computerOnlyGate,
  recordStartDevice,
  stepAccessFor,
  failSession,
  finishGrading,
  gateGrading,
  gradingRecord,
  insertEvent,
  readStepOnFile,
  releaseGrading,
  resolveSession,
  updateContext,
  type AssessmentAdmin,
  type SessionResolution,
  type SessionRow,
} from "../_shared/assessmentSession.ts";
import { jwtClaims, scheduleStepMoveOn } from "../_shared/stepMoveOn.ts";
import { combinedDeviceKind, computerRequiredBody, deviceKindOfRequest, needsComputer, requestDeviceKind } from "../_shared/deviceKind.ts";
import { bestEffortIp } from "../_shared/bestEffortIp.ts";
import {
  barsBelow,
  buildEquipmentCheckResult,
  chainRefusalText,
  cleanAddress,
  cleanConnectionMarker,
  cleanDevice,
  cleanDeviceKind,
  cleanUsingThisComputer,
  connectionBars,
  connectionEvidenceLine,
  connectionSource,
  decodeStamp,
  encodeStamp,
  figuresFromChain,
  makeNonce,
  makeSecret,
  runsFinished,
  sentRunNumber,
  signStamp,
  STAMP_MAX_AGE_MS,
  STAMP_TAIL_BYTES,
  stampTail,
  uploadTiming,
  userAgentHash,
  verifyChain,
  verifyStamp,
  type Stamp,
  type StampFields,
} from "../_shared/connectionStamps.ts";

// The page sends the previous stamp in a header of its own and reads every
// stamp back from `x-stamp`, so both names are allowed/exposed here (the
// other candidate functions carry neither).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-prev-stamp",
  "Access-Control-Expose-Headers": "x-stamp",
};

/** Caps (docs/EQUIPMENT-CHECK.md §4). */
const DOWNLOAD_CAP_BYTES = 3 * 1024 * 1024;
const UPLOAD_CAP_BYTES = Math.round(1.5 * 1024 * 1024);
/** crypto.getRandomValues fills at most 65,536 bytes per call. */
const RANDOM_CHUNK_BYTES = 64 * 1024;
/** The record body: at most 64 stamps of ~250 bytes plus the device facts. */
const RECORD_BODY_CAP_BYTES = 256 * 1024;
const PROMPT_VERSION = "connection-stamps-1";

function jsonResponse(body: Record<string, unknown>, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

// The secret is derived once per worker from the key the function runs with.
let secretPromise: Promise<CryptoKey> | null = null;
function stampSecret(): Promise<CryptoKey> {
  if (!secretPromise) secretPromise = makeSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  return secretPromise;
}

interface JobRow {
  processing_mode: string | null;
  workflow_steps: unknown;
  quiz_questions: unknown;
}

interface ApplicationRow {
  id: string;
  candidate_id: string;
  phase: string | null;
  status: string | null;
  notes: string | null;
  jobs: JobRow | null;
}

type PrevCheck = { ok: true; prev: Stamp | null } | { ok: false; code: string; error: string };

/**
 * The stamp the request hands back (`x-prev-stamp`, or `prev` in the query),
 * verified: signed by this server, not a download's header copy, bound to
 * this sign-in and under 20 minutes old. None at all is fine: the first
 * request of a chain has nothing to hand back.
 */
async function readPrev(req: Request, url: URL, secret: CryptoKey, subject: string, now: number): Promise<PrevCheck> {
  const raw = req.headers.get("x-prev-stamp") ?? url.searchParams.get("prev");
  if (raw == null || raw.trim() === "") return { ok: true, prev: null };
  const stamp = decodeStamp(raw);
  if (!stamp || !(await verifyStamp(secret, stamp))) {
    return { ok: false, code: "bad_stamp", error: "The previous step's record did not add up. Run the test again." };
  }
  if (stamp.head) {
    return { ok: false, code: "head_stamp", error: "The download had not fully arrived. Run the test again." };
  }
  if (stamp.candidate !== subject) {
    return { ok: false, code: "foreign_stamp", error: "This test was run under another sign-in. Run the test again." };
  }
  if (now - stamp.at > STAMP_MAX_AGE_MS) {
    return { ok: false, code: "stale_stamp", error: "This test is more than 20 minutes old. Run the test again." };
  }
  return { ok: true, prev: stamp };
}

/** Where a request came from, as every stamp it gets carries it: the
 *  address the platform reports (bestEffortIp) and a hash of its User-Agent. */
interface RequestSource {
  ip: string | null;
  ua: string;
}

async function requestSource(req: Request): Promise<RequestSource> {
  return { ip: cleanAddress(bestEffortIp(req)), ua: await userAgentHash(req.headers.get("user-agent")) };
}

function nextStampFields(input: {
  kind: StampFields["kind"];
  at: number;
  bytes: number;
  prev: Stamp | null;
  received: number;
  subject: string;
  source: RequestSource;
}): StampFields {
  return {
    kind: input.kind,
    nonce: makeNonce(),
    at: input.at,
    bytes: input.bytes,
    prev_nonce: input.prev?.nonce ?? null,
    prev_at: input.received,
    candidate: input.subject,
    ...(input.source.ip ? { ip: input.source.ip } : {}),
    ua: input.source.ua,
  };
}

/**
 * N bytes of incompressible random data, 64 KB at a time, ending with the
 * stamp's 512-byte tail. Generated as it is pulled, so a slow reader costs
 * no memory and the CPU work per request stays well inside the limit.
 */
function randomBodyStream(total: number, tail: Uint8Array): ReadableStream<Uint8Array> {
  const randomBytes = total - tail.length;
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent < randomBytes) {
        const chunk = new Uint8Array(Math.min(RANDOM_CHUNK_BYTES, randomBytes - sent));
        crypto.getRandomValues(chunk);
        controller.enqueue(chunk);
        sent += chunk.length;
        return;
      }
      controller.enqueue(tail);
      controller.close();
    },
  });
}

type UploadRead = { ok: true; bytes: number } | { ok: false; status: number; code: string; error: string };

/** Reads the raw upload body chunk by chunk, counting bytes, and stops at the cap. */
async function readUploadBody(req: Request): Promise<UploadRead> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > UPLOAD_CAP_BYTES) {
    return { ok: false, status: 413, code: "too_large", error: "The upload is larger than the test allows." };
  }
  if (!req.body) return { ok: false, status: 400, code: "empty_upload", error: "The upload carried no data." };
  const reader = req.body.getReader();
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value?.byteLength ?? 0;
    if (total > UPLOAD_CAP_BYTES) {
      await reader.cancel().catch(() => {});
      return { ok: false, status: 413, code: "too_large", error: "The upload is larger than the test allows." };
    }
  }
  if (total === 0) return { ok: false, status: 400, code: "empty_upload", error: "The upload carried no data." };
  return { ok: true, bytes: total };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** The step's own config, by its id, from the job's workflow steps. */
function stepConfig(workflowSteps: readonly WorkflowStepLike[], stepId: string): unknown {
  const step = workflowSteps.find((s) => isRecord(s) && s.id === stepId) as Record<string, unknown> | undefined;
  return step?.config ?? null;
}

type OwnStep =
  | { ok: true; application: ApplicationRow; job: JobRow; workflowSteps: WorkflowStepLike[] }
  | { ok: false; response: Response };

/**
 * The application `event` and `record` act on: it exists, it is this
 * candidate's, it is not declined, and it has reached this step, which is a
 * computer and connection check. The same checks submit-typing-test makes.
 */
async function loadOwnStep(admin: AssessmentAdmin, userId: string, applicationId: string, stepId: string): Promise<OwnStep> {
  const { data: appData, error: appError } = await admin
    .from("applications")
    .select("id, candidate_id, phase, status, notes, jobs:job_id ( processing_mode, workflow_steps, quiz_questions )")
    .eq("id", applicationId)
    .maybeSingle();

  if (appError || !appData) {
    return { ok: false, response: jsonResponse({ error: "Application not found" }, 404) };
  }
  const application = appData as unknown as ApplicationRow;

  if (application.candidate_id !== userId) {
    return { ok: false, response: jsonResponse({ error: "You are not authorized to act on this application" }, 403) };
  }
  if (application.status === "rejected") {
    return { ok: false, response: jsonResponse({ error: "Application has been rejected" }, 400) };
  }

  const job = application.jobs ?? { processing_mode: null, workflow_steps: [], quiz_questions: [] };
  const workflowSteps = (Array.isArray(job.workflow_steps) ? job.workflow_steps : []) as WorkflowStepLike[];
  const quizQuestions = job.quiz_questions as unknown[] | undefined;
  const hasQuiz = Array.isArray(quizQuestions) && quizQuestions.length > 0;
  const steps = buildCandidateJourney(workflowSteps, { hasQuiz });

  const reached = hasReachedStep(steps, {
    stepId,
    expectedType: "equipment_check",
    phase: application.phase,
    status: application.status,
  });
  if (!reached.reached) {
    return {
      ok: false,
      response: jsonResponse(
        { error: `Candidate has not reached step "${stepId}"` },
        reached.reason === "unrecognized_or_wrong_type_step" ? 404 : 409,
      ),
    };
  }
  return { ok: true, application, job, workflowSteps };
}

/**
 * Whether the hiring team handed this step back for a retake: the rule
 * assessment_step_completion applies, read straight from the tables (it is
 * only asked when that function could not be): status "pending" with the
 * phase on this step AND a staff reopen marker newer than the result on file
 * (its `_trusted[step].completedAt`). The status alone never reopens a step;
 * the applicant can set it. A marker that cannot be read counts as none.
 */
async function reopenedForRetake(admin: AssessmentAdmin, application: ApplicationRow, stepId: string): Promise<boolean> {
  if (application.status !== "pending" || application.phase !== stepId) return false;
  let data: unknown = null;
  try {
    const read = await admin
      .from("assessment_step_reopens")
      .select("reopened_at")
      .eq("application_id", application.id)
      .eq("step_id", stepId)
      .maybeSingle();
    if (read.error) return false;
    data = read.data;
  } catch {
    return false;
  }
  if (!isRecord(data) || typeof data.reopened_at !== "string") return false;
  const reopenedAt = Date.parse(data.reopened_at);
  let notes: unknown = null;
  try {
    notes = application.notes ? JSON.parse(application.notes) : null;
  } catch {
    notes = null;
  }
  const marker = isRecord(notes) && isRecord(notes._trusted) ? notes._trusted[stepId] : null;
  const recordedAt = isRecord(marker) && typeof marker.completedAt === "string" ? Date.parse(marker.completedAt) : NaN;
  return Number.isFinite(reopenedAt) && (!Number.isFinite(recordedAt) || reopenedAt > recordedAt);
}

type BodyRead = { ok: true; payload: Record<string, unknown>; applicationId: string; stepId: string } | { ok: false; response: Response };

/**
 * The raw body, read chunk by chunk and given up the moment it passes the
 * cap, the way readUploadBody reads an upload: a chunked POST carries no
 * Content-Length, so `req.text()` would hold the whole of it in memory before
 * any length could be checked (and a string's length counts UTF-16 units,
 * not bytes). Null when it is over the cap.
 */
async function readCappedText(req: Request, cap: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** A JSON body under the cap, naming the application and the step (snake_case per the contract, camelCase too). */
async function readJsonBody(req: Request): Promise<BodyRead> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > RECORD_BODY_CAP_BYTES) {
    return { ok: false, response: jsonResponse({ error: "Request body too large", code: "too_large" }, 413) };
  }
  const bodyText = await readCappedText(req, RECORD_BODY_CAP_BYTES);
  if (bodyText === null) {
    return { ok: false, response: jsonResponse({ error: "Request body too large", code: "too_large" }, 413) };
  }
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(bodyText);
    if (!isRecord(parsed)) return { ok: false, response: jsonResponse({ error: "Invalid request body" }, 400) };
    payload = parsed;
  } catch {
    return { ok: false, response: jsonResponse({ error: "Invalid request body" }, 400) };
  }
  // The contract names the body's keys in snake_case (docs/EQUIPMENT-CHECK.md
  // §4); the other candidate functions take camelCase, so both are read.
  const applicationId = typeof payload.application_id === "string"
    ? payload.application_id
    : typeof payload.applicationId === "string"
      ? payload.applicationId
      : "";
  const stepId = typeof payload.step_id === "string" ? payload.step_id : typeof payload.stepId === "string" ? payload.stepId : "";
  if (!applicationId || !stepId) {
    return { ok: false, response: jsonResponse({ error: "application_id and step_id are required" }, 400) };
  }
  return { ok: true, payload, applicationId, stepId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // When this request arrived: the number that proves the previous step was
  // complete (every stamp carries it as prev_at).
  const received = Date.now();
  const url = new URL(req.url);
  const op = url.searchParams.get("op") ?? "";

  // An attempt this request claimed for grading: if anything below throws,
  // it is marked failed (the result is still owed), not left "grading".
  let heldClaim: { admin: AssessmentAdmin; sessionId: string } | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }
    const secret = await stampSecret();

    // ------------------------------------------------------------------
    // ping / download / upload: move bytes and stamp times; read nothing.
    // The gateway verified the JWT's signature (verify_jwt = true); its
    // subject binds every stamp to this sign-in, and `record` checks the
    // same subject against auth.getUser before anything is written.
    // ------------------------------------------------------------------
    if (op === "ping" || op === "download" || op === "upload") {
      const claims = jwtClaims(authHeader);
      if (!claims?.sub || claims.role === "anon") {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      const subject = claims.sub;
      if (op === "upload" ? req.method !== "POST" : req.method !== "GET") {
        return jsonResponse({ error: "Method not allowed" }, 405);
      }
      const prevCheck = await readPrev(req, url, secret, subject, received);
      if (!prevCheck.ok) return jsonResponse({ error: prevCheck.error, code: prevCheck.code }, 400);
      const prev = prevCheck.prev;
      const source = await requestSource(req);

      if (op === "ping") {
        const stamp = await signStamp(secret, nextStampFields({ kind: "ping", at: Date.now(), bytes: 0, prev, received, subject, source }));
        const encoded = encodeStamp(stamp);
        return jsonResponse({ stamp: encoded }, 200, { "x-stamp": encoded, "Cache-Control": "no-store" });
      }

      if (op === "download") {
        const asked = Number(url.searchParams.get("bytes") ?? "");
        const bytes = Number.isFinite(asked) && asked > 0
          ? Math.max(STAMP_TAIL_BYTES, Math.min(DOWNLOAD_CAP_BYTES, Math.floor(asked)))
          : DOWNLOAD_CAP_BYTES;
        const fields = nextStampFields({ kind: "download", at: Date.now(), bytes, prev, received, subject, source });
        // The header copy arrives first, so it is marked and never a chain
        // link; the body copy, last, is the one the page hands back.
        const [headCopy, bodyCopy] = await Promise.all([signStamp(secret, { ...fields, head: true }), signStamp(secret, fields)]);
        return new Response(randomBodyStream(bytes, stampTail(bodyCopy)), {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/octet-stream",
            "Content-Length": String(bytes),
            "Content-Encoding": "identity",
            "Cache-Control": "no-store",
            "x-stamp": encodeStamp(headCopy),
          },
        });
      }

      // upload
      const read = await readUploadBody(req);
      if (!read.ok) return jsonResponse({ error: read.error, code: read.code }, read.status);
      const at = Date.now();
      const stamp = await signStamp(secret, {
        ...nextStampFields({ kind: "upload", at, bytes: read.bytes, prev, received, subject, source }),
        // A diagnostic label only (how the gateway handed the body over);
        // every upload is timed from the previous upload's `at`.
        timing: uploadTiming(received, at),
      });
      const encoded = encodeStamp(stamp);
      return jsonResponse({ stamp: encoded, bytes: read.bytes, timing: stamp.timing }, 200, { "x-stamp": encoded, "Cache-Control": "no-store" });
    }

    if (op !== "record" && op !== "event") {
      return jsonResponse({ error: "Unknown op" }, 400);
    }
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // ------------------------------------------------------------------
    // event / record: the application's own candidate, verified.
    // ------------------------------------------------------------------
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await readJsonBody(req);
    if (!body.ok) return body.response;
    const { payload, applicationId, stepId } = body;

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const record = admin as unknown as AssessmentAdmin;

    const own = await loadOwnStep(record, user.id, applicationId, stepId);
    if (!own.ok) return own.response;
    const { application, job, workflowSteps } = own;

    // ------------------------------------------------------------------
    // event: one of the page's markers, as it happens (docs/EQUIPMENT-CHECK.md
    // §3), so a tab closed mid-test still shows how far they got. Best
    // effort: the answer is always 200 for a marker that is not written (no
    // attempt open, the step finished), because nothing on the page waits
    // on it except a test_finished's figures.
    // ------------------------------------------------------------------
    if (op === "event") {
      const marker = cleanConnectionMarker(payload.what, payload.detail);
      if (!marker) {
        return jsonResponse({ error: "Unknown marker", code: "invalid_request" }, 400);
      }
      // A phone or tablet never opens this step's attempt and never starts
      // the check on one the page's mount opened (docs/COMPUTER-ONLY-TESTS.md):
      // the request's headers AND the page's own reading (`device_kind`).
      // An attempt a computer started (its first marker records the device,
      // below) still takes its markers.
      const eventDevice = deviceKindOfRequest(req, payload);
      if (needsComputer(eventDevice)) {
        const gate = await computerOnlyGate(record, eventDevice, { applicationId, stepId, userId: user.id, steps: workflowSteps, purpose: "turns" });
        if (gate === "refuse") return jsonResponse(computerRequiredBody(eventDevice), 400);
      }
      const resolved = await resolveSession(record, {
        applicationId,
        stepId,
        userId: user.id,
        stepType: "equipment_check",
        purpose: "turns",
      });
      if (!resolved.ok) console.log("[connection-test] marker not recorded:", resolved.reason, resolved.detail ?? "");
      const session = resolved.ok ? resolved.session : null;
      const clientMsgId = cleanClientMsgId(payload.client_msg_id ?? payload.clientMsgId);

      const runBars = connectionBars(stepConfig(workflowSteps, stepId));
      let written = false;
      if (session) {
        // The device the check started on, once (the first marker is the
        // start): a phone may later add markers only to a check a computer
        // started.
        await recordStartDevice(record, session, eventDevice);
        // The job's bars as they stood when the attempt began, pinned once in
        // the step config's own shape (staff read them while the check is
        // still being taken; the recorded result carries its own copy).
        if (!isRecord(session.context.bars)) {
          await updateContext(record, session, {
            bars: { min_download_mbps: runBars.minDownloadMbps, min_upload_mbps: runBars.minUploadMbps, max_latency_ms: runBars.maxLatencyMs },
          });
        }
        const stored = await insertEvent(record, { sessionId: session.id, kind: "system", clientMsgId, detail: marker.detail });
        if (stored.error) console.error("[connection-test] marker not stored:", stored.error);
        written = !stored.error;
      }

      // A finished run's own stamps: the server's figures for it, on the
      // record as a `test_run` marker and in the reply. The same chain sent
      // later gives the same figures, so the result screen shows exactly
      // what `record` will store. A chain that does not verify gets no
      // figures (the page keeps its own estimate) and no marker.
      if (marker.what !== "test_finished" || payload.stamps === undefined) {
        return jsonResponse({ recorded: written });
      }
      const runVerdict = await verifyChain(secret, payload.stamps, { now: Date.now(), candidate: user.id });
      if (!runVerdict.ok) {
        console.log("[connection-test] run's chain refused:", runVerdict.reason, runVerdict.detail);
        return jsonResponse({ recorded: written, figures: null, code: runVerdict.reason, error: chainRefusalText(runVerdict.reason) });
      }
      const runFigures = figuresFromChain(runVerdict.chain);
      if (runFigures.downloadMbps === null || runFigures.uploadMbps === null || runFigures.latencyMs === null || runFigures.jitterMs === null) {
        return jsonResponse({ recorded: written, figures: null, code: "unmeasurable", error: "The test did not measure every figure. Run it again." });
      }
      const figures = {
        downloadMbps: runFigures.downloadMbps,
        uploadMbps: runFigures.uploadMbps,
        latencyMs: runFigures.latencyMs,
        jitterMs: runFigures.jitterMs,
      };
      const runBelow = barsBelow(figures, runBars);
      if (session) {
        const runEvent = await insertEvent(record, {
          sessionId: session.id,
          kind: "system",
          clientMsgId: `srv:test_run:${runVerdict.chain[0].nonce}`,
          detail: {
            what: "test_run",
            run: marker.detail.run,
            download_mbps: figures.downloadMbps,
            upload_mbps: figures.uploadMbps,
            latency_ms: figures.latencyMs,
            jitter_ms: figures.jitterMs,
            pings: runFigures.pings,
            downloads: runFigures.downloads,
            uploads: runFigures.uploads,
            meets_bars: runBelow.length === 0,
            below: runBelow,
          },
        });
        if (runEvent.error) console.error("[connection-test] test_run event not stored:", runEvent.error);
      }
      return jsonResponse({ recorded: written, figures: { ...figures, meetsBars: runBelow.length === 0, below: runBelow } });
    }

    const bars = connectionBars(stepConfig(workflowSteps, stepId));

    // The page's own facts about the device and the answer to the computer
    // question: checked for shape, never for truth (they are evidence).
    const usingThisComputer = cleanUsingThisComputer(payload.using_this_computer ?? payload.usingThisComputer);
    const deviceKind = cleanDeviceKind(payload.device_kind ?? payload.deviceKind);
    if (!usingThisComputer || !deviceKind) {
      return jsonResponse(
        { error: "using_this_computer and device_kind are required", code: "invalid_request" },
        400,
      );
    }
    // The check is taken on the computer they will work from
    // (docs/COMPUTER-ONLY-TESTS.md): a run the page itself read as a phone or
    // tablet, or sent from one, is refused before anything is opened or
    // claimed (the page's reading is what catches an iPad and a phone asking
    // for the desktop site). A finished step answers its result back first,
    // so a retried record after a lost reply never reads "use your
    // computer". The byte ops above stay open so a page can still show a
    // reading; only the record is refused.
    const recordDevice = combinedDeviceKind(requestDeviceKind(req), deviceKind);
    if (needsComputer(recordDevice)) {
      const access = await stepAccessFor(record, { applicationId, stepId, userId: user.id });
      if (access?.finished) {
        const onFile = await readStepOnFile(record, applicationId, stepId, "equipmentCheckResult");
        if (onFile?.result) return jsonResponse({ results: onFile.result, next: onFile.next, alreadyRecorded: true });
      }
      return jsonResponse(computerRequiredBody(recordDevice), 400);
    }
    const device = cleanDevice(payload.device);
    // How many runs they had finished when they sent this one (the sent one
    // included; §5), and which one it was, for the staff timeline.
    const runs = runsFinished(payload.runs);
    const sentRun = sentRunNumber(payload.runs, payload.estimate, runs);

    // The attempt's record, best effort (never blocks the test).
    const resolveRecord = async (): Promise<SessionResolution> => {
      const resolved = await resolveSession(record, {
        applicationId,
        stepId,
        userId: user.id,
        stepType: "equipment_check",
        purpose: "submit",
      });
      if (!resolved.ok) console.log("[connection-test] not recording:", resolved.reason, resolved.detail ?? "");
      return resolved;
    };

    // ONE request records an attempt, and a result already on file is never
    // recorded again from a request body: a retried or replayed record waits
    // for the request that is saving it (gateGrading) and gets the recorded
    // result back, exactly as a retried typing submit does.
    const resolved = await resolveRecord();
    const session: SessionRow | null = resolved.ok ? resolved.session : null;
    const gate = await gateGrading(record, session, resolved.ok ? null : resolved.reason);
    if (!gate.go) {
      if (gate.why === "checking") {
        return jsonResponse({ error: "This check is already being saved.", code: "already_checking" }, 409);
      }
      const onFile = await readStepOnFile(record, applicationId, stepId, "equipmentCheckResult");
      if (!onFile?.result) return jsonResponse({ error: "This step is already recorded.", code: "step_finished" }, 409);
      return jsonResponse({ results: onFile.result, next: onFile.next, alreadyRecorded: true });
    }
    const claimed = gate.claim === "claimed";
    if (session && claimed) heldClaim = { admin: record, sessionId: session.id };

    // No attempt at all (its record could not be read: a transient database
    // error, or this function deployed before its migration):
    // assessment_step_access never said whether the step is finished, and
    // recordStepResult only checks that it was reached. One result per step
    // still holds: a result already on file is answered back, unless the
    // hiring team really handed the step back for a retake. (With an attempt
    // the server already said the step is open, finished or reopened.)
    if (gate.claim === "none" && !session) {
      const onFile = await readStepOnFile(record, applicationId, stepId, "equipmentCheckResult");
      if (onFile?.result && !(await reopenedForRetake(record, application, stepId))) {
        return jsonResponse({ results: onFile.result, next: onFile.next, alreadyRecorded: true });
      }
    }

    const refuse = async (code: string, error: string, detail: Record<string, unknown> = {}) => {
      if (session) {
        const marker = await insertEvent(record, {
          sessionId: session.id,
          kind: "system",
          detail: { what: "record_refused", reason: code, ...detail },
        });
        if (marker.error) console.error("[connection-test] refusal marker not stored:", marker.error);
        if (claimed) await releaseGrading(record, session.id, gate.fromStatus ?? "active");
      }
      heldClaim = null;
      return jsonResponse({ error, code }, 400);
    };

    // The chain: every signature, one unbroken chain, nothing stale or
    // foreign, enough of each kind (_shared/connectionStamps.ts).
    const verdict = await verifyChain(secret, payload.stamps, { now: Date.now(), candidate: user.id });
    if (!verdict.ok) {
      console.log("[connection-test] chain refused:", verdict.reason, verdict.detail);
      return refuse(verdict.reason, chainRefusalText(verdict.reason), { index: verdict.index, detail: verdict.detail });
    }
    const figures = figuresFromChain(verdict.chain);
    if (figures.downloadMbps === null || figures.uploadMbps === null || figures.latencyMs === null || figures.jitterMs === null) {
      return refuse("unmeasurable", "The test did not measure every figure. Run it again.", { figures });
    }

    // Where the test ran against where it is being sent from: the chain's
    // own addresses and browser (signed into every stamp) and this request's.
    // A difference is a flag for the hiring team, never a refusal.
    const sender = await requestSource(req);
    const source = connectionSource(verdict.source, { address: sender.ip, ua: sender.ua });

    const measuredAt = new Date().toISOString();
    const result = buildEquipmentCheckResult({
      figures: {
        downloadMbps: figures.downloadMbps,
        uploadMbps: figures.uploadMbps,
        latencyMs: figures.latencyMs,
        jitterMs: figures.jitterMs,
      },
      bars,
      runs,
      usingThisComputer,
      deviceKind,
      device,
      measuredAt,
      attempt: session?.attempt ?? 1,
      source,
    });
    const legacyStepEntry = {
      type: "equipment_check",
      ...result,
      completedAt: measuredAt,
    };

    // The real supabase-js client is structurally far richer than
    // MinimalSupabaseAdmin (and its .maybeSingle() thenable isn't a real
    // Promise), which trips `deno check`'s type-instantiation depth limit
    // when passed straight through — a plain structural cast is safe here
    // since recordStepResult only ever calls the small subset of methods
    // MinimalSupabaseAdmin declares.
    const outcome = await recordStepResult(admin as unknown as MinimalSupabaseAdmin, {
      applicationId,
      callerUserId: user.id,
      stepId,
      stepType: "equipment_check",
      // Like typing: this step never decides anything itself. In an
      // auto-mode job the move to the next step is the server's own ask
      // (scheduleStepMoveOn → trigger-ava-analysis → advanceAfterStep), the
      // same road every test takes since 2026-10-05. See StepAdvanceMode's
      // doc comment on RecordStepResultInput.
      advance: "never",
      resultKey: "equipmentCheckResult",
      result: result as unknown as Record<string, unknown>,
      legacyStepEntry,
    });

    if (!outcome.ok) {
      if (session && claimed) {
        if (outcome.code === "write_failed") await failSession(record, session.id, outcome.error);
        else await releaseGrading(record, session.id, gate.fromStatus ?? "active");
      }
      heldClaim = null;
      return jsonResponse({ error: outcome.error }, outcome.code === "step_not_reached" ? 409 : 400);
    }

    // The end must not depend on the tab: in an auto-mode job the server
    // asks for the next step itself, in the background, with this request's
    // own JWT (_shared/stepMoveOn.ts). Never blocks this response.
    scheduleStepMoveOn(record, { applicationId, stepId, authorization: authHeader, processingMode: job.processing_mode });

    if (session) {
      // The run that was sent, with the server's figures, so staff see it on
      // the timeline. Idempotent on the chain's first nonce: when the page's
      // test_finished marker already wrote this run's figures (op=event),
      // this inserts nothing and the `submitted` marker below names the run.
      const runEvent = await insertEvent(record, {
        sessionId: session.id,
        kind: "system",
        clientMsgId: `srv:test_run:${verdict.chain[0].nonce}`,
        detail: {
          what: "test_run",
          sent: true,
          run: sentRun,
          download_mbps: result.downloadMbps,
          upload_mbps: result.uploadMbps,
          latency_ms: result.latencyMs,
          jitter_ms: result.jitterMs,
          pings: figures.pings,
          downloads: figures.downloads,
          uploads: figures.uploads,
          meets_bars: result.meetsBars,
          below: result.below,
        },
      });
      if (runEvent.error) console.error("[connection-test] test_run event not stored:", runEvent.error);
      const sentEvent = await insertEvent(record, {
        sessionId: session.id,
        kind: "system",
        clientMsgId: `srv:submitted:${verdict.chain[0].nonce}`,
        detail: { what: "submitted", run: sentRun, runs: result.runs },
      });
      if (sentEvent.error) console.error("[connection-test] submitted event not stored:", sentEvent.error);

      // Staff-only: the stamps themselves, where the test came from, and the
      // page's own summary (docs/EQUIPMENT-CHECK.md §5).
      const { stamps: _stamps, ...raw } = payload;
      await finishGrading(
        record,
        session.id,
        gate,
        gradingRecord({
          model: null,
          promptVersion: PROMPT_VERSION,
          fallback: false,
          result: {
            downloadMbps: result.downloadMbps,
            uploadMbps: result.uploadMbps,
            latencyMs: result.latencyMs,
            jitterMs: result.jitterMs,
            bars: result.bars,
            meetsBars: result.meetsBars,
            below: result.below,
            download_bytes: figures.downloadBytes,
            download_ms: figures.downloadMs,
            upload_bytes: figures.uploadBytes,
            upload_ms: figures.uploadMs,
            pings: figures.pings,
            downloads: figures.downloads,
            uploads: figures.uploads,
            unproven: figures.unproven,
            counts: verdict.counts,
            source,
            // §5's `runs` is the page's own count of its finished runs: the
            // ping/download/upload ops write nothing, so the server cannot
            // count chains itself. Said so wherever staff read it.
            runs_counted_by: "page",
          },
          extra: {
            stamps: verdict.chain,
            // Where the result was sent from, and where the test ran from
            // (every address the chain's stamps name).
            ip: bestEffortIp(req),
            testIps: verdict.source.addresses,
            userAgent: req.headers.get("user-agent") ?? null,
            raw,
          },
        }),
        "submitted",
      );
    }
    heldClaim = null;

    // Best-effort, informational, the way submit-typing-test writes its own
    // line: the cockpit's mapper falls back to it only until Ava's analysis
    // lands moments later. Never fails the request.
    const phaseAiAnalysis = `${connectionEvidenceLine(result)} The hiring team weighs it with the rest of the application.`;
    const { error: analysisError } = await admin
      .from("applications")
      .update({ phase_ai_analysis: phaseAiAnalysis })
      .eq("id", applicationId);
    if (analysisError) {
      console.error("[connection-test] Failed to write phase_ai_analysis (non-fatal):", analysisError);
    }

    return jsonResponse({ results: result, next: outcome.next });
  } catch (error) {
    console.error("[connection-test] Unhandled error:", error);
    if (heldClaim) await failSession(heldClaim.admin, heldClaim.sessionId, error instanceof Error ? error.message : String(error));
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
