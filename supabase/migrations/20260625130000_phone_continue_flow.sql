-- Phone-based continue flow (replaces passcode/magic-link resume).
-- Pre-launch: scope policies to authenticated employers + rate limits.

-- Link guest applications to auth accounts after signup (match phone/email).
alter table public.applications add column if not exists linked_user_id uuid;

create index if not exists applications_applicant_phone_idx
  on public.applications (regexp_replace(applicant_phone, '[^0-9]', '', 'g'))
  where applicant_phone is not null;

create index if not exists applications_linked_user_idx
  on public.applications (linked_user_id)
  where linked_user_id is not null;

create index if not exists candidates_phone_digits_idx
  on public.candidates (regexp_replace(phone, '[^0-9]', '', 'g'))
  where phone is not null;
