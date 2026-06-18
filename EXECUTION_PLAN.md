# HireFlow — Execution Plan

> Living operating doc for the HireFlow revamp. Verdict: **SAVE — keep & harden the backend, evolve the frontend.** Work happens on branch `hireflow-revamp`, shipped as small single-concern patches, each gated by the verify loop below.

## Target product topology
- **Employer:** native **SwiftUI iOS app** + an **employer PWA** (PWA covers Android/desktop until native Android).
- **Candidate:** responsive **mobile-web only**.
- All clients share **one hardened Supabase backend** (schema + 38 edge functions + OpenAI Realtime voice stack).

## Execution order (locked)
`B0 → A0(no-DB) → B1 → A1 → A2 → B2 → B3 → B4 → B5`

Two parallel lanes after B0 + A0's no-DB patches land: a **backend lane** (A0-gate → A1 → A2) and a **frontend lane** (B1 → B3), converging at **B2** (needs B1 done + A2 Patch 4 landed) then **B4**. **B5 (iOS)** is its own lane, starts only once A0/A1/A2 are DONE.

| # | Phase | Track | Effort | Depends on |
|---|-------|-------|--------|-----------|
| 1 | **B0** Safe-refactor + visual-test harness | Foundation | 1.5–2.5d | — |
| 2 | **A0** Schema-drift + lockfile ground truth | Backend (blocker) | 1–1.5d | B0 gate |
| 3 | **B1** Tailwind v4 + OKLCH/P3 color | Experience ⭐ | 4–6d | B0 |
| 4 | **A1** Disable AI auto-reject (legal) | Backend (blocker) | 1.5–2.5d | A0 |
| 5 | **A2** Security & cost hardening | Backend (blocker) | 2.5–4d | A0 |
| 6 | **B2** Employer/candidate app split | Experience | 4–7d | B1, A2·P4 |
| 7 | **B3** Landing redesign + animation | Experience | 1.5–2.5d | B1 |
| 8 | **B4** Mobile-first + employer PWA | Experience | 2–3d | B1, B2 |
| 9 | **B5** SwiftUI iOS employer app | Native | 3–5wk | A0, A1, A2 |

## The verify loop (gates EVERY patch before merge)
1. `npm run typecheck:gate` exits 0 — no NEW tsc errors vs the frozen baseline (count may only shrink). **Baseline = 54 errors today.**
2. `npm test` green (Vitest hook tests) — *added in B0 P2–P4.*
3. `npm run build` exits 0.
4. **Visual:** Claude Preview screenshots at **375×812 (mobile)** + **1440×900 (desktop)**, dark default + light where color changes. Signature assertion: **primary buttons render EMERALD (dark `--primary 160 84% 39%`), never fuchsia.**
5. `preview_console_logs` returns zero error-level entries.

Wired as `npm run verify` (typecheck:gate && test && build) + the manual visual step. **Loop = build → test → polish → fix → retest** per patch. Backend/migration patches test on a Supabase branch first, then push. Regenerate `types.ts` once after each backend phase, in A0→A1→A2 order.

**Semantic guard greps (run in verify):** A1 → zero `rejected_by_type:'ava'` in auto path; A2 → zero `gpt-5.4` defaults; B2 → zero `useJobs|useSubscription|useTeam` under `apps/candidate`; B3 → zero `fuchsia|purple|repeat:Infinity` in `Index.tsx`; B4 → zero `unregister` in `main.tsx`.

