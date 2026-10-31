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

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
