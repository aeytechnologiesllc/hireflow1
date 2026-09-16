#!/usr/bin/env node
/**
 * Proves src/cockpit/lib/listingEligibility.ts agrees with the two REAL
 * distribution gates:
 *
 *   - .boards is checked against the REAL api/job-feed.mjs's loadFeedJobs(),
 *     imported live (not re-implemented) with global.fetch mocked to serve
 *     fixture rows the way Supabase's REST endpoint would.
 *   - .google is checked against a ported copy of
 *     supabase/functions/sitemap/index.ts's indexableJobs filter (that file
 *     runs `Deno.serve(...)` at module scope and cannot be imported under
 *     Node, so the filter is mirrored here instead — same approach the file
 *     itself documents relative to api/job-prerender.mjs).
 *
 * Run with: node scripts/listing_eligibility.test.mjs
 */
import { listingEligibility } from "../src/cockpit/lib/listingEligibility.ts";

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

// ---------------------------------------------------------------------------
// Fixtures — one realistic published job per scenario the task called out.
// ---------------------------------------------------------------------------
const LONG_DESC = "Ava screens every applicant automatically. ".repeat(4); // > 100 plain chars
const SHORT_DESC_99 = "A".repeat(99); // exactly under MIN_DESCRIPTION_CHARS (99 < 100)
const SHORT_DESC_100 = "A".repeat(100); // exactly at the boundary (100 >= 100)

const EMPLOYER_WITH_NAME = "employer-with-name";
const EMPLOYER_BLANK = "employer-blank-company";

const now = Date.parse("2026-09-16T00:00:00Z");

const baseJob = {
  id: "job-base",
  title: "Barista",
  description: LONG_DESC,
  responsibilities: null,
  requirements: null,
  created_at: "2026-09-01T00:00:00Z",
  application_deadline: null,
  job_code: null,
  location: null,
  location_city: null,
  location_region: null,
  location_country: null,
  location_country_code: "US",
  is_remote: false,
  employer_id: EMPLOYER_WITH_NAME,
  exclude_from_feed: false,
};

const fixtures = [
  {
    name: "onsite, country-only (no city, not remote)",
    job: { ...baseJob, id: "j-country-only", location_country_code: "US", location_city: null, location: "United States" },
    expectGoogle: false,
    expectBoards: false,
  },
  {
    name: "onsite with a real city",
    job: { ...baseJob, id: "j-with-city", location_country_code: "US", location_city: "Austin" },
    expectGoogle: true,
    expectBoards: true,
  },
  {
    name: "remote with a country",
    job: { ...baseJob, id: "j-remote-with-country", location_country_code: "US", location_city: null, is_remote: true, location: "Remote - United States" },
    expectGoogle: true,
    expectBoards: true,
  },
  {
    name: "remote WITHOUT a country",
    job: { ...baseJob, id: "j-remote-no-country", location_country_code: null, location_country: null, location_city: null, is_remote: true, location: "Remote" },
    expectGoogle: false,
    expectBoards: false,
  },
  {
    name: '"Pakistan" alone is rejected as a city (country token)',
    job: { ...baseJob, id: "j-pakistan-token", location_country_code: "PK", location_city: null, location: "Pakistan, Pakistan" },
    expectGoogle: false,
    expectBoards: false,
  },
  {
    name: "a US state token is rejected as a city",
    job: { ...baseJob, id: "j-state-token", location_country_code: "US", location_city: null, location: "Texas, US" },
    expectGoogle: false,
    expectBoards: false,
  },
  {
    name: "description just under the 100-char floor (boards only)",
    job: { ...baseJob, id: "j-desc-99", location_country_code: "US", location_city: "Austin", description: SHORT_DESC_99, responsibilities: null, requirements: null },
    expectGoogle: true,
    expectBoards: false,
  },
  {
    name: "description exactly at the 100-char floor, wrapped in HTML markup",
    job: { ...baseJob, id: "j-desc-100", location_country_code: "US", location_city: "Austin", description: `<p>${SHORT_DESC_100}</p>`, responsibilities: null, requirements: null },
    expectGoogle: true,
    expectBoards: true,
  },
  {
    name: "blank company name",
    job: { ...baseJob, id: "j-blank-company", location_country_code: "US", location_city: "Austin", employer_id: EMPLOYER_BLANK },
    expectGoogle: false,
    expectBoards: false,
  },
  {
    name: "excluded from feed",
    job: { ...baseJob, id: "j-excluded", location_country_code: "US", location_city: "Austin", exclude_from_feed: true },
    expectGoogle: false,
    expectBoards: false,
  },
  {
    name: "expired deadline",
    job: { ...baseJob, id: "j-expired", location_country_code: "US", location_city: "Austin", application_deadline: "2020-01-01T00:00:00Z" },
    expectGoogle: false,
    expectBoards: false,
  },
];

const companyNames = { [EMPLOYER_WITH_NAME]: "Daily Grind Coffee Co.", [EMPLOYER_BLANK]: "" };

