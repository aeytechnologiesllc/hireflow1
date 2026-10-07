#!/usr/bin/env node
/**
 * PGlite proof for the server's half of the assessment record:
 * supabase/functions/_shared/assessmentSession.ts against the REAL migration
 * (supabase/migrations/20261005230146_assessment_record.sql, applied
 * verbatim) and its triggers, playing the service role exactly as the edge
 * functions do (ai-chat-simulation, ai-chat-interview, submit-typing-test,
 * submit-sales-simulation).
 *
 * The edge functions call the database through supabase-js (PostgREST). This
 * file gives the module a small PostgREST-shaped client over PGlite
 * (from().select/insert/update + eq/in/order/limit/maybeSingle, rpc()) that
 * runs every statement as `service_role`, so the grants are real too, and
 * returns PostgREST's shapes: ISO timestamps, `{ data, error: { code } }`.
 * The fixture is the live-schema fixture of
 * scripts/assessment_record_schema.pglite.test.mjs.
 *
 * Proves:
 *   - resolveSession opens the attempt through open_assessment_session, then
 *     reuses it without adding a "reloaded" marker per message; refuses a
 *     wrong step type, an unreached step, another person's application, a
 *     finished step; takes no turns into an attempt being graded; revives a
 *     left one;
 *   - a message is stored before the reply, once (a retry inserts nothing),
 *     with the history before it, and finds its stored reply on a retry;
 *   - teeAndRecordReply stores the streamed reply through
 *     EdgeRuntime.waitUntil, even when the browser cancels mid-stream;
 *   - grading claims the attempt (compare-and-set), completes it with the
 *     full grading, releases or fails it;
 *   - the integrity events the page recorded (record_integrity_events, as
 *     the candidate) become the notes' violations;
 *   - a transcript the page sent is stored in order, once;
 *   - the typing context and snapshots round-trip; NUL never reaches
 *     Postgres; a missing function reads as "not deployed";
 *   - when the AI service refuses (2026-10-07): a NEW message is held and
 *     nothing of it is stored (no turn, no reply count, the attempt open,
 *     one ai_unavailable marker), then stored once with model_wait_ms when
 *     the model takes it; any other failure is recorded as before; a stored
 *     message or the opener gets reply_failed so the next ask goes at once;
 *     a refused grading lets go of its claim (back to active, or failed when
 *     it was owed), stores nothing, and a later send claims it again;
 *   - the server's own move to the next step (stepMoveOn.ts) asks
 *     trigger-ava-analysis with the request's JWT only when nobody else has:
 *     a closed tab in an auto-mode job is asked for after the grace; a page
 *     that already moved them, a manual job, or (before a voice interview)
 *     an analysis or employer notice that already landed asks nothing; a
 *     failed ask is tried once more unless the first one landed.
 *
 * Run with: node scripts/assessment_session_server.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "../supabase/functions/_shared/assessmentSession.ts";
import * as M from "../supabase/functions/_shared/stepMoveOn.ts";
import { cleanConnectionMarker } from "../supabase/functions/_shared/connectionStamps.ts";
import { phaseAiAnalysisFromStoredResult } from "../supabase/functions/ai-chat-simulation/grading.ts";
import { AiUnavailableError } from "../supabase/functions/_shared/openai.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20261005230146_assessment_record.sql");
// The computer and connection check (docs/EQUIPMENT-CHECK.md): adds the
// equipment_check step type the connection-test function records through
// this module.
const EQUIPMENT_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20261006124409_equipment_check.sql");

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

// Invented people (example.com), fixed ids.
const EMPLOYER = "10000000-0000-4000-8000-000000000001";
const OTHER_EMPLOYER = "10000000-0000-4000-8000-000000000002";
const TEAM_SCOPED = "10000000-0000-4000-8000-000000000003";
const TEAM_OTHER_JOB = "10000000-0000-4000-8000-000000000004";
const TEAM_INACTIVE = "10000000-0000-4000-8000-000000000005";
const CANDIDATE = "20000000-0000-4000-8000-000000000001";
const OTHER_CANDIDATE = "20000000-0000-4000-8000-000000000002";
const JOB = "30000000-0000-4000-8000-000000000001";
const OTHER_JOB = "30000000-0000-4000-8000-000000000002";
const APP = "40000000-0000-4000-8000-000000000001";
const OTHER_APP = "40000000-0000-4000-8000-000000000002";

const SCHEMA_SQL = `
  create schema auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create or replace function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
  $$;

  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant anon to postgres;
  grant authenticated to postgres;
  grant service_role to postgres;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant execute on function auth.role() to anon, authenticated, service_role;

  -- Supabase's live default privileges in public (pg_default_acl, read
  -- 2026-10-06): client roles get everything on new tables, sequences and
  -- functions; RLS and REVOKEs do the restricting.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

  create type public.application_status as enum
    ('pending', 'reviewing', 'interview', 'offered', 'hired', 'rejected', 'in_progress');
  create type public.notification_type as enum
    ('message', 'application', 'interview', 'status_update', 'team', 'system');

  create table public.profiles (
    user_id uuid primary key,
    email text,
    full_name text
  );

  create table public.jobs (
    id uuid primary key default gen_random_uuid(),
    employer_id uuid not null,
    title text not null,
    workflow_steps jsonb default '[]'::jsonb,
    quiz_questions jsonb default '[]'::jsonb,
    application_questions jsonb default '[]'::jsonb,
    processing_mode text default 'auto'
  );

  create table public.applications (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.jobs(id) on delete cascade,
    candidate_id uuid not null,
    status public.application_status not null default 'pending',
    phase text default 'application',
    notes text,
    voice_interview_result jsonb,
    phase_ai_analysis text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table public.team_members (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    employer_id uuid not null,
    status text default 'active',
    can_create_jobs boolean default false,
    can_delete_jobs boolean default false,
    can_manage_pipeline boolean default false,
    assigned_job_ids uuid[] default '{}'
  );

  create table public.notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    type public.notification_type not null,
    title text not null,
    message text not null,
    link text,
    is_read boolean not null default false,
    created_at timestamptz not null default now(),
    push_sent_at timestamptz
  );

  -- Live bodies (pg_get_functiondef, production, 2026-10-06).
  CREATE OR REPLACE FUNCTION public.is_job_owner(p_job_id uuid, p_user_id uuid)
   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$
    SELECT (p_user_id = auth.uid() OR auth.role() = 'service_role')
      AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = p_job_id AND j.employer_id = p_user_id);
  $function$;

  CREATE OR REPLACE FUNCTION public.is_active_team_member_for_job(p_job_id uuid, p_user_id uuid,
    p_require_manage_pipeline boolean DEFAULT false, p_require_create_jobs boolean DEFAULT false,
    p_require_delete_jobs boolean DEFAULT false)
   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$
    SELECT (p_user_id = auth.uid() OR auth.role() = 'service_role')
      AND EXISTS (
        SELECT 1
        FROM public.jobs j
        JOIN public.team_members tm ON tm.employer_id = j.employer_id
        WHERE j.id = p_job_id
          AND tm.user_id = p_user_id
          AND tm.status = 'active'
          AND (NOT p_require_manage_pipeline OR tm.can_manage_pipeline = true)
          AND (NOT p_require_create_jobs OR tm.can_create_jobs = true)
          AND (NOT p_require_delete_jobs OR tm.can_delete_jobs = true)
          AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY (tm.assigned_job_ids))
      );
  $function$;

  -- RLS the live tables already have, cut down to what this proof touches.
  alter table public.applications enable row level security;
  create policy "candidate reads own" on public.applications for select using (auth.uid() = candidate_id);
  create policy "candidate updates own" on public.applications for update using (auth.uid() = candidate_id);
  alter table public.notifications enable row level security;
  create policy "own notifications" on public.notifications for select using (auth.uid() = user_id);
  create policy "own notifications update" on public.notifications for update using (auth.uid() = user_id);

  create publication supabase_realtime;
  alter publication supabase_realtime add table public.applications, public.notifications;
`;

// ---------------------------------------------------------------------------
// A PostgREST-shaped client over PGlite, as one role.
// ---------------------------------------------------------------------------
function toRest(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toRest);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toRest(v);
    return out;
  }
  return value;
}

function makeClient(db, role, uid = "") {
  let queue = Promise.resolve();
  // One statement at a time, under the role, like separate HTTP requests.
  async function run(sql, params) {
    const job = queue.then(async () => {
      await db.exec("reset role;");
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
      await db.query("select set_config('request.jwt.claim.role', $1, false)", [role]);
      await db.exec(`set role ${role};`);
      try {
        const res = await db.query(sql, params);
        return { data: res.rows.map(toRest), error: null };
      } catch (e) {
        return { data: null, error: { code: e.code, message: e.message } };
      } finally {
        await db.exec("reset role;");
      }
    });
    queue = job.catch(() => {});
    return job;
  }

  function param(params, value) {
    if (value !== null && typeof value === "object") {
      params.push(JSON.stringify(value));
      return `$${params.length}::jsonb`;
    }
    params.push(value);
    return `$${params.length}`;
  }

  class Query {
    constructor(table) {
      this.table = table;
      this.op = "select";
      this.columns = "*";
      this.returning = null;
      this.filters = [];
      this.orders = [];
      this.max = null;
      this.values = null;
    }
    select(columns = "*") {
      if (this.op === "insert" || this.op === "update") this.returning = columns;
      else this.columns = columns;
      return this;
    }
    insert(values) {
      this.op = "insert";
      this.values = Array.isArray(values) ? values : [values];
      return this;
    }
    update(values) {
      this.op = "update";
      this.values = values;
      return this;
    }
    eq(column, value) {
      this.filters.push({ column, op: "eq", value });
      return this;
    }
    in(column, values) {
      this.filters.push({ column, op: "in", value: values });
      return this;
    }
    lt(column, value) {
      this.filters.push({ column, op: "lt", value });
      return this;
    }
    order(column, options = {}) {
      this.orders.push(`${column} ${options.ascending === false ? "desc" : "asc"}`);
      return this;
    }
    limit(count) {
      this.max = count;
      return this;
    }
    where(params) {
      if (!this.filters.length) return "";
      return " where " + this.filters.map((f) => {
        // PostgREST's JSON path (detail->>key) names the key, as a string.
        const column = f.column.replace(/->>(\w+)$/, "->>'$1'");
        if (f.op === "in") {
          params.push(`{${f.value.map((v) => `"${String(v).replace(/["\\]/g, (c) => `\\${c}`)}"`).join(",")}}`);
          return `${column}::text = any($${params.length}::text[])`;
        }
        if (f.op === "lt") return `${column} < ${param(params, f.value)}`;
        if (f.value === null) return `${column} is null`;
        return `${column} = ${param(params, f.value)}`;
      }).join(" and ");
    }
    async execute() {
      const params = [];
      let sql;
      if (this.op === "select") {
        sql = `select ${this.columns} from public.${this.table}${this.where(params)}`;
        if (this.orders.length) sql += ` order by ${this.orders.join(", ")}`;
        if (this.max != null) sql += ` limit ${Number(this.max)}`;
      } else if (this.op === "insert") {
        const keys = [...new Set(this.values.flatMap((row) => Object.keys(row)))];
        const rows = this.values.map((row) => `(${keys.map((k) => (row[k] === undefined ? "default" : param(params, row[k]))).join(", ")})`);
        sql = `insert into public.${this.table} (${keys.join(", ")}) values ${rows.join(", ")}`;
        if (this.returning) sql += ` returning ${this.returning}`;
      } else {
        const sets = Object.entries(this.values).map(([k, v]) => `${k} = ${param(params, v)}`);
        sql = `update public.${this.table} set ${sets.join(", ")}${this.where(params)}`;
        if (this.returning) sql += ` returning ${this.returning}`;
      }
      const res = await run(sql, params);
      if (res.error) return res;
      if (this.op !== "select" && !this.returning) return { data: null, error: null };
      return res;
    }
    maybeSingle() {
      return this.execute().then((res) => {
        if (res.error) return res;
        if (res.data.length > 1) return { data: null, error: { code: "PGRST116", message: "more than one row" } };
        return { data: res.data[0] ?? null, error: null };
      });
    }
    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }
  }

  return {
    from(table) {
      return new Query(table);
    },
    rpc(fn, args) {
      const params = [];
      const named = Object.entries(args).map(([k, v]) => `${k} => ${param(params, v)}`);
      return run(`select public.${fn}(${named.join(", ")}) as r`, params).then((res) =>
        res.error ? res : { data: res.data[0]?.r ?? null, error: null },
      );
    },
  };
}

// A client whose `op` on `table` fails the first `times` calls with `error`
// (a schema-cache reload, a full session), the rest passing through.
function failing(error) {
  const q = {
    then: (resolve, reject) => Promise.resolve({ data: null, error }).then(resolve, reject),
    maybeSingle: () => Promise.resolve({ data: null, error }),
  };
  for (const m of ["select", "eq", "in", "lt", "order", "limit", "insert", "update"]) q[m] = () => q;
  return q;
}
function flaky(client, table, op, times, error) {
  let calls = 0;
  return {
    calls: () => calls,
    client: {
      from(t) {
        const q = client.from(t);
        if (t !== table) return q;
        const real = q[op].bind(q);
        q[op] = (...args) => {
          calls += 1;
          return calls <= times ? failing(error) : real(...args);
        };
        return q;
      },
      rpc: (fn, args) => client.rpc(fn, args),
    },
  };
}

async function main() {
  const db = new PGlite();
  const migrationSql = await readFile(MIGRATION_PATH, "utf8");
  const equipmentSql = await readFile(EQUIPMENT_MIGRATION_PATH, "utf8");
  await db.exec(SCHEMA_SQL);

  const WORKFLOW = [
    // First, as on the live job (docs/EQUIPMENT-CHECK.md §2).
    { id: "step_connection", type: "equipment_check", title: "Your computer and connection" },
    { id: "step_typing", type: "typing_test", title: "Typing speed and accuracy" },
    { id: "step_chat", type: "chat_simulation", title: "Player chat practice" },
    { id: "step_interview", type: "chat_interview", title: "Written interview" },
    { id: "step_sales", type: "sales_simulation", title: "Sales practice" },
  ];
  await db.query(
    `insert into public.profiles (user_id, email, full_name) values
       ($1, 'owner@example.com', 'Owner Person'), ($2, 'robin@example.com', 'Robin Okafor')`,
    [EMPLOYER, CANDIDATE],
  );
  await db.query(
    `insert into public.jobs (id, employer_id, title, workflow_steps, quiz_questions, application_questions) values
       ($1, $2, 'Chat agent', $3, '[]', '[]'), ($4, $5, 'Other job', '[]', '[]', '[]')`,
    [JOB, EMPLOYER, JSON.stringify(WORKFLOW), OTHER_JOB, OTHER_EMPLOYER],
  );
  await db.query(
    `insert into public.applications (id, job_id, candidate_id, status, phase, notes) values
       ($1, $2, $3, 'reviewing', 'step_chat', '{}'),
       ($4, $2, $5, 'reviewing', 'step_chat', '{}')`,
    [APP, JOB, CANDIDATE, OTHER_APP, OTHER_CANDIDATE],
  );
  await db.exec(migrationSql);
  await db.exec(equipmentSql);

  const service = makeClient(db, "service_role");
  const candidate = makeClient(db, "authenticated", CANDIDATE);

  async function owner(sql, params = []) {
    await db.exec("reset role;");
    return (await db.query(sql, params)).rows;
  }
  const eventsOf = (sessionId) => owner(`select * from public.assessment_events where session_id = $1 order by seq`, [sessionId]);
  const sessionOf = async (id) => (await owner(`select * from public.assessment_sessions where id = $1`, [id]))[0];
  const setApp = (sql, params = []) => owner(`update public.applications set ${sql} where id = '${APP}'`, params);

  // =========================================================================
  console.log("Opening the attempt:\n");

  const base = { applicationId: APP, userId: CANDIDATE };
  const first = await A.resolveSession(service, { ...base, stepId: "step_chat", stepType: "chat_simulation", purpose: "turns" });
  check("no attempt yet: opened through open_assessment_session", first.ok && first.how === "opened" && first.session.status === "active" && first.session.attempt === 1, JSON.stringify(first));
  const chat = first.session;
  const markersAfterOpen = (await eventsOf(chat.id)).filter((e) => e.kind === "system").map((e) => e.detail.what);
  check("…with the database's own 'started' marker", A.resolveSession && markersAfterOpen.join() === "started", markersAfterOpen.join());
  const again = await A.resolveSession(service, { ...base, stepId: "step_chat", stepType: "chat_simulation", purpose: "turns" });
  const markersAfterReuse = (await eventsOf(chat.id)).filter((e) => e.kind === "system").length;
  check("the next message reuses it, with no 'reloaded' marker per message", again.ok && again.how === "existing" && again.session.id === chat.id && markersAfterReuse === 1);
  check("job_id and candidate_id came from the application (trigger)", (await sessionOf(chat.id)).job_id === JOB && (await sessionOf(chat.id)).candidate_id === CANDIDATE);

  const wrongType = await A.resolveSession(service, { ...base, stepId: "step_chat", stepType: "chat_interview", purpose: "turns" });
  check("a step of another type: refused, nothing written", !wrongType.ok && wrongType.reason === "wrong_step_type");
  const notReached = await A.resolveSession(service, { ...base, stepId: "step_interview", stepType: "chat_interview", purpose: "turns" });
  check("a step not reached yet: refused (HF003)", !notReached.ok && notReached.reason === "step_not_reached");
  const notTheirs = await A.resolveSession(service, { applicationId: OTHER_APP, userId: CANDIDATE, stepId: "step_chat", stepType: "chat_simulation", purpose: "turns" });
  check("someone else's application: refused (42501)", !notTheirs.ok && notTheirs.reason === "not_your_application");
  const noRows = await owner(`select count(*)::int as n from public.assessment_sessions where application_id = $1`, [OTHER_APP]);
  check("…and no attempt was opened for it", noRows[0].n === 0);

  // =========================================================================
  console.log("\nTurns:\n");

  const opener = await A.insertEvent(service, { sessionId: chat.id, kind: "assistant_turn", content: "My deposit is missing.", clientMsgId: "opener", detail: { role: "customer", model: "m" } });
  check("the opener is stored", opener.inserted && opener.seq != null);
  const openerAgain = await A.insertEvent(service, { sessionId: chat.id, kind: "assistant_turn", content: "A second opener", clientMsgId: "opener", detail: { role: "customer" } });
  check("a second opener inserts nothing (no error)", !openerAgain.inserted && openerAgain.error === null);

  // Page clocks near the real now: the contract keeps a page's time only
  // within [the attempt's start - 1 day, now + 10 min], so a fixed date
  // would pass on one day and fail on the next.
  const m1SentAt = new Date(Date.now() - 60_000).toISOString();
  const m1 = await A.recordCandidateTurn(service, chat.id, { content: "Sorry to hear that. Let me check.", clientMsgId: "m1", clientAt: m1SentAt, role: "agent" });
  check("the agent's message is stored with the history before it", m1.ok && m1.history.length === 1 && m1.history[0].client_msg_id === "opener" && m1.existingReply === null);
  const m1Retry = await A.recordCandidateTurn(service, chat.id, { content: "Sorry to hear that. Let me check.", clientMsgId: "m1", clientAt: null, role: "agent" });
  const candidateRows = (await eventsOf(chat.id)).filter((e) => e.kind === "candidate_turn");
  check("a retried message is stored once", m1Retry.ok && candidateRows.length === 1 && m1Retry.history.length === 1);
  check("…with the page's time and the role", candidateRows[0].client_at instanceof Date && candidateRows[0].client_at.toISOString() === m1SentAt && candidateRows[0].detail.role === "agent");
  const sessionAfterTurn = await sessionOf(chat.id);
  check("the trigger counted it and moved last activity", sessionAfterTurn.progress.candidate_turns === 1 && sessionAfterTurn.progress.assistant_turns === 1);

  // The streamed reply, stored in the background (EdgeRuntime.waitUntil).
  const waited = [];
  globalThis.EdgeRuntime = { waitUntil: (p) => waited.push(p) };
  const enc = new TextEncoder();
  const sse = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: "Can you " } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: { content: "fix it? [RESOLVED]" } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
    "data: [DONE]\n\n",
  ];
  let i = 0;
  const upstream = new ReadableStream({
    async pull(controller) {
      await new Promise((r) => setTimeout(r, 3));
      if (i < sse.length) controller.enqueue(enc.encode(sse[i++]));
      else controller.close();
    },
  });
  const toBrowser = A.teeAndRecordReply(service, upstream, { sessionId: chat.id, clientMsgId: A.replyMsgId("m1"), style: "customer", model: "gpt-test" });
  const reader = toBrowser.getReader();
  await reader.read();
  await reader.cancel("the tab closed");
  check("the save was handed to EdgeRuntime.waitUntil", waited.length === 1);
  await Promise.all(waited);
  delete globalThis.EdgeRuntime;
  const reply = (await eventsOf(chat.id)).find((e) => e.client_msg_id === "reply:m1");
  check("the reply is stored even though the browser left mid-stream", reply?.kind === "assistant_turn" && reply.content === "Can you fix it?", JSON.stringify(reply?.content));
  check("…marked resolved, with the model", reply?.detail.resolved === true && reply.detail.model === "gpt-test" && reply.detail.role === "customer");
  const m1Third = await A.recordCandidateTurn(service, chat.id, { content: "Sorry to hear that. Let me check.", clientMsgId: "m1", clientAt: null, role: "agent" });
  check("a retry after the reply was stored finds it (played back, not asked again)", m1Third.ok && m1Third.existingReply?.content === "Can you fix it?");

  const m2 = await A.recordCandidateTurn(service, chat.id, { content: "Done \u0000 refunded.", clientMsgId: "m2", clientAt: null, role: "agent" });
  check("the next message's history is the whole stored conversation", m2.ok && m2.history.map((t) => t.client_msg_id).join() === "opener,m1,reply:m1");
  const nulRow = (await eventsOf(chat.id)).find((e) => e.client_msg_id === "m2");
  check("a NUL in a message never reaches Postgres (stored as U+FFFD)", nulRow?.content === "Done \uFFFD refunded.");

  // End pressed right after the last reply streamed: its background save may still be in flight.
  const before = await A.loadTurns(service, chat.id);
  setTimeout(() => {
    A.insertEvent(service, { sessionId: chat.id, kind: "assistant_turn", content: "Thank you!", clientMsgId: "reply:m2", detail: { role: "customer", model: "m" } });
  }, 300);
  const settled = await A.settleTrailingReply(service, chat.id, before, { timeoutMs: 3000, intervalMs: 100 });
  check("grading waits for a reply still being saved", before.at(-1).client_msg_id === "m2" && settled.at(-1).client_msg_id === "reply:m2");
  const t0 = Date.now();
  const noWait = await A.settleTrailingReply(service, chat.id, settled, { timeoutMs: 3000 });
  check("…and does not wait when the conversation ends on a reply", noWait === settled && Date.now() - t0 < 50);

  const turns = await A.loadTurns(service, chat.id);
  check("loadTurns: only turns, in seq order", turns.map((t) => t.client_msg_id).join() === "opener,m1,reply:m1,m2,reply:m2" && turns.every((t, k) => k === 0 || turns[k - 1].seq < t.seq));
  const chosen = A.chooseTranscript(turns, [{ role: "user", content: "made up" }]);
  check("grading reads the stored conversation", chosen.source === "stored" && chosen.messages.length === 5 && chosen.messages[2].content === "Can you fix it?");
  check("the end reason reads the last reply", A.chatSimulationEndReason(turns) === "submitted" && A.chatSimulationEndReason(turns.slice(0, 3)) === "customer_resolved");

  // =========================================================================
  console.log("\nIntegrity from the page's own events:\n");

  const leftAt = new Date(Date.now() - 2 * 60_000).toISOString();
  const recorded = await candidate.rpc("record_integrity_events", {
    p_application_id: APP,
    p_step_id: "step_chat",
    p_events: [
      { kind: "tab_hidden", client_at: leftAt, duration_ms: 67000, id: "e1" },
      { kind: "window_blur", duration_ms: 300, id: "e2" },
      { kind: "paste", detail: { target: "reply" }, id: "e3" },
    ],
  });
  check("the candidate records three events", !recorded.error && recorded.data.accepted === 3, JSON.stringify(recorded));
  const rows = await A.loadIntegrityEvents(service, chat.id);
  const integrity = A.chooseIntegrity(rows, [{ type: "tab_switch", timestamp: "x", details: "from the page" }]);
  check("the notes' violations come from those events (blip left out)", integrity.source === "events" && integrity.violations.map((v) => v.type).join() === "tab_switch,paste_attempt", JSON.stringify(integrity));
  check("…the away episode with its length and the time they left", integrity.violations[0].details === "Left the test page for 1m 7s" && integrity.violations[0].timestamp === leftAt, JSON.stringify(integrity.violations[0]));

  // =========================================================================
  console.log("\nA message sent again while its reply is still streaming (a reload):\n");

  const background = [];
  globalThis.EdgeRuntime = { waitUntil: (p) => background.push(p) };
  const m3 = await A.recordCandidateTurn(service, chat.id, { content: "Let me look into that for you.", clientMsgId: "m3", clientAt: null, role: "agent" });
  check("a new message is stored, not a repeat", m3.ok && m3.repeat === false);
  // The first request's reply streams slowly; the page reloads after the first piece.
  const slow = ["REPLY ", "A, the one ", "they saw."];
  let k = 0;
  const slowUpstream = new ReadableStream({
    async pull(controller) {
      await new Promise((r) => setTimeout(r, 250));
      if (k < slow.length) controller.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: slow[k++] } }] })}\n\n`));
      else {
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });
  const firstBrowser = A.teeAndRecordReply(service, slowUpstream, { sessionId: chat.id, clientMsgId: A.replyMsgId("m3"), style: "customer", model: "gpt-test" }).getReader();
  await firstBrowser.read();
  // Not awaited: a tee branch's cancel settles only when the source ends (the
  // recording branch is still reading it), and nothing waits on a closed tab.
  const cancelled = firstBrowser.cancel("reloaded during the reply");
  // The reloaded page sends m3 again, under the same id.
  const m3Again = await A.recordCandidateTurn(service, chat.id, { content: "Let me look into that for you.", clientMsgId: "m3", clientAt: null, role: "agent" });
  check("the resend is a repeat whose reply is not stored yet", m3Again.ok && m3Again.repeat && m3Again.existingReply === null && typeof m3Again.storedAt === "string", JSON.stringify({ ok: m3Again.ok, repeat: m3Again.repeat, reply: m3Again.existingReply, storedAt: m3Again.storedAt }));
  const waitStart = Date.now();
  const inFlight = await A.awaitInFlightReply(service, chat.id, "m3", { intervalMs: 40 });
  check("it waits for the reply still streaming and plays THAT one back (no second model call)",
    inFlight.action === "replay" && inFlight.reply.content === "REPLY A, the one they saw.", JSON.stringify(inFlight));
  check("…as soon as it lands, not after the whole window", Date.now() - waitStart < 5000);
  await Promise.all([cancelled, ...background]);
  const m3Replies = (await eventsOf(chat.id)).filter((e) => e.client_msg_id === "reply:m3");
  check("the record keeps exactly the reply the applicant is shown", m3Replies.length === 1 && m3Replies[0].content === inFlight.reply.content);
  check("…and no second ask was recorded", !(await eventsOf(chat.id)).some((e) => e.kind === "system" && e.detail.reply_for === "m3"));

  // The model said nothing for m4: a failure marker, so a resend is answered at once.
  await A.recordCandidateTurn(service, chat.id, { content: "Anything else I can do?", clientMsgId: "m4", clientAt: null, role: "agent" });
  const empty = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  const emptyReader = A.teeAndRecordReply(service, empty, { sessionId: chat.id, clientMsgId: A.replyMsgId("m4"), style: "customer", model: "gpt-test" }).getReader();
  while (!(await emptyReader.read()).done) { /* drain */ }
  await Promise.all(background);
  const failedMarker = (await eventsOf(chat.id)).find((e) => e.kind === "system" && e.detail.reply_for === "m4");
  check("a reply with no text leaves a reply_failed marker (no reply row)", failedMarker?.detail.what === "reply_failed" && !(await eventsOf(chat.id)).some((e) => e.client_msg_id === "reply:m4"));
  const failStart = Date.now();
  const afterFail = await A.awaitInFlightReply(service, chat.id, "m4", { intervalMs: 40 });
  check("a resend after a failed ask is asked again at once", afterFail.action === "ask" && Date.now() - failStart < 1000, `${Date.now() - failStart} ms`);
  await A.markReplyAsked(service, chat.id, "m4");
  const reaskStart = Date.now();
  const afterReask = await A.awaitInFlightReply(service, chat.id, "m4", { intervalMs: 40, windowMs: 400 });
  check("a fresh ask after the failure is waited on (a third send does not ask at once)", afterReask.action === "ask" && Date.now() - reaskStart >= 250, `${Date.now() - reaskStart} ms`);
  const dead = await A.awaitInFlightReply(service, chat.id, "m4", { now: () => Date.now() + 60_000 });
  check("an ask older than the window is presumed dead: ask again", dead.action === "ask");
  delete globalThis.EdgeRuntime;

  // =========================================================================
  console.log("\nAn answer that will not store:\n");

  const once = flaky(service, "assessment_events", "insert", 1, { code: "PGRST102", message: "Empty or invalid json" });
  const m5 = await A.recordCandidateTurn(once.client, chat.id, { content: "One more thing.", clientMsgId: "m5", clientAt: null, role: "agent" }, { retryDelaysMs: [5, 5] });
  check("a transient failure is tried again and the answer stored once", m5.ok && !m5.repeat && once.calls() === 2 && (await eventsOf(chat.id)).filter((e) => e.client_msg_id === "m5").length === 1);
  const onceDefault = flaky(service, "assessment_events", "insert", 1, { code: "PGRST102", message: "Empty or invalid json" });
  const m8 = await A.recordCandidateTurn(onceDefault.client, chat.id, { content: "Still there?", clientMsgId: "m8", clientAt: null, role: "agent" });
  check("…with the default schedule too (no options)", m8.ok && onceDefault.calls() === 2);
  const always = flaky(service, "assessment_events", "insert", 10, { code: "PGRST102", message: "Empty or invalid json" });
  const m6 = await A.recordCandidateTurn(always.client, chat.id, { content: "Hello?", clientMsgId: "m6", clientAt: null, role: "agent" }, { retryDelaysMs: [5, 5] });
  check("still failing after three tries: turn_not_saved (the function answers 503 and the page sends it again)", !m6.ok && m6.reason === "turn_not_saved" && always.calls() === 3);
  const full = flaky(service, "assessment_events", "insert", 10, { code: "HF005", message: "session_full" });
  const m7 = await A.recordCandidateTurn(full.client, chat.id, { content: "Hello?", clientMsgId: "m7", clientAt: null, role: "agent" }, { retryDelaysMs: [5, 5] });
  check("a full session is never retried: turn_refused (carry on unrecorded)", !m7.ok && m7.reason === "turn_refused" && full.calls() === 1);

  // =========================================================================
  console.log("\nGrading and closing:\n");

  const gate1 = await A.gateGrading(service, chat, null);
  check("gateGrading: this request claims the open attempt (-> grading)", gate1.go && gate1.claim === "claimed" && gate1.fromStatus === "active" && (await sessionOf(chat.id)).status === "grading");
  const lost = await A.claimForGrading(service, chat);
  check("a second claim from the same read loses, and says who has it", lost.kind === "taken" && lost.status === "grading");
  const busy = await A.resolveSession(service, { ...base, stepId: "step_chat", stepType: "chat_simulation", purpose: "turns" });
  check("no turns go into an attempt being graded", !busy.ok && busy.reason === "session_busy");
  const retrySubmit = await A.resolveSession(service, { ...base, stepId: "step_chat", stepType: "chat_simulation", purpose: "submit" });
  check("a retried submit finds the same attempt", retrySubmit.ok && retrySubmit.session.id === chat.id && retrySubmit.session.status === "grading");
  // Two submits at once (the countdown and End, or a retry on a dropped connection).
  const secondGate = A.gateGrading(service, retrySubmit.session, null, { maxWaitMs: 5000, intervalMs: 40 });
  await new Promise((r) => setTimeout(r, 150));
  const done = await A.completeSession(service, chat.id, A.gradingRecord({ model: "gpt-test", promptVersion: "chat-sim-eval-1", fallback: false, result: { score: 81, communication: 77, overallFeedback: "Calm and clear." } }), "customer_resolved");
  const gate2 = await secondGate;
  check("the second submit waits for the first, then answers with the result on file (one grading, never two)", !gate2.go && gate2.why === "on_file", JSON.stringify(gate2));
  const closed = await sessionOf(chat.id);
  check("completeSession: completed, with the full grading and the end", done && closed.status === "completed" && closed.end_reason === "customer_resolved" && closed.ended_at instanceof Date && closed.grading.result.communication === 77);
  // phase_ai_analysis by now holds the hiring team's own analysis (a decline
  // note): the answer to the applicant must never carry it.
  await setApp(`notes = $1, phase_ai_analysis = 'Ava recommends declining: below the passing threshold.'`, [JSON.stringify({ chatSimulationResult: { score: 81, empathy: 70, problemSolving: 64 } })]);
  const finished = await A.resolveSession(service, { ...base, stepId: "step_chat", stepType: "chat_simulation", purpose: "turns" });
  check("once the result is on file: step_finished, nothing opened", !finished.ok && finished.reason === "step_finished");
  const replayed = await A.resolveSession(service, { ...base, stepId: "step_chat", stepType: "chat_simulation", purpose: "submit" });
  const replayGate = await A.gateGrading(service, replayed.ok ? replayed.session : null, replayed.ok ? null : replayed.reason);
  check("a submit replayed after that: answered from the record, never graded from its body", !replayed.ok && !replayGate.go && replayGate.why === "on_file");
  const onFile = await A.readStepOnFile(service, APP, "step_chat", "chatSimulationResult");
  check("…with the recorded result and the next step",
    onFile?.result?.score === 81 && onFile.next?.id === "step_interview", JSON.stringify(onFile));
  check("…and never the phase_ai_analysis column (the hiring team's analysis)",
    !!onFile && !("phaseAiAnalysis" in onFile) && !JSON.stringify(onFile).includes("declining"), JSON.stringify(onFile));
  check("the chat-practice answer rebuilds its summary from the stored scores instead",
    phaseAiAnalysisFromStoredResult(onFile?.result) === "Chat simulation: 81%. Empathy: 70%, Problem-solving: 64%."
      && phaseAiAnalysisFromStoredResult({ score: 81 }) === null && phaseAiAnalysisFromStoredResult(null) === null);
  const startView = await candidate.rpc("start_assessment_session", { p_application_id: APP, p_step_id: "step_chat" });
  check("the applicant's own start never sees the grading", !startView.error && !JSON.stringify(startView.data).includes("Calm and clear") && !("grading" in startView.data));

  // Release and fail, on the interview.
  await setApp(`phase = 'step_interview'`);
  const iv = await A.resolveSession(service, { ...base, stepId: "step_interview", stepType: "chat_interview", purpose: "submit" });
  check("the interview attempt opens for a submit (a page that never recorded turns)", iv.ok && iv.how === "opened");

  check("the first start asks for the greeting", (await A.askForOpener(service, iv.session.id)).first === true);
  check("a second start (a reload while it streams) does not ask again", (await A.askForOpener(service, iv.session.id)).first === false);
  setTimeout(() => {
    A.insertEvent(service, { sessionId: iv.session.id, kind: "assistant_turn", content: "Hi, thanks for joining.", clientMsgId: "opener", detail: { role: "interviewer", model: "m" } });
  }, 200);
  const openerWait = await A.awaitInFlightReply(service, iv.session.id, A.OPENER_ID, { intervalMs: 40 });
  check("…it waits for that greeting and hands it back", openerWait.action === "replay" && openerWait.reply.content === "Hi, thanks for joining.", JSON.stringify(openerWait));

  const ivGate = await A.gateGrading(service, iv.session, null);
  check("the interview attempt is claimed", ivGate.go && ivGate.claim === "claimed" && ivGate.fromStatus === "active");
  // A second submit arrives while this one holds it; this one then lets go.
  const heldRead = { ...iv.session, status: "grading", updated_at: new Date().toISOString() };
  const waiting = A.gateGrading(service, heldRead, null, { maxWaitMs: 5000, intervalMs: 40 });
  await new Promise((r) => setTimeout(r, 120));
  await A.releaseGrading(service, iv.session.id, ivGate.fromStatus);
  const handedOver = await waiting;
  check("a submit waiting on a claim that is let go claims it itself", handedOver.go && handedOver.claim === "claimed" && (await sessionOf(iv.session.id)).status === "grading", JSON.stringify(handedOver));
  const impatient = await A.gateGrading(service, heldRead, null, { maxWaitMs: 150, intervalMs: 40 });
  check("a submit that waits out another request's grading answers 'checking', never grades", !impatient.go && impatient.why === "checking");
  const liveRead = { id: iv.session.id, status: "grading", updated_at: (await sessionOf(iv.session.id)).updated_at.toISOString() };
  check("a live grading claim is never taken over", (await A.claimForGrading(service, liveRead)).kind === "taken");
  const claimedAtBefore = (await sessionOf(iv.session.id)).updated_at.getTime();
  const tookOver = await A.claimForGrading(service, liveRead, { now: () => Date.now() + A.STALE_GRADING_MS + 60_000 });
  check("a stale one is taken over (its request died), and the new owner's time is stamped",
    tookOver.kind === "claimed" && tookOver.fromStatus === "grading" && (await sessionOf(iv.session.id)).updated_at.getTime() >= claimedAtBefore);
  // Now that owner dies too, with no failSession (the worker was killed) and
  // nobody resending: the page sits on "being checked". After 7 untouched
  // minutes the database expires the claim by itself, so the applicant's
  // reload (start) reads 'failed', the page sends the test again (its "owed"
  // path), and the gate claims it from 'failed'.
  await owner(`alter table public.assessment_sessions disable trigger assessment_sessions_before_write`);
  await owner(`update public.assessment_sessions set updated_at = now() - interval '8 minutes' where id = $1`, [iv.session.id]);
  await owner(`alter table public.assessment_sessions enable trigger assessment_sessions_before_write`);
  const reloadAfterDeath = await candidate.rpc("start_assessment_session", { p_application_id: APP, p_step_id: "step_interview" });
  const expired = await sessionOf(iv.session.id);
  check("a claim dead for 8 minutes: the applicant's reload reads the same attempt as 'failed' (claim_expired), not 'being checked'",
    !reloadAfterDeath.error && reloadAfterDeath.data.session_id === iv.session.id && reloadAfterDeath.data.status === "failed"
      && reloadAfterDeath.data.finished === false && expired.status === "failed" && expired.grading?.last_error === "claim_expired",
    JSON.stringify(reloadAfterDeath));
  const resend = await A.resolveSession(service, { ...base, stepId: "step_interview", stepType: "chat_interview", purpose: "submit" });
  const resendGate = await A.gateGrading(service, resend.ok ? resend.session : null, resend.ok ? null : resend.reason);
  check("…and the page's resend is claimed from 'failed' and graded (one attempt, no new one)",
    resend.ok && resend.session.id === iv.session.id && resendGate.go && resendGate.claim === "claimed" && resendGate.fromStatus === "failed"
      && (await sessionOf(iv.session.id)).status === "grading", JSON.stringify(resendGate));
  await A.releaseGrading(service, iv.session.id, "active");
  check("releaseGrading: back to active (the step refused the result)", (await sessionOf(iv.session.id)).status === "active");
  check("claim again", (await A.claimForGrading(service, { id: iv.session.id, status: "active", updated_at: null })).kind === "claimed");
  await A.failSession(service, iv.session.id, "Failed to save step result: boom");
  const failedRow = await sessionOf(iv.session.id);
  check("failSession: failed, with the error kept", failedRow.status === "failed" && failedRow.grading.last_error.includes("boom"));
  const noTurnsIntoFailed = await A.resolveSession(service, { ...base, stepId: "step_interview", stepType: "chat_interview", purpose: "turns" });
  check("…takes no new turns", !noTurnsIntoFailed.ok && noTurnsIntoFailed.reason === "session_busy");
  const owed = await A.resolveSession(service, { ...base, stepId: "step_interview", stepType: "chat_interview", purpose: "submit" });
  check("…and a retried submit finishes that same attempt", owed.ok && owed.session.id === iv.session.id && owed.session.status === "failed");
  const owedClaim = await A.claimForGrading(service, owed.session);
  check("a claim from failed works", owedClaim.kind === "claimed" && owedClaim.fromStatus === "failed");
  const updateOnce = flaky(service, "assessment_sessions", "update", 1, { code: "PGRST102", message: "Empty or invalid json" });
  const completedOnRetry = await A.completeSession(updateOnce.client, iv.session.id, { result: { score: 64 } }, "ended_early", ["grading"], { retryDelayMs: 5 });
  const ivDone = await sessionOf(iv.session.id);
  check("completeSession is tried again once: the attempt is not left 'grading' by one failed write",
    completedOnRetry && updateOnce.calls() === 2 && ivDone.status === "completed" && ivDone.end_reason === "ended_early" && ivDone.grading.result.score === 64);

  // =========================================================================
  console.log("\nA transcript the page sent (a page on the previous build):\n");

  await setApp(`phase = 'step_sales'`);
  const sales = await A.resolveSession(service, { ...base, stepId: "step_sales", stepType: "sales_simulation", purpose: "submit" });
  check("the sales attempt opens", sales.ok);
  const sent = [
    { role: "assistant", content: "Hello, who is this?" },
    { role: "user", content: "Hi, this is Robin from Acme." },
    { role: "assistant", content: "Not interested." },
    { role: "user", content: "   " },
  ];
  const stored0 = await A.loadTurns(service, sales.session.id);
  const tail = A.unstoredTail(stored0, sent);
  check("nothing stored: the whole transcript is the tail", tail.offset === 0 && tail.messages.length === 4);
  check("stored in one insert", await A.storeSubmittedTranscript(service, sales.session.id, tail, { candidate: "agent", assistant: "customer" }));
  await A.storeSubmittedTranscript(service, sales.session.id, tail, { candidate: "agent", assistant: "customer" });
  const salesTurns = (await eventsOf(sales.session.id)).filter((e) => e.kind !== "system");
  check("in order, roles mapped, blank messages skipped, a retry adds nothing",
    salesTurns.map((e) => `${e.kind}:${e.detail.role}`).join() === "assistant_turn:customer,candidate_turn:agent,assistant_turn:customer" &&
    salesTurns.every((e) => e.detail.source === "submitted_transcript"),
    salesTurns.map((e) => `${e.kind}:${e.detail.role}:${e.client_msg_id}`).join());

  // =========================================================================
  console.log("\nTyping:\n");

  const typing = await A.resolveSession(service, { ...base, stepId: "step_typing", stepType: "typing_test", purpose: "submit" });
  check("an earlier, unfinished step is still reachable", typing.ok);
  const run1 = A.nextTypingContext(typing.session.context, { targetText: "The quick brown fox.", requiredWpm: 40, startedAt: "2026-10-06T15:00:00.000Z" });
  await A.updateContext(service, typing.session, run1.context);
  const run2 = A.nextTypingContext(typing.session.context, { targetText: "Customer service matters.", requiredWpm: 40, startedAt: "2026-10-06T15:02:00.000Z" });
  await A.updateContext(service, typing.session, run2.context);
  const ctx = (await sessionOf(typing.session.id)).context;
  check("the context holds both runs and the current passage", ctx.runs.length === 2 && ctx.target_text === "Customer service matters." && A.typingAttempts(ctx) === 2);
  // typing_test_starts.started_at as PostgREST returns it.
  const startedAt = "2026-10-06T15:02:00+00:00";
  const key = A.typingRunKey(startedAt);
  const snap = await A.insertEvent(service, {
    sessionId: typing.session.id,
    kind: "typing_snapshot",
    clientMsgId: key,
    detail: A.typingSnapshotDetail({ typedText: "Customer servce matters.", targetText: "Customer service matters.", wpm: 40, accuracy: 67, elapsedMs: 60100, final: false, run: A.typingRunFor(ctx, startedAt), endedBy: "time_up" }),
  });
  check("the run's snapshot is stored", snap.inserted);
  const found = await A.findEvent(service, typing.session.id, key);
  check("submit finds it by the run's start time", found?.detail.typed_text === "Customer servce matters." && found.detail.attempt_run === 2 && found.detail.ended_by === "time_up");
  check("…and grades that text, not a later one", A.chooseTypedText(found.detail, "something else").text === "Customer servce matters.");
  const typingProgress = (await sessionOf(typing.session.id)).progress;
  check("the trigger moved typing progress", typingProgress.typed_chars === "Customer servce matters.".length && typingProgress.elapsed_ms === 60100);
  check("completeSession completes only an attempt this request holds (grading)",
    !(await A.completeSession(service, typing.session.id, { result: {} }, "submitted")) && (await sessionOf(typing.session.id)).status === "active");
  const neverDone = flaky(service, "assessment_sessions", "update", 10, { code: "PGRST102", message: "Empty or invalid json" });
  check("two failed writes: false, not a throw", !(await A.completeSession(neverDone.client, typing.session.id, { result: {} }, "submitted", ["active"], { retryDelayMs: 5 })) && neverDone.calls() === 2);
  check("with no claim possible (the database refused it), the open attempt is completed",
    await A.finishGrading(service, typing.session.id, { claim: "none" }, { result: { wpm: 40 } }, "time_up") && (await sessionOf(typing.session.id)).status === "completed");

  // =========================================================================
  console.log("\nThe computer and connection check (connection-test):\n");
  {
    const conn = await A.resolveSession(service, { ...base, stepId: "step_connection", stepType: "equipment_check", purpose: "submit" });
    check(
      "resolveSession opens an attempt for an equipment_check step (the TS union, the access list and the CHECK agree)",
      conn.ok && conn.how === "opened" && conn.session.step_type === "equipment_check" && conn.access.step_type === "equipment_check",
      JSON.stringify(conn),
    );
    if (conn.ok) {
      const asTyping = await A.resolveSession(service, { ...base, stepId: "step_connection", stepType: "typing_test", purpose: "submit" });
      check("asked for as another type: wrong_step_type", !asTyping.ok && asTyping.reason === "wrong_step_type");
      const runEvent = await A.insertEvent(service, {
        sessionId: conn.session.id,
        kind: "system",
        clientMsgId: "srv:test_run:aaaaaaaaaaaaaaaa",
        detail: { what: "test_run", sent: true, run: 1, download_mbps: 28.4, upload_mbps: 9.1, latency_ms: 42 },
      });
      check("the server's test_run marker is stored as a system event", runEvent.inserted, JSON.stringify(runEvent.error));
      const runAgain = await A.insertEvent(service, { sessionId: conn.session.id, kind: "system", clientMsgId: "srv:test_run:aaaaaaaaaaaaaaaa", detail: { what: "test_run" } });
      check("…once per chain (idempotent on the chain's first nonce)", !runAgain.inserted && !runAgain.error);
      check("a system marker is not applicant activity", new Date((await sessionOf(conn.session.id)).last_activity_at).getTime() <= Date.parse(conn.session.started_at) + 1000);

      // connection-test?op=event: the page's markers as they happen, on the
      // live attempt ("turns": only an active one), keyed by the page.
      const live = await A.resolveSession(service, { ...base, stepId: "step_connection", stepType: "equipment_check", purpose: "turns" });
      check("a marker finds the live attempt", live.ok && live.how === "existing" && live.session.id === conn.session.id, JSON.stringify(live));
      if (live.ok) {
        await A.updateContext(service, live.session, { bars: { min_download_mbps: 10, min_upload_mbps: 3, max_latency_ms: 200 } });
        check("the job's bars are pinned on the attempt in the step config's shape", (await sessionOf(conn.session.id)).context.bars.min_download_mbps === 10);
        const marker = cleanConnectionMarker("computer_answer", { answer: "ran_here_anyway" });
        const key = A.cleanClientMsgId("pg-abc123:answer:ran_here_anyway");
        const first = await A.insertEvent(service, { sessionId: live.session.id, kind: "system", clientMsgId: key, detail: marker.detail });
        const again = await A.insertEvent(service, { sessionId: live.session.id, kind: "system", clientMsgId: key, detail: marker.detail });
        check("the page's marker is stored once under its own key (a retry writes nothing)", first.inserted && !again.inserted && !again.error, JSON.stringify([first, again]));
        check("…a page key may never take a server id", A.cleanClientMsgId("srv:test_run:aaaaaaaaaaaaaaaa") === null);
        const stored = (await eventsOf(live.session.id)).filter((e) => e.client_msg_id === key);
        check("…with the cleaned detail the staff timeline reads", stored.length === 1 && stored[0].detail.what === "computer_answer" && stored[0].detail.answer === "ran_here_anyway", JSON.stringify(stored));
      }
      const gateOpen = await A.gateGrading(service, conn.session, null);
      check("record claims the attempt", gateOpen.go && gateOpen.claim === "claimed");
      // The result lands the way connection-test records it (recordStepResult:
      // the key and the server-only marker), merged beside the other steps'.
      await setApp(`notes = (coalesce(notes, '{}')::jsonb || $1::jsonb)::text`, [
        JSON.stringify({
          equipmentCheckResult: { downloadMbps: 28.4, uploadMbps: 9.1, latencyMs: 42, jitterMs: 6, measuredBy: "server", meetsBars: true, below: [] },
          _trusted: { step_connection: { stepType: "equipment_check", completedAt: new Date().toISOString() } },
        }),
      ]);
      const grading = A.gradingRecord({
        model: null,
        promptVersion: "connection-stamps-1",
        fallback: false,
        result: { downloadMbps: 28.4, uploadMbps: 9.1, latencyMs: 42, jitterMs: 6 },
        extra: { stamps: [{ kind: "ping" }], ip: "203.0.113.9", userAgent: "ua", raw: { device_kind: "computer" } },
      });
      const done = await A.finishGrading(service, conn.session.id, gateOpen, grading, "submitted");
      const row = await sessionOf(conn.session.id);
      check("finishGrading completes it with end_reason submitted", done && row.status === "completed" && row.end_reason === "submitted", `${done} ${row.status} ${row.end_reason}`);
      check(
        "session.grading carries the stamps, the ip, the userAgent and the page's raw summary (staff-only)",
        Array.isArray(row.grading.stamps) && row.grading.ip === "203.0.113.9" && row.grading.userAgent === "ua" && row.grading.raw.device_kind === "computer" && row.grading.prompt_version === "connection-stamps-1",
        JSON.stringify(row.grading),
      );
      const finished = await A.resolveSession(service, { ...base, stepId: "step_connection", stepType: "equipment_check", purpose: "submit" });
      check("with the result on file the step is finished: a replayed record is never graded again", !finished.ok && finished.reason === "step_finished");
      const lateMarker = await A.resolveSession(service, { ...base, stepId: "step_connection", stepType: "equipment_check", purpose: "turns" });
      check("…and a marker after the send opens nothing (step_finished)", !lateMarker.ok && lateMarker.reason === "step_finished");
      const onFile = await A.readStepOnFile(service, APP, "step_connection", "equipmentCheckResult");
      check(
        "readStepOnFile hands back the recorded result and the step after it",
        onFile?.result?.downloadMbps === 28.4 && onFile.next !== "waiting" && onFile.next.id === "step_typing",
        JSON.stringify(onFile),
      );
    }
  }

  // =========================================================================
  console.log("\nLeft and back:\n");

  await owner(`update public.assessment_sessions set last_activity_at = now() - interval '40 minutes' where id = $1`, [sales.session.id]);
  const marked = await service.rpc("mark_stale_assessment_sessions", {});
  check("the sweep marks the quiet sales attempt as left", !marked.error && marked.data === 1 && (await sessionOf(sales.session.id)).status === "abandoned");
  const back = await A.resolveSession(service, { ...base, stepId: "step_sales", stepType: "sales_simulation", purpose: "turns" });
  check("a message revives it (no new attempt), with a 'came_back' marker",
    back.ok && back.session.id === sales.session.id && back.session.status === "active" &&
    (await eventsOf(sales.session.id)).some((e) => e.kind === "system" && e.detail.what === "came_back"));

  // =========================================================================
  console.log("\nThe server moves the applicant on itself (stepMoveOn.ts):\n");
  {
    const MOVER = "20000000-0000-4000-8000-000000000003";
    const JOB_VOICE = "30000000-0000-4000-8000-000000000003";
    const JOB_MANUAL = "30000000-0000-4000-8000-000000000004";
    const APP_MOVE = "40000000-0000-4000-8000-000000000003";
    const APP_VOICE = "40000000-0000-4000-8000-000000000004";
    const APP_MANUAL = "40000000-0000-4000-8000-000000000005";
    const URL_BASE = "http://supabase.test";
    const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const tokenFor = (claims) => `Bearer ${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(claims)}.c2ln`;
    const TOKEN = tokenFor({ sub: MOVER, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });
    const resultAt = new Date(Date.now() - 1000).toISOString();
    const recorded = (key, extra = {}) => JSON.stringify({ [key]: { score: 80 }, _trusted: { [extra.step]: { stepType: extra.type, completedAt: resultAt } } });

    await owner(
      `insert into public.jobs (id, employer_id, title, workflow_steps, quiz_questions, application_questions, processing_mode) values
         ($1, $2, 'Voice job', $3, '[]', '[]', 'auto'), ($4, $2, 'Manual job', $5, '[]', '[]', 'manual')`,
      [JOB_VOICE, EMPLOYER, JSON.stringify([
        { id: "step_typing", type: "typing_test", title: "Typing" },
        { id: "step_voice", type: "voice_interview", title: "Voice interview" },
      ]), JOB_MANUAL, JSON.stringify(WORKFLOW)],
    );
    await owner(
      `insert into public.applications (id, job_id, candidate_id, status, phase, notes) values
         ($1, $2, $3, 'reviewing', 'step_chat', $4),
         ($5, $6, $3, 'reviewing', 'step_typing', $7),
         ($8, $9, $3, 'reviewing', 'step_chat', $10)`,
      [APP_MOVE, JOB, MOVER, recorded("chatSimulationResult", { step: "step_chat", type: "chat_simulation" }),
        APP_VOICE, JOB_VOICE, recorded("typingTestResult", { step: "step_typing", type: "typing_test" }),
        APP_MANUAL, JOB_MANUAL, recorded("chatSimulationResult", { step: "step_chat", type: "chat_simulation" })],
    );

    // A fake trigger-ava-analysis and a fake clock: every ask is recorded,
    // every wait is instant (and may run the page's own work in between).
    function harness({ answers = [], onSleep = [] } = {}) {
      const asks = [];
      const waits = [];
      let clock = Date.now();
      return {
        asks,
        waits,
        deps: {
          now: () => clock,
          sleep: async (ms) => {
            waits.push(ms);
            clock += Math.max(0, ms);
            const hook = onSleep[waits.length - 1];
            if (hook) await hook();
          },
          fetch: async (url, init) => {
            asks.push({ url, init, body: JSON.parse(init.body) });
            const answer = answers[asks.length - 1] ?? { status: 200, body: { success: true, decision: "advanced" } };
            if (answer.before) await answer.before();
            if (answer.throws) throw new Error(answer.throws);
            return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status ?? 200 });
          },
        },
      };
    }
    const input = (applicationId, stepId, extra = {}) => ({ applicationId, stepId, authorization: TOKEN, supabaseUrl: URL_BASE, anonKey: "anon-key", ...extra });

    // A tab closed while chat practice was graded: the result is on file, nobody asked.
    const closedTab = harness();
    const closedOut = await M.runStepMoveOn(service, input(APP_MOVE, "step_chat"), closedTab.deps);
    check("a closed tab in an auto-mode job: the server asks trigger-ava-analysis after the grace",
      closedOut.kind === "asked" && closedOut.at === "first" && closedOut.ok && closedOut.decision === "advanced" && closedTab.asks.length === 1, JSON.stringify(closedOut));
    check("…once, after waiting 20 s for the page's own ask", closedTab.waits.length === 1 && closedTab.waits[0] === M.MOVE_ON_TIMING.graceMs, JSON.stringify(closedTab.waits));
    const sentAsk = closedTab.asks[0];
    check("…at trigger-ava-analysis, with the request's own JWT and the anon key",
      sentAsk.url === `${URL_BASE}/functions/v1/trigger-ava-analysis` && sentAsk.init.method === "POST" &&
      sentAsk.init.headers.Authorization === TOKEN && sentAsk.init.headers.apikey === "anon-key");
    check("…with exactly the page's body", JSON.stringify(sentAsk.body) === JSON.stringify({ applicationId: APP_MOVE, autopilotDecision: true, currentPhaseId: "step_chat" }), JSON.stringify(sentAsk.body));

    // The page was open: its own ask moved them on during the grace.
    const pageAsked = harness({ onSleep: [() => owner(`update public.applications set phase = 'step_interview' where id = $1`, [APP_MOVE])] });
    const pageOut = await M.runStepMoveOn(service, input(APP_MOVE, "step_chat"), pageAsked.deps);
    check("the page already moved them on: nothing asked (no second analysis)", pageOut.kind === "skipped" && pageOut.why === "already_moved_on" && pageAsked.asks.length === 0, JSON.stringify(pageOut));
    const elsewhere = harness({ onSleep: [() => owner(`update public.applications set phase = 'step_sales' where id = $1`, [APP_MOVE])] });
    const elsewhereOut = await M.runStepMoveOn(service, input(APP_MOVE, "step_chat"), elsewhere.deps);
    check("moved somewhere else meanwhile (staff): nothing asked", elsewhereOut.kind === "skipped" && elsewhereOut.why === "not_on_step" && elsewhere.asks.length === 0);
    await owner(`update public.applications set phase = 'step_chat', status = 'rejected' where id = $1`, [APP_MOVE]);
    const closedApp = harness();
    const closedAppOut = await M.runStepMoveOn(service, input(APP_MOVE, "step_chat"), closedApp.deps);
    check("a decided application: nothing asked", closedAppOut.kind === "skipped" && closedAppOut.why === "application_closed" && closedApp.asks.length === 0);
    await owner(`update public.applications set status = 'reviewing' where id = $1`, [APP_MOVE]);

    // A manual job is never asked with autopilotDecision: true.
    const manual = harness();
    const manualOut = await M.runStepMoveOn(service, input(APP_MANUAL, "step_chat"), manual.deps);
    check("a manual job: nothing asked, and no wait at all (read from the database at once)",
      manualOut.kind === "skipped" && manualOut.at === "start" && manualOut.why === "not_auto_mode" && manual.asks.length === 0 && manual.waits.length === 0, JSON.stringify(manualOut));
    const switched = harness({ onSleep: [() => owner(`update public.jobs set processing_mode = 'manual' where id = $1`, [JOB_VOICE])] });
    const switchedOut = await M.runStepMoveOn(service, input(APP_VOICE, "step_typing"), switched.deps);
    check("switched to manual during the grace: nothing asked", switchedOut.kind === "skipped" && switchedOut.why === "not_auto_mode" && switched.asks.length === 0);
    await owner(`update public.jobs set processing_mode = 'auto' where id = $1`, [JOB_VOICE]);

    // Before a voice interview the phase never moves: look again when an analysis would be saved.
    const voiceClosed = harness({ answers: [{ body: { success: true, decision: "needs_employer_approval" } }] });
    const voiceOut = await M.runStepMoveOn(service, input(APP_VOICE, "step_typing"), voiceClosed.deps);
    check("before a voice interview, nobody asked: asked at the late look (75 s)",
      voiceOut.kind === "asked" && voiceOut.at === "late" && voiceOut.decision === "needs_employer_approval" && voiceClosed.asks.length === 1 &&
      JSON.stringify(voiceClosed.waits) === JSON.stringify([M.MOVE_ON_TIMING.graceMs, M.MOVE_ON_TIMING.lateMs - M.MOVE_ON_TIMING.graceMs]), JSON.stringify({ voiceOut, waits: voiceClosed.waits }));
    const pageAnalysis = harness({
      onSleep: [null, () => owner(`update public.applications set notes = $2 where id = $1`, [APP_VOICE, JSON.stringify({
        typingTestResult: { score: 80 },
        _trusted: { step_typing: { stepType: "typing_test", completedAt: resultAt } },
        avaAnalysisMeta: { analysisStartedAt: new Date(Date.parse(resultAt) + 2000).toISOString(), triggeredByStep: "step_typing" },
      })])],
    });
    const pageAnalysisOut = await M.runStepMoveOn(service, input(APP_VOICE, "step_typing"), pageAnalysis.deps);
    check("…the page's own ask started an analysis that is saved by then: nothing asked (no second analysis, no second notice)",
      pageAnalysisOut.kind === "skipped" && pageAnalysisOut.at === "late" && pageAnalysisOut.why === "analysis_started" && pageAnalysis.asks.length === 0, JSON.stringify(pageAnalysisOut));
    await owner(`update public.applications set notes = $2 where id = $1`, [APP_VOICE, recorded("typingTestResult", { step: "step_typing", type: "typing_test" })]);
    await owner(`insert into public.notifications (user_id, type, title, message, link, created_at) values ($1, 'interview', 'Old', 'An older notice', $2, now() - interval '1 day')`, [EMPLOYER, `/applicants/${APP_VOICE}`]);
    const oldNotice = harness();
    const oldNoticeOut = await M.runStepMoveOn(service, input(APP_VOICE, "step_typing"), oldNotice.deps);
    check("…an interview notice from before this result does not count", oldNoticeOut.kind === "asked" && oldNotice.asks.length === 1, JSON.stringify(oldNoticeOut));
    const noticed = harness({
      onSleep: [() => owner(`insert into public.notifications (user_id, type, title, message, link) values ($1, 'interview', 'Candidate Ready for AIVA Interview', 'Robin scored N/A%', $2)`, [EMPLOYER, `/applicants/${APP_VOICE}`])],
    });
    const noticedOut = await M.runStepMoveOn(service, input(APP_VOICE, "step_typing"), noticed.deps);
    check("…the page's ask already told the employer (its analysis failed): nothing asked",
      noticedOut.kind === "skipped" && noticedOut.why === "employer_notified" && noticed.asks.length === 0, JSON.stringify(noticedOut));
    await owner(`delete from public.notifications where link = $1`, [`/applicants/${APP_VOICE}`]);
    const shortToken = harness();
    const shortOut = await M.runStepMoveOn(service, input(APP_VOICE, "step_typing", {
      authorization: tokenFor({ sub: MOVER, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 25 }),
    }), shortToken.deps);
    check("a token that would expire before the late look: one look, as the last chance, and asked in time",
      shortOut.kind === "asked" && shortOut.at === "first" && shortToken.waits.length === 1 && shortToken.waits[0] <= 10_000, JSON.stringify({ shortOut, waits: shortToken.waits }));

    // Asks that fail.
    const flakyAsk = harness({ answers: [{ status: 503, body: { error: "busy" } }, { status: 200, body: { success: true, decision: "advanced" } }] });
    const flakyOut = await M.runStepMoveOn(service, input(APP_MOVE, "step_chat"), flakyAsk.deps);
    check("a 503 is tried once more, after the retry pause", flakyOut.kind === "asked" && flakyOut.ok && flakyOut.tries === 2 && flakyAsk.asks.length === 2 && flakyAsk.waits.at(-1) === M.MOVE_ON_TIMING.retryDelayMs, JSON.stringify(flakyOut));
    const refusedAsk = harness({ answers: [{ status: 401, body: { error: "Invalid authentication token" } }] });
    const refusedOut = await M.runStepMoveOn(service, input(APP_MOVE, "step_chat"), refusedAsk.deps);
    check("a 401 is not tried again (and never throws)", refusedOut.kind === "asked" && !refusedOut.ok && refusedOut.status === 401 && refusedOut.tries === 1 && refusedAsk.asks.length === 1);
    const landed = harness({ answers: [{ throws: "connection reset", before: () => owner(`update public.applications set phase = 'step_interview' where id = $1`, [APP_MOVE]) }] });
    const landedOut = await M.runStepMoveOn(service, input(APP_MOVE, "step_chat"), landed.deps);
    check("a dropped connection whose ask landed anyway: not asked twice", landedOut.kind === "skipped" && landedOut.at === "retry" && landedOut.why === "already_moved_on" && landed.asks.length === 1, JSON.stringify(landedOut));
    await owner(`update public.applications set phase = 'step_chat' where id = $1`, [APP_MOVE]);
    const down = harness({ answers: [{ throws: "network down" }, { throws: "network down" }] });
    const downOut = await M.runStepMoveOn(service, input(APP_MOVE, "step_chat"), down.deps);
    check("the network down twice: two tries, a logged failure, no exception", downOut.kind === "asked" && !downOut.ok && downOut.status === null && downOut.tries === 2 && downOut.error === "network down");

    // Scheduling: after the response, never blocking it.
    const queued = [];
    globalThis.EdgeRuntime = { waitUntil: (p) => queued.push(p) };
    const scheduled = harness();
    check("scheduleStepMoveOn hands the task to EdgeRuntime.waitUntil and returns at once",
      M.scheduleStepMoveOn(service, input(APP_MOVE, "step_chat"), scheduled.deps) === true && queued.length === 1);
    await Promise.all(queued);
    check("…which asks as above", scheduled.asks.length === 1);
    check("no user token (the anon key, or none): nothing scheduled",
      !M.scheduleStepMoveOn(service, input(APP_MOVE, "step_chat", { authorization: tokenFor({ role: "anon", iss: "supabase" }) })) &&
      !M.scheduleStepMoveOn(service, input(APP_MOVE, "step_chat", { authorization: null })) && queued.length === 1);
    check("a manual job the caller already read: nothing scheduled", !M.scheduleStepMoveOn(service, input(APP_MOVE, "step_chat", { processingMode: "manual" })) && queued.length === 1);
    const brokenAdmin = { from: () => { throw new Error("database gone"); }, rpc: () => Promise.reject(new Error("database gone")) };
    check("a broken client: scheduled, and the task ends quietly", M.scheduleStepMoveOn(brokenAdmin, input(APP_MOVE, "step_chat"), harness().deps) === true);
    const brokenOut = await queued.at(-1);
    check("…without asking anything", brokenOut === undefined || brokenOut?.kind === "skipped");
    check("no client at all: nothing scheduled, no throw", M.scheduleStepMoveOn(null, input(APP_MOVE, "step_chat")) === false);
    delete globalThis.EdgeRuntime;
    const brokenRun = await M.runStepMoveOn(brokenAdmin, input(APP_MOVE, "step_chat"), harness().deps);
    check("runStepMoveOn over a broken client: 'unreadable', nothing asked", brokenRun.kind === "skipped" && brokenRun.why === "unreadable", JSON.stringify(brokenRun));
  }

  // =========================================================================
  console.log("\nWhen the AI service refuses (2026-10-07):\n");
  {
    // Its own applicant, so nothing above is disturbed.
    const OUTAGE_CANDIDATE = "20000000-0000-4000-8000-0000000000aa";
    const OUTAGE_APP = "40000000-0000-4000-8000-0000000000aa";
    await owner(
      `insert into public.applications (id, job_id, candidate_id, status, phase, notes) values ($1, $2, $3, 'reviewing', 'step_chat', '{}')`,
      [OUTAGE_APP, JOB, OUTAGE_CANDIDATE],
    );
    const target = { applicationId: OUTAGE_APP, userId: OUTAGE_CANDIDATE, stepId: "step_chat", stepType: "chat_simulation" };
    const opened = await A.resolveSession(service, { ...target, purpose: "turns" });
    check("an attempt for the outage applicant", opened.ok, JSON.stringify(opened));
    const s = opened.session;
    await A.insertEvent(service, { sessionId: s.id, kind: "assistant_turn", content: "My deposit is missing.", clientMsgId: "opener", detail: { role: "customer" } });
    const refusal = new AiUnavailableError("credit_exhausted", 'OpenAI stream error 429: {"error":{"type":"insufficient_quota","code":"credit_balance_exhausted"}}', 429);
    const turnsOf = async () => (await eventsOf(s.id)).filter((e) => e.kind === "candidate_turn");
    const systemOf = async (what) => (await eventsOf(s.id)).filter((e) => e.kind === "system" && e.detail.what === what);
    const before = await sessionOf(s.id);

    // A new message, refused: nothing of it is kept.
    check("a message never sent before is 'new' on the record", (await A.candidateTurnStatus(service, s.id, "o1")) === "new");
    const held1 = A.holdCandidateTurn({ content: "Let me check that for you.", clientMsgId: "o1", clientAt: null, role: "agent", typing: null });
    const r1 = await A.afterReplyAskFailed(service, s.id, { held: held1, replyId: A.replyMsgId("o1"), error: refusal });
    const afterRefusal = await sessionOf(s.id);
    check("the service refused a new message: 'ai_unavailable' (the function answers 503)", r1 === "ai_unavailable");
    check("…and NOTHING of the message is stored: no candidate_turn", (await turnsOf()).length === 0);
    check("…the reply count is untouched (staff never see a reply that was not sent)", !afterRefusal.progress?.candidate_turns, JSON.stringify(afterRefusal.progress));
    check("…the attempt stays open", afterRefusal.status === "active");
    check(
      "…activity unchanged (a marker is not the applicant's activity)",
      JSON.stringify(afterRefusal.last_activity_at) === JSON.stringify(before.last_activity_at),
    );
    const marker = (await systemOf("ai_unavailable"))[0];
    check(
      "…one ai_unavailable marker says when and why, for staff reading the timeline",
      marker?.detail.during === "reply" && marker.detail.message_id === "o1" && marker.detail.reason === "credit_exhausted",
      JSON.stringify(marker?.detail),
    );
    check("…still 'new': the page sends it again under the same id", (await A.candidateTurnStatus(service, s.id, "o1")) === "new");

    // The same message once the service is back: stored when the model takes it.
    const held1b = A.holdCandidateTurn({ content: "Let me check that for you.", clientMsgId: "o1", clientAt: null, role: "agent", typing: { charsTyped: 26 } }, 1_000);
    const stored1 = await A.storeHeldCandidateTurn(service, s.id, held1b, { now: () => 2_500 });
    const t1 = (await turnsOf()).find((e) => e.client_msg_id === "o1");
    check("the model took it: stored once, with the 1.5 s it was held (model_wait_ms)", stored1.ok && !stored1.repeat && t1?.detail.model_wait_ms === 1500, JSON.stringify(t1?.detail));
    check("…its keystroke summary kept beside it", t1?.detail.typing?.charsTyped === 26);
    check("…with the history before it (the opener)", stored1.ok && stored1.history?.length === 1 && stored1.history[0].client_msg_id === "opener");
    check("…now 'stored': a resend goes the way it always has", (await A.candidateTurnStatus(service, s.id, "o1")) === "stored");
    const again1 = await A.storeHeldCandidateTurn(service, s.id, held1b, { now: () => 3_000 });
    check("storing it a second time inserts nothing (idempotent on its id)", again1.ok && again1.repeat && (await turnsOf()).length === 1);
    check("the reply count says 1", (await sessionOf(s.id)).progress.candidate_turns === 1);

    // Any other failure: recorded exactly as before this change.
    const held2 = A.holdCandidateTurn({ content: "Is it there now?", clientMsgId: "o2", clientAt: null, role: "agent" }, Date.now() - 800);
    const r2 = await A.afterReplyAskFailed(service, s.id, { held: held2, replyId: A.replyMsgId("o2"), error: new Error("OpenAI stream error 400: bad request") });
    check("any other failure: 'failed' (the function answers 500, as before)", r2 === "failed");
    check("…the message is stored, as before (the page shows it as sent)", (await turnsOf()).some((e) => e.client_msg_id === "o2" && e.content === "Is it there now?"));
    check("…with its reply_failed marker", (await systemOf("reply_failed")).some((e) => e.detail.reply_for === "o2"));
    check("…so a resend asks the model again at once", (await A.awaitInFlightReply(service, s.id, "o2", { intervalMs: 10 })).action === "ask");

    // A message already on the record, its reply refused (a reload asking again).
    await A.markReplyAsked(service, s.id, "o2");
    const r3 = await A.afterReplyAskFailed(service, s.id, { held: null, replyId: A.replyMsgId("o2"), error: refusal });
    check("a stored message, refused: 'ai_unavailable', and the message stays", r3 === "ai_unavailable" && (await turnsOf()).some((e) => e.client_msg_id === "o2"));
    const failedForO2 = (await systemOf("reply_failed")).filter((e) => e.detail.reply_for === "o2");
    check("…its reply_failed says the service refused", failedForO2.at(-1)?.detail.reason?.startsWith("ai_unavailable (credit_exhausted)"), JSON.stringify(failedForO2.at(-1)?.detail));
    check("…and the next ask goes at once", (await A.awaitInFlightReply(service, s.id, "o2", { intervalMs: 10 })).action === "ask");

    // The opener, refused.
    const r4 = await A.afterReplyAskFailed(service, s.id, { held: null, replyId: A.OPENER_ID, error: refusal });
    check("the opener refused: 'ai_unavailable', marked so Start asks again at once", r4 === "ai_unavailable" && (await systemOf("reply_failed")).some((e) => e.detail.reply_for === "opener"));

    // Grading refused: the attempt is NOT finished, and can be sent again.
    const sub = await A.resolveSession(service, { ...target, purpose: "submit" });
    const g1 = await A.gateGrading(service, sub.ok ? sub.session : null, sub.ok ? null : sub.reason);
    check("grading claims the attempt", g1.go && g1.claim === "claimed" && (await sessionOf(s.id)).status === "grading");
    await A.refuseGradingForOutage(service, sub.session, g1, "credit_exhausted");
    const afterGrading = await sessionOf(s.id);
    check("grading refused by the service: back to open ('active'), never completed or failed", afterGrading.status === "active", afterGrading.status);
    check("…no grading stored, no end reason, no end time", afterGrading.grading == null && afterGrading.end_reason == null && afterGrading.ended_at == null, JSON.stringify({ g: afterGrading.grading, r: afterGrading.end_reason }));
    check("…every message still there", (await turnsOf()).length === 2);
    check("…an ai_unavailable marker for the grading", (await systemOf("ai_unavailable")).some((e) => e.detail.during === "grading" && e.detail.reason === "credit_exhausted"));
    const turnsAgain = await A.resolveSession(service, { ...target, purpose: "turns" });
    check("…the applicant can go on writing (the turns resolve to the same attempt)", turnsAgain.ok && turnsAgain.session.id === s.id);
    const sub2 = await A.resolveSession(service, { ...target, purpose: "submit" });
    const g2 = await A.gateGrading(service, sub2.ok ? sub2.session : null, null);
    check("…and a later send claims it again (resumable)", g2.go && g2.claim === "claimed");
    await A.releaseGrading(service, s.id, g2.fromStatus);

    // A send still owed after a crash ('failed'), refused: still owed.
    await owner(`update public.assessment_sessions set status = 'failed' where id = $1`, [s.id]);
    const sub3 = await A.resolveSession(service, { ...target, purpose: "submit" });
    const g3 = await A.gateGrading(service, sub3.ok ? sub3.session : null, null);
    await A.refuseGradingForOutage(service, sub3.session, g3, "rate_limited");
    check("a send still owed ('failed'), refused: back to 'failed' (the page sends it again on its next visit)", g3.go && g3.fromStatus === "failed" && (await sessionOf(s.id)).status === "failed");
    check("refuseGradingForOutage with no attempt does nothing and never throws", (await A.refuseGradingForOutage(service, null, { claim: "none", fromStatus: null }, "x")) === undefined);

    // The record cannot be read: the old path (store first) decides.
    const unreadable = flaky(service, "assessment_events", "select", 1, { code: "57014", message: "statement timeout" });
    check("a lookup that fails: 'unknown' (the function stores first, as before)", (await A.candidateTurnStatus(unreadable.client, s.id, "o9")) === "unknown");
  }

  // =========================================================================
  console.log("\nNot deployed yet, and a closed application:\n");

  const missing = {
    from: () => ({ select: () => ({ eq() { return this; }, order() { return this; }, limit() { return this; }, then: (r) => r({ data: [], error: null }) }) }),
    rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }),
  };
  const nd = await A.resolveSession(missing, { ...base, stepId: "step_chat", stepType: "chat_simulation", purpose: "turns" });
  check("a missing function reads as not_deployed (recording simply stops)", !nd.ok && nd.reason === "not_deployed");
  const thrower = { from: () => { throw new Error("network down"); }, rpc: () => Promise.reject(new Error("network down")) };
  let threw = false;
  try {
    const r = await A.loadTurns(thrower, "x");
    check("a client that throws never throws through the module", r === null);
  } catch {
    threw = true;
  }
  check("…(no exception escaped)", !threw);
  await setApp(`status = 'rejected'`);
  const closedApp = await A.resolveSession(service, { ...base, stepId: "step_sales", stepType: "sales_simulation", purpose: "turns" });
  check("a rejected application: refused (HF001)", !closedApp.ok && closedApp.reason === "application_closed");

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
