/**
 * The free tier is deliberately open right now (owner decision, 2026-09-04
 * migration 20260904110000_free_tier_open, reaffirmed for this pricing
 * build): NOTHING may lock, seal, charge, or show a price as due until
 * app_settings.billing_enabled is flipped to true. Every checkout-creating
 * function, the applicant-limit check, and the voice-interview overage
 * charge must consult the flag and refuse/no-op before doing anything a
 * user could mistake for billing — a function that skips the check would
 * silently start charging cards (or blocking applicants) the moment
 * someone else's unrelated change flips billing_enabled on, with nothing
 * else standing in the way.
 *
 * These are static text checks over the shipped source — cheap and fast,
 * but not a substitute for the runtime proof at
 * scripts/job_billing_schema.pglite.test.mjs (the switch itself) and
 * scripts/job_billing_webhook_handlers.test.mjs (checkout completion). Run
 * those directly:
 *   node scripts/job_billing_schema.pglite.test.mjs
 *   node scripts/job_billing_webhook_handlers.test.mjs
 */

const CHECKOUT_FUNCTIONS = [
  { file: "supabase/functions/unlock-job-checkout/index.ts", flag: "billing.billingEnabled", createCall: "stripe.checkout.sessions.create(" },
  { file: "supabase/functions/purchase-applicant-pack-checkout/index.ts", flag: "billing.billingEnabled", createCall: "stripe.checkout.sessions.create(" },
  { file: "supabase/functions/ava-boost-checkout/index.ts", flag: "billing.boostEnabled", createCall: "stripe.checkout.sessions.create(" },
];

const CHECK_APPLICANT_LIMIT = "supabase/functions/check-applicant-limit/index.ts";
const VOICE_BILLING = "supabase/functions/_shared/voiceInterviewBilling.ts";

