# Handoff — Functional Buttons & Mobile Optimization

> For the next agent. Two workstreams: (A) make every button do the right thing, (B) optimize for mobile. Read this fully before editing.

## Project quick-facts
- Stack: React 18 + Vite + TS + Tailwind + shadcn/ui + framer-motion + three.js; Supabase backend.
- Marketing landing: `src/pages/Index.tsx` + `src/components/landing/*`. Dark surface + **emerald** accent; **brass `#e6c184` reserved for "win/top/hired"** only.
- Routes live in `src/App.tsx` (see route table there).
- Preview: `mcp__Claude_Preview__preview_start` (name `hireflow`, port ~8090). Live deploy: `https://hireflow-preview.vercel.app` (separate Vercel project; build in `hireflow1`, then `rsync dist/ → /tmp/hireflow-preview`, then `cd /tmp/hireflow-preview && npx --no-install vercel deploy --prod --yes`).
- Typecheck baseline = **43 errors** (`npx tsc -p tsconfig.app.json --noEmit | grep -c "error TS"`). Do not exceed it.
- ⚠️ **The preview pauses `requestAnimationFrame`** → three.js canvases render blank and framer/count-up animations freeze in screenshots. Verify animation/3D via DOM checks + the live deploy on a real device, NOT preview screenshots. (See `memory: hireflow-preview-raf-limit`.)

## 🚫 HARD RULES (do not break)
1. **No generic/AI/celebration icons anywhere** — no Sparkles/Star/Wand/Bot/Brain/Cpu, and no Trophy/Rocket/PartyPopper/Confetti/Medal/Award/Lightbulb/Heart/Zap. The only "Ava/AI" mark is `<AvaGlyph/>` (`src/components/AvaGlyph.tsx`). Functional UI icons in use that are OK: `Check`, `ArrowRight`. For new controls prefer text or bespoke SVG. (Internal app still has ~18 violations — separate task, see `memory: hireflow-no-generic-icons`.)
2. Keep the brass discipline: `#e6c184` only on win/top/hired surfaces.
3. Match existing visual language (premium bar). Don't introduce generic component-library defaults.

---

## A. FUNCTIONAL BUTTONS

### A1. Landing buttons — current state (`src/pages/Index.tsx`)
These already route via React Router `Link` and SHOULD work — **verify each navigates and the target page loads**, not just that it renders:

| Button / link | Goes to | Route exists? |
|---|---|---|
| Nav "Sign In" / "Get Started" | `/auth` | ✅ `Auth` |
| Nav "Looking for work?" / footer "Candidate Portal" | `/candidate` | ✅ `CandidatePortalLanding` |
| Hero "Create a job with Ava" | `/try-job-creator` | ✅ `GuestJobCreator` |
| Hero "See how it works" | scrolls to `#how` (in-page) | ✅ fixed — `onClick` → `scrollIntoView` |
| "I want to: Hire talent" | `/auth` | ✅ |
| "I want to: Find a job" | `/candidate` | ✅ |
| Feature cards | open `FeatureDetailDialog` (`onClick={() => setSelectedFeature(...)}`) | ✅ |
| Final CTA "Get started free" | `/auth` | ✅ |
| Footer Privacy / Terms | `/privacy`, `/terms` | ✅ |

**Verify:** click each on desktop + mobile widths; confirm no dead clicks, correct destination, auth redirects behave (logged-in users get bounced to `/dashboard` or `/applications` — see `Index.tsx` ~line 166).

### A2. DO NOT touch — intentionally decorative
The demo's buttons are **staged animation, not interactive**: `SceneReview` "Advance to interview" and the 6 `SceneSchedule` slot buttons in `src/components/landing/AvaDemo.tsx`. They have `tabIndex={-1}`, no `onClick`, and live inside an `aria-hidden` stage **on purpose**. Leave them decorative.

