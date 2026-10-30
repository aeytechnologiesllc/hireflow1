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
const H_LINK = await import(path.join(ROOT, "src/lib/hiringLink.ts"));

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) { passed += 1; console.log(`  ok  - ${name}`); } else { failed += 1; console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`); }
}

// ---- the front page ------------------------------------------------------------
const landing = read("public/landing.html");
check("the front page loads the page counter", /<script src="\/beacon\.js" defer><\/script>/.test(landing));
check("the front page passes its source to the sign-up links", /<script src="\/carry-source\.js" defer><\/script>/.test(landing));
check("the front page names no og:url, so a shared card keeps the tagged address it was shared with; the canonical stays", !/property="og:url"/.test(landing) && /rel="canonical" href="https:\/\/hireflownow\.com\/"/.test(landing));

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
// The third growth review: the site that sent an untagged visitor is the source (it was hidden behind the page's own).
check("an untagged visit makes the referring host the source (never its path or query)", out[0] === "https://staff.hireflownow.com/auth?mode=signup&utm_source=www.quora.com&utm_medium=referral&ref=www.quora.com", out[0]);
out = runCarry({ search: "?utm_source=a%20b%3Cscript%3E", referrer: "", links: ["https://staff.hireflownow.com/auth?mode=signup"] });
// The Phase 7 growth review: "Spring Sale" was dropped while the counter kept
// it; both now tidy a tag to plain characters (never anything else).
check("a tag is tidied to plain characters, never carried raw", out[0] === "https://staff.hireflownow.com/auth?mode=signup&utm_source=a-b-script", out[0]);
out = runCarry({ search: "?utm_source=youtube", referrer: "", dnt: "1", links: ["https://staff.hireflownow.com/auth?mode=signup"] });
check("Do Not Track: nothing is carried", out[0] === "https://staff.hireflownow.com/auth?mode=signup", out[0]);
out = runCarry({ search: "", referrer: "https://hireflownow.com/open-jobs", links: ["https://staff.hireflownow.com/auth?mode=signup"] });
check("our own pages are not a source", out[0] === "https://staff.hireflownow.com/auth?mode=signup", out[0]);
// The second Phase 6 review: a guide's own tags gave way to nothing, so a YouTube visitor signed up as "blog".
out = runCarry({ search: "?utm_source=youtube&utm_campaign=v1", referrer: "", links: ["https://staff.hireflownow.com/auth?mode=signup&utm_source=blog&utm_medium=article&utm_campaign=phone-agent-vs-chat-agent"] });
// The fifth Phase 6 review: mixing them read "youtube / article / v1"; the visitor's set replaces the page's.
check("on a guide, the visitor's own tags replace the page's whole set", out[0] === "https://staff.hireflownow.com/auth?mode=signup&utm_source=youtube&utm_campaign=v1", out[0]);
out = runCarry({ search: "", referrer: "https://www.youtube.com/", links: ["https://staff.hireflownow.com/auth?mode=signup&utm_source=blog&utm_medium=article&utm_campaign=phone-agent-vs-chat-agent"] });
check("…an untagged visit on a guide: the site it came from is the source, the guide stays the campaign", out[0] === "https://staff.hireflownow.com/auth?mode=signup&utm_source=www.youtube.com&utm_medium=referral&utm_campaign=phone-agent-vs-chat-agent&ref=www.youtube.com", out[0]);
// …and the tags, or the site, ride on through the logo and the guides (the third growth review).
function runCarrySite({ search = "", referrer = "", staff, inside }) {
  const staffAnchors = staff.map((href) => ({ href }));
  const insideAnchors = inside.map((href) => ({ href }));
  const sandbox = {
    window: { location: { search, hostname: "hireflownow.com", href: "https://hireflownow.com/blog/a-guide" + search } },
    navigator: { doNotTrack: null, globalPrivacyControl: false },
    document: { referrer, querySelectorAll: (sel) => (sel.includes("staff.hireflownow.com") ? staffAnchors : insideAnchors) },
    URL, URLSearchParams, Array, Object,
  };
  vm.runInNewContext(read("public/carry-source.js"), sandbox);
  return { staff: staffAnchors.map((a) => a.href), inside: insideAnchors.map((a) => a.href) };
}
let site = runCarrySite({ search: "?utm_source=youtube&utm_campaign=v1", staff: [], inside: ["/", "/blog", "/open-jobs"] });
check("the logo (\"/\") carries a tagged visitor's tags, as Guides and Open jobs do", site.inside.every((h) => h.includes("utm_source=youtube") && h.includes("utm_campaign=v1")) && site.inside[0].startsWith("https://hireflownow.com/?"), JSON.stringify(site.inside));
site = runCarrySite({ search: "", referrer: "https://www.quora.com/q", staff: [], inside: ["/", "/blog/other"] });
check("…an untagged visitor's site rides on as ref", site.inside.every((h) => h.includes("ref=www.quora.com") && !h.includes("utm_")), JSON.stringify(site.inside));
site = runCarrySite({ search: "?ref=www.quora.com", referrer: "https://hireflownow.com/", staff: ["https://staff.hireflownow.com/auth?mode=signup&utm_source=blog&utm_medium=article&utm_campaign=a-guide"], inside: [] });
check("…so on the next page Quora is still the source of the sign-up", site.staff[0] === "https://staff.hireflownow.com/auth?mode=signup&utm_source=www.quora.com&utm_medium=referral&utm_campaign=a-guide&ref=www.quora.com", site.staff[0]);
site = runCarrySite({ search: "?ref=staff.hireflownow.com", referrer: "", staff: ["https://staff.hireflownow.com/auth?mode=signup"], inside: [] });
check("…never HireFlow's own host as a carried source", site.staff[0] === "https://staff.hireflownow.com/auth?mode=signup", site.staff[0]);

// ---- the ninth growth review: the front page's count rides along -----------------
// carry-source.js against a stand-in page whose querySelectorAll answers each
// selector as a browser would (a[href="…"], a[href^="…"], a[href*="…"]), so
// the sign-up links and the links onward through the site are told apart.
function matches(selector, href) {
  return selector.split(/,\s*/).some((one) => {
    const m = /^a\[href(\^|\*)?="([^"]*)"\]$/.exec(one.trim());
    if (!m) return false;
    return m[1] === "^" ? href.startsWith(m[2]) : m[1] === "*" ? href.includes(m[2]) : href === m[2];
  });
}
function runCarryPage({ path: pagePath = "/", search = "", referrer = "", beacon, hrefs }) {
  const anchors = hrefs.map((raw) => ({ raw, href: new URL(raw, `https://hireflownow.com${pagePath}`).toString() }));
  const sandbox = {
    window: { location: { search, pathname: pagePath, hostname: "hireflownow.com", href: `https://hireflownow.com${pagePath}${search}` }, ...(beacon === undefined ? {} : { __hfBeacon: beacon }) },
    navigator: { doNotTrack: null, globalPrivacyControl: false },
    document: { referrer, querySelectorAll: (sel) => anchors.filter((a) => matches(sel, a.raw)) },
    URL, URLSearchParams, Array, Object,
  };
  vm.runInNewContext(read("public/carry-source.js"), sandbox);
  return Object.fromEntries(anchors.map((a) => [a.raw, a.href]));
}
// The front page's own links, as public/landing.html has them.
const FRONT_LINKS = ["/blog", "/open-jobs", "https://staff.hireflownow.com/auth", "https://staff.hireflownow.com/auth?mode=signup", "/privacy", "#about", "#hero"];
{
  const counted = runCarryPage({ search: "?utm_source=youtube&utm_medium=video", referrer: "", beacon: { counted: true }, hrefs: FRONT_LINKS });
  check("the front page puts seen=1 on its links onward (Guides, Open jobs) when beacon.js counted its view", counted["/blog"] === "https://hireflownow.com/blog?utm_source=youtube&utm_medium=video&seen=1" && counted["/open-jobs"] === "https://hireflownow.com/open-jobs?utm_source=youtube&utm_medium=video&seen=1", JSON.stringify(counted));
  check("…never on a sign-up or sign-in link: those get the three tags and ref only", counted["https://staff.hireflownow.com/auth?mode=signup"] === "https://staff.hireflownow.com/auth?mode=signup&utm_source=youtube&utm_medium=video" && !counted["https://staff.hireflownow.com/auth"].includes("seen") && JSON.stringify(src.signupSourceFrom(counted["https://staff.hireflownow.com/auth?mode=signup"])) === JSON.stringify({ utm_source: "youtube", utm_medium: "video" }), JSON.stringify(counted));
  check("…nor on Privacy, Terms or the page's own anchors", counted["/privacy"] === "https://hireflownow.com/privacy" && counted["#about"] === "https://hireflownow.com/#about" && counted["#hero"] === "https://hireflownow.com/#hero");
  const direct = runCarryPage({ referrer: "", beacon: { counted: true }, hrefs: FRONT_LINKS });
  check("…a direct visitor, with nothing else to carry, gets it too (typed hireflownow.com → Open jobs → Post a job free counted twice)", direct["/open-jobs"] === "https://hireflownow.com/open-jobs?seen=1" && direct["https://staff.hireflownow.com/auth?mode=signup"] === "https://staff.hireflownow.com/auth?mode=signup", JSON.stringify(direct));
  const moved = runCarryPage({ search: "?ref=www.quora.com", referrer: "https://hireflownow.com/blog/a-guide", beacon: { counted: false }, hrefs: FRONT_LINKS });
  check("…not when beacon.js did not count the view (reached from a guide): that visitor's first Post a job free still counts (Low 2)", moved["/open-jobs"] === "https://hireflownow.com/open-jobs?ref=www.quora.com", JSON.stringify(moved));
  const again = runCarryPage({ search: "?utm_source=youtube&seen=1", referrer: "https://hireflownow.com/open-jobs?utm_source=youtube&seen=1", beacon: { counted: false }, hrefs: FRONT_LINKS });
  check("…a visitor counted before and back by an unmarked link keeps it (P4: Open jobs → front page → Guides)", again["/blog"] === "https://hireflownow.com/blog?utm_source=youtube&seen=1", JSON.stringify(again));
  const fromStaff = runCarryPage({ search: "?utm_source=youtube&utm_medium=video", referrer: "https://staff.hireflownow.com/", beacon: { counted: false }, hrefs: FRONT_LINKS });
  check("…back from the staff sign-up's ← hireflownow.com (where the fact never goes): taken as counted, as Admin → Growth leaves that arrival out", fromStaff["/open-jobs"] === "https://hireflownow.com/open-jobs?utm_source=youtube&utm_medium=video&seen=1", JSON.stringify(fromStaff));
  const blocked = runCarryPage({ search: "?utm_source=youtube", referrer: "https://www.youtube.com/", hrefs: FRONT_LINKS });
  const blockedInside = runCarryPage({ search: "?ref=www.quora.com", referrer: "https://hireflownow.com/blog/a-guide", hrefs: FRONT_LINKS });
  check("…beacon.js kept from loading (a blocker): the same test it would have made", blocked["/open-jobs"].endsWith("&seen=1") && !blockedInside["/open-jobs"].includes("seen"), `${blocked["/open-jobs"]} ${blockedInside["/open-jobs"]}`);
  const noop = runCarryPage({ search: "?utm_source=youtube", referrer: "https://www.youtube.com/", beacon: { track() {} }, hrefs: FRONT_LINKS });
  check("…beacon.js loaded but counting nothing (a developer's machine, test automation): nothing claimed", !noop["/open-jobs"].includes("seen"), noop["/open-jobs"]);
}
{
  // A guide's own links, as scripts/build-blog.mjs writes them.
  const GUIDE_LINKS = ["/", "/blog", "/open-jobs", "/blog/other-guide", "https://staff.hireflownow.com/auth?mode=signup&utm_source=blog&utm_medium=article&utm_campaign=a-guide"];
  const passed = runCarryPage({ path: "/blog/a-guide", search: "?utm_source=youtube&utm_campaign=v1&seen=1", referrer: "https://hireflownow.com/blog?utm_source=youtube&utm_campaign=v1&seen=1", hrefs: GUIDE_LINKS });
  check("a guide passes the front page's count on to the logo, Guides, Open jobs and the next guide (P1, P2, P3)", ["/", "/blog", "/open-jobs", "/blog/other-guide"].every((h) => passed[h].endsWith("&seen=1")) && !passed[GUIDE_LINKS[4]].includes("seen"), JSON.stringify(passed));
  const copied = runCarryPage({ path: "/blog/a-guide", search: "?utm_source=youtube&seen=1", referrer: "https://www.facebook.com/", hrefs: GUIDE_LINKS });
  check("…but not one it was sent from outside with (a copied address): a new visitor", !Object.values(copied).some((h) => h.includes("seen")), JSON.stringify(copied));
  const own = runCarryPage({ path: "/blog/a-guide", search: "", referrer: "https://www.quora.com/", beacon: { counted: true }, hrefs: GUIDE_LINKS });
  check("…and a guide's own count is not the front page's: a Quora reader's first Post a job free still counts (N11)", !Object.values(own).some((h) => h.includes("seen")), JSON.stringify(own));
}
{
  // The whole of P3 by the two halves: the front page (carry-source.js) and Open jobs (withVisitorTags).
  const front = runCarryPage({ search: "?utm_source=youtube&utm_campaign=v1", referrer: "https://www.youtube.com/", beacon: { counted: true }, hrefs: FRONT_LINKS });
  const guides = runCarryPage({ path: "/blog", search: new URL(front["/blog"]).search, referrer: "https://hireflownow.com/?utm_source=youtube&utm_campaign=v1", hrefs: ["/open-jobs"] });
  const hiring = H_LINK.withVisitorTags(H_LINK.hiringLink("open_jobs"), guides["/open-jobs"], front["/blog"]);
  const back = runCarryPage({ search: new URL(hiring).search, referrer: guides["/open-jobs"], beacon: { counted: false }, hrefs: FRONT_LINKS });
  check("front page → Guides → Open jobs → Post a job free: no second visit, and the sign-up says youtube · v1 (P3)", !hiring.includes("hiring_link=1") && back["https://staff.hireflownow.com/auth?mode=signup"] === "https://staff.hireflownow.com/auth?mode=signup&utm_source=youtube&utm_campaign=v1" && back["/blog"].endsWith("&seen=1"), `${hiring} → ${back["https://staff.hireflownow.com/auth?mode=signup"]}`);
}
check("signupSourceFrom never keeps the fact (only the four tags)", JSON.stringify(src.signupSourceFrom("https://staff.hireflownow.com/auth?mode=signup&utm_source=youtube&seen=1&hiring_link=1")) === JSON.stringify({ utm_source: "youtube" }) && src.signupSourceFrom("https://hireflownow.com/candidate/auth?redirect=%2Fc%2Fa%2Fb%3Fseen%3D1&seen=1") === null);

