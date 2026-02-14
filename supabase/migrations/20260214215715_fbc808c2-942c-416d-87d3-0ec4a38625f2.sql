
-- 1. Create assign_user_role RPC (only inserts if no role exists)
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

-- 2. Update handle_new_user trigger to ONLY create profile (no role assignment)
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
