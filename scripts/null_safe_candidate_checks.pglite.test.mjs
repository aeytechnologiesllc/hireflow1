#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20260916210000_null_safe_candidate_ownership_checks.sql.
 *
 * submit_quiz_attempt and submit_voice_interview_manual_end checked
 * `app.candidate_id <> auth.uid()`. A signed-out caller has auth.uid() NULL,
 * the comparison is NULL, and the IF never raised. This file loads the real
 * migrations in deploy order and proves:
 *   - BEFORE the fix, a signed-out caller gets past both checks (the bug is real)
 *   - AFTER the fix, a signed-out caller is refused by both
 *   - the application's own candidate still gets through; another candidate is still refused
 *   - anon no longer has EXECUTE on either function (PUBLIC revoked too), authenticated still does
 *   - re-running the migration fails loudly instead of half-applying (drift assertion)
 *
 * Run with: node scripts/null_safe_candidate_checks.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const M = (f) => readFile(path.join(ROOT, "supabase/migrations", f), "utf8");

let pass = 0;
let fail = 0;
const failures = [];
function ok(cond, label) {
  if (cond) pass++;
  else {
    fail++;
    failures.push(label);
    console.log(`  FAIL: ${label}`);
  }
}

async function main() {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('test.uid', true), '')::uuid
      $$;
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text
      LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('test.role', true), '')
      $$;

    CREATE ROLE authenticated;
    CREATE ROLE anon;
    CREATE ROLE service_role;

    CREATE TYPE application_status AS ENUM (
      'pending', 'reviewing', 'interview', 'offered', 'hired', 'rejected', 'in_progress'
    );

    CREATE TABLE public.jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      employer_id uuid NOT NULL,
      quiz_questions jsonb,
      workflow_steps jsonb,
      passing_score int DEFAULT 60,
      processing_mode text DEFAULT 'manual'
    );

    CREATE TABLE public.team_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      employer_id uuid NOT NULL,
      user_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'active',
      can_manage_pipeline boolean NOT NULL DEFAULT false,
      can_create_jobs boolean NOT NULL DEFAULT false,
      can_delete_jobs boolean NOT NULL DEFAULT false,
      assigned_job_ids uuid[]
    );

    CREATE TABLE public.applications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id uuid NOT NULL,
      candidate_id uuid NOT NULL,
      status application_status NOT NULL DEFAULT 'in_progress',
      cover_letter text,
      resume_url text,
      ai_analysis text,
      ai_score numeric,
      ai_scorecard jsonb,
      notes text,
      phase text,
      phase_ai_analysis text,
      rejected_by uuid,
      rejected_by_type text,
      resume_score numeric,
      voice_interview_result jsonb,
      voice_interview_transcript jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION public.is_job_owner(p_job_id uuid, p_user_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
      SELECT EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = p_job_id AND j.employer_id = p_user_id);
    $$;

    CREATE OR REPLACE FUNCTION public.is_active_team_member_for_job(
      p_job_id uuid, p_user_id uuid,
      p_require_manage_pipeline boolean DEFAULT false,
      p_require_create_jobs boolean DEFAULT false,
      p_require_delete_jobs boolean DEFAULT false
    )
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.jobs j
        JOIN public.team_members tm ON tm.employer_id = j.employer_id
        WHERE j.id = p_job_id AND tm.user_id = p_user_id AND tm.status = 'active'
          AND (NOT p_require_manage_pipeline OR tm.can_manage_pipeline = true)
          AND (NOT p_require_create_jobs OR tm.can_create_jobs = true)
          AND (NOT p_require_delete_jobs OR tm.can_delete_jobs = true)
          AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY (tm.assigned_job_ids))
      );
    $$;
  `);


  await db.exec(await M("20260915110000_quiz_answer_keys_server_side.sql"));
  await db.exec(await M("20260915140000_trusted_step_results.sql"));
  await db.exec(await M("20260916150700_enforce_voice_interview_result.sql"));
  // Mirror Supabase's default grants, so the REVOKE ... FROM anon is meaningful.
  await db.exec(`
    GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid, text, jsonb, jsonb) TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.submit_voice_interview_manual_end(uuid, jsonb, integer) TO anon, authenticated, service_role;
  `);
  const fixSql = await M("20260916210000_null_safe_candidate_ownership_checks.sql");

  const employerId = randomUUID();
  const candidateId = randomUUID();
  const otherCandidateId = randomUUID();
  const jobId = (await db.query(`INSERT INTO public.jobs (employer_id) VALUES ($1) RETURNING id`, [employerId])).rows[0].id;
  const newApp = async () =>
    (await db.query(`INSERT INTO public.applications (job_id, candidate_id, status) VALUES ($1, $2, 'pending') RETURNING id`, [jobId, candidateId])).rows[0].id;
  const actAs = (uid, role) =>
    db.query(`SELECT set_config('test.uid', $1, false), set_config('test.role', $2, false)`, [uid ?? "", role ?? ""]);

  // Returns the error message, or "OK" when the call succeeded.
  async function attempt(sql, params) {
    try {
      await db.query(sql, params);
      return "OK";
    } catch (e) {
      return e.message;
    }
  }
  const quiz = (appId) => attempt(`SELECT public.submit_quiz_attempt($1, 'quiz-step', '{}'::jsonb, '[]'::jsonb)`, [appId]);
  const voice = (appId) => attempt(`SELECT public.submit_voice_interview_manual_end($1, '[]'::jsonb, 10)`, [appId]);
  const refused = (msg) => /Not authorized/.test(msg);

  console.log("== BEFORE the fix: a signed-out caller slips past both checks ==");
  {
    await actAs(null, "anon");
    const q = await quiz(await newApp());
    const v = await voice(await newApp());
    console.log(`  signed-out quiz  -> ${q}\n  signed-out voice -> ${v}`);
    ok(!refused(q), `before: signed-out submit_quiz_attempt is NOT refused (bug reproduced) — got: ${q}`);
    ok(!refused(v), `before: signed-out submit_voice_interview_manual_end is NOT refused (bug reproduced) — got: ${v}`);
  }

  await db.exec(fixSql);
  console.log("Applied 20260916210000_null_safe_candidate_ownership_checks.sql\n");

  console.log("== AFTER the fix ==");
  {
    await actAs(null, "anon");
    const q = await quiz(await newApp());
    const v = await voice(await newApp());
    ok(refused(q), `after: signed-out submit_quiz_attempt is refused — got: ${q}`);
    ok(refused(v), `after: signed-out submit_voice_interview_manual_end is refused — got: ${v}`);

    await actAs(otherCandidateId, "authenticated");
    ok(refused(await quiz(await newApp())), "after: a different candidate is still refused (quiz)");
    ok(refused(await voice(await newApp())), "after: a different candidate is still refused (voice)");

    await actAs(candidateId, "authenticated");
    const ownQ = await quiz(await newApp());
    ok(!refused(ownQ), `after: the application's own candidate gets past the quiz check — got: ${ownQ}`);
    const ownV = await voice(await newApp());
    ok(ownV === "OK", `after: the application's own candidate can still end their voice interview — got: ${ownV}`);
  }

  console.log("== grants ==");
  {
    const g = await db.query(`
      SELECT has_function_privilege('anon', 'public.submit_quiz_attempt(uuid, text, jsonb, jsonb)', 'EXECUTE') AS anon_quiz,
             has_function_privilege('anon', 'public.submit_voice_interview_manual_end(uuid, jsonb, integer)', 'EXECUTE') AS anon_voice,
             has_function_privilege('authenticated', 'public.submit_quiz_attempt(uuid, text, jsonb, jsonb)', 'EXECUTE') AS auth_quiz,
             has_function_privilege('authenticated', 'public.submit_voice_interview_manual_end(uuid, jsonb, integer)', 'EXECUTE') AS auth_voice,
             has_function_privilege('service_role', 'public.submit_voice_interview_manual_end(uuid, jsonb, integer)', 'EXECUTE') AS svc_voice`);
    const r = g.rows[0];
    ok(r.anon_quiz === false && r.anon_voice === false, "anon has no EXECUTE on either function (PUBLIC revoked too)");
    ok(r.auth_quiz === true && r.auth_voice === true && r.svc_voice === true, "authenticated and service_role keep EXECUTE");
  }

  console.log("== drift assertion ==");
  {
    let rerun;
    try {
      await db.exec(fixSql);
      rerun = "OK";
    } catch (e) {
      rerun = e.message;
    }
    ok(/expected exactly 1/.test(rerun), `re-running the patch refuses instead of half-applying — got: ${rerun}`);
  }

  console.log(fail === 0 ? `\nAll ${pass} checks passed.` : `\n${pass} passed, ${fail} FAILED:\n  - ${failures.join("\n  - ")}`);
  await db.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal error running PGlite proof:", e);
  process.exit(1);
});