### A3. App-wide button audit (the likely real ask)
Sweep the internal app for buttons that render but don't act. Method:
1. `grep -rnE "<button|<Button" src/ --include=*.tsx` and flag any without an `onClick`/`type="submit"`/`asChild` Link, or with `onClick={() => {}}` / `// TODO`.
2. Common suspects: dashboard quick-actions, empty-state CTAs, dialog confirm/cancel, settings, bulk-action bars.
3. For each dead button: wire to the correct route (table in `src/App.tsx`) or handler; if the backing feature doesn't exist yet, disable it with a tooltip rather than leaving a silent no-op.
4. **Auth/desctructive actions**: confirm they hit the real Supabase calls; don't fake success.

---

## B. MOBILE OPTIMIZATION

### B1. Already done (landing) — don't redo
- Hero trust badges wrap at ≤375px (`flex-wrap gap-x-6 gap-y-3 sm:gap-8`).
- Demo 6-step stepper fits mobile (`gap-1 px-3 sm:gap-2 sm:px-5`, `text-[9px] sm:text-[10px]`).
- Reduced-motion respected app-wide on the landing (`MotionConfig reducedMotion="user"` + canvas/count-up gates).
- WebGL contexts at initial load reduced 4→3 (CTA `AvaUniverse` is defer-mounted via `MountWhenNear`).
- Demo auto-advance pauses off-screen; `webglcontextlost` handlers on all 3 canvases.

### B2. Still to do — priority order
1. **Real-device pass (375 / 390 / 414 / tablet).** Use `preview_resize` for layout, but confirm motion on the deployed link on an actual phone.
2. **WebGL on low-end phones.** Landing still creates up to 3–4 live contexts (`AvaUniverse` hero, `DemoParticles`, `AvaOrb` features, deferred CTA). Consider: on `matchMedia('(pointer: coarse)')` or low `navigator.deviceMemory`, swap the small features-header `AvaOrb` and/or CTA for a static poster (CSS gradient/SVG). Files: `src/components/AvaOrb.tsx`, `src/components/landing/AvaUniverse.tsx`, `src/pages/Index.tsx`. Cap `setPixelRatio` is already `min(dpr,2)` — keep.
3. **Touch targets** ≥44px on nav links, footer links, "I want to" buttons. Audit small `text-sm` links.
4. **Demo card height on small screens.** `AvaDemo.tsx` scene stage is a hard `height: 372` with `overflow-hidden` on the card — content that grows will clip silently. Current copy fits; if you add lines, switch intrinsic scenes (`SceneScreen`, `SceneShortlist`, `SceneCreate`) to `h-full flex flex-col justify-center` like the brass scenes, or make the stage `min-h`.
4. **The whole internal app** (dashboards, dialogs, tables) was NOT in the landing review — audit it for horizontal overflow, fixed widths, tiny tap targets, and tables that don't reflow. Use the `use-mobile` hook already in `src/hooks/`.
5. **Safe-area insets** — `AppSidebar.tsx` already uses `env(safe-area-inset-bottom)`; check other fixed/sticky bars (`MessageComposer`, modals).

### B3. Accessibility carried over (still open)
- **WCAG 2.2.2**: the auto-playing demo has no visible Pause/Play. Reduced-motion freeze covers motion-sensitive users; a persistent toggle is still missing. If adding one, use text or geometric shapes (NO lucide pause icon per the hard rule) and wire it to the `playing` state in `AvaDemo.tsx`.

---

## Verify before you ship
1. `npx tsc -p tsconfig.app.json --noEmit | grep -c "error TS"` → must stay **≤ 43**.
2. `npm run build` → must pass.
3. DOM sanity in preview (no `ErrorBoundary` "Try again", expected elements present).
4. Deploy to `hireflow-preview.vercel.app` and check on a real phone (preview can't show 3D/animation).

## Reference
- Review that produced this work: 18 confirmed findings across correctness/perf/brand/responsive/a11y/build (landing scope). Most are fixed; the open items are listed above.
- Memory files: `hireflow-no-generic-icons`, `hireflow-preview-raf-limit`, `hireflow-design-prefs`, `hireflow-deep-jade-system`.
