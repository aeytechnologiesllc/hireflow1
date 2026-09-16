/**
 * What actually happened to a notification email, so callers that show the
 * outcome to a person (rather than just logging it) can tell the truth:
 *  - 'sent': the edge function called Resend and it accepted the message.
 *  - 'skipped': nothing went wrong, but no mail went out — RESEND_API_KEY is
 *    unset (the live state as of 2026-09), the recipient's profile was
 *    missing, or they turned this notification type off.
 *  - 'failed': the invoke call itself errored (network, function exception).
 *
 * Pulled out of emailNotifications.ts so the mapping can be unit-tested
 * without pulling in the Supabase client (which needs import.meta.env and
 * only resolves inside Vite).
 */
export type EmailStatus = "sent" | "skipped" | "failed";

/**
 * Maps a supabase.functions.invoke("send-notification-email", ...) result to
 * an EmailStatus. The function always responds 200 on every path that
 * matters here (RESEND unset, notifications disabled, missing preference)
 * and only sets `success: true` once Resend has actually accepted the send —
 * so anything other than an explicit success is a skip, and an invoke-level
 * error (network failure, thrown exception, non-2xx status) is a failure.
 */
export function mapEmailStatus(responseData: { success?: boolean } | null | undefined, error: unknown): EmailStatus {
  if (error) return "failed";
  return responseData?.success === true ? "sent" : "skipped";
}
