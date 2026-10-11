#!/usr/bin/env node
/**
 * applications_staff_list keeps every column of applications
 * (supabase/migrations/20261011201000_applications_staff_list.sql).
 *
 * The dashboard and the Applicants list read that view instead of the table
 * (2026-10-11, the performance check): the same rows, with the notes' three
 * heavy server-only parts left out. A column added to applications and not to
 * the view would silently vanish from both screens, so this compares the
 * view's column list with the applications row type in
 * src/integrations/supabase/types.ts, and checks what the view drops.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");
let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    passed++;
    console.log(`  ok  - ${name}`);
  } else {
    failed++;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
};

const sql = await read("supabase/migrations/20261011201000_applications_staff_list.sql");
const types = await read("src/integrations/supabase/types.ts");

const viewBody = sql.slice(sql.indexOf("CREATE OR REPLACE VIEW public.applications_staff_list"), sql.indexOf("FROM public.applications a;"));
const viewCols = [...viewBody.matchAll(/^\s*(?:a\.(\w+)|public\.staff_list_notes\(a\.notes\) AS (\w+)),?\s*$/gm)].map((m) => m[1] ?? m[2]);
const tableStart = types.indexOf("      applications: {\n        Row: {");
const tableRow = types.slice(tableStart, types.indexOf("        }\n", tableStart));
const tableCols = [...tableRow.matchAll(/^\s{10}(\w+)\??:/gm)].map((m) => m[1]);

check("the applications row type was found", tableCols.length >= 20, String(tableCols.length));
const missing = tableCols.filter((c) => !viewCols.includes(c));
const extra = viewCols.filter((c) => !tableCols.includes(c));
check("the view has every column of applications", missing.length === 0, missing.join(", "));
check("...and nothing applications does not have", extra.length === 0, extra.join(", "));
check("the view runs with the caller's rights (the applications rules decide every row)", /WITH \(security_invoker = true\)/.test(sql));
check("signed-out visitors cannot read it, nobody can write through it", /REVOKE ALL ON public\.applications_staff_list FROM PUBLIC, anon;/.test(sql) && /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public\.applications_staff_list FROM authenticated;/.test(sql));
check("notes lose exactly the three server-only parts", /\(p_notes::jsonb - 'avaScorecard' - 'avaAnalysisMeta' - 'improvement_blueprint'\)::text/.test(sql));
check("notes that are not valid JSON pass through untouched (never an error for the whole list)", /pg_input_is_valid\(p_notes, 'jsonb'\)/.test(sql) && /ELSE p_notes/.test(sql));

// No staff screen reads the parts the view drops.
const { readdir } = await import("node:fs/promises");
async function walk(dir) {
  const out = [];
  for (const e of await readdir(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(rel)));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}
const staffFiles = (await walk("src/cockpit")).concat(["src/hooks/useApplications.ts"]);
const readers = [];
for (const rel of staffFiles) {
  const text = (await read(rel)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (/avaScorecard|avaAnalysisMeta|evidenceFingerprint|improvement_blueprint/.test(text)) readers.push(rel);
}
check("no staff screen reads what the view leaves out", readers.length === 0, readers.join(", "));

// The two lists read the view.
const apps = await read("src/hooks/useApplications.ts");
const list = await read("src/cockpit/hooks/useApplicantList.ts");
check("the dashboard's applicants come from the view", /\.from\("applications_staff_list"\)\s*\.select\("\*"\)\s*\.in\("job_id"/.test(apps));
check("the Applicants list's come from the view", /\.from\("applications_staff_list"\)\s*\.select\(APPLICANT_LIST_COLUMNS\)/.test(list));
check("the view is in the app's database types", /Views: \{\n      applications_staff_list: \{/.test(types));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
