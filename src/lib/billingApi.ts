/**
 * billingApi.ts — the two calls behind paying (src/lib/billing.ts has the
 * words and how each answer reads; docs/BILLING.md).
 *
 * Neither sends who pays, a price or where to come back to: billing-checkout
 * works out the business from the sign-in, finds the price by its lookup key
 * and sends Stripe back to the job (or Settings) on HireFlow's own site. A
 * failure is an outcome the page words, never an exception.
 *
 * Paying happens inside HireFlow (2026-11-01, the owner: "it would be nicer
 * if you could do a self-hosted checkout inside of our app where we don't
 * have to go out"): Stripe's own payment form (Embedded Checkout), mounted in
 * a dialog. The page always asks for it; billing-checkout gives it, with
 * Stripe's publishable key (public by design), when the function secret
 * STRIPE_PUBLISHABLE_KEY is set, so Stripe's keys live in one place. Until
 * then the answer is Stripe's hosted page, as before. Card details only ever
 * go to Stripe's form.
 */
import { insideHireFlowApp } from "@/lib/nativePush";
import type { ComponentType } from "react";
import { supabase } from "@/integrations/supabase/client";
import { billingCallOutcome, type BillingCallOutcome } from "@/lib/billing";

/**
 * A stand-in for Stripe's form, set only by the dev preview (src/dev-preview/
 * previewBilling.ts), which runs offline and cannot load Stripe.js. Never set
 * in a built app.
 */
type CheckoutStandIn = { publishableKey: string; Form?: ComponentType<{ clientSecret: string; onComplete: () => void }> };
let standIn: CheckoutStandIn | null = null;
export function setCheckoutStandIn(next: CheckoutStandIn | null): void {
  standIn = next;
}
export function checkoutStandIn(): CheckoutStandIn | null {
  return standIn;
}

/** The publishable key billing-checkout gave with the last form inside HireFlow. */
let givenKey: string | null = null;

/** Stripe's publishable key (pk_live_… or pk_test_…) for the form being opened, or null. */
export function stripePublishableKey(): string | null {
  return standIn ? standIn.publishableKey : givenKey;
}

async function call(name: "billing-checkout" | "billing-portal", body: Record<string, unknown>): Promise<BillingCallOutcome> {
  // Inside the HireFlow iPhone app nothing is bought or changed (Apple allows
  // a paid plan to be used in an app, not bought there outside its own
  // payments; the owner, 2026-11-04). The screens hide the buttons too.
  if (insideHireFlowApp()) return { kind: "failed", message: NATIVE_APP_BILLING_WORDS };
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

/**
 * A Stripe Checkout for this job ($99) or for Unlimited (optionally putting
 * this job live too): Stripe's form inside HireFlow ({ kind: "embedded" })
 * when billing-checkout has the publishable key, else Stripe's page ({ kind: "redirect" }).
 */
export async function startCheckout(kind: "job" | "unlimited", jobId?: string | null): Promise<BillingCallOutcome> {
  const outcome = await call("billing-checkout", { kind, ...(jobId ? { jobId } : {}), ui: "embedded" });
  if (outcome.kind === "embedded") givenKey = outcome.publishableKey;
  return outcome;
}

/** Stripe's billing page for the business owner. */
export function openBillingPortal(): Promise<BillingCallOutcome> {
  return call("billing-portal", {});
}

/** What the iPhone app says where a plan would be bought or changed. Names no other place to buy. */
export const NATIVE_APP_BILLING_WORDS = "Plans and payments can't be changed in the iPhone app.";

