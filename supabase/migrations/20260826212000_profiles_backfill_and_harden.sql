-- Root cause of every "Confidential" job listing: 5 of 14 accounts had no profiles
-- row. No profile means no company_name, which means the job can never satisfy
-- Google or any aggregator — a paying customer in that state could not publish.

insert into public.profiles (user_id, email, full_name)
select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', '')
from auth.users u
where not exists (select 1 from public.profiles p where p.user_id = u.id);

-- Harden: idempotent, and can never block a signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    insert into public.profiles (user_id, email, full_name)
    values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
    on conflict (user_id) do update
      set email = coalesce(excluded.email, public.profiles.email);
  exception when others then
    raise warning 'handle_new_user: profile insert failed for % (%)', new.id, sqlerrm;
  end;
  return new;
end; $$;

-- Self-healing net for anything that still slips through.
create or replace function public.ensure_profile_exists(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (user_id, email, full_name)
  select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', '')
  from auth.users u where u.id = p_user_id
  on conflict (user_id) do nothing;
end; $$;
revoke all on function public.ensure_profile_exists(uuid) from public, anon;
grant execute on function public.ensure_profile_exists(uuid) to authenticated;
