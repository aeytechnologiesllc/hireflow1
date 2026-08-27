-- Account-enumeration oracle, second door.
--
-- The check-email-exists EDGE FUNCTION was retired, but the same capability
-- remained reachable as a SECURITY DEFINER RPC granted to `anon`:
--   curl -X POST .../rest/v1/rpc/email_exists -H "apikey: <publishable>" \
--        -d '{"p_email":"someone@example.com"}'   ->  true
-- With only the public key (which ships in the browser bundle) anyone could test a
-- list of addresses and learn who holds a HireFlow account. It reads auth.users
-- directly, so it is authoritative.
--
-- Safe to revoke: the sole caller (src/pages/Auth.tsx checkEmailExists) already
-- treats any error as "unknown" and falls back to Supabase's vague
-- "Invalid login credentials".
revoke execute on function public.email_exists(text) from anon, authenticated, public;

comment on function public.email_exists(text) is
  'REVOKED from anon/authenticated 2026-08-26: account-enumeration oracle. Do not re-grant. '
  'Auth UIs must never disclose whether an address has an account.';
