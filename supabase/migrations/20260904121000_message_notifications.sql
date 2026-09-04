-- ============================================================================
-- A message nobody is told about was never sent.
-- ============================================================================
-- Until now an INSERT into public.messages produced no public.notifications
-- row. The consequences, in order: no bell count (useUnreadCount reads
-- notifications), no push (trigger_push_notification fires AFTER INSERT ON
-- notifications, nowhere else), and the only in-app signal an employer had
-- was a dot on a thread row on a page they had no reason to open.
--
-- This trigger writes one notifications row per delivered message, addressed
-- to the receiver, with a link that lands on the sender's thread:
--
--   receiver is a candidate            -> /messages?employer=<sender_id>
--   receiver is employer / team member -> /messages?candidate=<sender_id>
--
-- The role is read from public.user_roles with the same precedence the app
-- uses (an account holding 'employer' or 'team_member' is employer-side even
-- if it also holds 'candidate'). Both params are understood by the shared
-- Messages page, so either link opens the right thread for either side.
--
-- Tables touched:
--   READ  public.messages     (NEW row: sender_id, receiver_id, content,
--                              file_name)
--   READ  public.user_roles   (user_id, role)
--   READ  public.profiles     (user_id, full_name, company_name)
--   WRITE public.notifications (user_id, type, title, message, link, is_read)
--         type = 'message' — already a value of public.notification_type
--         since 20251214183024_*.sql; no enum change here.
--
-- SECURITY DEFINER, like notify_application_status_change(): the function is
-- owned by the migration role, which owns notifications, so the row is written
-- regardless of the "Related parties can insert notifications" policy (the
-- sender would in fact satisfy that policy, but the trigger must not depend on
-- it). Fail-open, like trigger_push_notification(): a notification that cannot
-- be written is logged and the message insert still commits — the message is
-- the thing that matters.
--
-- Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- ============================================================================

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  receiver_is_candidate boolean;
  sender_name text;
  notif_link text;
  notif_body text;
begin
  -- Nothing to announce for a note to yourself.
  if new.receiver_id is null or new.receiver_id = new.sender_id then
    return new;
  end if;

  begin
    -- Employer-side if any employer-side role is present; the app resolves
    -- multi-role accounts the same way (employer > team_member > candidate).
    receiver_is_candidate :=
      exists (
        select 1 from public.user_roles r
        where r.user_id = new.receiver_id and r.role = 'candidate'
      )
      and not exists (
        select 1 from public.user_roles r
        where r.user_id = new.receiver_id and r.role in ('employer', 'team_member')
      );

    -- Name the sender the way the receiver knows them: a candidate hears from
    -- the company, an employer hears from the person.
    select case
             when receiver_is_candidate
               then coalesce(nullif(p.company_name, ''), nullif(p.full_name, ''))
             else coalesce(nullif(p.full_name, ''), nullif(p.company_name, ''))
           end
      into sender_name
      from public.profiles p
     where p.user_id = new.sender_id
     limit 1;
    sender_name := coalesce(sender_name, 'Someone');

    notif_link := case
      when receiver_is_candidate then '/messages?employer=' || new.sender_id::text
      else '/messages?candidate=' || new.sender_id::text
    end;

    -- The first line of the message is the preview; a file-only message says
    -- what was attached instead of an empty line.
    notif_body := nullif(left(btrim(coalesce(new.content, '')), 140), '');
    if notif_body is null then
      notif_body := case
        when nullif(new.file_name, '') is not null then 'Sent a file: ' || new.file_name
        else 'Sent you a message.'
      end;
    end if;

    insert into public.notifications (user_id, type, title, message, link, is_read)
    values (
      new.receiver_id,
      'message',
      'New message from ' || sender_name,
      notif_body,
      notif_link,
      false
    );
  exception
    when others then
      raise log 'notify_new_message skipped for message %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

comment on function public.notify_new_message() is
  'AFTER INSERT ON public.messages: one notifications row (type ''message'') for the receiver, '
  'linking to /messages?candidate=<sender> or ?employer=<sender> by the receiver''s user_roles. '
  'Fail-open — a failed notification never blocks the message.';

-- A trigger function returns `trigger` and cannot be called through the API,
-- but there is no reason for any client role to hold EXECUTE on it either.
revoke all on function public.notify_new_message() from public, anon, authenticated;

drop trigger if exists on_message_created_notify on public.messages;
create trigger on_message_created_notify
  after insert on public.messages
  for each row
  execute function public.notify_new_message();
