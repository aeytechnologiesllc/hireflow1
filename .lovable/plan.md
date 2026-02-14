

# Role-Based Subscription Gating

## Summary
Candidates are incorrectly blocked by subscription/trial logic meant only for employers. This fix ensures candidates always have free access, employers follow the trial/subscription model, and team members depend on their employer's subscription.

## Changes

### 1. `supabase/functions/get-subscription/index.ts` -- Role check for candidates

Add a role lookup at the top of the function. If the user is a candidate, return a static "active" response immediately -- no trial record creation, no usage queries, no voice credit provisioning.

```text
// After authenticating the user, before any subscription logic:
const { data: roleData } = await supabaseAdmin
  .from('user_roles')
  .select('role')
  .eq('user_id', user.id)
  .single();

if (roleData?.role === 'candidate') {
  // Return free unlimited access -- skip ALL employer logic
  return Response with:
    subscription: { status: 'active', plan_type: 'candidate_free', onboarding_completed: true }
    usage: all zeros
    limits: all unlimited (-1)
    voiceCredits: { totalMinutesAvailable: 0, credits: [] }
}
```

This prevents trial records from ever being created for candidates.

### 2. `src/components/AppLayout.tsx` -- Bypass subscription gates for candidates

After the auth loading check and developer redirect, add a candidate bypass **before** any subscription-related checks:

```text
// After: if (loading) return <AuthLoadingScreen />
// After: developer redirect logic

// NEW: Candidates bypass ALL subscription logic
if (role === 'candidate') {
  // Check candidate-specific onboarding (via profile, not subscription)
  // Then render normal layout directly
  return <TooltipProvider>...<Outlet />...</TooltipProvider>
}

// Only employers/team reach these checks:
if (subLoading) return loading screen
if (isSyncingSubscription) return sync screen
if (hookNeedsOnboarding) return OnboardingWizard (employer only)
if (isExpired) return TrialExpiredOverlay
```

For candidate onboarding, we check a profile field (`onboarding_completed`) instead of the subscription table, so it works independently.

### 3. `src/components/AppLayout.tsx` -- Candidate onboarding via profile

Since candidates no longer go through subscription logic, their onboarding wizard needs its own trigger. We'll use a simple profile query to check if onboarding is completed:

```text
// For candidates only:
const [candidateNeedsOnboarding, setCandidateNeedsOnboarding] = useState(false);

useEffect(() => {
  if (role === 'candidate' && user) {
    // Check profiles table for onboarding status
    supabase.from('profiles').select('onboarding_completed')
      .eq('user_id', user.id).single()
      .then(({ data }) => {
        if (data && !data.onboarding_completed) setCandidateNeedsOnboarding(true);
      });
  }
}, [role, user]);
```

If `candidateNeedsOnboarding` is true, show `CandidateOnboardingWizard`. On completion, update profiles table and dismiss the wizard.

### 4. `src/pages/TeamPortal.tsx` -- Check employer subscription

Add employer subscription validation to the Team Portal. After fetching the team membership, check if the employer's subscription is active:

```text
// After fetching memberData with employer_id:
const { data: employerSub } = await supabase
  .from('subscriptions')
  .select('status, plan_type')
  .eq('user_id', memberData.employer_id)
  .maybeSingle();

if (!employerSub || employerSub.status === 'expired') {
  setEmployerExpired(true);  // New state variable
  return;
}
```

When `employerExpired` is true, render a clean blocked screen:
> "Your employer's subscription has expired. Please contact your account administrator."

Team members never see billing UI -- just this informational message.

### 5. Database: Add `onboarding_completed` to profiles (if not exists)

A migration to add the column to the profiles table so candidate onboarding works independently of the subscriptions table:

```sql
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;
```

## Files Changed
1. `supabase/functions/get-subscription/index.ts` -- Add candidate role check, return free access
2. `src/components/AppLayout.tsx` -- Candidate bypass before subscription gates, independent onboarding
3. `src/pages/TeamPortal.tsx` -- Employer subscription check, expired screen
4. Database migration -- Add `onboarding_completed` to profiles

## Expected Result
- **Candidates**: Always free access. Never see trial/subscription screens. Onboarding works via profile flag.
- **Employers**: Trial and subscription enforced as before. No changes to billing logic.
- **Team members**: Access depends on employer subscription. Clean "expired" message if employer lapses.
- **No cross-role leakage**: Candidates never get trial records. Team members never see billing UI.
