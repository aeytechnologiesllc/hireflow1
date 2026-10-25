#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20261025070000_revoke_unneeded_function_access.sql
 * (docs/LAUNCH-PLAN.md, Phase 1, task 7): a SECURITY DEFINER trigger
 * function still fires for an ordinary user after EXECUTE is revoked (the
 * premise the migration rests on), visitors can no longer call the three
 * functions, signed-in users still can, and has_role stays callable for the
 * policies that use it.
 *
 * Run with: node scripts/revoke_unneeded_function_access.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) { passed += 1; console.log(`  ok  - ${name}`); } else { failed += 1; console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`); }
}

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  grant anon, authenticated to postgres;
  grant usage on schema public to anon, authenticated;
  create table public.things (id serial primary key, stamped text);
  grant select, insert on public.things to authenticated;
  grant usage on sequence public.things_id_seq to authenticated;
  create function public.stamp_thing() returns trigger language plpgsql security definer set search_path = public as $$
    begin new.stamped := 'by trigger'; return new; end $$;
  create trigger stamp before insert on public.things for each row execute function public.stamp_thing();
  create function public.get_job_quiz_keys(p_job_id uuid) returns table(step_id text, question_id text, key jsonb) language sql security definer as $$ select null::text, null::text, null::jsonb where false $$;
  create function public.grant_quiz_retake(p_candidate_id uuid, p_job_id uuid, p_step_id text) returns void language sql security definer as $$ select $$;
  create function public.assign_user_role(p_role text) returns void language sql security definer as $$ select $$;
  create function public.has_role(_user_id uuid, _role text) returns boolean language sql stable security definer as $$ select false $$;
  grant execute on all functions in schema public to anon, authenticated;
`);
await db.exec(readFileSync(path.join(ROOT, "supabase/migrations/20261025070000_revoke_unneeded_function_access.sql"), "utf8"));

const can = async (role, sql) => {
  try { await db.exec(`set role ${role}; ${sql}; reset role;`); return true; } catch { await db.exec(`reset role;`); return false; }
};
check("a revoked trigger function still fires for a signed-in user's insert", await can("authenticated", "insert into public.things default values"));
const row = (await db.query(`select stamped from public.things order by id desc limit 1`)).rows[0];
check("…and did its work", row?.stamped === "by trigger");
check("nobody can call the trigger function directly", !(await can("authenticated", "select public.stamp_thing()")));
for (const fn of ["get_job_quiz_keys('00000000-0000-0000-0000-000000000000')", "grant_quiz_retake(null, null, null)", "assign_user_role('employer')"]) {
  check(`a visitor cannot call ${fn.split("(")[0]}`, !(await can("anon", `select public.${fn}`)));
  check(`a signed-in user still can call ${fn.split("(")[0]}`, await can("authenticated", `select public.${fn}`));
}
check("has_role stays callable for visitors (policies use it)", await can("anon", "select public.has_role(null, 'x')"));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
