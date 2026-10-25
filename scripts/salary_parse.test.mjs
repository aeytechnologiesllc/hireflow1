#!/usr/bin/env node
/**
 * Pay read the way the business wrote it (src/lib/salaryParse.ts; the Phase 7
 * product audit, 2026-10-25): "₱20,000/month" showed on the public job page
 * as "USD 20,000+ a month". Pesos are known, one figure is the pay itself,
 * cents are kept, a missing period follows the currency's habit, and the
 * "m" of "monthly" is never a million.
 *
 * Run with: node scripts/salary_parse.test.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { parseSalary } = await import("../src/lib/salaryParse.ts");

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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const [text, country, want] of [
  ["₱20,000/month", null, { min: 20000, max: 20000, currency: "PHP", period: "MONTH" }],
  ["₱20,000", null, { min: 20000, max: 20000, currency: "PHP", period: "MONTH" }],
  ["PHP 20,000 - 25,000 monthly", null, { min: 20000, max: 25000, currency: "PHP", period: "MONTH" }],
  ["PHP25000 per month", null, { min: 25000, max: 25000, currency: "PHP", period: "MONTH" }],
  ["25,000 pesos a month", null, { min: 25000, max: 25000, currency: "PHP", period: "MONTH" }],
  ["20,000 monthly", "PH", { min: 20000, max: 20000, currency: "PHP", period: "MONTH" }],
  ["$18/hr", null, { min: 18, max: 18, currency: "USD", period: "HOUR" }],
  ["$18.50/hr", null, { min: 18.5, max: 18.5, currency: "USD", period: "HOUR" }],
  ["$15.75 hourly", null, { min: 15.75, max: 15.75, currency: "USD", period: "HOUR" }],
  ["from $18/hr", null, { min: 18, max: null, currency: "USD", period: "HOUR" }],
  ["$18+ an hour", null, { min: 18, max: null, currency: "USD", period: "HOUR" }],
  ["up to $20/hr", null, { min: null, max: 20, currency: "USD", period: "HOUR" }],
  ["$90k–$110k", null, { min: 90000, max: 110000, currency: "USD", period: "YEAR" }],
  ["$45,000", null, { min: 45000, max: 45000, currency: "USD", period: "YEAR" }],
  ["$2,500", null, { min: 2500, max: 2500, currency: "USD", period: "MONTH" }],
  ["Rs 200,000", null, { min: 200000, max: 200000, currency: "PKR", period: "MONTH" }],
  ["500 a day", null, { min: 500, max: 500, currency: null, period: "DAY" }],
  ["18hr", null, { min: 18, max: 18, currency: null, period: "HOUR" }],
  ["Competitive", null, { min: null, max: null, currency: null, period: null }],
]) {
  const got = parseSalary(text, country);
  check(`${JSON.stringify(text)}${country ? ` (${country})` : ""} reads as ${want.currency ?? "no currency"} ${want.min ?? "-"}–${want.max ?? "-"} ${want.period ?? ""}`, same(got, want), JSON.stringify(got));
}

const builder = readFileSync(path.join(ROOT, "src/lib/jobFromFlow.ts"), "utf8");
check("the job builder stores what the parser reads, and a remote job's place picks no currency (the third product audit)", /const sal = parseSalary\(payText, isRemote \? undefined : countryCode \?\? undefined\);/.test(builder) && /const salaryCurrency = sal\.currency \?\? \(!isRemote && countryCode === "US" \? "USD" : null\);/.test(builder));
const page = readFileSync(path.join(ROOT, "src/pages/JobDetails.tsx"), "utf8");
check("the job page says pay with the shared words (no USD guessed)", /payWords\(\{ salary_min: min, salary_max: max, salary_currency: currency, salary_period: period \}\)/.test(page) && !/currency \|\| "USD"/.test(page));
const migration = readFileSync(path.join(ROOT, "supabase/migrations/20261025330000_salary_keeps_cents.sql"), "utf8");
check("the jobs table keeps cents (numeric pay)", /ALTER COLUMN salary_min TYPE numeric\(12,2\)/.test(migration) && /ALTER COLUMN salary_max TYPE numeric\(12,2\)/.test(migration));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
