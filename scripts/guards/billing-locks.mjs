/**
 * Billing, pricing v9 (2026-10-31; docs/BILLING.md;
 * supabase/migrations/20261031100000_billing_pricing_v9.sql).
 *
 *   - billing-off-changes-nothing: CLAUDE.md, "Nothing may sit behind a
 *     paywall or show a price as due while billing is off." The publish check,
 *     the hourly run, billing_state and checkout's question each return before
 *     anything else while app_settings.billing_enabled is not true; HireFlow's
 *     prices are written only in src/lib/billing.ts, whose screens answer
 *     nothing unless billingShown(); the payment dialog opens only on the
 *     database's refusal (which never comes while billing is off) or on
 *     repostNeedsPayment (false while off); the Settings card draws nothing
 *     without billingCard(); no public page shows a price.
 *   - billing-exemption-is-platform-admins-only: the owner's own account is
 *     exempt through public.platform_admins and nothing else: never
 *     home_alias, never subscription_bypass / has_subscription_bypass_for_user.
 *   - billing-webhook-verifies-and-is-idempotent: billing-webhook checks the
 *     Stripe-Signature header (HMAC-SHA256 of the raw body, constant-time,
 *     300 seconds) before it reaches the database, and every billing_apply_*
 *     records the event id first, in the same transaction as its effect.
 *   - billing-tables-server-written: only the service role writes the billing
 *     tables and calls the billing functions; owners read their own rows.
 *   - publish-needs-a-pass: the check runs AFTER INSERT OR UPDATE for each row
 *     with no WHEN (a status set by another trigger is seen), refuses with
 *     HINT payment_required, takes the free job once under a unique index,
 *     and the hourly run is scheduled.
 *   - billing-prices-by-lookup-key: no Stripe price id is written anywhere;
 *     prices are found by lookup key.
 *   - never-two-unlimited-and-money-given-back (the billing review,
 *     2026-10-31, findings 1, 4, 5, 8, 11): Checkout takes cards only, one
 *     claim at a time, the earlier page expired, Stripe's own list of the
 *     customer's subscriptions asked before an Unlimited; the webhook cancels
 *     and refunds a second one and refunds a payment with nothing given, with
 *     keys from the event; delete-account cancels every subscription Stripe
 *     lists and never takes "no such subscription" across modes.
 *   - billing-sync-checks-its-caller: billing-sync, called by pg_cron without
 *     a sign-in, answers only the Vault secret and is scheduled before the
 *     hourly close.
 *   - payment-history-is-the-owners (2026-11-01; 20261101100000_billing_receipts.sql):
 *     the payment history, the receipts and the amounts are the business
 *     owner's only (never a teammate's, never while billing is off, never the
 *     exempt account's); a receipt is only ever Stripe's own https page; paying
 *     inside HireFlow keeps every rule of Checkout (cards only, one claim, the
 *     Idempotency-Key, the way back on HireFlow's own host), and Stripe.js is
 *     allowed by the Content-Security-Policy.
 *
 * Behaviour: launch_locks_behaviour section 33 (the SQL),
 * scripts/billing_webhook.test.mjs, scripts/billing_checkout.test.mjs,
 * scripts/billing_screens.test.mjs.
 */
import { grantsToBrowser, latestDefinition, migrationTexts, triggerProblems } from "./phase-7-launch-locks.mjs";

/** SQL without comments, spaces collapsed. */
const plain = (sql) => (sql ?? "").replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ");
/** TS without comments. */
const code = (ts) => (ts ?? "").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

const BILLING_SQL_FUNCTIONS = [
  "billing_on",
  "billing_exempt",
  "billing_unlimited_active",
  "billing_unlimited_end_unconfirmed",
  "billing_job_has_time",
  "billing_email_fingerprint",
  "billing_free_job_available",
  "billing_alert_admins",
  "billing_switch_on",
  "billing_sync_secret_matches",
  "billing_checkout_begin",
  "billing_checkout_opened",
  "billing_checkout_closed",
  "billing_refund_json",
  "billing_refund_owe",
  "billing_refund_owed",
  "billing_refund_result",
  "billing_write_subscription",
  "billing_record_unpaid_checkout",
  "billing_sync_due",
  "billing_sync_subscription",
  "billing_sync_missing",
  "jobs_publish_needs_pass",
  "billing_close_for",
  "billing_close_ended_jobs",
  "billing_state",
  "billing_business_of",
  "billing_checkout_check",
  "billing_portal_check",
  "billing_save_customer",
  "billing_owner_of_customer",
  "billing_event_new",
  "billing_event_outcome",
  "billing_publish_paid_job",
  "billing_apply_job_payment",
  "billing_apply_subscription",
  "billing_apply_payment_failed",
  "billing_apply_refund",
  "billing_record_event",
  // 20261101100000_billing_receipts.sql: receipts and the payment history.
  "billing_receipt_url",
  "billing_save_receipt",
  "billing_save_invoice",
  "billing_history",
];

const APPLY_FUNCTIONS = ["billing_apply_job_payment", "billing_apply_subscription", "billing_apply_payment_failed", "billing_apply_refund", "billing_record_event", "billing_record_unpaid_checkout"];

/** The billing tables: written by the service role only. */
const BILLING_TABLES = ["billing_customers", "job_passes", "billing_events", "billing_free_job_emails", "billing_refunds", "billing_refunded_payments", "billing_checkouts", "billing_switch_ons", "billing_deleted_customers", "billing_invoices"];
/** What a browser may read: an owner their customer; job_passes' days, never a Stripe id or the amount. */
const BROWSER_READS = { billing_customers: "select", job_passes: "columns" };

/** A migration's leading timestamp (its version), or "" (the billing review, finding 19: the guard compared rel.slice(-40)). */
export const migrationStamp = (rel) => (/(?:^|\/)(\d{14})_[^/]*\.sql$/.exec(rel ?? "") ?? [])[1] ?? "";
/** Migrations from v9 on: those that may weaken what v9 locks. */
export const fromV9On = (rel) => migrationStamp(rel) >= "20261031100000";

/** SQL without the one function allowed to switch billing on (billing_switch_on's own CREATE). */
const withoutSwitchOn = (sql) => (sql ?? "").replace(/create\s+or\s+replace\s+function\s+public\.billing_switch_on\s*\(\)[\s\S]*?\$\$[\s\S]*?\$\$\s*;/gi, " ");

const BILLING_CODE_FILES = [
  "supabase/functions/billing-checkout/index.ts",
  "supabase/functions/billing-portal/index.ts",
  "supabase/functions/billing-webhook/index.ts",
  "supabase/functions/billing-webhook/handle.ts",
  "supabase/functions/_shared/stripe.ts",
  "supabase/functions/get-subscription/index.ts",
  "src/lib/billing.ts",
  "src/lib/billingApi.ts",
  "src/hooks/useSubscription.ts",
  "src/components/billing/PublishPaymentDialog.tsx",
  "src/components/billing/BillingCard.tsx",
  "src/cockpit/components/BillingReturnNote.tsx",
  "supabase/functions/billing-sync/index.ts",
  "supabase/functions/billing-sync/sync.ts",
  "src/components/billing/PaymentConfirmation.tsx",
  "src/components/billing/PlanButton.tsx",
  "src/components/billing/BillingTab.tsx",
  "src/components/billing/CheckoutDialog.tsx",
  "src/components/billing/StripeCheckoutForm.tsx",
  "src/components/billing/DaysRing.tsx",
];

