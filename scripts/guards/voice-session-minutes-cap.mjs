/**
 * deduct-voice-minutes only ever checked that the client-supplied
 * `sessionDurationMinutes` was a positive number — no upper bound, no
 * server-side cross-check against anything real — so a candidate on their
 * own application (the caller in interview mode) could post
 * `sessionDurationMinutes: 999999` and drain the employer's voice_credits
 * in one call.
 *
 * Fixed by:
 *   - supabase/migrations/20260916140000_voice_session_log.sql — a
 *     server-only voice_session_log table (RLS on, zero client policies,
 *     same shape as quiz_attempt_ledger) recording started_at, a
 *     server-computed time_limit_minutes and hard_cap_minutes per session.
 *   - ava-voice-session inserts a row the instant it mints a real OpenAI
 *     session and returns the row's id to the client as `voiceSessionId`.
 *   - deduct-voice-minutes now REQUIRES that voiceSessionId, looks up the
 *     row, and charges min(client minutes, wall-clock elapsed minutes, the
 *     session's time_limit_minutes, its hard_cap_minutes) — never the
 *     client number alone — via the shared, unit-tested
 *     computeChargeMinutes() in supabase/functions/_shared/voiceSessionCharge.ts.
 *   - The charge is settled with a single atomic
 *     `UPDATE ... WHERE ended_at IS NULL RETURNING` so a second call for the
 *     same session (retry, or both the end_interview tool-call path and
 *     disconnect()'s cleanup path firing) deducts nothing.
 *   - useAvaVoice.ts captures the returned voiceSessionId and sends it on
 *     both deduct-voice-minutes call sites; without one, it no longer
 *     calls deduct-voice-minutes at all.
 *
 * These are static text checks over the shipped source — cheap and fast, but
 * not a substitute for the numeric/idempotency proof at
 * scripts/voice_session_charge.test.mjs and the RLS/atomicity proof at
 * scripts/voice_session_log.pglite.test.mjs. Run those directly:
 *   node scripts/voice_session_charge.test.mjs
 *   node scripts/voice_session_log.pglite.test.mjs
 */

const MIGRATION = "supabase/migrations/20260916140000_voice_session_log.sql";
const SHARED = "supabase/functions/_shared/voiceSessionCharge.ts";
const MINT_FN = "supabase/functions/ava-voice-session/index.ts";
const DEDUCT_FN = "supabase/functions/deduct-voice-minutes/index.ts";
const HOOK = "src/hooks/useAvaVoice.ts";

