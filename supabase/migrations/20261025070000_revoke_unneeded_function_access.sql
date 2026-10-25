-- Signed-out visitors can call only the database functions a signed-out
-- page needs (2026-10-25; docs/LAUNCH-PLAN.md, Phase 1, task 7).
--
-- The Supabase advisor listed 24 SECURITY DEFINER functions any visitor
-- could call through /rest/v1/rpc. None of them leaked anything (each checks
-- its caller, 2026-10-24 audit), but nothing a visitor has no use for
-- should be reachable at all.
--
-- 1. Trigger functions: a trigger fires without the EXECUTE privilege
--    (Postgres checks it only when the trigger is created), so no role
--    needs to call one directly. Revoked from public, anon and
--    authenticated for every SECURITY DEFINER trigger function in public,
--    found by looking, not by a list.
-- 2. Three callable functions with no signed-out caller:
--    get_job_quiz_keys (the hiring team's screens), grant_quiz_retake (no
--    caller at all today), assign_user_role (called right after sign-in).
--    Signed-in users keep them.
--
-- Kept for visitors on purpose: has_role and the can_* checks (row-security
-- policies granted to public call them, and a policy fails outright when
-- its function is not executable), business_name_taken (the sign-up form),
-- get_team_invitation_by_code (the invitation page before sign-in),
-- get_billing_flags (public settings).

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end;
$$;

revoke execute on function public.get_job_quiz_keys(uuid) from public, anon;
grant execute on function public.get_job_quiz_keys(uuid) to authenticated;
revoke execute on function public.grant_quiz_retake(uuid, uuid, text) from public, anon;
grant execute on function public.grant_quiz_retake(uuid, uuid, text) to authenticated;
revoke execute on function public.assign_user_role(text) from public, anon;
grant execute on function public.assign_user_role(text) to authenticated;
