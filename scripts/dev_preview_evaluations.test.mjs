#!/usr/bin/env node
/**
 * The dev preview's stand-in database keeps the hiring team's evaluation in
 * its own table, the way the real one does since
 * supabase/migrations/20261025230000_application_evaluations.sql
 * (docs/DEV-PREVIEW.md), so every staff screen in /__preview still shows
 * Ava's score and read, through the same path it uses live:
 *
 *  - every scenario's fixtures (which put the five on the application, as
 *    the app's writers do) come out of applications_staff_list and out of an
 *    embedded application_evaluations(...) with the same values, while the
 *    applications rows themselves hold NULL;
 *  - a write through applications files the fields it names (a clear
 *    included) and leaves the others; an insert files what it carries;
 *    deleting the application deletes its evaluation.
 *
 * Runs the real src/dev-preview/fixtureClient.ts and fixtures.ts, bundled
 * with esbuild ("@/" mapped to src/).
 *
 * Run with: node scripts/dev_preview_evaluations.test.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = await build({
  stdin: {
    contents:
      'export { createFixtureSupabaseClient } from "./src/dev-preview/fixtureClient.ts";\n' +
      'export { buildFixtureTables, FIXTURE_SCENARIOS } from "./src/dev-preview/fixtures.ts";\n',
    resolveDir: ROOT,
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  logLevel: "silent",
  plugins: [
    {
      name: "aliases",
      setup(b) {
        b.onResolve({ filter: /^@\// }, async (args) => {
          const base = path.join(ROOT, "src", args.path.slice(2));
          for (const suffix of [".ts", ".tsx", "/index.ts"]) {
            const r = await b.resolve(base + suffix, { kind: args.kind, resolveDir: ROOT });
            if (!r.errors.length) return { path: r.path };
          }
          throw new Error(`cannot resolve ${args.path}`);
        });
      },
    },
  ],
});
const { createFixtureSupabaseClient, buildFixtureTables, FIXTURE_SCENARIOS } = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

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
const FIVE = ["ai_score", "ai_analysis", "ai_scorecard", "phase_ai_analysis", "employer_notes"];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const USER = { id: "20000000-0000-4000-8000-000000000001", email: "owner@example.com", user_metadata: {} };

console.log("Every scenario's scores reach the staff screens through the evaluation");
for (const scenario of FIXTURE_SCENARIOS) {
  const tables = buildFixtureTables(scenario);
  const expected = new Map((tables.applications ?? []).map((a) => [a.id, Object.fromEntries(FIVE.map((f) => [f, a[f] ?? null]))]));
  const scored = [...expected.values()].filter((e) => e.ai_score !== null).length;
  const client = createFixtureSupabaseClient({ user: USER, tables });
  const { data: view } = await client.from("applications_staff_list").select("*");
  const { data: embedded } = await client.from("applications").select("id, status, application_evaluations(ai_score, ai_analysis, ai_scorecard, phase_ai_analysis, employer_notes)");
  const { data: plain } = await client.from("applications").select("*");
  const viewOk = (view ?? []).every((row) => FIVE.every((f) => same(row[f], expected.get(row.id)?.[f])));
  const embedOk = (embedded ?? []).every((row) => {
    const want = expected.get(row.id);
    const has = FIVE.some((f) => want?.[f] !== null);
    return has ? FIVE.every((f) => same(row.application_evaluations?.[f], want[f])) : row.application_evaluations === null;
  });
  check(`${scenario}: the staff view shows every applicant's five as the fixtures set them (${scored} scored)`, viewOk && (view ?? []).length === expected.size);
  check(`${scenario}: an embedded application_evaluations(...) carries them (an object, or null)`, embedOk);
  check(`${scenario}: the applications rows themselves hold none of them`, (plain ?? []).every((row) => FIVE.every((f) => row[f] === null || row[f] === undefined)) && (plain ?? []).every((row) => !("application_evaluations" in row)));
}

console.log("\nWrites through applications land where the triggers put them");
{
  const tables = {
    applications: [
      { id: "a1", job_id: "j1", candidate_id: "c1", status: "reviewing", ai_score: 70, ai_scorecard: { overallScore: 70 }, employer_notes: "Call Monday." },
      { id: "a2", job_id: "j1", candidate_id: "c2", status: "pending" },
    ],
  };
  const client = createFixtureSupabaseClient({ user: USER, tables });
  const evaluation = async (id) => (await client.from("application_evaluations").select("*").eq("application_id", id).maybeSingle()).data;
  const { data: rejected } = await client.from("applications").update({ status: "rejected", employer_notes: "Not a fit." }).eq("id", "a1").select().single();
  check("a decline's reason is filed under the evaluation", (await evaluation("a1"))?.employer_notes === "Not a fit.");
  check("…the write answers with the row as the database keeps it (no notes on it)", rejected?.status === "rejected" && rejected?.employer_notes === null);
  check("…and the other fields are untouched", (await evaluation("a1"))?.ai_score === 70);
  await client.from("applications").update({ employer_notes: null }).eq("id", "a1");
  check("clearing the notes clears them", (await evaluation("a1"))?.employer_notes === null && (await evaluation("a1"))?.ai_score === 70);
  await client.from("applications").update({ status: "reviewing" }).eq("id", "a1");
  check("a write that names none of the five leaves the evaluation alone", (await evaluation("a1"))?.ai_score === 70);
  await client.from("applications").update({ ai_score: 55 }).eq("id", "a2");
  check("an application's first score makes its evaluation", (await evaluation("a2"))?.ai_score === 55);
  const { data: inserted } = await client.from("applications").insert({ job_id: "j1", candidate_id: "c3", status: "pending", ai_score: 40 }).select().single();
  check("an insert files what it carries, and the row holds none of it", (await evaluation(inserted.id))?.ai_score === 40 && inserted.ai_score === null);
  const { data: list } = await client.from("applications_staff_list").select("*").eq("id", "a2");
  check("the staff view reads the new score", list?.[0]?.ai_score === 55);
  await client.from("applications").delete().eq("id", "a2");
  check("deleting the application deletes its evaluation", (await evaluation("a2")) === null);
}

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
