/**
 * Improvement Blueprint entitlement switch and Stripe pricing (owner
 * decision, 2026-09-16: keep the $1.99 candidate coaching report, rework it,
 * and make it free while billing is off — nothing may sit behind a paywall
 * while the free tier is open).
 *
 * Checks, one per shipped guarantee:
 *
 *  1. purchase-blueprint no longer has a hardcoded fallback Stripe price id
 *     (a wrong/stale price previously charged the wrong amount silently) —
 *     it must read STRIPE_BLUEPRINT_PRICE_ID and throw if it's unset.
 *  2. purchase-blueprint refuses to open a checkout session while billing is
 *     off (app_settings 'blueprint_paid' = false) rather than charging for
 *     something that's supposed to be free right now.
 *  3. The candidate-facing pricing button in src/pages/Applications.tsx
 *     reads the same server-side switch (useBlueprintBilling) rather than
 *     inferring "is this paid" from environment variable presence
 *     (VITE_STRIPE_PUBLISHABLE_KEY) — that used to hide the whole feature
 *     whenever the key was unset, even though access is decided server-side.
 *  4. supabase/functions/_shared/blueprintReport.ts's validator rejects a
 *     report that isn't grounded in this schema (see
 *     scripts/blueprint_report_schema.test.mjs for the full behavioral
 *     proof; this is a cheap static check that the wiring exists).
 */

const PURCHASE_FN = "supabase/functions/purchase-blueprint/index.ts";
const APPLICATIONS_PAGE = "src/pages/Applications.tsx";
const REPORT_FN = "supabase/functions/ai-generate-performance-report/index.ts";
const BLUEPRINT_SCHEMA = "supabase/functions/_shared/blueprintReport.ts";

export default [
  {
    id: "purchase-blueprint-no-hardcoded-price-fallback",
    why:
      `${PURCHASE_FN} used to fall back to a hardcoded price id ` +
      '("price_1SilejJoMc2msNl4FjnsSEb4") when STRIPE_BLUEPRINT_PRICE_ID was unset -- a stale or ' +
      "wrong id there would silently charge candidates the wrong amount. It must fail loudly instead.",
    run: async ({ read }) => {
      const src = await read(PURCHASE_FN);
      if (!src) return { ok: false, detail: [`${PURCHASE_FN} not found`] };
      const bad = [];
      if (/STRIPE_BLUEPRINT_PRICE_ID["'`]\)\s*\|\|\s*["'`]price_/.test(src)) {
        bad.push("a hardcoded Stripe price id fallback is back — remove it, fail loudly instead");
      }
      if (!/STRIPE_BLUEPRINT_PRICE_ID/.test(src)) {
        bad.push("no longer reads STRIPE_BLUEPRINT_PRICE_ID at all");
      }
      if (!/if\s*\(\s*!BLUEPRINT_PRICE_ID\s*\)\s*throw/.test(src)) {
        bad.push("a missing STRIPE_BLUEPRINT_PRICE_ID must throw (fail loudly), not silently proceed with no price or a guessed one");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "purchase-blueprint-refuses-checkout-while-billing-off",
    why:
      `${PURCHASE_FN} must not open a Stripe checkout session while app_settings 'blueprint_paid' ` +
      "is false -- the free tier is open on purpose (20260904110000_free_tier_open) and nothing " +
      "may sit behind a paywall while billing is off, even if this function is reached directly.",
    run: async ({ read }) => {
      const src = await read(PURCHASE_FN);
      if (!src) return { ok: false, detail: [`${PURCHASE_FN} not found`] };
      const bad = [];
      if (!/isBlueprintBillingEnabled/.test(src)) {
        bad.push("no isBlueprintBillingEnabled(...) check -- checkout can open even while billing is off");
      }
      const notBillingIdx = src.indexOf("!billingEnabled");
      const sessionCreateIdx = src.indexOf("stripe.checkout.sessions.create");
      const refusalStatusIdx = notBillingIdx === -1 ? -1 : src.indexOf("status: 400", notBillingIdx);
      if (notBillingIdx === -1) {
        bad.push("no `!billingEnabled` branch -- checkout can open even while billing is off");
      } else if (refusalStatusIdx === -1 || (sessionCreateIdx !== -1 && refusalStatusIdx > sessionCreateIdx)) {
        bad.push("billing-off must refuse with a 400 response before Stripe is touched, not proceed to create a session");
      }
      // The billing check must run before the Stripe secret key / checkout
      // session creation, not after.
      const billingIdx = src.indexOf("isBlueprintBillingEnabled(");
      if (billingIdx === -1 || sessionCreateIdx === -1 || billingIdx > sessionCreateIdx) {
        bad.push("the billing-off check must run before stripe.checkout.sessions.create, not after");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "blueprint-price-gate-is-server-side-not-env-presence",
    why:
      `${APPLICATIONS_PAGE} used to hide the blueprint button entirely behind ` +
      "!!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY -- a build-time client guess that has " +
      "nothing to do with whether the report is actually free (billing off) or paid. It must read " +
      "the real server-side switch instead.",
    run: async ({ read }) => {
      const src = await read(APPLICATIONS_PAGE);
      if (!src) return { ok: false, detail: [`${APPLICATIONS_PAGE} not found`] };
      const bad = [];
      if (/VITE_STRIPE_PUBLISHABLE_KEY/.test(src)) {
        bad.push("still gates the blueprint offer on VITE_STRIPE_PUBLISHABLE_KEY presence instead of the app_settings switch");
      }
      if (!/useBlueprintBilling/.test(src)) {
        bad.push("no useBlueprintBilling() call -- the button can't tell whether billing is actually on");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "performance-report-uses-schema-validated-blueprint-generation",
    why:
      `${REPORT_FN} must validate the model's output against ${BLUEPRINT_SCHEMA}'s ` +
      "validateBlueprintReport (structure, the exact developmental disclaimer, and never naming " +
      "AI or Ava) before returning it to a candidate -- an unvalidated response could ship a " +
      "malformed report or leak a forbidden word straight to candidate-facing copy.",
    run: async ({ read }) => {
      const src = await read(REPORT_FN);
      const schemaSrc = await read(BLUEPRINT_SCHEMA);
      if (!src) return { ok: false, detail: [`${REPORT_FN} not found`] };
      if (!schemaSrc) return { ok: false, detail: [`${BLUEPRINT_SCHEMA} not found`] };
      const bad = [];
      if (!/validateBlueprintReport/.test(src)) {
        bad.push(`${REPORT_FN} no longer imports/uses validateBlueprintReport`);
      }
      if (!/validator:\s*validateBlueprintReport/.test(src)) {
        bad.push("validateBlueprintReport is not wired as callOpenAIJson's validator option");
      }
      if (!/function\s+validateBlueprintReport/.test(schemaSrc)) {
        bad.push(`${BLUEPRINT_SCHEMA} missing exported validateBlueprintReport(...)`);
      }
      if (!/REQUIRED_DEVELOPMENTAL_DISCLAIMER/.test(schemaSrc) || !/disclaimer\s*!==\s*REQUIRED_DEVELOPMENTAL_DISCLAIMER/.test(schemaSrc)) {
        bad.push("the exact required developmental disclaimer sentence is no longer enforced word-for-word");
      }
      if (!/FORBIDDEN_TERMS/.test(schemaSrc) || !/\\bava\\b/.test(schemaSrc)) {
        bad.push('the "candidates never see AI or Ava" check on the generated report is gone');
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
