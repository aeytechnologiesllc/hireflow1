

## Plan: Mobile Performance Optimization + Auto-Version Bumping

### Problem
On iPhone 15 Pro Max, the app feels laggy due to:
1. **All 46 pages loaded eagerly** — massive initial JS bundle parsed on every load
2. **Continuous Framer Motion animations** running even when not visible (FloatingParticles, GradientOrbs, MiniAva blink timer)
3. **`backdrop-blur`** on AppHeader and sidebar overlays — notoriously GPU-expensive on iOS Safari
4. **Large gradient blur orbs** (`blur-[100px]`/`blur-[150px]`) in AppLayout — constant GPU compositing cost

### Solution — 4 targeted changes, no visual/functional regressions

---

#### 1. Re-introduce React.lazy for non-critical routes
Keep the 5 most-used pages eager (Dashboard, Jobs, Applicants, Messages, Documents). Lazy-load the remaining ~40 pages. This cuts initial JS parse time significantly on mobile.

**File:** `src/App.tsx`
- Keep eager: Dashboard, Jobs, Applicants, ApplicantDetails, Messages, Documents, Auth, Index
- Wrap the rest with `React.lazy()` + a minimal `<Suspense>` fallback (not the heavy AuthLoadingScreen — just a simple div)

#### 2. Skip decorative animations on mobile
Disable FloatingParticles and GradientOrbs when on mobile. The gradient blur orbs in AppLayout already provide ambient background. The particles add GPU load with no functional value on a phone.

**File:** `src/components/animations/AuthLoadingScreen.tsx`
- Import `useIsMobile`, skip rendering FloatingParticles/GradientOrbs on mobile (keep the StaggeredBarsLoader)

**File:** `src/components/AppLayout.tsx` (both employer and candidate layouts)
- Remove `backdrop-blur-sm` from the mobile sidebar overlay (keep `bg-black/60` — the opacity alone is sufficient)
- The gradient orbs are already `200px`/`150px` on mobile which is fine, but reduce blur from `blur-[100px]` to `blur-[60px]` on mobile for lower GPU cost

**File:** `src/components/AppHeader.tsx`
- Change `backdrop-blur-sm` to `backdrop-blur-[2px]` — lighter blur, still looks frosted, much cheaper

#### 3. Throttle MiniAva idle animations
The blink timer runs a `setTimeout` loop every 8-12s even when the orb is off-screen. On mobile, we can increase the interval and skip the shadow blur div.

**File:** `src/components/MiniAva/MiniAvaContainer.tsx`
- Remove the decorative blur shadow div beneath the orb on mobile (the `blur-xl` div)

**File:** `src/components/MiniAva/MiniAva.tsx`
- Increase blink interval from 8-12s to 15-25s on mobile (less frequent re-renders)

#### 4. Auto-version system
The version is already read from `package.json` and displayed in the sidebar. Create a simple `src/lib/appVersion.ts` that exports the version, and bump the patch version in `package.json` with this change. For ongoing changes, the version in `package.json` will be incremented with each update.

**File:** `package.json` — bump version from `1.0.0` to `1.1.0`

---

### Files Modified
- `src/App.tsx` — lazy-load non-critical routes
- `src/components/animations/AuthLoadingScreen.tsx` — skip particles on mobile
- `src/components/AppLayout.tsx` — lighter blur on mobile
- `src/components/AppHeader.tsx` — reduce backdrop-blur intensity
- `src/components/MiniAva/MiniAvaContainer.tsx` — remove shadow blur on mobile
- `src/components/MiniAva/MiniAva.tsx` — slower blink interval on mobile
- `package.json` — bump to v1.1.0

### What stays unchanged
- All UI appearance (changes are invisible or near-invisible)
- All functionality, routing, auth flow
- Desktop experience (optimizations target mobile only where possible)
- Sidebar version display (already reads from package.json)

