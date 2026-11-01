/**
 * billing.ts — what the hiring side shows about billing (pricing v9,
 * 2026-10-31; docs/BILLING.md), and how it reads the server's answers.
 *
 *   - A business's first published job is free for 30 days; then $99 a job
 *     (30 days, unlimited applicants), or Unlimited at $299 a month.
 *   - The platform's own account is exempt, and sees "Your account is exempt".
 *   - While billing is off (app_settings.billing_enabled, false) every
 *     function here answers nothing: no price, no plan, no days left, no
 *     "upgrade". CLAUDE.md: "Nothing may sit behind a paywall or show a price
 *     as due while billing is off." The prices are written only in this file
 *     (guard billing-off-changes-nothing), and every screen asks
 *     billingShown() first, or shows them only after the database refused a
 *     publish for payment, which it never does while billing is off.
 *   - Applicants never see any of it: get-subscription answers them nothing.
 *
 * The state comes from get-subscription (public.billing_state); the refusal
 * from jobs_publish_needs_pass (HINT payment_required); checkout and the
 * billing portal from billing-checkout and billing-portal (src/lib/billingApi.ts).
 *
 * No imports: scripts/billing_screens.test.mjs loads it in Node.
 */

/** The two prices, as they are said (the Stripe prices are found by lookup key on the server). */
export const PRICE_JOB = "$99";
export const PRICE_UNLIMITED = "$299 a month";
/** How long a job's pass lasts, free or paid. */
export const PASS_DAYS = 30;

export type PassKind = "free" | "paid" | "launch" | "unlimited";

export interface JobPass {
  kind: PassKind | null;
  /** The end of its 30 days (null for a job only Unlimited covers). */
  endsAt: string | null;
  /** Time left on a free, paid or launch pass. */
  timeLeft: boolean;
  refunded: boolean;
}

