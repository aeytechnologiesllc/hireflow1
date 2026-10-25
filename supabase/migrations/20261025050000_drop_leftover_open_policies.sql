-- No wide-open policy survives a rebuild of the database (2026-10-25;
-- docs/LAUNCH-PLAN.md, Phase 1, task 6).
--
-- The early migrations (the June 2026 demo schema and the Lovable-era
-- files) created policies with USING (true) or WITH CHECK (true): "demo
-- upload interview audio" (anyone could write any file to any storage
-- bucket), "demo read interview bucket", "public read <table>" on
-- applications, documents and messages, "demo update application", "public
-- apply insert application", "Authenticated users can view all profiles",
-- and more. Most were dropped by name later, and on 2026-10-25 the live
-- database has exactly two such policies, both intended public reads:
-- app_settings ("app_settings readable by anyone": billing flags and the AI
-- ceiling) and business_pages ("Anyone reads a careers page"). But a
-- database built from these files (a branch, a staging copy, `supabase db
-- reset`) could come up with whichever ones no later file names.
--
-- So this drops, by looking at the database rather than a list of names,
-- every policy in public or storage whose USING or WITH CHECK is exactly
-- `true`, except those two. On the live database it drops nothing.
-- scripts/guards/no-open-policies-in-new-migrations.mjs keeps a new file
-- from adding one.

do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname in ('public', 'storage')
       and (qual = 'true' or with_check = 'true')
       and not (schemaname = 'public' and tablename = 'app_settings' and policyname = 'app_settings readable by anyone')
       and not (schemaname = 'public' and tablename = 'business_pages' and policyname = 'Anyone reads a careers page')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    raise notice 'dropped open policy % on %.%', r.policyname, r.schemaname, r.tablename;
  end loop;
end;
$$;
