-- Team invite codes the server makes, long enough not to guess (Phase 7
-- security audit, 2026-10-25, low).
--
-- generate_invite_code() made 'TEAM-' and 8 hex characters of md5(random()):
-- 32 bits from a generator that is not meant for secrets, and it kept any code
-- the insert brought with it. An invite code is a bearer link (whoever opens
-- /join-team/<code> while signed in joins that team, and email addresses are
-- not confirmed here), so it is now 'TEAM-' and 24 hex characters from
-- pgcrypto's gen_random_bytes (96 bits), always made by the server for a
-- browser's insert. Codes already sent keep working; nothing reads a code's
-- length (the telemetry scrubber matches any length from six).

CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.invite_code IS NULL OR current_user IN ('anon', 'authenticated') THEN
    NEW.invite_code := 'TEAM-' || upper(encode(extensions.gen_random_bytes(12), 'hex'));
  END IF;
  RETURN NEW;
END;
$$;
