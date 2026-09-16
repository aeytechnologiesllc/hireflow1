import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Human copy for every machine error code the document-signing edge
 * function (supabase/functions/document-signing/index.ts) returns — kept
 * in sync with that function's own ERROR_MESSAGE map. Shared by every
 * client surface that calls it (DocumentSigningPanel's sign/countersign/
 * decline, and the cockpit's Withdraw/Void action dialogs) so the copy
 * only has to be gotten right in one place, instead of drifting between
 * two or three independently-maintained copies of the same table.
 */
export const DOCUMENT_SIGNING_ERROR_MESSAGES: Record<string, string> = {
  already_signed: "Someone already signed this — refresh to see the latest.",
  not_pending: "This document is no longer pending — refresh to see its current state.",
  candidate_has_not_signed: "The candidate hasn't signed yet.",
  locked: "This document is locked and can no longer be changed.",
  expired: "This document has expired.",
  voided: "This document has already been withdrawn or voided.",
  not_your_turn: "It isn't your turn to act on this document.",
  consent_required: "You must accept the electronic signature consent statement.",
  review_required: "You must confirm you reviewed the document before countersigning.",
  invalid_signature: "That signature isn't valid — try again.",
  invalid_reason: "Please give a reason between 3 and 500 characters.",
  role_mismatch: "You are not authorized to take this action on this document.",
  unauthorized: "Sign in to continue.",
  candidate_already_signed: "The candidate already signed this — void it instead of withdrawing.",
  countersign_in_progress: "This document is being countersigned right now — try again in a moment.",
  chain_broken: "This document's signature chain no longer reconciles — it may have been altered. Contact support.",
};

/**
 * Calls the document-signing edge function and throws a human-readable
 * Error on any failure.
 *
 * @supabase/functions-js treats any non-2xx response as an error: it
 * throws a FunctionsHttpError and returns `{ data: null, error }` — the
 * function's own JSON error body (`{ error: "role_mismatch", ... }`) is
 * NOT put on `data`, it's only reachable via `error.context`, which is
 * the raw Response object. Every error this edge function returns
 * (role_mismatch, not_pending, locked, voided, invalid_reason,
 * candidate_already_signed, countersign_in_progress, unauthorized, …) is
 * a non-2xx response, so reading `data?.error` after `invoke()` always
 * sees `data === null` and silently falls back to a generic message.
 * Every caller of the document-signing function should go through this
 * helper instead of calling `supabase.functions.invoke` directly.
 */
export async function invokeDocumentSigning(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("document-signing", { body });
  if (error) {
    let code: string | undefined;
    let message: string | undefined;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const parsed = await ctx.clone().json();
        code = parsed?.error;
        message = parsed?.message;
      }
    } catch {
      // ignore — fall through to the generic message below
    }
    throw new Error(DOCUMENT_SIGNING_ERROR_MESSAGES[code ?? ""] ?? message ?? "Something went wrong. Please try again.");
  }
  if ((data as { error?: string } | null)?.error) {
    const code = (data as { error?: string }).error;
    const message = (data as { message?: string }).message;
    throw new Error(DOCUMENT_SIGNING_ERROR_MESSAGES[code ?? ""] ?? message ?? "Something went wrong. Please try again.");
  }
  return data;
}
