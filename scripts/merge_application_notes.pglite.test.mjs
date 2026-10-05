#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20261005180943_merge_application_notes.sql
 * — plain assertions, no framework, real Postgres (via PGlite), not a text match.
 *
 * Builds a minimal `applications` fixture (notes as TEXT, the real
 * update_updated_at_column trigger, and a cut-down copy of
 * protect_application_columns that keeps its service-role exemption and its
 * "candidates cannot touch the Ava scorecard" rule), applies the migration
 * under test VERBATIM (read from disk, twice, to prove it is re-runnable),
 * then proves:
 *
 *   - merge_application_notes() merges only the patch's top-level keys and
 *     leaves every other key exactly as stored at that moment — so a
 *     background analysis written from an old snapshot can no longer erase a
 *     step result written meanwhile, and vice versa (the lost-update race the
 *     whole-notes writes in trigger-ava-analysis and recordStepResult had);
 *   - a key in the patch replaces that key's whole value (no deep merge);
 *   - NULL, empty, whitespace and JSON-null notes are treated as {}; text
 *     that is not a JSON object (malformed, an array, a scalar) is KEPT under
 *     _unparsedNotes with the patch beside it, never erased, and never
 *     throws;
 *   - notes that JavaScript reads but jsonb refuses (a NUL character, which
 *     JSON.stringify writes as the \u0000 escape) are read in full, with the
 *     NUL as U+FFFD — an earlier draft erased the whole application here;
 *   - a patch holding a NUL character is refused by jsonb itself, which is
 *     why the JavaScript callers strip it first (withoutNulCharacters);
 *   - updated_at moves, through the table's own trigger;
 *   - it returns the merged object;
 *   - a non-object patch and a missing application are refused loudly;
 *   - only service_role may call it: anon and authenticated get a
 *     permission error, so a candidate can never write a notes key this way.
 *
 * Run with: node scripts/merge_application_notes.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20261005180943_merge_application_notes.sql");

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

