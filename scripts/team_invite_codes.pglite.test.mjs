#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20261025320000_team_invite_codes_stronger.sql
 * (the Phase 7 security audit): a team invite code is 'TEAM-' and 24 hex
 * characters (96 bits from gen_random_bytes), and a browser's insert never
 * keeps a code it chose itself. pgcrypto's gen_random_bytes is stood in for
 * here (PGlite ships without it); the live database has it in `extensions`.
 *
 * Run with: node scripts/team_invite_codes.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

const db = new PGlite();
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  grant anon to postgres; grant authenticated to postgres;
  create schema extensions;
  grant usage on schema extensions to anon, authenticated;
  -- Stand-in for pgcrypto's gen_random_bytes(n).
  create function extensions.gen_random_bytes(n int) returns bytea language sql volatile as $$
    select decode(substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, n * 2), 'hex') $$;
  grant execute on function extensions.gen_random_bytes(int) to anon, authenticated;
  create table public.team_invitations (id uuid primary key default gen_random_uuid(), employer_id uuid, invite_code text unique);
  grant select, insert on public.team_invitations to authenticated;
`);
await db.exec(readFileSync(path.join(ROOT, "supabase/migrations/20261025320000_team_invite_codes_stronger.sql"), "utf8"));
await db.exec(`create trigger generate_team_invite_code before insert on public.team_invitations for each row execute function public.generate_invite_code();`);

await db.exec(`set role authenticated; insert into public.team_invitations (employer_id) values (gen_random_uuid()); insert into public.team_invitations (employer_id, invite_code) values (gen_random_uuid(), 'TEAM-1'); reset role;`);
const codes = (await db.query(`select invite_code from public.team_invitations`)).rows.map((r) => r.invite_code);
check("a new invite code is TEAM- and 24 hex characters", codes.every((c) => /^TEAM-[0-9A-F]{24}$/.test(c)), JSON.stringify(codes));
check("a browser's insert never keeps a code it chose ('TEAM-1')", !codes.includes("TEAM-1"), JSON.stringify(codes));
check("two codes differ", new Set(codes).size === codes.length);
await db.exec(`insert into public.team_invitations (employer_id, invite_code) values (gen_random_uuid(), 'TEAM-SERVER0001')`);
check("the server's own insert keeps the code it gives", (await db.query(`select count(*)::int as n from public.team_invitations where invite_code = 'TEAM-SERVER0001'`)).rows[0].n === 1);
const sql = readFileSync(path.join(ROOT, "supabase/migrations/20261025320000_team_invite_codes_stronger.sql"), "utf8").replace(/--[^\n]*/g, "");
check("no md5(random()) is left in the function", !/md5\s*\(\s*random/i.test(sql));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
