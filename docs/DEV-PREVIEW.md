# Dev preview (`/__preview`)

A development-only harness for looking at HireFlow's real, signed-in screens
without signing in and without touching the live database. It exists because
an automated reviewer (or anyone else who cannot or should not sign in) still
needs to visually verify UI that only ever renders behind auth.

**This is DEV-only.** It is registered only when `import.meta.env.DEV` is
true, which Vite statically replaces with `false` in a production build — so
the route, the picker UI and every fixture file are dead code the bundler
drops. `scripts/dev_preview_prod_bundle.test.mjs` proves this by actually
running a production build and grepping the output; `npm run guardrails`
proves the source is still gated correctly (faster, but text-only). Neither
`https://hireflownow.com` nor any other production build can ever reach this
code.

## How it works

1. **`src/dev-preview/fixtureClient.ts`** — a generic, offline stand-in for
   the Supabase JS client. It implements the `.from().select().eq()...`
   query-builder chain, `.auth`, `.channel()`, `.storage` and `.rpc()`
   against in-memory tables, instead of the network.
2. **`src/dev-preview/fixtures.ts`** — realistic canned rows for every table
   the app's real hooks read (`jobs`, `applications`, `profiles`,
   `interviews`, `documents`, `messages`, `team_members`,
   `team_invitations`, `user_roles`, `subscriptions`, `notifications`,
   `employer_public_branding`, `published_jobs_public`). One coherent
   scenario: **Maria's Café**, an employer with four jobs, and one candidate
   (**Jordan Alvarez**) with an application parked at every stage of the
   Barista job's journey — so every phase page's first screen, and the one
   "not yet reached" gate state, all have a real application to open.
3. **`src/integrations/supabase/client.ts`** — carries the one production
   dependency-injection seam this harness needs: the `supabase` binding is a
   thin `Proxy` over a swappable backing client. `__setPreviewSupabaseClient()`
   swaps it; it is a no-op outside `DEV`. Nothing else in the app changed —
   every hook and page still just calls `supabase.from(...)`,
   `supabase.auth.getUser()`, etc.
4. **`src/main.tsx`** — before the app renders, a DEV-only check reads
   `?__preview=1` off the URL and, if present, dynamically imports
   `src/dev-preview/install.ts`, which builds the fixture client for whichever
   fixture user `?__previewRole=` names and installs it. This runs before
   `AuthProvider` mounts, so the real, unmodified `AuthProvider` in
   `src/hooks/useAuth.tsx` resolves a real-looking signed-in session against
   fixture data.
5. **`src/dev-preview/DevPreviewPicker.tsx`** (the `/__preview` page itself)
   — a picker: choose a screen, a role, Day/Night theme and a device width,
   and it opens that screen's real route in an iframe with `?__preview=1`
   appended. Because it's a real navigation to a real route, every layout,
   guard and hook along the way runs exactly as it does in production —
   the iframe is just a normal HireFlow tab that happens to be talking to a
   fixture client instead of Supabase.
6. **`src/pages/AvaCreateJob.tsx`** carries one small additional seam: two
   `DEV`-only query params, `?__previewStep=` and `?__previewInputMode=`, set
   that page's initial local state (step / voice-vs-typed) so the picker can
   land directly on the "voice readback" screen instead of requiring a
   click-through. Both default to the page's normal behavior when absent.

## Running it

```bash
npm run dev
# open http://localhost:8080/__preview
```

The picker is self-contained — just click a screen in the left rail. Each
entry also has a direct URL, listed below, if you want to open one directly
(e.g. in a second tab, or resized separately).

Direct URLs are of the form:

```
/<real-route>?__preview=1&__previewRole=<role>&__previewTheme=<light|dark>
```

`<role>` is one of `employer`, `team_member`, `candidate`, `rejected_candidate`.

### Employer cockpit

| Screen | URL |
|---|---|
| Dashboard | `/dashboard?__preview=1&__previewRole=employer` |
| Jobs | `/jobs?__preview=1&__previewRole=employer` |
| Applicants — list | `/applicants?__preview=1&__previewRole=employer` |
| Applicant detail | `/applicants/30000000-0000-4000-8000-000000000008?__preview=1&__previewRole=employer` |
| Interviews | `/interviews?__preview=1&__previewRole=employer` |
| Messages | `/messages?candidate=10000000-0000-4000-8000-000000000003&__preview=1&__previewRole=employer` |
| Documents (all states: pending on you, pending on candidate, signed, declined) | `/documents?__preview=1&__previewRole=employer` |
| Team | `/team?__preview=1&__previewRole=employer` |
| Analytics | `/analytics?__preview=1&__previewRole=employer` |
| Settings | `/settings?__preview=1&__previewRole=employer` |

