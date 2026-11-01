# Billing (pricing v9)

Built 2026-10-31, behind an off switch. **Billing is off**: nothing below
changes anything for anyone until the owner turns it on (the last step of
"Going live"). CLAUDE.md: "Nothing may sit behind a paywall or show a price as
due while billing is off."

An independent review of the build the same day found one HIGH problem (two
Unlimited subscriptions for one business), several MEDIUM and LOW ones, and
weakenings no test caught. All are fixed in this build; the fixes are
described where they apply below.

## The model (the owner's decisions)

| | |
|---|---|
| A business's **first published job** | free, live for **30 days**, unlimited applicants. Once per business and once per email address |
| Every job after that | **$99**: that one job live for **30 days**, unlimited applicants |
| **Unlimited** | **$299 a month**: every job live, unlimited applicants, while the subscription is active; cancel any time. Never two at once |
| The owner's own account | exempt, forever: never asked, never gated, everything on |

- **Who pays** is the business owner (`jobs.employer_id`). A teammate who may
  create jobs acts for their business: the owner's free job, passes and
  Unlimited cover the teammate's jobs, and a teammate may pay $99 for a job
  they may publish (one they are assigned to). Only the owner starts
  Unlimited (a teammate is told "Ask the account owner"), and only the owner
  sees Settings → Billing and the billing portal, where it is cancelled.
- **The only exemption** is a row in `public.platform_admins`
  (`billing_exempt`). Never `business_pages.home_alias`, never the old
  `subscription_bypass` app metadata (`private.has_subscription_bypass_for_user`).
  Guard `billing-exemption-is-platform-admins-only`.
- **One free job per email address.** When a business takes its free job,
  a one-way fingerprint of its sign-in address is kept
  (`billing_free_job_emails`: sha256 of the address in lower case, without a
  "+tag", and for Gmail without dots and with googlemail.com read as
  gmail.com). The free job needs a confirmed address anyway (the 6-digit
  email check), so the fingerprint is of the confirmed one. It is kept when
  the account is deleted, so deleting the account and signing up again, or a
  "+tag", is no new free job. The Privacy Policy says so.
- **Drafts, documents and teammates are never limited**: v9 prices a job going
  live, nothing else. The old per-plan limits (`job_limit_for_user`,
  `document_workflow_limit_for_user`, `team_member_limit_for_user`) are -1 for
  everyone, and the $49-unlock model's sealing
  (`get_employer_sealed_application_ids`) seals nothing.
- **Applicants never see any of it**, with billing on or off
  (`get-subscription` answers them `billing: null`).

## The switch

`public.app_settings`, key `billing_enabled` (since 20260916170000; `false`).
Only `true` (or the text `"true"`) is on; a missing row, any other text, a
number or `null` is off (`public.billing_on()`).

The owner turns it on with **`select public.billing_switch_on();`** (service
role only; no migration calls it). The first time ever, each job live at that
moment that has never had a pass gets 30 days from then (a `launch` pass,
once per job, ever), so nothing closes unannounced. Each switch-on is
recorded (`billing_switch_ons`). A later switch-on gives nothing: a job put
live while billing was off since then stays live with no pass, and the admins
are told once a day ("Live jobs with no pass"). Close those jobs, or leave
them, as you see fit.

While it is off:

- the publish check (`jobs_publish_needs_pass`) returns before it reads a row;
- the hourly run (`billing_close_ended_jobs`) returns 0;
- `billing_state` (what `get-subscription` reports) says only
  `billingEnabled: false`: no plan, no free job, no passes;
- `billing-checkout` refuses (`billing_off`), and billing-sync has nothing to
  read (`billing_sync_due` answers `[]`);
- the app shows no price, no plan, no days left, no "upgrade": every screen
  asks `billingShown()` first (`src/lib/billing.ts`, where the prices are
  written and nowhere else), the note after Checkout says nothing (a made-up
  `?billing=paid` link included), and the payment dialog opens only on the
  database's refusal, which never comes while billing is off.

