/**
 * public.published_jobs_public dropped jobs.benefits entirely (confirmed
 * live 2026-09-16), even though jobs.benefits is plain employer-authored
 * posting text — the same kind of content as description/responsibilities —
 * and src/pages/JobDetails.tsx already had a Benefits section gated on
 * `job.benefits` that could therefore never render. Separately, the primary
 * Ava create-job flow (src/pages/AvaCreateJob.tsx -> src/lib/jobFromFlow.ts)
 * collected brief.benefits but never wrote it to jobs.benefits at all — a
 * benefit spoken or typed to Ava was captured, then silently dropped at the
 * mapJobBriefToFormPayload handoff (src/lib/avaEngine/jobBrief.ts), long
 * before jobFromFlow.ts ever built the insert row.
 *
 * Two ways this regresses, each checked below:
 *   1. supabase/migrations/20260916200000_published_jobs_public_benefits.sql
 *      stops selecting `j.benefits` while JobDetails.tsx (or ApplyWithCode.tsx)
 *      still renders a Benefits section reading it — the section goes dark
 *      again with no visible error.
 *   2. src/lib/jobFromFlow.ts stops writing `benefits` into the `jobs` insert
 *      row — Ava-created jobs quietly stop persisting benefits even though
 *      the classic CreateJob.tsx / GuestJobCreator.tsx paths still do.
 */
export default [
  {
    id: "published-jobs-public-exposes-benefits",
    why:
      "supabase/migrations/20260916200000_published_jobs_public_benefits.sql must keep selecting " +
      "j.benefits as the last column of published_jobs_public — src/pages/JobDetails.tsx's Benefits " +
      "section (and ApplyWithCode.tsx's compact benefits line) read it from this exact view and would " +
      "silently stop rendering with no error if the column were dropped again.",
    async run({ read }) {
      const MIGRATION = "supabase/migrations/20260916200000_published_jobs_public_benefits.sql";
      const sql = await read(MIGRATION);
      if (sql == null) return { ok: false, detail: [`${MIGRATION} is missing`] };
      const bad = [];

      const m = sql.match(
        /create or replace view public\.published_jobs_public as[\s\S]*?;\s*\n\s*grant select on public\.published_jobs_public/i
      );
      if (!m) {
        bad.push("published_jobs_public view definition not found or unrecognisably reshaped in the migration");
        return { ok: false, detail: bad };
      }
      const body = m[0];

      if (!/,\s*j\.benefits\s*\n?\s*from\s+public\.jobs\s+j/i.test(body)) {
        bad.push("the view no longer selects j.benefits as the column immediately before `from public.jobs j` — benefits would stop being exposed");
      }
      // Same row filter and column-safety invariants the prior migration's guard checks —
      // re-verified here because this migration replaces the whole view body verbatim.
      if (!/where\s+j\.status\s*=\s*'published'::job_status/i.test(body)) {
        bad.push("the view no longer filters on status = 'published'::job_status");
      }
      if (!/not\s+j\.exclude_from_feed\s+or\s+j\.employer_id\s*=\s*auth\.uid\(\)/i.test(body)) {
        bad.push("the view no longer requires (NOT exclude_from_feed OR employer_id = auth.uid())");
      }
      if (/select\s+\*\s+from\s+(public\.)?jobs/i.test(body)) {
        bad.push("the view selects `*` from jobs — internal columns would leak");
      }

      const jobDetails = await read("src/pages/JobDetails.tsx");
      if (jobDetails != null && !/job\.benefits/.test(jobDetails)) {
        bad.push("src/pages/JobDetails.tsx no longer reads job.benefits — if this is intentional, this guard's premise (a live consumer of the column) needs updating too");
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "job-from-flow-writes-benefits",
    why:
      "src/lib/jobFromFlow.ts's createJobFromFlow must keep writing a normalized `benefits` field " +
      "into the `jobs` insert row (sourced from brief.benefits via normalizeBenefits()) — otherwise " +
      "the primary Ava create-job flow silently stops persisting benefits even though the classic " +
      "CreateJob.tsx / GuestJobCreator.tsx paths still do, and a benefit captured by voice or typed " +
      "chat (mergeBriefFromTool -> mapJobBriefToFormPayload -> briefFromForm) is collected for nothing.",
    async run({ read }) {
      const bad = [];
      const src = await read("src/lib/jobFromFlow.ts");
      if (src == null) return { ok: false, detail: ["src/lib/jobFromFlow.ts is missing"] };

      if (!/normalizeBenefits/.test(src)) {
        bad.push("jobFromFlow.ts no longer references normalizeBenefits() — benefits normalization was removed");
      }
      // The insert `row` object must actually carry a benefits key built from brief.benefits.
      const rowMatch = src.match(/const row = \{[\s\S]*?\n {2}\};/);
      if (!rowMatch) {
        bad.push("could not locate the `row` object literal passed to supabase.from(\"jobs\").insert(...) — guard needs updating");
      } else if (!/benefits:\s*normalizeBenefits\(brief\.benefits\)/.test(rowMatch[0])) {
        bad.push("the `jobs` insert row no longer sets benefits: normalizeBenefits(brief.benefits)");
      }

      const jobBenefitsLib = await read("src/lib/jobBenefits.ts");
      if (jobBenefitsLib == null) {
        bad.push("src/lib/jobBenefits.ts is missing — normalizeBenefits() has no implementation");
      }

      // The handoff BriefFormPayload must still carry benefits, or brief.benefits will be
      // empty by the time it reaches jobFromFlow.ts regardless of the write side being intact.
      const jobBrief = await read("src/lib/avaEngine/jobBrief.ts");
      if (jobBrief != null && !/benefits:\s*b\.benefits/.test(jobBrief)) {
        bad.push("mapJobBriefToFormPayload no longer carries `benefits` into BriefFormPayload — Ava-captured benefits would be dropped before jobFromFlow.ts ever sees them");
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
