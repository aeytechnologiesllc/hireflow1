# HireFlow (hireflow1) — Definitive Engineering Audit

**Stack:** React 18 + Vite + TypeScript + shadcn/ui + Supabase (Postgres/RLS + Edge Functions)
**Decision under review:** "Save & harden, don't rebuild"
**Date:** 2026-06-18

---

## 1. Executive Summary

### Verdict: CONFIRM "save & harden" — but with a hard caveat

The application *codebase* is worth keeping. The frontend skeleton is professional (lazy routing, vendor chunk splitting, a working ErrorBoundary, a clean ~40-hook state layer, TanStack Query with sane defaults, only 8 `as any` casts and zero `@ts-ignore` suppressions). The Supabase schema is reasonably normalized with a proper `user_roles` table and search-path-pinned SECURITY DEFINER helpers. The AI core shows genuine sophistication (evidence fingerprinting, stale-state guards, weighted scoring). None of the confirmed defects require a rebuild; they are bounded, fixable hardening tasks.

**However**, the project is *not currently shippable and is not currently functional against its configured backend.* Two independently confirmed P0s make "save & harden" conditional on emergency remediation:

1. The live database the app points at is a **completely different application** (a 12-table demo) than the 19-table SaaS schema the repo's 73 migrations build. 18 of 21 queried tables do not exist in prod; the 3 name-matches have incompatible schemas. Every `functions.invoke()` 404s. The app cannot run.
2. The platform **illegally auto-rejects job applicants** via an LLM score with zero human review, in the default mode, fired from the candidate's own session — while the Privacy Policy affirmatively claims AI is "advisory."

So: keep the code, but treat Phase A below as launch-gating, not optional.

### Top 3 launch-blockers

| # | Blocker | Why it blocks launch |
|---|---------|----------------------|
| **1** | **Catastrophic repo↔prod drift** — app is wired to a demo project whose schema is unrelated to the code (`yqklrkpptnhubsnijqze`); CLI config points at a third, dead project (`kcotpxlggfvgclwksmhl`). | The app is **non-functional against its configured backend**. Nothing else matters until the canonical backend exists and is wired correctly. |
| **2** | **Self-grantable billing/credits + cross-tenant takeover via broken RLS.** `WITH CHECK(true)` on `subscriptions`/`voice_credits`; self-join into any employer's `team_members`; candidates can self-promote `status='hired'`/`ai_score` and forge employer e-signatures. | Any authenticated user can bypass all paid gating, read/modify any tenant's candidate PII/messages/documents, and corrupt the hiring pipeline. Direct revenue loss + multi-tenant data breach. |
| **3** | **Illegal fully-automated AI rejection with no human in the loop** (default mode), contradicted by the Privacy Policy. | EEOC/Title VII, NYC Local Law 144, EU AI Act / GDPR Art. 22, CO SB205, IL AIVIA exposure, plus FTC UDAP risk from the contradicting policy. |

### Subsystem scorecard

| Domain | Health | One-line |
|--------|:------:|----------|
| Compliance & AI Hiring Law | **2.0 / 10** | Default-on automated adverse decisions with no oversight, audit log, notice, or appeal; policy text is false. |
| Live Supabase (prod) | **2.5 / 10** | Configured backend is a different app entirely; three project refs in play; app 404s against prod. |
| Security, Auth & Secrets | **3.0 / 10** | Secrets are clean and Stripe is verified, but the browser↔DB trust boundary is broken (self-grant, PII buckets public). |
| Database & RLS | **4.0 / 10** | RLS enabled everywhere but riddled with `USING(true)` / no-`WITH CHECK` policies; almost no indexes. |
| Frontend Architecture & Code Health | **4.5 / 10** | Professional skeleton undermined by zero tests, types stripped at build, and 3,000+ LOC god-components. |
| Edge Functions & AI Logic | **5.0 / 10** | Competent AI logic, but autonomy + prompt-injection + open unauthenticated endpoints is a high-risk trio. |
| Theming & Design Tokens | **6.0 / 10** | Token system is centralized and adoptable, but values are still the old emerald theme; Deep Jade is hardcoded in 2 files. |

---

## 2. Critical & High Findings

*Refuted finding dropped:* "All user profiles readable by every authenticated user" was **refuted** — migration `20251227174653_*.sql:6` drops the blanket policy and replaces it with a scoped one. Not listed below. (Residual caveat: depends on migrations actually being applied in prod — see drift findings.)

Severities below are the **adjusted** verdicts.

---

### P0 — Launch-blockers

#### P0-1 · Catastrophic repo↔prod schema drift: the live DB is a different application
**Severity:** Critical · **Domain:** Live Supabase
**Evidence:** live `list_migrations` (8 demo migrations, all 2026-06-17) vs repo `supabase/migrations/` (73 files, 2025-12 → 2026-03); live `list_tables` returns 12 demo tables (`roles`, `candidates`, `employers`, `kpis`, `onboarding`…); repo defines 19 SaaS tables (`jobs`, `profiles`, `subscriptions`, `team_members`, `interviews`, `document_*`…). Migration version sets are fully disjoint.
**Impact:** The repo's migrations were **never applied** to the configured project. The 3 coincidentally same-named tables (`applications`, `documents`, `messages`) have structurally incompatible schemas (live `applications` has TEXT PKs, `role_id`, no `job_id`, no `created_at`). The repo is not the source of truth for the deployed DB.
**Fix:** Decide the canonical schema. If the repo SaaS schema is the product (it is), provision a clean project, apply all 73 migrations *after* fixing the security migrations below, repoint `.env`, and re-generate types. Do **not** attempt to "reconcile" — they are different apps. Then enforce migration-as-source-of-truth in CI (`supabase db diff` gate) so dashboard edits can never silently diverge again.

