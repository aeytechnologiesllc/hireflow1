/**
 * billingApi.ts — the two calls behind paying (src/lib/billing.ts has the
 * words and how each answer reads; docs/BILLING.md).
 *
 * Neither sends who pays, a price or where to come back to: billing-checkout
 * works out the business from the sign-in, finds the price by its lookup key
 * and sends Stripe back to the job (or Settings) on HireFlow's own site. A
 * failure is an outcome the page words, never an exception.
 */
import { supabase } from "@/integrations/supabase/client";
import { billingCallOutcome, type BillingCallOutcome } from "@/lib/billing";

async function call(name: "billing-checkout" | "billing-portal", body: Record<string, unknown>): Promise<BillingCallOutcome> {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (!error) return billingCallOutcome(200, data);
    // A refusal (4xx, 503) arrives as an error carrying the response.
    const response = (error as { context?: unknown }).context;
    if (typeof Response !== "undefined" && response instanceof Response) {
      const reply = await response.clone().json().catch(() => null);
      return billingCallOutcome(response.status, reply);
    }
    return billingCallOutcome(null, null);
  } catch (err) {
    console.warn(`[billing] ${name} did not answer:`, err);
    return billingCallOutcome(null, null);
  }
}

/** A Stripe Checkout page for this job ($99) or for Unlimited (optionally putting this job live too). */
export function startCheckout(kind: "job" | "unlimited", jobId?: string | null): Promise<BillingCallOutcome> {
  return call("billing-checkout", { kind, ...(jobId ? { jobId } : {}) });
}

/** Stripe's billing page for the business owner. */
export function openBillingPortal(): Promise<BillingCallOutcome> {
  return call("billing-portal", {});
}