Guard `billing-off-changes-nothing`; launch_locks_behaviour section 33 (a),
(k) and (l); `scripts/billing_screens.test.mjs`.

Turning it off again later stops the gate and the hourly run at once. Passes
and Unlimited stay recorded. **It does not cancel anyone's Unlimited
subscription in Stripe**: do that in Stripe if you mean to stop charging.

## What a job goes through (billing on)

`jobs_publish_needs_pass` runs **AFTER INSERT OR UPDATE** on `jobs`, for each
row, with no WHEN (a status set by another trigger is seen). It sorts after
`jobs_publish_needs_email_check`, so a business that has not confirmed its
email is asked for that first and spends nothing; `jobs_publish_needs_good_standing`
(BEFORE) refuses a paused business before either. Only a job **going live**
is checked (an insert as `published`, or any other status to `published`;
re-opening a closed job is going live). In order:

1. billing off → nothing;
2. the owner is a platform admin → nothing (no pass recorded);
3. the system (service role: billing-webhook after recording the pass) or a
   platform admin reopening a paused business's jobs → not refused. Nothing
   else is: a write with no role at all (a session that sends no sign-in) is
   checked like any other. A job put live this way with no pass is left live,
   and the admins are told once a day;
4. the job has time left on a free, paid or launch pass → live;
5. the owner has an active Unlimited → live, and an `unlimited` marker is
   recorded on the job (so it closes when Unlimited ends);
6. neither the owner nor its email address has used the free job → the
   **free pass** is recorded (30 days, one per owner: unique index
   `job_passes_one_free_job`) and the address's fingerprint
   (`billing_free_job_emails`) → live;
7. otherwise refused: *"Your free job is used. Pay for this job, or go
   Unlimited, to put it live."*, HINT `payment_required`.

A pass outlives its job (`job_id` goes NULL), so deleting the free job never
frees the free job again.

**The hourly run** (`pg_cron`, `billing-close-ended-jobs`, minute 17). It
never makes a pass:

- passes whose 30 days are over are marked `ended`;
- every published job that has a pass and that nothing covers any more (not
  exempt, no active Unlimited, no time left) is **closed**, and the owner gets
  a card: "Your job's 30 days have ended" (one per job), "Your Unlimited plan
  has ended" (one per owner), or, when Unlimited stopped counting because its
  payment failed for 7 days, "Your Unlimited payment didn't go through".
  Applicants stay; "Post it again" brings the job back once it is paid for;
- a business whose Unlimited ran out only by the database's clock (Stripe
  last said it was billing, and nobody has read it from Stripe since its
  period ended) is left alone until billing-sync has read it again
  (`billing_unlimited_end_unconfirmed`). A webhook missed across a renewal
  never closes the jobs of a business Stripe has just charged;
- a live job with no pass at all is left as it is; the admins are told once
  a day;
- it locks each job `FOR NO KEY UPDATE SKIP LOCKED`, so new applications
  never hold it up.

