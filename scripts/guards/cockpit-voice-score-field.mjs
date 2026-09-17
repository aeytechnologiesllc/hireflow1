/**
 * The employer cockpit's Voice score read voice_interview_result.overallScore
 * and .score, but every writer stores snake_case overall_score (the
 * end_interview tool schema in supabase/functions/ava-voice-session and
 * submit_voice_interview_manual_end), so the tile was always empty
 * (found 2026-09-16). Keep the reader on the field the writers actually use.
 */
export default [
  {
    id: "cockpit-voice-score-reads-overall_score",
    why:
      "src/cockpit/lib/mappers.ts extractVoiceScore must read voice_interview_result.overall_score, the field " +
      "ava-voice-session's end_interview tool requires and the manual-end RPC writes.",
    async run({ read }) {
      const bad = [];
      const mappers = (await read("src/cockpit/lib/mappers.ts")) ?? "";
      const fn = (mappers.match(/function extractVoiceScore\([\s\S]*?\n}/) ?? [""])[0];
      if (!fn) bad.push("extractVoiceScore is missing from src/cockpit/lib/mappers.ts");
      else if (!/\.overall_score\b/.test(fn)) bad.push("extractVoiceScore no longer reads overall_score");
      const session = (await read("supabase/functions/ava-voice-session/index.ts")) ?? "";
      if (session && !/overall_score:\s*\{\s*type:\s*"number"/.test(session)) {
        bad.push("ava-voice-session's end_interview schema no longer names overall_score; update extractVoiceScore to match");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
