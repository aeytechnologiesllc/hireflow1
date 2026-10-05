#!/usr/bin/env node
/**
 * Proves src/cockpit/lib/listingEligibility.ts agrees with the REAL job-board
 * gate: .boards is checked against api/job-feed.mjs's loadFeedJobs(), imported
 * live (not re-implemented) with global.fetch mocked to serve fixture rows the
 * way Supabase's REST endpoint would. (A .google output was checked against a
 * ported sitemap filter until Google Jobs was removed on 2026-10-05.)
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
    expectBoards: false,
  },
  {
    name: "onsite with a real city",
    job: { ...baseJob, id: "j-with-city", location_country_code: "US", location_city: "Austin" },
    expectBoards: true,
  },
  {
    name: "remote with a country",
    job: { ...baseJob, id: "j-remote-with-country", location_country_code: "US", location_city: null, is_remote: true, location: "Remote - United States" },
    expectBoards: true,
  },
  {
    name: "remote WITHOUT a country",
    job: { ...baseJob, id: "j-remote-no-country", location_country_code: null, location_country: null, location_city: null, is_remote: true, location: "Remote" },
    expectBoards: false,
  },
  {
    name: '"Pakistan" alone is rejected as a city (country token)',
    job: { ...baseJob, id: "j-pakistan-token", location_country_code: "PK", location_city: null, location: "Pakistan, Pakistan" },
    expectBoards: false,
  },
  {
    name: "a US state token is rejected as a city",
    job: { ...baseJob, id: "j-state-token", location_country_code: "US", location_city: null, location: "Texas, US" },
    expectBoards: false,
  },
  {
    name: "description just under the 100-char floor (boards only)",
    job: { ...baseJob, id: "j-desc-99", location_country_code: "US", location_city: "Austin", description: SHORT_DESC_99, responsibilities: null, requirements: null },
    expectBoards: false,
  },
  {
    name: "description exactly at the 100-char floor, wrapped in HTML markup",
    job: { ...baseJob, id: "j-desc-100", location_country_code: "US", location_city: "Austin", description: `<p>${SHORT_DESC_100}</p>`, responsibilities: null, requirements: null },
    expectBoards: true,
  },
  {
    name: "blank company name",
    job: { ...baseJob, id: "j-blank-company", location_country_code: "US", location_city: "Austin", employer_id: EMPLOYER_BLANK },
    expectBoards: false,
  },
  {
    name: "excluded from feed",
    job: { ...baseJob, id: "j-excluded", location_country_code: "US", location_city: "Austin", exclude_from_feed: true },
    expectBoards: false,
  },
  {
    name: "expired deadline",
    job: { ...baseJob, id: "j-expired", location_country_code: "US", location_city: "Austin", application_deadline: "2020-01-01T00:00:00Z" },
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
    `${f.name} — boards=${f.expectBoards}`,
    result.boards === f.expectBoards,
    `got boards=${result.boards}, reason=${result.reason}`,
  );
  check(`${f.name} — no google output`, !("google" in result));
  if (!result.boards) {
    check(`${f.name} — has a non-empty reason when the boards chip fails`, typeof result.reason === "string" && result.reason.length > 0);
    check(`${f.name} — the reason never mentions Google`, !/google/i.test(result.reason ?? ""));
  } else {
    check(`${f.name} — reason is null when the role is on the boards`, result.reason === null);
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
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