Unlimited is **active** while Stripe says `active` or `trialing`, or
`past_due` for at most **7 days** from when it went past_due
(`past_due_since`, set by the webhook, cleared once paid), and its period end
is less than a day ago (a day's grace for a late renewal webhook). `unpaid`
and `incomplete` never count. The old `trial` / `trialing` rows never count.

## Tables (migration `20261031100000_billing_pricing_v9.sql`)

| Table | What | Who |
|---|---|---|
| `billing_customers` | the owner's Stripe customer, one per mode (`livemode`) | the owner reads their own; the service role writes |
| `job_passes` | each job's time: `free`, `paid`, `launch`, or the `unlimited` marker; `status` active / ended / refunded; Stripe session and payment ids; amount. `owner_id` goes NULL when the account is deleted: a payment's record outlives the account, its owner's data does not | the owner and their teammates on the job read the days (never a Stripe id or the amount: column grants); the service role writes |
| `billing_events` | every Stripe event handled, by its id (idempotency), with its outcome | the service role only |
| `billing_free_job_emails` | the one-way fingerprint of each address that took the free job; no account in it | the service role only |
| `billing_refunds` | money HireFlow owes back (a payment for a deleted job, another business's job, or a customer that is not the business named; a second Unlimited; an Unlimited paid after its account was deleted) and what Stripe said: owed, done, failed | the service role only |
| `billing_refunded_payments` | payments refunded in full, so their own late event gives nothing | the service role only |
| `billing_checkouts` | the Checkout pages billing-checkout opened: one open for Unlimited per business, one for $99 per job | the service role only |
| `billing_switch_ons` | each `billing_switch_on()`: when, whether first, how many jobs got 30 days | the service role only |
| `billing_deleted_customers` | the Stripe customer ids of deleted accounts (Stripe's id only), so an Unlimited billed to one afterwards is owed back | the service role only |
| `subscriptions` (reused) | Unlimited: `plan_type 'unlimited'`, Stripe's status, period, `cancel_at_period_end`, ids, `livemode`, `past_due_since`, `stripe_checked_at` (when it was last read from Stripe) | the owner reads their own; a browser may still write only `onboarding_completed` |
| `billing_invoices` (since `20261101100000`) | each paid Unlimited invoice: amount, when paid, the month it paid for, Stripe's receipt (`receipt_url`), its payment intent; only for the Unlimited HireFlow tracks for the business whose customer paid | the service role only (the owner sees them through `billing_history`) |

Since `20261101100000_billing_receipts.sql` a `paid` pass also keeps its
receipt: `receipt_url` (the Stripe-hosted invoice, or the charge's receipt),
`stripe_invoice_id`, and `job_title` (the job's title when it was paid for;
the pass outlives its job). A browser still reads only a pass's days: those
columns are not granted. Only Stripe's own https pages are kept
(`billing_receipt_url`; a CHECK on both tables).

The server's functions (service role only): `billing_state(owner, viewer)`,
`billing_checkout_check`, `billing_checkout_begin` / `_opened` / `_closed`,
`billing_portal_check`, `billing_save_customer`, `billing_apply_job_payment`,
`billing_apply_subscription`, `billing_apply_payment_failed`,
`billing_apply_refund`, `billing_record_event`, `billing_record_unpaid_checkout`,
`billing_refund_owed`, `billing_refund_result`, `billing_sync_due`,
`billing_sync_subscription`, `billing_sync_missing`, `billing_alert_admins`,
`billing_switch_on`, and since 2026-11-01 `billing_save_receipt`,
`billing_save_invoice` and `billing_history` (the owner's payment history:
nothing while billing is off or for the exempt account). Each `billing_apply_*` (and `billing_record_*`) records
the event id first (`billing_event_new`), in the same transaction as its
effect: a repeat answers `duplicate`, and a failure records nothing, so
Stripe's retry does it. Guards `billing-tables-server-written`,
`billing-webhook-verifies-and-is-idempotent`, `publish-needs-a-pass`,
`never-two-unlimited-and-money-given-back`, `billing-sync-checks-its-caller`.

## The edge functions

The four billing functions answer **503 "billing is not set up"** while
`STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` is missing, and nothing else
changes. They talk to Stripe's REST API with `fetch` (form-encoded;
`_shared/stripe.ts`), no Stripe library.

- **`billing-checkout`** (`verify_jwt = true`; signed in). `POST { kind: "job" | "unlimited", jobId?, ui? }`
  → `{ url }`, or with `ui: "embedded"` → `{ clientSecret }` (paying inside
  HireFlow, since 2026-11-01: the session is Stripe's embedded form,
  `ui_mode: "embedded_page"`, or `"embedded"` on an account whose API version
  predates 2026-03-25, tried when Stripe refuses the first name; no redirect
  for a card, `return_url` only for a payment that needs one; the page mounts
  it with Stripe.js). Each $99 payment makes an invoice
  (`invoice_creation`, its description naming the job: "HireFlow: “Chat
  agent” live for 30 days, unlimited applicants"), so it is in Stripe's
  billing page and the business's email; **Stripe charges a small fee for
  each such invoice** (Stripe Invoicing's per-invoice rate; see Stripe's
  Invoicing pricing). Unlimited's subscription carries a description too. The caller's business comes from their sign-in; the database
  decides whether the checkout makes sense (billing on, a hiring account, not
  exempt, the business's own job with no days left on it, live or closed, the
  free job already used, no Unlimited on or still being charged, Unlimited
  only for the owner, email confirmed, not paused). The price is found **by
  lookup key** (`hireflow_job_30d_v1`, `hireflow_unlimited_monthly_v1`),
  never by id. The owner's customer is made once per mode (Idempotency-Key)
  and kept. **Cards only** (`payment_method_types: card`, for both kinds: a
  payment that settles days later would be taken with nothing given).
  **One at a time**: the database hands out one claim for Unlimited per
  business and one for $99 per job (`billing_checkout_begin`; a second
  request at the same moment is told a checkout is already opening); the
  earlier open page is expired in Stripe first (one already paid for a job:
  "goes live in a moment", no second page); for Unlimited, Stripe's own list
  of the customer's subscriptions is asked, and one that is active or
  trialing ("You already have Unlimited"), or past_due, unpaid or incomplete
  ("Your Unlimited payment is being retried. Update your card in Settings,
  under Billing."), refuses it. The page is made with an Idempotency-Key from
  the claim. The session's metadata names the owner, kind and job (also on
  the payment intent or the subscription). It comes back to the job
  (`/jobs/<id>?billing=paid|unlimited|cancelled`) or Settings on HireFlow's
  own host (`https://hireflownow.com`, `https://staff.hireflownow.com`, or
  one in `BILLING_RETURN_ORIGINS`), never an address from the request.
- **`billing-webhook`** (`verify_jwt = false`; Stripe has no sign-in; listed
  in docs/BACKEND-SCHEMA.md, "Reachable without sign-in"). Reads the raw body
  and checks `Stripe-Signature` (HMAC-SHA256 of `<t>.<body>` with the
  endpoint's secret, every `v1` compared in constant time, 300 seconds either
  way) before anything else: 400 and nothing touched otherwise. Then:
  - `checkout.session.completed`, not paid (`payment_status` other than
    `paid`): recorded, nothing given, the admins told;
  - a job: the payment is read again from Stripe (its charges); one refunded
    already gives nothing. Then the paid pass (30 days from now, or from the
    end of time still left) and the job live (as the system, only if the
    business could publish it itself);
  - Unlimited → the subscription (read again from Stripe) and the job named
    at checkout live;
  - `customer.subscription.created` / `updated` / `deleted` → Unlimited's
    state, always read again from Stripe (events out of order never leave an
    old state; a late event about another subscription that no longer bills
    is ignored); when it ends, its jobs close and the owner is told. Stripe
    having no such subscription is recorded and answered 200 (it will not
    change; a 503 would have Stripe retry it for three days);
  - `invoice.payment_failed` → a card for the owner ("Your payment didn't go
    through ... Settings, under Billing"), at most once a day for a
    subscription (Stripe retries a payment several times);
  - `charge.refunded` (in full) → that pass ends, and its job closes unless
    something else covers it; the payment is remembered as refunded;
  - `invoice.paid` (since 2026-11-01; **add it to the endpoint's events**) →
    an Unlimited renewal, read again from Stripe, kept for the owner's payment
    history (`billing_save_invoice`); a $99 job's invoice (no subscription) is
    recorded and left;
  - anything else → recorded, ignored.

  Receipts (2026-11-01): after a $99 payment's pass, its receipt (the invoice
  Checkout made, read again from Stripe, or else the charge's own receipt) is
  kept with the pass (`billing_save_receipt`); after Unlimited is applied,
  its latest invoice once paid (`billing_save_invoice`). Both come after the
  event's own effect and are best effort: never for a payment owed back or a
  second Unlimited, and Stripe's billing page and email have every receipt
  either way.

  A payment counts only for the business whose Stripe customer paid (the
  metadata has to agree with the server's own record). **Money is never kept
  with nothing given**: a payment for a job deleted before the event came,
  for another business's job, or from a customer that is not the business
  named is refunded at once; a **second Unlimited** (one arriving while the
  first still bills) is cancelled at once and its payment refunded, and the
  first stays. So is an Unlimited paid after its account was deleted (a
  Checkout page left open, paid after: the account's Stripe customer is
  remembered in `billing_deleted_customers`); one for a customer HireFlow
  never made is left alone and the admins are told. Each refund has an Idempotency-Key from the event that owed
  it. The admins are told, and the business when there is one. If Stripe
  refuses, the failure is recorded, the admins are told (once a day), the
  answer is 503, and the refund is tried again when Stripe sends the event
  again (`billing_refund_owed`).
- **`billing-sync`** (`verify_jwt = false`: pg_cron through pg_net has no
  sign-in; listed in docs/BACKEND-SCHEMA.md). Every hour at minute 7, ten
  minutes before the close, the `billing-sync` job calls it with a secret the
  database made and keeps in Vault (`billing_sync_secret`,
  `billing_sync_secret_matches`), as document-cleanup does; without it, 401.
  It reads again from Stripe each Unlimited whose period has ended or ends
  within a day, or that has been past_due for 6 days (`billing_sync_due`,
  200 a run, in the key's mode), applies it (`billing_sync_subscription`,
  which records when it read it and closes what nothing covers any more),
  tells the admins about one Stripe has no record of (its jobs stay live) or
  could not read (once a day). `POST { "all": true }` reads every one Stripe
  still bills (after a webhook outage).
- **`billing-portal`** (`verify_jwt = true`; the owner only). Stripe's billing
  page: change the card, see and download invoices and receipts, cancel
  Unlimited. Back to Settings.
- **`get-subscription`** reports `{ teamAccess, billing }` (`billing_state`):
  a teammate sees the days of the jobs they are on only. For the business
  owner (never a teammate, never the exempt account, only while billing is
  on) `billing.payments` is the payment history (`billing_history`: every $99
  payment and Unlimited invoice, newest first, 50, with the amount actually
  charged, what it paid for, its receipt and whether it was refunded); null
  when it could not be read. The old trial row,
  usage, limits and the unused 120-minute voice grant are gone (voice stays
  platform-admin only, in `ava-voice-session`).
- **`delete-account`** cancels, before deleting anything, every subscription
  a business still pays for: the Unlimited HireFlow tracks, and every one
  Stripe lists for its customers in the key's mode that is not already over,
  after expiring their open Checkout pages (none can be paid once the
  account is gone; one paid in the moment between is owed back by the
  webhook). "No such subscription" counts as gone only in the key's own mode. If Stripe
  is down, nothing is deleted and the dialog says to try again. If the keys
  are missing while an Unlimited still bills, or the Unlimited is in the
  other mode, nothing is deleted, the admins are told, and the dialog says to
  message us from Help. The business's payment records stay (no name), and so
  does its email's fingerprint; the confirm says so.

Tests: `scripts/billing_webhook.test.mjs` (signature, each event, the
refunds owed, a fake Stripe and database, the bundled function),
`scripts/billing_checkout.test.mjs` (checkout, one at a time, and the portal),
`scripts/billing_sync.test.mjs`, `scripts/delete_account.test.mjs` (the
cancel). Each fake database holds every call's argument names to the SQL
function's own (`scripts/billing_sql_signatures.mjs`), so a renamed argument
fails there as PostgREST would fail it. The SQL is proved in
launch_locks_behaviour section 33.

## The screens (hiring side only)

- **Publishing with the free job used** (the job builder, or the editor's
  Publish): the job is saved as it stands (not live, keeping the status the
  database has for it now: a job the hourly run closed while its editor was
  open stays closed), then *"Your free job is used. Publish "…" for $99 (30
  days, unlimited applicants) or go Unlimited for $299 a month."*
  (`PublishPaymentDialog`).
- **Paying inside HireFlow** (since 2026-11-01; the owner: "it would be nicer
  if you could do a self-hosted checkout inside of our app where we don't
  have to go out"): the choice opens Stripe's own payment form in the same
  dialog (`StripeCheckoutForm`: Embedded Checkout, Stripe.js loaded from
  js.stripe.com only when the form opens; the card goes to Stripe, never to
  HireFlow), then the confirmation in place. It needs the site's publishable
  key, **`VITE_STRIPE_PUBLISHABLE_KEY`** (Vercel, Production; `pk_live_…`,
  public by design). Without it the dialog goes to Stripe's hosted page and
  back to the job page, as before. Settings' Go Unlimited does the same
  (`CheckoutDialog`). The Content-Security-Policy allows Stripe.js
  (`scripts/csp.mjs`: js.stripe.com, *.js.stripe.com, hooks.stripe.com,
  checkout.stripe.com, api.stripe.com).
- **The confirmation** (`PaymentConfirmation`; the owner: "there was no
  payment confirmation ... this is what you get for the month"): Paid (the
  amount actually charged, from HireFlow's own record: the $1 test shows
  $1.00) and when; For ("“Chat agent”, live for 30 days" / "Unlimited, billed
  monthly"); What you get ("“Chat agent” is live until December 1, 2026.
  Unlimited applicants." / "Unlimited is on. Every job stays live while it
  lasts. Renews …"); the receipt (emailed, and Stripe's page when it is in);
  Share your job, See billing. Until the webhook has recorded the payment it
  says so calmly and asks again (every 2 seconds for half a minute, then every
  10 seconds for five minutes). Back from the hosted page (`?billing=paid |
  unlimited`) it is a dialog, once (closing takes `?billing=` off); after
  paying in the job builder, Share your job opens the job's share kit
  (`/jobs/<id>?share=1`).
- **The plan button** (`PlanButton`; the owner pointed at an account dropdown
  with a credits meter that drains: HireFlow prices a job for 30 days, so the
  meter is each live job's days left): in the sidebar above the account (the
  rail shows the ring alone), on a phone at the top of More. The plan (Pay per
  job / Unlimited), what it costs (brass: money), each live job with a ring of
  its days left out of 30 ("23 days left"; copper for the last three),
  Unlimited's renewal, and Billing and Payment history. The owner only, while
  billing is on, never the exempt account (`planSummary` answers null).
- **Jobs list and job page**: "12 days left" (or "Free job, 12 days left",
  "Last day") on a live job with a free, paid or launch pass; "Its 30 days
  ended" on a closed one, whose "Post it again" opens the payment dialog
  directly. Nothing under Unlimited or for the exempt account.
- **Settings** is in tabs since 2026-11-01 (the owner: "general, billing,
  maybe account, notifications"): General (Day or Night, the careers page, the
  tips), **Billing**, Account (the sign-in, two-step sign-in, Delete Account),
  Notifications. `/settings?tab=billing` (or `#billing`) opens Billing; Stripe's
  way back (`?billing=…`) does too. **Settings → Billing** (the owner only,
  while billing is on, never the exempt account: `billingTabShown`): Your plan
  (pay per job and whether the free job is used, or Unlimited and when it
  renews or ends; a failed payment's warning; Go Unlimited; Manage card or
  cancel, Stripe's billing page), Live jobs (each with its ring), and
  **Payment history** (`#payment-history`; the date, what it paid for, the
  amount charged, Stripe's receipt, "Refunded").

Words: `src/lib/billing.ts` (and `src/lib/settingsTabs.ts`). Dev preview:
`__previewBilling=` (off, free, paygo, unlimited, ending, pastdue, canceled,
exempt; plus `paid:<job id>`, `slow`, `embedded` (paying inside HireFlow, with
a stand-in for Stripe's form: Stripe.js cannot load offline) and `onedollar`;
docs/DEV-PREVIEW.md, "Billing").

## Going live (the owner, in this order)

**Billing is on since 2026-11-01.** Steps 3 to 7 were done that day: the two live prices and the webhook were made through the Stripe API (the owner approved), the three old webhooks disabled, the portal given the Terms and Privacy links, the owner set the two secrets, the Terms and Privacy Policy cover paying, and `billing_switch_on()` ran (first: true, 0 jobs grandfathered). Still the owner's: Stripe's failed-payment setting (cancel the subscription when all retries fail) and the public business website. Steps 1 and 2 were done on 2026-10-31 (the owner: "Yes, put it in"): the
migration is live as `20261031100000 billing_pricing_v9` with every check below
as expected, the six functions are deployed, and billing is off.

1. **Apply the migration** `supabase/migrations/20261031100000_billing_pricing_v9.sql`
   (Management API, alone; record its live version in docs/MIGRATION-HISTORY.md).
   Billing stays off: nothing changes for anyone. Then check:
   `select public.billing_on();` → `false`;
   `select jobname, schedule from cron.job where jobname in ('billing-close-ended-jobs', 'billing-sync');`
   → two rows, `17 * * * *` and `7 * * * *`; and
   `select count(*) from vault.secrets where name = 'billing_sync_secret';` → 1.
2. **Deploy the functions**, one at a time: `get-subscription`,
   `delete-account`, `billing-checkout`, `billing-portal`, `billing-webhook`,
   `billing-sync` (`npx supabase functions deploy <name>`), then push the app
   (Vercel). Without the secrets the four billing functions answer 503;
   nothing else changes.
3. **In Stripe (live mode)**, on the product "Hire Flow":
   - create the two prices with the **same lookup keys** as test mode:
     `hireflow_job_30d_v1` ($99, one time) and `hireflow_unlimited_monthly_v1`
     ($299, monthly);
   - **cards only**: Checkout is asked for cards, and leave the delayed
     methods (bank debits, vouchers) off under Settings → Payment methods, so
     nothing settles days later;
   - **if all retries fail, cancel the subscription**: Settings → Billing →
     Subscriptions and emails → Manage failed payments. (HireFlow stops
     counting a past_due Unlimited after 7 days either way, but Stripe should
     not keep it "unpaid" and billing.)
   - the **Customer portal** (Settings → Billing → Customer portal): allow
     updating the payment method, viewing invoices, and cancelling the
     subscription **at the end of the billing period**; turn **off** switching
     plans and changing quantities (Unlimited is one plan; a switch would
     make a second price HireFlow does not know).
4. **Add the webhook endpoint** (Developers → Webhooks → Add endpoint):
   `https://yqklrkpptnhubsnijqze.supabase.co/functions/v1/billing-webhook`,
   for exactly these events: `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`,
   `charge.refunded`. Copy its signing secret (`whsec_…`).
5. **Set the two secrets** (the owner, never a session):
   `npx supabase secrets set STRIPE_SECRET_KEY=sk_live_… STRIPE_WEBHOOK_SECRET=whsec_…`.
   (Test first, with the test-mode key, a test-mode endpoint's secret and a
   business account that is not the platform admin's, since the exempt
   account is never asked to pay. The switch is one for everyone, so a
   test-mode run belongs on a Supabase branch or a local stack with this
   migration and these functions, not on the live project, where turning
   billing on would show every business test-mode checkouts.)
6. **Before turning it on**: update the Terms (today they say using the site is
   free) and the Privacy Policy (Stripe as a sub-processor; it already says a
   business's payment records and its email's fingerprint are kept). Pricing
   on the landing, if wanted, goes in with the switch: guard
   `billing-off-changes-nothing` refuses a price anywhere in `src/` (but
   `src/lib/billing.ts`) and `public/`, since a static page cannot know the
   switch; change the guard in the same commit.
7. **Turn it on**: `select public.billing_switch_on();` (in the SQL editor;
   never a raw UPDATE of `app_settings`, which would give the jobs already
   live no days). It answers `{"first": true, "grandfathered": N}`: N jobs
   live now have 30 days from now (a launch pass). Every business's next first
   publish is its free job, once per email address.
8. **Check**: `select public.billing_state('<a business owner id>');` shows
   `billingEnabled: true`; with a non-admin business, a second publish shows
   the payment dialog, a $99 checkout comes back live, and Stripe's dashboard
   shows the webhook's deliveries answered 200.

**Paying inside HireFlow and receipts (2026-11-01)**, after the steps above,
in this order:

1. Apply `supabase/migrations/20261101100000_billing_receipts.sql` (alone,
   Management API; record its live version in docs/MIGRATION-HISTORY.md). It
   adds the receipt columns, `billing_invoices` and three service-role
   functions; it changes no rule. Check: `select public.billing_history(null);`
   → `[]`.
2. Deploy `billing-checkout`, `billing-webhook` and `get-subscription` (one at
   a time). Until step 1 is applied, get-subscription answers
   `payments: null` and the page says the history could not be loaded.
3. In Stripe, add **`invoice.paid`** to the webhook endpoint's events (Unlimited
   renewals in the payment history; the first payment is kept without it).
4. In Stripe, Settings → Customer emails: turn on **Successful payments** (and
   finalized invoices), so the receipt the confirmation promises is emailed.
   Optional: Settings → Branding, so Stripe's form and receipts carry
   HireFlow's mark and the jade.
5. In Vercel, add **`VITE_STRIPE_PUBLISHABLE_KEY`** (`pk_live_…`, Production),
   then redeploy. Until then paying goes to Stripe's hosted page, as before.
6. Run the live test again (a business account that is not the platform
   admin's): the form opens in the dialog, the confirmation shows the amount
   charged, Settings → Billing lists it with its receipt.

**Refunds by hand.** Refunding a $99 payment in Stripe ends that job's pass
and closes the job (`charge.refunded`). Refunding an Unlimited payment does
**not** end Unlimited: also cancel the subscription in Stripe (the
`customer.subscription.deleted` event then closes its jobs).

**After any webhook outage** (Stripe's dashboard shows failed deliveries):
resend the failed events from the endpoint's page in Stripe, and run
billing-sync over every Unlimited once, in the SQL editor:

```sql
select net.http_post(
  url := 'https://yqklrkpptnhubsnijqze.supabase.co/functions/v1/billing-sync',
  headers := jsonb_build_object('Content-Type', 'application/json',
    'x-billing-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'billing_sync_secret')),
  body := '{"all": true}'::jsonb,
  timeout_milliseconds := 60000);
```

Turning it off: `update public.app_settings set value = 'false'::jsonb where key = 'billing_enabled';`
(subscriptions keep charging until cancelled in Stripe). Turning it on again
is `billing_switch_on()` again; it gives no new days.

## Known limits

- One free job per email address, not per person: someone with several
  inboxes they really control gets one free job for each. Turnstile (an owner
  input) stops bots signing up, not a person's extra addresses.
- Cards only. Philippines businesses: Stripe may not offer GCash or Maya
  (docs/LAUNCH-PLAN.md, "Later → Stripe", step 9). Stripe Tax is not set up.
- A Checkout page Stripe made whose id billing-checkout could not record
  (the function stopped in between) stays open until Stripe expires it (a
  day). Paid, it is a second Unlimited (cancelled and refunded by the
  webhook) or 30 more days on that job.
- A paused business's payment that lands anyway (checkout refuses one, so
  only a page opened before the pause) records its 30 days but leaves the
  job closed; nothing is refunded automatically.
- A job put live by the server or a platform admin with no pass, or while
  billing was off after it had been on, stays live until someone closes it;
  the admins are told once a day.
- billing-sync reads, each hour, only the Unlimited subscriptions near or past
  their period end (or past_due for 6 days). A cancellation whose webhook was
  missed mid-period is caught at the period end, or at once by resending the
  event or running billing-sync with `{ "all": true }`.
- Turning billing off does not cancel subscriptions in Stripe.
- The payment history lists Unlimited renewals only once `invoice.paid` is
  among the endpoint's events (its first payment is kept regardless), and an
  Unlimited payment shows "Refunded" only when refunded in full. A receipt
  the webhook could not read stays on Stripe's billing page (Manage card or
  cancel) and in the business's email.
- Payments made before 2026-11-01 (the owner's $1 test) have no receipt link
  in the history and no invoice in Stripe's billing page: the charge's receipt
  is in Stripe's dashboard.