export default [
  {
    id: "voice-session-log-table-server-only",
    why:
      `${MIGRATION} must create voice_session_log with RLS enabled and no client-facing policy ` +
      "(anon/authenticated) -- otherwise a candidate could read or forge started_at/time_limit_minutes " +
      "directly instead of going through ava-voice-session/deduct-voice-minutes.",
    run: async ({ read }) => {
      const sql = await read(MIGRATION);
      if (!sql) return { ok: false, detail: [`${MIGRATION} not found`] };
      const bad = [];
      if (!/CREATE TABLE IF NOT EXISTS public\.voice_session_log/.test(sql)) {
        bad.push("missing CREATE TABLE IF NOT EXISTS public.voice_session_log");
      }
      if (!/ALTER TABLE public\.voice_session_log ENABLE ROW LEVEL SECURITY/.test(sql)) {
        bad.push("voice_session_log never has ROW LEVEL SECURITY enabled");
      }
      if (/CREATE POLICY[\s\S]*?ON public\.voice_session_log/i.test(sql)) {
        bad.push("a CREATE POLICY targets voice_session_log -- this table must stay server-only (service_role bypasses RLS regardless)");
      }
      if (!/started_at\s+timestamptz NOT NULL DEFAULT now\(\)/.test(sql)) {
        bad.push("started_at must default to the server clock (now()), not a client-supplied value");
      }
      if (!/time_limit_minutes\s+integer NOT NULL/.test(sql)) {
        bad.push("missing NOT NULL time_limit_minutes column");
      }
      if (!/hard_cap_minutes\s+integer NOT NULL DEFAULT 60/.test(sql)) {
        bad.push("missing hard_cap_minutes integer NOT NULL DEFAULT 60 column");
      }
      if (!/CHECK \(\(ended_at IS NULL\) = \(minutes_charged IS NULL\)\)/.test(sql)) {
        bad.push("missing the ended_at/minutes_charged settled-together CHECK constraint");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "voice-session-charge-cap-shared-helper",
    why:
      `${SHARED} must export computeChargeMinutes() taking client minutes, elapsed time, a configured ` +
      "time limit AND a hard cap, and clamp to the minimum of all of them -- a version that only checks " +
      "one of these still lets an inflated client number (or a huge configured limit) through unbounded.",
    run: async ({ read }) => {
      const ts = await read(SHARED);
      if (!ts) return { ok: false, detail: [`${SHARED} not found`] };
      const bad = [];
      if (!/export function computeChargeMinutes/.test(ts)) {
        bad.push("missing export function computeChargeMinutes");
      }
      if (!/Math\.min\(\s*clientMinutes,\s*elapsedMinutes,\s*cap\s*\)/.test(ts)) {
        bad.push("computeChargeMinutes no longer takes Math.min(clientMinutes, elapsedMinutes, cap) -- the actual clamp");
      }
      if (!/Math\.min\(inputs\.timeLimitMinutes,\s*inputs\.hardCapMinutes\)/.test(ts)) {
        bad.push("the cap no longer folds in both timeLimitMinutes and hardCapMinutes");
      }
      if (!/export function computeSessionTimeLimitMinutes/.test(ts)) {
        bad.push("missing export function computeSessionTimeLimitMinutes");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "ava-voice-session-mints-session-log-row",
    why:
      `${MINT_FN} must insert a voice_session_log row (server-computed time_limit_minutes, using the ` +
      "application's own voice_interview_duration column for interview mode -- never the client-supplied " +
      "`duration` request field) right after a real OpenAI session is minted, and return its id as " +
      "voiceSessionId -- without this, deduct-voice-minutes has nothing trustworthy to cap or settle against.",
    run: async ({ read }) => {
      const ts = await read(MINT_FN);
      if (!ts) return { ok: false, detail: [`${MINT_FN} not found`] };
      const bad = [];
      if (!/from\(["']voice_session_log["']\)\s*\n?\s*\.insert\(/.test(ts)) {
        bad.push('missing .from("voice_session_log").insert(...)');
      }
      if (!/computeSessionTimeLimitMinutes\(\s*["']interview["'],\s*\(interviewApplication[\s\S]*?\)\.voice_interview_duration/.test(ts)) {
        bad.push("interview-mode time_limit_minutes must be derived from the application's own voice_interview_duration column, not the client-supplied `duration` field");
      }
      if (!/voiceSessionId/.test(ts)) {
        bad.push("response no longer includes voiceSessionId for the client to send back");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "deduct-voice-minutes-requires-and-caps-session",
    why:
      `${DEDUCT_FN} must require voiceSessionId, look up the voice_session_log row, run the deduction ` +
      "through computeChargeMinutes() (never sessionDurationMinutes directly), and settle the row with an " +
      "atomic `UPDATE ... WHERE ended_at IS NULL` so a second call for the same session charges nothing -- " +
      "this is the actual fix for the unbounded-drain vulnerability.",
    run: async ({ read }) => {
      const ts = await read(DEDUCT_FN);
      if (!ts) return { ok: false, detail: [`${DEDUCT_FN} not found`] };
      const bad = [];
      if (!/voiceSessionId/.test(ts)) {
        bad.push("no longer reads voiceSessionId from the request body");
      }
      if (!/typeof voiceSessionId !== 'string' \|\| voiceSessionId\.length === 0/.test(ts)) {
        bad.push("voiceSessionId is no longer required -- a request without one must be rejected (400)");
      }
      if (!/from\('voice_session_log'\)\s*\n?\s*\.select\(/.test(ts)) {
        bad.push('missing .from(\'voice_session_log\').select(...) lookup');
      }
      if (!/computeChargeMinutes\(/.test(ts)) {
        bad.push("no longer calls computeChargeMinutes() -- sessionDurationMinutes must not decide the charge on its own");
      }
      if (!/let remainingToDeduct = minutesToCharge;/.test(ts)) {
        bad.push("FIFO deduction no longer uses the capped minutesToCharge -- it must not fall back to raw sessionDurationMinutes");
      }
      if (!/\.is\('ended_at', null\)/.test(ts)) {
        bad.push("settling UPDATE no longer scopes to .is('ended_at', null) -- without it, a second call double-charges instead of matching zero rows");
      }
      if (!/sessionLog\.caller_user_id !== user\.id/.test(ts)) {
        bad.push("removed the check that the caller invoking deduction owns the voice session (caller_user_id === user.id)");
      }
      // The pre-existing candidate-identity + FIFO deduction must survive this fix untouched.
      if (!/application\.candidate_id !== user\.id/.test(ts)) {
        bad.push("removed the existing candidate-identity check (application.candidate_id === user.id)");
      }
      if (!/deductFromThis = Math\.min\(credit\.minutes_remaining, remainingToDeduct\)/.test(ts)) {
        bad.push("removed the existing FIFO deduction loop");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "use-ava-voice-sends-voice-session-id",
    why:
      `${HOOK} must capture the voiceSessionId ava-voice-session returns and send it on both ` +
      "deduct-voice-minutes call sites (the end_interview tool-call path and disconnect()'s cleanup path) " +
      "-- a client that never sends one can no longer be charged for an inflated duration, but it must " +
      "still send the real id so legitimate sessions keep getting billed.",
    run: async ({ read }) => {
      const ts = await read(HOOK);
      if (!ts) return { ok: false, detail: [`${HOOK} not found`] };
      const bad = [];
      if (!/voiceSessionIdRef/.test(ts)) {
        bad.push("missing voiceSessionIdRef to hold the id returned by ava-voice-session");
      }
      if (!/voiceSessionIdRef\.current\s*=\s*\(response\.data as any\)\?\.voiceSessionId/.test(ts)) {
        bad.push("voiceSessionIdRef is never set from the ava-voice-session response");
      }
      const sendSites = ts.match(/voiceSessionId:\s*voiceSessionIdRef\.current,/g) || [];
      if (sendSites.length < 2) {
        bad.push(`expected voiceSessionId: voiceSessionIdRef.current on both deduct-voice-minutes call sites, found ${sendSites.length}`);
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
