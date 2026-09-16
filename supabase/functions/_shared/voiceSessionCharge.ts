// Pure helpers for capping and computing a voice session's billable minutes.
//
// Why this exists: deduct-voice-minutes used to trust the client's
// `sessionDurationMinutes` outright — no upper bound, no server-side
// cross-check — so a candidate on their own application could post
// `sessionDurationMinutes: 999999` and drain the employer's voice_credits in
// one call. ava-voice-session now records a voice_session_log row (server
// clock `started_at`, a server-computed `time_limit_minutes`) the instant it
// mints a real OpenAI session, and deduct-voice-minutes charges
// min(client-reported minutes, wall-clock elapsed minutes, that session's
// configured time limit, an absolute hard cap) — never the client number
// alone. Kept here, isolated from any Supabase/Deno wiring, so both the edge
// function and a plain Node test (scripts/voice_session_charge.test.mjs;
// Node 24+ strips these type annotations natively, no build step) exercise
// the exact same arithmetic.

/** Absolute ceiling, regardless of configured duration or anything the client
 *  reports — no single voice session should ever be billed past an hour. */
export const HARD_CAP_MINUTES = 60;

/** Assistant-mode sessions (employer talking to Ava, not a candidate
 *  interview) have no per-application configured duration to anchor a cap
 *  to. This is a generous ceiling for one continuous assistant call. */
export const ASSISTANT_DEFAULT_LIMIT_MINUTES = 20;

/** Interview mode adds this many minutes on top of the employer's configured
 *  interview length — the same "+2 min buffer" the interview prompt already
 *  tells the model about (see ava-voice-session's INTERVIEW TIME MANAGEMENT
 *  section) — so a candidate wrapping up a normal answer near the limit
 *  isn't cut off mid-charge. */
export const INTERVIEW_BUFFER_MINUTES = 2;

export type VoiceSessionMode = "interview" | "assistant";

/**
 * The configured cap for a session's mode, computed once at mint time
 * (ava-voice-session) and stored on the voice_session_log row so
 * deduct-voice-minutes never has to re-derive it from client input.
 *
 * `configuredDurationMinutes` must come from the application's own
 * `voice_interview_duration` column (set by the employer, read server-side)
 * — never from the client-supplied `duration` request field, which is only
 * ever used for the interview prompt's own pacing language.
 */
export function computeSessionTimeLimitMinutes(
  mode: VoiceSessionMode,
  configuredDurationMinutes?: number | null,
): number {
  if (mode === "assistant") {
    return ASSISTANT_DEFAULT_LIMIT_MINUTES;
  }

  const base =
    typeof configuredDurationMinutes === "number" &&
    Number.isFinite(configuredDurationMinutes) &&
    configuredDurationMinutes > 0
      ? configuredDurationMinutes
      : 10; // same fallback ava-voice-session's own prompt-building code uses

  return base + INTERVIEW_BUFFER_MINUTES;
}

export interface ChargeMinutesInputs {
  /** sessionDurationMinutes as reported by the client. Untrusted. */
  clientMinutes: number;
  /** The voice_session_log row's started_at, as an ISO string or Date. */
  startedAt: string | Date;
  /** Defaults to the real current time; overridable for deterministic tests. */
  now?: Date;
  /** This session's stored time_limit_minutes (see computeSessionTimeLimitMinutes). */
  timeLimitMinutes: number;
  /** This session's stored hard_cap_minutes (normally HARD_CAP_MINUTES). */
  hardCapMinutes: number;
}

/**
 * The number of minutes to actually charge for one session: never more than
 * what the client reported, never more than the wall-clock elapsed time
 * (rounded up to the minute, matching the client's own Math.ceil), never
 * more than the session's configured limit, and never more than the
 * absolute hard cap. Clamped to zero — a negative or non-finite client value
 * (or a clock skew that somehow produced negative elapsed time) charges
 * nothing rather than throwing.
 */
export function computeChargeMinutes(inputs: ChargeMinutesInputs): number {
  const now = inputs.now ?? new Date();
  const started = inputs.startedAt instanceof Date ? inputs.startedAt : new Date(inputs.startedAt);

  const elapsedMs = now.getTime() - started.getTime();
  const elapsedMinutes = Number.isFinite(elapsedMs) ? Math.max(0, Math.ceil(elapsedMs / 60000)) : 0;

  const clientMinutes =
    typeof inputs.clientMinutes === "number" && Number.isFinite(inputs.clientMinutes)
      ? Math.max(0, inputs.clientMinutes)
      : 0;

  const cap = Math.max(0, Math.min(inputs.timeLimitMinutes, inputs.hardCapMinutes));

  return Math.max(0, Math.min(clientMinutes, elapsedMinutes, cap));
}
