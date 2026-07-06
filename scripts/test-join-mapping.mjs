/**
 * Tests for the JOIN field-mapping module (supabase/functions/_shared/joinMapping.ts).
 * Runs with plain Node (esbuild-bundles the TS on the fly — no test framework needed):
 *   node scripts/test-join-mapping.mjs
 */
import { execSync } from "node:child_process";
import { strict as assert } from "node:assert";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(os.tmpdir(), `joinMapping-test-${process.pid}.mjs`);
execSync(
  `npx esbuild "${path.join(root, "supabase/functions/_shared/joinMapping.ts")}" --bundle --platform=neutral --format=esm --outfile="${out}"`,
  { stdio: "pipe" },
);
const m = await import(pathToFileURL(out).href);

const JOB = {
  id: "11111111-2222-3333-4444-555555555555",
  title: "Barista",
  description: "Serve espresso & smile.",
  responsibilities: "Make drinks\nOpen the store",
  requirements: "2 years experience",
  job_type: "part-time",
  is_remote: false,
  location_country_code: "US",
  location_city: "Atlanta",
  salary_min: 18,
  salary_max: 22,
  salary_currency: "USD",
  salary_period: "HOUR",
  require_resume: true,
};
const REFS = { categoryId: 55, employmentTypeId: 7, officeId: 3, language: "en" };

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
};

console.log("joinMapping tests");

test("payload maps required fields + salary + OFFLINE safety default", () => {
  const p = m.mapJobToJoinPayload(JOB, REFS);
  assert.equal(p.title, "Barista");
  assert.equal(p.categoryId, 55);
  assert.equal(p.employmentTypeId, 7);
  assert.equal(p.officeId, 3);
  assert.equal(p.language, "en");
  assert.equal(p.externalId, JOB.id); // application routing key
  assert.equal(p.status, "OFFLINE"); // NEVER live at creation
  assert.equal(p.workplaceType, "ONSITE");
  assert.equal(p.cv, "REQUIRED");
  assert.deepEqual(p.salary, { frequency: "PER_HOUR", currency: "USD", from: 18, to: 22, isShownOnJobAd: true });
  assert.ok(p.description.includes("<ul>") && p.description.includes("Make drinks"));
  assert.ok(p.description.includes("&amp;")); // HTML-escaped
});

test("publishLive flips ONLINE only when asked", () => {
  assert.equal(m.mapJobToJoinPayload(JOB, REFS, { publishLive: true }).status, "ONLINE");
  assert.equal(m.mapJobToJoinPayload(JOB, REFS, { publishLive: false }).status, "OFFLINE");
});

test("remote job → REMOTE + COUNTRY scope; unknown country → ANYWHERE", () => {
  const remote = m.mapJobToJoinPayload({ ...JOB, is_remote: true }, REFS);
  assert.equal(remote.workplaceType, "REMOTE");
  assert.equal(remote.remoteType, "COUNTRY");
  const nowhere = m.mapJobToJoinPayload({ ...JOB, is_remote: true, location_country_code: null }, REFS);
  assert.equal(nowhere.remoteType, "ANYWHERE");
});

test("unsupported currency (PKR) → no salary block; supported (GBP) kept", () => {
  assert.equal(m.mapJobToJoinPayload({ ...JOB, salary_currency: "PKR" }, REFS).salary, undefined);
  assert.equal(m.mapJobToJoinPayload({ ...JOB, salary_currency: "gbp" }, REFS).salary.currency, "GBP");
});

test("salary period mapping + default PER_YEAR", () => {
  assert.equal(m.toJoinFrequency("MONTH"), "PER_MONTH");
  assert.equal(m.toJoinFrequency("hourly"), "PER_HOUR");
  assert.equal(m.toJoinFrequency(null), "PER_YEAR");
  assert.equal(m.toJoinFrequency("bananas"), "PER_YEAR");
});

test("validation catches every missing requirement", () => {
  const errs = m.validateJobForJoin({ id: "x", title: "  " }, {});
  assert.ok(errs.some((e) => /title/i.test(e)));
  assert.ok(errs.some((e) => /description/i.test(e)));
  assert.ok(errs.some((e) => /category/i.test(e)));
  assert.ok(errs.some((e) => /employment/i.test(e)));
  assert.ok(errs.some((e) => /office|location/i.test(e)));
  assert.equal(m.validateJobForJoin(JOB, REFS).length, 0);
});

test("employment type matching: exact, alias, no-confident-match", () => {
  const types = [
    { id: 1, slug: "full-time", name: "Full-time" },
    { id: 2, slug: "part-time", name: "Part-time" },
    { id: 3, slug: "internship", name: "Internship" },
  ];
  assert.equal(m.matchEmploymentTypeId("part-time", types), 2);
  assert.equal(m.matchEmploymentTypeId("Permanent full time", types), 1);
  assert.equal(m.matchEmploymentTypeId("intern", types), 3);
  assert.equal(m.matchEmploymentTypeId("zzz-unknown", types), null);
});

test("category matching picks best sub-category by keyword overlap", () => {
  const cats = [
    { id: 10, name: "Hospitality", subCategories: [{ id: 101, name: "Barista & Coffee" }, { id: 102, name: "Kitchen" }] },
    { id: 20, name: "Tech", subCategories: [{ id: 201, name: "Software Engineering" }] },
  ];
  assert.equal(m.matchSubCategoryId({ id: "x", title: "Senior Barista", department: "Coffee" }, cats), 101);
  assert.equal(m.matchSubCategoryId({ id: "x", title: "Software Engineer" }, cats), 201);
  assert.equal(m.matchSubCategoryId({ id: "x", title: "" }, cats), null);
});

test("application import mapping: status, resume, name, dedupe key", () => {
  const app = {
    id: 987654,
    createdAt: "2026-07-01T10:00:00Z",
    hiringState: "ACTIVE",
    candidate: { firstName: "Jane", lastName: "Doe", email: "jane@x.com", phoneNumber: "+1404" },
    attachments: [{ type: "COVER_LETTER", url: "https://j/cl.pdf" }, { type: "CV", url: "https://j/cv.pdf?sig=abc" }],
    source: { product: "indeed (Limited)", isPremium: false },
  };
  assert.equal(m.joinHiringStateToStatus(app.hiringState), "reviewing");
  assert.equal(m.joinHiringStateToStatus("HIRED"), "hired");
  assert.equal(m.joinHiringStateToStatus("REJECTED"), "rejected");
  assert.equal(m.joinHiringStateToStatus("OFFER"), "offered");
  assert.equal(m.joinHiringStateToStatus(undefined), "pending");
  assert.equal(m.joinResumeUrl(app), "https://j/cv.pdf?sig=abc");
  assert.equal(m.joinResumeUrl({ id: 1, attachments: [] }), null);
  assert.equal(m.joinCandidateFullName(app), "Jane Doe");
  assert.equal(m.joinCandidateFullName({ id: 1, candidate: { email: "a@b.c" } }), "a@b.c");
  assert.equal(m.externalApplicationId(app), "987654"); // stable dedupe key
  assert.equal(m.externalApplicationId({ id: "987654" }), "987654"); // same key regardless of type
});

console.log(`\n${passed} passed${process.exitCode ? " — WITH FAILURES" : ", 0 failed"}`);