/** HireFlow's own prices, however they are written. */
const PRICE = /\$\s?(?:99|299)\b|\b(?:99|299)\s?(?:USD|dollars)\b|\bUSD\s?(?:99|299)\b/;

export default [
  {
    id: "billing-off-changes-nothing",
    why:
      "While app_settings.billing_enabled is off nothing may change for anyone: no price shown, no plan, no " +
      "\"upgrade\", no publish refused for money (CLAUDE.md, \"Distribution & billing state\"). The publish check, " +
      "the hourly run, billing_state and billing_checkout_check must return before anything else when billing is " +
      "off; prices live only in src/lib/billing.ts, whose screens answer nothing unless billingShown(); the payment " +
      "dialog opens only on the database's refusal or repostNeedsPayment, and the Settings card only through billingCard().",
    run: async (ctx) => {
      const { read, walk } = ctx;
      const detail = [];
      // The database: off returns first.
      const firstGate = [
        ["jobs_publish_needs_pass", /IF NOT public\.billing_on\(\) THEN RETURN NULL; END IF;/i],
        ["billing_close_for", /BEGIN IF NOT public\.billing_on\(\) THEN RETURN 0; END IF;/i],
        ["billing_checkout_check", /BEGIN IF NOT public\.billing_on\(\) THEN RETURN jsonb_build_object\('ok', false, 'reason', 'billing_off'\); END IF;/i],
      ];
      for (const [fn, gate] of firstGate) {
        const def = await latestDefinition(ctx, fn);
        if (!def) {
          detail.push(`no migration defines public.${fn}`);
          continue;
        }
        const body = plain(def.body);
        const at = body.search(gate);
        if (at < 0) detail.push(`${def.rel}: ${fn} no longer returns at once while billing is off`);
        // Nothing reads a pass, a plan or the free job before that.
        const before = at < 0 ? body : body.slice(0, at);
        if (/job_passes|subscriptions|billing_exempt|billing_unlimited_active|INSERT|UPDATE|RAISE/i.test(before.replace(/IF new\.status IS DISTINCT FROM 'published'::job_status THEN RETURN NULL; END IF; IF tg_op = 'UPDATE' AND old\.status = 'published'::job_status THEN RETURN NULL; END IF;/i, "")))
          detail.push(`${def.rel}: ${fn} looks at billing before it checks billing_on()`);
      }
      const state = await latestDefinition(ctx, "billing_state");
      if (!state || !/IF NOT public\.billing_on\(\) THEN RETURN jsonb_build_object\('billingEnabled', false, 'exempt', v_exempt, 'plan', null, 'freeJobAvailable', null, 'unlimited', null, 'hasCustomer', false, 'jobs', '\{\}'::jsonb\); END IF;/i.test(plain(state.body)))
        detail.push(`${state?.rel ?? "supabase/migrations"}: billing_state must answer only "off" (no plan, no jobs) while billing is off`);
      const on = await latestDefinition(ctx, "billing_on");
      if (!on || !/coalesce\(\(select \(s\.value #>> '\{\}'\) = 'true' from public\.app_settings s where s\.key = 'billing_enabled'\), false\)/i.test(plain(on.body)))
        detail.push(`${on?.rel ?? "supabase/migrations"}: billing_on must be true only for app_settings.billing_enabled = true, false otherwise`);
      // The setting starts off: no migration turns it on. Only billing_switch_on
      // (service role, the owner, last) writes true, and no migration calls it.
      for (const { rel, sql } of await migrationTexts(ctx)) {
        const rest = withoutSwitchOn(sql);
        if (/billing_enabled'?\s*,\s*'true'|set\s+value\s*=\s*'true'(?:::jsonb)?\s+where\s+key\s*=\s*'billing_enabled'|'billing_enabled'[^;]*\btrue\b/i.test(rest)) detail.push(`${rel}: a migration turns billing on (only the owner does, with billing_switch_on(): docs/BILLING.md)`);
        if (/\bbilling_switch_on\s*\(\s*\)/i.test(rest.replace(/(?:revoke|grant)\s+[^;]*billing_switch_on\s*\(\s*\)[^;]*;/gi, " ").replace(/'[^']*billing_switch_on[^']*'/g, " "))) detail.push(`${rel}: a migration calls billing_switch_on() (only the owner does, by hand)`);
      }
      const due = await latestDefinition(ctx, "billing_sync_due");
      if (!due || !/^\s*select case when not public\.billing_on\(\) then '\[\]'::jsonb else/i.test(plain(due.body))) detail.push(`${due?.rel ?? "supabase/migrations"}: billing_sync_due must hand billing-sync nothing while billing is off`);

      // The app: prices only in src/lib/billing.ts.
      const shipped = [...(await walk("src", [".ts", ".tsx"])), ...(await walk("public", [".html", ".js"])), ...(await walk("api", [".mjs", ".js"])), "index.html"];
      // The front page is static, so it cannot ask whether billing is on. Billing
      // has been on since 2026-11-01 (the owner: "make that live"), and the front
      // page states the prices in one line, exactly the app's own: a price changed
      // in src/lib/billing.ts fails here until that line says the same. If billing
      // is ever switched off again, the line goes (docs/BILLING.md).
      const priceSource = code(await read("src/lib/billing.ts"));
      const constant = (name) => new RegExp(`export const ${name} = "([^"]+)"`).exec(priceSource)?.[1];
      const days = /export const PASS_DAYS = (\d+);/.exec(priceSource)?.[1];
      for (const rel of shipped) {
        if (rel === "src/lib/billing.ts" || rel.startsWith("src/dev-preview/")) continue;
        let text = code(await read(rel));
        if (rel === "public/landing.html") {
          const line = /<p class="price">([^<]*)<\/p>/.exec(text)?.[1] ?? "";
          const job = constant("PRICE_JOB"), unlimited = constant("PRICE_UNLIMITED");
          if (!job || !unlimited || !line.includes(`${job} keeps a job live for ${days} days`) || !line.includes(`Unlimited is ${unlimited}`))
            detail.push(`public/landing.html: the price line must state src/lib/billing.ts's own prices (${job ?? "?"} a job for ${days ?? "?"} days, Unlimited ${unlimited ?? "?"})`);
          text = text.replace(/<p class="price">[^<]*<\/p>/, "").replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, "");
        }
        if (PRICE.test(text)) detail.push(`${rel}: shows one of HireFlow's prices (they live in src/lib/billing.ts; the front page only in its one price line)`);
      }
      const words = code(await read("src/lib/billing.ts"));
      for (const fn of ["jobPassLine", "billingCard", "repostNeedsPayment", "billingTabShown", "planSummary", "paymentHistoryRows"]) {
        const m = new RegExp(`export function ${fn}\\([\\s\\S]*?\\)[^{]*\\{([\\s\\S]*?)\\n\\}`).exec(words);
        if (!m || !/if \(!billingShown\(state\)/.test(m[1].split("\n").slice(0, 3).join("\n"))) detail.push(`src/lib/billing.ts: ${fn} must answer nothing unless billingShown(state)`);
      }
      if (!/export function billingShown\(state[^)]*\): state is BillingState \{\s*return !!state && state\.billingEnabled === true;\s*\}/.test(words)) detail.push("src/lib/billing.ts: billingShown must be true only for billingEnabled === true");
      const note = code(await read("src/cockpit/components/BillingReturnNote.tsx"));
      if (!/const back = billingShown\(billing\) \? billingReturn\(params\.get\("billing"\)\) : null;/.test(note)) detail.push("src/cockpit/components/BillingReturnNote.tsx: the note after Checkout must say nothing unless billingShown(billing) (a made-up ?billing=paid while billing is off)");
      const card = code(await read("src/components/billing/BillingCard.tsx"));
      if (!/const card = billingCard\(billing\);/.test(card) || !/if \(!card\) return null;/.test(card)) detail.push("src/components/billing/BillingCard.tsx: the card must draw nothing when billingCard() answers null (billing off)");
      // Every page that opens the payment dialog does so on the refusal or repostNeedsPayment only.
      for (const rel of await walk("src", [".tsx"])) {
        const text = code(await read(rel));
        if (!/<PublishPaymentDialog\b/.test(text) || rel === "src/components/billing/PublishPaymentDialog.tsx") continue;
        if (!/isPaymentRequiredError\(|repostNeedsPayment\(/.test(text)) detail.push(`${rel}: opens the payment dialog without the database's refusal (isPaymentRequiredError) or repostNeedsPayment`);
        for (const m of text.matchAll(/\bset(PaymentJob|PayOpen|PayFor)\(([^)]*)\)/g)) {
          if (/^null$|^false$/.test(m[2].trim())) continue;
          const window = text.slice(Math.max(0, m.index - 900), m.index);
          if (!/isPaymentRequiredError\(|repostNeedsPayment\(/.test(window)) detail.push(`${rel}: set${m[1]}(${m[2].trim().slice(0, 30)}) opens the payment dialog away from the refusal or repostNeedsPayment`);
        }
      }
      // Applicants: get-subscription tells them nothing about billing.
      const gs = code(await read("supabase/functions/get-subscription/index.ts"));
      if (!/if \(isCandidateOnly\) return json\(\{ teamAccess, billing: null \}\);/.test(gs)) detail.push("supabase/functions/get-subscription/index.ts: an applicant must get billing: null");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "billing-exemption-is-platform-admins-only",
    why:
      "The owner's own account never pays, and it is exempt through public.platform_admins only (the owner, " +
      "2026-10-31): never business_pages.home_alias, never the old subscription_bypass app metadata or " +
      "private.has_subscription_bypass_for_user. A second way to be exempt is a way to never pay.",
    run: async (ctx) => {
      const { read } = ctx;
      const detail = [];
      const exempt = await latestDefinition(ctx, "billing_exempt");
      if (!exempt || plain(exempt.body).trim() !== "select p_owner is not null and exists (select 1 from public.platform_admins a where a.user_id = p_owner);")
        detail.push(`${exempt?.rel ?? "supabase/migrations"}: billing_exempt must be exactly "a row in public.platform_admins"`);
      for (const fn of BILLING_SQL_FUNCTIONS) {
        const def = await latestDefinition(ctx, fn);
        if (!def) {
          detail.push(`no migration defines public.${fn}`);
          continue;
        }
        if (/home_alias|subscription_bypass|has_subscription_bypass_for_user|raw_app_meta_data/i.test(plain(def.body))) detail.push(`${def.rel}: ${fn} reads home_alias or subscription_bypass (platform_admins is the only exemption)`);
        // billing_alert_admins reads it only to address the admins' card.
        if (fn !== "billing_exempt" && fn !== "billing_alert_admins" && /platform_admins/i.test(plain(def.body))) detail.push(`${def.rel}: ${fn} reads platform_admins itself (ask billing_exempt, the one rule)`);
      }
      const alert = await latestDefinition(ctx, "billing_alert_admins");
      if (!alert || !/insert into public\.notifications \(user_id, type, title, message, link, is_read\) select a\.user_id, 'system', left\(coalesce\(p_title, 'Billing'\), 160\), left\(coalesce\(p_message, ''\), 600\), '\/admin', false from public\.platform_admins a; return true;/i.test(plain(alert.body)))
        detail.push(`${alert?.rel ?? "supabase/migrations"}: billing_alert_admins may read platform_admins only to address the admins' card`);
      for (const rel of BILLING_CODE_FILES) {
        const text = code(await read(rel));
        if (!text) {
          detail.push(`${rel} is missing`);
          continue;
        }
        if (/home_alias|homeBusiness|subscription_bypass|subscriptionBypass|hasSubscriptionBypass/i.test(text)) detail.push(`${rel}: billing code reads home_alias or subscription_bypass (platform_admins is the only exemption)`);
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "billing-webhook-verifies-and-is-idempotent",
    why:
      "billing-webhook is reachable without sign-in: anyone could post a made-up \"checkout.session.completed\" and " +
      "put a job live for free. It must read the raw body, check the Stripe-Signature header (HMAC-SHA256, every v1 " +
      "compared in constant time, 300 seconds' tolerance) and refuse with 400 before it reaches the database; and every " +
      "billing_apply_* must record the event id first, in the same transaction, so a replayed event changes nothing.",
    run: async (ctx) => {
      const { read } = ctx;
      const detail = [];
      const index = code(await read("supabase/functions/billing-webhook/index.ts"));
      const raw = index.indexOf("await req.text()");
      const verify = index.indexOf("verifyStripeSignature(payload, req.headers.get(\"stripe-signature\"), config.webhookSecret)");
      const refuse = index.search(/if \(!signature\.ok\) \{[\s\S]{0,200}return json\(\{ error: "signature", reason: signature\.reason \}, 400\);/);
      const parse = index.indexOf("JSON.parse(payload)");
      const client = index.indexOf("createClient(");
      const handle = index.indexOf("handleStripeEvent(");
      if (raw < 0 || verify < 0 || refuse < 0 || !(raw < verify && verify < refuse && refuse < parse && parse < client && client < handle))
        detail.push("supabase/functions/billing-webhook/index.ts: it must read the raw body, verify the signature and answer 400 before parsing, creating a client or handling the event");
      if (/req\.json\(\)/.test(index)) detail.push("supabase/functions/billing-webhook/index.ts: the body must be read raw (req.text()), never re-serialised");
      if (!/if \(!config\) return json\(\{ error: NOT_SET_UP \}, 503\);/.test(index)) detail.push("supabase/functions/billing-webhook/index.ts: 503 \"billing is not set up\" while a Stripe secret is missing");
      const stripe = code(await read("supabase/functions/_shared/stripe.ts"));
      if (!/export const WEBHOOK_TOLERANCE_SECONDS = 300;/.test(stripe)) detail.push("_shared/stripe.ts: the webhook's tolerance must be 300 seconds");
      if (!/\{ name: "HMAC", hash: "SHA-256" \}/.test(stripe) || !/`\$\{timestamp\}\.\$\{payload\}`/.test(stripe)) detail.push("_shared/stripe.ts: the signature must be HMAC-SHA256 of \"<t>.<raw body>\"");
      if (!/for \(const signature of signatures\) matched = timingSafeEqual\(signature, expected\) \|\| matched;/.test(stripe)) detail.push("_shared/stripe.ts: every v1 must be compared, in constant time (timingSafeEqual), with no early return");
      if (!/if \(Math\.abs\(nowSeconds - timestamp\) > toleranceSeconds\) return \{ ok: false, reason: "too_old" \};/.test(stripe)) detail.push("_shared/stripe.ts: a signature older (or further ahead) than the tolerance must be refused");
      const config = (await read("supabase/config.toml")) ?? "";
      if (!/\[functions\.billing-webhook\][^[]*verify_jwt\s*=\s*false/.test(config)) detail.push("supabase/config.toml: billing-webhook must be verify_jwt = false (Stripe has no sign-in; the signature is the check)");
      for (const fn of ["billing-checkout", "billing-portal"]) {
        if (!new RegExp(`\\[functions\\.${fn}\\][^[]*verify_jwt\\s*=\\s*true`).test(config)) detail.push(`supabase/config.toml: ${fn} must be verify_jwt = true`);
        const text = code(await read(`supabase/functions/${fn}/index.ts`));
        if (!/const caller = await requireSignedInUser\(req, corsHeaders\);\s*if \(caller\.refusal\) return caller\.refusal;/.test(text)) detail.push(`supabase/functions/${fn}/index.ts: it must ask who is signed in (requireSignedInUser)`);
      }
      // Each event's id goes in first, with its effect.
      for (const fn of APPLY_FUNCTIONS) {
        const def = await latestDefinition(ctx, fn);
        const body = plain(def?.body);
        const first = body.search(/IF NOT public\.billing_event_new\(p_event_id, p_event_type, p_livemode\) THEN RETURN jsonb_build_object\('ok', true, 'duplicate', true\); END IF;/i);
        const effect = body.search(/\b(INSERT|UPDATE|DELETE|PERFORM public\.billing_(?:publish|close))/i);
        if (!def || first < 0 || (effect >= 0 && effect < first)) detail.push(`${def?.rel ?? "supabase/migrations"}: ${fn} must record the event (billing_event_new) before it changes anything, and answer a repeat as a duplicate`);
      }
      const eventNew = await latestDefinition(ctx, "billing_event_new");
      if (!eventNew || !/insert into public\.billing_events \(id, type, livemode\) values \(p_event_id, left\(coalesce\(p_type, ''\), 100\), p_livemode\) on conflict \(id\) do nothing; get diagnostics v_taken = row_count; return v_taken > 0;/i.test(plain(eventNew.body)))
        detail.push(`${eventNew?.rel ?? "supabase/migrations"}: billing_event_new must insert the event id once (ON CONFLICT DO NOTHING) and say whether it was new`);
      const migrations = await migrationTexts(ctx);
      if (!migrations.some(({ sql }) => /create table if not exists public\.billing_events \(\s*id text primary key/i.test(sql))) detail.push("supabase/migrations: billing_events must be keyed by Stripe's event id");
      // A payment counts only for the business whose customer paid.
      const pay = await latestDefinition(ctx, "billing_apply_job_payment");
      if (!pay || !/v_owner := public\.billing_owner_of_customer\(p_customer\); IF v_owner IS NULL OR v_owner IS DISTINCT FROM p_owner THEN/i.test(plain(pay.body)))
        detail.push(`${pay?.rel ?? "supabase/migrations"}: billing_apply_job_payment must take the owner from the server's own record of the Stripe customer`);
      const handle2 = code(await read("supabase/functions/billing-webhook/handle.ts"));
      if (!/const reply = await deps\.stripe\("GET", `\/subscriptions\/\$\{encodeURIComponent\(subscriptionId\)\}`\);/.test(handle2) || !/const subscription = reply\.ok \? reply\.body : null;/.test(handle2)) detail.push("billing-webhook/handle.ts: a subscription must be read again from Stripe, never taken from the event's body");
      if (!/if \(isResourceMissing\(reply\)\) return done\(await record\(deps, event, "ignored: Stripe has no such subscription"\)/.test(handle2)) detail.push("billing-webhook/handle.ts: Stripe's \"no such subscription\" is permanent: recorded and answered 200, never a 503 Stripe retries for days");
      // A $99 payment is read again from Stripe (refunded already: nothing given) before its pass.
      const charges = handle2.indexOf('deps.stripe("GET", "/charges", { payment_intent: paymentIntent, limit: 10 })');
      const applyPay = handle2.indexOf('deps.rpc("billing_apply_job_payment"');
      if (charges < 0 || applyPay < 0 || charges > applyPay || !/if \(succeeded\.every\(\(c\) => c\.refunded === true\)\) return done\(await record\(deps, event, "ignored: refunded before it was recorded"\)/.test(handle2))
        detail.push("billing-webhook/handle.ts: a $99 payment must be read again from Stripe (its charges) before its pass, and one refunded already gives nothing");
      if (!/if \(object\.payment_status !== "paid"\) \{\s*return done\(await notPaid\(/.test(handle2)) detail.push("billing-webhook/handle.ts: a Checkout that completed unpaid must be recorded and told (billing_record_unpaid_checkout), never ignored");
      // A full refund ends only the paid pass of that payment (never a free or launch one).
      const refundFn = await latestDefinition(ctx, "billing_apply_refund");
      if (!refundFn || !/update public\.job_passes p set status = 'refunded', ended_at = now\(\) where p\.stripe_payment_intent_id = p_payment_intent and p\.kind = 'paid' and p\.status <> 'refunded'/i.test(plain(refundFn.body)) || !/insert into public\.billing_refunded_payments \(stripe_payment_intent_id\) values \(p_payment_intent\)/i.test(plain(refundFn.body)))
        detail.push(`${refundFn?.rel ?? "supabase/migrations"}: billing_apply_refund must end only that payment's paid pass, and remember the payment as refunded`);
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "billing-tables-server-written",
    why:
      "A pass, a customer, an event or an Unlimited subscription written from a browser is a job live for free. Only " +
      "the service role writes billing_customers, job_passes, billing_events and subscriptions' plan; owners read " +
      "their own rows; no browser may call a billing function.",
    run: async (ctx) => {
      const detail = [];
      const migrations = await migrationTexts(ctx);
      const all = migrations.map((m) => m.sql).join("\n");
      for (const table of BILLING_TABLES) {
        if (!new RegExp(`alter table public\\.${table} enable row level security`, "i").test(all)) detail.push(`${table}: row level security is not on`);
        if (!new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i").test(all)) detail.push(`${table}: the browser roles' grants are not revoked`);
        for (const { rel, sql } of migrations) {
          for (const m of sql.matchAll(new RegExp(`create policy "[^"]+" on public\\.${table}\\b[^;]*;`, "gi"))) {
            if (!BROWSER_READS[table]) detail.push(`${rel}: a policy on ${table} (no browser reads or writes it)`);
            else if (!/\bfor select\b/i.test(m[0])) detail.push(`${rel}: a policy on ${table} lets a browser write (only select policies)`);
          }
          for (const m of sql.matchAll(new RegExp(`grant\\s+([^;]*?)\\s+on\\s+(?:table\\s+)?[^;]*\\bpublic\\.${table}\\b[^;]*\\bto\\s+([^;]*);`, "gi"))) {
            if (!/anon|authenticated|public/i.test(m[2])) continue;
            const what = m[1].trim();
            const columns = /^select\s*\(([^)]*)\)$/i.exec(what);
            const ok = (BROWSER_READS[table] === "select" && /^select$/i.test(what)) || (BROWSER_READS[table] === "columns" && columns && !/\b(stripe_\w+|amount_cents|currency|livemode|receipt_url|job_title)\b/i.test(columns[1]));
            if (!ok) detail.push(`${rel}: grants ${what.slice(0, 80)} on ${table} to a browser role${table === "job_passes" ? " (its days only: never a Stripe id or the amount)" : ""}`);
          }
        }
      }
      // The guard checks every migration from v9 on by its timestamp (a
      // later regrant of subscriptions must not slip past it).
      if (!fromV9On("supabase/migrations/20261201123456_regrant_subscription_update.sql") || fromV9On("supabase/migrations/20261025760000_job_words_keep_their_keys.sql") || !fromV9On("supabase/migrations/20261031100000_billing_pricing_v9.sql"))
        detail.push("scripts/guards/billing-locks.mjs: fromV9On must read a migration's own timestamp");
      for (const { rel, sql } of migrations) {
        if (!fromV9On(rel)) continue;
        if (/grant\s+(?:insert|update(?!\s*\(onboarding_completed\))|delete|all)[^;]*on\s+(?:table\s+)?public\.subscriptions\b[^;]*to\s+[^;]*(anon|authenticated)/i.test(sql)) detail.push(`${rel}: a browser may write subscriptions (only onboarding_completed)`);
      }
      for (const fn of BILLING_SQL_FUNCTIONS) {
        const granted = await grantsToBrowser(ctx, fn);
        if (granted.length) detail.push(`${granted.join(", ")}: grants public.${fn} to a browser role`);
        const def = await latestDefinition(ctx, fn);
        if (def && !def.securityDefiner) detail.push(`${def.rel}: ${fn} must run as its owner (SECURITY DEFINER)`);
      }
      // Each is revoked from the browser roles in the migration that makes it (v9, or one after it).
      const fromV9 = migrations.filter((m) => fromV9On(m.rel)).map((m) => m.sql).join("\n");
      for (const fn of BILLING_SQL_FUNCTIONS) {
        if (fn === "jobs_publish_needs_pass" || fn === "billing_close_for") continue;
        if (!new RegExp(`revoke all on function public\\.${fn}\\(`, "i").test(fromV9) && !new RegExp(`'public\\.${fn}\\(`, "i").test(fromV9)) detail.push(`supabase/migrations: public.${fn} is not revoked from the browser roles`);
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "publish-needs-a-pass",
    why:
      "With billing on, a business's job goes live only with time paid for (its free job once, a $99 pass) or " +
      "Unlimited; platform_admins never pay. The check must run AFTER INSERT OR UPDATE for each row with no WHEN (a " +
      "status another trigger sets is seen, as the email check learnt), refuse with HINT payment_required, take the " +
      "free job once under a unique index, and the hourly run must close what nothing pays for.",
    run: async (ctx) => {
      const detail = [];
      detail.push(...(await triggerProblems(ctx, { name: "jobs_publish_needs_pass", table: "jobs", timing: "AFTER", event: "INSERT", fn: "jobs_publish_needs_pass" })));
      detail.push(...(await triggerProblems(ctx, { name: "jobs_publish_needs_pass", table: "jobs", timing: "AFTER", event: "UPDATE", fn: "jobs_publish_needs_pass" })));
      const def = await latestDefinition(ctx, "jobs_publish_needs_pass");
      const body = plain(def?.body);
      const steps = [
        /IF NOT public\.billing_on\(\) THEN RETURN NULL; END IF;/i,
        /IF public\.billing_exempt\(v_owner\) THEN RETURN NULL; END IF;/i,
        // The only other way past it: the service role (billing-webhook) or a platform admin. Not a write with no role at all.
        /IF auth\.role\(\) = 'service_role' OR public\.is_platform_admin\(\) THEN RETURN NULL; END IF;/i,
        /IF public\.billing_job_has_time\(new\.id\) THEN RETURN NULL; END IF;/i,
        /IF public\.billing_unlimited_active\(v_owner\) THEN INSERT INTO public\.job_passes/i,
        /INSERT INTO public\.job_passes \(job_id, owner_id, kind, starts_at, ends_at\) VALUES \(new\.id, v_owner, 'free', now\(\), now\(\) \+ interval '30 days'\) ON CONFLICT \(owner_id\) WHERE kind = 'free' DO NOTHING;/i,
        // …and once per email address: the fingerprint of the confirmed sign-in address.
        /v_fingerprint := public\.billing_email_fingerprint\(\(select u\.email from auth\.users u where u\.id = v_owner\)\); IF v_fingerprint IS NOT NULL THEN INSERT INTO public\.billing_free_job_emails \(email_hash\) VALUES \(v_fingerprint\) ON CONFLICT \(email_hash\) DO NOTHING; GET DIAGNOSTICS v_taken = row_count; IF v_taken > 0 THEN RETURN NULL; END IF; END IF; END IF;/i,
        /RAISE EXCEPTION 'Your free job is used\. Pay for this job, or go Unlimited, to put it live\.' USING errcode = 'check_violation', hint = 'payment_required';/i,
      ];
      // Nothing else lets a job through: one exemption line, and every RETURN NULL is one of the steps above.
      if ((body.match(/\bauth\.role\(\)/gi) ?? []).length !== 1 || (body.match(/\bis_platform_admin\(\)/gi) ?? []).length !== 1 || (body.match(/\bRETURN NULL\b/gi) ?? []).length !== 8)
        detail.push(`${def?.rel ?? "supabase/migrations"}: jobs_publish_needs_pass lets a job through some other way (one exemption line, service_role or a platform admin; nothing for a write with no role)`);
      let last = -1;
      for (const step of steps) {
        const at = body.search(step);
        if (at < 0 || at < last) detail.push(`${def?.rel ?? "supabase/migrations"}: jobs_publish_needs_pass lost or reordered: ${step.source.slice(0, 70)}`);
        last = Math.max(last, at);
      }
      if (!/v_owner uuid := new\.employer_id;/i.test(plain(def?.header + " " + body))) detail.push(`${def?.rel}: the business that pays is the job's employer_id`);
      const migrations = await migrationTexts(ctx);
      const all = migrations.map((m) => m.sql).join("\n");
      if (!/job_id uuid references public\.jobs \(id\) on delete set null/i.test(all)) detail.push("job_passes: a deleted job must keep its passes (job_id NULL), or deleting the free job frees it again");
      if (!/perform cron\.schedule\('billing-close-ended-jobs', '17 \* \* \* \*', 'select public\.billing_close_ended_jobs\(\)'\);/i.test(all)) detail.push("supabase/migrations: the hourly run (billing-close-ended-jobs) is not scheduled");
      // The hourly run never makes a pass, never closes on the database's clock alone, and waits for nobody's row lock.
      const close = await latestDefinition(ctx, "billing_close_for");
      const closeBody = plain(close?.body);
      if (/INSERT INTO public\.job_passes/i.test(closeBody)) detail.push(`${close?.rel}: the hourly run (billing_close_for) makes a pass (only billing_switch_on gives jobs their 30 days, once)`);
      for (const [need, why] of [
        [/AND EXISTS \(select 1 from public\.job_passes p where p\.job_id = j\.id\) AND NOT public\.billing_unlimited_active\(j\.employer_id\) AND NOT public\.billing_unlimited_end_unconfirmed\(j\.employer_id\) AND NOT public\.billing_job_has_time\(j\.id\)/i, "closes only a job with a pass, and nothing of an Unlimited whose end billing-sync has not read again"],
        [/FOR NO KEY UPDATE OF j SKIP LOCKED/i, "locks the jobs FOR NO KEY UPDATE SKIP LOCKED (FOR UPDATE waits on new applications)"],
        [/perform public\.billing_alert_admins\('billing:live-without-pass'/i, "tells the admins once a day about a live job with no pass"],
      ]) if (!need.test(closeBody)) detail.push(`${close?.rel}: the hourly run must be the one that ${why}`);
      const switchOn = await latestDefinition(ctx, "billing_switch_on");
      if (!switchOn || !/v_first := not exists \(select 1 from public\.billing_switch_ons\);[\s\S]*IF v_first THEN INSERT INTO public\.job_passes \(job_id, owner_id, kind, starts_at, ends_at\) select j\.id, j\.employer_id, 'launch'/i.test(plain(switchOn.body)))
        detail.push(`${switchOn?.rel ?? "supabase/migrations"}: billing_switch_on gives the jobs live their 30 days only the first time billing is switched on`);
      if (!/create unique index if not exists job_passes_one_launch_per_job on public\.job_passes \(job_id\) where kind = 'launch';/i.test(all)) detail.push("job_passes: one launch pass per job, ever (a unique index)");
      if (!/create unique index if not exists job_passes_one_free_job on public\.job_passes \(owner_id\) where kind = 'free';/i.test(all)) detail.push("job_passes: the free job is not held once per owner by a unique index");
      const active = plain((await latestDefinition(ctx, "billing_unlimited_active"))?.body);
      if (!/and s\.status in \('active', 'trialing', 'past_due'\) and \(s\.status <> 'past_due' or s\.past_due_since > now\(\) - interval '7 days'\) and s\.current_period_end is not null and s\.current_period_end > now\(\) - interval '1 day'/i.test(active))
        detail.push("billing_unlimited_active: Unlimited counts only while active, trialing, or past_due for up to 7 days, and within a day of its period end");
      // The other publish checks stay beside it.
      detail.push(...(await triggerProblems(ctx, { name: "jobs_publish_needs_email_check", table: "jobs", timing: "AFTER", event: "INSERT", fn: "jobs_publish_needs_email_check" })));
      // The old per-plan job limit no longer limits anything (v9 prices publishing, not drafts).
      const limit = await latestDefinition(ctx, "job_limit_for_user");
      if (!limit || plain(limit.body).trim() !== "select -1;") detail.push(`${limit?.rel}: job_limit_for_user must be -1 (retired; the publish check is jobs_publish_needs_pass)`);
      for (const fn of ["team_member_limit_for_user", "document_workflow_limit_for_user"]) {
        const d = await latestDefinition(ctx, fn);
        if (!d || plain(d.body).trim() !== "select -1;") detail.push(`${d?.rel}: ${fn} must be -1 (pricing v9 never limits teammates or documents)`);
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "billing-prices-by-lookup-key",
    why:
      "Test and live mode give the same product different price ids; a hard-coded id breaks the day billing goes " +
      "live (or charges a test price). Prices are found by lookup key (hireflow_job_30d_v1, " +
      "hireflow_unlimited_monthly_v1), never written as an id.",
    run: async ({ read, walk }) => {
      const detail = [];
      for (const rel of [...(await walk("supabase/functions", [".ts"])), ...(await walk("src", [".ts", ".tsx"])), ...(await walk("supabase/migrations", [".sql"]))]) {
        const text = (await read(rel)) ?? "";
        if (/\bprice_1[A-Za-z0-9]{8,}/.test(text)) detail.push(`${rel}: names a Stripe price id (find it by lookup key)`);
      }
      const stripe = (await read("supabase/functions/_shared/stripe.ts")) ?? "";
      if (!/export const JOB_PRICE_LOOKUP_KEY = "hireflow_job_30d_v1";/.test(stripe) || !/export const UNLIMITED_PRICE_LOOKUP_KEY = "hireflow_unlimited_monthly_v1";/.test(stripe))
        detail.push("_shared/stripe.ts: the two lookup keys are not the owner's (hireflow_job_30d_v1, hireflow_unlimited_monthly_v1)");
      if (!/"lookup_keys\[\]": lookupKey, active: "true"/.test(stripe)) detail.push("_shared/stripe.ts: prices must be listed by lookup key, active only");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "never-two-unlimited-and-money-given-back",
    why:
      "The billing review (2026-10-31): a business could end up paying $598 a month for two Unlimited subscriptions " +
      "(a slow webhook, a second Checkout page, a past_due one), a deleted account kept one charging, and money for a " +
      "deleted job or another business's job was kept with nothing given. billing-checkout takes cards only, one claim at " +
      "a time, expires the earlier page and asks Stripe's own list before an Unlimited; the webhook cancels and refunds a " +
      "second one and refunds what it owes, keyed by the event; delete-account cancels every subscription Stripe lists and " +
      "never takes \"no such subscription\" across test and live mode.",
    run: async (ctx) => {
      const { read } = ctx;
      const detail = [];
      const checkout = code(await read("supabase/functions/billing-checkout/index.ts"));
      const begin = checkout.indexOf('admin.rpc("billing_checkout_begin"');
      const expire = checkout.indexOf("`${path}/expire`");
      const list = checkout.indexOf("subscriptionsOfCustomer(config, customerId)");
      const make = checkout.indexOf('"/checkout/sessions",');
      if (begin < 0 || expire < 0 || list < 0 || make < 0 || !(begin < expire && expire < list && list < make))
        detail.push("billing-checkout: claim (billing_checkout_begin), expire the earlier page, ask Stripe for the customer's subscriptions, then make the page, in that order");
      if (!/payment_method_types: \["card"\],/.test(checkout)) detail.push("billing-checkout: Checkout must take cards only (payment_method_types card), for both kinds");
      // One key from the claim for each form name (Stripe keeps a refused request's key: the live idempotency_error of 2026-11-02).
      if (!/\{ idempotencyKey: name === "hosted" \? `hireflow-checkout-\$\{claimId\}` : `hireflow-checkout-\$\{claimId\}-\$\{name\}` \}/.test(checkout))
        detail.push("billing-checkout: the page must be made with an Idempotency-Key from the claim, its own for each embedded form name");
      if (!/const live = listed\.list\.filter\(\(sub\) => STILL_BILLING\.has\(String\(sub\.status \?\? ""\)\)\);/.test(checkout)) detail.push("billing-checkout: an Unlimited is refused while Stripe lists one that is on or still being charged");
      const stripe = code(await read("supabase/functions/_shared/stripe.ts"));
      if (!/export const STILL_BILLING = new Set\(\["active", "trialing", "past_due", "unpaid", "incomplete"\]\);/.test(stripe)) detail.push("_shared/stripe.ts: STILL_BILLING is every status Stripe may still charge (active, trialing, past_due, unpaid, incomplete)");
      if (!/if \(plan\.livemode !== mode\) \{\s*return \{ ok: false, cancelled, reason: "contact_us"/.test(stripe) || !/if \(billing\.length\) return \{ ok: false, cancelled, reason: "contact_us"/.test(stripe))
        detail.push("_shared/stripe.ts: cancelEverySubscription must refuse (contact_us) a subscription in the other mode, or one still billing with no keys, never take it as gone");
      const del = code(await read("supabase/functions/delete-account/index.ts"));
      const cancelAt = del.indexOf("await cancelEverySubscription(");
      const deleteUser = del.indexOf("supabaseAdmin.auth.admin.deleteUser(user.id)");
      if (cancelAt < 0 || deleteUser < 0 || cancelAt > deleteUser || !/supabaseAdmin\.from\('billing_customers'\)\.select\('stripe_customer_id, livemode'\)\.eq\('owner_id', user\.id\)/.test(del))
        detail.push("delete-account: every subscription Stripe lists for the business's customers is cancelled before the account is deleted");
      const handle = code(await read("supabase/functions/billing-webhook/handle.ts"));
      if (!/`hireflow-refund-\$\{owed\.eventId\}`/.test(handle) || !/`hireflow-refund-\$\{owed\.eventId\}-\$\{String\(invoice\.id \?\? "invoice"\)\}-\$\{i\}`/.test(handle))
        detail.push("billing-webhook/handle.ts: refunds are made with an Idempotency-Key from the event that owed them");
      if (!/const cancelled = await deps\.stripe\("DELETE", path\);/.test(handle)) detail.push("billing-webhook/handle.ts: a second Unlimited is cancelled at once");
      if (!/const still = await deps\.rpc\("billing_refund_owed", \{ p_event_id: event\.id \}\);/.test(handle) || !/return \{ status: 503, body: \{ error: "a refund owed is not done yet; Stripe will send it again" \} \};/.test(handle))
        detail.push("billing-webhook/handle.ts: a refund Stripe refused is a 503, and the refund still owed is made when Stripe sends the event again");
      const sub = plain((await latestDefinition(ctx, "billing_apply_subscription"))?.body);
      if (!/IF v_row\.status = any \(v_billing_states\) THEN PERFORM public\.billing_event_outcome\(p_event_id, 'second Unlimited: cancel and refund'\); RETURN jsonb_build_object\('ok', true, 'ignored', 'second_subscription', 'owner', v_owner\) \|\| public\.billing_refund_owe\(/i.test(sub))
        detail.push("billing_apply_subscription: a second Unlimited while the first still bills is owed back, the first stays tracked");
      const pay = plain((await latestDefinition(ctx, "billing_apply_job_payment"))?.body);
      for (const reason of ["owner_mismatch", "not_owner", "job_gone"]) {
        if (!new RegExp(`public\\.billing_refund_owe\\(p_event_id, 'job_payment', '${reason}'`, "i").test(pay)) detail.push(`billing_apply_job_payment: a payment with nothing given for it (${reason}) is owed back`);
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "billing-sync-checks-its-caller",
    why:
      "billing-sync is called by pg_cron through pg_net, which has no sign-in, so verify_jwt is off: it must answer only " +
      "the secret Vault keeps (billing_sync_secret_matches) before it reads anything, and run before the hourly close, " +
      "which closes nothing of an Unlimited whose end it has not read again (the billing review, finding 2).",
    run: async (ctx) => {
      const { read } = ctx;
      const detail = [];
      const fn = code(await read("supabase/functions/billing-sync/index.ts"));
      const secret = fn.search(/const \{ data: matches, error: secretError \} = await admin\.rpc\("billing_sync_secret_matches", \{ p_given: given \}\);\s*if \(secretError \|\| matches !== true\) return json\(\{ error: "unauthorized" \}, 401\);/);
      const work = fn.indexOf("await syncSubscriptions(");
      if (secret < 0 || work < 0 || secret > work || !/const given = req\.headers\.get\("x-billing-sync-secret"\) \?\? "";/.test(fn)) detail.push("supabase/functions/billing-sync/index.ts: it must check the Vault secret (billing_sync_secret_matches) before it reads anything");
      const config = (await read("supabase/config.toml")) ?? "";
      if (!/\[functions\.billing-sync\][^[]*verify_jwt\s*=\s*false/.test(config)) detail.push("supabase/config.toml: billing-sync is called by pg_cron (no sign-in): verify_jwt = false, the secret is its check");
      const all = (await migrationTexts(ctx)).map((m) => m.sql).join("\n");
      if (!/perform cron\.schedule\('billing-sync', '7 \* \* \* \*', \$job\$\s*select net\.http_post\(\s*url := 'https:\/\/yqklrkpptnhubsnijqze\.supabase\.co\/functions\/v1\/billing-sync',[\s\S]*?'x-billing-sync-secret', coalesce\(\s*\(select decrypted_secret from vault\.decrypted_secrets where name = 'billing_sync_secret' limit 1\)/i.test(all))
        detail.push("supabase/migrations: billing-sync must be scheduled at minute 7 (before the close at 17) with the Vault secret");
      const matches = plain((await latestDefinition(ctx, "billing_sync_secret_matches"))?.body);
      if (!/length\(p_given\) >= 32 and p_given = \(select s\.decrypted_secret from vault\.decrypted_secrets s where s\.name = 'billing_sync_secret' limit 1\)/i.test(matches)) detail.push("billing_sync_secret_matches: only the Vault secret (32 characters or more) matches");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "payment-history-is-the-owners",
    why:
      "After the owner's own $1 test payment (2026-11-01) a business sees what it paid: a confirmation, a plan " +
      "button, Settings -> Billing with its payment history and receipts. Those are the business owner's only: " +
      "a teammate never sees an amount, nothing shows while billing is off or to the exempt account, a receipt " +
      "is only ever Stripe's own https page, and paying inside HireFlow (Stripe's embedded form) keeps every " +
      "rule Checkout had: cards only, one claim at a time, the Idempotency-Key, the way back on HireFlow's own host.",
    run: async (ctx) => {
      const { read } = ctx;
      const detail = [];
      // The database: nothing while off, nothing for the exempt account.
      const history = plain((await latestDefinition(ctx, "billing_history"))?.body);
      const off = history.search(/IF NOT public\.billing_on\(\) THEN RETURN '\[\]'::jsonb; END IF;/i);
      const exempt = history.search(/IF p_owner IS NULL OR public\.billing_exempt\(p_owner\) THEN RETURN '\[\]'::jsonb; END IF;/i);
      const reads = history.search(/job_passes|billing_invoices/i);
      if (off < 0 || exempt < 0 || reads < 0 || !(off < exempt && exempt < reads)) detail.push("billing_history: it must answer [] while billing is off and for the exempt account, before it reads a payment");
      if (!/where p\.owner_id = p_owner and p\.kind = 'paid'/i.test(history) || !/where i\.owner_id = p_owner/i.test(history)) detail.push("billing_history: only the owner's own payments");
      const url = plain((await latestDefinition(ctx, "billing_receipt_url"))?.body);
      if (!/p_url ~ '\^https:\/\/\(\[a-z0-9-\]\+\\\.\)\*stripe\\\.com\//.test(url)) detail.push("billing_receipt_url: a receipt is kept only when it is https on stripe.com");
      const all = (await migrationTexts(ctx)).map((m) => m.sql).join("\n");
      if (!/add constraint job_passes_receipt_on_stripe\s+check \(receipt_url is null or \(length\(receipt_url\) <= 2000 and receipt_url ~ '\^https:\/\/\(\[a-z0-9-\]\+\\\.\)\*stripe\\\.com\//i.test(all)) detail.push("job_passes: receipt_url must be held to Stripe's https pages by a CHECK");
      const save = plain((await latestDefinition(ctx, "billing_save_invoice"))?.body);
      if (!/v_owner := public\.billing_owner_of_customer\(p_customer\);/i.test(save) || !/s\.user_id = v_owner and s\.plan_type = 'unlimited' and s\.stripe_subscription_id = p_subscription/i.test(save))
        detail.push("billing_save_invoice: an invoice is kept only for the Unlimited HireFlow tracks for the business whose Stripe customer paid");
      // get-subscription: the history for the owner only.
      const gs = code(await read("supabase/functions/get-subscription/index.ts"));
      const gate = gs.indexOf("if (!isTeamMemberRole && ownerId === user.id && state.billingEnabled === true && state.exempt !== true) {");
      const ask = gs.indexOf('admin.rpc("billing_history", { p_owner: ownerId })');
      if (gate < 0 || ask < 0 || ask < gate || (gs.match(/billing_history/g) ?? []).length !== 1) detail.push("supabase/functions/get-subscription/index.ts: the payment history goes to the business owner only, while billing is on, never the exempt account");
      // The receipt address: Stripe's own pages only, on the server and the page.
      const stripe = code(await read("supabase/functions/_shared/stripe.ts"));
      const words = code(await read("src/lib/billing.ts"));
      const rule = "/^https:\\/\\/([a-z0-9-]+\\.)*stripe\\.com\\/[^\\s\"'<>]*$/";
      if (!stripe.includes(rule) || !words.includes(rule)) detail.push("stripeReceiptUrl (_shared/stripe.ts and src/lib/billing.ts): a receipt is only ever an https page on stripe.com");
      // The pages: the Billing tab and the plan button for the owner, through billingTabShown / planSummary.
      const settings = code(await read("src/pages/Settings.tsx"));
      if (!/const billingTab = isEmployer && !isTeamMember && billingTabShown\(billing\);/.test(settings) || !/\{billingTab \? \(\s*<BillingTab \/>/.test(settings) || !/SETTINGS_TABS\.filter\(\(t\) => t\.key !== "billing" \|\| billingTab\)/.test(settings))
        detail.push("src/pages/Settings.tsx: the Billing tab is the owner's, only while billingTabShown (billing on, not exempt)");
      const plan = code(await read("src/components/billing/PlanButton.tsx"));
      if (!/const owner = role === "employer" && !isTeamMember;/.test(plan) || !/if \(!owner\) return null;/.test(plan) || !/return planSummary\(billing, live\);/.test(plan) || !/if \(!plan\) return null;/.test(plan))
        detail.push("src/components/billing/PlanButton.tsx: the plan button is the owner's, and only what planSummary answers (nothing while off or for the exempt account)");
      // Paying inside HireFlow keeps Checkout's rules (the order and the claim are held by never-two-unlimited-and-money-given-back).
      const checkout = code(await read("supabase/functions/billing-checkout/index.ts"));
      if (!/const embedded = body\.ui === "embedded" && publishableKey !== null;/.test(checkout) || !/\{ ui_mode: "embedded_page", return_url: paid, redirect_on_completion: "if_required" \}/.test(checkout) || !/const paid = `\$\{back\}\?billing=\$\{kind === "job" \? "paid" : "unlimited"\}`;/.test(checkout))
        detail.push("billing-checkout: the embedded form comes back (if a payment needs a redirect) only to HireFlow's own job or Settings page");
      if (!/invoice_creation: \{ enabled: true, invoice_data: \{ description, metadata \} \}/.test(checkout)) detail.push("billing-checkout: each $99 payment makes an invoice (invoice_creation) saying what it paid for");
      if ((checkout.match(/"\/checkout\/sessions",/g) ?? []).length !== 1) detail.push("billing-checkout: one place makes the Checkout page (cards only, the claim's Idempotency-Key), embedded or hosted");
      // Stripe.js gets only a publishable key: the function secret STRIPE_PUBLISHABLE_KEY, of the secret key's own mode,
      // handed back with the form and checked again by the page (2026-11-01: one place for Stripe's keys, not Vercel).
      const api = code(await read("src/lib/billingApi.ts"));
      const stripeShared = code(await read("supabase/functions/_shared/stripe.ts"));
      if (
        !/const publishableKey = stripePublishableKey\(\(key\) => Deno\.env\.get\(key\), config\.livemode\);/.test(checkout) ||
        !/const key = \(env\("STRIPE_PUBLISHABLE_KEY"\) \?\? ""\)\.trim\(\);\s*if \(!\/\^pk_\(\?:live\|test\)_\[A-Za-z0-9\]\+\$\/\.test\(key\)\) return null;\s*return key\.startsWith\("pk_live_"\) === livemode \? key : null;/.test(stripeShared) ||
        !/\/\^pk_\(\?:test\|live\)_\[A-Za-z0-9\]\+\$\/\.test\(b\.publishableKey\)/.test(words) ||
        !/if \(outcome\.kind === "embedded"\) givenKey = outcome\.publishableKey;/.test(api) ||
        /import\.meta\.env\.VITE_STRIPE/.test(api)
      )
        detail.push("src/lib/billingApi.ts: only a publishable key (pk_live_ / pk_test_), billing-checkout's STRIPE_PUBLISHABLE_KEY of the secret key's mode, is read for Stripe.js, never a secret");
      // Stripe.js is allowed by the Content-Security-Policy.
      const csp = (await read("scripts/csp.mjs")) ?? "";
      for (const host of ["https://js.stripe.com", "https://hooks.stripe.com", "https://checkout.stripe.com", "https://api.stripe.com"]) if (!csp.includes(`"${host}"`)) detail.push(`scripts/csp.mjs: ${host} is not in the policy (Stripe's embedded form)`);
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
];
