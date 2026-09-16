/**
 * Fix: VideoIntroPhase.tsx:390 writes a fourth, flat top-level notes key —
 * `notes.videoIntroUrl` — alongside `notes.videoIntroResult` and
 * `notes[stepId]`. Two live, actively-wired readers key off that flat
 * string EXCLUSIVELY, never `videoIntroResult`:
 *
 *   - supabase/functions/autopilot-batch/index.ts:129
 *     (`case "video_intro": case "video_message": return !!parsedNotes.videoIntroUrl;`)
 *   - src/hooks/usePendingActionsCount.ts:77 (the employer sidebar's
 *     pending-actions badge)
 *
 * Before this fix, `trustedResults.ts`'s `recordStepResult` /
 * `mergeTrustedNotes` had no mechanism to write that key at all — a part-B
 * conversion of VideoIntroPhase to call `recordStepResult` exactly as
 * documented would silently stop writing `notes.videoIntroUrl` forever,
 * making autopilot-batch's stall catch-up and the employer pending-actions
 * count both go stale for every candidate who submits a video intro through
 * the new server path.
 *
 * A second half of the same gap: even with a write mechanism, if the
 * migration's `protect_application_columns()` guard didn't fold
 * `notes.videoIntroUrl` into the SAME `videoIntroResult` enforcement flag, a
 * candidate could keep forging that flat key by hand — via direct
 * `notes = {...}` writes bypassing `recordStepResult` — even after
 * `videoIntroResult` itself is enforced, defeating the point of enforcing it
 * at all for those two readers.
 *
 * This guard fails if EITHER half regresses: the `extraNotesEntries`
 * mechanism disappears from `trustedResults.ts`'s `RecordStepResultInput` /
 * `mergeTrustedNotes`, or the migration's `trusted_result_key_for` stops
 * mapping `videoIntroUrl` (any casing) to `'videoIntroResult'`.
 */
const TRUSTED_RESULTS_PATH = "supabase/functions/_shared/trustedResults.ts";
const MIGRATION_PATH = "supabase/migrations/20260915140000_trusted_step_results.sql";

export default [
  {
    id: "trusted-results-video-intro-url",
    why:
      "recordStepResult must reproduce VideoIntroPhase's flat notes.videoIntroUrl key " +
      "(autopilot-batch/index.ts:129 and usePendingActionsCount.ts:77 read it exclusively), " +
      "and that key must be protected under the SAME videoIntroResult enforcement flag once flipped, " +
      "or a part-B video_intro conversion silently breaks both readers / leaves the flat key forgeable.",
    async run({ read }) {
      const bad = [];

      const trustedResults = await read(TRUSTED_RESULTS_PATH);
      if (trustedResults == null) {
        bad.push(`${TRUSTED_RESULTS_PATH} is missing`);
      } else {
        if (!/extraNotesEntries\s*\?:\s*Record<string,\s*unknown>/.test(trustedResults)) {
          bad.push(
            `${TRUSTED_RESULTS_PATH}: RecordStepResultInput no longer declares an ` +
              `"extraNotesEntries?: Record<string, unknown>" field — VideoIntroPhase's flat ` +
              "notes.videoIntroUrl key (and any future phase's similar stray key) has no way to be written."
          );
        }
        if (!/\.\.\.\(input\.extraNotesEntries\s*\?\?\s*\{\}\)/.test(trustedResults)) {
          bad.push(
            `${TRUSTED_RESULTS_PATH}: mergeTrustedNotes's merged object no longer spreads ` +
              "...(input.extraNotesEntries ?? {}) — extraNotesEntries is declared but never actually written into notes."
          );
        }
      }

      const migration = await read(MIGRATION_PATH);
      if (migration == null) {
        bad.push(`${MIGRATION_PATH} is missing`);
      } else {
        const fnMatch = migration.match(
          /CREATE OR REPLACE FUNCTION public\.trusted_result_key_for[\s\S]*?\$function\$;/
        );
        if (!fnMatch) {
          bad.push(`${MIGRATION_PATH}: could not find the trusted_result_key_for function body`);
        } else {
          const fnBody = fnMatch[0];
          const mapsVideoIntroUrl =
            /lower\(p_key\)\s*=\s*lower\('videoIntroUrl'\)/.test(fnBody) &&
            /THEN\s+'videoIntroResult'/.test(fnBody);
          if (!mapsVideoIntroUrl) {
            bad.push(
              `${MIGRATION_PATH}: trusted_result_key_for no longer maps 'videoIntroUrl' (any casing) to ` +
                "'videoIntroResult' — once videoIntroResult is enforced, a candidate could still forge " +
                "notes.videoIntroUrl directly, since protected_trusted_result_notes_subset would never see it."
          );
          }
        }
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
