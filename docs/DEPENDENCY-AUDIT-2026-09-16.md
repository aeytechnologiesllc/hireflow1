# Dependency audit — 2026-09-16

## Before -> after

| | before | after |
|---|---|---|
| `npm audit --omit=dev` total | 39 (1 low, 29 moderate, 9 high) | 26 (0 low, 26 moderate, 0 high) |
| `npm audit` (incl. devDependencies) total | ~48 (varies with resolution) | 29 (27 moderate, 2 high) |

All **low** and **high** severity findings in the production dependency graph are
resolved. The 26 remaining production-graph advisories are two dependency
chains that only have breaking-change fixes (see below). Two additional
**high** advisories exist only in the dev toolchain (rollup, esbuild — both
build-time only, never shipped to the browser).

## What changed

- `npm audit fix` (no `--force`): bumped transitive `nanoid`, `picomatch`,
  `postcss`, `postcss-selector-parser`, `ws`, `yaml`, `glob`/`minimatch`,
  `brace-expansion`, `lodash`, `markdown-it`, `linkify-it`, `fflate` to patched
  versions, and `vite` 5.4.19 -> 5.4.21 (patch). No `package.json` range
  changed for any of these — all resolved within existing semver.
- Added `"overrides": { "rollup": "4.24.0" }` to `package.json`. Explanation
  below — this **pins back** a transitive dependency rather than advancing it.
- Did **not** apply `npm audit fix --force` (would jump `@tiptap/*` 2.x -> 3.x
  and `react-router`/`react-router-dom` 6.x -> 7.x, both major/breaking).
- Did **not** bump `@supabase/supabase-js` 2.87.1 -> 2.116.0. It resolves
  within the existing `^2.87.1` range and `npm audit` reports no advisory
  against either version, but bumping it regressed
  `npm run typecheck:ratchet` from 191 -> 198 errors (the generated
  `Database` type's overload resolution changed enough to produce new
  `tsc` errors in `src/cockpit/data/showcaseSource.ts`, a file already known
  to reference a nonexistent `roles`/`candidates` schema — see
  `docs/ARCHITECTURE.md` and the ratchet file's own comment). Since the
  ratchet must never rise and this wasn't a vulnerability fix, it was reverted.
  `dompurify` and `react` are already at the latest version compatible with
  their declared ranges, so there was nothing to bump for either.

## Why `rollup` is pinned instead of upgraded (important)

`rollup` (a transitive dependency of `vite`, dev-only, never shipped) has a
real advisory: **GHSA-mw96-cpmx-2vgc** (Arbitrary File Write via Path
Traversal), fixed in `rollup@4.59.0+`; the installed baseline was `4.24.0`
(vulnerable) and plain `npm audit fix` advances it to whatever `vite` resolves
(observed: `4.63.3`).

Testing every candidate found that **any** patched rollup (`4.59.0` through
the current `4.63.3`) breaks
`scripts/dev_preview_prod_bundle.test.mjs`: the dead-code-elimination change
in that rollup release line stops fully stripping the dev-only
`__setPreviewSupabaseClient` export (`src/integrations/supabase/client.ts`,
guarded by `scripts/guards/dev-preview-dev-only.mjs` and documented in
`docs/DEV-PREVIEW.md`) out of the production bundle — the literal string
`__setPreviewSupabaseClient` shows up in `dist/assets/index-*.js` even though
every other dev-preview identifier is correctly eliminated. That guard exists
specifically to keep the `/__preview` fixture harness from ever becoming
reachable or fingerprint-able in the shipped app, which is exactly the kind of
live-safety regression this task is not allowed to introduce.

Given the choice between (a) a build-tool-only, not-network-reachable path
traversal advisory in a devDependency, and (b) leaking a dev-only identifier
string into the production bundle, (a) is deferred. `rollup` stays pinned at
`4.24.0` via `overrides` until either rollup restores the previous
elimination behavior in a later 4.x/5.x release, or someone changes the
`import.meta.env.DEV` gating in `client.ts` so the export is provably dead
regardless of rollup's tree-shake heuristics (out of scope for a dependency
audit — it touches the auth bootstrap path).

Re-run `node scripts/dev_preview_prod_bundle.test.mjs` after ever touching
this override.

## Remaining advisories, with reason

| Package(s) | Severity | Fix available | Reason deferred |
|---|---|---|---|
| `@tiptap/core` + all `@tiptap/extension-*`, `@tiptap/react`, `@tiptap/starter-kit` | moderate | `@tiptap/core@3.31.3` (major, 2.x -> 3.x) | No 2.x patch exists (GHSA-cp6q-959q-f8rh affects the whole 2.x line up to `<=3.0.0-next.8` and `3.22.4-3.30.3`). Tiptap 2->3 is a breaking API migration across every editor extension the app uses (`src/components/**` rich-text editing) — not a safe drop-in for a deps-only pass. |
| `react-router`, `react-router-dom` | moderate | `react-router-dom@7.18.4` (major, 6.x -> 7.x) | No 6.x patch exists; the latest 6.x (`6.30.6`, already installed) is still in the vulnerable range. React Router 6->7 changes the router API surface used throughout `src/App.tsx` and every page. Deferred to its own migration task. |
| `rollup` (dev only) | high | `rollup@4.59.0+` | See "Why `rollup` is pinned" above — breaks the dev-preview production-leak guard. Not reachable at runtime (build-time tool only). |
| `esbuild` (dev only, via vite's bundled dependency) | moderate | via `vite@8.x` (major) | Dev-server-only vulnerability (arbitrary requests to the local dev server); the app is served from a static Vercel build, dev server is never exposed. Upgrading means a major Vite jump, out of scope here. |

## Direct dependency versions considered for a minor/patch bump

Per `npm outdated`, checked as requested:

- `@supabase/supabase-js` — newer minor (`2.116.0`) available, **not applied**
  (see above; broke the typecheck ratchet).
- `dompurify` — already at latest (`3.4.15`); nothing to do.
- `react` / `react-dom` — already at the latest version inside `^18.3.1`
  (`18.3.1`); latest overall is `19.x`, a major bump, out of scope.
- `vite` — already at the latest version inside `^5.4.19` (`5.4.21`, applied
  via `npm audit fix`); latest overall is `8.x`, a major bump.

## Verification performed

- `npm run build` — production build succeeds.
- `npm run typecheck:ratchet` — holds at baseline (191 errors, unchanged).
- `node scripts/guardrails.mjs` — all 178 guards pass.
- Every `scripts/*.test.mjs` and `scripts/*pglite*.mjs` — all pass, including
  `scripts/dev_preview_prod_bundle.test.mjs` (the guard this audit almost
  broke).
- `npm ci` from the resulting lockfile reproduces the same audit counts
  deterministically.
- `npx vite preview --port 4173` smoke test: `/`, `/jobs`, `/login`,
  `/privacy`, `/terms` all return `200` and serve the app shell.
- No `supabase/functions/**` files were touched, so `deno check` was not
  required for this change.