export default [
  {
    id: "job-billing-checkout-functions-gate-on-billing-flag",
    why:
      "unlock-job-checkout, purchase-applicant-pack-checkout and ava-boost-checkout must call getBillingFlags() and " +
      "refuse (before ever calling stripe.checkout.sessions.create) when the relevant flag is off. Without this, any " +
      "one of them would start creating real Stripe Checkout sessions — a price shown as due — the instant " +
      "billing_enabled/boost_enabled flips on somewhere else, with no gate of its own.",
    run: async ({ read }) => {
      const bad = [];
      for (const { file, flag, createCall } of CHECKOUT_FUNCTIONS) {
        const src = await read(file);
        if (src == null) {
          bad.push(`${file} is missing`);
          continue;
        }
        if (!/from ["']\.\.\/_shared\/billingFlags\.ts["']/.test(src) || !/getBillingFlags\(/.test(src)) {
          bad.push(`${file} never calls getBillingFlags() — nothing stops it running while billing is off`);
          continue;
        }
        const flagCheckIdx = src.indexOf(`!${flag}`);
        const createIdx = src.indexOf(createCall);
        if (flagCheckIdx === -1) {
          bad.push(`${file} does not check \`!${flag}\` — the specific flag this function depends on is never tested`);
          continue;
        }
        if (createIdx === -1) {
          bad.push(`${file} no longer calls ${createCall} — check this guard still matches the code`);
          continue;
        }
        if (flagCheckIdx > createIdx) {
          bad.push(`${file} checks \`!${flag}\` AFTER already calling ${createCall} — the checkout session is created before the gate runs`);
        }
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "check-applicant-limit-never-blocks-submission-for-billing",
    why:
      "Owner-decided pricing: locked jobs keep accepting applications — applicants are never lost or rejected by " +
      "the lock. check-applicant-limit's billing-on branch must unconditionally return limitReached:false; if any " +
      "applicant-count comparison creeps back into that branch, a real candidate submission would start getting " +
      "refused for a billing reason again, exactly the bug free_tier_open (20260904110000) already fixed once for " +
      "the old plan-limit code path.",
    run: async ({ read }) => {
      const src = await read(CHECK_APPLICANT_LIMIT);
      if (src == null) return { ok: false, detail: [`${CHECK_APPLICANT_LIMIT} is missing`] };
      const bad = [];

      if (!/getBillingFlags\(/.test(src)) {
        bad.push(`${CHECK_APPLICANT_LIMIT} no longer calls getBillingFlags()`);
        return { ok: false, detail: bad };
      }

      const m = src.match(/if \(billing\.billingEnabled\) \{([\s\S]*?)\n {4}\}/);
      if (!m) {
        bad.push(`${CHECK_APPLICANT_LIMIT}: the \`if (billing.billingEnabled)\` branch is gone or unrecognisable`);
        return { ok: false, detail: bad };
      }
      const branch = m[1];
      if (!/limitReached:\s*false/.test(branch)) {
        bad.push(`${CHECK_APPLICANT_LIMIT}: the billing-on branch no longer unconditionally returns limitReached:false`);
      }
      if (/currentCount|applicantsCount|>=\s*limit/.test(branch)) {
        bad.push(`${CHECK_APPLICANT_LIMIT}: an applicant-count comparison is back inside the billing-on branch — this is how submissions get blocked again`);
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "voice-overage-charge-checks-billing-flag-before-any-charge",
    why:
      "The $2 voice-interview overage must never run — no DB write, no Stripe charge — while billing is off. " +
      "recordVoiceInterviewCharge is the one place that decides this for every candidate voice interview " +
      "(ava-voice-session calls it after every mint), so its very first move must be reading the flag and " +
      "returning early when it's off.",
    run: async ({ read }) => {
      const src = await read(VOICE_BILLING);
      if (src == null) return { ok: false, detail: [`${VOICE_BILLING} is missing`] };
      const bad = [];
      if (!/const billing = await getBillingFlags\(/.test(src)) {
        bad.push(`${VOICE_BILLING} no longer starts by reading getBillingFlags()`);
      }
      if (!/if \(!billing\.billingEnabled\) \{\s*\n\s*return \{ billingEnabled: false, billable: false, status: "skipped" \};/.test(src)) {
        bad.push(`${VOICE_BILLING} no longer returns a no-op result immediately when billing is off`);
      }
      // The flag check must textually precede every write/charge call.
      const flagIdx = src.indexOf("if (!billing.billingEnabled)");
      const firstWriteIdx = Math.min(
        ...["stripe.paymentIntents.create(", '.from("voice_interview_charges").insert('].map((needle) => {
          const i = src.indexOf(needle);
          return i === -1 ? Infinity : i;
        }),
      );
      if (flagIdx === -1 || firstWriteIdx === Infinity || flagIdx > firstWriteIdx) {
        bad.push(`${VOICE_BILLING}: the billing-off early return does not come before every charge/write — check ordering`);
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "no-stripe-secret-key-test-fallback-in-job-billing",
    why:
      "A hardcoded sk_test_/pk_test_ fallback for STRIPE_SECRET_KEY would silently run job-billing checkouts, the " +
      "$2 voice overage, and Ava Boost captures against Stripe's TEST mode in production — real money never " +
      "moves, but the UI looks like it worked. Every one of these files must read STRIPE_SECRET_KEY from the " +
      "environment with an EMPTY fallback (fail loudly), never a literal test key — same rule the existing " +
      "stripe-key-fails-loudly guard already enforces for pk_test_ across the whole repo; this one is scoped to " +
      "this feature's own files, including the secret key pattern voice/boost overage charging introduces.",
    run: async ({ read }) => {
      const files = [
        "supabase/functions/unlock-job-checkout/index.ts",
        "supabase/functions/purchase-applicant-pack-checkout/index.ts",
        "supabase/functions/ava-boost-checkout/index.ts",
        "supabase/functions/ava-boost-worker/index.ts",
        "supabase/functions/_shared/voiceInterviewBilling.ts",
        "supabase/functions/stripe-webhook/index.ts",
      ];
      const bad = [];
      for (const file of files) {
        const src = await read(file);
        if (src == null) continue;
        if (/sk_test_[A-Za-z0-9]/.test(src) || /pk_test_[A-Za-z0-9]/.test(src)) {
          bad.push(`${file} contains a hardcoded Stripe test-mode key`);
        }
        for (const m of src.matchAll(/Deno\.env\.get\(\s*["']STRIPE_SECRET_KEY["']\s*\)\s*(\|\|\s*([^,;\n)]+))?/g)) {
          const fallback = m[2]?.trim();
          if (fallback && fallback !== '""' && fallback !== "''") {
            bad.push(`${file}: STRIPE_SECRET_KEY falls back to ${fallback} instead of failing loudly with an empty string`);
          }
        }
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
