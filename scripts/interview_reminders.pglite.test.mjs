#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/*_interview_reminder_columns.sql (where
 * "this reminder was sent" is kept; docs/INTERVIEWS.md, "Reminders"): plain
 * assertions against a real Postgres, not a text match.
 *
 *   0. The migration applies twice, and puts lock_timeout back afterwards.
 *   1. The sender (service role) records a reminder as sent, and that alone
 *      does not count as the interview changing (updated_at stays): the
 *      sender waits for an interview to be left alone for 30 minutes.
 *   2. A client (the employer or the applicant) cannot set or clear them: an
 *      applicant cannot stop a reminder, nobody can make one go twice. The
 *      rest of their update still goes through.
 *   3. A new time, or a time agreed afresh, clears both: the new time is
 *      reminded too. A change that is neither (a note) keeps them.
 *   4. A real change still moves updated_at.
 *   5. A time set or agreed less than a day ahead (the owner's example: six
 *      hours) gets its day-before reminder marked done at once; the
 *      hour-before one still goes.
 *   6. *_interview_time_not_in_past.sql: a live interview can never be set
 *      to a time that has passed, by anyone; everything else about a passed
 *      interview (completed, no-show, a note) still works.
 *
 * The interviews table is the live one's columns (information_schema,
 * production, 2026-10-09), with the live update_interviews_updated_at
 * trigger. anon / authenticated / service_role are real, separate roles.
 *
 * Run with: node scripts/interview_reminders.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");

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

const EMP = "10000000-0000-4000-8000-000000000001";
const IV = "50000000-0000-4000-8000-000000000001";
const APP = "40000000-0000-4000-8000-000000000001";
const LONG_AGO = "2026-10-01T00:00:00Z";

async function migrationFile(name = "interview_reminder_columns") {
  const names = (await readdir(MIGRATIONS)).filter((n) => new RegExp(`^\\d+_${name}\\.sql$`).test(n));
  return names.length === 1 ? path.join(MIGRATIONS, names[0]) : null;
}

