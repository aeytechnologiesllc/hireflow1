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

export interface BillingState {
  billingEnabled: boolean;
  exempt: boolean;
  plan: "unlimited" | "pay_per_job" | null;
  freeJobAvailable: boolean | null;
  unlimited: UnlimitedState | null;
  hasCustomer: boolean;
  jobs: Record<string, JobPass>;
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

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
