/**
 * emailCheck.ts — what the "Confirm your email" screen says (2026-10-25;
 * docs/LAUNCH-PLAN.md, Phase 2, task 4).
 *
 * A business confirms its sign-in email with a 6-digit code before its first
 * job goes live; the database refuses the publish until then
 * (supabase/migrations/20261025100000_business_email_check.sql, HINT
 * 'email_not_verified'). The code is sent by send-notification-email's
 * business_email_code kind (supabase/functions/_shared/businessEmailCode.ts)
 * and checked by verify_business_email_code. The calls are in
 * src/lib/emailCheckApi.ts; this file is the words and the reading of the
 * answers.
 *
 * No imports: scripts/email_check_screen.test.mjs loads it in Node.
 */

/** The notification type the page sends. */
export const BUSINESS_EMAIL_CODE_TYPE = "business_email_code";

/** The database's refusal to publish for a business that has not confirmed. */
export function isEmailNotVerifiedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { hint?: unknown; message?: unknown };
  return e.hint === "email_not_verified" || (typeof e.message === "string" && /Confirm your email to put this job live/i.test(e.message));
}

/** A team member's publish, when the account owner has not confirmed yet. */
export const OWNER_MUST_CONFIRM_EMAIL =
  "The account owner needs to confirm their email before jobs can go live. Ask them to publish once, then try again.";

export type SendCodeOutcome =
  | { kind: "sent" }
  | { kind: "already" }
  | { kind: "wait"; seconds: number; message: string }
  | { kind: "signed_out"; message: string }
  | { kind: "failed"; message: string };

const TRY_AGAIN = "We couldn't send a code just now. Try again in a minute.";

/** The send's answer, read the way the function words it. */
export function sendCodeOutcome(status: number | null | undefined, body: unknown): SendCodeOutcome {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const message = typeof b.error === "string" && b.error.trim() ? b.error.trim() : TRY_AGAIN;
  if (status === 200 && b.success === true) return { kind: "sent" };
  if (b.code === "already_verified") return { kind: "already" };
  if (status === 429) {
    const seconds = typeof b.retryAfter === "number" && Number.isFinite(b.retryAfter) ? Math.max(1, Math.ceil(b.retryAfter)) : 60;
    return { kind: "wait", seconds, message };
  }
  if (status === 401) return { kind: "signed_out", message };
  // 403 (not a business account), 404 (no address), 5xx: the function's own words.
  return { kind: "failed", message: status ? message : TRY_AGAIN };
}

export type VerifyOutcome = { kind: "confirmed" } | { kind: "wrong"; message: string } | { kind: "expired"; message: string } | { kind: "failed"; message: string };

/** verify_business_email_code's answer, in the screen's words. */
export function verifyOutcome(result: unknown): VerifyOutcome {
  const r = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
  if (r.ok === true) return { kind: "confirmed" };
  switch (r.reason) {
    case "wrong_code": {
      const left = typeof r.tries_left === "number" ? r.tries_left : null;
      return { kind: "wrong", message: left != null ? `That code isn't right. ${left === 1 ? "1 try" : `${left} tries`} left.` : "That code isn't right." };
    }
    case "expired":
      return { kind: "expired", message: "That code has expired. Send a new one." };
    case "used_up":
      return { kind: "expired", message: "That code is used up after five wrong tries. Send a new one." };
    case "address_changed":
      return { kind: "expired", message: "Your sign-in email changed after that code was sent. Send a new one." };
    case "no_code":
      return { kind: "expired", message: "Send a code first." };
    case "not_signed_in":
      return { kind: "failed", message: "Your sign-in has ended. Sign in again, then publish." };
    default:
      return { kind: "failed", message: "We couldn't check the code just now. Try again." };
  }
}

/** Six digits, whatever else was pasted with them. */
export function cleanCode(value: string): string {
  return (value ?? "").replace(/\D/g, "").slice(0, 6);
}

export const EMAIL_CHECK_WORDS = {
  title: "Confirm your email",
  intro: (email: string | null | undefined) =>
    email
      ? `Before your first job goes live, we send a 6-digit code to ${email}. It takes a minute and you only do it once.`
      : "Before your first job goes live, we send a 6-digit code to your sign-in email. It takes a minute and you only do it once.",
  send: "Send the code",
  sending: "Sending…",
  sent: (email: string | null | undefined) => (email ? `Code sent to ${email}. It works for 15 minutes.` : "Code sent. It works for 15 minutes."),
  codeLabel: "6-digit code",
  confirm: "Confirm and publish",
  confirming: "Checking…",
  resend: "Send a new code",
  resendIn: (seconds: number) =>
    seconds >= 3 * 3600 ? "Send a new code tomorrow" : seconds > 90 ? `Send a new code in ${Math.ceil(seconds / 60)} min` : `Send a new code in ${seconds}s`,
  spam: "Not there? Check spam, or send a new code.",
  wrongAddress: "Not your address? Message us from Help and we'll sort it out.",
  done: "Email confirmed.",
} as const;
