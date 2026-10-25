-- Stored links can only be in-app paths or http(s) addresses (2026-10-25).
--
-- The hole (docs/LAUNCH-PLAN.md, Phase 1, task 1): rows other people write
-- carry links the app renders as something to click. "Related parties can
-- insert notifications" lets an applicant create a notification for the
-- business they applied to (and a business for its applicants); the
-- Notifications page rendered `link` through React Router's <Link to>, which
-- turns an absolute URL into a plain <a href>, and React 18 does not block
-- `javascript:`. One click and a script runs in the HireFlow page with the
-- viewer's session. The same shape exists for an applicant's LinkedIn and
-- portfolio address (shown to the business), a business's own meeting link
-- (opened by the applicant), and a message attachment's stored path.
--
-- The app now filters every one of those at the point it renders
-- (src/lib/safeLink.ts). This migration makes the database refuse to keep a
-- bad one in the first place, so a future screen that forgets the filter
-- still has nothing dangerous to render:
--
--   - notifications.link       -> an in-app path or NULL (same rule as
--                                 supabase/functions/_shared/pushLink.ts)
--   - interviews.meeting_link  -> an http(s) address or NULL
--   - profiles.linkedin_url,
--     profiles.portfolio_url   -> an http(s) address or NULL; a bare domain
--                                 ("www.linkedin.com/in/x") gets https://
--   - messages.file_url        -> a storage path (no scheme) or an http(s)
--                                 address, or NULL
--
-- A BEFORE trigger cleans the value (a bad one becomes NULL rather than
-- failing the write, so no legitimate notification, interview or message is
-- ever lost to this), and a CHECK constraint states the rule where every
-- live row already satisfies it (checked 2026-10-25: 341 notification links,
-- 4 meeting links, 0 message files, all clean). profiles gets the trigger
-- only: two live LinkedIn values are bare domains, and existing rows are not
-- rewritten here; the app adds https:// when it shows them.

create or replace function public.safe_in_app_path(p_link text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_link is null then null
    when length(btrim(p_link)) = 0 or length(btrim(p_link)) > 500 then null
    when btrim(p_link) ~ '^/([^/\\]|$)' and btrim(p_link) !~ '[[:space:][:cntrl:]]' then btrim(p_link)
    else null
  end
$$;

create or replace function public.safe_http_url(p_url text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_url is null then null
    when length(btrim(p_url)) = 0 or length(btrim(p_url)) > 2048 then null
    when btrim(p_url) ~ '[[:space:][:cntrl:]]' then null
    when btrim(p_url) ~* '^https?://[^/\\]' then btrim(p_url)
    when btrim(p_url) ~* '^[a-z][a-z0-9+.-]*:' then null
    when btrim(p_url) like '//%' then null
    when btrim(p_url) ~* '^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#:]|$)' then 'https://' || btrim(p_url)
    else null
  end
$$;

-- A storage path (no scheme) or an http(s) address. Anything with another
-- scheme is dropped.
create or replace function public.safe_file_ref(p_ref text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_ref is null then null
    when length(btrim(p_ref)) = 0 then null
    when btrim(p_ref) ~* '^https?://[^/\\]' then btrim(p_ref)
    when btrim(p_ref) ~* '^[a-z][a-z0-9+.-]*:' then null
    when btrim(p_ref) like '//%' then null
    else btrim(p_ref)
  end
$$;

-- ---- notifications.link -------------------------------------------------
create or replace function public.notifications_safe_link()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.link := public.safe_in_app_path(new.link);
  return new;
end;
$$;

drop trigger if exists notifications_safe_link on public.notifications;
create trigger notifications_safe_link
  before insert or update of link on public.notifications
  for each row execute function public.notifications_safe_link();

alter table public.notifications drop constraint if exists notifications_link_in_app;
alter table public.notifications
  add constraint notifications_link_in_app
  check (link is null or public.safe_in_app_path(link) is not distinct from link);

-- ---- interviews.meeting_link --------------------------------------------
create or replace function public.interviews_safe_meeting_link()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.meeting_link := public.safe_http_url(new.meeting_link);
  return new;
end;
$$;

drop trigger if exists interviews_safe_meeting_link on public.interviews;
create trigger interviews_safe_meeting_link
  before insert or update of meeting_link on public.interviews
  for each row execute function public.interviews_safe_meeting_link();

alter table public.interviews drop constraint if exists interviews_meeting_link_http;
alter table public.interviews
  add constraint interviews_meeting_link_http
  check (meeting_link is null or meeting_link ~* '^https?://[^/\\]');

-- ---- profiles.linkedin_url / portfolio_url ------------------------------
create or replace function public.profiles_safe_urls()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.linkedin_url := public.safe_http_url(new.linkedin_url);
  new.portfolio_url := public.safe_http_url(new.portfolio_url);
  return new;
end;
$$;

drop trigger if exists profiles_safe_urls on public.profiles;
create trigger profiles_safe_urls
  before insert or update of linkedin_url, portfolio_url on public.profiles
  for each row execute function public.profiles_safe_urls();

-- ---- messages.file_url --------------------------------------------------
create or replace function public.messages_safe_file_url()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.file_url := public.safe_file_ref(new.file_url);
  return new;
end;
$$;

drop trigger if exists messages_safe_file_url on public.messages;
create trigger messages_safe_file_url
  before insert or update of file_url on public.messages
  for each row execute function public.messages_safe_file_url();

alter table public.messages drop constraint if exists messages_file_url_no_script;
alter table public.messages
  add constraint messages_file_url_no_script
  check (file_url is null or public.safe_file_ref(file_url) is not distinct from file_url);

-- The three cleaning functions stay executable by every role on purpose:
-- the CHECK constraints and the trigger bodies call them as the user doing
-- the write, so revoking EXECUTE would fail every legitimate insert. They are
-- pure (text in, text out) and reveal nothing.
