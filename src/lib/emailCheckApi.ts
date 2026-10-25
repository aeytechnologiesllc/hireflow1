/**
 * emailCheckApi.ts — the three calls behind "Confirm your email"
 * (src/lib/emailCheck.ts has the words and how each answer reads).
 *
 * The send carries the type and nothing else: no address, no user id. The
 * function works out who is signed in and mails their sign-in address
 * (supabase/functions/_shared/businessEmailCode.ts). A failure is an outcome
 * the screen words, never an exception.
 */
import { supabase } from "@/integrations/supabase/client";
import { BUSINESS_EMAIL_CODE_TYPE, sendCodeOutcome, verifyOutcome, type SendCodeOutcome, type VerifyOutcome } from "@/lib/emailCheck";

/** Has the signed-in business confirmed its email? null when it could not be asked. */
export async function myBusinessEmailVerified(): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("my_business_email_verified" as never);
  if (error) return null;
  return data === true;
}

export async function sendBusinessEmailCode(): Promise<SendCodeOutcome> {
  try {
    const { data, error } = await supabase.functions.invoke("send-notification-email", {
      body: { type: BUSINESS_EMAIL_CODE_TYPE },
    });
    if (!error) return sendCodeOutcome(200, data);
    // A refusal (429, 401, 5xx) arrives as an error carrying the response.
    const response = (error as { context?: unknown }).context;
    if (typeof Response !== "undefined" && response instanceof Response) {
      const body = await response.clone().json().catch(() => null);
      return sendCodeOutcome(response.status, body);
    }
    return sendCodeOutcome(null, null);
  } catch (err) {
    console.warn("[emailCheck] code not sent:", err);
    return sendCodeOutcome(null, null);
  }
}

export async function verifyBusinessEmailCode(code: string): Promise<VerifyOutcome> {
  try {
    const { data, error } = await supabase.rpc("verify_business_email_code" as never, { p_code: code } as never);
    if (error) return verifyOutcome(null);
    return verifyOutcome(data);
  } catch {
    return verifyOutcome(null);
  }
}
