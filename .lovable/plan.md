

# Fix Google OAuth Role Assignment Bug

## Root Cause

The bug only affects **Google OAuth signups**, not email/password signups.

**Email/password signup flow (works correctly):**
1. `signUp()` passes `role` in `data` options
2. This goes to `raw_user_meta_data` on the auth.users row
3. The `handle_new_user` trigger reads it: `COALESCE((raw_user_meta_data ->> 'role')::app_role, 'candidate')`
4. Correct role is inserted into `user_roles`

**Google OAuth signup flow (broken):**
1. Before redirect: `signInWithGoogle()` stores `intended_oauth_role` in localStorage (e.g., `"employer"`)
2. Google OAuth completes -- Google **overwrites** `raw_user_meta_data` with its own fields (avatar, name, email). The `role` field is gone.
3. The `handle_new_user` trigger fires, finds no `role` in metadata, defaults to `'candidate'`
4. Back in the app, `onAuthStateChange` reads `intended_oauth_role` from localStorage
5. It checks: `if (!existingRole)` -- but an existing role **does** exist (`candidate`, set by the trigger)
6. The intended role is **never applied**

## Fix

### File 1: `src/hooks/useAuth.tsx` -- Fix OAuth role correction logic

Change the `onAuthStateChange` handler so that when `intendedRole` exists in localStorage, it **updates** the role instead of only inserting when no role exists.

**Current (broken):**
```text
if (!existingRole) {
  await supabase.from("user_roles").insert({ user_id: verifiedUser.id, role: intendedRole });
}
```

**Fixed:**
```text
if (!existingRole) {
  // No role at all -- insert the intended one
  await supabase.from("user_roles").insert({ user_id: verifiedUser.id, role: intendedRole });
} else if (existingRole.role !== intendedRole) {
  // Trigger created wrong default -- update to intended role
  await supabase.from("user_roles")
    .update({ role: intendedRole })
    .eq("user_id", verifiedUser.id);
}
```

This ensures that if the trigger created a `candidate` role but the user signed up from the Employer Portal, the role gets corrected to `employer`.

### File 2: Fix existing mis-assigned user

The user `aeytechnologiesllc@gmail.com` (Google OAuth from Employer Portal) currently has `candidate` role. If they should be a candidate, no change needed. If they were supposed to be an employer, we can fix it manually via a database query after confirming with you.

## Files Changed
1. `src/hooks/useAuth.tsx` -- Update OAuth role correction to use update instead of insert-only-if-missing

## What stays unchanged
- Email/password signup -- already works correctly
- `handle_new_user` trigger -- no changes needed
- Employer subscription logic -- untouched
- Candidate portal -- untouched
- Auth.tsx passes `"employer"`, CandidateAuth.tsx passes `"candidate"`, PublishSignupModal passes `"employer"` -- all correct already

## Expected Result
- Google OAuth from Employer Portal --> `employer` role
- Google OAuth from Candidate Portal --> `candidate` role
- Email signup from either portal --> correct role (already works)
- Existing users remain untouched unless manually corrected

