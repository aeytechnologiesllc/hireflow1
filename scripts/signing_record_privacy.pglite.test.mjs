#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/*_signing_record_privacy.sql, and a
 * check of supabase/functions/_shared/signerContext.ts.
 *
 * The owner, 2026-10-11: "the employer will see all of the applicant detail
 * stuff, but the applicant, when they see the signature, they don't get to
 * see device fingerprinting, IP addresses of the employer."
 *
 *   1. Nobody reads the private columns (IP, browser, place, details, email)
 *      of document_audit_logs straight from the table any more.
 *   2. document_audit_log(): the team (the sender) reads every row whole;
 *      the applicant (the recipient) reads their own rows whole and the
 *      team's without IP, browser, place, details or email; anyone else
 *      reads nothing.
 *   3. The signer context: every field cut to a plain short value or
 *      dropped; the place marked with whether its address matches the
 *      server's.
 *
 * Run with: node scripts/signing_record_privacy.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

const TEAM = "10000000-0000-4000-8000-000000000001";
const ANA = "20000000-0000-4000-8000-000000000001";
const BEN = "20000000-0000-4000-8000-000000000002";
const DOC = "50000000-0000-4000-8000-000000000001";

async function database() {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant anon to postgres; grant authenticated to postgres; grant service_role to postgres;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create table public.documents (id uuid primary key, sender_id uuid, recipient_id uuid);
    -- document_audit_logs as live (2026-10-11), column for column, in order.
    create table public.document_audit_logs (
      id uuid primary key default gen_random_uuid(), document_id uuid, user_id uuid, action text, details jsonb,
      ip_address text, user_agent text, created_at timestamptz default now(), signer_name text, signer_email text,
      signer_role text, signature_method text, consent_confirmed boolean, document_hash text, document_version int,
      location_city text, location_region text, location_country text, page_numbers_signed int[],
      signature_event_id text, pre_signature_hash text, post_signature_hash text, signing_order_position int, timestamp_utc timestamptz
    );
    alter table public.document_audit_logs enable row level security;
    create policy "Users can view audit logs for their documents" on public.document_audit_logs for select
      using (exists (select 1 from public.documents d where d.id = document_audit_logs.document_id and (d.sender_id = auth.uid() or d.recipient_id = auth.uid())));
    insert into public.documents values ('${DOC}', '${TEAM}', '${ANA}');
    insert into public.document_audit_logs (document_id, user_id, action, details, ip_address, user_agent, created_at, signer_name, signer_email, signer_role, location_city, location_region, location_country) values
      ('${DOC}', '${ANA}', 'candidate_signed', '{"device":{"deviceType":"phone","platform":"iOS","timeZone":"Asia/Manila"}}', '49.145.1.1', 'Mozilla/5.0 (iPhone)', now() - interval '2 hours', 'Ana Reyes', 'ana@example.com', 'candidate', 'Manila', 'Metro Manila', 'PH'),
      ('${DOC}', '${TEAM}', 'employer_countersigned', '{"device":{"deviceType":"computer","platform":"macOS","timeZone":"America/New_York"}}', '99.74.0.227', 'Mozilla/5.0 (Macintosh)', now() - interval '1 hour', 'Zack', 'zack@yahoo.com', 'employer', 'Ashburn', 'Virginia', 'US');
  `);
  async function as(uid, role, sql, params = []) {
    await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
    await db.exec(`set role ${role};`);
    try {
      const r = await db.query(sql, params);
      return { ok: true, rows: r.rows };
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      await db.exec(`reset role;`);
      await db.exec(`select set_config('request.jwt.claim.sub', '', false);`);
    }
  }
  return { db, as };
}

async function main() {
  const names = (await readdir(MIGRATIONS)).filter((n) => /^\d+_signing_record_privacy\.sql$/.test(n));
  check("the migration file is there, once", names.length === 1);
  if (names.length !== 1) return;
  const sql = await readFile(path.join(MIGRATIONS, names[0]), "utf8");
  const { db, as } = await database();
  let applied = true;
  try {
    await db.exec(sql);
    await db.exec(sql);
  } catch (e) {
    applied = false;
    console.log(e.message);
  }
  check("0. it applies, and applies again", applied);

  // 1
  const direct = await as(ANA, "authenticated", `select ip_address from public.document_audit_logs`);
  check("1. the applicant cannot read IP addresses straight from the table", !direct.ok, show(direct));
  const directTeam = await as(TEAM, "authenticated", `select user_agent, details, location_city, signer_email from public.document_audit_logs`);
  check("1. …nor can anyone else (the team reads through the function)", !directTeam.ok);
  const star = await as(ANA, "authenticated", `select * from public.document_audit_logs`);
  check("1. 'select *' is refused too, so no screen can read them by accident", !star.ok);
  const plain = await as(ANA, "authenticated", `select action, signer_name, created_at from public.document_audit_logs order by created_at`);
  check("1. what happened, by whom and when is still readable as before", plain.ok && plain.rows.length === 2, show(plain));

  // 2
  const team = await as(TEAM, "authenticated", `select action, ip_address, user_agent, location_city, signer_email, details from public.document_audit_log($1)`, [DOC]);
  const anaRowForTeam = team.rows?.find((r) => r.action === "candidate_signed");
  check("2. the team reads the applicant's IP, browser, place, email and device", team.ok && anaRowForTeam?.ip_address === "49.145.1.1" && anaRowForTeam?.user_agent?.includes("iPhone") && anaRowForTeam?.location_city === "Manila" && anaRowForTeam?.signer_email === "ana@example.com" && anaRowForTeam?.details?.device?.platform === "iOS", show(anaRowForTeam));
  const ana = await as(ANA, "authenticated", `select action, ip_address, user_agent, location_city, location_country, signer_email, details, signer_name from public.document_audit_log($1)`, [DOC]);
  const own = ana.rows?.find((r) => r.action === "candidate_signed");
  const theirs = ana.rows?.find((r) => r.action === "employer_countersigned");
  check("2. the applicant reads their own row whole", ana.ok && own?.ip_address === "49.145.1.1" && own?.location_city === "Manila" && own?.details?.device?.timeZone === "Asia/Manila", show(own));
  check(
    "2. …and the team's row without IP, browser, place, email or device",
    theirs && theirs.ip_address === null && theirs.user_agent === null && theirs.location_city === null && theirs.location_country === null && theirs.signer_email === null && Object.keys(theirs.details ?? {}).length === 0,
    show(theirs),
  );
  check("2. …but still sees that the team countersigned, by name", theirs?.signer_name === "Zack");
  const ben = await as(BEN, "authenticated", `select * from public.document_audit_log($1)`, [DOC]);
  check("2. someone else reads nothing", ben.ok && ben.rows.length === 0, show(ben));
  const anon = await as(null, "anon", `select * from public.document_audit_log($1)`, [DOC]);
  check("2. nobody signed out", !anon.ok);
  const service = await as(null, "service_role", `select ip_address from public.document_audit_logs`);
  check("the signing function (service role) still reads every column", service.ok && service.rows.length === 2);

  // 3
  const dir = mkdtempSync(path.join(tmpdir(), "signer-context-"));
  const out = path.join(dir, "signerContext.mjs");
  await build({ entryPoints: [path.join(ROOT, "supabase/functions/_shared/signerContext.ts")], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
  const sc = await import(pathToFileURL(out).href);
  rmSync(dir, { recursive: true, force: true });
  const good = sc.cleanSignerContext(
    { timeZone: "Asia/Manila", languages: ["en-PH", "fil"], screen: "390x844", deviceType: "phone", platform: "iOS", deviceId: "a1b2c3d4-0000-4000-8000-000000000000", place: { city: "Manila", region: "Metro Manila", country: "PH", ip: "49.145.1.1" } },
    "49.145.1.1",
  );
  check("3. a real context is kept", good.device.timeZone === "Asia/Manila" && good.device.languages.join(",") === "en-PH,fil" && good.device.deviceType === "phone" && good.place?.city === "Manila" && good.placeIpMatches === true, show(good));
  const other = sc.cleanSignerContext({ place: { city: "Manila", ip: "1.2.3.4" } }, "49.145.1.1");
  check("3. a place whose address is not the server's is marked so", other.placeIpMatches === false);
  const bad = sc.cleanSignerContext(
    { timeZone: "<script>", languages: ["en", "x".repeat(99), 7], screen: "big", deviceType: "fridge", platform: "a\nb", deviceId: "NOT OK", place: { country: "Philippines", city: "x".repeat(200) } },
    "1.1.1.1",
  );
  check("3. anything else is cut or dropped", bad.device.timeZone === undefined && bad.device.languages.join(",") === "en" && bad.device.screen === undefined && bad.device.deviceType === undefined && bad.device.platform === "a b" && bad.device.deviceId === undefined && bad.place?.country === undefined && bad.place?.city?.length === 64, show(bad));
  check("3. nothing sent is nothing kept", Object.keys(sc.cleanSignerContext(null, "1.1.1.1").device).length === 0 && sc.cleanSignerContext("x", "1").place === null);
  check("3. the certificate's lines read plainly", sc.placeLine(good.place) === "Manila, Metro Manila, PH" && sc.deviceLine(good.device) === "Phone, iOS, 390x844, Asia/Manila");
}

await main();
console.log(`\nsigning record privacy: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
