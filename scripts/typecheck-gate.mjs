#!/usr/bin/env node
/**
 * Typecheck ratchet gate.
 *
 * `npm run build` uses @vitejs/plugin-react-swc, which strips types WITHOUT
 * typechecking — so latent tsc errors ship silently. This gate runs the real
 * compiler against tsconfig.app.json and compares the error count to a frozen
 * baseline. The count may only SHRINK, never grow: any new error (total up, or
 * any single file gaining errors) fails the gate.
 *
 *   node scripts/typecheck-gate.mjs          # verify (exit 1 on regression)
 *   node scripts/typecheck-gate.mjs --init   # write/refresh the baseline
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(__dirname, "typecheck-baseline.json");
const TSC_CMD = "npx tsc -p tsconfig.app.json --noEmit";

function runTsc() {
  try {
    execSync(TSC_CMD, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return ""; // clean — no diagnostics
  } catch (err) {
    return `${err.stdout || ""}${err.stderr || ""}`;
  }
}

function parse(output) {
  const perFile = {};
  let total = 0;
  // e.g. "src/pages/Foo.tsx(123,45): error TS2304: Cannot find name 'x'."
  const re = /^(.+?)\((\d+),(\d+)\):\s+error\s+TS\d+/;
  for (const line of output.split("\n")) {
    const m = line.match(re);
    if (m) {
      const file = m[1].trim();
      perFile[file] = (perFile[file] || 0) + 1;
      total++;
    }
  }
  return { total, perFile };
}

const isInit = process.argv.includes("--init") || process.argv.includes("--update");
const current = parse(runTsc());

if (isInit) {
  const baseline = {
    description:
      "Frozen tsc error baseline for the ratchet gate. The count may only shrink. " +
      "Regenerate intentionally with `node scripts/typecheck-gate.mjs --update` when errors are genuinely fixed.",
    command: TSC_CMD,
    generatedAt: new Date().toISOString(),
    total: current.total,
    perFile: Object.fromEntries(Object.entries(current.perFile).sort(([a], [b]) => a.localeCompare(b))),
  };
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + "\n");
  console.log(
    `✓ Wrote baseline: ${current.total} errors across ${Object.keys(current.perFile).length} file(s) -> ${BASELINE}`
  );
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
} catch {
  console.error(`✗ No baseline at ${BASELINE}. Run: node scripts/typecheck-gate.mjs --init`);
  process.exit(1);
}

const regressions = [];
for (const [file, count] of Object.entries(current.perFile)) {
  const allowed = baseline.perFile[file] || 0;
  if (count > allowed) regressions.push(`  ${file}: ${allowed} -> ${count} (+${count - allowed})`);
}

console.log(`typecheck: ${current.total} errors (baseline ${baseline.total})`);

if (current.total > baseline.total || regressions.length) {
  console.error("✗ Typecheck gate FAILED — new type errors introduced:");
  if (regressions.length) console.error(regressions.join("\n"));
  if (current.total > baseline.total)
    console.error(`  total ${baseline.total} -> ${current.total} (+${current.total - baseline.total})`);
  console.error("Fix the new errors, or if you genuinely fixed errors run `--update` to lower the baseline.");
  process.exit(1);
}

if (current.total < baseline.total) {
  console.log(`✓ Improvement: ${baseline.total - current.total} fewer error(s) than baseline — run --update to lock it in.`);
}
console.log("✓ Typecheck gate passed (no new errors).");
process.exit(0);
