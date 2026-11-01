/**
 * stripe.ts — talking to Stripe for billing (pricing v9; docs/BILLING.md).
 *
 * No Stripe library: the REST API with fetch, form-encoded, the way Stripe's
 * own docs show it with curl. No remote imports either, so Node tests load
 * this file as it is (scripts/billing_webhook.test.mjs,
 * scripts/billing_checkout.test.mjs).
 *
 *   - stripeConfig: both secrets, or null. While either is missing every
 *     billing function answers 503 "billing is not set up" and nothing else
 *     changes (the owner sets them himself, last).
 *   - Prices are found by lookup key (hireflow_job_30d_v1,
 *     hireflow_unlimited_monthly_v1), never by a hard-coded price id: test
 *     and live mode have different ids, the keys are the same (guard
 *     billing-prices-by-lookup-key).
 *   - verifyStripeSignature: the Stripe-Signature header, an HMAC-SHA256 of
 *     "<timestamp>.<raw body>" with the endpoint's signing secret, compared in
 *     constant time against every v1 the header carries, within a 5-minute
 *     tolerance (Stripe's own default).
 *   - STILL_BILLING, subscriptionsOfCustomer: what Stripe may still charge
 *     (billing-checkout refuses a second Unlimited on Stripe's own list).
 *   - cancelEverySubscription: delete-account's cancel of everything a
 *     business still pays for, never taking "no such subscription" across
 *     test and live mode.
 */

export const STRIPE_API = "https://api.stripe.com/v1";

/** The $99, 30-day job. */
export const JOB_PRICE_LOOKUP_KEY = "hireflow_job_30d_v1";
/** Unlimited, $299 a month. */
export const UNLIMITED_PRICE_LOOKUP_KEY = "hireflow_unlimited_monthly_v1";

/** How old (or how far ahead) a signed webhook may be, in seconds. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

/** What every billing function says while a secret is missing. */
export const NOT_SET_UP = "billing is not set up";

export type StripeConfig = { secretKey: string; webhookSecret: string; livemode: boolean };

/** Both secrets, or null (billing is not set up). */
export function stripeConfig(env: (key: string) => string | undefined): StripeConfig | null {
  const secretKey = (env("STRIPE_SECRET_KEY") ?? "").trim();
  const webhookSecret = (env("STRIPE_WEBHOOK_SECRET") ?? "").trim();
  if (!secretKey || !webhookSecret) return null;
  return { secretKey, webhookSecret, livemode: /^(?:sk|rk)_live_/.test(secretKey) };
}

export type FormValue = string | number | boolean | null | undefined | FormValue[] | { [key: string]: FormValue };

/** Stripe's form encoding: nested keys as a[b][c], lists as a[0][b]. */
export function formEncode(params: Record<string, FormValue>): string {
  const out: string[] = [];
  const add = (key: string, value: FormValue) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => add(`${key}[${i}]`, item));
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value)) add(`${key}[${k}]`, v);
      return;
    }
    out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  };
  for (const [key, value] of Object.entries(params)) add(key, value);
  return out.join("&");
}

export type StripeReply = { ok: boolean; status: number; body: Record<string, unknown> | null };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** One call to Stripe's API. Never throws: a network failure is { ok: false, status: 0 }. */
export async function stripeRequest(
  config: StripeConfig,
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: Record<string, FormValue> = {},
  options: { idempotencyKey?: string; fetchImpl?: FetchLike } = {},
): Promise<StripeReply> {
  const encoded = formEncode(params);
  const url = method === "GET" && encoded ? `${STRIPE_API}${path}?${encoded}` : `${STRIPE_API}${path}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${config.secretKey}` };
  if (method === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  try {
    const res = await (options.fetchImpl ?? fetch)(url, { method, headers, body: method === "POST" ? encoded : undefined });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    console.error("[stripe] request failed:", method, path, e instanceof Error ? e.message : String(e));
    return { ok: false, status: 0, body: null };
  }
}

export type FoundPrice = { id: string; unitAmount: number | null; currency: string | null; recurring: boolean };

/**
 * The active price with this lookup key: { reached: true, price } (price null
 * when Stripe has none), or { reached: false } when Stripe did not answer.
 */