## ⚠️ Open decisions needed from owner (do not block B0/B1)
1. **Canonical Supabase project** — `CLAUDE.md`/`config.toml` say `kcotpxlggfvgclwksmhl` (this account can't access it); `.env` says `yqklrkpptnhubsnijqze` (reachable, but 12 demo tables). **Which one does production Vercel actually use?** A1/A2/B5 all hardcode the former; if the answer is the latter, those references must be rewritten. Resolve before A1/A2 migrations run.
2. **Cross-origin session** (B2) — split apps on one origin (shared session) vs two origins (separate logins). Spans B2 + A2 (PKCE) + B5 (native redirect).
3. **ffmpeg.wasm fate** (B4) — `videoCompression.ts` is currently dead code (no importer); decide remove vs server-side compression. Interacts with A2 COOP/COEP.
4. **B5 staffing** — can run concurrently with B1–B4 by a dedicated iOS engineer once A-track is DONE.

---

## Phase patch breakdowns

### B0 — Safe-refactor + visual-test harness `[1.5–2.5d]`
- **P1** Typecheck baseline + gate (zero new deps): `scripts/typecheck-baseline.json` (total=54 + per-file map) + `scripts/typecheck-gate.mjs` + `typecheck`/`typecheck:gate` scripts. ← **FIRST PATCH**
- **P2** Vitest install + minimal config + green smoke test.
- **P3** Shared test harness + mock factories (supabase + useAuth mocks).
- **P4** First real hook tests (`useUnreadMessagesCount`, `useJobs`).
- **P5** `docs/VERIFICATION.md` + first visual baselines for `/` at 375 & 1440.
- **P6** Umbrella `verify` script.
- **P7** (optional) Staged-strict scaffold (`tsconfig.strict.json`).
- **Done:** all verify scripts exist & `npm run verify` exits 0; gate fails on any new tsc error; two hook tests green; `docs/VERIFICATION.md` documents the loop; `/` baselines captured (emerald confirmed); build unchanged.

### A0 — Schema-drift + lockfile ground truth `[1–1.5d]`
- **P1** Commit live-schema dump + `docs/schema-drift-A0.md` (read-only).
- **P2** Lockfile collapse: `git rm bun.lock bun.lockb`, gitignore them, regen `package-lock.json`.
- **P3** Config alignment: `config.toml`, `CLAUDE.md`, `.env.example` to canonical id (gated on decision #1).
- **P4** Apply 73 migrations to canonical + regen `types.ts` (destructive; owner sign-off; P1 dump = rollback).
- **P5** Policy/dashboard lockdown verification.
- **Done:** one lockfile; no `kcotpxlggfvgclwksmhl` refs after reconcile; `list_tables` shows 19 repo tables; no public always-true write policies.

### B1 — Tailwind v4 + OKLCH/P3 color ⭐ `[4–6d]`
- **P1** Toolchain swap only (v4 + @tailwindcss/vite, `@import`, keep HSL via `@config`) — pixel-identical.
- **P2** Theme → CSS `@theme`, delete `tailwind.config.ts` — still HSL, still identical.
- **P3** Faithful HSL→OKLCH (same perceived color, no chroma boost) — near-zero diff.
- **P4** ⭐ Unify primary to one **emerald** + P3 chroma boost (kill blue-in-light) — flagship visual change.
- **P5** Dark elevation / surface-tint ladder.
- **P6** Fluid `clamp()` type scale (remove the 5 `!important` font hacks).
- **P7** v4 default reconciliation (1px ring / `currentColor` borders).
- **P8** Token enforcement: `Index.tsx` + `AppSidebar.tsx`.
- **P9** Token enforcement: remaining 86 files in batches.
- **P10** Cleanup: prune deps, delete `App.css`, re-measure.
- **Done:** `@import "tailwindcss"` + `@theme`; every token `oklch()`; ONE emerald primary both modes; fluid type; visual diffs show only intended change.

### A1 — Disable AI auto-reject (legal) `[1.5–2.5d]`
- **P1** Migration: add `ai_decline_recommended/_reason/_at` columns + type regen.
- **P2** Backend reject-routing in `trigger-ava-analysis`: auto-mode reject → `status:'reviewing'` + `ai_decline_recommended:true`, no `ava` rejection, no candidate reject email.
- **P3** Candidate phase-page decision contract → "under review", never "rejected".
- **P4** Candidate AI-use notice (`AiUseNotice.tsx` + wizard Review step).
- **P5** Employer surfacing: ApplicantDetails banner + Applicants badge/filter + toggle copy.
- **Done:** no `status:'rejected'` + `rejected_by_type:'ava'` from AI; rejection only via human `BulkRejectDialog`; advance/shortlist unchanged; notice visible at 375px+desktop.

### A2 — Security & cost hardening `[2.5–4d]` (12 patches)
- **P1–3** Lock RLS writes to `service_role`: subscriptions/usage, voice_credits, notifications/audit-logs.
- **P4** ⚠️ Private resumes/portfolios/videos buckets + signed URLs (largest; must land before B2 splits the 5 candidate files).
- **P5–6** Ownership checks: `generate-applicant-dossier`, `ai-generate-performance-report` (IDOR).
- **P7–9** AI quota infra + `verify_jwt=true` + per-user quota on 6 AI endpoints; elevenlabs-tts per-IP cap.
- **P10** Replace fake `gpt-5.4`/`gpt-5.4-mini` defaults with real models.
- **P11** DOMPurify in `renderFormattedText` (stored XSS).
- **P12** `flowType: implicit → pkce`.
- **Done:** non-service users can't self-grant; buckets private; IDOR returns 403; AI endpoints quota'd; XSS neutralized; no fake models; PKCE login works.

### B2 — Employer/candidate app split `[4–7d]`
- **P1** Workspace scaffold + empty `@hireflow/data` + `@hireflow/ui`.
- **P2** Extract `@hireflow/data` (supabase client+types).
- **P3** Extract `@hireflow/ui` (kit + tokens + tailwind preset).
- **P4** Candidate app scaffold + slim `CandidateAuthProvider`.
- **P5** Promote `CandidateAppShell`.
- **P6** Move candidate hooks + components (assert no employer-hook leaks).
- **P7** Move candidate phase pages.
- **P8** Candidate-only Dashboard/Messages/Interviews/Documents (no subscription paths).
- **P9** Delete employer redirect hacks + candidate routes from `AppLayout`/`App`.
- **P10** Cross-app handoff + deploy config.
- **Done:** both apps build independently; zero employer-hook imports under `apps/candidate`; shared `@hireflow/data` + `@hireflow/ui`; candidate completes a full assessment in the standalone app.

### B3 — Landing redesign + animation overhaul `[1.5–2.5d]`
- **P1** Token + brand swap (emerald, root `dark`, kill fuchsia/hsl literals, dynamic year).
- **P2** Animation consolidation (import shared lib, reduced-motion, strip 10 infinite loops).
- **P3** `FeatureDetailDialog` brand pass.
- **P4** `ProductShowcase` (device-framed real screenshots, CLS-safe).
- **P5** `Pricing` section.
- **P6** `SocialProof` section.
- **P7** GPU float helper in `animations.ts`.
- **Done:** zero fuchsia/`repeat:Infinity`; emerald CTAs; reduced-motion respected; real screenshots; pricing + social proof; footer = 2026.

### B4 — Mobile-first + employer PWA `[2–3d]`
- **P1** Tap-target fix (32px→44px).
- **P2** PWA scaffold (vite-plugin-pwa + manifest + 192/512 icons).
- **P3** Flip SW registration in `main.tsx` (remove unregister, add registerSW).
- **P4** ffmpeg/coi/Natively reconciliation (decision #3).
- **P5** `BottomTabBar` (3 roles) + main padding.
- **P6** Developer tables → responsive card-list on mobile.
- **P7** Candidate phase-page mobile polish.
- **P8** Lighthouse PWA audit + full visual matrix.
- **Done:** no unregister code; valid manifest+SW; Lighthouse "Installable"; no <44px buttons; bottom tab bar on mobile; no horizontal scroll on dev tables; works in Natively.

### B5 — SwiftUI iOS employer app `[3–5wk]` (architecture)
- **P1** Xcode skeleton + supabase-swift + SupabaseManager.
- **P2** Models from `types.ts` (decode tests).
- **P3** Design system: `Color+P3.swift` (Display-P3 emerald parity).
- **P4** Auth (PKCE email + Google) + role-gated tabs.
- **P5–8** Dashboard / Applicants+detail / Create Job / Messages+realtime.
- **P9** Push (OneSignal) + deep links.
- **P10** Edge-function helpers + visual parity sweep.
- **Done:** employer end-to-end on device against prod backend; server-side RLS isolation proven; Display-P3 emerald parity with web.

---
*Generated from a 10-agent deep-spec workflow against the real codebase, 2026-06-18.*
