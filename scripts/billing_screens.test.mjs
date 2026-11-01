#!/usr/bin/env node
/**
 * What the hiring side shows about billing (src/lib/billing.ts; pricing v9,
 * docs/BILLING.md): nothing at all while billing is off or unknown, and the
 * right words when it is on.
 *
 * Run with: node scripts/billing_screens.test.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const B = await import(path.join(ROOT, "src/lib/billing.ts"));

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${String(detail).slice(0, 500)})` : ""}`);
  }
}
const show = (v) => JSON.stringify(v);

const NOW = Date.parse("2026-11-10T12:00:00Z");
const at = (days) => new Date(NOW + days * 86_400_000).toISOString();
const JOB = "20000000-0000-4000-8000-000000000001";

console.log("\nBilling off, or not known: nothing\n");
{
  const off = B.readBillingState({ billingEnabled: false, exempt: false, plan: null, freeJobAvailable: null, unlimited: null, hasCustomer: false, jobs: {} });
  // Even a state that says off but carries leftovers shows nothing.
  const offWithLeftovers = B.readBillingState({ billingEnabled: false, plan: "pay_per_job", freeJobAvailable: false, jobs: { [JOB]: { kind: "paid", endsAt: at(3), timeLeft: true } } });
  const unknowns = [null, undefined, {}, "on", { billingEnabled: "true" }, []].map((v) => B.readBillingState(v));
  check("an unreadable answer is null (treated as off)", unknowns.every((v) => v === null), show(unknowns));
  for (const [label, state] of [["off", off], ["off, with leftovers", offWithLeftovers], ["unknown", null]]) {
    check(
      `${label}: no Billing card, no days left on any job, "Post it again" never goes to paying`,
      B.billingShown(state) === false && B.billingCard(state) === null &&
        ["live", "closed", "draft"].every((s) => B.jobPassLine(state, JOB, s, NOW) === null) && B.repostNeedsPayment(state, JOB) === false,
    );
  }
}

console.log("\nBilling on\n");
{
  const paygo = B.readBillingState({
    billingEnabled: true,
    exempt: false,
    plan: "pay_per_job",
    freeJobAvailable: false,
    unlimited: null,
    hasCustomer: true,
    jobs: {
      a: { kind: "paid", endsAt: at(12.2), timeLeft: true, refunded: false },
      b: { kind: "free", endsAt: at(0.4), timeLeft: true, refunded: false },
      c: { kind: "paid", endsAt: at(-20), timeLeft: false, refunded: false },
      d: { kind: "paid", endsAt: at(-1), timeLeft: false, refunded: true },
      e: { kind: "launch", endsAt: at(1.5), timeLeft: true, refunded: false },
      f: { kind: "bogus", endsAt: 3, timeLeft: "yes" },
    },
  });
  check("days left on a live job, rounded up", B.jobPassLine(paygo, "a", "live", NOW) === "13 days left" && B.jobPassLine(paygo, "e", "live", NOW) === "2 days left");
  check("the free job's last day says so", B.jobPassLine(paygo, "b", "live", NOW) === "Free job, last day");
  check("a closed job whose 30 days ended, and a refunded one", B.jobPassLine(paygo, "c", "closed", NOW) === "Its 30 days ended" && B.jobPassLine(paygo, "d", "closed", NOW) === "Refunded");
  check("a draft, a job with no pass, and a bad row say nothing", B.jobPassLine(paygo, "a", "draft", NOW) === null && B.jobPassLine(paygo, "zzz", "live", NOW) === null && B.jobPassLine(paygo, "f", "live", NOW) === null);
  check("Post it again goes straight to paying for an ended job, not for one with days left", B.repostNeedsPayment(paygo, "c") && !B.repostNeedsPayment(paygo, "a"));
  const card = B.billingCard(paygo);
  check(
    "the card for pay per job, free job used: the prices, Go Unlimited and Manage billing",
    card.lines[0] === "Pay per job: $99 a job, live for 30 days, unlimited applicants." && card.lines.includes("Your free job is used.") && card.canGoUnlimited && card.canManage && card.warning === null,
    show(card),
  );
  const fresh = B.readBillingState({ billingEnabled: true, exempt: false, plan: "pay_per_job", freeJobAvailable: true, hasCustomer: false, jobs: {} });
  const freshCard = B.billingCard(fresh);
  check("a new business: its first job is free, nothing to manage yet, Post it again goes through the editor", freshCard.lines.includes("Your first job is free for 30 days.") && !freshCard.canManage && freshCard.canGoUnlimited && !B.repostNeedsPayment(fresh, "c"), show(freshCard));

  const unlimited = B.readBillingState({ billingEnabled: true, plan: "unlimited", freeJobAvailable: true, unlimited: { status: "active", active: true, periodEnd: "2026-12-04T10:00:00Z", cancelAtPeriodEnd: false }, hasCustomer: true, jobs: { a: { kind: "unlimited", endsAt: null, timeLeft: false } } });
  const uCard = B.billingCard(unlimited);
  check("Unlimited: no clock on its jobs, nothing to pay to re-post", B.jobPassLine(unlimited, "a", "live", NOW) === null && !B.repostNeedsPayment(unlimited, "a"));
  check("Unlimited's card: the plan, when it renews, Manage billing only", uCard.lines[0].startsWith("Unlimited, $299 a month.") && uCard.lines[1] === "It renews on December 4, 2026." && uCard.canManage && !uCard.canGoUnlimited, show(uCard));
  const ending = B.billingCard({ ...unlimited, unlimited: { ...unlimited.unlimited, cancelAtPeriodEnd: true } });
  const pastDue = B.billingCard({ ...unlimited, unlimited: { ...unlimited.unlimited, status: "past_due" } });
  check("cancelled: when it ends and that the jobs close then; a failed payment: a warning", ending.lines[1] === "It ends on December 4, 2026. Your jobs close then." && /didn't go through/.test(pastDue.warning ?? ""), show([ending, pastDue]));
  const ended = B.billingCard({ ...paygo, unlimited: { status: "canceled", active: false, periodEnd: "2026-11-01T12:00:00Z", cancelAtPeriodEnd: false } });
  check("after Unlimited ended: pay per job again, and when it ended", ended.lines.includes("Unlimited ended on November 1, 2026.") && ended.canGoUnlimited, show(ended));
  const exempt = B.readBillingState({ billingEnabled: true, exempt: true, plan: "pay_per_job", freeJobAvailable: false, jobs: { c: { kind: "paid", endsAt: at(-20), timeLeft: false } } });
  check(
    "the exempt platform account: \"Your account is exempt.\" and nothing else, no days, never asked to pay",
    show(B.billingCard(exempt)) === show({ lines: ["Your account is exempt."], warning: null, canGoUnlimited: false, canManage: false }) && B.jobPassLine(exempt, "c", "closed", NOW) === null && !B.repostNeedsPayment(exempt, "c"),
  );
}

console.log("\nThe database's refusal, and the payment dialog's words\n");
{
  check("the HINT is enough, and so is the message alone", B.isPaymentRequiredError({ hint: "payment_required", message: "x" }) && B.isPaymentRequiredError(new Error("Your free job is used. Pay for this job, or go Unlimited, to put it live.")));
  check("another refusal is not this one", !B.isPaymentRequiredError({ hint: "email_not_verified", message: "Confirm your email" }) && !B.isPaymentRequiredError(null) && !B.isPaymentRequiredError("Your free job is used"));
  const fs = await import("node:fs");
  const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261031100000_billing_pricing_v9.sql"), "utf8");
  check("the database's own wording and HINT are what the page looks for", sql.includes("Your free job is used. Pay for this job, or go Unlimited, to put it live.") && sql.includes("hint = 'payment_required'"));
  const W = B.PUBLISH_PAYMENT_WORDS;
  check(
    "the dialog says the owner's terms: $99 for 30 days with unlimited applicants, or Unlimited at $299 a month",
    W.title === "Your free job is used" && W.intro("Chat agent") === "Publish “Chat agent” for $99 (30 days, unlimited applicants) or go Unlimited for $299 a month." && W.intro(null).startsWith("Publish this job for $99"),
    W.intro("Chat agent"),
  );
  check("no time-of-day pitch, no \"AI\"", !/morning|night|tonight|\bAI\b/i.test(JSON.stringify(W) + JSON.stringify(B.BILLING_CARD_WORDS) + JSON.stringify(B.PAID_RETURN_WORDS) + JSON.stringify(B.SETTINGS_RETURN_WORDS)));
}

console.log("\nCheckout's and the portal's answers\n");
{
  const o = B.billingCallOutcome;
  check("Stripe's page: go there", o(200, { url: "https://checkout.stripe.com/c/pay/cs_x" }).kind === "redirect");
  check("never a non-web address", o(200, { url: "javascript:alert(1)" }).kind === "failed" && o(200, { url: "http://evil.example/x" }).kind === "failed");
  check("the local preview's own page (http://localhost) is taken", o(200, { url: "http://localhost:8080/jobs/x?billing=paid" }).kind === "redirect");
  check("not set up, a missing price, billing off: \"Payments aren't set up yet\"", ["not_set_up", "price_missing", "billing_off"].every((code) => o(503, { error: "billing is not set up", code }).message === "Payments aren't set up yet. Try again later."));
  check("no payment needed after all: publish as usual", ["unlimited_active", "exempt", "job_live", "job_has_time", "free_job_available"].every((code) => o(409, { error: "x", code }).kind === "publish"));
  check(
    "a teammate asking for Unlimited, a second Unlimited, a checkout already opening, a job already paid for: the server's own words, never a blank",
    [["owner_only", 403, "Ask the account owner: only they can start Unlimited."], ["unlimited_retrying", 409, "Your Unlimited payment is being retried. Update your card in Settings, under Billing."], ["already_unlimited", 409, "You already have Unlimited."], ["checkout_busy", 409, "A checkout is already opening. Try again in a moment."], ["already_paid", 409, "Your payment for this job went through. It goes live in a moment."]]
      .every(([code, status, error]) => { const r = o(status, { error, code }); return r.kind === "failed" && r.message === error; }),
  );
  check("email first: the code screen", o(409, { error: "Confirm your email first", code: "email_not_verified" }).kind === "email");
  check("signed out, Stripe down, nothing at all: calm words, never blank", o(401, {}).message.includes("Sign in again") && o(502, { error: "x", code: "stripe" }).message.includes("available just now") && o(null, null).message.includes("available just now"));
  check("?billing= is read only for its four values", B.billingReturn("paid") === "paid" && B.billingReturn("cancelled") === "cancelled" && B.billingReturn("<script>") === null && B.billingReturn(null) === null);
}

console.log("\nBack from Stripe, and a job closed while its editor was open\n");
{
  const fs = await import("node:fs");
  const note = fs.readFileSync(path.join(ROOT, "src/cockpit/components/BillingReturnNote.tsx"), "utf8");
  check(
    "the note after Checkout (\"Payment received…\") says nothing unless billing is shown: a made-up ?billing=paid while billing is off shows nothing (the billing review, finding 13)",
    /const back = billingShown\(billing\) \? billingReturn\(params\.get\("billing"\)\) : null;/.test(note) && /if \(!back \|\| back === "back"\) return null;/.test(note) &&
      /<BillingReturnNote\s+billing=\{billing\}/.test(fs.readFileSync(path.join(ROOT, "src/cockpit/pages/JobDetail.tsx"), "utf8")),
  );
  check(
    "a refused publish saves what was written with the job's status as the database has it now: closed stays closed, a draft or a new job is a draft (finding 16)",
    B.statusAfterRefusedPublish("closed") === "closed" && B.statusAfterRefusedPublish("archived") === "archived" && B.statusAfterRefusedPublish("draft") === "draft" &&
      B.statusAfterRefusedPublish("published") === "draft" && B.statusAfterRefusedPublish(null) === "draft" && B.statusAfterRefusedPublish(undefined) === "draft",
  );
  const editor = fs.readFileSync(path.join(ROOT, "src/pages/CreateJob.tsx"), "utf8");
  check(
    "…and the editor reads that status from the database at the moment it saves, not the one it loaded",
    /const \{ data: current, error: currentError \} = await supabase\.from\("jobs"\)\.select\("status"\)\.eq\("id", id\)\.maybeSingle\(\);\s*if \(currentError\) throw currentError;\s*const keep = statusAfterRefusedPublish\(current\?\.status\);/.test(editor) &&
      !/existingJob\?\.status && existingJob\.status !== "published" \? existingJob\.status : "draft"/.test(editor),
  );
}

console.log("\nAfter paying: the confirmation, the plan button, Settings -> Billing (2026-11-01)\n");
{
  const fs = await import("node:fs");
  const T = await import(path.join(ROOT, "src/lib/settingsTabs.ts"));
  const PAID_AT = new Date(NOW - 60_000).toISOString();
  const raw = {
    billingEnabled: true,
    exempt: false,
    plan: "pay_per_job",
    freeJobAvailable: false,
    unlimited: null,
    hasCustomer: true,
    jobs: {
      a: { kind: "paid", endsAt: "2026-12-10T12:00:00Z", timeLeft: true, refunded: false },
      b: { kind: "free", endsAt: at(0.4), timeLeft: true, refunded: false },
      c: { kind: "paid", endsAt: at(-3), timeLeft: false, refunded: false },
    },
    payments: [
      { kind: "job", jobId: "a", title: "Chat agent", amountCents: 100, currency: "usd", paidAt: PAID_AT, startsAt: PAID_AT, endsAt: "2026-12-10T12:00:00Z", receiptUrl: "https://invoice.stripe.com/i/acct_1/test_1", refunded: false },
      { kind: "unlimited", jobId: null, title: null, amountCents: 29900, currency: "usd", paidAt: at(-40), startsAt: at(-40), endsAt: at(-10), receiptUrl: "javascript:alert(1)", refunded: true },
      { kind: "job", jobId: null, title: null, amountCents: 9900, currency: "usd", paidAt: at(-70), startsAt: at(-70), endsAt: at(-40), receiptUrl: "https://evil.example/r", refunded: false },
      { kind: "bogus", paidAt: "x" },
    ],
  };
  const state = B.readBillingState(raw);
  check(
    "the payment history is read defensively: a receipt is only Stripe's own https page (never javascript: or another site), a bad row is dropped",
    state.payments.length === 3 && state.payments[0].receiptUrl === "https://invoice.stripe.com/i/acct_1/test_1" && state.payments[1].receiptUrl === null && state.payments[2].receiptUrl === null &&
      B.stripeReceiptUrl("https://pay.stripe.com/receipts/x") && !B.stripeReceiptUrl("https://stripe.com.evil.example/x") && !B.stripeReceiptUrl("http://invoice.stripe.com/i/x"),
    show(state.payments),
  );
  check("no payments in the answer (a teammate, or not readable) is null, never an empty history", B.readBillingState({ ...raw, payments: undefined }).payments === null);
  check("what was charged, as charged: $1.00, $99.00, $299.00", B.formatMoney(100) === "$1.00" && B.formatMoney(9900, "usd") === "$99.00" && B.formatMoney(29900, "USD") === "$299.00" && B.formatMoney(null) === null && B.formatMoney(-1) === null);

  // The Billing tab and the plan button: only while billing is on, never the exempt account.
  const off = B.readBillingState({ billingEnabled: false, payments: [] });
  const exempt = B.readBillingState({ ...raw, exempt: true });
  check(
    "billing off, unknown or the exempt account: no Billing tab, no plan button, no payment history",
    [off, null, exempt].every((s) => !B.billingTabShown(s) && B.planSummary(s, [{ id: "a", title: "Chat agent" }], NOW) === null && B.paymentHistoryRows(s) === null) && B.billingTabShown(state),
  );
  const plan = B.planSummary(state, [{ id: "a", title: "Chat agent" }, { id: "b", title: "Email agent" }, { id: "z", title: "No pass" }], NOW);
  check(
    "the plan button: Pay per job, each live job with its days left out of 30 (soonest first), the soonest one's ring on the button; the price in its own line",
    plan.name === "Pay per job" && plan.sub === "2 jobs live" && plan.jobs.length === 2 && plan.jobs[0].id === "b" && plan.jobs[0].line === "Free job, last day" &&
      plan.jobs[1].line === "30 days left" && plan.jobs[1].daysLeft === 30 && plan.jobs[1].total === 30 && plan.ring?.left === 1 && plan.priceLine === "$99 a job, live for 30 days" && plan.freeLine === null,
    show(plan),
  );
  check("the ring empties as the days pass", B.ringFraction(30, 30) === 1 && B.ringFraction(15, 30) === 0.5 && B.ringFraction(0, 30) === 0 && B.ringFraction(40, 30) === 1 && B.ringFraction(null, 30) === 0);
  const one = B.planSummary(state, [{ id: "a", title: "Chat agent" }], NOW);
  const none = B.planSummary({ ...state, freeJobAvailable: true }, [], NOW);
  check("one job: its days on the button; none: the free job if it is still there", one.sub === "30 days left" && none.sub === "First job free" && none.ring === null && none.freeLine === "Your first job is free for 30 days.", show([one.sub, none]));
  const unl = B.planSummary({ ...state, plan: "unlimited", unlimited: { status: "active", active: true, periodEnd: "2026-12-04T10:00:00Z", cancelAtPeriodEnd: false } }, [{ id: "a", title: "Chat agent" }], NOW);
  const unlEnding = B.planSummary({ ...state, plan: "unlimited", unlimited: { status: "active", active: true, periodEnd: "2026-12-04T10:00:00Z", cancelAtPeriodEnd: true } }, [], NOW);
  const unlFailed = B.planSummary({ ...state, plan: "unlimited", unlimited: { status: "past_due", active: true, periodEnd: "2026-12-04T10:00:00Z", cancelAtPeriodEnd: false } }, [], NOW);
  check(
    "Unlimited: no clock on its jobs, when it renews (or ends), and a failed payment said plainly",
    unl.name === "Unlimited" && unl.sub === "Renews Dec 4" && unl.unlimitedLine === "Renews December 4, 2026." && unl.ring === null && unl.jobs[0].daysLeft === null && unl.priceLine === "$299 a month" &&
      unlEnding.sub === "Ends Dec 4" && unlEnding.unlimitedLine === "Ends December 4, 2026. Your jobs close then." && unlFailed.sub === "Payment failed" && /didn't go through/.test(unlFailed.warning ?? ""),
    show([unl, unlEnding.sub, unlFailed.sub]),
  );
  const rows = B.paymentHistoryRows(state);
  check(
    "Payment history: the date, what it paid for, the amount charged, the receipt, and a refund said",
    rows.length === 3 && rows[0].what === "“Chat agent”, 30 days" && rows[0].amount === "$1.00" && rows[0].receiptUrl === "https://invoice.stripe.com/i/acct_1/test_1" && /to Dec 10, 2026$/.test(rows[0].period ?? "") &&
      rows[1].what === "Unlimited, one month" && rows[1].amount === "$299.00" && rows[1].refunded === true && rows[2].what === "A job since deleted, 30 days" && B.paymentHistoryRows({ ...state, payments: null }) === null,
    show(rows),
  );

  // The confirmation: what was paid (as charged), what it bought, the receipt.
  const paid = B.paymentSince(state, "job", "a", NOW);
  const jobWords = B.confirmationWords({ what: "job", jobTitle: "Chat agent", payment: paid, endsAt: "2026-12-01T12:00:00Z", live: true, state: "confirmed" });
  check(
    "after a $1 test payment: \"Payment confirmed\", Paid $1.00 and when, “Chat agent” is live until <date>. Unlimited applicants., a receipt by email",
    jobWords.heading === "Payment confirmed" && jobWords.paid === "$1.00" && /^[A-Z][a-z]+ \d{1,2}, 2026$/.test(jobWords.paidOn ?? "") && jobWords.forWhat === "“Chat agent”, live for 30 days" &&
      jobWords.got === "“Chat agent” is live until December 1, 2026. Unlimited applicants." && jobWords.receipt === "A receipt is on its way to your email.",
    show(jobWords),
  );
  const unlWords = B.confirmationWords({ what: "unlimited", payment: { ...state.payments[1], paidAt: PAID_AT }, endsAt: "2026-12-01T12:00:00Z", live: null, state: "confirmed" });
  check("Unlimited: \"Unlimited is on. Every job stays live while it lasts. Renews <date>.\" and $299.00", unlWords.got === "Unlimited is on. Every job stays live while it lasts. Renews December 1, 2026." && unlWords.paid === "$299.00", show(unlWords));
  const waiting = B.confirmationWords({ what: "job", jobTitle: "Chat agent", payment: null, endsAt: null, live: false, state: "waiting" });
  const slow = B.confirmationWords({ what: "unlimited", payment: null, endsAt: null, live: null, state: "slow" });
  check(
    "before the webhook has it: calm words, no amount, nothing claimed as done",
    waiting.heading === "Confirming your payment" && waiting.lead === B.PAID_RETURN_WORDS.waiting && waiting.paid === null && waiting.got === null && slow.lead === B.SETTINGS_RETURN_WORDS.slow,
    show([waiting, slow]),
  );
  const notLive = B.confirmationWords({ what: "job", jobTitle: "Chat agent", payment: paid, endsAt: "2026-12-01T12:00:00Z", live: false, state: "confirmed" });
  check("paid but not live (a paused business, or the job not publishable): says so, never \"is live\"", /Press Publish/.test(notLive.got) && !/is live/.test(notLive.got), notLive.got);
  check(
    "the payment just made is the one shown: never an older one, never another job's; the record landing is the job's paid days or Unlimited on",
    B.paymentSince(state, "job", "a", NOW)?.amountCents === 100 && B.paymentSince(state, "job", "a", NOW + 3 * 3_600_000) === null && B.paymentSince(state, "job", "b", NOW) === null &&
      B.paymentConfirmed(state, "job", "a") && !B.paymentConfirmed(state, "job", "c") && !B.paymentConfirmed(state, "unlimited", null) && !B.paymentConfirmed(off, "job", "a"),
  );
  check("no time-of-day pitch, no \"AI\" in the new words", !/morning|night|tonight|\bAI\b/i.test(JSON.stringify([B.PLAN_WORDS, B.BILLING_TAB_WORDS, B.PAYMENT_CONFIRMATION_WORDS, B.CHECKOUT_DIALOG_WORDS.secure, B.CHECKOUT_DIALOG_WORDS.back])));
  check(
    "the page reads Checkout's client secret as the form to mount, and nothing else as one",
    B.billingCallOutcome(200, { clientSecret: "cs_live_a1B2_secret_Zz9" }).kind === "embedded" && B.billingCallOutcome(200, { clientSecret: "javascript:alert(1)" }).kind === "failed" &&
      B.billingCallOutcome(200, { clientSecret: "cs_test_x-y" }).kind === "failed",
  );

  // Settings' tabs: General, Billing, Account, Notifications; a link opens Billing.
  check(
    "Settings opens the tab a link names (?tab=billing, #billing, the plan button's #payment-history, Stripe's way back ?billing=…), else General",
    T.SETTINGS_TABS.map((t) => t.label).join(",") === "General,Billing,Account,Notifications" && T.settingsTabFrom("?tab=billing", "") === "billing" && T.settingsTabFrom("", "#billing") === "billing" &&
      T.settingsTabFrom("?tab=billing", "#payment-history") === "billing" && T.settingsTabFrom("", "#payment-history") === "billing" && T.settingsTabFrom("?billing=unlimited", "") === "billing" &&
      T.settingsTabFrom("?tab=notifications", "") === "notifications" && T.settingsTabFrom("?tab=<x>", "#nope") === "general" && T.settingsTabFrom("", "") === "general",
  );
  check(
    "…and Billing only for an account that has it: while billing is still being read it waits; without it, General",
    T.shownSettingsTab("billing", true, false) === "billing" && T.shownSettingsTab("billing", false, true) === "loading" && T.shownSettingsTab("billing", false, false) === "general" && T.shownSettingsTab("account", false, false) === "account",
  );

  // Where the pages are wired.
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  const settings = read("src/pages/Settings.tsx");
  check(
    "Settings: four tabs; the Billing tab (BillingTab) only for the owner while billingTabShown; every existing card kept (careers page, tips, account, two-step, delete, notifications)",
    /const billingTab = isEmployer && !isTeamMember && billingTabShown\(billing\);/.test(settings) && /\{billingTab \? \(\s*<BillingTab \/>/.test(settings) &&
      ["general", "billing", "account", "notifications"].every((t) => settings.includes(`<TabsContent value="${t}"`)) &&
      ["<CareersPageCard />", "<TipsSettingCard />", "<TwoStepSignIn />", 'id="email"', "{deleteAccountDialog}", '<DeviceNotifications audience="staff" />'].every((s) => settings.includes(s)),
  );
  const shell = read("src/cockpit/Shell.tsx");
  const more = read("src/cockpit/pages/More.tsx");
  const planButton = read("src/components/billing/PlanButton.tsx");
  check(
    "the plan button: in the sidebar right above the account switcher, on a phone at the top of More; the owner's only, from planSummary",
    shell.indexOf("<PlanButton />") > 0 && shell.indexOf("<PlanButton />") < shell.indexOf('<AccountMenu align="start" side="top">') && /<PlanButton variant="card" \/>/.test(more) &&
      /if \(!owner\) return null;/.test(planButton) && /return planSummary\(billing, live\);/.test(planButton),
  );
  const dialog = read("src/components/billing/PublishPaymentDialog.tsx");
  check(
    "the payment dialog: Stripe's form in place (embedded), then the confirmation in place; once paid, closing never says \"saved, goes live once it's paid for\"",
    /if \(outcome\.kind === "embedded"\) \{/.test(dialog) && /<StripeCheckoutForm clientSecret=\{stage\.clientSecret\}/.test(dialog) && /<PaymentConfirmation\b/.test(dialog) &&
      /if \(paid\) finish\("close"\);\s*else onOpenChange\(false\);/.test(dialog),
  );
  const note = read("src/cockpit/components/BillingReturnNote.tsx");
  check("back from Stripe's hosted page (the fallback): the confirmation dialog, once (closing takes ?billing= off)", /<PaymentConfirmationDialog\b/.test(note) && /next\.delete\("billing"\);/.test(note));
  const form = read("src/components/billing/StripeCheckoutForm.tsx");
  const api = read("src/lib/billingApi.ts");
  check(
    "Stripe.js is loaded only when a form opens (the pure loader, never on page load), with the publishable key from VITE_STRIPE_PUBLISHABLE_KEY; without it, Stripe's hosted page",
    /import\("@stripe\/stripe-js\/pure"\)/.test(form) && !/^import [^;]*from "@stripe\/stripe-js"/m.test(form) && /import\.meta\.env\.VITE_STRIPE_PUBLISHABLE_KEY/.test(api) &&
      /\.\.\.\(embeddedCheckoutAvailable\(\) \? \{ ui: "embedded" \} : \{\}\)/.test(api),
  );
  const pkg = JSON.parse(read("package.json"));
  check("the Stripe packages are pinned to exact versions", /^\d+\.\d+\.\d+$/.test(pkg.dependencies["@stripe/stripe-js"]) && /^\d+\.\d+\.\d+$/.test(pkg.dependencies["@stripe/react-stripe-js"]), show([pkg.dependencies["@stripe/stripe-js"], pkg.dependencies["@stripe/react-stripe-js"]]));
}

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
