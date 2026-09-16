/**
 * Fix: PortfolioUploadPhase.tsx used to compute the portfolio_upload step's
 * result in the candidate's own browser and write it straight into
 * `applications.notes` (`portfolioResult` + `notes[stepId]`) and
 * `applications.phase` with a plain
 * `supabase.from("applications").update(...)` call running as the
 * candidate's own session — trivially forgeable from devtools before
 * `trigger-ava-analysis`/`_shared/autopilot.ts` ever read it as evidence.
 *
 * The fix (docs/TRUSTED-RESULTS.md's part-B recipe, portfolio_upload's own
 * conversion): the page now only uploads files and calls
 * `ai-analyze-portfolio`, which verifies the caller is the candidate,
 * verifies every submitted file path was actually uploaded by that
 * candidate for that application/step (see
 * supabase/functions/ai-analyze-portfolio/ownedPortfolioPath.ts), runs the
 * (unchanged) AI review, and calls
 * supabase/functions/_shared/trustedResults.ts's recordStepResult itself —
 * which is what actually writes notes/phase now. The migration then flips
 * ONLY the `portfolioResult` row of `trusted_result_enforcement` so the
 * database also refuses any leftover/forged candidate write of that key.
 *
 * This guard fails if EITHER half regresses: the page starts writing
 * applications.notes/phase for this step again, or the server path stops
 * verifying caller/ownership/recordStepResult, or the migration stops
 * flipping portfolioResult's flag.
 */
const PAGE_PATH = "src/pages/PortfolioUploadPhase.tsx";
const FUNCTION_PATH = "supabase/functions/ai-analyze-portfolio/index.ts";
const OWNED_PATH_MODULE = "supabase/functions/ai-analyze-portfolio/ownedPortfolioPath.ts";
const MIGRATION_PATH = "supabase/migrations/20260916150500_enforce_portfolio_result.sql";

