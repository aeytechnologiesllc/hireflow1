# Overnight run — 26 Aug 2026

Running autonomously while you sleep. This file is the record; I update it as work lands.

## Done and verified live

### Launch repairs — commit `9b968a1`, migrations `58826c6`

| Fix | Verified how |
|---|---|
| **Account-enumeration hole closed.** `check-email-exists` answered, with no login, whether any email had an account. Retired (410). Its only caller was candidate password reset, which used it to say "no account found" — the exact disclosure that makes reset an enumeration tool. That flow now answers identically either way. | `curl` → `410 {"error":"gone"}` |
| **Rate limiting on money-spending public endpoints.** They must stay open (accountless candidates, guest job creator) so the fix is a spend cap, not auth. Postgres-backed, fails open by design. | 16 rapid calls → 15 through, 16th `429` |
| **Stripe test-key trap removed.** A missing `VITE_STRIPE_PUBLISHABLE_KEY` silently dropped **production** into Stripe test mode — checkout opened, looked right, could not take real money. Now it fails loudly and the dialog says so. | Build clean; fallback gone from source |
| **Feed quality gate.** A job only reaches `/jobs.xml` with a real company name, city, country, live deadline, and no exclude flag. Also emits `<dateposted>` — several aggregators reject the source without that exact spelling. | Feed serves valid XML, 0 jobs (all four are QA — correctly withheld) |
| **No more "Confidential" to Google.** Job pages never claim an anonymous employer; a listing that can't satisfy Google ships `noindex` instead of broken structured data. | Googlebot fetch → full valid JobPosting |
| **ROOT CAUSE FOUND: 5 of 14 accounts had no `profiles` row at all.** No profile → no company name → the job can never be published in a form Google or any aggregator accepts. A paying customer could have been stuck there. Backfilled; `handle_new_user` is now idempotent and cannot break a signup; `ensure_profile_exists()` added as a self-healing net. | `users_without_profile` = 0 |
| **Node 24 pinned** before Vercel disables Node 20 on 1 Oct 2026. | `package.json` engines |
| **October model deadlines defused.** Every model name now reads from an env var — swapping is a dashboard change, not a deploy. | `docs/MODEL-DEADLINES.md` |

Live proof of the fixed job page:

```
noindex present : False
JobPosting      : YES
  employer   : Ridgeway Garage      (was "Confidential")
  location   : Atlanta / GA / US    (was empty)
  salary     : 22 - 26 USD HOUR     (was missing)
```

## Running now — the audit loop

Your rule, implemented exactly: **20 independent auditors per round** (Sonnet 5, in
parallel) → dedupe → **one fixer per file** so two agents can never edit the same file →
build + typecheck verification → **repeat**. The loop exits only after a full round finds
nothing, and I keep running rounds past 30 if anything is still turning up.

The twenty lenses: build integrity · dead code · endpoint security · data security &
RLS · payments · auth flows · candidate journey · employer journey · edge-function error
handling · database integrity · API routes · env/config · React correctness · error &
empty states · accessibility · responsive · performance · AI-copy rules · data
consistency · dependency risk.

## Waiting on you (nothing else is blocked)

1. **Stripe live keys** — the one thing standing between this app and real money.
2. **Facebook Business account** — start it first; Meta's verification is the longest clock.
3. **Lock the three prices** — one line from you.
4. **Google Search Console** — ten minutes, so the now-valid listings get trusted.