async function setup() {
  const db = new PGlite();
  await db.exec(`
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
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant execute on function auth.role() to anon, authenticated, service_role;

    create type public.interview_status as enum ('scheduled', 'completed', 'cancelled', 'no_show');
    create table public.interviews (
      id uuid primary key default gen_random_uuid(),
      application_id uuid not null,
      scheduled_at timestamptz,
      duration_minutes integer,
      status public.interview_status default 'scheduled',
      interview_type text,
      meeting_link text,
      notes text,
      ai_questions text[],
      ai_feedback text,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      candidate_response text,
      proposed_times jsonb,
      candidate_note text,
      employer_windows jsonb,
      meeting_provider text,
      meeting_room_url text,
      meeting_room_name text
    );
    grant select, insert, update, delete on public.interviews to authenticated, service_role;

    -- Live (pg_get_functiondef, production, 2026-10-09).
    create or replace function public.update_updated_at_column() returns trigger language plpgsql set search_path to 'public' as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$;
    create trigger update_interviews_updated_at before update on public.interviews for each row execute function public.update_updated_at_column();
  `);

  async function as(role, sql, params = []) {
    await db.exec(`select set_config('request.jwt.claim.sub', '${role === "authenticated" ? EMP : ""}', false);`);
    await db.exec(`select set_config('request.jwt.claim.role', '${role}', false);`);
    await db.exec(`set role ${role};`);
    try {
      const r = await db.query(sql, params);
      return { ok: true, rows: r.rows };
    } catch (e) {
      return { ok: false, error: e.message };
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
  const file = await migrationFile();
  check("exactly one *_interview_reminder_columns.sql migration", file != null);
  if (!file) {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(1);
  }
  const migration = await readFile(file, "utf8");
  const { db, as, pg } = await setup();

  console.log("\n0. The migration applies, twice");
  {
    await db.exec(migration);
    let second = null;
    try {
      await db.exec(migration);
    } catch (e) {
      second = e.message;
    }
    check("a second run changes nothing and raises nothing", second === null, String(second));
    const timeout = await pg(`show lock_timeout`);
    check("lock_timeout is put back afterwards", ["0", "0ms"].includes(String(timeout[0].lock_timeout)), show(timeout));
    const triggers = await pg(`select tgname from pg_trigger where tgrelid = 'public.interviews'::regclass and not tgisinternal order by 1`);
    check("one bookkeeping trigger, after the updated_at one", show(triggers.map((r) => r.tgname)) === show(["update_interviews_updated_at", "zz_interviews_reminder_bookkeeping"]), show(triggers));
    const pastFile = await migrationFile("interview_time_not_in_past");
    check("exactly one *_interview_time_not_in_past.sql migration", pastFile != null);
    const past = pastFile ? await readFile(pastFile, "utf8") : "";
    await db.exec(past);
    let pastAgain = null;
    try {
      await db.exec(past);
    } catch (e) {
      pastAgain = e.message;
    }
    check("…which applies twice too", pastAgain === null, String(pastAgain));
  }

  const fresh = async () => {
    await pg(`delete from public.interviews`);
    await pg(
      `insert into public.interviews (id, application_id, scheduled_at, status, candidate_response, updated_at, notes)
       values ($1, $2, now() + interval '30 hours', 'scheduled', 'confirmed', $3, 'first')`,
      [IV, APP, LONG_AGO],
    );
  };
  const row = async () => (await pg(`select reminder_day_sent_at, reminder_hour_sent_at, updated_at, notes, scheduled_at from public.interviews where id = $1`, [IV]))[0];

  console.log("\n1. The sender records a reminder as sent");
  {
    await fresh();
    const claim = await as("service_role", `update public.interviews set reminder_day_sent_at = now() where id = $1 and reminder_day_sent_at is null returning id`, [IV]);
    const r = await row();
    check("the claim goes through, once", claim.ok && claim.rows.length === 1, show(claim));
    check("…and is kept", r.reminder_day_sent_at != null);
    check("…without counting as a change to the interview (updated_at stays)", new Date(r.updated_at).toISOString() === new Date(LONG_AGO).toISOString(), show(r.updated_at));
    const again = await as("service_role", `update public.interviews set reminder_day_sent_at = now() where id = $1 and reminder_day_sent_at is null returning id`, [IV]);
    check("a second, overlapping look claims nothing", again.ok && again.rows.length === 0, show(again));
    const back = await as("service_role", `update public.interviews set reminder_day_sent_at = null where id = $1`, [IV]);
    check("the sender can give a claim back when the email failed", back.ok && (await row()).reminder_day_sent_at === null);
    check("…still without moving updated_at", new Date((await row()).updated_at).toISOString() === new Date(LONG_AGO).toISOString());
  }

  console.log("\n2. A client cannot set or clear them");
  {
    await fresh();
    await as("service_role", `update public.interviews set reminder_day_sent_at = now() where id = $1`, [IV]);
    const cleared = await as("authenticated", `update public.interviews set reminder_day_sent_at = null where id = $1`, [IV]);
    check("clearing one (to make it go again) is put back", cleared.ok && (await row()).reminder_day_sent_at != null, show(cleared));
    const set = await as("authenticated", `update public.interviews set reminder_hour_sent_at = now() where id = $1`, [IV]);
    check("setting one (to stop it) is put back", set.ok && (await row()).reminder_hour_sent_at === null, show(set));
    const mixed = await as("authenticated", `update public.interviews set reminder_hour_sent_at = now(), notes = 'changed' where id = $1`, [IV]);
    const r = await row();
    check("the rest of the same update still goes through", mixed.ok && r.notes === "changed" && r.reminder_hour_sent_at === null, show(r));
  }

  console.log("\n3. A new time, or a time agreed afresh, is reminded again");
  {
    await fresh();
    await as("service_role", `update public.interviews set reminder_day_sent_at = now(), reminder_hour_sent_at = now() where id = $1`, [IV]);
    await as("authenticated", `update public.interviews set notes = 'just a note' where id = $1`, [IV]);
    let r = await row();
    check("a note: both stay sent", r.reminder_day_sent_at != null && r.reminder_hour_sent_at != null);
    await as("authenticated", `update public.interviews set scheduled_at = scheduled_at + interval '2 days' where id = $1`, [IV]);
    r = await row();
    check("a new time (by the team): both cleared", r.reminder_day_sent_at === null && r.reminder_hour_sent_at === null, show(r));

    await as("service_role", `update public.interviews set reminder_day_sent_at = now() where id = $1`, [IV]);
    await as("authenticated", `update public.interviews set candidate_response = 'reschedule_requested' where id = $1`, [IV]);
    check("the applicant asking for another time: kept (no reminder goes while it is not agreed anyway)", (await row()).reminder_day_sent_at != null);
    await as("service_role", `update public.interviews set candidate_response = 'confirmed' where id = $1`, [IV]);
    check("the same time agreed again: cleared, so it is reminded afresh", (await row()).reminder_day_sent_at === null);

    await as("service_role", `update public.interviews set reminder_day_sent_at = now() where id = $1`, [IV]);
    await as("service_role", `update public.interviews set scheduled_at = scheduled_at + interval '1 hour', reminder_day_sent_at = now() where id = $1`, [IV]);
    check("a new time wins even over the sender's own write in the same update", (await row()).reminder_day_sent_at === null);
  }

  console.log("\n4. A real change still moves updated_at");
  {
    await fresh();
    await as("authenticated", `update public.interviews set notes = 'moved' where id = $1`, [IV]);
    const r = await row();
    check("a note moves updated_at", new Date(r.updated_at).getTime() > new Date(LONG_AGO).getTime(), show(r.updated_at));
  }

  console.log("\n5. Set or agreed less than a day ahead: no day-before reminder");
  {
    await pg(`delete from public.interviews`);
    const made = await as("authenticated", `insert into public.interviews (id, application_id, scheduled_at, status, candidate_response) values ($1, $2, now() + interval '6 hours', 'scheduled', 'confirmed') returning reminder_day_sent_at, reminder_hour_sent_at`, [IV, APP]);
    check("made six hours ahead: the day-before one is marked done, the hour-before one is not", made.ok && made.rows[0].reminder_day_sent_at != null && made.rows[0].reminder_hour_sent_at === null, show(made));
    await pg(`delete from public.interviews`);
    const far = await as("authenticated", `insert into public.interviews (id, application_id, scheduled_at, status, candidate_response) values ($1, $2, now() + interval '3 days', 'scheduled', 'awaiting_pick') returning reminder_day_sent_at, reminder_day_sent_at`, [IV, APP]);
    check("made three days ahead: neither marked", far.ok && far.rows[0].reminder_day_sent_at === null, show(far));
    const forged = await as("authenticated", `insert into public.interviews (application_id, scheduled_at, status, reminder_day_sent_at, reminder_hour_sent_at) values ($1, now() + interval '3 days', 'scheduled', now(), now()) returning reminder_day_sent_at, reminder_hour_sent_at`, [APP]);
    check("a new interview cannot arrive with its reminders already marked sent", forged.ok && forged.rows[0].reminder_day_sent_at === null && forged.rows[0].reminder_hour_sent_at === null, show(forged));
    await as("authenticated", `update public.interviews set scheduled_at = now() + interval '6 hours' where id = $1`, [IV]);
    let r = await row();
    check("moved to six hours ahead: day-before marked done, hour-before cleared", r.reminder_day_sent_at != null && r.reminder_hour_sent_at === null, show(r));
    await as("authenticated", `update public.interviews set scheduled_at = now() + interval '2 days' where id = $1`, [IV]);
    await as("service_role", `update public.interviews set candidate_response = 'confirmed' where id = $1`, [IV]);
    r = await row();
    check("agreed two days ahead: the day-before one will go", r.reminder_day_sent_at === null);
  }

  console.log("\n6. Never a time that has already passed");
  {
    await pg(`delete from public.interviews`);
    const passedRefusal = (res) => !res.ok && /interview_time_passed/.test(res.error);
    const pastInsert = await as("authenticated", `insert into public.interviews (application_id, scheduled_at, status) values ($1, now() - interval '1 hour', 'scheduled')`, [APP]);
    check("a new interview an hour in the past: refused, in words the screens recognise", passedRefusal(pastInsert), show(pastInsert));
    const byService = await as("service_role", `insert into public.interviews (application_id, scheduled_at, status) values ($1, now() - interval '1 hour', 'scheduled')`, [APP]);
    check("…by the service role too", passedRefusal(byService), show(byService));
    const justNow = await as("authenticated", `insert into public.interviews (id, application_id, scheduled_at, status) values ($1, $2, now() - interval '1 minute', 'scheduled')`, [IV, APP]);
    check("a minute ago (the time it takes to press the button): allowed", justNow.ok, show(justNow));
    await pg(`delete from public.interviews`);
    await as("authenticated", `insert into public.interviews (id, application_id, scheduled_at, status) values ($1, $2, now() + interval '2 days', 'scheduled')`, [IV, APP]);
    const moveBack = await as("authenticated", `update public.interviews set scheduled_at = now() - interval '3 hours' where id = $1`, [IV]);
    check("moving an interview to a passed time: refused", passedRefusal(moveBack), show(moveBack));
    check("…and the time is left as it was", new Date((await row()).scheduled_at).getTime() > Date.now());
    const cancelledPast = await as("authenticated", `insert into public.interviews (application_id, scheduled_at, status) values ($1, now() - interval '1 day', 'cancelled')`, [APP]);
    check("a record of a cancelled interview with a passed time: allowed (it is not being booked)", cancelledPast.ok, show(cancelledPast));
    // An interview whose time has passed since it was booked.
    await pg(`alter table public.interviews disable trigger interviews_refuse_past_time`);
    await pg(`update public.interviews set scheduled_at = now() - interval '2 hours' where id = $1`, [IV]);
    await pg(`alter table public.interviews enable trigger interviews_refuse_past_time`);
    const done = await as("authenticated", `update public.interviews set status = 'completed', notes = 'went well' where id = $1`, [IV]);
    check("an interview whose time has passed can still be marked completed, with a note", done.ok, show(done));
    const noShow = await as("authenticated", `update public.interviews set status = 'no_show' where id = $1`, [IV]);
    check("…or a no-show", noShow.ok, show(noShow));
  }

  await db.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
