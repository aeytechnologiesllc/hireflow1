/**
 * `candidate_id <> auth.uid()` is NULL for a signed-out caller, and an IF on
 * NULL never raises. That let anyone with an application id submit a
 * candidate's quiz or end their voice interview (fixed 2026-09-16 in
 * supabase/migrations/20260916210000_null_safe_candidate_ownership_checks.sql,
 * proven in scripts/null_safe_candidate_checks.pglite.test.mjs).
 *
 * This guard fails if ANY migration outside the historic allowlist writes a
 * NULL-unsafe ownership check against auth.uid(), or if the fix stops revoking
 * anon. An allowlist, not "files named after the fix": a branch cut before the
 * fix can carry a migration whose name sorts earlier but gets applied later,
 * and that is exactly the migration that would reopen the hole.
 */
const FIX = "supabase/migrations/20260916210000_null_safe_candidate_ownership_checks.sql";
// Already applied, and superseded by FIX. Never add a new file here.
const HISTORIC = new Set([
  "20260915110000_quiz_answer_keys_server_side.sql",
  "20260916150700_enforce_voice_interview_result.sql",
  "20260916210000_null_safe_candidate_ownership_checks.sql",
]);

export default [
  {
    id: "null-safe-candidate-ownership-checks",
    why:
      "Compare a row owner to auth.uid() with IS DISTINCT FROM (or require auth.uid() IS NOT NULL first). " +
      "`x <> auth.uid()` and `NOT (x = auth.uid())` are NULL for a signed-out caller, so an IF on them never raises.",
    async run({ read, walk }) {
      const bad = [];
      const fix = (await read(FIX)) ?? "";
      if (!fix) return { ok: false, detail: [`${FIX} is missing`] };
      if (!/IS DISTINCT FROM auth\.uid\(\)/.test(fix)) bad.push("the fix no longer switches the check to IS DISTINCT FROM");
      for (const fn of ["submit_quiz_attempt", "submit_voice_interview_manual_end"]) {
        if (!new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon`).test(fix)) {
          bad.push(`the fix no longer revokes EXECUTE on ${fn} from PUBLIC and anon`);
        }
      }
      const files = (await walk("supabase/migrations", [".sql"])).sort();
      const unsafe = /\bIF\s+(NOT\s*\(?\s*)?[\w.]+\s*(<>|!=)\s*auth\.uid\(\)|\bIF\s+NOT\s*\(?\s*[\w.]+\s*=\s*auth\.uid\(\)|\bIF\s+auth\.uid\(\)\s*(<>|!=)/i;
      for (const f of files) {
        if (HISTORIC.has(path(f))) continue;
        const sql = (await read(f)) ?? "";
        sql.split("\n").forEach((line, i) => {
          if (unsafe.test(line) && !/^\s*--/.test(line)) bad.push(`${f}:${i + 1}: ${line.trim()}`);
        });
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];

function path(f) {
  return f.split("/").pop();
}