export interface UnlimitedState {
  status: string | null;
  active: boolean;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * One payment, as HireFlow recorded it (public.billing_history, 2026-11-01):
 * a $99 job pass, or an Unlimited invoice. Only the business owner is given
 * these (get-subscription): a teammate never sees an amount.
 */
export interface BillingPayment {
  kind: "job" | "unlimited";
  jobId: string | null;
  /** The job's title (as it is now, or as it was when paid for). */
  title: string | null;
  /** What was actually charged, in cents (the $1 test shows $1.00). */
  amountCents: number | null;
  currency: string | null;
  paidAt: string;
  /** What it paid for: a job's 30 days, or Unlimited's month. */
  startsAt: string | null;
  endsAt: string | null;
  /** Stripe's own receipt or invoice page (https on stripe.com only), or null. */
  receiptUrl: string | null;
  refunded: boolean;
}

export interface BillingState {
  billingEnabled: boolean;
  exempt: boolean;
  plan: "unlimited" | "pay_per_job" | null;
  freeJobAvailable: boolean | null;
  unlimited: UnlimitedState | null;
  hasCustomer: boolean;
  jobs: Record<string, JobPass>;
  /** The owner's payment history, newest first; null when not given (a teammate) or unreadable. */
  payments: BillingPayment[] | null;
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

/** A receipt address worth showing: Stripe's own page, https only (the database keeps nothing else either). */
export function stripeReceiptUrl(value: unknown): string | null {
  return typeof value === "string" && value.length <= 2000 && /^https:\/\/([a-z0-9-]+\.)*stripe\.com\/[^\s"'<>]*$/.test(value) ? value : null;
}

function readPayment(raw: unknown): BillingPayment | null {
  if (!isObject(raw)) return null;
  const kind = raw.kind === "job" || raw.kind === "unlimited" ? raw.kind : null;
  const paidAt = text(raw.paidAt);
  if (!kind || !paidAt || !Number.isFinite(Date.parse(paidAt))) return null;
  return {
    kind,
    jobId: text(raw.jobId),
    title: text(raw.title),
    amountCents: typeof raw.amountCents === "number" && Number.isFinite(raw.amountCents) && raw.amountCents >= 0 ? Math.round(raw.amountCents) : null,
    currency: typeof raw.currency === "string" && /^[a-z]{3}$/i.test(raw.currency) ? raw.currency.toLowerCase() : null,
    paidAt,
    startsAt: text(raw.startsAt),
    endsAt: text(raw.endsAt),
    receiptUrl: stripeReceiptUrl(raw.receiptUrl),
    refunded: raw.refunded === true,
  };
}

/** get-subscription's `billing`, read defensively. Anything unreadable is null, which every screen treats as off. */
export function readBillingState(raw: unknown): BillingState | null {
  if (!isObject(raw) || typeof raw.billingEnabled !== "boolean") return null;
  const jobs: Record<string, JobPass> = {};
  if (isObject(raw.jobs)) {
    for (const [id, value] of Object.entries(raw.jobs)) {
      if (!isObject(value)) continue;
      const kind = value.kind === "free" || value.kind === "paid" || value.kind === "launch" || value.kind === "unlimited" ? value.kind : null;
      jobs[id] = { kind, endsAt: text(value.endsAt), timeLeft: value.timeLeft === true, refunded: value.refunded === true };
    }
  }
  const unlimited = isObject(raw.unlimited)
    ? {
        status: text(raw.unlimited.status),
        active: raw.unlimited.active === true,
        periodEnd: text(raw.unlimited.periodEnd),
        cancelAtPeriodEnd: raw.unlimited.cancelAtPeriodEnd === true,
      }
    : null;
  return {
    billingEnabled: raw.billingEnabled,
    exempt: raw.exempt === true,
    plan: raw.plan === "unlimited" || raw.plan === "pay_per_job" ? raw.plan : null,
    freeJobAvailable: typeof raw.freeJobAvailable === "boolean" ? raw.freeJobAvailable : null,
    unlimited,
    hasCustomer: raw.hasCustomer === true,
    jobs,
    payments: Array.isArray(raw.payments) ? raw.payments.map(readPayment).filter((p): p is BillingPayment => p !== null) : null,
  };
}

/** Whether any billing may be shown at all: only while billing is on. */
export function billingShown(state: BillingState | null | undefined): state is BillingState {
  return !!state && state.billingEnabled === true;
}

/** The database's refusal to put a job live until it is paid for (jobs_publish_needs_pass). */
export function isPaymentRequiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { hint?: unknown; message?: unknown };
  return e.hint === "payment_required" || (typeof e.message === "string" && /Your free job is used/i.test(e.message));
}

/** Whole days until `endsAt` (rounded up), never below 0. */
export function daysLeft(endsAt: string | null | undefined, now: number = Date.now()): number | null {
  if (!endsAt) return null;
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - now) / 86_400_000));
}

