/**
 * Dev-preview-only. Billing (pricing v9; docs/BILLING.md), offline.
 * `__previewBilling=` picks what get-subscription answers and what the
 * stand-in database refuses; nothing reaches Stripe or the real functions.
 *
 *   off        billing off (as live today): no price, plan or days left anywhere
 *   free       on, the free job not used yet
 *   paygo      on, the free job used: Barista 12 days left (paid), Server on
 *              its last free day, Shift Lead's 30 days ended ("Post it again"
 *              opens the payment dialog); a publish is refused
 *              (payment_required), so the editor saves the job and offers to
 *              pay for it
 *   unlimited  on, Unlimited renewing in 18 days
 *   ending     Unlimited, cancelled, ending in 5 days
 *   pastdue    Unlimited whose last payment failed
 *   canceled   Unlimited that ended 3 days ago (pay per job again)
 *   exempt     the platform's own account ("Your account is exempt")
 *
 * Joined with a comma:
 *   paid:<job id>  back from Checkout for that job: it goes live 4 seconds in
 *                  (as billing-webhook would), with 30 days paid
 *   slow           with paid:…, it never does (the calm message after 30 s)
 *   embedded       paying inside HireFlow (2026-11-01): billing-checkout has
 *                  the publishable key and answers a client secret with it,
 *                  and a stand-in for Stripe's form (PreviewCheckoutForm.tsx;
 *                  Stripe.js cannot load offline) "pays"; the payment lands 3
 *                  seconds later, as billing-webhook would record it
 *   onedollar      what was charged is $1.00 (the owner's live test), not the
 *                  list price: the confirmation and the history say $1.00
 *
 * The states that are on carry the owner's payment history (billing_history):
 * paygo the Barista's $99 (with its receipt) and Shift Lead's ended one;
 * unlimited, ending and pastdue two months of Unlimited; canceled both kinds.
 *
 * Without embedded, billing-checkout answers with this preview's own job page
 * (?billing=paid) or Settings (?billing=unlimited); billing-portal with Settings.
 */
import type { FixtureClientOptions, FixtureTables } from "./fixtureClient";
import { setCheckoutStandIn } from "@/lib/billingApi";
import { JOB_BARISTA_ID, JOB_SERVER_ID, JOB_SHIFT_LEAD_CLOSED_ID } from "./ids";
import { makePreviewCheckoutForm } from "./PreviewCheckoutForm";

type InvokeOptions = { body?: unknown };
type InvokeReply = { data: unknown; error: unknown };

const day = 86_400_000;
const at = (offset: number) => new Date(Date.now() + offset).toISOString();

const MODES = ["off", "free", "paygo", "unlimited", "ending", "pastdue", "canceled", "exempt"] as const;
type Mode = (typeof MODES)[number];

const RECEIPT = (n: number) => `https://invoice.stripe.com/i/acct_preview/test_preview_receipt_${n}`;

/** A payment as billing_history reports it. */
function payment(kind: "job" | "unlimited", paidDaysAgo: number, cents: number, extra: Record<string, unknown> = {}) {
  const paidAt = at(-paidDaysAgo * day);
  return { kind, jobId: null, title: null, amountCents: cents, currency: "usd", paidAt, startsAt: paidAt, endsAt: at((30 - paidDaysAgo) * day), receiptUrl: null, refunded: false, ...extra };
}

function stateFor(mode: Mode) {
  if (mode === "off") {
    return { billingEnabled: false, exempt: false, plan: null, freeJobAvailable: null, unlimited: null, hasCustomer: false, jobs: {} as Record<string, unknown>, payments: null as unknown[] | null };
  }
  const base = {
    billingEnabled: true,
    exempt: mode === "exempt",
    plan: "pay_per_job" as "pay_per_job" | "unlimited",
    freeJobAvailable: mode === "free",
    unlimited: null as Record<string, unknown> | null,
    hasCustomer: mode !== "free" && mode !== "exempt",
    jobs: {} as Record<string, unknown>,
    payments: (mode === "exempt" ? null : []) as unknown[] | null,
  };
  if (mode === "paygo" || mode === "canceled") {
    base.jobs[JOB_BARISTA_ID] = { kind: "paid", endsAt: at(12 * day - 3_600_000), timeLeft: true, refunded: false };
    base.jobs[JOB_SERVER_ID] = { kind: "free", endsAt: at(10 * 3_600_000), timeLeft: true, refunded: false };
    base.jobs[JOB_SHIFT_LEAD_CLOSED_ID] = { kind: "paid", endsAt: at(-20 * day), timeLeft: false, refunded: false };
  }
  if (mode === "unlimited" || mode === "ending" || mode === "pastdue") {
    base.plan = "unlimited";
    base.unlimited = {
      status: mode === "pastdue" ? "past_due" : "active",
      active: true,
      periodEnd: at((mode === "ending" ? 5 : 18) * day),
      cancelAtPeriodEnd: mode === "ending",
    };
    for (const id of [JOB_BARISTA_ID, JOB_SERVER_ID]) base.jobs[id] = { kind: "unlimited", endsAt: null, timeLeft: false, refunded: false };
  }
  if (mode === "canceled") {
    base.unlimited = { status: "canceled", active: false, periodEnd: at(-3 * day), cancelAtPeriodEnd: false };
  }
  // The owner's payment history (newest first), as billing_history reports it.
  if (mode === "paygo") {
    base.payments = [
      payment("job", 18, 9900, { jobId: JOB_BARISTA_ID, title: "Barista", receiptUrl: RECEIPT(1) }),
      payment("job", 50, 9900, { jobId: JOB_SHIFT_LEAD_CLOSED_ID, title: "Shift Lead", receiptUrl: RECEIPT(2) }),
    ];
  }
  if (mode === "unlimited" || mode === "ending" || mode === "pastdue") {
    base.payments = [payment("unlimited", 12, 29900, { receiptUrl: RECEIPT(3) }), payment("unlimited", 42, 29900, { receiptUrl: RECEIPT(4) })];
  }
  if (mode === "canceled") {
    base.payments = [
      payment("job", 18, 9900, { jobId: JOB_BARISTA_ID, title: "Barista", receiptUrl: RECEIPT(1) }),
      payment("unlimited", 33, 29900, { receiptUrl: RECEIPT(3) }),
      payment("job", 50, 9900, { jobId: null, title: null, refunded: true }),
    ];
  }
  return base;
}

