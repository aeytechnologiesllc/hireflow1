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
    if (u === "https://hireflownow.com/") return new Response(SHELL, { status: 200 });
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

console.log("job_prerender_gone: 6 scenarios passed");
