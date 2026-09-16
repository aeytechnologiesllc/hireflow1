/**
 * Fix: VideoIntroPhase.tsx used to write notes.videoIntroResult,
 * notes[stepId] (the legacy by-id entry), the flat notes.videoIntroUrl key,
 * and applications.phase directly from the candidate's own browser session
 * (a plain `supabase.from("applications").update(...)` call). A candidate
 * could edit any of that in devtools before submitting and be trusted
 * completely — trigger-ava-analysis, autopilot-batch, and the employer
 * sidebar's pending-actions badge all read those fields as evidence.
 *
 * The fix (docs/TRUSTED-RESULTS.md's part-B recipe): VideoIntroPhase.tsx now
 * uploads the recording and calls the service-role edge function
 * complete-video-intro, which verifies the caller and the uploaded object,
 * then writes notes/phase through
 * supabase/functions/_shared/trustedResults.ts's recordStepResult. A
 * migration flips public.trusted_result_enforcement's 'videoIntroResult' row
 * to enforced = true, so the database itself now refuses a candidate's own
 * direct write of any of those fields (see
 * supabase/migrations/20260915140000_trusted_step_results.sql's
 * protect_application_columns()) regardless of what the browser sends.
 *
 * This guard fails if EITHER half regresses: the page starts building a
 * `videoIntroResult`/flat `videoIntroUrl` notes payload client-side again
 * (or stops calling complete-video-intro), or complete-video-intro stops
 * calling recordStepResult with the right shape, or no migration actually
 * flips the 'videoIntroResult' enforcement flag on.
 */
const PAGE_PATH = "src/pages/VideoIntroPhase.tsx";
const FUNCTION_PATH = "supabase/functions/complete-video-intro/index.ts";
const MIGRATIONS_DIR = "supabase/migrations";

export default [
  {
    id: "video-intro-server-write",
    why:
      "VideoIntroPhase.tsx must call the service-role complete-video-intro function instead of writing " +
      "notes.videoIntroResult / notes[stepId] / notes.videoIntroUrl / applications.phase directly from the " +
      "candidate's own browser, complete-video-intro must record that result through recordStepResult with " +
      "the exact shape docs/TRUSTED-RESULTS.md documents, and a migration must actually flip " +
      "videoIntroResult's enforcement flag on — or a candidate can forge their own video-intro completion again.",
    async run({ read, walk }) {
      const bad = [];

      const page = await read(PAGE_PATH);
      if (page == null) {
        bad.push(`${PAGE_PATH} is missing`);
      } else {
        if (/videoIntroResult\s*:\s*\{/.test(page)) {
          bad.push(
            `${PAGE_PATH}: still builds a "videoIntroResult: {...}" object client-side — ` +
              "that shape must be built server-side in complete-video-intro/logic.ts now."
          );
        }
        if (/videoIntroUrl\s*:\s*videoUrl\s*,/.test(page)) {
          bad.push(`${PAGE_PATH}: still writes a flat "videoIntroUrl: videoUrl" notes entry client-side.`);
        }
        if (!/functions\.invoke\(\s*["']complete-video-intro["']/.test(page)) {
          bad.push(`${PAGE_PATH}: no longer calls supabase.functions.invoke("complete-video-intro", ...).`);
        }
        if (/from\(\s*["']applications["']\s*\)\s*\.\s*update\(\s*\{[^}]*notes:\s*JSON\.stringify/s.test(page)) {
          bad.push(
            `${PAGE_PATH}: still calls supabase.from("applications").update({ notes: JSON.stringify(...), ... }) directly.`
          );
        }
      }

      const fn = await read(FUNCTION_PATH);
      if (fn == null) {
        bad.push(`${FUNCTION_PATH} is missing`);
      } else {
        if (!/recordStepResult\s*\(/.test(fn)) {
          bad.push(`${FUNCTION_PATH}: does not call recordStepResult.`);
        }
        if (!/resultKey:\s*["']videoIntroResult["']/.test(fn)) {
          bad.push(`${FUNCTION_PATH}: does not pass resultKey: "videoIntroResult" to recordStepResult.`);
        }
        if (!/legacyStepEntry/.test(fn)) {
          bad.push(`${FUNCTION_PATH}: does not pass legacyStepEntry to recordStepResult.`);
        }
        if (!/extraNotesEntries:\s*\{\s*videoIntroUrl/.test(fn)) {
          bad.push(
            `${FUNCTION_PATH}: does not pass extraNotesEntries: { videoIntroUrl } to recordStepResult — ` +
              "autopilot-batch/index.ts:129 and usePendingActionsCount.ts:77 read that flat key exclusively."
          );
        }
        if (!/getUser\s*\(/.test(fn)) {
          bad.push(`${FUNCTION_PATH}: does not resolve the caller's identity from their own JWT (auth.getUser()).`);
        }
      }

      // Some migration must actually flip the flag on — not just declare
      // the row (the foundation migration already seeds it enforced = false).
      const migrationFiles = (await walk(MIGRATIONS_DIR, [".sql"])).sort();
      let flipped = false;
      for (const rel of migrationFiles) {
        const text = await read(rel);
        if (
          text &&
          /result_key\s*=\s*'videoIntroResult'/.test(text) &&
          /SET\s+enforced\s*=\s*true/i.test(text)
        ) {
          flipped = true;
          break;
        }
      }
      if (!flipped) {
        bad.push(
          `No migration under ${MIGRATIONS_DIR} sets ` +
            "trusted_result_enforcement.enforced = true WHERE result_key = 'videoIntroResult'."
        );
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