export async function priceByLookupKey(
  config: StripeConfig,
  lookupKey: string,
  fetchImpl?: FetchLike,
): Promise<{ reached: true; price: FoundPrice | null } | { reached: false }> {
  const reply = await stripeRequest(config, "GET", "/prices", { "lookup_keys[]": lookupKey, active: "true", limit: 1 }, { fetchImpl });
  if (!reply.ok || !Array.isArray(reply.body?.data)) return { reached: false };
  const list = reply.body!.data as Array<Record<string, unknown>>;
  const price = list.find((p) => p.lookup_key === lookupKey && p.active !== false);
  if (!price || typeof price.id !== "string") return { reached: true, price: null };
  return {
    reached: true,
    price: {
      id: price.id,
      unitAmount: typeof price.unit_amount === "number" ? price.unit_amount : null,
      currency: typeof price.currency === "string" ? price.currency : null,
      recurring: !!price.recurring,
    },
  };
}

/** Subscription statuses that still charge, or will once a payment goes through. */
export const STILL_BILLING = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"]);

/** Stripe's own "there is no such object" (in this mode, on this account). */
export function isResourceMissing(reply: StripeReply): boolean {
  const code = (reply.body?.error as { code?: unknown } | undefined)?.code;
  return reply.status === 404 && code === "resource_missing";
}

