// The job-billing branch of stripe-webhook's checkout.session.completed
// handler, pulled out so it can be driven by a Node test
// (scripts/job_billing_webhook_handlers.test.mjs) with a fake supabaseAdmin
// and a fake Stripe client — the Deno file itself (stripe-webhook/index.ts)
// can't run under Node (bare `https://deno.land/...`/`https://esm.sh/...`
// imports, top-level `serve()`), so this is where the actual row-update
// logic lives and gets proven; stripe-webhook/index.ts is just the
// signature-verified entry point that calls it.
//
// Idempotent by construction: every update is scoped to the row's still-
// pending status (`.eq('status', 'pending')` / `'pending_payment'`), so a
// webhook retry (Stripe's own automatic retry, or the same event delivered
// twice) matches zero rows the second time and changes nothing.
import { unlockExpiresAt, boostHoldExpiresAt } from "./jobBillingPricing.ts";

export interface CheckoutSessionLike {
  payment_intent: string | null;
  metadata?: Record<string, string | undefined> | null;
}

export interface StripeLike {
  paymentIntents: {
    retrieve: (id: string) => Promise<{ payment_method: string | { id: string } | null }>;
  };
}

interface SupabaseAdminLike {
  from: (table: string) => any;
}

export interface JobBillingCheckoutResult {
  kind: "unlock" | "pack" | "boost" | null;
  updated: boolean;
}

/**
 * Handles a checkout.session.completed event whose metadata.kind is
 * 'unlock' | 'pack' | 'boost' (set by unlock-job-checkout /
 * purchase-applicant-pack-checkout / ava-boost-checkout). Returns
 * { kind: null, updated: false } for any other session — the caller decides
 * what to do next (fall through to the existing voice-credits/subscription
 * handling).
 */
export async function handleJobBillingCheckoutCompleted(
  supabaseAdmin: SupabaseAdminLike,
  stripe: StripeLike,
  session: CheckoutSessionLike,
  now: Date = new Date(),
): Promise<JobBillingCheckoutResult> {
  const kind = session.metadata?.kind;
  const paymentIntentId = session.payment_intent;

  if (kind === "unlock" && session.metadata?.job_unlock_id) {
    const { data: updated } = await supabaseAdmin
      .from("job_unlocks")
      .update({
        status: "active",
        unlocked_at: now.toISOString(),
        expires_at: unlockExpiresAt(now, now).toISOString(),
        stripe_payment_intent_id: paymentIntentId,
      })
      .eq("id", session.metadata.job_unlock_id)
      .eq("status", "pending")
      .select("id, employer_id")
      .maybeSingle();

    if (updated && paymentIntentId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        const paymentMethodId = typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id;
        if (paymentMethodId) {
          await supabaseAdmin
            .from("subscriptions")
            .update({ stripe_default_payment_method_id: paymentMethodId })
            .eq("user_id", updated.employer_id);
        }
      } catch (e) {
        console.error("[jobBillingWebhookHandlers] Failed to save default payment method after unlock:", e);
      }
    }
    return { kind: "unlock", updated: Boolean(updated) };
  }

  if (kind === "pack" && session.metadata?.applicant_pack_id) {
    const { data: updated } = await supabaseAdmin
      .from("applicant_packs")
      .update({ status: "active", stripe_payment_intent_id: paymentIntentId })
      .eq("id", session.metadata.applicant_pack_id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    return { kind: "pack", updated: Boolean(updated) };
  }

  if (kind === "boost" && session.metadata?.boost_order_id) {
    const { data: updated } = await supabaseAdmin
      .from("boost_orders")
      .update({
        status: "authorized",
        authorized_at: now.toISOString(),
        hold_expires_at: boostHoldExpiresAt(now).toISOString(),
        stripe_payment_intent_id: paymentIntentId,
      })
      .eq("id", session.metadata.boost_order_id)
      .eq("status", "pending_payment")
      .select("id")
      .maybeSingle();
    return { kind: "boost", updated: Boolean(updated) };
  }

  return { kind: null, updated: false };
}

/** True for any session this handler owns — lets the caller `break` before falling into the unrelated voice-credits/subscription branches. */
export function isJobBillingCheckout(session: CheckoutSessionLike): boolean {
  const kind = session.metadata?.kind;
  return kind === "unlock" || kind === "pack" || kind === "boost";
}
