/**
 * Fix: src/pages/VoiceInterviewPhase.tsx used to write
 * applications.voice_interview_transcript (and phase_ai_analysis) straight
 * from the candidate's own browser session, after voice_interview_result had
 * already been recorded server-side. That direct write starts getting
 * blocked by protect_application_columns() the moment
 * 'voiceInterviewResult' is enforced (supabase/migrations/
 * 20260916150700_enforce_voice_interview_result.sql) — see
 * docs/TRUSTED-RESULTS.md's "voice_interview is special" section.
 *
 * The fix moved that write into a new "record_interview_transcript" case in
 * supabase/functions/ava-voice-tools/index.ts: a service-role edge function
 * path that re-reads voice_interview_result fresh (never trusts a client
 * copy), refuses to run before an evaluation exists or after a transcript is
 * already on file, calls trustedResults.ts's recordStepResult with
 * resultKey "voiceInterviewResult", and only then saves the transcript. Both
 * the Ava-ended path (ava-voice-tools' own "end_interview" case) and the
 * manual-end/connection-lost fallback (submit_voice_interview_manual_end,
 * extended by the same migration to stop writing the transcript itself) now
 * go through this one finalize call.
 *
 * This guard fails if any of those pieces regress:
 *   - VoiceInterviewPhase.tsx still writes voice_interview_transcript via a
 *     plain `.from("applications").update(...)` candidate-side call instead
 *     of calling the edge function.
 *   - VoiceInterviewPhase.tsx no longer calls the
 *     "record_interview_transcript" tool.
 *   - ava-voice-tools/index.ts's "record_interview_transcript" case stops
 *     calling recordStepResult with resultKey "voiceInterviewResult", or
 *     drops its "already recorded" overwrite guard or its "not evaluated
 *     yet" guard.
 *   - the enforcement migration flips 'phase' (must stay false until every
 *     part-B phase is converted — see docs/TRUSTED-RESULTS.md) instead of
 *     only 'voiceInterviewResult'.
 *   - submit_voice_interview_manual_end's extended body still writes
 *     voice_interview_transcript or phase_ai_analysis itself, which would
 *     make ava-voice-tools' overwrite guard refuse the finalize call for
 *     every manual-ended interview.
 */
const PAGE_PATH = "src/pages/VoiceInterviewPhase.tsx";
const TOOLS_PATH = "supabase/functions/ava-voice-tools/index.ts";
const MIGRATION_PATH = "supabase/migrations/20260916150700_enforce_voice_interview_result.sql";

export default [
  {
    id: "enforce-voice-interview-result",
    why:
      "VoiceInterviewPhase.tsx must no longer write voice_interview_transcript/phase_ai_analysis " +
      "directly from the browser — ava-voice-tools' record_interview_transcript case (recordStepResult, " +
      "resultKey voiceInterviewResult) must do it server-side, for both the Ava-ended and manual-end paths, " +
      "or the interview-end flow breaks the moment voiceInterviewResult is enforced.",
    async run({ read }) {
      const bad = [];

      const page = await read(PAGE_PATH);
      if (page == null) {
        bad.push(`${PAGE_PATH} is missing`);
      } else {
        if (/voice_interview_transcript\s*:/.test(page)) {
          bad.push(
            `${PAGE_PATH} still assigns voice_interview_transcript directly — this must be written ` +
              "server-side by ava-voice-tools' record_interview_transcript case, not from the candidate's own session."
          );
        }
        if (!/tool_name:\s*["']record_interview_transcript["']/.test(page)) {
          bad.push(`${PAGE_PATH} no longer calls the "record_interview_transcript" tool on interview end.`);
        }
      }

      const tools = await read(TOOLS_PATH);
      if (tools == null) {
        bad.push(`${TOOLS_PATH} is missing`);
      } else {
        const caseMatch = tools.match(
          /case ["']record_interview_transcript["']:\s*\{[\s\S]*?\n {6}\}\n/
        );
        if (!caseMatch) {
          bad.push(`${TOOLS_PATH}: could not find the "record_interview_transcript" case body`);
        } else {
          const body = caseMatch[0];
          if (!/import\s*\{[^}]*\brecordStepResult\b[^}]*\}\s*from\s*["']\.\.\/_shared\/trustedResults\.ts["']/.test(tools)) {
            bad.push(`${TOOLS_PATH}: no longer imports recordStepResult from _shared/trustedResults.ts`);
          }
          if (!/resultKey:\s*["']voiceInterviewResult["']/.test(body)) {
            bad.push(`${TOOLS_PATH}: "record_interview_transcript" no longer calls recordStepResult with resultKey "voiceInterviewResult"`);
          }
          if (!/stepType:\s*["']voice_interview["']/.test(body)) {
            bad.push(`${TOOLS_PATH}: "record_interview_transcript" no longer passes stepType "voice_interview" to recordStepResult`);
          }
          if (!/ownerCheck\.voice_interview_transcript/.test(body)) {
            bad.push(
              `${TOOLS_PATH}: "record_interview_transcript" dropped its overwrite guard — a candidate could ` +
                "call it twice to replace a real transcript with a forged one."
            );
          }
          if (!/if\s*\(!ownerCheck\.voice_interview_result\)/.test(body)) {
            bad.push(
              `${TOOLS_PATH}: "record_interview_transcript" dropped its "not evaluated yet" guard — a candidate ` +
                "could record a transcript before any real evaluation exists."
            );
          }
          if (!/candidate_id\s*!==\s*user\.id/.test(body)) {
            bad.push(`${TOOLS_PATH}: "record_interview_transcript" dropped its caller-is-candidate check.`);
          }
        }
      }

      const migration = await read(MIGRATION_PATH);
      if (migration == null) {
        bad.push(`${MIGRATION_PATH} is missing`);
      } else {
        if (!/WHERE result_key = 'voiceInterviewResult'/.test(migration)) {
          bad.push(`${MIGRATION_PATH}: no longer flips the 'voiceInterviewResult' enforcement row.`);
        }
        if (/WHERE result_key = 'phase'/.test(migration)) {
          bad.push(
            `${MIGRATION_PATH}: flips the 'phase' enforcement row — that must stay false until every ` +
              "part-B phase conversion has landed (docs/TRUSTED-RESULTS.md)."
          );
        }

        const rpcMatch = migration.match(
          /CREATE OR REPLACE FUNCTION public\.submit_voice_interview_manual_end[\s\S]*?\$function\$;/
        );
        if (!rpcMatch) {
          bad.push(`${MIGRATION_PATH}: could not find the extended submit_voice_interview_manual_end body`);
        } else {
          const rpcBody = rpcMatch[0];
          if (/voice_interview_transcript\s*=/.test(rpcBody)) {
            bad.push(
              `${MIGRATION_PATH}: submit_voice_interview_manual_end still writes voice_interview_transcript ` +
                "itself — the record_interview_transcript finalize call would then refuse every manual-ended " +
                "interview's transcript (its overwrite guard sees one already on file)."
            );
          }
          if (/phase_ai_analysis\s*=\s*evaluation/.test(rpcBody)) {
            bad.push(
              `${MIGRATION_PATH}: submit_voice_interview_manual_end still writes phase_ai_analysis itself — ` +
                "that must come from the same finalize call as the Ava-ended path now."
            );
          }
          if (!/app\.voice_interview_result IS NOT NULL/.test(rpcBody)) {
            bad.push(`${MIGRATION_PATH}: submit_voice_interview_manual_end dropped its "already evaluated" guard.`);
          }
        }
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