#### P0-2 · Frontend points at the demo project; core queries target non-existent tables (runtime-fatal)
**Severity:** Critical (verdict: *partial* — the absolute "every/none" wording is overstated, but runtime-fatal conclusion holds) · **Domain:** Live Supabase
**Evidence:** `.env:2` `VITE_SUPABASE_URL=https://yqklrkpptnhubsnijqze.supabase.co`; `src/integrations/supabase/client.ts:5` builds the client from it with no fallback. 18 of 21 queried tables are absent from prod; the 3 present (`applications` x72, `documents` x23, `messages` x9) have incompatible columns/relationships. All 26 `functions.invoke()` slugs are absent from the live project's 4 functions.
**Impact:** Core paths return PostgREST `42P01` (relation does not exist) or `PGRST200` (relationship not found); every edge-function call 404s. The app as shipped cannot function.
**Fix:** Resolve P0-1 (correct backend), then add a boot/CI smoke test that `SELECT 1`s from each required table and pings each edge function so schema mismatch fails fast.

#### P0-3 · Fully automated AI rejection with no human in the loop (default mode); Privacy Policy contradicts it
**Severity:** Critical · **Domain:** Compliance / Edge Functions
**Evidence:** `trigger-ava-analysis/index.ts:259-341` writes `status:'rejected'`, `rejected_by_type:'ava'` and emails the candidate inline (no employer approval); decision is pure score-vs-threshold at `_shared/autopilot.ts:421-428` (default `passing_score` 60). Auto is the DB+UI default (`migrations/20251214211904_*.sql:6` `DEFAULT 'auto'`; `GuestJobCreator.tsx:212`, `CreateJob.tsx:480`). Fired from candidate phase pages with the candidate's own JWT (`ApplicationFormPhase.tsx:900-905`, `QuizPhase.tsx:806`, plus every other phase). `autopilot-batch/index.ts:266-336` bulk-rejects all below threshold. **Privacy Policy 12.1/12.2 (`Privacy.tsx:578-595`) falsely state AI is advisory and human-reviewed.**
**Impact:** Applicants effectively auto-reject themselves with no oversight, notice, or appeal. EEOC/Title VII disparate-impact exposure, NYC LL144 (no bias audit, no 10-day notice), EU AI Act high-risk + GDPR Art. 22, CO SB205, IL AIVIA. The contradicting policy compounds this with FTC deceptive-practice (UDAP) risk.
**Fix:** Remove the autopilot `reject` write path entirely. Make AI advisory: in auto mode, advance/defer/shortlist only; route **all** rejections to the human `BulkRejectDialog` queue (already exists, writes `rejected_by_type:'user'`). Never let a candidate's JWT drive a terminal decision. Default new jobs to **manual**. Make the policy text match the code.

#### P0-4 · Statutory AI-hiring obligations unmet (LL144 / Title VII / EU AI Act / GDPR / CO / IL)
**Severity:** High · **Domain:** Compliance
**Evidence:** AEDT replaces screening (`_shared/autopilot.ts:114-478`); disparate-impact proxies are weighted into the decision — typing WPM/accuracy (`trigger-ava-analysis/index.ts:1159,1175,1197,1231`), video-intro presence (`autopilot.ts:234-240,327`), and **name matching as a hard-reject flag** (`ai-analyze/index.ts:727` → `autopilot.ts:211-213,385-394`). No `ai_decision_log`/bias-audit/AEDT table exists anywhere (grep of 73 migrations). The rejection email (`send-notification-email/index.ts:246-256`) falsely attributes the decision to "the hiring team." Only mention of LL144 is a liability-shifting clause (`Terms.tsx:392-394`).
**Mitigation noted:** the auto path is employer-configurable (`processing_mode='auto'`), and a human-review mode exists — hence High not Critical. But the non-compliant path is fully wired and ships without any safeguard.
**Fix:** Bias audit + four-fifths monitoring; AEDT 10-day notice + alternative-selection process; disable solely-automated EU/GDPR rejection (Art. 22 human intervention); CO/IL notice + consent + appeal; immutable `ai_decision_log` capturing score, weights, and reasons; honest automated-decision disclosure to candidates.