### Candidate side

| Screen | URL |
|---|---|
| Applications — list | `/applications?__preview=1&__previewRole=candidate` |
| Application detail | `/applications/30000000-0000-4000-8000-000000000008?__preview=1&__previewRole=candidate` |
| Application detail — rejected + coaching card | `/applications/30000000-0000-4000-8000-000000000012?__preview=1&__previewRole=rejected_candidate` |
| My documents | `/my-documents?__preview=1&__previewRole=candidate` |
| Phase gate — "not quite time yet" | `/applications/30000000-0000-4000-8000-000000000001/typing-test/wf-typing?__preview=1&__previewRole=candidate` |

### Candidate phase pages (first screen, already reached)

| Phase | URL |
|---|---|
| Application form | `/applications/30000000-0000-4000-8000-000000000001/application/application?__preview=1&__previewRole=candidate` |
| Quiz | `/applications/30000000-0000-4000-8000-000000000002/quiz/quiz?__preview=1&__previewRole=candidate` |
| Typing test | `/applications/30000000-0000-4000-8000-000000000003/typing-test/wf-typing?__preview=1&__previewRole=candidate` |
| Video intro | `/applications/30000000-0000-4000-8000-000000000004/video-intro/wf-video?__preview=1&__previewRole=candidate` |
| Chat simulation | `/applications/30000000-0000-4000-8000-000000000005/chat-simulation/wf-chatsim?__preview=1&__previewRole=candidate` |
| Chat interview | `/applications/30000000-0000-4000-8000-000000000006/chat-interview/wf-chatint?__preview=1&__previewRole=candidate` |
| Sales simulation | `/applications/30000000-0000-4000-8000-000000000007/sales-simulation/wf-sales?__preview=1&__previewRole=candidate` |
| Voice interview | `/applications/30000000-0000-4000-8000-000000000008/voice-interview/wf-voice?__preview=1&__previewRole=candidate` |
| Portfolio upload | `/applications/30000000-0000-4000-8000-000000000009/portfolio/wf-portfolio?__preview=1&__previewRole=candidate` |

### Create job

| Screen | URL |
|---|---|
| Typed | `/jobs/create?__previewInputMode=form&__previewStep=0&__preview=1&__previewRole=employer` |
| Voice readback (follow-up questions) | `/jobs/create?__previewInputMode=voice&__previewStep=1&__preview=1&__previewRole=employer` |

All of the above (plus the full picker with theme/width controls) are also
just one click away from `/__preview` itself — `src/dev-preview/screens.ts`
is the single source of truth for this list; if it and this table ever
disagree, trust the code.

## What it is not

- Not a mock of PostgREST — the fixture query builder is generic
  (`.eq`/`.in`/`.order`/`.limit`/`.single`/`.maybeSingle`, plus best-effort
  `.insert`/`.update`/`.upsert`/`.delete` that mutate the in-memory tables for
  that tab's session only) and ignores `select("...")` column lists — it
  always returns full fixture rows, with relations like `jobs(*)` pre-baked
  onto the row rather than parsed from the select string.
- Not a replacement for `npm run dev` against the real backend, or for
  actually signing in — it is for the one thing sign-in is unavailable for:
  a quick, faithful look at a signed-in screen.
- Not reachable in production, ever — see "This is DEV-only" above.

## Tests

- `scripts/guards/dev-preview-dev-only.mjs` — fast, source-level guard that
  the route, the `main.tsx` bootstrap, and the `client.ts` seam are all still
  gated behind `import.meta.env.DEV`.
- `scripts/dev_preview_prod_bundle.test.mjs` — slow, definitive: actually
  runs `vite build` and greps the output for every dev-preview marker and
  fixture-only string, proving the harness is absent from what ships.
- `scripts/dev_preview_smoke.test.mjs` — runs `vite dev` on port `5390` and
  does a headless fetch of the dev-preview files' module graph (and the real
  page component behind every screen above), breadth-first through
  first-party (`src/**`) imports, asserting every module transforms
  cleanly — catches a broken import or syntax error without a browser.
