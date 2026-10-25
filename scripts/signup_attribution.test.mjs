#!/usr/bin/env node
/**
 * Where a new account came from (docs/LAUNCH-PLAN.md, Phase 2, task 3):
 *   - the front page is counted again (beacon.js) and passes its visitor's
 *     campaign tags and referring site to the sign-up links (carry-source.js);
 *   - the staff site counts its sign-up page and nothing else;
 *   - src/lib/signupSource.ts keeps only short plain tags, and useAuth's
 *     signUp stores them as signup_source;
 *   - admin_growth() is the admin's only, and counts what it says (PGlite).
 *
 * Run with: node scripts/signup_attribution.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const src = await import(path.join(ROOT, "src/lib/signupSource.ts"));

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) { passed += 1; console.log(`  ok  - ${name}`); } else { failed += 1; console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`); }
}

// ---- the front page ------------------------------------------------------------
const landing = read("public/landing.html");
check("the front page loads the page counter", /<script src="\/beacon\.js" defer><\/script>/.test(landing));
check("the front page passes its source to the sign-up links", /<script src="\/carry-source\.js" defer><\/script>/.test(landing));

// Run carry-source.js against a stand-in page.
function runCarry({ search = "", referrer = "", dnt = null, links }) {
  const anchors = links.map((href) => ({ href }));
  const sandbox = {
    window: { location: { search, hostname: "hireflownow.com" }, doNotTrack: dnt },
    navigator: { doNotTrack: dnt, globalPrivacyControl: false },
    document: { referrer, querySelectorAll: () => anchors },
    URL, URLSearchParams, Array, Object,
  };
  vm.runInNewContext(read("public/carry-source.js"), sandbox);
  return anchors.map((a) => a.href);
}
let out = runCarry({ search: "?utm_source=YouTube&utm_campaign=v1", referrer: "https://www.youtube.com/watch?v=abc", links: ["https://staff.hireflownow.com/auth?mode=signup", "https://staff.hireflownow.com/auth"] });
check("tags ride onto the sign-up link", out[0] === "https://staff.hireflownow.com/auth?mode=signup&utm_source=youtube&utm_campaign=v1&ref=www.youtube.com", out[0]);
check("…and the sign-in link", out[1].includes("utm_source=youtube"));
out = runCarry({ search: "", referrer: "https://www.quora.com/What-is-x?share=1", links: ["https://staff.hireflownow.com/auth?mode=signup"] });
check("an untagged visit carries the referring host only (never its path or query)", out[0] === "https://staff.hireflownow.com/auth?mode=signup&ref=www.quora.com", out[0]);
out = runCarry({ search: "?utm_source=a%20b%3Cscript%3E", referrer: "", links: ["https://staff.hireflownow.com/auth?mode=signup"] });
check("a tag with anything but plain characters is dropped", out[0] === "https://staff.hireflownow.com/auth?mode=signup", out[0]);
out = runCarry({ search: "?utm_source=youtube", referrer: "", dnt: "1", links: ["https://staff.hireflownow.com/auth?mode=signup"] });
check("Do Not Track: nothing is carried", out[0] === "https://staff.hireflownow.com/auth?mode=signup", out[0]);
out = runCarry({ search: "", referrer: "https://hireflownow.com/open-jobs", links: ["https://staff.hireflownow.com/auth?mode=signup"] });
check("our own pages are not a source", out[0] === "https://staff.hireflownow.com/auth?mode=signup", out[0]);
// The second Phase 6 review: a guide's own tags gave way to nothing, so a YouTube visitor signed up as "blog".
out = runCarry({ search: "?utm_source=youtube&utm_campaign=v1", referrer: "", links: ["https://staff.hireflownow.com/auth?mode=signup&utm_source=blog&utm_medium=article&utm_campaign=phone-agent-vs-chat-agent"] });
check("on a guide, the visitor's own tags win; one they did not bring keeps the page's", out[0] === "https://staff.hireflownow.com/auth?mode=signup&utm_source=youtube&utm_medium=article&utm_campaign=v1", out[0]);
out = runCarry({ search: "", referrer: "https://www.youtube.com/", links: ["https://staff.hireflownow.com/auth?mode=signup&utm_source=blog&utm_medium=article&utm_campaign=phone-agent-vs-chat-agent"] });
check("…an untagged visit keeps the guide's tags and adds where it came from", out[0] === "https://staff.hireflownow.com/auth?mode=signup&utm_source=blog&utm_medium=article&utm_campaign=phone-agent-vs-chat-agent&ref=www.youtube.com", out[0]);

// ---- the staff site counts only its sign-up page --------------------------------
const beacon = read("public/beacon.js");
check("the counter allows the staff site's /auth only", /staffSite && !isSignUpPage\(window\.location\.pathname\)/.test(beacon) && /if \(staffSite && !isSignUpPage\(path \|\| window\.location\.pathname\)\) return;/.test(beacon));

// ---- the sign-up page keeps it ----------------------------------------------------
check("signupSourceFrom reads the four tags", JSON.stringify(src.signupSourceFrom("https://staff.hireflownow.com/auth?mode=signup&utm_source=youtube&utm_medium=video&utm_campaign=v1&ref=www.youtube.com")) === JSON.stringify({ utm_source: "youtube", utm_medium: "video", utm_campaign: "v1", ref: "www.youtube.com" }));
check("no tags: nothing stored", src.signupSourceFrom("https://staff.hireflownow.com/auth?mode=signup") === null);
check("a long or odd tag is dropped", src.signupSourceFrom(`https://x/auth?utm_source=${"a".repeat(61)}&utm_medium=x%40y`) === null);
check("tags are lower-cased", src.signupSourceFrom("https://x/auth?utm_source=YouTube")?.utm_source === "youtube");
check("useAuth's signUp stores it as signup_source", /\.\.\.\(signupSource \? \{ signup_source: signupSource \} : \{\}\)/.test(read("src/hooks/useAuth.tsx")));

// ---- admin_growth ---------------------------------------------------------------------
const ADMIN = "90000000-0000-4000-8000-000000000001";
const BIZ = "20000000-0000-4000-8000-000000000002";
const db = new PGlite();
await db.exec(`
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table auth.users (id uuid primary key, created_at timestamptz default now(), raw_user_meta_data jsonb);
  create role anon nologin; create role authenticated nologin;
  grant anon, authenticated to postgres;
  grant usage on schema public to anon, authenticated;
  create table public.platform_admins (user_id uuid primary key);
  insert into public.platform_admins values ('${ADMIN}');
  create function public.is_platform_admin() returns boolean language sql stable security definer as $$
    select exists (select 1 from public.platform_admins where user_id = auth.uid()) $$;
  grant execute on function public.is_platform_admin() to authenticated;
  create table public.user_roles (user_id uuid, role text);
  create table public.page_view_daily (day date, path text, referrer_host text, utm_source text, view_count integer);
  insert into public.page_view_daily values
    (current_date, '/', '', 'youtube', 5),
    (current_date, '/', 'www.quora.com', '', 3),
    (current_date, '/', '', '', 2),
    (current_date, '/auth', '', '', 4),
    (current_date - 100, '/', '', 'old', 9);
  insert into auth.users (id, raw_user_meta_data) values
    ('${BIZ}', '{"signup_source":{"utm_source":"youtube"}}'),
    ('30000000-0000-4000-8000-000000000003', '{"signup_source":{"ref":"www.quora.com"}}'),
    ('30000000-0000-4000-8000-000000000004', '{}');
  insert into public.user_roles values ('${BIZ}', 'employer'), ('30000000-0000-4000-8000-000000000003', 'employer'), ('30000000-0000-4000-8000-000000000004', 'candidate');
`);
await db.exec(read("supabase/migrations/20261025080000_admin_growth.sql"));
async function as(uid, sql) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  try { return { rows: (await db.query(sql)).rows }; } catch (e) { return { error: e.message }; } finally { await db.exec(`reset role;`); }
}
const g = await as(ADMIN, `select public.admin_growth(30) as g`);
const growth = g.rows?.[0]?.g;
check("the admin gets the numbers", !!growth, g.error);
if (growth) {
  const fp = Object.fromEntries(growth.front_page.map((r) => [r.source, r.visits]));
  check("front page visits by tag, then referring site, then direct", fp.youtube === 5 && fp["www.quora.com"] === 3 && fp.direct === 2, JSON.stringify(fp));
  check("older visits are outside the window", !("old" in fp));
  check("sign-up page visits counted", growth.signup_page === 4);
  const acc = growth.accounts.map((a) => `${a.role}:${a.source}:${a.accounts}`).sort();
  check("new accounts by role and source", JSON.stringify(acc) === JSON.stringify(["candidate:unknown:1", "employer:www.quora.com:1", "employer:youtube:1"]), JSON.stringify(acc));
}
const refused = await as(BIZ, `select public.admin_growth(30) as g`);
check("a business cannot read it", !!refused.error && /admins_only/.test(refused.error), JSON.stringify(refused));
let anonBlocked = false;
try { await db.exec(`set role anon; select public.admin_growth(30);`); } catch { anonBlocked = true; } finally { await db.exec(`reset role;`); }
check("a visitor cannot call it", anonBlocked);

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
