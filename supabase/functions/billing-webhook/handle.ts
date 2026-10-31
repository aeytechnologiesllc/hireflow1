/**
 * What billing-webhook does with one Stripe event, once its signature has
 * been checked (index.ts). Pure: the database and Stripe are passed in, so
 * scripts/billing_webhook.test.mjs runs it against a fake Stripe and a fake
 * database (and launch_locks_behaviour section 33 runs the SQL it calls).
 *
 * Every database call here is a billing_* function (service role only,
 * 20261031100000_billing_pricing_v9.sql); each billing_apply_* records the
 * event's id FIRST, in the same transaction as its effect: a repeated event
 * changes nothing and answers { duplicate: true }; a call that fails records
 * nothing, and the 500 makes Stripe send the event again.
 *
 *   checkout.session.completed      a job ($99): the payment read again from
 *                                   Stripe (one refunded already gives
 *                                   nothing), the paid pass, the job live.
 *                                   Unlimited: the subscription (read again
 *                                   from Stripe), and the job named at
 *                                   checkout live. Not paid (Checkout takes
 *                                   cards only): recorded, the admins told.
 *   customer.subscription.created / updated / deleted
 *                                   Unlimited's status and period, read again
 *                                   from Stripe (so events out of order never
 *                                   leave an old state); when it ends, its
 *                                   jobs close and the owner is told. Stripe
 *                                   has no such subscription: recorded, 200.
 *   invoice.payment_failed          the owner is told in the app (once a day).
 *   charge.refunded                 a full refund ends that job's pass and
 *                                   closes the job unless something else
 *                                   covers it.
 *   anything else                   recorded, nothing done.
 *
 * Money is never kept with nothing given: when the database answers that a
 * refund is owed (a payment for a job deleted meanwhile, another business's
 * job, a customer that is not the business named; or a second Unlimited, or
 * one paid after its account was deleted, which is cancelled first), it is
 * refunded here at once (an Idempotency-Key
 * from the event that owed it) and the result told to the database
 * (billing_refund_result), which tells the admins and the business. If Stripe
 * refuses, the answer is 503: Stripe sends the event again, and the refund
 * still owed (billing_refund_owed) is tried again.
 */
import {
  STILL_BILLING,
  idOf,
  isResourceMissing,
  isUnlimitedSubscription,
  stripeErrorCode,
  subscriptionAmount,
  subscriptionPeriod,
  type FormValue,
  type StripeReply,
} from "../_shared/stripe.ts";

export type RpcResult = { data: unknown; error: { message?: string } | null };

export type WebhookDeps = {
  /** A service-role call to a database function. */
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult> | PromiseLike<RpcResult>;
  /** One call to Stripe's API. Never throws: status 0 when Stripe could not be reached. */
  stripe: (method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, FormValue>, options?: { idempotencyKey?: string }) => Promise<StripeReply>;
};

export type WebhookOutcome = { status: number; body: Record<string, unknown> };

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "charge.refunded",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (value: unknown): string | null => (typeof value === "string" && UUID.test(value) ? value : null);

type Event = { id: string; type: string; livemode: boolean };

/** A refund the database says is owed (billing_refund_json). */
type Owed = { id: string; eventId: string; kind: "job_payment" | "second_subscription"; reason: string; paymentIntent: string | null; subscription: string | null };

function owedOf(data: unknown): Owed | null {
  const refund = (data && typeof data === "object" ? (data as { refund?: unknown }).refund : null) as Record<string, unknown> | null;
  if (!refund || typeof refund !== "object" || typeof refund.id !== "string" || typeof refund.eventId !== "string") return null;
  if (refund.kind !== "job_payment" && refund.kind !== "second_subscription") return null;
  return {
    id: refund.id,
    eventId: refund.eventId,
    kind: refund.kind,
    reason: typeof refund.reason === "string" ? refund.reason : "",
    paymentIntent: typeof refund.paymentIntent === "string" ? refund.paymentIntent : null,
    subscription: typeof refund.subscription === "string" ? refund.subscription : null,
  };
}

function refused(reply: StripeReply, what: string): string {
  const message = (reply.body?.error as { message?: unknown } | undefined)?.message;
  return `${what}: ${reply.status || "no answer"}${typeof message === "string" ? ` ${message.slice(0, 160)}` : ""}`;
}

