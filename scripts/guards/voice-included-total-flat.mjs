/**
 * get_job_billing_status()'s voice_included_total column must always be the
 * SAME flat, per-job constant that job_voice_interview_is_billable() itself
 * enforces as the free-interview threshold — never multiplied by how many
 * times the job has been unlocked.
 *
 * Regression this guards: 20260916160000_job_billing_schema.sql originally
 * computed voice_included_total as `10 * greatest(1, job_unlock_count(job))`,
 * while job_voice_interview_is_billable() (same file) and its JS twin
 * isNextVoiceInterviewBillable() (_shared/jobBillingPricing.ts,
 * UNLOCK_INCLUDED_VOICE_INTERVIEWS = 10) both cap free voice interviews at a
 * FLAT 10 per job, forever — per the migration's own header comment ("10
 * included per job, counted cumulatively from the job's first unlock
 * onward"). A job unlocked a second time (job_unlock_count=2, which
 * unlock-job-checkout allows — there is no guard against re-unlocking, and
 * the header comment describes re-unlocking after the window lapses as the
 * intended way to buy more capacity) would report voice_included_total=20 to
 * the employer while the very next interview past #10 is still charged $2 —
 * a wrong balance shown to a paying customer. Runtime proof of the same
 * thing lives in scripts/job_billing_schema.pglite.test.mjs ("voice_included
 * _total stays flat across a second unlock"); this is the cheap static
 * backstop so the multiplication can't quietly come back.
 */

const MIGRATION = "supabase/migrations/20260916160000_job_billing_schema.sql";

export default [
  {
    id: "voice-included-total-matches-flat-billable-threshold",
    why:
      "get_job_billing_status()'s voice_included_total must be the exact same bare, flat constant that " +
      "job_voice_interview_is_billable() compares job_voice_interviews_used() against — not multiplied by " +
      "job_unlock_count or anything else — or the UI tells the employer a different number of free voice " +
      "interviews remain than the billing code actually honors.",
    run: async ({ read }) => {
      const src = await read(MIGRATION);
      if (src == null) return { ok: false, detail: [`${MIGRATION} is missing`] };
      const bad = [];

      const thresholdMatch = src.match(/job_voice_interviews_used\(p_job_id\)\s*>=\s*(\d+)/);
      if (!thresholdMatch) {
        bad.push("could not find job_voice_interview_is_billable()'s `job_voice_interviews_used(p_job_id) >= N` threshold — check this guard still matches the function");
        return { ok: false, detail: bad };
      }
      const threshold = thresholdMatch[1];

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

      if (code !== `${threshold},`) {
        bad.push(
          `voice_included_total's expression is \`${code || "(empty)"}\`, not the bare flat constant \`${threshold},\` that ` +
          `job_voice_interview_is_billable()'s own threshold uses — if this multiplies by job_unlock_count (or anything else), ` +
          "a re-unlocked job will show a free-interview balance that contradicts what actually gets charged",
        );
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