/** Key-order-insensitive equality: jsonb stores object keys in its own order. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => ({ ...acc, [key]: canonical(value[key]) }), {});
  }
  return value;
}
function same(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

const CANDIDATE = "20000000-0000-4000-8000-000000000002";
const APP = "30000000-0000-4000-8000-000000000001";
const MISSING_APP = "30000000-0000-4000-8000-0000000000ff";

async function main() {
  const db = new PGlite();
  const migrationSql = await readFile(MIGRATION_PATH, "utf8").catch(() => null);
  check("migration file exists on disk", migrationSql != null, MIGRATION_PATH);
  if (!migrationSql) {
    console.log(`\n${failed} of ${passed + failed} checks failed.`);
    process.exit(1);
  }

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

    -- Mirrors the real project: client roles can reach public tables and
    -- functions by default (RLS and REVOKEs do the actual restricting).
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

    create table public.applications (
      id uuid primary key,
      candidate_id uuid not null,
      status text not null default 'in_progress',
      phase text default 'application',
      notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    -- The real trigger function (20251214183024_*.sql).
    create or replace function public.update_updated_at_column()
    returns trigger language plpgsql as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$;
    create trigger update_applications_updated_at
      before update on public.applications
      for each row execute function public.update_updated_at_column();

    -- A cut-down protect_application_columns: the service-role exemption
    -- first (exactly as live), then the one notes rule this proof needs —
    -- a candidate may not change avaScorecard/avaAnalysisMeta.
    create or replace function public.protect_application_columns()
    returns trigger language plpgsql security definer set search_path = public as $$
    declare
      old_notes jsonb;
      new_notes jsonb;
    begin
      if auth.role() = 'service_role' then
        return new;
      end if;
      if new.notes is distinct from old.notes then
        begin old_notes := coalesce(old.notes::jsonb, '{}'::jsonb); exception when others then old_notes := '{}'::jsonb; end;
        begin new_notes := new.notes::jsonb; exception when others then raise exception 'Application notes must be valid JSON'; end;
        if (old_notes -> 'avaScorecard') is distinct from (new_notes -> 'avaScorecard')
           or (old_notes -> 'avaAnalysisMeta') is distinct from (new_notes -> 'avaAnalysisMeta') then
          raise exception 'Candidates cannot edit quiz results or the Ava scorecard directly';
        end if;
      end if;
      return new;
    end;
    $$;
    create trigger protect_applications_candidate_writes
      before update on public.applications
      for each row execute function public.protect_application_columns();

    alter table public.applications enable row level security;
    create policy "candidate reads own" on public.applications for select using (auth.uid() = candidate_id);
    create policy "candidate updates own" on public.applications for update using (auth.uid() = candidate_id);
  `);

  // ---- apply the migration under test, verbatim, twice ----
  let migrationError = null;
  try {
    await db.exec(migrationSql);
    await db.exec(migrationSql);
  } catch (e) {
    migrationError = e.message;
  }
  check("the migration applies cleanly, and again (CREATE OR REPLACE, re-runnable)", migrationError === null, migrationError ?? "");

  async function as(uid, role) {
    await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
    await db.exec(`select set_config('request.jwt.claim.role', '${role}', false);`);
    await db.exec(`set role ${role};`);
  }
  async function reset() {
    await db.exec(`reset role;`);
  }
  async function tryQuery(sql, params = []) {
    try {
      const res = await db.query(sql, params);
      return { ok: true, rows: res.rows };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  async function storedNotes(id = APP) {
    const r = await db.query(`select notes, updated_at from public.applications where id = $1`, [id]);
    const row = r.rows[0];
    let parsed = null;
    try {
      parsed = row?.notes == null ? null : JSON.parse(row.notes);
    } catch {
      parsed = "<<unparseable>>";
    }
    return { raw: row?.notes ?? null, parsed, updatedAt: row?.updated_at ?? null };
  }
  async function setNotes(text, id = APP) {
    await reset();
    await db.query(`update public.applications set notes = $2 where id = $1`, [id, text]);
  }
  async function merge(patch, id = APP) {
    await as(null, "service_role");
    const res = await tryQuery(`select public.merge_application_notes($1::uuid, $2::jsonb) as merged`, [
      id,
      patch === undefined ? null : JSON.stringify(patch),
    ]);
    await reset();
    return res;
  }

  await db.query(
    `insert into public.applications (id, candidate_id, status, phase, notes, updated_at)
     values ($1, $2, 'reviewing', 'step_typing', $3, now() - interval '1 hour')`,
    [
      APP,
      CANDIDATE,
      JSON.stringify({
        applicationAnswers: [{ question: "Full name", answer: "Test Person" }],
        quizResult: { score: 100, correct: 10, total: 10, passed: true },
        avaScorecard: { overallScore: 61, evidenceFingerprint: "after-quiz" },
        avaAnalysisMeta: { analyzedAt: "2026-10-05T15:46:31.000Z", analysisStartedAt: "2026-10-05T15:45:44.000Z" },
      }),
    ],
  );

  // =========================================================================
  console.log("\nMerging only the keys a writer owns:\n");

  const before = await storedNotes();
  const typingResult = { wpm: 52, accuracy: 97, score: 88, requiredWpm: 45 };
  const stepWrite = await merge({
    typingTestResult: typingResult,
    _trusted: { step_typing: { stepType: "typing_test", completedAt: "2026-10-05T15:47:40.146Z" } },
  });
  check("service_role can call merge_application_notes", stepWrite.ok, stepWrite.error);
  let after = await storedNotes();
  check("the step result landed", same(after.parsed.typingTestResult, typingResult));
  check("the application answers are untouched", after.parsed.applicationAnswers?.[0]?.answer === "Test Person");
  check("the quiz result is untouched", after.parsed.quizResult?.score === 100);
  check("Ava's earlier scorecard is untouched", after.parsed.avaScorecard?.evidenceFingerprint === "after-quiz");
  check(
    "updated_at moved (the table's own trigger ran)",
    new Date(after.updatedAt).getTime() > new Date(before.updatedAt).getTime(),
    `${before.updatedAt} -> ${after.updatedAt}`,
  );
  const returned = stepWrite.rows?.[0]?.merged;
  check(
    "it returns the merged object, the same one it stored",
    returned && same(returned, after.parsed),
    JSON.stringify(returned)?.slice(0, 160),
  );

  // The race this exists for: Ava's background analysis started from a
  // snapshot taken BEFORE the typing result existed. Its write must add its
  // own two keys and leave the typing result alone.
  const lateScorecard = { overallScore: 58, evidenceFingerprint: "after-quiz-snapshot" };
  const lateMeta = { analyzedAt: "2026-10-05T15:48:18.000Z", analysisStartedAt: "2026-10-05T15:47:41.000Z" };
  const analysisWrite = await merge({ avaScorecard: lateScorecard, avaAnalysisMeta: lateMeta });
  check("a background analysis write succeeds", analysisWrite.ok, analysisWrite.error);
  after = await storedNotes();
  check(
    "a background analysis started before the typing result does NOT erase it",
    same(after.parsed.typingTestResult, typingResult),
  );
  check("the server-only _trusted marker survives it too", after.parsed._trusted?.step_typing?.stepType === "typing_test");
  check("Ava's new scorecard replaced the old one", after.parsed.avaScorecard?.evidenceFingerprint === "after-quiz-snapshot");
  check("and her new meta replaced the old meta", after.parsed.avaAnalysisMeta?.analysisStartedAt === lateMeta.analysisStartedAt);

  // ...and the other direction: a step result written after the analysis
  // landed keeps the analysis.
  const chatResult = { score: 74, empathy: 80, problemSolving: 70 };
  await merge({ chatSimulationResult: chatResult });
  after = await storedNotes();
  check("a later step result keeps Ava's scorecard", after.parsed.avaScorecard?.evidenceFingerprint === "after-quiz-snapshot");
  check("and keeps the earlier step result", after.parsed.typingTestResult?.wpm === 52);
  check("and adds its own", after.parsed.chatSimulationResult?.score === 74);

  console.log("\nA patched key replaces that key's whole value (no deep merge):\n");
  await merge({ typingTestResult: { wpm: 61 } });
  after = await storedNotes();
  check(
    "a retaken result replaces the old object outright",
    same(after.parsed.typingTestResult, { wpm: 61 }),
    JSON.stringify(after.parsed.typingTestResult),
  );

  // =========================================================================
  console.log("\nNotes with nothing in them are treated as {}:\n");
  let res;

  for (const [label, raw] of [
    ["NULL", null],
    ["empty string", ""],
    ["whitespace", "   \n "],
    ["the JSON literal null", "null"],
  ]) {
    await setNotes(raw);
    const res = await merge({ avaScorecard: { overallScore: 50 } });
    const stored = await storedNotes();
    check(
      `${label}: no error, and the result is just the patch`,
      res.ok && same(stored.parsed, { avaScorecard: { overallScore: 50 } }),
      res.error ?? JSON.stringify(stored.parsed),
    );
  }

  console.log("\nNotes that are not a JSON object are kept, never erased:\n");

  for (const [label, raw] of [
    ["malformed JSON", "{not json"],
    ["a JSON array", "[1,2,3]"],
    ["a JSON string", "\"hello\""],
  ]) {
    await setNotes(raw);
    const res = await merge({ avaScorecard: { overallScore: 50 } });
    const stored = await storedNotes();
    check(
      `${label}: no error, the stored text kept whole under _unparsedNotes, the patch beside it`,
      res.ok && same(stored.parsed, { _unparsedNotes: raw, avaScorecard: { overallScore: 50 } }),
      res.error ?? JSON.stringify(stored.parsed),
    );
    // A second merge reads the (now valid) object and keeps the kept text.
    await merge({ typingTestResult: { wpm: 50 } });
    const again = await storedNotes();
    check(
      `${label}: a later merge keeps both the kept text and the earlier patch`,
      again.parsed._unparsedNotes === raw && again.parsed.avaScorecard?.overallScore === 50 && again.parsed.typingTestResult?.wpm === 50,
      JSON.stringify(again.parsed),
    );
  }

  console.log("\nA NUL character (JavaScript reads it, jsonb refuses it):\n");

  // Exactly what the old whole-notes text writes could store: JSON.stringify
  // turns a NUL in a chat transcript into the six characters \u0000.
  const withNul = {
    applicationAnswers: [{ question: "Full name", answer: "Test Person" }],
    typingTestResult: { wpm: 52, accuracy: 97 },
    chatSimulationResult: { messages: [{ role: "candidate", content: "hi\u0000there" }] },
  };
  const withNulText = JSON.stringify(withNul);
  check("(fixture check) the stored text holds the \\u0000 escape and JavaScript reads it", withNulText.includes("\\u0000") && !!JSON.parse(withNulText).typingTestResult);
  await setNotes(withNulText);
  res = await merge({ avaScorecard: { overallScore: 44 } });
  let nulStored = await storedNotes();
  check("the merge succeeds", res.ok, res.error);
  check(
    "the application answers and every test result survive (they were erased before)",
    nulStored.parsed.applicationAnswers?.[0]?.answer === "Test Person"
      && nulStored.parsed.typingTestResult?.wpm === 52
      && Array.isArray(nulStored.parsed.chatSimulationResult?.messages),
    JSON.stringify(nulStored.parsed),
  );
  check(
    "the NUL reads as U+FFFD and nothing else in the transcript changed",
    nulStored.parsed.chatSimulationResult?.messages?.[0]?.content === "hi\uFFFDthere",
    JSON.stringify(nulStored.parsed.chatSimulationResult),
  );
  check("and the patch landed beside them", nulStored.parsed.avaScorecard?.overallScore === 44);

  // An escaped backslash before u0000 is literal text, not a NUL. The swap
  // keeps it valid JSON (it only applies when the plain cast already failed).
  const tricky = JSON.stringify({ a: "C:\\u0000dir", b: "x\u0000y", keep: 1 });
  await setNotes(tricky);
  res = await merge({ avaScorecard: { overallScore: 45 } });
  nulStored = await storedNotes();
  check(
    "a literal backslash-u0000 next to a real NUL still reads as an object, nothing kept aside",
    res.ok && nulStored.parsed.keep === 1 && nulStored.parsed._unparsedNotes === undefined && nulStored.parsed.avaScorecard?.overallScore === 45,
    res.error ?? JSON.stringify(nulStored.parsed),
  );

  // The patch side cannot be repaired in SQL: jsonb refuses the parameter
  // before the function runs. That is why recordStepResult and
  // trigger-ava-analysis pass every patch through withoutNulCharacters.
  res = await merge({ chatInterviewResult: { transcript: "a\u0000b" } });
  check("a patch holding a NUL character is refused by jsonb itself", !res.ok && /unsupported Unicode escape/i.test(res.error), res.error);
  res = await merge({ chatInterviewResult: { transcript: "a\uFFFDb" } });
  check("the same patch with the NUL as U+FFFD is accepted", res.ok, res.error);

  // =========================================================================
  console.log("\nBad calls are refused loudly:\n");

  res = await merge(["not", "an", "object"]);
  check("an array patch is refused", !res.ok && /must be a JSON object/.test(res.error), res.error);
  res = await merge(undefined);
  check("a NULL patch is refused", !res.ok && /must be a JSON object/.test(res.error), res.error);
  res = await merge({ avaScorecard: {} }, MISSING_APP);
  check("a missing application is refused (not a silent no-op)", !res.ok && /not found/.test(res.error), res.error);

  // =========================================================================
  console.log("\nOnly the server may call it:\n");

  await setNotes(JSON.stringify({ applicationAnswers: [] }));
  await as(CANDIDATE, "authenticated");
  res = await tryQuery(`select public.merge_application_notes($1::uuid, $2::jsonb)`, [
    APP,
    JSON.stringify({ avaScorecard: { overallScore: 100 } }),
  ]);
  await reset();
  check("the candidate (authenticated) cannot call it", !res.ok && /permission denied/i.test(res.error), res.error);

  await as(null, "anon");
  res = await tryQuery(`select public.merge_application_notes($1::uuid, $2::jsonb)`, [
    APP,
    JSON.stringify({ avaScorecard: { overallScore: 100 } }),
  ]);
  await reset();
  check("anon cannot call it", !res.ok && /permission denied/i.test(res.error), res.error);

  const stored = await storedNotes();
  check("and neither attempt changed anything", stored.parsed.avaScorecard === undefined, JSON.stringify(stored.parsed));

  // The fixture's protect trigger is real: the same change as a direct
  // candidate UPDATE is refused, which is why the server needs this path.
  await as(CANDIDATE, "authenticated");
  res = await tryQuery(`update public.applications set notes = $2 where id = $1`, [
    APP,
    JSON.stringify({ applicationAnswers: [], avaScorecard: { overallScore: 100 } }),
  ]);
  await reset();
  check(
    "(fixture check) a candidate's own direct write of the scorecard is refused by the protect trigger",
    !res.ok && /Ava scorecard/.test(res.error),
    res.error,
  );

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