#### P0-5 · Billing/credits tables self-grantable by any authenticated user (`WITH CHECK(true)`)
**Severity:** Critical · **Domains:** Database & RLS / Security
**Evidence:** `migrations/20251215071210_*.sql:47-53` (subscriptions) and `:60-66` (subscription_usage), `migrations/20251216190601_*.sql:26-35` (voice_credits) — INSERT `WITH CHECK(true)` + UPDATE `USING(true)`, no `TO` clause (default PUBLIC, incl. `authenticated`). Never dropped across all 73 migrations. Client ships only the publishable key (`client.ts:16`), so RLS is the sole boundary. `get-subscription/index.ts:457,489-539` derives all entitlements straight from `plan_type`; the 2026-03-28 hardening migration *trusts the same forgeable row* (`subscription_plan_for_limits`).
**Impact:** Any logged-in user can `UPDATE subscriptions SET plan_type='enterprise', status='active'` → unlimited jobs/docs/team/analytics, or `INSERT voice_credits` with arbitrary minutes → free paid voice. `USING(true)` also has no `user_id` scope → one tenant can overwrite/void **another** tenant's billing (cross-tenant tampering + DoS). Complete bypass of Stripe.
**Fix:** Drop the permissive policies; revoke INSERT/UPDATE/DELETE on these tables from `anon`/`authenticated` (all legitimate writes already go through service-role edge functions, so zero functional cost). Client may only SELECT its own row. Audit existing rows for tampering.