export function previewBilling(
  tables: FixtureTables,
  param: string | null,
  role: string,
): {
  invoke: (name: string, options?: InvokeOptions) => InvokeReply | null;
  refuseWrite: FixtureClientOptions["refuseWrite"];
} {
  if (!param) return { invoke: () => null, refuseWrite: undefined };
  const parts = param.split(",").map((p) => p.trim());
  const mode: Mode = MODES.find((m) => parts.includes(m)) ?? "off";
  const paidJob = parts.find((p) => p.startsWith("paid:"))?.slice(5) ?? null;
  const slow = parts.includes("slow");
  const embedded = parts.includes("embedded");
  const charged = parts.includes("onedollar") ? 100 : null;
  const state = stateFor(mode);

  // What billing-webhook records once Stripe confirms a payment: the job's 30
  // days and the job live, or Unlimited on; and the owner's payment row.
  const land = (kind: "job" | "unlimited", jobId: string | null) => {
    const job = jobId ? (tables.jobs ?? []).find((j) => j.id === jobId) : null;
    if (job) job.status = "published";
    if (kind === "unlimited") {
      state.plan = "unlimited";
      state.unlimited = { status: "active", active: true, periodEnd: at(30 * day), cancelAtPeriodEnd: false };
      if (jobId) state.jobs[jobId] = { kind: "unlimited", endsAt: null, timeLeft: false, refunded: false };
    } else if (jobId && state.plan !== "unlimited") {
      state.jobs[jobId] = { kind: "paid", endsAt: at(30 * day), timeLeft: true, refunded: false };
    }
    if (state.payments) {
      state.payments.unshift(
        payment(kind, 0, charged ?? (kind === "job" ? 9900 : 29900), {
          jobId: kind === "job" ? jobId : null,
          title: kind === "job" ? ((job?.title as string | undefined) ?? null) : null,
          receiptUrl: RECEIPT(9),
        }),
      );
    }
  };

  // Back from Checkout: the webhook puts the job live a few seconds later.
  if (paidJob && !slow) {
    window.setTimeout(() => land(mode === "unlimited" ? "unlimited" : "job", paidJob), 4_000);
  }

  // Paying inside HireFlow: a publishable key, and the stand-in for Stripe's form.
  if (embedded) {
    setCheckoutStandIn({
      publishableKey: "pk_test_preview",
      Form: makePreviewCheckoutForm((secret) => {
        const [, , , kind, , plainId] = secret.split("_");
        const jobId = (tables.jobs ?? []).find((j) => String(j.id).replace(/-/g, "") === plainId)?.id as string | undefined;
        if (!slow) window.setTimeout(() => land(kind === "unlimited" ? "unlimited" : "job", jobId ?? null), 3_000);
      }),
    });
  }

  // A page in this preview, with these preview settings (and another billing mode).
  const previewUrl = (path: string, billingMode: string, back: string) => {
    const here = new URL(window.location.href);
    const next = new URL(path, here.origin);
    for (const [key, value] of here.searchParams) if (key.startsWith("__preview") && key !== "__previewBilling") next.searchParams.set(key, value);
    next.searchParams.set("__previewBilling", billingMode);
    next.searchParams.set("billing", back);
    return next.toString();
  };

  return {
    invoke: (name, options) => {
      const body = (options?.body ?? {}) as { kind?: unknown; jobId?: unknown };
      if (name === "get-subscription") {
        return { data: { teamAccess: { isTeamMember: false, status: "none", reason: null, employerId: null }, billing: role === "candidate" || role === "rejected_candidate" ? null : state }, error: null };
      }
      if (name === "billing-checkout") {
        const jobId = typeof body.jobId === "string" ? body.jobId : null;
        // Inside HireFlow (as billing-checkout does once it has the publishable key): a client secret
        // naming what is paid for (cs_test_preview_<kind>_<cents>_<job>_secret_x).
        if ((body as { ui?: unknown }).ui === "embedded" && embedded) {
          const kind = body.kind === "unlimited" ? "unlimited" : "job";
          const cents = charged ?? (kind === "job" ? 9900 : 29900);
          return { data: { clientSecret: `cs_test_preview_${kind}_${cents}_${jobId ? jobId.replace(/-/g, "") : "none"}_secret_x`, publishableKey: "pk_test_preview" }, error: null };
        }
        if (body.kind === "unlimited") {
          return { data: { url: jobId ? previewUrl(`/jobs/${jobId}`, `unlimited,paid:${jobId}`, "unlimited") : previewUrl("/settings", "unlimited", "unlimited") }, error: null };
        }
        return { data: { url: previewUrl(`/jobs/${jobId}`, `paygo,paid:${jobId}`, "paid") }, error: null };
      }
      if (name === "billing-portal") {
        return { data: { url: previewUrl("/settings", mode, "back") }, error: null };
      }
      return null;
    },
    refuseWrite: (table, _type, payload) =>
      table === "jobs" && payload.status === "published" && mode === "paygo"
        ? { message: "Your free job is used. Pay for this job, or go Unlimited, to put it live.", code: "23514", hint: "payment_required" }
        : null,
  };
}