/** One refund in Stripe; a payment refunded already counts as done. */
async function refund(
  deps: WebhookDeps,
  target: { payment_intent: string } | { charge: string },
  reason: "duplicate" | "requested_by_customer",
  metadata: Record<string, string>,
  idempotencyKey: string,
): Promise<{ id: string | null } | { error: string }> {
  const reply = await deps.stripe("POST", "/refunds", { ...target, reason, metadata }, { idempotencyKey });
  if (reply.ok) return { id: typeof reply.body?.id === "string" ? reply.body.id : null };
  if (stripeErrorCode(reply) === "charge_already_refunded") return { id: null };
  return { error: refused(reply, "refund") };
}

/** What an invoice was paid with: a payment intent or a charge (older API versions), or its invoice payments (2025-03-31 and later). */
async function invoicePayments(deps: WebhookDeps, invoice: Record<string, unknown>): Promise<Array<{ payment_intent: string } | { charge: string }> | null> {
  const pi = idOf(invoice.payment_intent);
  if (pi) return [{ payment_intent: pi }];
  const charge = idOf(invoice.charge);
  if (charge) return [{ charge }];
  if (typeof invoice.id !== "string") return [];
  const listed = await deps.stripe("GET", "/invoice_payments", { invoice: invoice.id, limit: 10 });
  if (!listed.ok || !Array.isArray(listed.body?.data)) return null;
  const out: Array<{ payment_intent: string } | { charge: string }> = [];
  for (const row of listed.body!.data as Array<Record<string, unknown>>) {
    if (row.status !== "paid") continue;
    const payment = (row.payment ?? {}) as Record<string, unknown>;
    const viaIntent = idOf(payment.payment_intent);
    const viaCharge = idOf(payment.charge);
    if (viaIntent) out.push({ payment_intent: viaIntent });
    else if (viaCharge) out.push({ charge: viaCharge });
  }
  return out;
}

/** Does what is owed in Stripe: cancels a second Unlimited and refunds what it took, or refunds a payment. */
async function settleInStripe(owed: Owed, deps: WebhookDeps): Promise<{ refunds: string[] } | { error: string }> {
  const refunds: string[] = [];
  if (owed.kind === "second_subscription") {
    if (!owed.subscription) return { error: "no subscription named" };
    const path = `/subscriptions/${encodeURIComponent(owed.subscription)}`;
    const cancelled = await deps.stripe("DELETE", path);
    if (!cancelled.ok && !isResourceMissing(cancelled)) {
      // Cancelled meanwhile (Stripe will not cancel it twice): read it again.
      const now = await deps.stripe("GET", path);
      if (!now.ok || STILL_BILLING.has(String(now.body?.status ?? ""))) return { error: refused(cancelled, "cancel") };
    }
    const invoices = await deps.stripe("GET", "/invoices", { subscription: owed.subscription, limit: 10 });
    if (!invoices.ok || !Array.isArray(invoices.body?.data)) return { error: refused(invoices, "invoices") };
    for (const invoice of invoices.body!.data as Array<Record<string, unknown>>) {
      if (typeof invoice.amount_paid !== "number" || invoice.amount_paid <= 0) continue;
      const paidWith = await invoicePayments(deps, invoice);
      if (paidWith === null) return { error: "could not read the invoice's payments" };
      for (const [i, target] of paidWith.entries()) {
        const done = await refund(deps, target, "duplicate", { hireflow: owed.reason || "second_unlimited", subscription: owed.subscription },
          `hireflow-refund-${owed.eventId}-${String(invoice.id ?? "invoice")}-${i}`);
        if ("error" in done) return done;
        if (done.id) refunds.push(done.id);
      }
    }
    return { refunds };
  }
  if (!owed.paymentIntent) return { error: "no payment named" };
  const done = await refund(deps, { payment_intent: owed.paymentIntent }, "requested_by_customer", { hireflow: owed.reason }, `hireflow-refund-${owed.eventId}`);
  if ("error" in done) return done;
  if (done.id) refunds.push(done.id);
  return { refunds };
}

