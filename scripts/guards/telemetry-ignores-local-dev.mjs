/**
 * Production crash reports were all dev-server noise (2026-09-16): pages
 * served by vite on localhost post to the same client-errors / page-views
 * endpoints as the live site, so duplicate-React errors from local test runs
 * were the only "crashes" on record, burying any real one. Every visitor's
 * console also showed a Stripe-key error at import time while billing is off.
 * Behavior is proven in scripts/telemetry_sanitizing.test.mjs (isLocalDevOrigin).
 */
export default [
  {
    id: "telemetry-ignores-local-dev",
    why:
      "client-errors and page-views must drop requests from local dev origins, crashReporter must not " +
      "send from a DEV build, beacon.js must not count localhost, and the missing-Stripe-key console " +
      "error must fire at checkout, not at import on every page.",
    async run({ read }) {
      const bad = [];
      for (const fn of ["client-errors", "page-views"]) {
        const src = (await read(`supabase/functions/${fn}/index.ts`)) ?? "";
        if (!/isLocalDevOrigin\(req\.headers\.get\("origin"\)/.test(src)) bad.push(`${fn} no longer skips local dev origins`);
        const devAt = src.indexOf("isLocalDevOrigin(req");
        const limitAt = src.indexOf("guardPublicAiCall(req");
        if (devAt > -1 && limitAt > -1 && devAt > limitAt) bad.push(`${fn} checks the rate limit before dropping local dev requests`);
      }
      const reporter = (await read("src/lib/crashReporter.ts")) ?? "";
      if (!/if \(import\.meta\.env\.DEV\) return;/.test(reporter)) bad.push("crashReporter.reportError sends from DEV builds again");
      const beacon = (await read("public/beacon.js")) ?? "";
      if (!/isOptedOut\(\) \|\| isLocalHost\(\)/.test(beacon)) bad.push("beacon.js counts localhost page views again");
      const checkout = (await read("src/components/subscription/EmbeddedCheckoutDialog.tsx")) ?? "";
      const firstLog = checkout.indexOf("VITE_STRIPE_PUBLISHABLE_KEY is not set");
      const componentAt = checkout.indexOf("export default function EmbeddedCheckoutDialog");
      if (firstLog > -1 && componentAt > -1 && firstLog < componentAt) {
        bad.push("the missing-Stripe-key console error runs at import time again (every page, every visitor)");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
