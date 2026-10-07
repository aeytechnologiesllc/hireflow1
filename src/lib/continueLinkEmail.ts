/**
 * continueLinkEmail.ts — "Email me the link" on the Continue on your computer
 * screen, the page's half (docs/COMPUTER-ONLY-TESTS.md).
 *
 * The owner, 2026-10-06, about applicants who reach that screen on a phone
 * and stop there: "make it a little bit easy if there is a way." One button:
 * the link to carry on is emailed to the address they signed in with, and
 * they open it on their computer.
 *
 * The page sends one thing, the application's id. Who the email goes to (the
 * signed-in applicant, never an address typed here), whether it may go, how
 * often, and every word in it are decided on the server
 * (supabase/functions/_shared/continueOnComputerEmail.ts). This file only
 * reads the answer and says it in plain words.
 *
 * Pure (no React, no Supabase), so scripts/continue_link_email.test.mjs runs
 * it under plain Node. The one call is src/lib/sendContinueLinkEmail.ts.
 */

/** The notification type, as the function names it. */
export const CONTINUE_LINK_EMAIL_TYPE = "continue_on_computer";

/** After one is sent the button rests this long: the server's own limit. */
export const CONTINUE_LINK_COOLDOWN_SECONDS = 180;

/** What came of pressing the button. */
export type ContinueLinkEmailOutcome =
  /** Accepted for delivery. `to` is the address it went to, when the server said. */
  | { kind: "sent"; to: string | null }
  /** One went a moment ago: nothing new was sent. */
  | { kind: "wait"; seconds: number }
  /** Their account has emails turned off: nothing was sent. */
  | { kind: "off" }
  /** Anything else: not sent. */
  | { kind: "failed" };

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * Reads the function's answer. Only an explicit success is "sent": the
 * function answers 200 without one when the account has emails turned off,
 * and that must never read as an email on its way.
 */
export function continueLinkEmailOutcome(status: number | null | undefined, body: unknown): ContinueLinkEmailOutcome {
  const reply = obj(body);
  if (status === 200) {
    if (reply?.success === true) {
      const to = typeof reply.recipient === "string" && reply.recipient.includes("@") ? reply.recipient.trim() : null;
      return { kind: "sent", to };
    }
    // "Email service not configured" is our side, not their setting.
    if (reply?.skipped === true) return { kind: "failed" };
    return { kind: "off" };
  }
  if (status === 429) {
    const asked = Number(reply?.retryAfter);
    const seconds = Number.isFinite(asked) && asked > 0 ? Math.min(3600, Math.max(30, Math.round(asked))) : CONTINUE_LINK_COOLDOWN_SECONDS;
    return { kind: "wait", seconds };
  }
  return { kind: "failed" };
}

/** How long the button rests after this outcome, in seconds (0 = press again at once). */
export function continueLinkRestSeconds(outcome: ContinueLinkEmailOutcome): number {
  if (outcome.kind === "sent") return CONTINUE_LINK_COOLDOWN_SECONDS;
  if (outcome.kind === "wait") return outcome.seconds;
  return 0;
}

function minutesWords(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}

/**
 * The one line under the buttons, for each outcome. `email` is the address
 * the applicant is signed in with (the screen already shows it in full, in
 * its own step 2), used when the server did not name where it went.
 */
export function continueLinkEmailWords(outcome: ContinueLinkEmailOutcome, email?: string | null): string {
  switch (outcome.kind) {
    case "sent": {
      const to = outcome.to || (typeof email === "string" && email.trim()) || null;
      return to ? `Sent to ${to}. Open it on your computer.` : "Sent. Open it on your computer.";
    }
    case "wait":
      return `We sent it a moment ago. Check your inbox and your spam folder, or try again in ${minutesWords(outcome.seconds)}.`;
    case "off":
      return "Emails are turned off for your account, so nothing was sent. Copy the link instead.";
    default:
      return "Couldn't send it just now. Copy the link instead, or try again in a few minutes.";
  }
}

/** The button's own words. */
export const EMAIL_LINK_LABEL = "Email me the link";
export const EMAIL_LINK_SENDING_LABEL = "Sending…";
export const EMAIL_LINK_SENT_LABEL = "Email sent";

/** The line before anything is pressed, when there is an address to send to. */
export function continueLinkHint(email: string): string {
  return `We'll email the link to ${email}. Or copy it and send it to yourself.`;
}
