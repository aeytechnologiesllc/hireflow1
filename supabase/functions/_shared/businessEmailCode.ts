/**
 * businessEmailCode.ts — the email-check code a business asks for at its
 * first "Publish" (2026-10-25; docs/LAUNCH-PLAN.md, Phase 2, task 4;
 * supabase/migrations/20261025100000_business_email_check.sql).
 *
 * The second kind of send-notification-email that trusts nothing in the
 * request (after continue_on_computer): the code goes to whoever is signed
 * in, at the address on their sign-in account, never to a user id or an
 * address named in the body. The database makes the code and keeps the
 * limits (business accounts only; one a minute and five an hour per account;
 * five an hour per inbox, however it is written; 300 an hour in all); the
 * function adds ten an hour per IP. This file is the words and what each
 * answer means. The email carries nothing its account typed (not even a
 * first name): a name field is free text, and this email is HireFlow's.
 *
 * No imports: plain Node loads this file for
 * scripts/business_email_check.pglite.test.mjs, and the function for the send.
 */

/** The notification type, as the page sends it and the function reads it. */
export const BUSINESS_EMAIL_CODE_TYPE = "business_email_code";

export interface BusinessEmailCodeWords {
  subject: string;
  title: string;
  /** Plain sentences, one paragraph each. The function escapes them. */
  lines: string[];
}

/** The email: the code, how long it lasts, and what to do if they did not ask. */
export function businessEmailCodeEmail(input: { code: string }): BusinessEmailCodeWords {
  return {
    subject: `Your HireFlow code: ${input.code}`,
    title: "Confirm your email",
    lines: [
      "Here is the code to confirm this email address on HireFlow.",
      "Enter it on the Publish screen. It works for 15 minutes.",
      "If you didn't ask for it, you can ignore this email. Nothing changes until the code is entered.",
    ],
  };
}

export type BusinessEmailCodeAnswer =
  | { ok: true; code: string }
  | { ok: false; status: 200 | 401 | 403 | 404 | 429 | 503; code: string; error: string; retryAfter?: number };

function waitWords(seconds: number): string {
  if (seconds <= 60) return `${Math.max(1, seconds)} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/** What issue_business_email_code's answer means for the caller. Anything unreadable is "try later". */
export function readIssuedCode(issued: unknown): BusinessEmailCodeAnswer {
  const r = issued && typeof issued === "object" ? (issued as Record<string, unknown>) : null;
  if (r?.ok === true && typeof r.code === "string" && /^[0-9]{6}$/.test(r.code)) return { ok: true, code: r.code };
  const retry = typeof r?.retry_after === "number" && Number.isFinite(r.retry_after) ? Math.max(1, Math.ceil(r.retry_after)) : undefined;
  switch (r?.reason) {
    case "not_signed_in":
      return { ok: false, status: 401, code: "not_signed_in", error: "Your sign-in has ended. Sign in again to get a code." };
    case "already_verified":
      return { ok: false, status: 200, code: "already_verified", error: "Your email is already confirmed." };
    case "too_soon":
      return { ok: false, status: 429, code: "too_soon", error: `A code is on its way. You can ask for another in ${waitWords(retry ?? 60)}.`, retryAfter: retry ?? 60 };
    case "too_many":
      return { ok: false, status: 429, code: "too_many", error: `That's five codes this hour. You can ask again in ${waitWords(retry ?? 3600)}.`, retryAfter: retry ?? 3600 };
    case "not_a_business":
      return { ok: false, status: 403, code: "not_a_business", error: "Only a business account confirms its email here." };
    case "no_address":
      return { ok: false, status: 404, code: "no_address", error: "Your account has no email address to send a code to." };
    case "busy":
      return { ok: false, status: 503, code: "busy", error: "A lot of codes are going out right now. Try again in a few minutes.", retryAfter: 300 };
    default:
      return { ok: false, status: 503, code: "try_later", error: "We couldn't send a code just now. Try again in a minute." };
  }
}
