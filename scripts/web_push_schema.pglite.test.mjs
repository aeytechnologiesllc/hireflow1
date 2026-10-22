#!/usr/bin/env node
/**
 * The database half of phone notifications (supabase/migrations/
 * 20261021220000_web_push.sql), run for real in PGlite on top of the original
 * push_subscriptions table and its row-level security:
 *
 *   - it applies, and applies again (the live schema may already be partly done);
 *   - a browser subscription needs an https address and both keys, and one
 *     address is one row; the old OneSignal rows (no address) are untouched;
 *   - a person reads, writes and removes only their own devices;
 *   - save_web_push_subscription moves a device to whoever is signed in on it
 *     (an owner and an applicant account on one phone), where a plain upsert
 *     is refused by row-level security; keeps ten newest per person; refuses a
 *     caller who is not signed in;
 *   - push_vapid_keys (HireFlow's private sender key) is unreachable to every
 *     browser role and reachable to the service role.
 *
 * Run with: node scripts/web_push_schema.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
function check(label, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const db = new PGlite();
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant anon, authenticated, service_role to postgres;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  insert into auth.users values ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002');
`);

// The table as the original migration made it (the pg_net line is not needed here).
const original = (await readFile(path.join(ROOT, "supabase/migrations/20260312192140_02ed0275-7da7-4dee-b90b-e2cdaee92324.sql"), "utf8")).replace(/CREATE EXTENSION IF NOT EXISTS pg_net[^;]*;/i, "");
await db.exec(original);
await db.exec(`insert into public.push_subscriptions (user_id, player_id, platform) values ('10000000-0000-4000-8000-000000000001', 'onesignal-1', 'ios'), ('10000000-0000-4000-8000-000000000001', 'onesignal-2', 'ios')`);

const sql = await readFile(path.join(ROOT, "supabase/migrations/20261021220000_web_push.sql"), "utf8");
let applied = true;
try {
  await db.exec(sql);
  await db.exec(sql);
} catch (err) {
  applied = false;
  console.log(err.message);
}
check("it applies, and applies again", applied);

const MARIA = "10000000-0000-4000-8000-000000000001";
const RICO = "10000000-0000-4000-8000-000000000002";
async function as(uid, role, q, params = []) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${role};`);
  try {
    return { ok: true, rows: (await db.query(q, params)).rows };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

// Realistic key lengths: a 65-byte point is 87 base64url characters, a 16-byte secret is 22.
const P256DH = "B".repeat(87);
const AUTH = "a".repeat(22);
const web = (n) => `https://fcm.googleapis.com/fcm/send/device-${n}`;
const direct = (uid, endpoint, p = P256DH, a = AUTH) =>
  as(uid, "authenticated", `insert into public.push_subscriptions (user_id, platform, endpoint, p256dh, auth, user_agent) values ($1, 'web', $2, $3, $4, 'test') returning id`, [uid, endpoint, p, a]);

console.log("-- the table --");
const cols = (await db.query(`select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'push_subscriptions'`)).rows;
const col = (n) => cols.find((c) => c.column_name === n);
check("endpoint, p256dh, auth, user_agent, last_success_at exist", ["endpoint", "p256dh", "auth", "user_agent", "last_success_at"].every((n) => col(n)));
check("player_id no longer has to be set (a web row has none)", col("player_id")?.is_nullable === "YES");
check("the old OneSignal rows are untouched", (await db.query(`select count(*)::int n from public.push_subscriptions where endpoint is null and player_id like 'onesignal-%'`)).rows[0].n === 2);
check("a person saves a browser subscription of their own", (await direct(MARIA, web(1))).ok);
check("one address is one row", !(await direct(MARIA, web(1))).ok);
check("an http address is refused", !(await direct(MARIA, "http://fcm.googleapis.com/x")).ok);
check("a subscription without keys is refused", !(await as(MARIA, "authenticated", `insert into public.push_subscriptions (user_id, platform, endpoint) values ($1, 'web', $2)`, [MARIA, web(2)])).ok);
check("a key of the wrong size is refused", !(await direct(MARIA, web(3), "short", AUTH)).ok);
check("an endless address is refused", !(await direct(MARIA, "https://fcm.googleapis.com/" + "a".repeat(2100))).ok);
check("the OneSignal path (a player id, no address) still saves", (await as(MARIA, "authenticated", `insert into public.push_subscriptions (user_id, player_id, platform) values ($1, 'onesignal-3', 'ios')`, [MARIA])).ok);

console.log("-- whose devices --");
check("nobody saves a device as someone else", !(await direct(RICO, web(10)).then(() => as(RICO, "authenticated", `insert into public.push_subscriptions (user_id, platform, endpoint, p256dh, auth) values ($1, 'web', $2, $3, $4)`, [MARIA, web(11), P256DH, AUTH]))).ok);
const ricoReads = await as(RICO, "authenticated", `select endpoint from public.push_subscriptions where endpoint = $1`, [web(1)]);
check("nobody reads someone else's devices", ricoReads.ok && ricoReads.rows.length === 0);
const ricoDeletes = await as(RICO, "authenticated", `delete from public.push_subscriptions where endpoint = $1 returning id`, [web(1)]);
check("nobody removes someone else's device", ricoDeletes.ok && ricoDeletes.rows.length === 0);
const mariaDeletes = await as(MARIA, "authenticated", `delete from public.push_subscriptions where endpoint = $1 returning id`, [web(1)]);
check("a person removes their own (sign-out does this)", mariaDeletes.ok && mariaDeletes.rows.length === 1);
check("signed out: nothing", !(await as(null, "anon", `select id from public.push_subscriptions`)).ok || (await as(null, "anon", `select id from public.push_subscriptions`)).rows.length === 0);

console.log("-- save_web_push_subscription --");
const save = (uid, role, endpoint) => as(uid, role, `select public.save_web_push_subscription($1, $2, $3, 'Mozilla/5.0 (iPhone)')`, [endpoint, P256DH, AUTH]);
check("a signed-in person saves this device", (await save(MARIA, "authenticated", web(20))).ok);
const row = (await db.query(`select user_id, platform, user_agent, player_id from public.push_subscriptions where endpoint = $1`, [web(20)])).rows[0];
check("it is Maria's, platform web, with the browser name and no player id", row?.user_id === MARIA && row.platform === "web" && row.user_agent === "Mozilla/5.0 (iPhone)" && row.player_id === null);
check("saving it again is harmless (still one row)", (await save(MARIA, "authenticated", web(20))).ok && (await db.query(`select count(*)::int n from public.push_subscriptions where endpoint = $1`, [web(20)])).rows[0].n === 1);

const plain = await as(RICO, "authenticated", `insert into public.push_subscriptions (user_id, platform, endpoint, p256dh, auth) values ($1, 'web', $2, $3, $4) on conflict (endpoint) do update set user_id = excluded.user_id`, [RICO, web(20), P256DH, AUTH]);
check("a plain upsert onto another account's device is refused by row-level security (why the function exists)", !plain.ok, JSON.stringify(plain));
check("the same phone, now signed in as Rico: the device moves to Rico", (await save(RICO, "authenticated", web(20))).ok);
check("…it is one row, Rico's", (await db.query(`select user_id from public.push_subscriptions where endpoint = $1`, [web(20)])).rows.map((r) => r.user_id).join() === RICO);
check("…and Maria no longer sees it", (await as(MARIA, "authenticated", `select id from public.push_subscriptions where endpoint = $1`, [web(20)])).rows.length === 0);

check("signed out (anon) cannot call it", !(await save(null, "anon", web(21))).ok);
const noSub = await save(null, "authenticated", web(21));
check("a token with no user is refused (not_signed_in)", !noSub.ok && /not_signed_in/.test(noSub.error ?? ""), JSON.stringify(noSub));
check("it never saves a malformed subscription", !(await as(MARIA, "authenticated", `select public.save_web_push_subscription('http://x', $1, $2)`, [P256DH, AUTH])).ok);

for (let i = 100; i < 112; i++) {
  await save(MARIA, "authenticated", web(i));
  await db.query(`update public.push_subscriptions set updated_at = now() - make_interval(secs => $2) where endpoint = $1`, [web(i), 1000 - i]);
}
await save(MARIA, "authenticated", web(112));
const kept = (await db.query(`select endpoint from public.push_subscriptions where user_id = $1 and endpoint is not null order by endpoint`, [MARIA])).rows.map((r) => r.endpoint);
check("a person keeps their ten newest devices", kept.length === 10, String(kept.length));
check("…the oldest ones go, the newest stay", [100, 101, 102].every((i) => !kept.includes(web(i))) && kept.includes(web(111)) && kept.includes(web(112)));
check("…and OneSignal rows are never trimmed", (await db.query(`select count(*)::int n from public.push_subscriptions where user_id = $1 and endpoint is null`, [MARIA])).rows[0].n === 3);
check("trimming one person's devices never touches another's", (await db.query(`select count(*)::int n from public.push_subscriptions where endpoint = $1 and user_id = $2`, [web(20), RICO])).rows[0].n === 1);

console.log("-- push_vapid_keys (HireFlow's private sender key) --");
const flags = (await db.query(`select relrowsecurity from pg_class where oid = 'public.push_vapid_keys'::regclass`)).rows[0];
check("row-level security is on", flags?.relrowsecurity === true);
check("with no policy at all", (await db.query(`select count(*)::int n from pg_policies where tablename = 'push_vapid_keys'`)).rows[0].n === 0);
check("only one row can ever exist (id = 1)", !(await db.query(`insert into public.push_vapid_keys (id, public_key, private_jwk) values (2, 'x', '{}')`).then(() => ({ ok: true }), () => ({ ok: false }))).ok);
const stored = await as(null, "service_role", `insert into public.push_vapid_keys (id, public_key, private_jwk) values (1, 'PUBLIC', '{"d":"SECRET"}') on conflict (id) do nothing returning id`);
check("the service role writes it", stored.ok && stored.rows.length === 1, JSON.stringify(stored));
check("…and reads it", (await as(null, "service_role", `select private_jwk from public.push_vapid_keys`)).rows[0]?.private_jwk?.d === "SECRET");
check("a second insert at the service role is a quiet no-op (the race)", (await as(null, "service_role", `insert into public.push_vapid_keys (id, public_key, private_jwk) values (1, 'OTHER', '{}') on conflict (id) do nothing returning id`)).rows.length === 0);
for (const role of ["anon", "authenticated"]) {
  const r = await as(MARIA, role, `select private_jwk from public.push_vapid_keys`);
  check(`${role} cannot read the private key`, !r.ok && /permission denied/.test(r.error ?? ""), JSON.stringify(r));
  check(`${role} cannot write it`, !(await as(MARIA, role, `insert into public.push_vapid_keys (id, public_key, private_jwk) values (1, 'x', '{}') on conflict (id) do update set public_key = 'x'`)).ok);
  check(`${role} cannot even delete it`, !(await as(MARIA, role, `delete from public.push_vapid_keys`)).ok);
}

await db.close();
console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