// ---- the staff site counts only its sign-up page --------------------------------
const beacon = read("public/beacon.js");
check("the counter allows the staff site's /auth only", /staffSite && !isSignUpPage\(window\.location\.pathname\)/.test(beacon) && /if \(staffSite && !isSignUpPage\(path \|\| window\.location\.pathname\)\) return;/.test(beacon));

// ---- the sign-up page keeps it ----------------------------------------------------
check("signupSourceFrom reads the four tags", JSON.stringify(src.signupSourceFrom("https://staff.hireflownow.com/auth?mode=signup&utm_source=youtube&utm_medium=video&utm_campaign=v1&ref=www.youtube.com")) === JSON.stringify({ utm_source: "youtube", utm_medium: "video", utm_campaign: "v1", ref: "www.youtube.com" }));
check("no tags: nothing stored", src.signupSourceFrom("https://staff.hireflownow.com/auth?mode=signup") === null);
// The third growth review: tidied the way the counter and the carrier do, never dropped.
check("a long tag is cut to 60 and an odd one tidied, as the page counter does", (() => { const got = src.signupSourceFrom(`https://x/auth?utm_source=${"a".repeat(61)}&utm_medium=x%40y&utm_campaign=Spring%20Sale`); return got?.utm_source === "a".repeat(60) && got?.utm_medium === "x-y" && got?.utm_campaign === "spring-sale"; })());
check("…a tag of nothing but odd characters is nothing", src.signupSourceFrom("https://x/auth?utm_source=%40%40") === null);
check("tags are lower-cased", src.signupSourceFrom("https://x/auth?utm_source=YouTube")?.utm_source === "youtube");
check("useAuth's signUp stores it as signup_source", /\.\.\.\(signupSource \? \{ signup_source: signupSource \} : \{\}\)/.test(read("src/hooks/useAuth.tsx")));