/** "March 4, 2027". */
export function billingDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  return new Date(at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/**
 * The short line beside a job on the Jobs list and the job page, or null.
 * `status` is the cockpit's: "live", "draft" or "closed".
 */
export function jobPassLine(
  state: BillingState | null | undefined,
  jobId: string,
  status: string,
  now: number = Date.now(),
): string | null {
  if (!billingShown(state) || state.exempt) return null;
  const pass = state.jobs[jobId];
  if (!pass) return null;
  if (status === "live") {
    // Unlimited covers it: no clock to show.
    if (state.plan === "unlimited") return null;
    if (!pass.timeLeft) return null;
    const left = daysLeft(pass.endsAt, now);
    if (left === null) return null;
    if (left <= 1) return pass.kind === "free" ? "Free job, last day" : "Last day";
    return pass.kind === "free" ? `Free job, ${left} days left` : `${left} days left`;
  }
  if (status === "closed") {
    if (pass.refunded && !pass.timeLeft) return "Refunded";
    if (!pass.timeLeft && (pass.kind === "free" || pass.kind === "paid" || pass.kind === "launch")) return `Its ${PASS_DAYS} days ended`;
  }
  return null;
}

/**
 * Whether putting this (closed or draft) job live again needs a payment, as
 * far as the page can tell: billing on, not exempt, no Unlimited, the free job
 * used and no time left on the job. The database decides in the end
 * (jobs_publish_needs_pass); this only lets "Post it again" go straight to
 * paying instead of through the editor.
 */
export function repostNeedsPayment(state: BillingState | null | undefined, jobId: string): boolean {
  if (!billingShown(state) || state.exempt || state.plan === "unlimited" || state.freeJobAvailable !== false) return false;
  return !state.jobs[jobId]?.timeLeft;
}

/**
 * The status a job keeps when the database refused to put it live for
 * payment and the page saves what was written anyway: the job's status as the
 * database has it now (a job the hourly run closed while its editor was open
 * stays closed, "Its 30 days ended", never a draft), or a draft for a job
 * that was never saved or is somehow live.
 */
export function statusAfterRefusedPublish(current: string | null | undefined): "draft" | "closed" | "archived" {
  return current === "closed" || current === "archived" ? current : "draft";
}

export const PUBLISH_PAYMENT_WORDS = {
  title: "Your free job is used",
  intro: (jobTitle?: string | null) =>
    `Publish ${jobTitle ? `\u201c${jobTitle}\u201d` : "this job"} for ${PRICE_JOB} (${PASS_DAYS} days, unlimited applicants) or go Unlimited for ${PRICE_UNLIMITED}.`,
  jobHeading: "This job",
  jobPrice: PRICE_JOB,
  jobNote: `Live for ${PASS_DAYS} days. Unlimited applicants.`,
  jobButton: `Pay ${PRICE_JOB} and publish`,
  unlimitedHeading: "Unlimited",
  unlimitedPrice: PRICE_UNLIMITED,
  unlimitedNote: "Every job live while it lasts. Unlimited applicants. Cancel any time.",
  unlimitedButton: "Go Unlimited",
  opening: "Opening checkout…",
  saved: "Your job is saved. It goes live once it's paid for.",
  notSaved: "It goes live as soon as it's paid for.",
  later: "Not now",
} as const;

/** Paying inside HireFlow: Stripe's form in a dialog (StripeCheckoutForm). */
export const CHECKOUT_DIALOG_WORDS = {
  jobTitle: (jobTitle?: string | null) => `Pay for ${jobTitle ? `“${jobTitle}”` : "this job"}`,
  unlimitedTitle: "Go Unlimited",
  secure: "Your card goes straight to Stripe, our payment processor. HireFlow never sees it.",
  back: "Choose another way",
  paidTitle: "Payment",
  paidDescription: "What you paid, and what it bought.",
  opening: "Opening checkout…",
} as const;

/** After Checkout, back on the job page (?billing=…). */
export const PAID_RETURN_WORDS = {
  waiting: "Payment received. Putting your job live…",
  live: `Your job is live for ${PASS_DAYS} days.`,
  liveUnlimited: "Unlimited is on, and your job is live.",
  slow: "Your payment went through. The job goes live as soon as the payment is confirmed, usually within a minute. This page updates by itself.",
  cancelled: "No payment was taken. The job isn't live.",
} as const;

/** After Checkout or the billing page, back on Settings. */
export const SETTINGS_RETURN_WORDS = {
  waiting: "Payment received. Turning Unlimited on…",
  on: "Unlimited is on.",
  slow: "Your payment went through. Unlimited turns on as soon as it's confirmed, usually within a minute.",
  cancelled: "No payment was taken.",
} as const;

/** What ?billing= on a page says happened, or null. */
export function billingReturn(param: string | null | undefined): "paid" | "unlimited" | "cancelled" | "back" | null {
  return param === "paid" || param === "unlimited" || param === "cancelled" || param === "back" ? param : null;
}

export type BillingCard = {
  /** One plain sentence per line. */
  lines: string[];
  /** A warning to show above the actions (a failed payment). */
  warning: string | null;
  canGoUnlimited: boolean;
  canManage: boolean;
};

/** Settings → Billing, for the business owner. Null while billing is off: the card is not drawn. */
export function billingCard(state: BillingState | null | undefined): BillingCard | null {
  if (!billingShown(state)) return null;
  if (state.exempt) return { lines: ["Your account is exempt."], warning: null, canGoUnlimited: false, canManage: false };
  const sub = state.unlimited;
  if (state.plan === "unlimited" && sub) {
    const when = billingDate(sub.periodEnd);
    const lines = [`Unlimited, ${PRICE_UNLIMITED}. Every job stays live while it lasts.`];
    if (when) lines.push(sub.cancelAtPeriodEnd ? `It ends on ${when}. Your jobs close then.` : `It renews on ${when}.`);
    return {
      lines,
      warning: sub.status === "past_due" ? "Your last payment didn't go through. Update your card to keep your jobs live." : null,
      canGoUnlimited: false,
      canManage: true,
    };
  }
  const lines = [`Pay per job: ${PRICE_JOB} a job, live for ${PASS_DAYS} days, unlimited applicants.`];
  lines.push(state.freeJobAvailable ? `Your first job is free for ${PASS_DAYS} days.` : "Your free job is used.");
  if (sub && !sub.active && sub.periodEnd) {
    const ended = billingDate(sub.periodEnd);
    if (ended) lines.push(`Unlimited ended on ${ended}.`);
  }
  lines.push(`Or go Unlimited for ${PRICE_UNLIMITED}: every job live while it lasts. Cancel any time.`);
  return { lines, warning: null, canGoUnlimited: true, canManage: state.hasCustomer };
}

export const BILLING_CARD_WORDS = {
  title: "Billing",
  description: "Your plan and payments",
  goUnlimited: "Go Unlimited",
  manage: "Manage billing",
  opening: "Opening…",
} as const;

export type BillingCallOutcome =
  | { kind: "redirect"; url: string }
  /** Stripe's payment form inside HireFlow (Embedded Checkout): mount it with this client secret. */
  | { kind: "embedded"; clientSecret: string }
  /** No payment is needed after all (Unlimited, or the exempt account): publish as usual. */
  | { kind: "publish"; message: string }
  /** The business must confirm its email first (the Publish screen asks for the code). */
  | { kind: "email"; message: string }
  | { kind: "failed"; message: string };

const NOT_SET_UP = "Payments aren't set up yet. Try again later.";
const TRY_AGAIN = "Payments aren't available just now. Try again in a moment.";

/** billing-checkout's or billing-portal's answer, as the page acts on it. */
export function billingCallOutcome(status: number | null | undefined, body: unknown): BillingCallOutcome {
  const b = isObject(body) ? body : {};
  // The form inside HireFlow: a Checkout Session's client secret (cs_test_…_secret_… or cs_live_…).
  if (status === 200 && typeof b.clientSecret === "string" && /^cs_(?:test|live)_[A-Za-z0-9_]+$/.test(b.clientSecret) && b.clientSecret.length <= 500) return { kind: "embedded", clientSecret: b.clientSecret };
  // Stripe's pages are https; a local preview's own page (src/dev-preview/previewBilling.ts) is http://localhost.
  if (status === 200 && typeof b.url === "string" && /^(?:https:\/\/|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/)/.test(b.url)) return { kind: "redirect", url: b.url };
  const said = typeof b.error === "string" && b.error.trim() ? b.error.trim() : null;
  switch (b.code) {
    case "not_set_up":
    case "price_missing":
    case "billing_off":
      return { kind: "failed", message: NOT_SET_UP };
    case "unlimited_active":
    case "exempt":
    case "job_live":
    case "job_has_time":
    case "free_job_available":
      return { kind: "publish", message: said ?? "This job needs no payment. Publish it as usual." };
    case "email_not_verified":
      return { kind: "email", message: said ?? "Confirm your email first." };
    default:
      if (status === 401) return { kind: "failed", message: "Your sign-in has ended. Sign in again, then try once more." };
      if (status === 503) return { kind: "failed", message: NOT_SET_UP };
      return { kind: "failed", message: status && said && status < 500 ? said : TRY_AGAIN };
  }
}

// ---------------------------------------------------------------------------
// What a business sees after paying, and where it sees what it pays for
// (2026-11-01). The owner, after his own $1 test payment: "there was no
// payment confirmation ... I don't get to see what package I'm on ... If they
// can't see what they paid for, what they got ... that could be a really big
// trouble." So: a confirmation that says what was paid and what it bought; a
// plan button by the account (the plan, each live job's days draining as a
// ring); and Settings -> Billing with the payment history. Every function
// here answers nothing while billing is off, and nothing for the exempt
// account (never a price).
// ---------------------------------------------------------------------------

/** "$1.00", "$99.00": what was actually charged (from HireFlow's own record), never the list price. */
export function formatMoney(cents: number | null | undefined, currency: string | null | undefined = "usd"): string | null {
  if (typeof cents !== "number" || !Number.isFinite(cents) || cents < 0) return null;
  const code = (typeof currency === "string" && /^[a-z]{3}$/i.test(currency) ? currency : "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

/** "Nov 1, 2026". */
export function shortBillingDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Nov 1 to Dec 1, 2026" (across years, both years). */
function shortRange(from: string | null | undefined, to: string | null | undefined): string | null {
  const a = from ? Date.parse(from) : NaN;
  const b = to ? Date.parse(to) : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const sameYear = new Date(a).getFullYear() === new Date(b).getFullYear();
  const start = new Date(a).toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
  return `${start} to ${shortBillingDate(to)}`;
}

/**
 * Settings -> Billing and the plan button: the business that pays, while
 * billing is on. Never the exempt account (it is never asked to pay, and
 * sees no price), never while billing is off or unknown. Settings shows the
 * tab to the business owner only, as it showed the Billing card.
 */
export function billingTabShown(state: BillingState | null | undefined): state is BillingState {
  if (!billingShown(state) || state.exempt) return false;
  return true;
}

export type LiveJobLine = {
  id: string;
  title: string;
  kind: PassKind | null;
  /** Whole days left (rounded up); null under Unlimited. */
  daysLeft: number | null;
  /** The ring's whole: 30 days (more when days were added to days left). */
  total: number;
  /** "23 days left", "Free job, 23 days left", "Last day", "Live while Unlimited lasts". */
  line: string;
};

export type PlanSummary = {
  name: "Pay per job" | "Unlimited";
  /** The button's second line: "23 days left", "2 jobs live", "Renews Dec 1". */
  sub: string;
  /** The soonest-ending live job's ring, drawn on the button (pay per job). */
  ring: { left: number; total: number } | null;
  jobs: LiveJobLine[];
  /** "Renews December 1, 2026." or "Ends December 1, 2026. Your jobs close then." */
  unlimitedLine: string | null;
  /** What the plan costs: "$99 a job, live for 30 days" or "$299 a month". */
  priceLine: string;
  freeLine: string | null;
  warning: string | null;
};

/**
 * The plan button and its dropdown. `liveJobs` are the business's live jobs
 * (as the page has them: id and title); each one a free, paid or launch pass
 * keeps live gets a ring of its days left out of 30, draining as the days
 * pass. Null while billing is off and for the exempt account: no button.
 */
export function planSummary(
  state: BillingState | null | undefined,
  liveJobs: ReadonlyArray<{ id: string; title: string }>,
  now: number = Date.now(),
): PlanSummary | null {
  if (!billingShown(state) || state.exempt) return null;
  if (state.plan === "unlimited") {
    const sub = state.unlimited;
    const when = billingDate(sub?.periodEnd);
    // The button's line is short: "Renews Dec 4" (the dropdown says the year).
    const end = sub?.periodEnd ? Date.parse(sub.periodEnd) : NaN;
    const short = Number.isFinite(end) ? new Date(end).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
    const jobs: LiveJobLine[] = liveJobs.map((j) => ({ id: j.id, title: j.title, kind: "unlimited", daysLeft: null, total: PASS_DAYS, line: "Live while Unlimited lasts" }));
    return {
      name: "Unlimited",
      sub:
        sub?.status === "past_due"
          ? "Payment failed"
          : short
            ? `${sub?.cancelAtPeriodEnd ? "Ends" : "Renews"} ${short}`
            : `${jobs.length} ${jobs.length === 1 ? "job" : "jobs"} live`,
      ring: null,
      jobs,
      unlimitedLine: when ? (sub?.cancelAtPeriodEnd ? `Ends ${when}. Your jobs close then.` : `Renews ${when}.`) : null,
      priceLine: PRICE_UNLIMITED,
      freeLine: null,
      warning: sub?.status === "past_due" ? "Your last payment didn't go through. Update your card to keep your jobs live." : null,
    };
  }
  const jobs: LiveJobLine[] = [];
  for (const job of liveJobs) {
    const pass = state.jobs[job.id];
    if (!pass || !pass.timeLeft || !(pass.kind === "free" || pass.kind === "paid" || pass.kind === "launch")) continue;
    const left = daysLeft(pass.endsAt, now);
    if (left === null) continue;
    const words = left <= 1 ? "last day" : `${left} days left`;
    jobs.push({
      id: job.id,
      title: job.title,
      kind: pass.kind,
      daysLeft: left,
      total: Math.max(PASS_DAYS, left),
      line: pass.kind === "free" ? `Free job, ${words}` : `${words.charAt(0).toUpperCase()}${words.slice(1)}`,
    });
  }
  jobs.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  const soonest = jobs[0] ?? null;
  let sub: string;
  if (!soonest) sub = state.freeJobAvailable ? "First job free" : "No job live";
  else if (jobs.length > 1) sub = `${jobs.length} jobs live`;
  else sub = (soonest.daysLeft ?? 0) <= 1 ? "Last day" : `${soonest.daysLeft} days left`;
  return {
    name: "Pay per job",
    sub,
    ring: soonest ? { left: soonest.daysLeft ?? 0, total: soonest.total } : null,
    jobs,
    unlimitedLine: null,
    priceLine: `${PRICE_JOB} a job, live for ${PASS_DAYS} days`,
    freeLine: state.freeJobAvailable ? `Your first job is free for ${PASS_DAYS} days.` : null,
    warning: null,
  };
}

/** How full a job's ring is: its days left out of its whole (0 to 1). */
export function ringFraction(left: number | null | undefined, total: number | null | undefined): number {
  if (typeof left !== "number" || typeof total !== "number" || !(total > 0)) return 0;
  return Math.max(0, Math.min(1, left / total));
}

export const PLAN_WORDS = {
  button: "Your plan",
  billing: "Billing",
  history: "Payment history",
  noJobs: "No job is live right now.",
  liveJobs: "Live jobs",
} as const;

export type HistoryRow = {
  key: string;
  /** "Nov 1, 2026". */
  date: string;
  /** "“Chat agent”, 30 days" or "Unlimited, one month". */
  what: string;
  /** "Nov 1 to Dec 1, 2026". */
  period: string | null;
  /** "$1.00" (what was charged), or null when HireFlow has no amount for it. */
  amount: string | null;
  receiptUrl: string | null;
  refunded: boolean;
};

/** Settings -> Billing -> Payment history, from HireFlow's own records. Null when there is none to show (off, exempt, a teammate, unreadable). */
export function paymentHistoryRows(state: BillingState | null | undefined): HistoryRow[] | null {
  if (!billingShown(state) || state.exempt || !state.payments) return null;
  return state.payments.map((p, i) => ({
    key: `${p.kind}:${p.paidAt}:${i}`,
    date: shortBillingDate(p.paidAt) ?? "",
    what: p.kind === "unlimited" ? "Unlimited, one month" : `${p.title ? `“${p.title}”` : "A job since deleted"}, ${PASS_DAYS} days`,
    period: shortRange(p.startsAt, p.endsAt),
    amount: formatMoney(p.amountCents, p.currency),
    receiptUrl: p.receiptUrl,
    refunded: p.refunded,
  }));
}

export const BILLING_TAB_WORDS = {
  plan: "Your plan",
  live: "Live jobs",
  liveNote: `Each job is live for ${PASS_DAYS} days from when it is paid for. The ring empties as the days pass.`,
  liveUnlimited: "Every job stays live while Unlimited lasts.",
  liveNone: "No job is live right now.",
  history: "Payment history",
  historyNote: "Every payment, from HireFlow's own records. Each receipt is also emailed to you.",
  historyEmpty: "No payments yet.",
  historyEmptyFree: "No payments yet. Your first job is free.",
  historyUnread: "Your payment history couldn't be loaded just now. Refresh the page to try again.",
  receipt: "Receipt",
  refunded: "Refunded",
  manage: "Manage card or cancel",
  manageNote: "Stripe's billing page: change your card, download invoices and receipts, or cancel Unlimited.",
} as const;

/** One payment's confirmation, as the business sees it right after paying. */
export type ConfirmationInput = {
  what: "job" | "unlimited";
  jobTitle?: string | null;
  /** HireFlow's record of this payment (the owner), or null (not in yet, or a teammate). */
  payment: BillingPayment | null;
  /** A job: the end of its paid days. Unlimited: its period end. */
  endsAt: string | null;
  cancelAtPeriodEnd?: boolean;
  /** Whether the job is live now (null when there is no job). */
  live: boolean | null;
  state: "waiting" | "slow" | "confirmed";
};

export type ConfirmationWords = {
  heading: string;
  lead: string;
  /** "$1.00", or null when the amount is not known here. */
  paid: string | null;
  paidOn: string | null;
  forWhat: string;
  /** What it bought, in one line; null while waiting. */
  got: string | null;
  receipt: string;
};

export const PAYMENT_CONFIRMATION_WORDS = {
  waitingHeading: "Confirming your payment",
  waitingNote: "You can close this. Nothing more is needed from you, and the payment shows in Settings, under Billing.",
  confirmedHeading: "Payment confirmed",
  confirmedLead: "Thank you. Here is what you paid for.",
  paid: "Paid",
  forWhat: "For",
  got: "What you get",
  receiptLabel: "Receipt",
  receipt: "A receipt is on its way to your email.",
  viewReceipt: "View receipt",
  share: "Share your job",
  seeBilling: "See billing",
  seeJobs: "See your jobs",
} as const;

/** The confirmation's words (src/components/billing/PaymentConfirmation.tsx draws them). */
export function confirmationWords(input: ConfirmationInput): ConfirmationWords {
  const W = PAYMENT_CONFIRMATION_WORDS;
  const title = input.jobTitle?.trim() ? `“${input.jobTitle.trim()}”` : null;
  const forWhat = input.what === "unlimited" ? "Unlimited, billed monthly. Cancel any time." : `${title ?? "Your job"}, live for ${PASS_DAYS} days`;
  if (input.state !== "confirmed") {
    const slow = input.state === "slow";
    const lead = input.what === "unlimited" ? (slow ? SETTINGS_RETURN_WORDS.slow : SETTINGS_RETURN_WORDS.waiting) : slow ? PAID_RETURN_WORDS.slow : PAID_RETURN_WORDS.waiting;
    return { heading: W.waitingHeading, lead, paid: null, paidOn: null, forWhat, got: null, receipt: W.receipt };
  }
  const until = billingDate(input.endsAt);
  let got: string;
  if (input.what === "unlimited") {
    got = `Unlimited is on. Every job stays live while it lasts.${until ? ` ${input.cancelAtPeriodEnd ? "Ends" : "Renews"} ${until}.` : ""}`;
  } else if (input.live === false) {
    got = `Its ${PASS_DAYS} days are paid for${until ? `, until ${until}` : ""}. Press Publish on the job to put it live.`;
  } else {
    got = `${title ?? "Your job"} is live${until ? ` until ${until}` : ` for ${PASS_DAYS} days`}. Unlimited applicants.`;
  }
  return {
    heading: W.confirmedHeading,
    lead: W.confirmedLead,
    paid: input.payment ? formatMoney(input.payment.amountCents, input.payment.currency) : null,
    paidOn: input.payment ? billingDate(input.payment.paidAt) : null,
    forWhat,
    got,
    receipt: W.receipt,
  };
}

/**
 * The payment just made, from HireFlow's own record: the newest for this job
 * (or the newest Unlimited payment) made since a little before `since`, so an
 * older payment is never shown as this one.
 */
export function paymentSince(
  state: BillingState | null | undefined,
  what: "job" | "unlimited",
  jobId: string | null | undefined,
  since: number,
): BillingPayment | null {
  if (!billingShown(state) || !state.payments) return null;
  const from = since - 30 * 60_000;
  return state.payments.find((p) => p.kind === what && (what === "unlimited" || p.jobId === jobId) && Date.parse(p.paidAt) >= from) ?? null;
}

/** Whether billing-webhook has recorded the payment: the job has paid days on it, or Unlimited is on. */
export function paymentConfirmed(state: BillingState | null | undefined, what: "job" | "unlimited", jobId: string | null | undefined): boolean {
  if (!billingShown(state)) return false;
  if (what === "unlimited") return state.plan === "unlimited";
  const pass = jobId ? state.jobs[jobId] : undefined;
  return state.plan === "unlimited" || (!!pass && pass.timeLeft && pass.kind === "paid");
}