export default [
  {
    id: "portfolio-trusted-result-page-never-writes-applications",
    why:
      "PortfolioUploadPhase.tsx must never call supabase.from(\"applications\").update(...) to write the " +
      "portfolio_upload step's own result (notes/portfolioResult/notes[stepId]/phase) from the browser again " +
      "— that write must happen only inside ai-analyze-portfolio's own service-role recordStepResult call.",
    async run({ read }) {
      const page = await read(PAGE_PATH);
      if (page == null) return { ok: false, detail: [`${PAGE_PATH} is missing`] };

      const bad = [];

      // The page may still SELECT applications (its own useQuery, the fresh
      // job re-fetch, etc.) — only an UPDATE of the portfolio step's own
      // result is disallowed. Match any `.from("applications")` call chain
      // that reaches `.update(` before it reaches a statement terminator.
      const updateCalls = page.match(/\.from\(\s*["']applications["']\s*\)[\s\S]{0,200}?\.update\(/g) || [];
      if (updateCalls.length > 0) {
        bad.push(
          `${PAGE_PATH}: still calls .from("applications").update(...) directly — the candidate's own session ` +
            "must never write this step's notes/phase again; that belongs to ai-analyze-portfolio's own " +
            "service-role recordStepResult call."
        );
      }

      if (!/portfolioResult/.test(page)) {
        bad.push(
          `${PAGE_PATH}: no longer references "portfolioResult" at all — it should still check the existing ` +
            "server-recorded result (PhaseAlreadySubmitted gating) even though it no longer writes it."
        );
      }

      const invokeMatch = page.match(/supabase\.functions\.invoke\(\s*["']ai-analyze-portfolio["'][\s\S]{0,400}?\}\s*\)/);
      if (!invokeMatch) {
        bad.push(`${PAGE_PATH}: no longer calls the ai-analyze-portfolio edge function.`);
      } else {
        const invokeBody = invokeMatch[0];
        if (!/applicationId\s*:\s*id/.test(invokeBody)) {
          bad.push(`${PAGE_PATH}: its ai-analyze-portfolio call no longer passes applicationId — needed to verify ownership server-side.`);
        }
        if (!/stepId\s*[,}]/.test(invokeBody)) {
          bad.push(`${PAGE_PATH}: its ai-analyze-portfolio call no longer passes stepId — needed to verify ownership server-side.`);
        }
        if (!/files\s*[,:]/.test(invokeBody)) {
          bad.push(`${PAGE_PATH}: its ai-analyze-portfolio call no longer passes the uploaded files list.`);
        }
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "portfolio-trusted-result-server-path-verifies-and-records",
    why:
      "ai-analyze-portfolio must resolve the real caller from the request's own Authorization header, refuse " +
      "any submitted file path that isn't this candidate's own upload for this application/step, and call " +
      "recordStepResult with resultKey \"portfolioResult\" — not trust a client-supplied identity or path.",
    async run({ read }) {
      const fn = await read(FUNCTION_PATH);
      if (fn == null) return { ok: false, detail: [`${FUNCTION_PATH} is missing`] };

      const bad = [];

      if (!/auth\.getUser\(\)/.test(fn)) {
        bad.push(`${FUNCTION_PATH}: no longer resolves the caller via auth.getUser() off the request's own JWT.`);
      }
      if (!/buildOwnedPortfolioPathPattern/.test(fn)) {
        bad.push(
          `${FUNCTION_PATH}: no longer checks submitted file paths against buildOwnedPortfolioPathPattern — a ` +
            "candidate could submit a stranger's/unrelated file path as their own portfolio evidence."
        );
      }
      if (!/storage\.from\(\s*["']portfolios["']\s*\)\.download\(/.test(fn)) {
        bad.push(
          `${FUNCTION_PATH}: no longer downloads each submitted path from the "portfolios" bucket to confirm ` +
            "it actually exists before recording a result for it."
        );
      }
      if (!/recordStepResult\s*\(/.test(fn) || !/from\s+["']\.\.\/_shared\/trustedResults\.ts["']/.test(fn)) {
        bad.push(`${FUNCTION_PATH}: no longer imports/calls recordStepResult from _shared/trustedResults.ts.`);
      }
      if (!/resultKey\s*:\s*["']portfolioResult["']/.test(fn)) {
        bad.push(`${FUNCTION_PATH}: recordStepResult is no longer called with resultKey: "portfolioResult".`);
      }
      if (!/stepType\s*:\s*["']portfolio_upload["']/.test(fn)) {
        bad.push(`${FUNCTION_PATH}: recordStepResult is no longer called with stepType: "portfolio_upload".`);
      }
      if (!/legacyStepEntry\s*:/.test(fn)) {
        bad.push(
          `${FUNCTION_PATH}: no longer passes legacyStepEntry — PortfolioUploadPhase.tsx's own by-id reader ` +
            "(notes[stepId] || notes.portfolioResult) would go stale for every new submission."
        );
      }
      if ((await read(OWNED_PATH_MODULE)) == null) {
        bad.push(`${OWNED_PATH_MODULE} is missing.`);
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "portfolio-trusted-result-flag-flipped",
    why:
      "The portfolio_upload conversion is only safe to ship once its own migration flips " +
      "trusted_result_enforcement's portfolioResult row to enforced = true.",
    async run({ read }) {
      const migration = await read(MIGRATION_PATH);
      if (migration == null) return { ok: false, detail: [`${MIGRATION_PATH} is missing`] };

      const bad = [];
      const flips = /UPDATE\s+public\.trusted_result_enforcement\s*\n?\s*SET\s+enforced\s*=\s*true[\s\S]*?WHERE\s+result_key\s*=\s*'portfolioResult'/i.test(
        migration
      );
      if (!flips) {
        bad.push(`${MIGRATION_PATH}: does not flip result_key = 'portfolioResult' to enforced = true.`);
      }
      // This migration must flip ONLY its own key — never 'phase' (that is
      // the final, all-phases-done migration's job per docs/TRUSTED-RESULTS.md).
      if (/result_key\s*=\s*'phase'/i.test(migration)) {
        bad.push(`${MIGRATION_PATH}: must not touch result_key = 'phase' — that flag flips only once every phase is converted.`);
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
