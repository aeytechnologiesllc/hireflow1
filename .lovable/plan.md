

## Fix: Email Signups Not Getting Role Assigned

### Root Cause
When the `handle_new_user` trigger was refactored (migration `20260214`), role assignment was removed from the trigger and moved to the `assign_user_role` RPC. However, that RPC is **only called in `AuthCallback.tsx`** (OAuth/Google flow). Email signups in `Auth.tsx` and `CandidateAuth.tsx` never call it, so new users end up with **no role** in the `user_roles` table.

### Fix
Call `assign_user_role` RPC immediately after a successful email signup in both auth pages:

**`src/pages/Auth.tsx`** — After successful `signUp()` call (around line 228), add:
```typescript
await supabase.rpc("assign_user_role", { p_role: "employer" });
```

**`src/pages/CandidateAuth.tsx`** — After successful `signUp()` call (around line 198), add:
```typescript
await supabase.rpc("assign_user_role", { p_role: "candidate" });
```

This ensures every email signup from the Natively app (which always goes to `/auth`) gets the employer role, and candidate portal signups get the candidate role. Existing accounts with roles already assigned are unaffected because `assign_user_role` has a guard (`if not exists`).

### Files
- `src/pages/Auth.tsx` — add RPC call after signup
- `src/pages/CandidateAuth.tsx` — add RPC call after signup

