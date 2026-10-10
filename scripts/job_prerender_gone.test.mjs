// api/job-prerender.mjs: a removed listing must answer 404 + a single noindex
// robots tag (not a 200 "soft 404"), a Supabase error must NOT be treated as
// removed, and live job pages must not sit in the edge cache for long.
//
// Runs the real handler with fetch stubbed — no network.
import assert from "node:assert/strict";
import handler from "../api/job-prerender.mjs";

const SHELL =
  '<!doctype html><html><head><title>HireFlow — Meet Ava.</title>' +
  '<meta name="robots" content="index, follow" /></head><body><div id="root"></div></body></html>';

const LIVE_JOB = {
  id: "11111111-2222-4333-8444-555555555555",
  title: "Line Cook",
  description: "Cook on the line.",
  location: "Atlanta, GA",
  location_city: "Atlanta",
  location_region: "GA",
  location_country: "United States",
  location_country_code: "US",
  job_type: "full_time",
  created_at: "2026-09-01T00:00:00Z",
  application_deadline: null,
  employer_id: "99999999-2222-4333-8444-555555555555",
};

function stubFetch({ jobRows, jobStatus = 200, branding = [{ company_name: "Maria's Café", company_logo: null }] }) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    // The app's shell, from /index.html: "/" is the HireFlow landing page, not the app.
    if (u === "https://hireflownow.com/index.html") return new Response(SHELL, { status: 200 });
    if (u.includes("/published_jobs_public?")) {
      return jobStatus === 200
        ? new Response(JSON.stringify(jobRows), { status: 200 })
        : new Response("upstream error", { status: jobStatus });
    }
    if (u.includes("/employer_public_branding?")) return new Response(JSON.stringify(branding), { status: 200 });
    throw new Error(`unexpected fetch ${u}`);
  };
}

async function run(id) {
  const headers = {};
  const res = {
    statusCode: 0,
    body: "",
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    end(b) { this.body = String(b ?? ""); },
  };
  await handler({ query: { id } }, res);
  return { status: res.statusCode, headers, body: res.body };
}

const robotsTags = (html) => html.match(/<meta\s+name="robots"[^>]*>/gi) ?? [];

// 1. Deleted / closed job (no row) → 404, exactly one noindex tag, short cache.
stubFetch({ jobRows: [] });
{
  const r = await run(LIVE_JOB.id);
  assert.equal(r.status, 404, "a removed job must answer 404, not a soft 200");
  assert.deepEqual(robotsTags(r.body), ['<meta name="robots" content="noindex,follow" />']);
  assert.ok(!/JobPosting/.test(r.body), "a removed job must carry no JobPosting data");
  assert.match(r.headers["cache-control"], /s-maxage=60\b/);
  assert.ok(r.body.includes('<div id="root"'), "people on an old link still get the app shell");
}

// 2. Past its deadline → treated as removed.
stubFetch({ jobRows: [{ ...LIVE_JOB, application_deadline: "2020-01-01T00:00:00Z" }] });
{
  const r = await run(LIVE_JOB.id);
  assert.equal(r.status, 404);
  assert.deepEqual(robotsTags(r.body), ['<meta name="robots" content="noindex,follow" />']);
}

// 3. Malformed id → 404 without asking Supabase at all.
stubFetch({ jobRows: [LIVE_JOB] });
{
  const r = await run("not-a-job-id!");
  assert.equal(r.status, 404);
}

// 4. Supabase error → NOT removed: 200, shell untouched, never cached.
stubFetch({ jobRows: [], jobStatus: 503 });
{
  const r = await run(LIVE_JOB.id);
  assert.equal(r.status, 200, "an upstream hiccup must not tell Google the job is gone");
  assert.equal(r.headers["cache-control"], "no-store");
  assert.ok(!/noindex/.test(r.body));
}

