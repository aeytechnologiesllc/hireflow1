/**
 * C3: public.published_jobs_public (a SECURITY DEFINER view — public.jobs
 * itself has RLS with no anon SELECT policy at all) returned every
 * status='published' row with no exception for exclude_from_feed, the flag
 * that marks a job as internal/QA/demo-only. Live on 2026-09-15, all 40
 * currently-published jobs on this project carry exclude_from_feed = true
 * and belong to known internal accounts — a stranger who opened
 * /candidate/job/:id, or looked one up by job_code through ApplyWithCode,
 * got the full internal posting (description, application/quiz questions,
 * workflow steps), and api/job-prerender.mjs served Google a JobPosting
 * block for it too.
 *
 * The row must now also require NOT exclude_from_feed, UNLESS the caller is
 * the job's own employer (auth.uid() = employer_id) — src/pages/
 * JobDetails.tsx reads this exact view for every viewer, employer included
 * (commit cb2b547, "Let employers see and test their own posting"), with no
 * separate authenticated path, so the exception has to live in the view
 * itself. A regression to a bare `status = 'published'` WHERE (or to
 * `select *` from jobs, which would also re-expose ai_bias_score/
 * ai_bias_feedback/processing_mode/passing_score/workflow_difficulty/
 * required_wpm — none of which any consumer reads) reopens the hole.
 */
export default [
  {
    id: "published-jobs-public-excludes-qa-jobs-from-strangers",
    why:
      "supabase/migrations/20260915130000_public_views_tighten.sql must keep " +
      "published_jobs_public's row filter as status='published' AND (NOT " +
      "exclude_from_feed OR employer_id = auth.uid()) — dropping the second half " +
      "makes every internal QA/test job readable by any stranger with (or " +
      "guessing) its id again, exactly the exposure this migration closed.",
    async run({ read }) {
      const MIGRATION = "supabase/migrations/20260915130000_public_views_tighten.sql";
      const sql = await read(MIGRATION);
      if (sql == null) return { ok: false, detail: [`${MIGRATION} is missing`] };
      const bad = [];

      // Isolate the published_jobs_public view body so an unrelated view
      // below it (employer_public_branding) can't accidentally satisfy this.
      const m = sql.match(
        /create or replace view public\.published_jobs_public as[\s\S]*?;\s*\n\s*grant select on public\.published_jobs_public/i
      );
      if (!m) {
        bad.push("published_jobs_public view definition not found or unrecognisably reshaped in the migration");
        return { ok: false, detail: bad };
      }
      const body = m[0];

      if (!/where\s+j\.status\s*=\s*'published'::job_status/i.test(body)) {
        bad.push("the view no longer filters on status = 'published'::job_status");
      }
      if (!/not\s+j\.exclude_from_feed\s+or\s+j\.employer_id\s*=\s*auth\.uid\(\)/i.test(body)) {
        bad.push(
          "the view no longer requires (NOT exclude_from_feed OR employer_id = auth.uid()) — QA/test jobs are readable by strangers again"
        );
      }
      if (/select\s+\*\s+from\s+(public\.)?jobs/i.test(body)) {
        bad.push("the view selects `*` from jobs again — internal columns (ai_bias_score, quiz/application answer keys, etc.) would leak");
      }
      // Answer-key columns must never appear as bare selected identifiers
      // (jsonb_build_object string literals like 'correct_answer' as a KEY
      // name are fine and expected NOT to appear either, but this guards the
      // more dangerous case of someone adding `j.correct_answer` or
      // `j.fit_context` as a real selected column, or widening quiz_questions/
      // application_questions to `j.quiz_questions` / `j.application_questions`
      // verbatim instead of the redacted jsonb_build_object).
      if (/,\s*j\.quiz_questions\s*,/i.test(body) || /,\s*j\.application_questions\s*,/i.test(body)) {
        bad.push("quiz_questions/application_questions is selected raw instead of through the redacted jsonb_build_object — answer keys would leak");
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