// ---------------------------------------------------------------------------
// Part 1 — listingEligibility() itself, against the expectations above.
// ---------------------------------------------------------------------------
console.log("listingEligibility() per fixture:\n");
for (const f of fixtures) {
  const result = listingEligibility(f.job, companyNames[f.job.employer_id], now);
  check(
    `${f.name} — google=${f.expectGoogle}`,
    result.google === f.expectGoogle,
    `got google=${result.google}, boards=${result.boards}, reason=${result.reason}`,
  );
  check(
    `${f.name} — boards=${f.expectBoards}`,
    result.boards === f.expectBoards,
    `got google=${result.google}, boards=${result.boards}, reason=${result.reason}`,
  );
  if (!result.google || !result.boards) {
    check(`${f.name} — has a non-empty reason when a chip fails`, typeof result.reason === "string" && result.reason.length > 0);
  } else {
    check(`${f.name} — reason is null when both chips pass`, result.reason === null);
  }
}

// ---------------------------------------------------------------------------
// Part 2 — .boards vs the REAL api/job-feed.mjs loadFeedJobs(), fetch-mocked.
// ---------------------------------------------------------------------------
console.log("\n.boards vs the REAL loadFeedJobs() (api/job-feed.mjs):\n");

const publicRows = fixtures.map((f) => ({ ...f.job }));
const originalFetch = global.fetch;
global.fetch = async (url) => {
  const u = String(url);
  if (u.includes("/published_jobs_public")) {
    return { ok: true, json: async () => publicRows };
  }
  if (u.includes("/employer_public_branding")) {
    const rows = Object.entries(companyNames)
      .filter(([, name]) => name)
      .map(([user_id, company_name]) => ({ user_id, company_name }));
    return { ok: true, json: async () => rows };
  }
  return { ok: false, json: async () => [] };
};

const { loadFeedJobs } = await import("../api/job-feed.mjs");
const feedEntries = await loadFeedJobs();
global.fetch = originalFetch;

const feedSurvivingIds = new Set(feedEntries.map((e) => e.job.id));
for (const f of fixtures) {
  const survivedRealFeed = feedSurvivingIds.has(f.job.id);
  const ourBoards = listingEligibility(f.job, companyNames[f.job.employer_id], now).boards;
  check(
    `${f.name} — .boards matches the real loadFeedJobs() survival (${survivedRealFeed})`,
    ourBoards === survivedRealFeed,
    `listingEligibility.boards=${ourBoards}, real feed kept it=${survivedRealFeed}`,
  );
}

// ---------------------------------------------------------------------------
// Part 3 — .google vs a ported copy of sitemap/index.ts's indexableJobs.
// (Deno.serve at module scope means the real file can't be imported here —
// see the file header. This mirrors it field-for-field.)
// ---------------------------------------------------------------------------
console.log("\n.google vs a ported copy of sitemap/index.ts's indexableJobs filter:\n");

const COUNTRY_TEXT_HINTS = [
  [/\b(united states|u\.s\.a\.?|usa|us)\b/i, "US"],
  [/\bcanada\b/i, "CA"],
  [/\bpakistan\b/i, "PK"],
];
const US_STATE_HINT = /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b/i;
const US_STATE_NAME_HINT = /,\s*(texas|california|new york)\b/i;
const COUNTRY_TOKENS = new Set([
  "united states", "usa", "us", "pakistan", "pk", "canada", "ca", "remote",
]);
const US_STATE_TOKENS = new Set(["tx", "texas", "ca", "california"]);

function inferCountryCode(locationText) {
  const text = (locationText ?? "").trim();
  if (!text) return null;
  for (const [pattern, code] of COUNTRY_TEXT_HINTS) {
    if (pattern.test(text)) return code;
  }
  if (US_STATE_HINT.test(text) || US_STATE_NAME_HINT.test(text)) return "US";
  return null;
}
function hasCountry(job) {
  return !!(job.location_country_code || job.location_country || inferCountryCode(job.location));
}
function isCityToken(token, job) {
  const t = token.trim();
  const lower = t.toLowerCase();
  if (!t) return false;
  if (COUNTRY_TOKENS.has(lower)) return false;
  if (job.location_country && lower === job.location_country.trim().toLowerCase()) return false;
  if (job.location_country_code && lower === job.location_country_code.trim().toLowerCase()) return false;
  if (US_STATE_TOKENS.has(lower)) return false;
  return true;
}
function cityOf(job) {
  const stored = (job.location_city ?? "").trim();
  if (stored) return stored;
  const loc = (job.location ?? "").trim();
  if (!loc || /^remote$/i.test(loc) || !loc.includes(",")) return "";
  const first = loc.split(",")[0].replace(/^remote\b[\s—–\-:|]*/i, "").trim();
  return isCityToken(first, job) ? first : "";
}
function portedIndexable(job, hasCompanyName, nowMs) {
  if (job.exclude_from_feed) return false;
  if (job.application_deadline && new Date(job.application_deadline).getTime() < nowMs) return false;
  if (!hasCompanyName) return false;
  if (!hasCountry(job)) return false;
  return !!cityOf(job) || !!job.is_remote;
}

for (const f of fixtures) {
  const company = companyNames[f.job.employer_id];
  const portedGoogle = portedIndexable(f.job, !!(company && company.trim()), now);
  const ourGoogle = listingEligibility(f.job, company, now).google;
  check(
    `${f.name} — .google matches the ported sitemap filter (${portedGoogle})`,
    ourGoogle === portedGoogle,
    `listingEligibility.google=${ourGoogle}, ported filter=${portedGoogle}`,
  );
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
