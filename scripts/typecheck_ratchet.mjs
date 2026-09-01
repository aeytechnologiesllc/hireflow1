/**
 * Typecheck ratchet — the error count may fall, never rise.
 *
 * Why this exists. `npm run build` is Vite, and Vite does not typecheck, so the
 * production build stays green no matter how many type errors accumulate. There
 * was also no `typecheck` script at all, so nobody could check in one command.
 * Between 2026-08-27 and 2026-08-31 the count drifted 187 → 196 unnoticed.
 *
 * This is deliberately NOT a guard in scripts/guardrails.mjs: those are static
 * checks that run in about a second with no toolchain, and shelling out to tsc
 * would cost ~10s and break that promise. Run this one separately, in CI or
 * before a push.
 *
 *   npm run typecheck          # see the errors
 *   npm run typecheck:ratchet  # fail if the count went up
 *
 * When you genuinely fix errors, lower BASELINE to the new number in the same
 * commit. That is the ratchet: it only ever tightens.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import process from "node:process";

/**
 * 195 as of 2026-09-01 (was 196; fetching quiz_questions in TypingTestPhase
 * resolved one).
 *
 * 124 of these (76 in src/cockpit/data/showcaseSource.ts, 48 in
 * src/lib/showcaseApply.ts) are one root cause, not 124 problems: that code
 * queries a `roles`/`candidates` schema which does not exist on the live project
 * yqklrkpptnhubsnijqze, so every column access fails to resolve. Deleting or
 * gating the showcase path would clear roughly two thirds of this number at once.
 */
const BASELINE = 191;

const run = promisify(execFile);

const { stdout } = await run("npx", ["tsc", "--noEmit", "-p", "tsconfig.app.json"], {
  maxBuffer: 32 * 1024 * 1024,
}).catch((err) => ({ stdout: err.stdout ?? "" }));

const errors = stdout.split("\n").filter((l) => l.includes("error TS"));
const count = errors.length;

if (count > BASELINE) {
  console.error(`\n  FAIL  typecheck errors rose ${BASELINE} → ${count} (+${count - BASELINE}).\n`);
  const byFile = new Map();
  for (const line of errors) {
    const file = line.split("(")[0];
    byFile.set(file, (byFile.get(file) ?? 0) + 1);
  }
  console.error("  worst files:");
  for (const [file, n] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.error(`    ${String(n).padStart(4)}  ${file}`);
  }
  console.error("\n  Fix the new errors, or if you removed some, lower BASELINE in this file.\n");
  process.exit(1);
}

if (count < BASELINE) {
  console.log(
    `\n  ok    typecheck errors fell ${BASELINE} → ${count}. ` +
      `Lower BASELINE in scripts/typecheck_ratchet.mjs to ${count} to lock the win in.\n`
  );
} else {
  console.log(`\n  ok    typecheck errors holding at ${count} (baseline ${BASELINE}).\n`);
}