/** The database's answer, and any refund it owes (or still owes, on Stripe's retry of the event), done in Stripe. */
async function done(result: RpcResult, what: string, event: Event, deps: WebhookDeps, mayOwe = false): Promise<WebhookOutcome> {
  if (result.error) {
    console.error(`[billing-webhook] ${what}: the database refused:`, result.error.message ?? result.error);
    // Nothing was recorded (the event's id goes in with its effect): Stripe sends it again.
    return { status: 500, body: { error: "not recorded; Stripe will send it again" } };
  }
  const data = (result.data ?? {}) as Record<string, unknown>;
  if (!mayOwe) return { status: 200, body: { received: true, ...data } };
  let owed = owedOf(data);
  if (!owed && data.duplicate === true) {
    const still = await deps.rpc("billing_refund_owed", { p_event_id: event.id });
    if (still.error) {
      console.error("[billing-webhook] could not read a refund still owed:", still.error.message ?? still.error);
      return { status: 500, body: { error: "not read; Stripe will send it again" } };
    }
    owed = owedOf(still.data);
  }
  if (!owed) return { status: 200, body: { received: true, ...data } };
  const settled = await settleInStripe(owed, deps);
  const error = "error" in settled ? settled.error : null;
  const told = await deps.rpc("billing_refund_result", {
    p_refund: owed.id,
    p_stripe_refunds: "refunds" in settled && settled.refunds.length ? settled.refunds.join(",") : null,
    p_error: error,
  });
  if (told.error) console.error("[billing-webhook] could not record the refund's result:", told.error.message ?? told.error);
  if (error || told.error) {
    console.error(`[billing-webhook] ${what}: a refund owed is not done yet:`, error ?? "not recorded");
    return { status: 503, body: { error: "a refund owed is not done yet; Stripe will send it again" } };
  }
  return { status: 200, body: { received: true, ...data, refunded: true } };
}

const record = (deps: WebhookDeps, event: Event, outcome: string) =>
  deps.rpc("billing_record_event", { p_event_id: event.id, p_event_type: event.type, p_livemode: event.livemode, p_outcome: outcome });

const notPaid = (deps: WebhookDeps, event: Event, session: string | null, kind: string, paymentStatus: string) =>
  deps.rpc("billing_record_unpaid_checkout", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_livemode: event.livemode,
    p_session: session,
    p_kind: kind,
    p_payment_status: paymentStatus,
  });

