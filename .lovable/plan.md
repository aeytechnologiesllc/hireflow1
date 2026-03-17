
Fix the onboarding CTA so it behaves like a guided handoff into job creation instead of just dismissing onboarding.

What’s broken
- In `src/components/subscription/OnboardingWizard.tsx`, clicking “Generate Workflow” only calls `completeOnboarding.mutateAsync()` and then `onComplete()`.
- In `src/components/AppLayout.tsx`, `onComplete` is wired to `completeOnboarding.mutate()` again, so onboarding is effectively completed twice and the app simply falls back to the current route, which is why users land on `/dashboard`.
- The selected role (for example, “Software Engineer”) lives only in `jobRole` local state and is never passed into the job creation page.
- There is minimal visible feedback before the pending state kicks in, so users click multiple times.

Implementation plan

1. Fix the flow ownership
- Move the post-onboarding navigation responsibility into the onboarding completion path.
- Update `OnboardingWizard` so “Generate Workflow”:
  - immediately enters a local submitting/loading state,
  - persists the selected role for the next screen,
  - completes onboarding once,
  - navigates to `/jobs/create`.

2. Pass the selected role into job creation
- Use a lightweight handoff mechanism that fits the current app:
  - either query params like `/jobs/create?title=Software%20Engineer&from=onboarding`
  - or navigation state/localStorage as fallback.
- Preferred approach: query param for the title, because it is simple, shareable, and avoids hidden state.

3. Pre-fill Create Job cleanly
- In `src/pages/CreateJob.tsx`, add a small initialization effect that reads the onboarding handoff value only when:
  - not in edit mode,
  - no guest job draft is being restored,
  - the title is still empty.
- Pre-fill only the job title field so the employer lands on Step 1 with the selected role already typed in, ready to continue filling the rest.

4. Keep users on the first step, not the dashboard
- After onboarding, route straight to `/jobs/create`.
- Do not auto-generate the full workflow yet unless explicitly intended; based on your description, the correct behavior is:
  - take them to Create Job,
  - prefill the chosen title,
  - let them complete the rest.

5. Improve feedback on button press
- Add an immediate local loading state in `OnboardingWizard` so the CTA changes as soon as it’s clicked, even before the mutation finishes.
- Visually disable repeated clicks right away.
- Optionally tweak the button copy from “Setting up...” to something clearer like “Opening job creator...” or “Preparing your job...”.

Files to update
- `src/components/subscription/OnboardingWizard.tsx`
  - add navigation
  - add immediate loading state
  - persist/pass selected role
  - avoid relying solely on parent callback for completion
- `src/components/AppLayout.tsx`
  - simplify onboarding completion wiring so it does not trigger a second completion mutation
- `src/pages/CreateJob.tsx`
  - read onboarding title handoff
  - prefill title on first load only

Technical notes
- Best route shape: `/jobs/create?title=Software%20Engineer&source=onboarding`
- Guard precedence in `CreateJob.tsx` should be:
  1. edit mode existing job
  2. guest restored draft
  3. onboarding prefill
- The onboarding CTA should set loading immediately in component state, not only depend on `completeOnboarding.isPending`, to remove the “I clicked but nothing happened” feel.

Expected result
- User types/selects “Software Engineer”
- Clicks “Generate Workflow”
- Button immediately shows loading and blocks repeat clicks
- User is taken to `/jobs/create`
- Step 1 opens with “Software Engineer” already filled in the title field
- They continue creating the job from there instead of being dumped back on the dashboard