/** Stripe's error code on a refused call, or null. */
export function stripeErrorCode(reply: StripeReply): string | null {
  const code = (reply.body?.error as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : null;
}

/** The parameter Stripe refused (error.param), or null. */
export function stripeErrorParam(reply: StripeReply): string | null {
  const param = (reply.body?.error as { param?: unknown } | undefined)?.param;
  return typeof param === "string" ? param : null;
}

/**
 * A receipt address worth keeping: Stripe's own page (a hosted invoice on
 * invoice.stripe.com, a receipt on pay.stripe.com), https only. The database
 * holds the same rule (public.billing_receipt_url, 20261101100000).
 */
export function stripeReceiptUrl(value: unknown): string | null {
  return typeof value === "string" && value.length <= 2000 && /^https:\/\/([a-z0-9-]+\.)*stripe\.com\/[^\s"'<>]*$/.test(value) ? value : null;
}

/** The subscription an invoice bills, wherever this API version keeps it. */
export function invoiceSubscription(invoice: Record<string, unknown>): string | null {
  const parent = (invoice.parent ?? {}) as { subscription_details?: { subscription?: unknown } };
  return idOf(invoice.subscription) ?? idOf(parent.subscription_details?.subscription);
}

/** The period a subscription invoice paid for (its first line's), as ISO strings. */
export function invoicePeriod(invoice: Record<string, unknown>): { start: string | null; end: string | null } {
  const lines = (invoice.lines as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? [];
  const period = (lines[0]?.period ?? {}) as { start?: unknown; end?: unknown };
  return { start: isoFromUnix(period.start), end: isoFromUnix(period.end) };
}

/**
 * Every subscription Stripe holds for a customer (any status): { reached:
 * true, list } or { reached: false } when Stripe did not answer.
 */
export async function subscriptionsOfCustomer(
  config: StripeConfig,
  customer: string,
  fetchImpl?: FetchLike,
): Promise<{ reached: true; list: Array<Record<string, unknown>> } | { reached: false }> {
  const reply = await stripeRequest(config, "GET", "/subscriptions", { customer, status: "all", limit: 100 }, { fetchImpl });
  if (!reply.ok || !Array.isArray(reply.body?.data)) return { reached: false };
  return { reached: true, list: reply.body!.data as Array<Record<string, unknown>> };
}

export type CancelPlan = { stripe_subscription_id?: string | null; status?: string | null; livemode?: boolean | null };
export type CancelCustomer = { stripe_customer_id?: string | null; livemode?: boolean | null };
export type CancelOutcome =
  | { ok: true; cancelled: string[] }
  /** Stripe could not be reached or refused: nothing is deleted, try again. */
  | { ok: false; cancelled: string[]; reason: "try_again" }
  /** The keys are missing, or are the other mode's, while a subscription still bills: a person has to look. */
  | { ok: false; cancelled: string[]; reason: "contact_us"; detail: string };

/**
 * Cancels, at once, every subscription a business still pays for (delete-
 * account: a deleted account is never charged again): the one HireFlow
 * tracks, and every one Stripe lists for the business's customers in the
 * key's mode that is not already over. "No such subscription" counts as gone
 * only when the tracked row is in the key's own mode; a row in the other mode,
 * or no keys at all while one still bills, is "contact_us" (nothing deleted).
 * Each customer's open Checkout pages are expired first, so none can be paid
 * once the account is gone (one paid in the moment between is owed back by
 * the webhook: billing_deleted_customers).
 */
export async function cancelEverySubscription(
  config: StripeConfig | null,
  plans: CancelPlan[],
  customers: CancelCustomer[],
  fetchImpl?: FetchLike,
): Promise<CancelOutcome> {
  const cancelled: string[] = [];
  const billing = plans.filter((p) => p.stripe_subscription_id && STILL_BILLING.has(String(p.status ?? "")));
  if (!config) {
    if (billing.length) return { ok: false, cancelled, reason: "contact_us", detail: "the Stripe keys are not set while an Unlimited subscription is on" };
    return { ok: true, cancelled };
  }
  const mode = config.livemode;
  const tried = new Set<string>();
  const cancel = async (id: string): Promise<"cancelled" | "gone" | "failed"> => {
    tried.add(id);
    const reply = await stripeRequest(config, "DELETE", `/subscriptions/${encodeURIComponent(id)}`, {}, { fetchImpl });
    if (reply.ok) {
      cancelled.push(id);
      return "cancelled";
    }
    if (isResourceMissing(reply)) return "gone";
    // Already over (cancelled meanwhile): Stripe refuses to cancel it again.
    const now = await stripeRequest(config, "GET", `/subscriptions/${encodeURIComponent(id)}`, {}, { fetchImpl });
    if (now.ok && !STILL_BILLING.has(String(now.body?.status ?? ""))) return "gone";
    return "failed";
  };
  for (const plan of billing) {
    const id = plan.stripe_subscription_id as string;
    if (plan.livemode !== mode) {
      return { ok: false, cancelled, reason: "contact_us", detail: `Unlimited ${id} is ${plan.livemode ? "live" : "test"} mode, the key is ${mode ? "live" : "test"} mode` };
    }
    if ((await cancel(id)) === "failed") return { ok: false, cancelled, reason: "try_again" };
  }
  for (const customer of customers) {
    if (!customer.stripe_customer_id || customer.livemode !== mode) continue;
    const open = await stripeRequest(config, "GET", "/checkout/sessions", { customer: customer.stripe_customer_id, status: "open", limit: 100 }, { fetchImpl });
    if (!open.ok || !Array.isArray(open.body?.data)) return { ok: false, cancelled, reason: "try_again" };
    for (const page of open.body!.data as Array<Record<string, unknown>>) {
      const id = typeof page.id === "string" ? page.id : null;
      if (!id) continue;
      const expired = await stripeRequest(config, "POST", `/checkout/sessions/${encodeURIComponent(id)}/expire`, {}, { fetchImpl });
      if (expired.ok) continue;
      // Completed or expired meanwhile: Stripe will not expire it, and a paid one is listed below.
      const now = await stripeRequest(config, "GET", `/checkout/sessions/${encodeURIComponent(id)}`, {}, { fetchImpl });
      if (!now.ok || now.body?.status === "open") return { ok: false, cancelled, reason: "try_again" };
    }
    const listed = await subscriptionsOfCustomer(config, customer.stripe_customer_id, fetchImpl);
    if (!listed.reached) return { ok: false, cancelled, reason: "try_again" };
    for (const sub of listed.list) {
      const id = typeof sub.id === "string" ? sub.id : null;
      if (!id || tried.has(id) || sub.status === "canceled" || sub.status === "incomplete_expired") continue;
      if ((await cancel(id)) === "failed") return { ok: false, cancelled, reason: "try_again" };
    }
  }
  return { ok: true, cancelled };
}

/** The Stripe-Signature header's timestamp and every v1 signature in it. */
export function parseSignatureHeader(header: string | null | undefined): { timestamp: number | null; signatures: string[] } {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of String(header ?? "").split(",")) {
    const at = part.indexOf("=");
    if (at < 0) continue;
    const key = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (key === "t" && /^\d{1,12}$/.test(value)) timestamp = Number(value);
    else if (key === "v1" && /^[0-9a-f]{64}$/i.test(value)) signatures.push(value.toLowerCase());
  }
  return { timestamp, signatures };
}

/** Equal strings, compared in time that does not depend on where they differ. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** HMAC-SHA256 of a message, as lowercase hex. */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type SignatureCheck = { ok: true } | { ok: false; reason: "no_header" | "no_signature" | "too_old" | "mismatch" };

/**
 * Whether a webhook body really came from Stripe: the raw body exactly as
 * received (never re-serialised JSON), its Stripe-Signature header and the
 * endpoint's signing secret.
 */
export async function verifyStripeSignature(
  payload: string,
  header: string | null | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = WEBHOOK_TOLERANCE_SECONDS,
): Promise<SignatureCheck> {
  if (!header) return { ok: false, reason: "no_header" };
  const { timestamp, signatures } = parseSignatureHeader(header);
  if (timestamp === null || signatures.length === 0) return { ok: false, reason: "no_signature" };
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return { ok: false, reason: "too_old" };
  const expected = await hmacSha256Hex(secret, `${timestamp}.${payload}`);
  let matched = false;
  // Every signature is compared (no early return), each in constant time.
  for (const signature of signatures) matched = timingSafeEqual(signature, expected) || matched;
  return matched ? { ok: true } : { ok: false, reason: "mismatch" };
}

/** The Stripe-Signature header Stripe would send for this body (tests, and the go-live check in docs/BILLING.md). */
export async function signStripePayload(payload: string, secret: string, timestamp: number): Promise<string> {
  return `t=${timestamp},v1=${await hmacSha256Hex(secret, `${timestamp}.${payload}`)}`;
}

/**
 * Where Checkout and the billing portal send people back: the page's own
 * origin when it is one of HireFlow's (the staff host, the main host, or one
 * named in BILLING_RETURN_ORIGINS), else the main site. The path is always
 * the function's own, never the request's, so nobody can use a checkout to
 * send someone elsewhere.
 */
export function returnOrigin(requestOrigin: string | null | undefined, env: (key: string) => string | undefined): string {
  const allowed = new Set(["https://hireflownow.com", "https://staff.hireflownow.com", "https://www.hireflownow.com"]);
  for (const extra of String(env("BILLING_RETURN_ORIGINS") ?? "").split(",")) {
    const trimmed = extra.trim().replace(/\/+$/, "");
    if (/^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(trimmed)) allowed.add(trimmed.toLowerCase());
  }
  const origin = String(requestOrigin ?? "").trim().replace(/\/+$/, "").toLowerCase();
  return allowed.has(origin) ? origin : "https://hireflownow.com";
}

/** A Stripe object's id, whether it came expanded or as the bare id. */
export function idOf(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") return (value as { id: string }).id;
  return null;
}

/** A Stripe unix time as an ISO string, or null. */
export function isoFromUnix(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? new Date(value * 1000).toISOString() : null;
}

/**
 * A subscription's period, wherever this API version keeps it: on the
 * subscription (older versions) or on its items (2025-03-31 and later).
 */
export function subscriptionPeriod(subscription: Record<string, unknown>): { start: string | null; end: string | null } {
  const items = (subscription.items as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? [];
  const first = items[0] ?? {};
  return {
    start: isoFromUnix(subscription.current_period_start) ?? isoFromUnix(first.current_period_start),
    end: isoFromUnix(subscription.current_period_end) ?? isoFromUnix(first.current_period_end),
  };
}

/** Whether a subscription is for Unlimited (its price carries the Unlimited lookup key). */
export function isUnlimitedSubscription(subscription: Record<string, unknown>): boolean {
  const items = (subscription.items as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? [];
  return items.some((item) => (item.price as { lookup_key?: unknown } | undefined)?.lookup_key === UNLIMITED_PRICE_LOOKUP_KEY);
}

/** What the subscription costs a period, in cents, and its currency. */
export function subscriptionAmount(subscription: Record<string, unknown>): { amount: number | null; currency: string | null } {
  const items = (subscription.items as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? [];
  const price = (items[0]?.price ?? {}) as { unit_amount?: unknown; currency?: unknown };
  return {
    amount: typeof price.unit_amount === "number" ? price.unit_amount : null,
    currency: typeof price.currency === "string" ? price.currency : typeof subscription.currency === "string" ? subscription.currency : null,
  };
}
