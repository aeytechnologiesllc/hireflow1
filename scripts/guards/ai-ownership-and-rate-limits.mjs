/**
 * ai-shortlist and ai-analyze had no ownership check tying the caller to the
 * job/application whose data they were about to spend OpenAI credits
 * analyzing, and no rate limit:
 *
 *   - ai-shortlist checked only `auth.getUser()` (any signed-in account, not
 *     necessarily anyone related to the job) and then trusted the client's
 *     `applications` array wholesale — scores, notes, PII — straight into
 *     the prompt. Fixed by loading the job and its applications server-side
 *     (supabase/functions/ai-shortlist/index.ts) and gating on
 *     canAccessJobPipeline() from ../_shared/aiAccess.ts.
 *   - ai-analyze had no Authorization read or getUser() at all — it relied
 *     on the platform's verify_jwt=true, which only checks that the bearer
 *     token is a validly-signed Supabase JWT. The public anon key is itself
 *     one, so any unauthenticated caller could run any analysis "type" with
 *     arbitrary attacker-supplied content. Fixed by requiring a real
 *     auth.getUser() identity (or the service-role key, for the one trusted
 *     internal caller, trigger-ava-analysis) and mapping every "type" to who
 *     may call it via isAiAnalyzeCallAuthorized().
 *
 * Both now also call a per-user rate limit (guardAuthenticatedAiCall, added
 * to ../_shared/rateLimit.ts alongside the existing per-IP
 * guardPublicAiCall) before doing any of that work.
 *
 * The authorization *decisions* (given ownership/role facts, who's allowed)
 * are pure functions in supabase/functions/_shared/aiAccess.ts, proven
 * directly under plain Node in scripts/ai_ownership_access.test.mjs — these
 * guards are cheaper static checks that the two edge functions actually wire
 * those decisions in, not a substitute for that test.
 */

export default [
  {
    id: "ai-shortlist-checks-job-ownership-server-side",
    why:
      "ai-shortlist must resolve the job (and reject with 403 when the caller isn't its " +
      "owner, an active can_manage_pipeline team member, or a developer) before it spends " +
      "OpenAI credits ranking that job's applicants — otherwise any signed-in account could " +
      "shortlist any job's pipeline just by knowing its id.",
    run: async ({ read }) => {
      const src = (await read("supabase/functions/ai-shortlist/index.ts")) ?? "";
      const bad = [];
      if (!/from\s+["']\.\.\/_shared\/aiAccess\.ts["']/.test(src)) {
        bad.push("ai-shortlist/index.ts no longer imports from ../_shared/aiAccess.ts");
      }
      if (!/canAccessJobPipeline\(/.test(src)) {
        bad.push("ai-shortlist/index.ts no longer calls canAccessJobPipeline()");
      }
      if (!/status:\s*403/.test(src)) {
        bad.push("ai-shortlist/index.ts no longer returns a 403 for an unauthorized caller");
      }
      // The whole point: applicant rows fed to the model must come from a
      // server-side `.from("applications")` lookup, not straight from the
      // client's own JSON body.
      if (!/\.from\(["']applications["']\)/.test(src)) {
        bad.push('ai-shortlist/index.ts no longer loads applications via .from("applications")');
      }
      if (/const\s*\{\s*jobId,\s*jobTitle,\s*jobDescription,\s*applications\s*\}\s*=\s*await req\.json\(\)/.test(src)) {
        bad.push("ai-shortlist/index.ts went back to trusting the client's applications array directly");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "ai-analyze-requires-a-real-caller-identity",
    why:
      "ai-analyze must read Authorization and resolve a real caller (auth.getUser(), or the " +
      "service-role key for the one trusted internal caller) instead of relying on the " +
      "platform's verify_jwt=true, which the public anon key alone satisfies with no signed-in " +
      "user behind it.",
    run: async ({ read }) => {
      const src = (await read("supabase/functions/ai-analyze/index.ts")) ?? "";
      const bad = [];
      if (!/auth\.getUser\(\)/.test(src)) {
        bad.push("ai-analyze/index.ts no longer calls auth.getUser()");
      }
      if (!/SUPABASE_SERVICE_ROLE_KEY/.test(src)) {
        bad.push("ai-analyze/index.ts no longer distinguishes the service-role caller");
      }
      if (!/status:\s*401/.test(src)) {
        bad.push("ai-analyze/index.ts no longer returns 401 for a missing/invalid caller identity");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "ai-analyze-maps-every-type-to-an-authorization-check",
    why:
      "ai-analyze must run every request through isAiAnalyzeCallAuthorized() (../_shared/aiAccess.ts) " +
      "— resume/application locked to the service role, interview/job-bias/phase requiring the " +
      "caller to own or manage the referenced job's pipeline — and reject with 403 otherwise, or " +
      "any authenticated account can run any analysis type against arbitrary content.",
    run: async ({ read }) => {
      const src = (await read("supabase/functions/ai-analyze/index.ts")) ?? "";
      const bad = [];
      if (!/from\s+["']\.\.\/_shared\/aiAccess\.ts["']/.test(src)) {
        bad.push("ai-analyze/index.ts no longer imports from ../_shared/aiAccess.ts");
      }
      if (!/isAiAnalyzeCallAuthorized\(/.test(src)) {
        bad.push("ai-analyze/index.ts no longer calls isAiAnalyzeCallAuthorized()");
      }
      if (!/resolveJobAccessFacts\(/.test(src)) {
        bad.push("ai-analyze/index.ts no longer resolves job/application ownership facts server-side");
      }
      if (!/status:\s*403/.test(src)) {
        bad.push("ai-analyze/index.ts no longer returns a 403 for an unauthorized analysis request");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "ai-shortlist-and-ai-analyze-are-rate-limited-per-user",
    why:
      "Both functions require a signed-in caller now, so they should cap spend per user id " +
      "(guardAuthenticatedAiCall), not fall back to no limit at all the way an authenticated-only " +
      "endpoint would if it just skipped rate limiting entirely.",
    run: async ({ read }) => {
      const bad = [];
      const rateLimit = (await read("supabase/functions/_shared/rateLimit.ts")) ?? "";
      if (!/export async function guardAuthenticatedAiCall/.test(rateLimit)) {
        bad.push("_shared/rateLimit.ts no longer exports guardAuthenticatedAiCall()");
      }

      const shortlist = (await read("supabase/functions/ai-shortlist/index.ts")) ?? "";
      if (!/guardAuthenticatedAiCall\(/.test(shortlist)) {
        bad.push("ai-shortlist/index.ts no longer calls guardAuthenticatedAiCall()");
      }

      const analyze = (await read("supabase/functions/ai-analyze/index.ts")) ?? "";
      if (!/guardAuthenticatedAiCall\(/.test(analyze)) {
        bad.push("ai-analyze/index.ts no longer calls guardAuthenticatedAiCall()");
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
