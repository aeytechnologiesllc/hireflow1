/**
 * get_job_billing_status()'s voice_included_total column and
 * job_voice_interview_is_billable()'s free-interview threshold must both
 * read through the SAME function, job_voice_included_total(p_job_id) — never
 * a bare literal or an inline expression duplicated in two places — so they
 * can never quietly drift apart. And that shared function must scale PER
 * unlock (10 * job_unlock_count), not be pinned to a flat constant.
 *
 * History: this migration (originally filed as
 * 20260916160000_job_billing_schema.sql, renamed to 20260916170000 to run
 * after fix/w1-coaching-report's same-day 20260916160000 migration)
 * first shipped voice_included_total as `10 * greatest(1, job_unlock_count(job))`
 * while job_voice_interview_is_billable() capped free interviews at a flat
 * 10 forever — a wrong balance shown to a paying customer. A later pass
 * "fixed" that by pinning BOTH sides to a flat 10, which was then reviewed
 * and rejected: the decided pricing text is "10 voice interviews included
 * PER UNLOCKED JOB", i.e. per unlock, exactly like the applicant allowance's
 * own +25-per-completed-unlock high-water mark
 * (job_processed_allowance/computeProcessedAllowance). The confirmed
 * (2026-09-16) resolution is job_voice_included_total(job) =
 * 10 * job_unlock_count(job), consumed by both get_job_billing_status() and
 * job_voice_interview_is_billable() so they cannot disagree about how many
 * free interviews remain. Runtime proof lives in
 * scripts/job_billing_schema.pglite.test.mjs (section 6b: first unlock,
 * second unlock, overlapping pack, expiry) and
 * scripts/job_billing_pricing.test.mjs (computeVoiceIncludedTotal /
 * isNextVoiceInterviewBillable); this is the cheap static backstop so
 * either a hardcoded flat constant or a re-duplicated expression can't
 * quietly come back.
 */

const MIGRATION = "supabase/migrations/20260916170000_job_billing_schema.sql";

export default [
  {
    id: "voice-included-total-matches-billable-threshold",
    why:
      "get_job_billing_status()'s voice_included_total and job_voice_interview_is_billable()'s free-interview " +
      "threshold must both call the single shared public.job_voice_included_total(p_job_id) function (10 per " +
      "completed unlock, a high-water mark like the applicant allowance) — not a bare literal, not a re-duplicated " +
      "expression, and not a flat per-job constant — or the UI can tell the employer a different number of free " +
      "voice interviews remain than the billing code actually honors.",
    run: async ({ read }) => {
      const src = await read(MIGRATION);
      if (src == null) return { ok: false, detail: [`${MIGRATION} is missing`] };
      const bad = [];

      const definitionMatch = src.match(
        /CREATE OR REPLACE FUNCTION public\.job_voice_included_total\(p_job_id uuid\)[\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/,
      );
      if (!definitionMatch) {
        bad.push("could not find public.job_voice_included_total(p_job_id) — the shared per-unlock voice allowance function must exist");
        return { ok: false, detail: bad };
      }
      const definitionBody = definitionMatch[1]
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("--"))
        .join(" ");
      if (!/^SELECT\s+10\s*\*\s*public\.job_unlock_count\(p_job_id\);?$/i.test(definitionBody)) {
        bad.push(
          `job_voice_included_total(p_job_id) is defined as \`${definitionBody}\`, not \`SELECT 10 * public.job_unlock_count(p_job_id);\` — ` +
          "10 included interviews must scale per completed unlock (the confirmed 2026-09-16 decision), not be pinned to a flat per-job constant",
        );
      }

      const thresholdMatch = src.match(/job_voice_interviews_used\(p_job_id\)\s*>=\s*([^;]+?);/);
      if (!thresholdMatch) {
        bad.push("could not find job_voice_interview_is_billable()'s `job_voice_interviews_used(p_job_id) >= ...` threshold — check this guard still matches the function");
        return { ok: false, detail: bad };
      }
      const threshold = thresholdMatch[1].trim();
      if (threshold !== "public.job_voice_included_total(p_job_id)") {
        bad.push(
          `job_voice_interview_is_billable()'s threshold is \`${threshold}\`, not \`public.job_voice_included_total(p_job_id)\` -- ` +
          "it must read through the shared function so a re-unlocked job's balance and its actual charging never disagree",
        );
      }

      const startNeedle = "public.job_active_pack_count(p_job_id),";
      const endNeedle = "public.job_voice_interviews_used(p_job_id),";
      const startIdx = src.indexOf(startNeedle);
      const endIdx = src.indexOf(endNeedle);
      if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
        bad.push("could not locate the voice_included_total expression between pack_count and voice_used in get_job_billing_status() — check this guard still matches the function's column order");
        return { ok: false, detail: bad };
      }

      const between = src.slice(startIdx + startNeedle.length, endIdx);
      const code = between
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("--"))
        .join(" ");

      if (code !== "public.job_voice_included_total(p_job_id),") {
        bad.push(
          `voice_included_total's expression in get_job_billing_status() is \`${code || "(empty)"}\`, not \`public.job_voice_included_total(p_job_id),\` -- ` +
          "it must call the same shared function job_voice_interview_is_billable() uses, or a re-unlocked job's shown balance can drift from what actually gets charged",
        );
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
