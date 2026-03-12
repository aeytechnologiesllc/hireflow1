

## Plan: Tighten Auth Page for Mobile / Natively

### Changes — `src/pages/Auth.tsx`

1. **Hide "Sign in to manage your hiring" subtitle on mobile** (line 651-653)
   - Add `hidden sm:block` to the `<p>` tag so only the "Welcome back" heading shows on mobile

2. **Hide "or continue with email" divider on mobile** (lines 446-453)
   - Add `hidden sm:block` to the divider wrapper so the Google button flows directly into the tabs/form on mobile

3. **Hide "Create your account" subtitle on mobile** (sign-up view)
   - Same treatment for the sign-up subtitle paragraph

4. **Tighten spacing on mobile**
   - Reduce Google button bottom margin from `mb-6` to `mb-3 sm:mb-6`
   - Reduce form section heading `mb-6` to `mb-3 sm:mb-6` on sign-in and sign-up views

### Files
- `src/pages/Auth.tsx` — responsive class additions only, no logic changes

