/**
 * Fix: SalesSimulationPhase.tsx used to grade the sales pitch via a public,
 * unauthenticated ai-sales-simulation "evaluate" call and then write
 * `applications.notes.salesSimulationResult` (+ `phase_ai_analysis`) itself
 * with a plain candidate-session `supabase.from("applications").update(...)`
 * call — trusting whatever score/wouldBuy verdict came back completely. A
 * candidate could intercept that response, or skip the eval call outright,
 * and write any passing score they liked.
 *
 * The fix (docs/TRUSTED-RESULTS.md's part-B recipe): grading now happens in
 * submit-sales-simulation/index.ts, an authenticated (verify_jwt = true)
 * edge function that grades the transcript service-role and calls
 * recordStepResult (supabase/functions/_shared/trustedResults.ts) —
 * verifying the caller really is this application's own candidate and that
 * they've actually reached the sales_simulation step before writing
 * anything — and the migration
 * (20260916150400_enforce_sales_simulation_result.sql) flips
 * trusted_result_enforcement.enforced for 'salesSimulationResult' so the
 * shared trigger (20260915140000_trusted_step_results.sql) refuses a
 * candidate's own direct write of that key even if some other code path
 * tried to reintroduce one.
 *
 * This guard fails if ANY of these regress:
 *   - SalesSimulationPhase.tsx starts writing applications.notes/
 *     phase_ai_analysis directly again (the exact vulnerability being
 *     fixed);
 *   - submit-sales-simulation/index.ts stops verifying the caller's JWT, or
 *     stops calling recordStepResult with resultKey 'salesSimulationResult'
 *     / stepType 'sales_simulation';
 *   - config.toml stops requiring a verified JWT for submit-sales-simulation;
 *   - the migration stops flipping 'salesSimulationResult' to enforced = true.
 */
const PHASE_PAGE_PATH = "src/pages/SalesSimulationPhase.tsx";
const SUBMIT_FN_PATH = "supabase/functions/submit-sales-simulation/index.ts";
const GRADING_PATH = "supabase/functions/submit-sales-simulation/grading.ts";
const CONFIG_PATH = "supabase/config.toml";
const MIGRATION_PATH = "supabase/migrations/20260916150400_enforce_sales_simulation_result.sql";

export default [
  {
    id: "enforce-sales-simulation-result",
    why:
      "SalesSimulationPhase.tsx must never write applications.notes/phase directly again — grading and the " +
      "notes/phase write belong to submit-sales-simulation's authenticated, service-role recordStepResult call, " +
      "and trusted_result_enforcement.salesSimulationResult must stay enforced so the DB trigger backs that up.",
    async run({ read }) {
      const bad = [];

      const phasePage = await read(PHASE_PAGE_PATH);
      if (phasePage == null) {
        bad.push(`${PHASE_PAGE_PATH} is missing`);
      } else {
        if (/\.from\(\s*["']applications["']\s*\)\s*\.update\(/.test(phasePage)) {
          bad.push(
            `${PHASE_PAGE_PATH}: writes applications directly again (a ".from(\"applications\").update(...)" call) — ` +
              "the candidate's own browser must never write notes/phase/phase_ai_analysis for this step; that belongs " +
              "to submit-sales-simulation's service-role recordStepResult call."
          );
        }
        if (!/submit-sales-simulation/.test(phasePage)) {
          bad.push(`${PHASE_PAGE_PATH}: no longer calls submit-sales-simulation — the trusted write path is gone.`);
        }
      }

      const submitFn = await read(SUBMIT_FN_PATH);
      if (submitFn == null) {
        bad.push(`${SUBMIT_FN_PATH} is missing`);
      } else {
        if (!/resolveCallerId|auth\.getUser/.test(submitFn)) {
          bad.push(
            `${SUBMIT_FN_PATH}: no longer resolves the caller's identity from a verified JWT — a candidate id must ` +
              "never be trusted from the request body."
          );
        }
        if (!/recordStepResult\s*\(/.test(submitFn)) {
          bad.push(`${SUBMIT_FN_PATH}: no longer calls recordStepResult — the trusted write path is gone.`);
        }
        if (!/resultKey:\s*["']salesSimulationResult["']/.test(submitFn)) {
          bad.push(`${SUBMIT_FN_PATH}: no longer records resultKey 'salesSimulationResult'.`);
        }
        if (!/stepType:\s*["']sales_simulation["']/.test(submitFn)) {
          bad.push(`${SUBMIT_FN_PATH}: no longer records stepType 'sales_simulation'.`);
        }
      }

      const grading = await read(GRADING_PATH);
      if (grading == null) {
        bad.push(`${GRADING_PATH} is missing — the pure grading/result-shape logic scripts/sales_simulation_grading.test.mjs proves against must live here (index.ts calls Deno.serve at load time and can't be imported from plain Node).`);
      } else {
        if (!/export function buildSalesSimulationResult/.test(grading)) {
          bad.push(`${GRADING_PATH}: no longer exports buildSalesSimulationResult.`);
        }
        if (!/export function computeAntiCheatSummary/.test(grading)) {
          bad.push(`${GRADING_PATH}: no longer exports computeAntiCheatSummary.`);
        }
      }

      const config = await read(CONFIG_PATH);
      if (config == null) {
        bad.push(`${CONFIG_PATH} is missing`);
      } else {
        const fnBlock = config.match(/\[functions\.submit-sales-simulation\]\s*\n([^\[]*)/);
        if (!fnBlock || !/verify_jwt\s*=\s*true/.test(fnBlock[1])) {
          bad.push(
            `${CONFIG_PATH}: [functions.submit-sales-simulation] must set verify_jwt = true — this endpoint has no ` +
              "anonymous case."
          );
        }
      }

      const migration = await read(MIGRATION_PATH);
      if (migration == null) {
        bad.push(`${MIGRATION_PATH} is missing`);
      } else if (
        !/UPDATE\s+public\.trusted_result_enforcement/i.test(migration) ||
        !/enforced\s*=\s*true/i.test(migration) ||
        !/result_key\s*=\s*'salesSimulationResult'/.test(migration)
      ) {
        bad.push(`${MIGRATION_PATH}: no longer flips trusted_result_enforcement.enforced = true for 'salesSimulationResult'.`);
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
