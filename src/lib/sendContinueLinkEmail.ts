/**
 * sendContinueLinkEmail.ts — the one call behind "Email me the link"
 * (src/lib/continueLinkEmail.ts; docs/COMPUTER-ONLY-TESTS.md).
 *
 * It sends the application's id and nothing else: no address, no user id, no
 * words. The function works out who is signed in and sends to them
 * (supabase/functions/_shared/continueOnComputerEmail.ts). It opens no
 * attempt, starts no timer and records no integrity event; a failure is an
 * outcome the screen words, never an exception.
 */
import { supabase } from "@/integrations/supabase/client";
import { CONTINUE_LINK_EMAIL_TYPE, continueLinkEmailOutcome, type ContinueLinkEmailOutcome } from "@/lib/continueLinkEmail";

export async function sendContinueLinkEmail(applicationId: string): Promise<ContinueLinkEmailOutcome> {
  if (!applicationId) return { kind: "failed" };
  try {
    const { data, error } = await supabase.functions.invoke("send-notification-email", {
      body: { type: CONTINUE_LINK_EMAIL_TYPE, data: { application_id: applicationId } },
    });
    if (!error) return continueLinkEmailOutcome(200, data);
    // A refusal (429 too soon, 4xx, 5xx) arrives as an error carrying the response.
    const response = (error as { context?: unknown }).context;
    if (typeof Response !== "undefined" && response instanceof Response) {
      const body = await response.clone().json().catch(() => null);
      return continueLinkEmailOutcome(response.status, body);
    }
    return continueLinkEmailOutcome(null, null);
  } catch (err) {
    console.warn("[continueLinkEmail] not sent:", err);
    return { kind: "failed" };
  }
}
