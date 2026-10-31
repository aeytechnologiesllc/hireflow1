/**
 * What billing-sync does in one run (index.ts checks who is calling first).
 * Pure: the database and Stripe are passed in, so
 * scripts/billing_sync.test.mjs runs it against a fake Stripe and a fake
 * database (launch_locks_behaviour section 33 runs the SQL it calls).
 *
 * The hourly close never closes an Unlimited business's jobs on the
 * database's clock alone: a webhook missed across a renewal would close the
 * jobs of a business Stripe has just charged. So every hour, ten minutes
 * before that close, each Unlimited whose period has ended or ends within a
 * day (or that has been past_due for 6 days) is read again from Stripe
 * (billing_sync_due, 200 a run) and applied (billing_sync_subscription,
 * which records when it was read). With { all: true } (by hand, after a
 * webhook outage: docs/BILLING.md) it reads every one Stripe still bills.
 *
 *   Stripe answers                the subscription as it is now is applied;
 *                                 what nothing covers any more closes.
 *   no such subscription          nothing changed, its jobs stay live; the
 *                                 admins are told (billing_sync_missing).
 *   Stripe does not answer        nothing changed (its jobs stay live until
 *                                 a run can read it); the admins are told
 *                                 once a day.
 */
import { idOf, isResourceMissing, subscriptionAmount, subscriptionPeriod, type FormValue, type StripeReply } from "../_shared/stripe.ts";

export type RpcResult = { data: unknown; error: { message?: string } | null };

export type SyncDeps = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult> | PromiseLike<RpcResult>;
  stripe: (method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, FormValue>) => Promise<StripeReply>;
  livemode: boolean;
};

export type SyncOutcome = { status: number; body: Record<string, unknown> };

export async function syncSubscriptions(deps: SyncDeps, all = false): Promise<SyncOutcome> {
  const { data, error } = await deps.rpc("billing_sync_due", { p_livemode: deps.livemode, p_all: all });
  if (error) {
    console.error("[billing-sync] could not read the subscriptions due:", error.message ?? error);
    return { status: 500, body: { error: "could not read the subscriptions due" } };
  }
  const due = (Array.isArray(data) ? data : []) as Array<{ subscription?: unknown }>;
  let checked = 0;
  let missing = 0;
  let failed = 0;
  let closed = 0;
  for (const row of due) {
    const id = typeof row.subscription === "string" && /^sub_[A-Za-z0-9_]+$/.test(row.subscription) ? row.subscription : null;
    if (!id) continue;
    const reply = await deps.stripe("GET", `/subscriptions/${encodeURIComponent(id)}`);
    if (isResourceMissing(reply)) {
      missing += 1;
      const told = await deps.rpc("billing_sync_missing", { p_subscription: id });
      if (told.error) console.error("[billing-sync] could not record a missing subscription:", told.error.message ?? told.error);
      continue;
    }
    if (!reply.ok || !reply.body) {
      failed += 1;
      continue;
    }
    const subscription = reply.body;
    const period = subscriptionPeriod(subscription);
    const money = subscriptionAmount(subscription);
    const applied = await deps.rpc("billing_sync_subscription", {
      p_subscription: id,
      p_customer: idOf(subscription.customer),
      p_status: typeof subscription.status === "string" ? subscription.status : null,
      p_period_start: period.start,
      p_period_end: period.end,
      p_cancel_at_period_end: subscription.cancel_at_period_end === true,
      p_amount: money.amount,
      p_currency: money.currency,
      p_livemode: deps.livemode,
    });
    if (applied.error) {
      console.error("[billing-sync] could not apply", id, applied.error.message ?? applied.error);
      failed += 1;
      continue;
    }
    checked += 1;
    const n = (applied.data as { closed?: unknown } | null)?.closed;
    if (typeof n === "number") closed += n;
  }
  if (failed) {
    const { error: alertError } = await deps.rpc("billing_alert_admins", {
      p_key: "billing:sync-failed",
      p_title: "Billing could not check Unlimited with Stripe",
      p_message: `${failed} of ${due.length} Unlimited subscriptions could not be read from Stripe. Their jobs stay live until a run can read them; billing-sync tries every hour.`,
    });
    if (alertError) console.error("[billing-sync] could not tell the admins:", alertError.message ?? alertError);
  }
  return { status: 200, body: { due: due.length, checked, missing, failed, closed } };
}
