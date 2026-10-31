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
 *
 * billing-checkout answers with this preview's own job page (?billing=paid)
 * or Settings (?billing=unlimited); billing-portal with Settings.
 */
import type { FixtureClientOptions, FixtureTables } from "./fixtureClient";
import { JOB_BARISTA_ID, JOB_SERVER_ID, JOB_SHIFT_LEAD_CLOSED_ID } from "./ids";

type InvokeOptions = { body?: unknown };
type InvokeReply = { data: unknown; error: unknown };

const day = 86_400_000;
const at = (offset: number) => new Date(Date.now() + offset).toISOString();

const MODES = ["off", "free", "paygo", "unlimited", "ending", "pastdue", "canceled", "exempt"] as const;
type Mode = (typeof MODES)[number];

function stateFor(mode: Mode) {
  if (mode === "off") {
    return { billingEnabled: false, exempt: false, plan: null, freeJobAvailable: null, unlimited: null, hasCustomer: false, jobs: {} as Record<string, unknown> };
  }
  const base = {
    billingEnabled: true,
    exempt: mode === "exempt",
    plan: "pay_per_job" as "pay_per_job" | "unlimited",
    freeJobAvailable: mode === "free",
    unlimited: null as Record<string, unknown> | null,
    hasCustomer: mode !== "free" && mode !== "exempt",
    jobs: {} as Record<string, unknown>,
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
  const state = stateFor(mode);

  // Back from Checkout: the webhook puts the job live a few seconds later.
  if (paidJob && !slow) {
    window.setTimeout(() => {
      const job = (tables.jobs ?? []).find((j) => j.id === paidJob);
      if (job) job.status = "published";
      if (state.plan !== "unlimited") state.jobs[paidJob] = { kind: "paid", endsAt: at(30 * day), timeLeft: true, refunded: false };
    }, 4_000);
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
