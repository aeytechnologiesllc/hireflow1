

# Move OAuth Role Assignment to Backend

## Problem
Google OAuth overwrites `raw_user_meta_data`, so the `handle_new_user` trigger defaults new users to `candidate`. The current fix uses `localStorage` + `onAuthStateChange` to correct this on the frontend, which is fragile and race-condition-prone.

## Solution
Move role assignment entirely to the backend using a secure RPC function. Remove all frontend role correction logic.

## Changes

### 1. Database Migration -- Create `assign_user_role` RPC + Update trigger

**Create a new `assign_user_role` function:**
- Accepts a `p_role` text parameter
- Uses `auth.uid()` to identify the caller
- Only inserts a role if no role exists yet (never overwrites)
- Validates input: only `'employer'` is accepted explicitly; everything else defaults to `'candidate'`
- Marked `SECURITY DEFINER` so it bypasses RLS

**Modify `handle_new_user` trigger:**
- Remove the `INSERT INTO user_roles` line
- Keep only the `INSERT INTO profiles` line
- For email/password signups, role will still come through via the new `/auth/callback` route calling the RPC (the `role` metadata is passed in the redirect URL)

### 2. New page: `src/pages/AuthCallback.tsx`

A lightweight callback page mounted at `/auth/callback` that:
1. Waits for the session to be established
2. Reads `role` from URL query params (`?role=employer` or `?role=candidate`)
3. Calls `supabase.rpc('assign_user_role', { p_role: role })` to assign the role on the backend
4. Navigates to the appropriate dashboard (`/dashboard` for employers, `/apply` for candidates)

### 3. Update `src/App.tsx` -- Add callback route

Add: `<Route path="/auth/callback" element={<AuthCallback />} />`

### 4. Update `src/hooks/useAuth.tsx` -- Remove localStorage logic

**`signInWithGoogle` function:**
- Remove `localStorage.setItem("intended_oauth_role", ...)`
- Change `redirectTo` to include the role as a URL parameter: `/auth/callback?role=employer` or `/auth/callback?role=candidate`

**`onAuthStateChange` handler:**
- Remove the entire `intended_oauth_role` localStorage block (lines 61-83)
- Keep `fetchUserRole()` and `checkTeamMembership()` calls

### 5. Update `src/pages/Auth.tsx` -- Update Google redirect

Change `handleGoogleSignIn` to pass redirect URL as `/auth/callback?role=employer` instead of `/dashboard`.

### 6. Update `src/pages/CandidateAuth.tsx` -- Update Google redirect

Change `handleGoogleSignIn` to pass redirect URL as `/auth/callback?role=candidate` instead of `/apply`.

## Technical Details

**New RPC function SQL:**
```text
create or replace function public.assign_user_role(p_role text)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not exists (
    select 1 from user_roles where user_id = auth.uid()
  ) then
    insert into user_roles (user_id, role)
    values (
      auth.uid(),
      case when p_role = 'employer' then 'employer'::app_role
           else 'candidate'::app_role
      end
    );
  end if;
end;
$$;
```

**Updated trigger (role assignment removed):**
```text
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  );
  RETURN NEW;
END;
$$;
```

**Note on email/password signups:** These still pass `role` in `raw_user_meta_data`. Since the trigger no longer reads it, the `/auth/callback` route handles role assignment for all signup methods. The `signUp` function's `emailRedirectTo` will also be updated to point to `/auth/callback?role=<role>`.

## Files Changed
1. Database migration -- `assign_user_role` RPC + updated `handle_new_user` trigger
2. `src/pages/AuthCallback.tsx` -- New callback page
3. `src/App.tsx` -- Add `/auth/callback` route
4. `src/hooks/useAuth.tsx` -- Remove localStorage logic, update redirects
5. `src/pages/Auth.tsx` -- Update Google OAuth redirect URL
6. `src/pages/CandidateAuth.tsx` -- Update Google OAuth redirect URL

## What stays unchanged
- Existing users' roles are never modified
- Email/password signup continues to work (role passed via redirect URL)
- Subscription logic untouched
- Team member join flow untouched (no role passed, defaults to candidate)

## Expected Result
- Employer Portal + new Google user --> role = `employer` (immediately, no race condition)
- Candidate Portal + new Google user --> role = `candidate` (immediately)
- Existing users --> no change
- No localStorage dependency
- No frontend role correction
- Backend authoritative
