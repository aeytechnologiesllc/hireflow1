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
 * a dialog, whenever the site has Stripe's publishable key
 * (VITE_STRIPE_PUBLISHABLE_KEY, public by design). Without it the page asks
 * for Stripe's hosted page, as before, so nothing breaks before the key is set.
 * Card details only ever go to Stripe's form.
 */
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

/** Stripe's publishable key (pk_live_… or pk_test_…), or null: then Checkout is Stripe's hosted page. */
export function stripePublishableKey(): string | null {
  if (standIn) return standIn.publishableKey;
  const key = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "").trim();
  return /^pk_(?:live|test)_[A-Za-z0-9]+$/.test(key) ? key : null;
}

/** Whether paying can happen inside HireFlow (Embedded Checkout). */
export function embeddedCheckoutAvailable(): boolean {
  return stripePublishableKey() !== null;
}

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

/**
 * A Stripe Checkout for this job ($99) or for Unlimited (optionally putting
 * this job live too): Stripe's form inside HireFlow ({ kind: "embedded" })
 * when the site has the publishable key, else Stripe's page ({ kind: "redirect" }).
 * A function deployed before embedded Checkout answers with its page either way.
 */
export function startCheckout(kind: "job" | "unlimited", jobId?: string | null): Promise<BillingCallOutcome> {
  return call("billing-checkout", { kind, ...(jobId ? { jobId } : {}), ...(embeddedCheckoutAvailable() ? { ui: "embedded" } : {}) });
}

/** Stripe's billing page for the business owner. */
export function openBillingPortal(): Promise<BillingCallOutcome> {
  return call("billing-portal", {});
}
