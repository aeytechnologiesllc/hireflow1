/**
 * supabase/functions/ai-generate-performance-report/index.ts read
 * `applicationId` straight from the request body and loaded the full
 * application (voice transcript, notes, ai_analysis) with the service-role
 * client, with no check of who was calling -- only `verify_jwt=true` at the
 * platform level, which just requires *some* valid JWT, not any relationship
 * to the application. Any signed-in user could POST an arbitrary
 * applicationId and read a stranger's private evaluation, and candidates
 * could get the paid Improvement Blueprint (src/hooks/useImprovementBlueprint.ts,
 * gated client-side only by a `blueprint_purchases` row) for free by calling
 * the function directly.
 *
 * Fixed in supabase/functions/ai-generate-performance-report/index.ts: the
 * Authorization header is now required, resolved via auth.getUser(), and the
 * caller must be either (a) the application's candidate with a completed
 * blueprint_purchases row for that applicationId, or (b) the job's employer
 * or an active team member of that employer -- all before the full
 * application row (or OpenAI) is touched. A shared per-user rate limit
 * (guardPublicAiCall, keyed by the authenticated user id) caps abuse.
 *
 * The authorization decision itself lives in
 * supabase/functions/_shared/performanceReportAccess.ts (no Deno-only
 * imports, so it's unit-tested with plain node at
 * scripts/performance_report_access.test.mjs -- run directly:
 * `node scripts/performance_report_access.test.mjs`); these are cheap static
 * checks over the source, not a substitute for that test.
 */

const FN = "supabase/functions/ai-generate-performance-report/index.ts";
const ACCESS_FN = "supabase/functions/_shared/performanceReportAccess.ts";

export default [
  {
    id: "performance-report-requires-authenticated-caller",
    why:
      `${FN} must reject requests with no/invalid auth token before touching the DB -- ` +
      "without this, applicationId alone is enough to pull a stranger's report.",
    run: async ({ read }) => {
      const src = await read(FN);
      if (!src) return { ok: false, detail: [`${FN} not found`] };
      const bad = [];
      if (!/req\.headers\.get\(['"]authorization['"]\)/i.test(src)) {
        bad.push("no read of the Authorization header");
      }
      if (!/auth\.getUser\(\)/.test(src)) {
        bad.push("no auth.getUser() call to resolve the caller");
      }
      // The auth check must run before the full application row is fetched
      // (the one selecting voice_interview_transcript / ai_analysis).
      const authIdx = src.indexOf("auth.getUser()");
      const fullFetchIdx = src.indexOf("voice_interview_transcript");
      if (authIdx === -1 || fullFetchIdx === -1 || authIdx > fullFetchIdx) {
        bad.push("auth.getUser() must run before the full application row (with voice_interview_transcript) is fetched");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "performance-report-authorization-decision-present",
    why:
      `${FN} must gate on candidate-with-purchase OR employer-side, via a testable decision function -- ` +
      "without it, an authenticated stranger (or a candidate who never paid) still gets the report.",
    run: async ({ read }) => {
      const src = await read(FN);
      const accessSrc = await read(ACCESS_FN);
      if (!src) return { ok: false, detail: [`${FN} not found`] };
      if (!accessSrc) return { ok: false, detail: [`${ACCESS_FN} not found`] };
      const bad = [];
      if (!/canAccessPerformanceReport/.test(src)) {
        bad.push(`${FN} no longer imports/calls canAccessPerformanceReport(...)`);
      }
      if (!/function\s+canAccessPerformanceReport/.test(accessSrc)) {
        bad.push(`${ACCESS_FN} missing exported canAccessPerformanceReport(...) decision function`);
      }
      if (!/isEmployerSide\)\s*return\s*true/.test(accessSrc)) {
        bad.push("canAccessPerformanceReport no longer grants employer-side callers");
      }
      if (!/isCandidateOwner\s*&&\s*hasPurchasedBlueprint\)\s*return\s*true/.test(accessSrc)) {
        bad.push("canAccessPerformanceReport no longer requires hasPurchasedBlueprint for the candidate path");
      }
      if (!/blueprint_purchases/.test(src)) {
        bad.push("no blueprint_purchases lookup -- candidate path isn't gated on payment");
      }
      if (!/is_active_team_member_for_job/.test(src)) {
        bad.push(
          "no is_active_team_member_for_job(...) call -- employer-side access must be scoped to THIS " +
          "job the same way the live RLS policy on applications scopes it (assigned_job_ids), not a " +
          "plain team_members row check by employer_id alone"
        );
      }
      if (/\.from\(['"]team_members['"]\)/.test(src)) {
        bad.push(
          "querying team_members directly re-implements the job-scoping rule and risks missing " +
          "assigned_job_ids -- call the is_active_team_member_for_job(...) RPC (same function the " +
          "applications RLS policy uses) instead"
        );
      }
      if (!/canAccessPerformanceReport\(/.test(src.slice(src.indexOf("blueprint_purchases")))) {
        bad.push("canAccessPerformanceReport(...) is not called after the ownership lookups");
      }
      if (!/status:\s*403/.test(src)) {
        bad.push("unauthorized callers must get a 403, not a silent pass-through");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "performance-report-rate-limited-per-user",
    why:
      `${FN} must call guardPublicAiCall keyed by the authenticated user id -- otherwise a paid, ` +
      "signed-in-only OpenAI call has no abuse cap once auth is added.",
    run: async ({ read }) => {
      const src = await read(FN);
      if (!src) return { ok: false, detail: [`${FN} not found`] };
      const bad = [];
      if (!/guardPublicAiCall\(/.test(src)) {
        bad.push("no guardPublicAiCall(...) rate-limit guard");
      }
      if (!/guardPublicAiCall\([\s\S]*?requestingUser\.id/.test(src)) {
        bad.push("guardPublicAiCall(...) is not keyed by requestingUser.id");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