// ---- the sixth growth review ------------------------------------------------------
const H = await import(path.join(ROOT, "src/lib/hiringLink.ts"));
// The staff sign-up's "← hireflownow.com" was a bare address: a YouTube visitor
// who went back to read the pitch signed up as "unknown".
const authPage = read("src/pages/Auth.tsx");
check("the staff sign-up's way back to the front page carries the visitor's tags", /href=\{withVisitorTags\("https:\/\/hireflownow\.com\/", window\.location\.href, document\.referrer\)\}/.test(authPage) && !/href="https:\/\/hireflownow\.com\/"/.test(authPage));
{
  const back = H.withVisitorTags("https://hireflownow.com/", "https://staff.hireflownow.com/auth?mode=signup&utm_source=youtube&utm_medium=video", "https://hireflownow.com/");
  const again = runCarry({ search: new URL(back).search, referrer: "https://staff.hireflownow.com/", links: ["https://staff.hireflownow.com/auth?mode=signup"] });
  check("…so the front page's sign-up links say youtube again, and the account keeps it", back === "https://hireflownow.com/?utm_source=youtube&utm_medium=video" && JSON.stringify(src.signupSourceFrom(again[0])) === JSON.stringify({ utm_source: "youtube", utm_medium: "video" }), `${back} → ${again[0]}`);
  const fromSearch = H.withVisitorTags("https://hireflownow.com/", "https://staff.hireflownow.com/auth?mode=signup", "https://www.google.com/");
  check("…or the site that sent them straight to the sign-up page", fromSearch === "https://hireflownow.com/?ref=www.google.com", fromSearch);
}
// Apply went to the applicant sign-up with nothing: every applicant was "unknown".
check("Apply carries the job page's channel to the applicant sign-up", /navigate\(withVisitorTags\(`\/candidate\/auth\?redirect=\$\{encodeURIComponent\(withApplyAsk\(jobPagePath\(job\)\)\)\}&tab=signup`, window\.location\.href, document\.referrer\)\)/.test(read("src/pages/JobDetails.tsx")));
{
  const apply = "/candidate/auth?redirect=%2Fc%2Facme%2Ffront-desk%3Fapply%3D1&tab=signup";
  const tagged = H.withVisitorTags(apply, "https://hireflownow.com/c/acme/front-desk?utm_source=facebook&utm_medium=job_share", null);
  check("…a tagged job page: the sign-up keeps the job to come back to and gains the tags", tagged === `${apply}&utm_source=facebook&utm_medium=job_share` && JSON.stringify(src.signupSourceFrom(`https://hireflownow.com${tagged}`)) === JSON.stringify({ utm_source: "facebook", utm_medium: "job_share" }), tagged);
  const referred = H.withVisitorTags(apply, "https://hireflownow.com/c/acme/front-desk", "https://www.facebook.com/groups/x?post=1");
  check("…an untagged one: the site that sent them, as a bare host (never its path or query)", referred === `${apply}&ref=www.facebook.com` && JSON.stringify(src.signupSourceFrom(`https://hireflownow.com${referred}`)) === JSON.stringify({ ref: "www.facebook.com" }), referred);
  const none = H.withVisitorTags(apply, "https://hireflownow.com/c/acme/front-desk", "https://hireflownow.com/open-jobs");
  check("…nothing carried: the sign-up as it was (an applicant stays unknown, never guessed)", none === apply && src.signupSourceFrom(`https://hireflownow.com${none}`) === null, none);
  const added = [...new URL(tagged, "https://hireflownow.com").searchParams.keys()].filter((k) => !["redirect", "tab"].includes(k));
  check("…only source tags are added: nothing personal, no hiring-link mark", added.every((k) => ["utm_source", "utm_medium", "utm_campaign", "ref"].includes(k)), JSON.stringify(added));
}

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