// 5. Live job → 200, its own title and share tags, one `index, follow`, short
//    cache with no day-long stale window, and NO JobPosting data: Google Jobs
//    was removed on 2026-10-05 (owner: "remove google jobs").
stubFetch({ jobRows: [LIVE_JOB] });
{
  const r = await run(LIVE_JOB.id);
  assert.equal(r.status, 200);
  assert.ok(!/JobPosting|application\/ld\+json/.test(r.body), "a job page carries no Google Jobs data");
  assert.match(r.body, /<title>Line Cook — Maria&#39;s Café<\/title>|<title>Line Cook — Maria's Café<\/title>/);
  assert.match(r.body, /<meta property="og:title" content="Line Cook/);
  assert.deepEqual(robotsTags(r.body), ['<meta name="robots" content="index, follow" />']);
  const cc = r.headers["cache-control"];
  const swr = Number(/stale-while-revalidate=(\d+)/.exec(cc)?.[1] ?? 0);
  const maxAge = Number(/s-maxage=(\d+)/.exec(cc)?.[1] ?? 0);
  assert.ok(maxAge > 0 && maxAge <= 120, `s-maxage too long: ${cc}`);
  assert.ok(swr <= 300, `stale window too long: ${cc}`);
}

// 6. A worldwide remote role with no country and no company name was noindexed
//    because Google Jobs could not list it. It is a live page like any other:
//    one `index, follow`, nothing left over from the shell.
const REMOTE_WORLDWIDE = {
  ...LIVE_JOB,
  location: "Remote (worldwide)",
  location_city: null,
  location_region: null,
  location_country: null,
  location_country_code: null,
  is_remote: true,
};
stubFetch({ jobRows: [REMOTE_WORLDWIDE], branding: [] });
{
  const r = await run(REMOTE_WORLDWIDE.id);
  assert.equal(r.status, 200);
  assert.ok(!/JobPosting/.test(r.body));
  assert.match(r.body, /<title>Line Cook — Zulu Support Team<\/title>/);
  assert.deepEqual(robotsTags(r.body), ['<meta name="robots" content="index, follow" />']);
}

// 7. A job with a short link (docs/SHORT-JOB-LINKS.md §7): the old link's page
//    still names ITSELF as the address. hireflownow.com/<slug> is served the
//    plain app shell (canonical and og:url = the homepage), so pointing at it
//    would send search and link previews from the job to the homepage.
stubFetch({ jobRows: [{ ...LIVE_JOB, slug: "line-cook" }] });
{
  const r = await run(LIVE_JOB.id);
  assert.equal(r.status, 200);
  const own = `https://hireflownow.com/candidate/job/${LIVE_JOB.id}`;
  assert.ok(r.body.includes(`<link rel="canonical" href="${own}" />`), "the canonical stays this page");
  assert.ok(r.body.includes(`<meta property="og:url" content="${own}" />`), "og:url stays this page");
  assert.ok(!r.body.includes("hireflownow.com/line-cook"), "the short link is not named until it has its own prerender");
}
// ...and a job without one is the same.
stubFetch({ jobRows: [{ ...LIVE_JOB, slug: null }] });
{
  const r = await run(LIVE_JOB.id);
  assert.ok(r.body.includes(`<link rel="canonical" href="https://hireflownow.com/candidate/job/${LIVE_JOB.id}" />`));
}

// 8. A short link, asked for by a link-preview crawler (vercel.json sends
//    /<slug> here as ?slug= for those user agents only): the job is looked
//    up BY ITS NAME, and the preview says the job, not the careers site.
const TEAM_LEAD = {
  ...LIVE_JOB,
  title: "Chat Support Team Leader (Zulu Royal & Zulu Rush)",
  description: "We're hiring an experienced Team Leader for our chat support team.",
  slug: "team-lead",
};
async function runSlug(slug) {
  const asked = [];
  const before = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    asked.push(String(url));
    return before(url, init);
  };
  const headers = {};
  const res = {
    statusCode: 0,
    body: "",
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    end(b) { this.body = String(b ?? ""); },
  };
  try {
    await handler({ query: { slug } }, res);
  } finally {
    globalThis.fetch = before;
  }
  return { status: res.statusCode, headers, body: res.body, asked };
}
stubFetch({ jobRows: [TEAM_LEAD], branding: [{ company_name: "Zulu Support Team" }] });
{
  const r = await runSlug("team-lead");
  assert.equal(r.status, 200);
  assert.ok(r.asked.some((u) => u.includes("/published_jobs_public?slug=eq.team-lead&")), "the job is found by its short name");
  assert.ok(!r.asked.some((u) => u.includes("published_jobs_public?id=eq.")), "no id lookup for a short link");
  assert.match(r.body, /<title>Chat Support Team Leader \(Zulu Royal &amp; Zulu Rush\) — Zulu Support Team<\/title>/);
  assert.match(r.body, /<meta property="og:title" content="Chat Support Team Leader/);
  assert.match(r.body, /<meta property="og:description" content="We're hiring an experienced Team Leader/);
  assert.match(r.body, /<meta name="twitter:title" content="Chat Support Team Leader/);
  // One address for the job: the long link, as the sitemap and the page's
  // own head say (docs/SHORT-JOB-LINKS.md §7). The three move together.
  const own = `https://hireflownow.com/candidate/job/${TEAM_LEAD.id}`;
  assert.ok(r.body.includes(`<link rel="canonical" href="${own}" />`));
  assert.equal((r.body.match(/rel="canonical"/g) ?? []).length, 1);
  assert.deepEqual(robotsTags(r.body), ['<meta name="robots" content="index, follow" />']);
  assert.match(r.headers["cache-control"], /s-maxage=60\b/);
  // /<slug> is the crawlers' page only; people get the app at the same address.
  assert.equal(r.headers["vary"], "User-Agent", "the short link's answer varies by user agent");
}
// The long link is one page for everyone: no Vary.
stubFetch({ jobRows: [TEAM_LEAD] });
{
  const r = await run(TEAM_LEAD.id);
  assert.equal(r.headers?.["vary"], undefined);
}
// A differently typed name is the same job (JobDetails moves people to the
// lowercase one).
stubFetch({ jobRows: [TEAM_LEAD] });
{
  const r = await runSlug("Team-Lead");
  assert.ok(r.asked.some((u) => u.includes("slug=eq.team-lead&")));
  assert.equal(r.status, 200);
}

// 9. A name that is no open job — a page of the app (/applications), a closed
//    job, a typo — is the plain shell with 200, exactly what a person gets.
//    Never a 404: a crawler on /applications must not read "removed".
stubFetch({ jobRows: [] });
{
  const r = await runSlug("applications");
  assert.equal(r.status, 200, "a page of the app is not a removed job");
  assert.equal(r.body, SHELL, "the shell, untouched");
  assert.ok(!/noindex/.test(r.body));
}
// A name the SITE uses is never a job's preview, even if a job holds it (the
// database checks only the shape; the editor refuses these, the API does not).
stubFetch({ jobRows: [{ ...TEAM_LEAD, slug: "privacy" }] });
for (const reserved of ["privacy", "terms", "jobs", "applications", "login"]) {
  const r = await runSlug(reserved);
  assert.equal(r.status, 200);
  assert.equal(r.body, SHELL, `${reserved}: the plain shell`);
  assert.ok(!r.asked.some((u) => u.includes("published_jobs_public")), `${reserved}: never looked up`);
  assert.equal(r.headers["vary"], "User-Agent");
}
{
  // A name the database could never hold is not even looked up.
  const r = await runSlug("not a slug!");
  assert.equal(r.status, 200);
  assert.equal(r.body, SHELL);
  assert.ok(!r.asked.some((u) => u.includes("published_jobs_public")), "no lookup for an impossible name");
}
// ...and past its deadline it is the shell too.
stubFetch({ jobRows: [{ ...TEAM_LEAD, application_deadline: "2020-01-01T00:00:00Z" }] });
{
  const r = await runSlug("team-lead");
  assert.equal(r.status, 200);
  assert.equal(r.body, SHELL);
}

// 10. A failed lookup by name: the shell, never kept in the edge cache.
stubFetch({ jobRows: [], jobStatus: 503 });
{
  const r = await runSlug("team-lead");
  assert.equal(r.status, 200);
  assert.equal(r.headers["cache-control"], "no-store");
}

// 11. vercel.json sends crawlers, and only crawlers, on the candidates' site
//     to the by-name prerender, before the catch-all.
{
  const { readFile } = await import("node:fs/promises");
  const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const i = vercel.rewrites.findIndex((r) => r.source === "/:slug");
  const catchAll = vercel.rewrites.findIndex((r) => r.source === "/:path+");
  assert.ok(i >= 0 && i < catchAll, "the short-link rule sits before the catch-all");
  const rule = vercel.rewrites[i];
  assert.equal(rule.destination, "/api/job-prerender?slug=:slug");
  const ua = rule.has.find((h) => h.type === "header" && h.key === "user-agent");
  const re = new RegExp(`^${ua.value}$`);
  for (const crawler of [
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "WhatsApp/2.23.20.0 A",
    "Twitterbot/1.0",
    "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
    "TelegramBot (like TwitterBot)",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    // Pinterest's own preview fetcher does not say "Pinterestbot".
    "Pinterest/0.2 (+https://www.pinterest.com/bot.html)",
    // Search Console's live test, and Google's other fetcher.
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0;)",
    "GoogleOther",
    "Mozilla/5.0 (compatible; Snap URL Preview Service; bot; snapchat; https://developers.snap.com/robots)",
    "Snapchat/12.0 (+https://developers.snap.com/robots)",
    "Mozilla/5.0 (compatible; Embedly/0.2; +http://support.embed.ly/)",
    "Iframely/1.3.1 (+https://iframely.com/docs/about)",
  ]) {
    assert.ok(re.test(crawler), `a crawler gets the preview: ${crawler}`);
  }
  for (const person of [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  ]) {
    assert.ok(!re.test(person), `a person gets the app: ${person.slice(0, 40)}`);
  }
  assert.ok(
    (rule.missing ?? []).some((m) => m.type === "host" && m.value === "staff.hireflownow.com"),
    "never on the staff site, where /<slug> is no route",
  );
}

console.log("job_prerender_gone: 11 scenarios passed");
