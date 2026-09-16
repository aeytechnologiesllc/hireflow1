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
 * 0 as of 2026-09-16 (was 191). The showcase schema adapter
 * (src/cockpit/data/showcaseSource.ts, src/lib/showcaseApply.ts) queries
 * `roles`/`candidates`/etc., a schema that predates the live hireflow1
 * project and was never in the generated Database type, which used to make
 * every column access on those two files resolve to a SelectQueryError
 * union (124 of the 191 errors, one root cause). Rather than delete or gate
 * that still-reachable fallback path (detectSchemaMode() flips to it
 * whenever `published_jobs_public` can't be found, which real forks/local
 * DBs without the jobs migration can hit), src/lib/showcaseSchema.ts now
 * hand-types that schema and re-types the one real Supabase client against
 * it for those two modules — see its file header for why. The remaining 67
 * were real, mostly small bugs: two more direct `supabase.from("roles"/
 * "applications")` calls bypassing that adapter (src/hooks/useJobs.ts,
 * useUpcomingInterviewsCount.ts); two leftover `.from("..." as any)` casts
 * on `employer_public_branding` (Applications.tsx,
 * CandidateApplicationDetail.tsx) from before that view was in the
 * generated types; a `let` narrowed to a literal union by its `as const`
 * initializer then reassigned outside it (AvaWorkflowGenerationOverlay.tsx);
 * a boolean-discriminated union that only narrows on `=== false`, not `!x.ok`
 * (MeetingRoom.tsx); an always-`never[]` empty-array branch in
 * useAdvancedAnalytics.ts unioning with the real element type on every
 * consumer; a handful of `config?: Record<string, unknown>` workflow-step
 * casts narrowed to their two or three real keys; two edge-function
 * `invokeAuthedFunction<T>()` calls with no `T`, defaulting to `unknown`;
 * and two genuine latent gaps this pass left behavior-identical and typed
 * honestly rather than "fixed" into new behavior: `published_jobs_public`
 * never selects `jobs.benefits` (JobDetails.tsx — see the code comment
 * there and task_4e14a421) and `documents` has no `updated_at` column
 * (cockpit/lib/mappers.ts).
 */
const BASELINE = 0;

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
