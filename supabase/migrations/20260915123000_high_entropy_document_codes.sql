-- C3: supabase/functions/verify-document is public (verify_jwt = false) and
-- resolves any document by its document_code with no rate limit. The
-- original generator (20251219173453_9b7d5623-6fd2-428d-9aa6-cd0b039b98c9.sql)
-- built each code from an md5 hash of a plain random() draw, truncated to 6
-- uppercase hex characters — ~24 bits of entropy, 16.7M possibilities.
-- Combined with the open lookup, every signed document's certificate,
-- signer names and timestamps were guessable by brute force.
--
-- This migration only changes how FUTURE document_code values are generated.
-- Existing codes already shared on printed certificates and audit exports
-- keep working unchanged — nothing here touches existing rows.
--
-- pgcrypto ships pre-installed on this project (see
-- 20260625180000_add_email_exists_rpc.sql's own `create extension if not
-- exists pgcrypto;`), in the `extensions` schema alongside pg_net (see
-- 20260312192140_*.sql). IF NOT EXISTS makes this a no-op when it already
-- exists in another schema, so it's safe to repeat here.
create extension if not exists pgcrypto with schema extensions;

-- SECURITY DEFINER (like the other extensions.* trigger in this project,
-- trigger_push_notification — 20260329145000_fail_open_push_trigger.sql) so
-- this doesn't depend on whatever EXECUTE grants the `authenticated`/`anon`
-- roles happen to have on the extensions schema: it only ever writes
-- NEW.document_code, so there's no privilege-escalation surface in running
-- it as the function owner.
create or replace function generate_document_code()
returns trigger
security definer
set search_path = public
as $$
begin
  if new.document_code is null then
    -- 16 CSPRNG bytes -> 32 hex chars (128 bits of entropy), well over the
    -- 20-random-char floor and unguessable by brute force or enumeration.
    new.document_code := 'DOC-' || upper(encode(extensions.gen_random_bytes(16), 'hex'));
  end if;
  return new;
end;
$$ language plpgsql;
