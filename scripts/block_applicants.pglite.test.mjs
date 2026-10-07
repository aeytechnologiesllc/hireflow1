#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20261007022249_block_applicants.sql
 * (Remove and block) — plain assertions against a real Postgres, not a text
 * match.
 *
 * The owner, with a live job taking applications: "give me a nicer, easier
 * way to drop down to delete some of these applicants. And that will just
 * block them too." This proves the database half:
 *
 *   1. Who may call block_applicant: the job's owner and an active team
 *      member who may manage that job's pipeline. Not anon, not a stranger,
 *      not the candidate, not a team member without the pipeline permission
 *      or without that job.
 *   2. What it does: the application is rejected (rejected_by / _type set),
 *      notes.blocked = {at, by} lands beside every other notes key, the
 *      person's other OPEN applications to this employer go too (interview
 *      and other employers' are left alone), their form attempt is closed as
 *      'blocked' (not 'submitted'), and the block row holds the account, the
 *      lower-case email, its alias-free email_key and the form phone's
 *      digits (from another of their applications to this employer when the
 *      clicked one has none).
 *   3. It tells the candidate nothing: no notifications row and no push
 *      (net.http_post) — while an ordinary rejection right after it, in the
 *      same transaction, still notifies (the flag is switched off again).
 *   4. The guard refuses a new application by the same account or the same
 *      email (Gmail's dots, googlemail.com and any +tag included), with "We
 *      can't take an application from this account." and HINT
 *      applicant_blocked; a PHONE never refuses (it is flagged on the staff
 *      list instead); an unrelated employer and an unrelated person are not
 *      affected; and a broken check lets the application through.
 *   5. unblock_applicant: a stranger removes nothing; the owner removes the
 *      block, the person can apply again, and their old application stays
 *      rejected.
 *   6. RLS on blocked_applicants: anon is refused; a stranger and the
 *      candidate see nothing; a team member limited to other jobs does not
 *      see someone who never applied to theirs; the owner sees the row.
 *      Nobody writes it directly (no INSERT, UPDATE or DELETE grant): not a
 *      candidate stuffing it, not the owner, not a team member limited to
 *      one job typing in someone else's email. An email over 320 characters
 *      is refused even by the server.
 *   7. block_applicants: one batch, skipping what the caller may not decide
 *      on, and refusing more than 200.
 *   8. No email path in the client: the block hook never reaches
 *      useUpdateApplication / notifyStatusRejected (the browser-side sender
 *      of the rejection email).
 *
 * The migration is read from disk and applied twice (it must be re-runnable),
 * each time inside a transaction whose locks are read: the first run may
 * hold only the trigger's SHARE ROW EXCLUSIVE lock on applications, a re-run
 * none at all, and lock_timeout is put back afterwards.
 * anon / authenticated / service_role are real, separate roles, so RLS and
 * GRANT/REVOKE are genuinely in force.
 *
 * Run with: node scripts/block_applicants.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = path.join(ROOT, "supabase/migrations/20261007022249_block_applicants.sql");
const MERGE_MIGRATION = path.join(ROOT, "supabase/migrations/20261005180943_merge_application_notes.sql");

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
const show = (v) => JSON.stringify(v);

// ── People and jobs ─────────────────────────────────────────────────────────
const EMP_1 = "10000000-0000-4000-8000-000000000001"; // owns JOB_A, JOB_B
const EMP_2 = "10000000-0000-4000-8000-000000000002"; // owns JOB_X (unrelated)
const TEAM_PIPE = "10000000-0000-4000-8000-0000000000a1"; // EMP_1, may manage pipeline, every job
const TEAM_VIEW = "10000000-0000-4000-8000-0000000000a2"; // EMP_1, view only
const TEAM_JOB_B = "10000000-0000-4000-8000-0000000000a3"; // EMP_1, pipeline, JOB_B only
const STRANGER = "10000000-0000-4000-8000-0000000000ff";

const SPAMMER = "20000000-0000-4000-8000-000000000001";
const SPAMMER_EMAIL_TWIN = "20000000-0000-4000-8000-000000000002"; // profile email = spammer's
const SPAMMER_PHONE_TWIN = "20000000-0000-4000-8000-000000000003"; // profile phone = spammer's, national format
const SPAMMER_PAST_PHONE = "20000000-0000-4000-8000-000000000004"; // typed the same phone on an earlier application elsewhere
const HONEST = "20000000-0000-4000-8000-000000000005";
const SECOND = "20000000-0000-4000-8000-000000000006"; // blocked by a team member
const PASSED = "20000000-0000-4000-8000-000000000007"; // passed the ordinary way, for the contrast
const LATE = "20000000-0000-4000-8000-000000000008"; // blocked before reaching JOB_A's form; typed a phone on JOB_B
const MARIA = "20000000-0000-4000-8000-000000000010"; // a Gmail address, blocked
const MARIA_NODOTS = "20000000-0000-4000-8000-000000000011";
const MARIA_TAG = "20000000-0000-4000-8000-000000000012";
const MARIA_GOOGLEMAIL = "20000000-0000-4000-8000-000000000013";
const MARIA_OTHER_DOMAIN = "20000000-0000-4000-8000-000000000014";
const MARIA_OTHER_NAME = "20000000-0000-4000-8000-000000000015";
const MARIA_CAPS = "20000000-0000-4000-8000-000000000016";

const JOB_A = "30000000-0000-4000-8000-00000000000a";
const JOB_B = "30000000-0000-4000-8000-00000000000b";
const JOB_C = "30000000-0000-4000-8000-00000000000c";
const JOB_X = "30000000-0000-4000-8000-0000000000aa";

const APP_SPAM_A = "40000000-0000-4000-8000-000000000001"; // spammer on JOB_A, pending
const APP_SPAM_B = "40000000-0000-4000-8000-000000000002"; // spammer on JOB_B, in_progress (also goes)
const APP_SPAM_X = "40000000-0000-4000-8000-000000000003"; // spammer on EMP_2's job (untouched)
const APP_PAST_X = "40000000-0000-4000-8000-000000000004"; // SPAMMER_PAST_PHONE on EMP_2's job, phone typed
const APP_HONEST_A = "40000000-0000-4000-8000-000000000005";
const APP_SECOND_B = "40000000-0000-4000-8000-000000000006";
const APP_SECOND_C = "40000000-0000-4000-8000-000000000007"; // interview on JOB_C (left alone)
const APP_PASSED_A = "40000000-0000-4000-8000-000000000008";
const APP_LATE_A = "40000000-0000-4000-8000-000000000009"; // in_progress, nothing typed yet
const APP_LATE_B = "40000000-0000-4000-8000-00000000000a"; // pending, phone typed
const APP_MARIA_A = "40000000-0000-4000-8000-00000000000b";
const FORM_SPAM_B = "60000000-0000-4000-8000-000000000001"; // the spammer's form attempt on JOB_B, still open
const FORM_HONEST_B = "60000000-0000-4000-8000-000000000002";

const SPAM_NOTES = JSON.stringify({
  applicationAnswers: [
    { questionId: "q1", question: "Full name", type: "text", answer: "Spam Bot" },
    { questionId: "q2", question: "Phone / WhatsApp", type: "phone", answer: "+63 917 123 4567" },
    { questionId: "q3", question: "Where are you based?", type: "text", answer: "Manila, Philippines" },
  ],
  quizResult: { score: 3 },
});
const PAST_NOTES = JSON.stringify({
  applicationAnswers: [{ questionId: "p", question: "Your WhatsApp number", type: "text", answer: "0917-123-4567" }],
});

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text, phone text);
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
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant execute on function auth.role() to anon, authenticated, service_role;
    -- As on Supabase: client roles reach every new public table and function
    -- by default; RLS and REVOKEs do the restricting.
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

    create type public.application_status as enum ('pending', 'reviewing', 'interview', 'offered', 'hired', 'rejected', 'in_progress');
    create type public.notification_type as enum ('message', 'application', 'interview', 'status_update', 'team', 'system');

    create table public.profiles (
      user_id uuid primary key, email text not null, full_name text, phone text, company_name text
    );
    create table public.jobs (id uuid primary key, employer_id uuid not null, title text not null);
    create table public.team_members (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null, employer_id uuid not null,
      status text default 'active',
      can_manage_pipeline boolean default false,
      assigned_job_ids uuid[] default '{}'
    );
    create table public.applications (
      id uuid primary key default gen_random_uuid(),
      job_id uuid not null references public.jobs(id),
      candidate_id uuid not null,
      status public.application_status not null default 'pending',
      phase text default 'application',
      notes text,
      rejected_by uuid,
      rejected_by_type text check (rejected_by_type is null or rejected_by_type in ('user', 'team_member', 'ava')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (job_id, candidate_id)
    );
    create table public.notifications (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      type public.notification_type not null,
      title text not null, message text not null, link text,
      is_read boolean not null default false,
      created_at timestamptz not null default now()
    );

    -- pg_net stand-in: every push the database would send is recorded here.
    create schema net;
    create table public.net_calls (id serial primary key, url text, body jsonb);
    create function net.http_post(url text, body jsonb, headers jsonb) returns bigint
      language plpgsql security definer as $$
      begin insert into public.net_calls (url, body) values (url, body); return 1; end; $$;

    -- The live helpers (pg_get_functiondef, production, 2026-10-07).
    create or replace function public.is_job_owner(p_job_id uuid, p_user_id uuid)
    returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
      select (p_user_id = auth.uid() or auth.role() = 'service_role')
        and exists (select 1 from public.jobs j where j.id = p_job_id and j.employer_id = p_user_id);
    $$;
    create or replace function public.is_active_team_member_for_job(p_job_id uuid, p_user_id uuid, p_require_manage_pipeline boolean default false, p_require_create_jobs boolean default false, p_require_delete_jobs boolean default false)
    returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
      select (p_user_id = auth.uid() or auth.role() = 'service_role')
        and exists (
          select 1 from public.jobs j join public.team_members tm on tm.employer_id = j.employer_id
           where j.id = p_job_id and tm.user_id = p_user_id and tm.status = 'active'
             and (not p_require_manage_pipeline or tm.can_manage_pipeline = true)
             and (array_length(tm.assigned_job_ids, 1) is null or j.id = any (tm.assigned_job_ids))
        );
    $$;
    create or replace function public.assessment_notes_object(p_notes text)
    returns jsonb language plpgsql immutable set search_path to 'public', 'pg_temp' as $$
    declare v_trimmed text; v_parsed jsonb;
    begin
      v_trimmed := btrim(coalesce(p_notes, ''), E' \\t\\r\\n');
      if v_trimmed = '' then return '{}'::jsonb; end if;
      begin v_parsed := v_trimmed::jsonb;
      exception when others then
        begin v_parsed := replace(v_trimmed, E'\\\\u0000', E'\\\\ufffd')::jsonb;
        exception when others then return '{}'::jsonb; end;
      end;
      if jsonb_typeof(v_parsed) = 'object' then return v_parsed; end if;
      return '{}'::jsonb;
    end; $$;

    create or replace function public.update_updated_at_column() returns trigger language plpgsql as $$
    begin new.updated_at = now(); return new; end; $$;
    create trigger update_applications_updated_at before update on public.applications
      for each row execute function public.update_updated_at_column();

    -- A cut-down protect_application_columns with the live order: service
    -- role, then the job's owner or a pipeline team member, pass; a candidate
    -- cannot change status once rejected.
    create or replace function public.protect_application_columns() returns trigger
    language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
    begin
      if auth.role() = 'service_role' then return new; end if;
      if public.is_job_owner(old.job_id, auth.uid()) or public.is_active_team_member_for_job(old.job_id, auth.uid(), true) then
        return new;
      end if;
      if auth.uid() is distinct from old.candidate_id then return new; end if;
      if new.status is distinct from old.status and old.status in ('rejected', 'offered', 'hired') then
        raise exception 'Candidates cannot change application status once it is %', old.status;
      end if;
      return new;
    end; $$;
    create trigger protect_applications_candidate_writes before update on public.applications
      for each row execute function public.protect_application_columns();

    -- The live push trigger.
    create or replace function public.trigger_push_notification() returns trigger
    language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
    begin
      begin
        perform net.http_post(url := 'https://example.test/functions/v1/send-push-notification',
          body := jsonb_build_object('notification_id', new.id), headers := jsonb_build_object('Content-Type', 'application/json'));
      exception when others then raise log 'skipped: %', sqlerrm;
      end;
      return new;
    end; $$;
    create trigger on_notification_inserted after insert on public.notifications
      for each row execute function public.trigger_push_notification();

    -- The live applications policies a write here goes through.
    alter table public.applications enable row level security;
    create policy "Candidates can view their own applications" on public.applications for select using (auth.uid() = candidate_id);
    create policy "Candidates can create applications" on public.applications for insert with check (auth.uid() = candidate_id);
    create policy "Candidates can update their own applications" on public.applications for update using (auth.uid() = candidate_id) with check (auth.uid() = candidate_id);
    create policy "Employers can view applications to their jobs" on public.applications for select to authenticated using (public.is_job_owner(job_id, auth.uid()));
    create policy "Employers can update applications to their jobs" on public.applications for update to authenticated using (public.is_job_owner(job_id, auth.uid()));
    create policy "Team members can view applications for assigned jobs" on public.applications for select to authenticated using (public.is_active_team_member_for_job(job_id, auth.uid()));
    create policy "Team members can update applications if permitted" on public.applications for update to authenticated using (public.is_active_team_member_for_job(job_id, auth.uid(), true));
  `);

  // The form attempt and its events, with the live trigger that closes it
  // when the application leaves in_progress (pg_get_functiondef, production,
  // 2026-10-07: the body BEFORE this migration restates it).
  await db.exec(`
    create table public.assessment_sessions (
      id uuid primary key default gen_random_uuid(),
      application_id uuid not null references public.applications(id) on delete cascade,
      step_id text not null,
      status text not null default 'active',
      end_reason text,
      started_at timestamptz default now(),
      last_activity_at timestamptz,
      hidden_at timestamptz,
      ended_at timestamptz
    );
    create table public.assessment_events (
      id uuid primary key default gen_random_uuid(),
      session_id uuid not null references public.assessment_sessions(id) on delete cascade,
      kind text not null,
      detail jsonb not null default '{}'::jsonb
    );
    create or replace function public.assessment_application_form_submitted() returns trigger
    language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
    declare v_ids uuid[];
    begin
      begin
        with done as (
          update public.assessment_sessions s
             set status = 'completed', ended_at = now(), end_reason = 'submitted',
                 last_activity_at = now(), hidden_at = null
           where s.application_id = new.id and s.step_id = 'application' and s.status in ('active', 'abandoned')
          returning s.id
        )
        select array_agg(id) into v_ids from done;
        if v_ids is not null then
          insert into public.assessment_events (session_id, kind, detail)
          select unnest(v_ids), 'system', jsonb_build_object('what', 'submitted');
        end if;
      exception when others then
        raise log 'assessment_application_form_submitted skipped for application %: %', new.id, sqlerrm;
      end;
      return new;
    end; $function$;
    create trigger assessment_application_form_submitted after update of status on public.applications
      for each row when (old.status = 'in_progress' and new.status is distinct from 'in_progress')
      execute function public.assessment_application_form_submitted();
  `);

  // merge_application_notes, verbatim (block_applicant writes through it).
  await db.exec(await readFile(MERGE_MIGRATION, "utf8"));

  // notify_application_status_change as it is live BEFORE this migration
  // (the migration restates it with the block flag). Its trigger is the live one.
  await db.exec(`
    create or replace function public.notify_application_status_change() returns trigger
    language plpgsql security definer set search_path to 'public' as $function$
    declare job_title text; notification_title text; notification_message text; notification_type notification_type;
    begin
      if new.status is distinct from old.status then
        select j.title into job_title from jobs j where j.id = new.job_id;
        case new.status
          when 'rejected' then notification_title := 'Application update'; notification_message := 'A decision was made.'; notification_type := 'status_update';
          else return new;
        end case;
        insert into notifications (user_id, type, title, message, link, is_read)
        values (new.candidate_id, notification_type, notification_title, notification_message, '/x', false);
      end if;
      return new;
    end; $function$;
    create trigger on_application_status_change after update on public.applications
      for each row when (old.status is distinct from new.status) execute function public.notify_application_status_change();
  `);

  // ── Seed ──
  const users = [
    [EMP_1, "owner@cafe.example", null],
    [EMP_2, "owner@other.example", null],
    [TEAM_PIPE, "pipe@cafe.example", null],
    [TEAM_VIEW, "view@cafe.example", null],
    [TEAM_JOB_B, "jobb@cafe.example", null],
    [STRANGER, "stranger@example.com", null],
    [SPAMMER, "Spam.Bot@Example.COM", null],
    [SPAMMER_EMAIL_TWIN, "fresh@example.com", null],
    [SPAMMER_PHONE_TWIN, "phone-twin@example.com", null],
    [SPAMMER_PAST_PHONE, "past-phone@example.com", null],
    [HONEST, "honest@example.com", null],
    [SECOND, "second@example.com", null],
    [PASSED, "passed@example.com", null],
    [LATE, "late@example.com", null],
    [MARIA, "Maria.Santos@gmail.com", null],
    [MARIA_NODOTS, "mariasantos@gmail.com", null],
    [MARIA_TAG, "maria.santos+jobs@gmail.com", null],
    [MARIA_GOOGLEMAIL, "maria.santos@googlemail.com", null],
    [MARIA_OTHER_DOMAIN, "maria.santos@outlook.com", null],
    [MARIA_OTHER_NAME, "mariasantos2@gmail.com", null],
    [MARIA_CAPS, " MARIA.SANTOS@GMAIL.COM ", null],
  ];
  for (const [id, email, phone] of users) await db.query(`insert into auth.users (id, email, phone) values ($1, $2, $3)`, [id, email, phone]);
  await db.query(`insert into public.profiles (user_id, email, full_name, phone) values
    ($1, 'spam.bot@example.com', 'Spam Bot', null),
    ($2, 'spam.bot@example.com', 'Email Twin', null),
    ($3, 'phone-twin@example.com', 'Phone Twin', '0917 123 4567'),
    ($4, 'past-phone@example.com', 'Past Phone', null),
    ($5, 'honest@example.com', 'Honest Person', '+1 555 010 0199')`, [SPAMMER, SPAMMER_EMAIL_TWIN, SPAMMER_PHONE_TWIN, SPAMMER_PAST_PHONE, HONEST]);
  await db.query(`insert into public.jobs (id, employer_id, title) values ($1,$2,'Barista'),($3,$2,'Cook'),($4,$2,'Host'),($5,$6,'Other job')`, [JOB_A, EMP_1, JOB_B, JOB_C, JOB_X, EMP_2]);
  await db.query(
    `insert into public.team_members (user_id, employer_id, status, can_manage_pipeline, assigned_job_ids) values
       ($1, $4, 'active', true, '{}'), ($2, $4, 'active', false, '{}'), ($3, $4, 'active', true, $5::uuid[])`,
    [TEAM_PIPE, TEAM_VIEW, TEAM_JOB_B, EMP_1, `{${JOB_B}}`],
  );
  const apps = [
    [APP_SPAM_A, JOB_A, SPAMMER, "pending", SPAM_NOTES],
    [APP_SPAM_B, JOB_B, SPAMMER, "in_progress", null],
    [APP_SPAM_X, JOB_X, SPAMMER, "pending", null],
    [APP_PAST_X, JOB_X, SPAMMER_PAST_PHONE, "pending", PAST_NOTES],
    [APP_HONEST_A, JOB_A, HONEST, "pending", null],
    [APP_SECOND_B, JOB_B, SECOND, "reviewing", JSON.stringify({ applicationAnswers: [{ type: "tel", answer: "+234 803 555 0101" }] })],
    [APP_SECOND_C, JOB_C, SECOND, "interview", null],
    [APP_PASSED_A, JOB_A, PASSED, "pending", null],
    [APP_LATE_A, JOB_A, LATE, "in_progress", null],
    [APP_LATE_B, JOB_B, LATE, "pending", JSON.stringify({ applicationAnswers: [{ type: "text", question: "Your mobile number", answer: "+44 7700 900123" }] })],
    [APP_MARIA_A, JOB_A, MARIA, "pending", null],
  ];
  for (const a of apps) await db.query(`insert into public.applications (id, job_id, candidate_id, status, notes) values ($1,$2,$3,$4,$5)`, a);
  // Their form attempts on JOB_B, still open (the spammer's is cut short by the block).
  await db.query(`insert into public.assessment_sessions (id, application_id, step_id, status) values ($1, $2, 'application', 'active')`, [FORM_SPAM_B, APP_SPAM_B]);

  async function as(uid, role, sql, params = []) {
    await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
    await db.exec(`select set_config('request.jwt.claim.role', '${role}', false);`);
    await db.exec(`set role ${role};`);
    try {
      const r = await db.query(sql, params);
      return { ok: true, rows: r.rows };
    } catch (e) {
      return { ok: false, error: e.message, code: e.code, hint: e.hint };
    } finally {
      await db.exec(`reset role;`);
      await db.exec(`select set_config('request.jwt.claim.sub', '', false);`);
      await db.exec(`select set_config('request.jwt.claim.role', '', false);`);
    }
  }
  const pg = (sql, params = []) => db.query(sql, params).then((r) => r.rows);
  return { db, as, pg };
}

async function main() {
  const migration = await readFile(MIGRATION, "utf8");
  const { db, as, pg } = await setup();

  console.log("\n0. The migration applies, twice, holding as little as it can");
  {
    let ok = true;
    let detail = "";
    // Each run inside a transaction, its locks on applications read before
    // it commits: what people applying right now would be queued behind.
    const run = async () => {
      await db.exec("begin;");
      try {
        await db.exec(migration);
        const locks = (await db.query(`select mode from pg_locks where locktype = 'relation' and relation = 'public.applications'::regclass`)).rows.map((r) => r.mode);
        await db.exec("commit;");
        return locks;
      } catch (e) {
        await db.exec("rollback;").catch(() => {});
        throw e;
      }
    };
    let first = [];
    let second = [];
    try {
      first = await run();
      second = await run();
    } catch (e) {
      ok = false;
      detail = e.message;
    }
    check("applies cleanly and is re-runnable", ok, detail);
    if (!ok) return;
    // ACCESS SHARE (reading the table to check a function body) blocks
    // nothing but an ACCESS EXCLUSIVE lock; applicants' writes pass it.
    const harmless = (m) => m === "AccessShareLock";
    check("the first run locks applications only for the trigger (SHARE ROW EXCLUSIVE, never ACCESS EXCLUSIVE)", first.includes("ShareRowExclusiveLock") && first.every((m) => harmless(m) || m === "ShareRowExclusiveLock"), show(first));
    check("a re-run takes no lock on applications that a form save or a submit would wait for", second.every(harmless), show(second));
    check("it gives up rather than queue: lock_timeout first, then put back", /^SET lock_timeout = '3s';/m.test(migration) && (await db.query(`show lock_timeout`)).rows[0].lock_timeout === "0", show((await db.query(`show lock_timeout`)).rows));
    const code = migration.replace(/--.*$/gm, "");
    const triggerAt = code.indexOf("CREATE TRIGGER applications_refuse_blocked");
    check("the trigger is the last thing it creates", triggerAt > 0 && !/CREATE (OR REPLACE )?(FUNCTION|TABLE|POLICY|INDEX)/.test(code.slice(triggerAt)) && !/DROP TRIGGER/.test(code));
  }

  const notifications = async () => (await pg(`select count(*)::int as n from public.notifications`))[0].n;
  const pushes = async () => (await pg(`select count(*)::int as n from public.net_calls`))[0].n;
  const app = async (id) => (await pg(`select status::text as status, notes, rejected_by, rejected_by_type from public.applications where id = $1`, [id]))[0];
  const block = async (cand) => (await pg(`select * from public.blocked_applicants where candidate_id = $1`, [cand]))[0] ?? null;
  const BLOCK = `select public.block_applicant($1, $2) as r`;

  console.log("\n1. Who may call block_applicant");
  {
    const anon = await as(null, "anon", BLOCK, [APP_SPAM_A, null]);
    check("anon: permission denied (EXECUTE revoked)", !anon.ok && /permission denied/i.test(anon.error), show(anon));
    const stranger = await as(STRANGER, "authenticated", BLOCK, [APP_SPAM_A, null]);
    check("a stranger: refused (42501)", !stranger.ok && stranger.code === "42501", show(stranger));
    const self = await as(SPAMMER, "authenticated", BLOCK, [APP_SPAM_A, null]);
    check("the candidate themself: refused", !self.ok && self.code === "42501", show(self));
    const viewer = await as(TEAM_VIEW, "authenticated", BLOCK, [APP_SPAM_A, null]);
    check("a team member who may not manage the pipeline: refused", !viewer.ok && viewer.code === "42501", show(viewer));
    const otherJob = await as(TEAM_JOB_B, "authenticated", BLOCK, [APP_SPAM_A, null]);
    check("a pipeline team member limited to another job: refused", !otherJob.ok && otherJob.code === "42501", show(otherJob));
    const otherEmployer = await as(EMP_2, "authenticated", BLOCK, [APP_SPAM_A, null]);
    check("another employer: refused", !otherEmployer.ok && otherEmployer.code === "42501", show(otherEmployer));
    const missing = await as(EMP_1, "authenticated", BLOCK, ["40000000-0000-4000-8000-0000000000ee", null]);
    check("an id that does not exist reads the same as one that is not yours", !missing.ok && missing.code === "42501", show(missing));
    check("…and none of the refusals changed anything", (await app(APP_SPAM_A)).status === "pending" && (await block(SPAMMER)) === null && (await notifications()) === 0);
  }

  console.log("\n2. The owner removes and blocks the spammer");
  {
    const before = { notes: await notifications(), pushes: await pushes() };
    const r = await as(EMP_1, "authenticated", BLOCK, [APP_SPAM_A, "  Spam: same answers pasted 30 times  "]);
    check("the owner may call it", r.ok, show(r));
    const out = r.ok ? r.rows[0].r : {};
    check("it answers with the person and every application it took off", out.candidateId === SPAMMER && [...(out.applicationIds ?? [])].sort().join() === [APP_SPAM_A, APP_SPAM_B].sort().join() && out.email === true && out.phone === true, show(out));

    const a = await app(APP_SPAM_A);
    const notes = JSON.parse(a.notes);
    check("the application is rejected, by the owner, as 'user'", a.status === "rejected" && a.rejected_by === EMP_1 && a.rejected_by_type === "user", show(a));
    check("notes.blocked = {at, by}", notes.blocked?.by === EMP_1 && !Number.isNaN(Date.parse(notes.blocked?.at)), show(notes.blocked));
    check("…beside every other notes key, untouched", notes.quizResult?.score === 3 && notes.applicationAnswers?.length === 3);
    const b = await app(APP_SPAM_B);
    check("their other open application to this employer goes too (in_progress → rejected, stamped)", b.status === "rejected" && JSON.parse(b.notes).blocked?.by === EMP_1, show(b));
    check("their application to another employer is untouched", (await app(APP_SPAM_X)).status === "pending" && (await app(APP_SPAM_X)).notes === null);

    const row = await block(SPAMMER);
    check("the block row: employer, account, lower-case email, form phone digits, trimmed reason, who", row && row.employer_id === EMP_1 && row.email === "spam.bot@example.com" && row.phone === "639171234567" && row.reason === "Spam: same answers pasted 30 times" && row.blocked_by === EMP_1, show(row));
    check("…and the email's alias-free key", row?.email_key === "spam.bot@example.com", show(row?.email_key));

    const form = (await pg(`select status, end_reason from public.assessment_sessions where id = $1`, [FORM_SPAM_B]))[0];
    const said = (await pg(`select detail from public.assessment_events where session_id = $1`, [FORM_SPAM_B])).map((e) => e.detail?.what);
    check("their open form attempt is closed as 'blocked', not 'submitted' (they never sent it)", form?.status === "completed" && form?.end_reason === "blocked" && said.join() === "blocked", show({ form, said }));

    check("no notification row for the candidate (no bell)", (await notifications()) === before.notes);
    check("no push sent (net.http_post never called)", (await pushes()) === before.pushes);

    const again = await as(EMP_1, "authenticated", BLOCK, [APP_SPAM_A, null]);
    check("blocking again is harmless: one row, the first reason kept", again.ok && (await pg(`select count(*)::int n from public.blocked_applicants where candidate_id=$1`, [SPAMMER]))[0].n === 1 && (await block(SPAMMER)).reason === "Spam: same answers pasted 30 times");
    check("…and still tells nobody", (await notifications()) === before.notes && (await pushes()) === before.pushes);
  }

  console.log("\n3. The flag is off again: an ordinary pass still notifies");
  {
    const before = { notes: await notifications(), pushes: await pushes() };
    // Block, then an ordinary rejection, in ONE transaction as the owner.
    await db.exec(`select set_config('request.jwt.claim.sub', '${EMP_1}', false); select set_config('request.jwt.claim.role', 'authenticated', false);`);
    let ok = true;
    let detail = "";
    try {
      await db.exec(`
        set role authenticated;
        begin;
        select public.block_applicant('${APP_HONEST_A}', null);
        update public.applications set status = 'rejected' where id = '${APP_PASSED_A}';
        commit;
      `);
    } catch (e) {
      ok = false;
      detail = e.message;
      await db.exec(`rollback;`).catch(() => {});
    } finally {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claim.role', '', false);`);
    }
    check("block, then an ordinary pass, in one transaction", ok, detail);
    const n = await pg(`select user_id from public.notifications order by created_at`);
    check("the ordinary pass notified its candidate (one bell)", (await notifications()) === before.notes + 1 && n.at(-1)?.user_id === PASSED, show(n));
    check("…and its push went out", (await pushes()) === before.pushes + 1);
    check("the blocked one was not notified", !n.some((x) => x.user_id === HONEST));
    // An ordinary submit, after a block: the form attempt says 'submitted'.
    await pg(`insert into public.applications (id, job_id, candidate_id, status) values ('40000000-0000-4000-8000-0000000000f1', $1, $2, 'in_progress')`, [JOB_B, PASSED]);
    await pg(`insert into public.assessment_sessions (id, application_id, step_id, status) values ($1, '40000000-0000-4000-8000-0000000000f1', 'application', 'active')`, [FORM_HONEST_B]);
    await as(PASSED, "authenticated", `update public.applications set status = 'pending' where id = '40000000-0000-4000-8000-0000000000f1'`);
    const sent = (await pg(`select end_reason from public.assessment_sessions where id = $1`, [FORM_HONEST_B]))[0];
    check("an ordinary submit still closes the form as 'submitted'", sent?.end_reason === "submitted", show(sent));
    // Put HONEST back for the guard checks below: unblock (owner).
    await as(EMP_1, "authenticated", `select public.unblock_applicant($1)`, [HONEST]);
  }

  console.log("\n4. A team member who may manage the pipeline");
  {
    const r = await as(TEAM_JOB_B, "authenticated", BLOCK, [APP_SECOND_B, null]);
    check("a pipeline team member on that job may block", r.ok, show(r));
    const a = await app(APP_SECOND_B);
    check("…rejected as 'team_member', by them", a.status === "rejected" && a.rejected_by === TEAM_JOB_B && a.rejected_by_type === "team_member", show(a));
    check("…their interview on a job the team member is not on is left alone", (await app(APP_SECOND_C)).status === "interview");
    check("…the block keeps the form's tel answer", (await block(SECOND))?.phone === "2348035550101", show(await block(SECOND)));

    // Blocked before reaching this job's form: the phone they typed on
    // another of their applications to this employer is the block's.
    const late = await as(EMP_1, "authenticated", BLOCK, [APP_LATE_A, null]);
    check("blocked from an application with nothing typed yet", late.ok, show(late));
    check("…the block still has their phone, from their other application to this employer", (await block(LATE))?.phone === "447700900123", show(await block(LATE)));
    check("…and both their open applications closed", (await app(APP_LATE_A)).status === "rejected" && (await app(APP_LATE_B)).status === "rejected");
  }

  console.log("\n5. The guard on a new application");
  const APPLY = `insert into public.applications (job_id, candidate_id, status, phase) values ($1, $2, 'in_progress', 'application') returning id`;
  {
    const sameAccount = await as(SPAMMER, "authenticated", APPLY, [JOB_C, SPAMMER]);
    check("the same account, another job of this employer: refused", !sameAccount.ok, show(sameAccount));
    check("…with the plain words the candidate page shows", sameAccount.error === "We can't take an application from this account.", sameAccount.error);
    check("…code P0001, hint applicant_blocked", sameAccount.code === "P0001" && sameAccount.hint === "applicant_blocked", show(sameAccount));

    const byEmail = await as(SPAMMER_EMAIL_TWIN, "authenticated", APPLY, [JOB_A, SPAMMER_EMAIL_TWIN]);
    check("another account with the same email: refused", !byEmail.ok && byEmail.hint === "applicant_blocked", show(byEmail));

    // A phone never refuses: shared and mistyped numbers would turn real
    // people away. The staff list flags these instead (lib/blockedApplicants.ts).
    const byPhone = await as(SPAMMER_PHONE_TWIN, "authenticated", APPLY, [JOB_A, SPAMMER_PHONE_TWIN]);
    check("another account whose profile phone is the blocked number: allowed (flagged on the list, never refused)", byPhone.ok, show(byPhone));

    const byPastPhone = await as(SPAMMER_PAST_PHONE, "authenticated", APPLY, [JOB_A, SPAMMER_PAST_PHONE]);
    check("an account that typed that phone on an earlier application elsewhere: allowed too", byPastPhone.ok, show(byPastPhone));

    // Gmail delivers all of these to one inbox: one email, as far as a block goes.
    const maria = await as(EMP_1, "authenticated", BLOCK, [APP_MARIA_A, null]);
    check("a Gmail address blocked", maria.ok && (await block(MARIA))?.email_key === "mariasantos@gmail.com", show(await block(MARIA)));
    for (const [who, label] of [
      [MARIA_NODOTS, "the same Gmail without the dots"],
      [MARIA_TAG, "the same Gmail with a +tag"],
      [MARIA_GOOGLEMAIL, "the same name @googlemail.com"],
      [MARIA_CAPS, "the same Gmail in capitals, with spaces"],
    ]) {
      const r = await as(who, "authenticated", APPLY, [JOB_B, who]);
      check(`${label}: refused`, !r.ok && r.hint === "applicant_blocked", show(r));
    }
    for (const [who, label] of [
      [MARIA_OTHER_DOMAIN, "the same name at another provider"],
      [MARIA_OTHER_NAME, "another Gmail name"],
    ]) {
      const r = await as(who, "authenticated", APPLY, [JOB_B, who]);
      check(`${label}: allowed`, r.ok, show(r));
    }

    await pg(`insert into public.jobs (id, employer_id, title) values ('30000000-0000-4000-8000-0000000000bb', $1, 'Second other job') on conflict do nothing`, [EMP_2]);
    const unrelatedEmployer = await as(SPAMMER, "authenticated", APPLY, ["30000000-0000-4000-8000-0000000000bb", SPAMMER]);
    check("the same person applying to an unrelated employer: allowed", unrelatedEmployer.ok, show(unrelatedEmployer));

    const honest = await as(HONEST, "authenticated", APPLY, [JOB_B, HONEST]);
    check("an unrelated person applying to this employer: allowed", honest.ok, show(honest));

    // A broken check must never stop a real applicant.
    await pg(`alter function public.applicant_is_blocked(uuid, uuid) rename to applicant_is_blocked_real`);
    await pg(`create function public.applicant_is_blocked(uuid, uuid) returns boolean language plpgsql as $$ begin raise exception 'boom'; end $$`);
    const failOpen = await as(SPAMMER, "authenticated", APPLY, [JOB_C, SPAMMER]);
    check("a check that errors lets the application through (fail open)", failOpen.ok, show(failOpen));
    await pg(`delete from public.applications where job_id = $1 and candidate_id = $2`, [JOB_C, SPAMMER]);
    await pg(`drop function public.applicant_is_blocked(uuid, uuid)`);
    await pg(`alter function public.applicant_is_blocked_real(uuid, uuid) rename to applicant_is_blocked`);
    const restored = await as(SPAMMER, "authenticated", APPLY, [JOB_C, SPAMMER]);
    check("…and with the real check back, refused again", !restored.ok && restored.hint === "applicant_blocked", show(restored));

    const helper = await as(SPAMMER, "authenticated", `select public.applicant_is_blocked($1, $2)`, [EMP_1, SPAMMER]);
    check("the guard's reader is server-only (a client cannot ask who is blocked)", !helper.ok && /permission denied/i.test(helper.error), show(helper));
  }

  console.log("\n6. Who sees the blocks (RLS)");
  {
    const anon = await as(null, "anon", `select * from public.blocked_applicants`);
    check("anon: permission denied", !anon.ok && /permission denied/i.test(anon.error), show(anon));
    const stranger = await as(STRANGER, "authenticated", `select * from public.blocked_applicants`);
    check("a stranger sees nothing", stranger.ok && stranger.rows.length === 0, show(stranger));
    const cand = await as(SPAMMER, "authenticated", `select * from public.blocked_applicants`);
    check("the blocked person sees nothing", cand.ok && cand.rows.length === 0, show(cand));
    const other = await as(EMP_2, "authenticated", `select * from public.blocked_applicants`);
    check("another employer sees nothing", other.ok && other.rows.length === 0, show(other));
    const owner = await as(EMP_1, "authenticated", `select candidate_id from public.blocked_applicants order by candidate_id`);
    const OWNERS = [SPAMMER, SECOND, LATE, MARIA].sort();
    check("the owner sees every one of their blocks", owner.ok && owner.rows.map((r) => r.candidate_id).join() === OWNERS.join(), show(owner));
    const allJobs = await as(TEAM_VIEW, "authenticated", `select candidate_id from public.blocked_applicants`);
    check("a team member on every job sees them (view only is enough to read)", allJobs.ok && allJobs.rows.length === OWNERS.length, show(allJobs));
    const jobB = await as(TEAM_JOB_B, "authenticated", `select candidate_id from public.blocked_applicants order by candidate_id`);
    check("a team member limited to Cook sees who applied to Cook and their own block, not Maria (Barista only)", jobB.ok && jobB.rows.map((r) => r.candidate_id).join() === [SPAMMER, SECOND, LATE].sort().join(), show(jobB));
    await pg(`update public.team_members set assigned_job_ids = $1::uuid[] where user_id = $2`, [`{${JOB_C}}`, TEAM_JOB_B]);
    const jobC = await as(TEAM_JOB_B, "authenticated", `select candidate_id from public.blocked_applicants`);
    check("…moved to Host only: the spammer (never applied to Host) is hidden, their own block stays", jobC.ok && jobC.rows.map((r) => r.candidate_id).join() === SECOND, show(jobC));
    await pg(`update public.team_members set assigned_job_ids = $1::uuid[] where user_id = $2`, [`{${JOB_B}}`, TEAM_JOB_B]);

    const INSERT = `insert into public.blocked_applicants (employer_id, candidate_id, email, phone, blocked_by) values ($1, $2, $3, $4, $5)`;
    const denied = (r) => !r.ok && /permission denied/i.test(r.error);
    const insertStranger = await as(STRANGER, "authenticated", INSERT, [EMP_1, HONEST, null, null, STRANGER]);
    check("a stranger cannot write a block for someone else's employer", denied(insertStranger), show(insertStranger));
    const insertViewer = await as(TEAM_VIEW, "authenticated", INSERT, [EMP_1, HONEST, null, null, TEAM_VIEW]);
    check("a view-only team member cannot either", denied(insertViewer), show(insertViewer));
    // A candidate filling the table with rows of their own (the probe wrote
    // a 200,000-character email and 5,000 rows this way).
    const stuffing = await as(SPAMMER, "authenticated", INSERT, [SPAMMER, HONEST, "x".repeat(200_000) + "@example.com", null, SPAMMER]);
    check("a candidate cannot write rows into it as their own 'employer'", denied(stuffing), show({ ...stuffing, error: stuffing.error?.slice(0, 80) }));
    // A team member limited to one job typing in someone else's email and
    // phone (the probe then refused HONEST on a third job).
    const foreign = await as(TEAM_JOB_B, "authenticated", INSERT, [EMP_1, SECOND, "honest@example.com", "15550100199", TEAM_JOB_B]);
    check("a team member limited to one job cannot write a block with someone else's email", denied(foreign), show(foreign));
    const ownerInsert = await as(EMP_1, "authenticated", INSERT, [EMP_1, HONEST, "honest@example.com", null, EMP_1]);
    check("not even the owner writes one directly: block_applicant works the email out itself", denied(ownerInsert), show(ownerInsert));
    const ownerDelete = await as(EMP_1, "authenticated", `delete from public.blocked_applicants`);
    check("…nor deletes one directly (unblock_applicant does)", denied(ownerDelete), show(ownerDelete));
    const update = await as(EMP_1, "authenticated", `update public.blocked_applicants set reason = 'x'`);
    check("no one updates a block directly (no UPDATE grant)", denied(update), show(update));
    let tooLong = null;
    try {
      await pg(`insert into public.blocked_applicants (employer_id, candidate_id, email, blocked_by) values ($1, $2, $3, $1)`, [EMP_2, HONEST, "x".repeat(400) + "@example.com"]);
    } catch (e) {
      tooLong = e.message;
    }
    check("an email over 320 characters is refused even by the server", /blocked_applicants_email_length/.test(tooLong ?? ""), tooLong ?? "inserted");
    check("…and HONEST is still free to apply anywhere (nothing was written)", (await block(HONEST)) === null);
  }

  console.log("\n7. Unblock");
  {
    const stranger = await as(STRANGER, "authenticated", `select public.unblock_applicant($1) as n`, [SPAMMER]);
    check("a stranger removes nothing", stranger.ok && stranger.rows[0].n === 0 && (await block(SPAMMER)) !== null, show(stranger));
    const viewer = await as(TEAM_VIEW, "authenticated", `select public.unblock_applicant($1) as n`, [SPAMMER]);
    check("a view-only team member removes nothing", viewer.ok && viewer.rows[0].n === 0 && (await block(SPAMMER)) !== null, show(viewer));
    const anon = await as(null, "anon", `select public.unblock_applicant($1) as n`, [SPAMMER]);
    check("anon: permission denied", !anon.ok && /permission denied/i.test(anon.error), show(anon));
    const owner = await as(EMP_1, "authenticated", `select public.unblock_applicant($1) as n`, [SPAMMER]);
    check("the owner unblocks: one row removed", owner.ok && owner.rows[0].n === 1 && (await block(SPAMMER)) === null, show(owner));
    check("…their old applications stay rejected", (await app(APP_SPAM_A)).status === "rejected" && (await app(APP_SPAM_B)).status === "rejected");
    const reapply = await as(SPAMMER, "authenticated", APPLY, [JOB_C, SPAMMER]);
    check("…and they can apply again", reapply.ok, show(reapply));
    check("unblocking told nobody either", (await pg(`select count(*)::int n from public.notifications where user_id = $1`, [SPAMMER]))[0].n === 0);
  }

  console.log("\n8. block_applicants: a batch");
  {
    const mine = (await pg(`select id from public.applications where job_id = $1 and candidate_id = $2`, [JOB_C, SPAMMER]))[0].id;
    const r = await as(EMP_1, "authenticated", `select public.block_applicants($1::uuid[], $2) as r`, [[mine, APP_SPAM_X, mine], "Batch"]);
    const out = r.ok ? r.rows[0].r : {};
    check("the owner's batch: theirs blocked, another employer's skipped, a repeat counted once", r.ok && out.blocked?.join() === mine && out.skipped?.join() === APP_SPAM_X, show(r.ok ? out : r));
    check("…the skipped one untouched", (await app(APP_SPAM_X)).status === "pending");
    check("…and the block is back", (await block(SPAMMER))?.reason === "Batch");
    const ids = Array.from({ length: 201 }, (_, i) => `50000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const tooMany = await as(EMP_1, "authenticated", `select public.block_applicants($1::uuid[], null)`, [ids]);
    check("more than 200 at a time is refused", !tooMany.ok && tooMany.code === "22023", show(tooMany));
    const anon = await as(null, "anon", `select public.block_applicants($1::uuid[], null)`, [[mine]]);
    check("anon: permission denied", !anon.ok && /permission denied/i.test(anon.error), show(anon));
    check("no notification for any of it", (await pg(`select count(*)::int n from public.notifications where user_id = $1`, [SPAMMER]))[0].n === 0);
  }

  console.log("\n9. No email path in the client");
  {
    const hook = await readFile(path.join(ROOT, "src/cockpit/hooks/useApplicantBlocks.ts"), "utf8").catch(() => null);
    check("the block hook exists", hook != null);
    if (hook != null) {
      const code = hook.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      check("…calls the block_applicants RPC", /\.rpc\(\s*"block_applicants"/.test(code));
      check("…never useUpdateApplication (whose status write sends the rejection email)", !/useUpdateApplication|notifyStatusRejected|emailNotifications|send-notification-email|from\("applications"\)\s*\.update/.test(code));
    }
    for (const rel of ["src/cockpit/components/ApplicantRowMenu.tsx", "src/cockpit/components/ApplicantBulkBar.tsx"]) {
      const src = await readFile(path.join(ROOT, rel), "utf8").catch(() => null);
      check(`${rel} exists`, src != null);
      if (src != null) {
        const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        check(`${rel}: blocking never reaches the email sender`, !/notifyStatusRejected|emailNotifications|send-notification-email/.test(code));
      }
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
