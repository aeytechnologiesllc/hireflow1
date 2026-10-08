/**
 * interviewOfferDays.ts: which start times of a day can still be offered for
 * an interview, and the first day that has any.
 *
 * "Set up interview" used to open on today, always. Late in the evening
 * every one of today's times has passed, so the owner was met with an empty
 * wheel ("No 30-min slots left — try another day") and had to find tomorrow
 * himself. He works evenings: most of his finalists are half a world away.
 * It now opens on the first day that still has a time to offer.
 *
 * Pure: no React, no Supabase, no date library.
 */

/** No interview runs past this time of day, on the team's own clock. */
export interface DayCutoff {
  hour: number;
  minute: number;
}

/** "HH:mm" on `day`, as a moment on this machine's clock. */
export function atClock(day: Date, clock: string): Date {
  const [hours, minutes] = clock.split(":").map(Number);
  const at = new Date(day);
  at.setHours(hours, minutes, 0, 0);
  return at;
}

/**
 * The start times ("HH:mm") on `day` that can still be offered: not already
 * passed, and an interview of `durationMinutes` starting then ends by the
 * day's cutoff.
 */
export function timesLeftOn(day: Date, slots: readonly string[], durationMinutes: number, now: Date, cutoff: DayCutoff): string[] {
  const dayEnd = new Date(day);
  dayEnd.setHours(cutoff.hour, cutoff.minute, 0, 0);
  const length = (durationMinutes > 0 ? durationMinutes : 0) * 60_000;
  return slots.filter((slot) => {
    const start = atClock(day, slot).getTime();
    if (Number.isNaN(start) || start < now.getTime()) return false;
    return start + length <= dayEnd.getTime();
  });
}

/**
 * Which of `days` to open on: the first with a time left to offer. When none
 * has (an interview too long for any day), the first day, as before.
 */
export function firstDayWithTimes(days: readonly Date[], slots: readonly string[], durationMinutes: number, now: Date, cutoff: DayCutoff): number {
  const index = days.findIndex((day) => timesLeftOn(day, slots, durationMinutes, now, cutoff).length > 0);
  return index < 0 ? 0 : index;
}