/** The subscription as Stripe has it now, applied for this event. */
async function applySubscription(event: Event, subscriptionId: string | null, jobId: string | null, deps: WebhookDeps): Promise<WebhookOutcome> {
  if (!subscriptionId) return done(await record(deps, event, "ignored: no subscription"), event.type, event, deps);
  const reply = await deps.stripe("GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  // Stripe has no such subscription (in this mode): that will not change, so it is recorded, never retried for days.
  if (isResourceMissing(reply)) return done(await record(deps, event, "ignored: Stripe has no such subscription"), event.type, event, deps);
  const subscription = reply.ok ? reply.body : null;
  if (!subscription) {
    // Stripe did not answer: nothing recorded, so the retry tries again.
    return { status: 503, body: { error: "could not read the subscription from Stripe; Stripe will send it again" } };
  }
  if (!isUnlimitedSubscription(subscription)) {
    return done(await record(deps, event, "ignored: not the Unlimited price"), event.type, event, deps);
  }
  const period = subscriptionPeriod(subscription);
  const money = subscriptionAmount(subscription);
  return done(
    await deps.rpc("billing_apply_subscription", {
      p_event_id: event.id,
      p_event_type: event.type,
      p_livemode: event.livemode,
      p_customer: idOf(subscription.customer),
      p_subscription: idOf(subscription.id),
      p_status: typeof subscription.status === "string" ? subscription.status : null,
      p_period_start: period.start,
      p_period_end: period.end,
      p_cancel_at_period_end: subscription.cancel_at_period_end === true,
      p_amount: money.amount,
      p_currency: money.currency,
      p_job: jobId,
    }),
    event.type,
    event,
    deps,
    true,
  );
}

/** A $99 checkout: the payment as Stripe has it now, then the pass. */
async function applyJobPayment(event: Event, object: Record<string, unknown>, metadata: Record<string, unknown>, deps: WebhookDeps): Promise<WebhookOutcome> {
  const session = idOf(object.id);
  const owner = uuidOrNull(metadata.owner_id);
  const job = uuidOrNull(metadata.job_id);
  if (!owner || !job) return done(await record(deps, event, "ignored: no owner or job in the metadata"), event.type, event, deps);
  const paymentIntent = idOf(object.payment_intent);
  if (!paymentIntent) return done(await notPaid(deps, event, session, "job", "paid, but no payment named"), event.type, event, deps);
  // Read again: a payment refunded before this event came (a retried delivery) gives nothing.
  const charges = await deps.stripe("GET", "/charges", { payment_intent: paymentIntent, limit: 10 });
  if (!charges.ok || !Array.isArray(charges.body?.data)) {
    return { status: 503, body: { error: "could not read the payment from Stripe; Stripe will send it again" } };
  }
  const succeeded = (charges.body!.data as Array<Record<string, unknown>>).filter((c) => c.paid === true && c.status === "succeeded");
  if (!succeeded.length) return done(await notPaid(deps, event, session, "job", "no payment went through"), event.type, event, deps);
  if (succeeded.every((c) => c.refunded === true)) return done(await record(deps, event, "ignored: refunded before it was recorded"), event.type, event, deps);
  return done(
    await deps.rpc("billing_apply_job_payment", {
      p_event_id: event.id,
      p_event_type: event.type,
      p_livemode: event.livemode,
      p_owner: owner,
      p_customer: idOf(object.customer),
      p_job: job,
      p_session: session,
      p_payment_intent: paymentIntent,
      p_amount: typeof object.amount_total === "number" ? object.amount_total : null,
      p_currency: typeof object.currency === "string" ? object.currency : null,
    }),
    event.type,
    event,
    deps,
    true,
  );
}

export async function handleStripeEvent(raw: unknown, deps: WebhookDeps): Promise<WebhookOutcome> {
  const e = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const id = typeof e.id === "string" && /^evt_[A-Za-z0-9_]+$/.test(e.id) ? e.id : null;
  const type = typeof e.type === "string" ? e.type : null;
  const object = ((e.data as { object?: unknown } | undefined)?.object ?? null) as Record<string, unknown> | null;
  if (!id || !type || !object || typeof object !== "object") return { status: 400, body: { error: "not a Stripe event" } };
  const event: Event = { id, type, livemode: e.livemode === true };

  switch (type) {
    case "checkout.session.completed": {
      const metadata = (object.metadata ?? {}) as Record<string, unknown>;
      const kind = metadata.kind;
      const ours = (object.mode === "payment" && kind === "job") || (object.mode === "subscription" && kind === "unlimited");
      if (!ours) return done(await record(deps, event, "ignored: not a HireFlow checkout"), type, event, deps);
      // Checkout takes cards only, so it is paid when it completes; anything else is told, never ignored.
      if (object.payment_status !== "paid") {
        return done(await notPaid(deps, event, idOf(object.id), String(kind), String(object.payment_status ?? "unknown").slice(0, 40)), type, event, deps);
      }
      if (kind === "job") return applyJobPayment(event, object, metadata, deps);
      return applySubscription(event, idOf(object.subscription), uuidOrNull(metadata.job_id), deps);
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return applySubscription(event, idOf(object.id), null, deps);
    case "invoice.payment_failed": {
      const customer = idOf(object.customer);
      if (!customer) return done(await record(deps, event, "ignored: no customer"), type, event, deps);
      const parent = (object.parent ?? {}) as { subscription_details?: { subscription?: unknown } };
      const subscription = idOf(object.subscription) ?? idOf(parent.subscription_details?.subscription);
      return done(
        await deps.rpc("billing_apply_payment_failed", { p_event_id: event.id, p_event_type: type, p_livemode: event.livemode, p_customer: customer, p_subscription: subscription }),
        type,
        event,
        deps,
      );
    }
    case "charge.refunded":
      return done(
        await deps.rpc("billing_apply_refund", {
          p_event_id: event.id,
          p_event_type: type,
          p_livemode: event.livemode,
          p_payment_intent: idOf(object.payment_intent),
          p_fully_refunded: object.refunded === true,
        }),
        type,
        event,
        deps,
      );
    default:
      return done(await record(deps, event, `ignored: ${type.slice(0, 80)}`), type, event, deps);
  }
}