#### P0-6 · Candidates can self-promote `status`/`ai_score`/`phase` (no column restriction on application UPDATE)
**Severity:** Critical · **Domains:** Database & RLS / Security
**Evidence:** `migrations/20251215031758_*.sql:2-6` — `FOR UPDATE USING(auth.uid()=candidate_id) WITH CHECK(auth.uid()=candidate_id)`, no column scoping (Postgres RLS can't restrict columns). Only triggers are `update_applications_updated_at` (sets timestamp) and the AFTER-UPDATE notification trigger — neither blocks the change. Candidates already issue self-UPDATEs from the browser (`SalesSimulationPhase.tsx:624`), proving the path is live.
**Impact:** A candidate can set `ai_score:100, status:'shortlisted', phase:<final>, ai_analysis:'…'` on their own row, defeating AI shortlisting and automated phase gates (`QuizPhase.tsx:832`, `TypingTestPhase.tsx:488` advance when `ai_score >= passing`). `autopilot-batch` and employer UI consume these columns as trusted.
**Fix:** Replace the broad policy. Route phase submissions through a SECURITY DEFINER RPC or service-role edge function, and add a BEFORE UPDATE trigger that RAISEs if a candidate touches `status`/`ai_score`/`resume_score`/`phase`/`ai_analysis`/`rejected_by`. Allow candidates only their submission fields (`cover_letter`, answers, `resume_url`).

#### P0-7 · Candidates can tamper with signed documents and forge employer signatures (no `WITH CHECK`)
**Severity:** Critical · **Domain:** Database & RLS
**Evidence:** `migrations/20251214202144_*.sql:95-104` — `FOR UPDATE` with a `USING` clause but **no `WITH CHECK`**, so the candidate may write any column. Tamperable columns confirmed to exist: `employer_signature_data`, `employer_signed_at` (`20251214214736_*.sql`), `final_pdf_hash` (`20251226141436_*.sql`), `document_hash`/`is_voided` (`20251215015158_*.sql`), `is_locked`/`completion_certificate`/`v1_hash`-`v3_hash` (`20251219170828_*.sql`, hardening migration). The immutability triggers protect only `document_audit_logs`, not `documents`. Never fixed in any later migration.
**Impact:** A candidate can set `status='signed'`, forge `employer_signature_data`/`employer_signed_at`, and overwrite integrity hashes and the completion certificate on a legally binding document. The entire dual-signature + audit-hash design is defeated at the row level.
**Fix:** Add a `WITH CHECK` and restrict updatable columns to `candidate_signature_data`/`candidate_signed_at`/`declined_at`/`decline_reason`. Enforce via BEFORE UPDATE trigger rejecting candidate changes to `employer_*`/`*_hash`/`is_locked`/`status`; block all updates once `is_locked=true`.

#### P0-8 · Team-takeover chain: open invitation read + self-join into any employer's `team_members`
**Severity:** Critical · **Domain:** Database & RLS
**Evidence:** Three live policies combine: (1) `migrations/20251215060535_*.sql:2-5` "Anyone can view invitations by code" `USING(invite_code IS NOT NULL)` — invite_code is trigger-generated and never null → effectively `USING(true)`, leaking every employer's `invitee_email`/codes. (2) `:8-11` "Users can join via invitation" `WITH CHECK(auth.uid()=user_id)` — OR-combined, so caller fully controls `employer_id`, `can_*` flags, `assigned_job_ids`, `status` (defaults to `active`). (3) `20251216015646_*.sql:1-11` accept-any-pending. The client email guard (`JoinTeam.tsx:137`) is bypassed by calling PostgREST directly.
**Impact:** Any candidate can insert an ACTIVE `team_members` row binding themselves to **any** employer with full permissions, then read/modify that employer's jobs, applications, candidate PII, messages, and documents via the many "Team members can…" policies. Full cross-tenant takeover. The 2026-03-27 fix migration does **not** remediate these three policies.
**Fix:** Gate self-join through a SECURITY DEFINER RPC that looks up the invitation by code, verifies `invitee_email` = caller's verified email, copies `employer_id`/permissions from the invitation row (never client input), and marks it accepted atomically. Drop the broad INSERT and the "Anyone can view" SELECT policies.

#### P0-9 · Candidate PII buckets (`resumes`, `videos`, `portfolios`) are world-readable (`public=true`)
**Severity:** Critical (Security verdict) / High (DB verdict) · **Domains:** Security / Database & RLS
**Evidence:** Buckets created `public=true`: `resumes` (`20251214222311_*.sql:2-3`, plus an explicit "Resumes are publicly readable" no-`TO` SELECT policy), `videos` and `portfolios` (`20251215001652`, `20251216220244`). Public buckets serve via unauthenticated CDN and **bypass** `storage.objects` SELECT RLS, making the scoped policies dead code. Never flipped private in any migration. App persists the `getPublicUrl()` result into queryable rows (`ApplicationFormPhase.tsx:554 resume_url`), and no `createSignedUrl` exists for these buckets — contrast `documents`/`voice-interview-recordings`/`requested-documents`, which are correctly private and use signed URLs.
**Impact:** Anyone who obtains/guesses an object URL downloads resumes (name, address, phone, work history), video intros (face/voice), and portfolios with no auth. Bulk candidate-PII exposure / GDPR.
**Fix:** `UPDATE storage.buckets SET public=false WHERE id IN ('resumes','videos','portfolios')`; serve via short-lived signed URLs gated by the existing RLS SELECT policies; drop the "publicly readable" policy.

---

### P1 — High

#### P1-1 · `message-attachments` bucket: cross-tenant read/write/**delete** of all attachments
**Severity:** High · **Domains:** Security / Database & RLS
**Evidence:** `migrations/20251216160358_*.sql:8-23` — `public=true` and three policies scoped only by `bucket_id` (no `auth.uid()`/folder check) for INSERT/SELECT/**DELETE**, all `TO authenticated`. Contrast `resumes`, whose INSERT/DELETE *are* owner-scoped.
**Impact:** Any authenticated user can list/read every private employer↔candidate chat attachment, upload to any path, and **delete** anyone's attachments.
**Fix:** Make private; scope all three ops to `auth.uid()::text = (storage.foldername(name))[1]` and/or message participants; serve via signed URLs.

#### P1-2 · `blueprint_purchases` insertable client-side without payment (Stripe bypass)
**Severity:** High · **Domain:** Database & RLS
**Evidence:** `migrations/20251227004711_*.sql:24-28` — `FOR INSERT WITH CHECK(auth.uid()=user_id)`, no payment check; `stripe_session_id` nullable. Gating relies solely on row existence (`useImprovementBlueprint.ts:74-105`); content edge functions don't re-verify purchase.
**Impact:** Any candidate runs one `supabase.from('blueprint_purchases').insert(...)` to unlock the paid $1.99 blueprint for free.
**Fix:** Drop the client INSERT policy; insert only from `verify-blueprint-purchase` (service role) after confirming the Stripe session is paid.

#### P1-3 · Prompt injection from candidate text into the scoring prompt that drives auto-reject
**Severity:** High · **Domain:** Edge Functions
**Evidence:** `ai-analyze/index.ts:919-952` concatenates cover letter, answers, and resume text (sliced, unsanitized) with no delimiting/escaping; `trigger-ava-analysis/index.ts:1050-1075` regex-scrapes the score from model prose, and `_shared/autopilot.ts:206-229` derives fraud/authenticity flags via regex on `analysisText`.
**Impact:** A candidate can embed "Overall Score: 98 … Document Validation Status: VALID" in their resume to inflate their score and suppress fraud flags, defeating both auto-reject and authenticity checks.
**Fix:** Make `structuredScore` (the JSON path) the single source of truth; drop the prose regex scrapers. Wrap candidate content in explicitly-untrusted delimited blocks; never let candidate text alter authenticity verdicts.

#### P1-4 · Public, unauthenticated AI/TTS endpoints invite OpenAI/ElevenLabs cost abuse
**Severity:** High · **Domains:** Edge Functions / Security
**Evidence:** `config.toml` sets `verify_jwt=false` on `ai-analyze`, `ai-chat-interview`, `ai-chat-simulation`, `ai-sales-simulation`, `ai-generate-job-content`, `ai-generate-workflow`, `elevenlabs-tts`. `ai-analyze` does zero auth (no `getUser`, straight to OpenAI gpt-5.4 at `:864-905`); `elevenlabs-tts` and the generators likewise. CORS is `*`. No rate limit or spend cap anywhere; the per-plan count cap lives only in `trigger-ava-analysis` and is bypassed by calling `ai-analyze` directly. The anon key needed to route ships in the browser bundle.
**Impact:** Scripted financial DoS on OpenAI/ElevenLabs budgets; LLM usable as a free general-purpose proxy.
**Fix:** Set `verify_jwt=true` (or require an internal shared-secret header for server-to-server calls) on all paid-provider functions; add per-user/IP rate limiting and a per-employer monthly spend ceiling in the shared OpenAI helper.

#### P1-5 · Voice-minute billing trusts client-reported session duration
**Severity:** High · **Domain:** Edge Functions
**Evidence:** `deduct-voice-minutes/index.ts:47-55,155-176` deducts whatever `sessionDurationMinutes` the browser sends (validated only `>0`); computed client-side in `useAvaVoice.ts:659-660,863-864`; never reconciled to the actual OpenAI Realtime session. `ava-voice-session/index.ts:377-428` auto-provisions 150 free minutes on exhaustion with no payment gate. Interview mode bills the **employer**.
**Impact:** Under-report duration to consume real gpt-realtime minutes nearly for free (billed to employers), plus a free 150-min auto-refill loop. Real cost exceeds credits deducted.
**Fix:** Persist session start server-side when the ephemeral token is minted; compute billable minutes from server timestamps / OpenAI usage; reject deductions that don't reconcile; cap and gate auto-provisioning.

#### P1-6 · `MiniAvaContainer` references undefined `toolName` 12× — runtime crash of Ava voice tool-calls
**Severity:** High · **Domain:** Frontend
**Evidence:** `src/components/MiniAva/MiniAvaContainer.tsx:47` destructures the param as `_toolName` but the body references bare `toolName` at lines 55,68,74,80,86,92,98,104,110. `tsc -p tsconfig.app.json` flags 12× TS2552/TS2304; the SWC build strips types and ships it. The hook actually invokes the callback (`useAvaVoice.ts:642`); ESM strict mode throws `ReferenceError`.
**Impact:** Every tool-result path that compares `toolName` (schedule_interview, send_message, shortlist_applicant, mark_as_top_candidate, add_applicant_note, pause/archive job, reschedule/cancel interview, bulk_reject) throws — no success feedback or routing.
**Fix:** Rename the parameter back to `toolName` (one line). Ban TS2304/TS2552 (undefined-name) from the typecheck baseline — those are always real bugs.

#### P1-7 · Three (actually four) Supabase project refs; CLI config + CLAUDE.md point at the dead project
**Severity:** High · **Domain:** Live Supabase
**Evidence:** `config.toml:1` `project_id="kcotpxlggfvgclwksmhl"` (old/inaccessible); `.env` → `yqklrkpptnhubsnijqze` (live); `CLAUDE.md:69` instructs `supabase link --project-ref kcotpxlggfvgclwksmhl`. A fourth ref `yvczrgulhswbxsfnyqan` is hardcoded in `migrations/20260312192158_*.sql:9`. The push-trigger (`20260329145000_*.sql:11`) hardcodes the dead host.
**Impact:** Any operator following the repo runbook pushes migrations / deploys functions to the dead project; the push trigger calls edge functions on a dead host (fails open → silent missed notifications).
**Fix:** Pick the canonical ref; align `.env`, `config.toml`, migration target, and CLAUDE.md to it. Read project URL in DB functions from a GUC/Vault secret, not a hardcoded literal.

#### P1-8 · Edge-function drift: 38 repo functions vs 4 unrelated live functions (prod not reproducible)
**Severity:** High · **Domain:** Live Supabase
**Evidence:** Live project has only `generate-flow`, `grade-quiz`, `score-interview`, `transcribe-audio` (all `verify_jwt=false`); repo defines 38 entirely different functions including `stripe-webhook`, `purchase-voice-credits`, `delete-account`. Zero overlap. The 4 live functions have no source in the repo; the 26 functions the app invokes don't exist live.
**Impact:** Deployed code is unversioned/unrecoverable; all payment/AI features 404 against prod.
**Fix:** Download the 4 live functions into source control; deploy the repo functions to the canonical project after the schema target is fixed; gate payment/account functions behind auth.

#### P1-9 · Current design-token *values* are the old emerald theme, not Deep Jade
**Severity:** High · **Domain:** Theming
**Evidence:** `index.css:17` `--primary: oklch(0.55 0.16 162)` (emerald), `:26` `--accent`, `:69` dark `--background: hsl(222 47% 7%)` (blue-black, not jade `#0e2a22`); no `--brass` token anywhere. `App.tsx:91` forces dark by default → every token-driven screen renders old emerald-on-blue-black.
**Impact:** The entire authenticated app is off-brand. (See §4 for the rollout plan.)
**Fix:** Rewrite the `.dark` token block to Deep Jade values + add brass/serif tokens (rollout in §4).

#### P1-10 · Deep Jade is hardcoded as a duplicated `JADE` object, bypassing the token system
**Severity:** High · **Domain:** Theming
**Evidence:** Literal `const JADE = {...}` + `const serif` duplicated (and already drifting in alpha values) across `Index.tsx:20-35` and `landing/FeatureDetailDialog.tsx:22-33`, applied via inline `style={{...}}`. A third throwaway file `AvaPreview.tsx` (route `/ava-preview`) also hardcodes it.
**Impact:** The design lives in component code, not tokens, so it cannot propagate — and copies are already diverging.
**Fix:** Promote `JADE` values into CSS variables; replace inline styles with token-backed Tailwind classes; delete the local consts.

#### P1-11 · 71 files hardcode colors (53 emerald/teal, 43 purple/blue/violet) that won't follow a token swap
**Severity:** High · **Domain:** Theming
**Evidence:** Palette classes (`bg-emerald-500`, `text-purple-400`, etc.) are absent from `tailwind.config.ts`, so they resolve to Tailwind's static palette baked at build time. Worst offenders: `CandidateStatusScreen.tsx` (45 hits incl. raw confetti hex arrays `:394-448` and `from-purple-500/50 via-blue-500/50 :510`), `GuestJobCreator.tsx`, `MarketingDemo.tsx`, `CreateJob.tsx`, `subscription/UpgradePrompt.tsx`.
**Impact:** These screens will stay off-brand after a token-value swap.
**Fix:** Mechanical sweep (see §4 Phase 2): emerald/teal → `primary`/`accent`; purple/blue → brass/jade or remove; gray/slate → `muted`/`border`; decoration hex → a single exported palette constant.

#### P1-12 · God-components (17 files >1,000 LOC; `CreateJob` 3,633, `ApplicantDetails` 3,545)
**Severity:** High · **Domain:** Frontend
**Evidence:** `CreateJob.tsx` 3,633 LOC / 29 useState / 7 useEffect (one component); `ApplicantDetails.tsx` 3,545 LOC / 28 useState / 17 useEffect (one component); `GuestJobCreator.tsx` 2,114; `CondensedAIAnalysis.tsx` 1,984. `CreateJob` is reused for both create and edit (`App.tsx:125-126`).
**Impact:** State transitions are unreasonable-about, effects are stale-closure-prone, and the files are untestable — and these are exactly the surfaces the auto-reject and RLS fixes must touch.
**Fix:** Extract section subcomponents + cohesive state into hooks (`useCreateJobForm`, `useApplicantDossierState`); soft cap ~400 LOC. Prioritize `ApplicantDetails`/`CreateJob`. This is a prerequisite for testing.

---

### P2 — Medium (highlights)

| Finding | Severity | Evidence | Fix |
|---|:---:|---|---|
| **Hardcoded inconsistent project URLs in migrations** (push trigger) — partly overstated (active value matches config; fails open) | Medium | `20260312192158_*.sql:9`, `20260329145000_*.sql:11` | Read URL from GUC/Vault, not literals; reconcile repo vs prod (73 files vs doc's 71). |
| **Near-total absence of indexes** on FK / RLS-predicate columns (7 total, none on core tables) — scalability, not present breakage | Medium | all `CREATE INDEX` in 3 migrations; core FKs unindexed in `20251214183024_*.sql` | Add btree indexes on `jobs(employer_id,status)`, `applications(job_id,candidate_id,status)`, `team_members(employer_id)`, `documents(application_id,sender_id,recipient_id,package_id)`, `notifications(user_id) WHERE NOT is_read`, etc. |
| **Zero automated tests / no runner** — partial (4 unwired, machine-pinned Playwright scripts exist) | Medium | `package.json:6-14` no `test` script/deps | Add Vitest + RTL; cover `useAuth` role resolution and `AppLayout` subscription gating first; wire into the typecheck CI step. |
| **54 type errors frozen into a baseline, shipped (SWC strips types)** — the two showcased errors are runtime-inert/guarded | Medium | `scripts/typecheck-baseline.json` total 54; `tsconfig` strict off | Drive the 54 to zero; then enable `strictNullChecks`; don't treat the ratchet as a permanent ceiling. |
| **Score decisions rely on regex-scraping LLM prose; null score can resolve to reject** | Medium | `trigger-ava-analysis/index.ts:1050-1081`; `autopilot.ts:480-502` | Use structured JSON only; on parse failure → "needs human review," never implicit reject. |
| **Voice-interview `end_interview` scores stored verbatim, unbounded; no per-call ownership recheck** | Medium | `ava-voice-tools/index.ts:447-555` | Clamp 0-100 + enum; re-verify caller owns the application. |
| **Resume fetched from candidate-supplied URL (SSRF-adjacent), no allowlist** | Medium | `_shared/resume.ts:65-183` | Allowlist the project's storage host; resolve via storage API; add size/content-type/timeout limits. |
| **autopilot-batch unbounded fan-out** (one OpenAI call per applicant, serial, no cap) | Medium | `autopilot-batch/index.ts:217-296` | Cap per-invocation; paginate/queue; bounded concurrency; per-run spend ceiling. |
| **Default model id `gpt-5.4` is not a known model** — total AI outage if env unset | Medium | `ai-analyze/index.ts:11` et al. | Pin real model ids in prod env; health-check on boot; AI error → "needs human review." |
| **Push trigger calls edge fn with no Authorization header** (`send-push-notification` `verify_jwt=false`) | Medium | `20260329145000_*.sql:15-27`; `config.toml:108-109` | Validate an internal secret header in the function. |
| **`check-email-exists` is an unauthenticated enumeration oracle** | Medium | `config.toml:75-76`; `check-email-exists/index.ts:15-53` | Rate-limit/captcha; generic response; fold into signup. |
| **Public TRUNCATE-everything migration in history** | Medium | `20251227020347_*.sql:4-23` | Remove destructive resets from the migration lineage. |
| **Self-service `employer`/`team_member` role assignment** (trust anchor for many policies) | Medium | `20260214215715_*.sql:3-22`; `20251215061056_*.sql:2-5` | Confirm intent; gate privileged actions on billing; move `team_member` grant into the vetted join RPC. |
| **`react-hooks/exhaustive-deps` × 46** incl. AppLayout payment-activation effect | Medium | eslint; `AppLayout.tsx:122-156` | Fix the auth/subscription effects; don't disable the rule. |
| **Route protection hand-rolled in layouts; `navigate()` called during render** | Medium | `AppLayout.tsx:234-238,280-284`; `DeveloperLayout.tsx:74-95` | Extract `RequireAuth`/`RequireRole`/`RequireSubscription` guards; move redirects into effects/guards. |
| **Hybrid Tailwind v4 + legacy v3 config** (tokens defined in two places) | Medium | `package.json` tw ^4.3.1; `index.css:3-4 @config`; `components.json` | Optional: migrate tokens into v4 `@theme` and drop the `@config` bridge during retheme. |
| **Typography tokens still Plus Jakarta; Fraunces/Inter loaded but not wired** | Medium | `index.html:41-43`; `tailwind.config.ts:24-26`; `index.css:1,163` | Set `fontFamily.sans=['Inter',…]`, `fontFamily.serif=['Fraunces',…]`; remove Jakarta import. |

---

### Low / Cleanups (grouped)

- **Access control / CORS:** wildcard `Access-Control-Allow-Origin:*` on all functions incl. billing (`stripe-checkout`, `deduct-voice-minutes`) — restrict to known origins. Implicit OAuth flow + localStorage token storage (`client.ts:16-24`) — switch to PKCE.
- **RLS governance:** `developer` role grants blanket cross-tenant SELECT-all (`20260104033710_*.sql`) — audit/tightly control grants, ensure no self-service path can assign it. Fragile `LIKE '%'||name||'%'` URL join for employer storage access (`20251220202447_*.sql:194-205`) — store a `storage_path` column and join on equality.
- **Theming:** `AvaOrb` shader hardcodes jade/mint/brass uniforms (`AvaOrb.tsx:153-155`) — expose as props from the shared palette; align brass to `#cba36a`. `next-themes` forces dark but a full emerald light theme remains reachable via `ThemeToggle` — decide explicitly (drop light mode or author a Deep Jade light variant).
- **ESLint (not gated):** 409 problems / 350 errors, dominated by 311 `no-explicit-any` and 46 `exhaustive-deps`; 255 stray `console.*`. Gate lint in CI; chip away at `any` in the data/hooks layer; strip console calls at build.
- **Live perf advisories (demo project):** 5 unindexed FKs + absolute auth connection cap — bake fixes into the canonical migration set.

---

## 3. The AI Auto-Reject / AI-Hiring-Law Issue (confirmed — read this)

This is the single most dangerous defect after the backend drift. **Confirmed at Critical.** In the default `processing_mode='auto'`, the platform makes a *fully automated adverse employment decision* — it writes `status='rejected'`, stamps `rejected_by_type='ava'`, and emails the candidate — with **no human in the loop**, triggered by the candidate's own session JWT, at every application phase, and in bulk via `autopilot-batch`. The decision is a bare LLM-derived score vs. a default threshold of 60, with disparate-impact-prone inputs (typing speed, video presence, **name matching as a hard reject**) and **no bias audit, no decision log, no notice, no appeal.** The public Privacy Policy (12.1/12.2) and the rejection email both affirmatively claim the opposite — that AI is advisory and humans decide — creating FTC deceptive-practice exposure on top of the AEDT/EEOC/EU AI Act/GDPR/CO/IL violations.

**This must be fixed before any real applicant touches the system.** The agreed and already-partially-built design is correct: **AI shortlists, humans bulk-reject** (`BulkRejectDialog` writes `rejected_by_type:'user'`). Remove the autopilot reject write path, default jobs to manual, add an `ai_decision_log` and candidate disclosure/appeal, and reconcile the policy text with reality.

---

## 4. Deep Jade Theming Rollout Plan

**Goal:** apply the locked Deep Jade system — jade `#0e2a22`, brass `#cba36a`, Fraunces (display) + Inter (body), dotted-mesh AvaOrb — across all ~46 screens (47 pages + 162 components, of which 51 shadcn/ui are already 100% token-driven and need **zero** edits).

**Why this is feasible (the key asset):** the app is heavily token-driven — **3,324 semantic-token utility usages across 178 of ~297 files** (`bg-background`, `text-foreground`, `bg-primary`…), all resolving through `index.css` CSS variables mapped in `tailwind.config.ts:27-79`. Swapping the *variable values* reskins those 178 files at once without touching markup. **`Index.tsx` (landing) + `FeatureDetailDialog.tsx` are already the Deep Jade reference implementation** — but as hardcoded inline `JADE` objects (P1-10), so they prove the look while demonstrating exactly what *not* to do.

### Token strategy
Centralize on `src/index.css` `:root`/`.dark` as the single source of truth. Recommended v4 path: define tokens in an `@theme` block in CSS and drop the `@config` bridge so colors live in **one** place (currently split between `index.css` vars and `tailwind.config.ts` `var()` indirection — P2 hybrid-config). If time-boxed, keep the hybrid but document "color edits go only in `index.css`."

Promote the `JADE` object into CSS variables and add the missing tokens:
- `--background: #0e2a22` (jade), `--card: rgba(255,255,255,0.04–0.05)` (glass)
- `--primary: #cba36a` (brass), `--primary-foreground: #1a2c20`
- new `--brass`, `--jade-screen`, `--ink (#eef6f1)`, `--sub`, `--hairline`
- `fontFamily.sans = ['Inter', …]`, `fontFamily.serif = ['Fraunces','Georgia',serif]`; remove the Plus Jakarta `@import` and body override

### Retheme order (shared shell + shadcn first, then screens)
1. **Phase 1 — value swap + fonts + token promotion (~3–5 hrs, LOW risk).** Rewrite the `.dark` block to Deep Jade values; wire Inter/Fraunces in `tailwind.config.ts`; promote `JADE` → CSS vars; delete the local `JADE`/`serif` consts in `Index.tsx`, `FeatureDetailDialog.tsx`, `AvaPreview.tsx`. This reskins all 178 token-driven files (incl. the app shell `AppLayout`/`AppSidebar`, which are already token-driven) in one change. **Visually verify by screenshot** (dashboard, landing, sidebar) — pure value change, trivial to eyeball/revert. Decide the light-mode question here (drop `ThemeToggle` or author a Deep Jade light variant).
2. **Phase 2 — sweep the 71 hardcoded-color files (~10–16 hrs, MEDIUM risk).** Mechanical replace by traffic: `CandidateStatusScreen` (45 hits, confetti arrays), `subscription/*` dialogs, `CreateJob`, `GuestJobCreator`, `ApplicantDetails`. emerald/teal → `primary`/`accent`; purple/blue/violet → brass/jade or remove; gray/slate → `muted`/`border`; decoration hex → a single exported palette constant in `src/lib`. Per-file judgment needed on status colors and gradients, hence MEDIUM.
3. **Phase 3 — typography polish, AvaOrb, mode decision, optional v4 `@theme` migration (~4–6 hrs, LOW–MEDIUM risk).** Make display headings `font-serif` app-wide; expose AvaOrb's jade/mint/brass uniforms as props and align brass to `#cba36a`.

### Effort & risks
- **Total: ~17–27 hrs.**
- **Risks:** (a) the 71 hardcoded files silently stay off-brand if Phase 2 is skipped — add a **CI grep guard** failing builds that reintroduce raw palette classes; (b) the light-mode toggle flipping users into the stale emerald theme if not addressed in Phase 1; (c) v4/v3 hybrid config confusion if tokens stay in two places. Highest visual-verification need: the shared chrome and the 71 offender files.

---

## 5. Recommended Phased Execution Plan

**Phase A — Backend, Security & Compliance (launch-gating; do first).**
A1. Resolve the canonical backend (P0-1/P0-2/P1-7/P1-8): provision a clean project, fix the security migrations *before* applying, apply all migrations, repoint `.env`, align `config.toml`/CLAUDE.md, regenerate types, add a boot/CI schema+function smoke test.
A2. Fix the RLS trust boundary (P0-5/6/7/8, P1-1/2): drop `WITH CHECK(true)` billing policies + revoke client writes; column-guard candidate application/document UPDATEs via triggers/RPCs; gate team-join through a SECURITY DEFINER RPC; lock the PII buckets (P0-9) to private + signed URLs; remove client blueprint INSERT.
A3. Kill the illegal auto-reject (P0-3/P0-4): remove the autopilot reject write path, default to manual, route rejections to human `BulkRejectDialog`, add `ai_decision_log` + disclosure/appeal, fix Privacy Policy text, plan the LL144 bias audit + notice.
A4. Lock the AI endpoints (P1-3/4/5): `verify_jwt=true`/internal secret on paid functions, rate limits + spend cap, structured-JSON-only scoring, server-side voice metering.

**Phase B — Correctness, Performance & Reproducibility.**
B1. Fix `MiniAvaContainer` (P1-6) and the AppLayout stale-closure effects; ban undefined-name errors from the baseline.
B2. Add the missing indexes (P2) into the canonical migration set.
B3. Stand up Vitest + RTL; cover auth role resolution and subscription gating; wire lint + tests into the CI gate alongside `typecheck:gate`.
B4. Pin real model ids; clamp interview scores; cap autopilot-batch fan-out; SSRF allowlist for resume fetch.

**Phase C — Deep Jade Theming.** Execute §4 Phases 1–3 (~17–27 hrs). Landing + FeatureDetailDialog are the reference; promote to tokens, swap values, sweep the 71 files, add the CI palette guard.

**Phase D — Maintainability hardening.** Split the god-components (P1-12) into section subcomponents + hooks (~400 LOC cap), starting with `ApplicantDetails`/`CreateJob`; introduce reusable route guards; drive the 54 type errors to zero and enable `strictNullChecks`; reduce `no-explicit-any` in the data layer.

### Honest uncertainty
- Verdicts reflect **repo migration source**, not the live prod DB (which is a different app). Whether prod actually applied any given fix (e.g., the refuted profiles policy) is unverifiable from the repo and depends on resolving Phase A1 first.
- Two findings are **partial**, not fully confirmed: the hardcoded-URL severity is overstated (active value matches config and fails open → impact limited to missed pushes), and "zero tests" is overstated (4 unwired, machine-pinned Playwright scripts exist) — both adjusted to Medium.
- "Self-service role assignment" is plausibly by-design for self-serve signup; confirm intent before treating as a defect.

Key files for Phase A: `/Users/shahzaib/hireflow 2.1/hireflow1/.env`, `/Users/shahzaib/hireflow 2.1/hireflow1/supabase/config.toml`, `/Users/shahzaib/hireflow 2.1/hireflow1/supabase/migrations/`, `/Users/shahzaib/hireflow 2.1/hireflow1/supabase/functions/trigger-ava-analysis/index.ts`, `/Users/shahzaib/hireflow 2.1/hireflow1/supabase/functions/_shared/autopilot.ts`. Key files for Phase C: `/Users/shahzaib/hireflow 2.1/hireflow1/src/index.css`, `/Users/shahzaib/hireflow 2.1/hireflow1/tailwind.config.ts`, `/Users/shahzaib/hireflow 2.1/hireflow1/src/pages/Index.tsx`, `/Users/shahzaib/hireflow 2.1/hireflow1/src/components/landing/FeatureDetailDialog.tsx`.