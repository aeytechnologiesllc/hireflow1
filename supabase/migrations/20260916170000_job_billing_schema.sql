-- 2026-09-16: Schema for the owner's decided pricing (2026-08-27), gated
-- entirely behind app_settings.billing_enabled.
--
-- THE MODEL (documented once, here, because every entitlement function below
-- implements exactly this and nothing else):
--
--   - Posting a job is always free. A job's first 3 applicants (by arrival
--     order) are fully processed free, no unlock required.
--   - At applicant #4, the job needs a $49 unlock: 30 days, 25 processed
--     applicants included (on top of the 3 free -> 28 total from that
--     unlock). +$25 buys another pack of 25, but only while the job has an
--     unlock that is still within its 30-day window (job_has_active_unlock).
--   - A job's "processed allowance" is a HIGH-WATER MARK: 3 + 25 * (every
--     unlock this job has ever completed) + 25 * (every active pack). It
--     never shrinks when a 30-day window lapses -- an employer who already
--     paid for capacity keeps it. What the 30-day window actually gates is
--     whether MORE capacity can be bought without paying the $49 again: once
--     the active window lapses, buying another pack requires a fresh unlock
--     (which also grants another 25 baseline and restarts the window).
--   - "Processed" vs "sealed" is a VISIBILITY gate on the employer's applicant
--     list, not a compute gate on the candidate's pipeline: applicants beyond
--     the allowance still complete the full workflow (quiz, voice interview,
--     whatever the job asks for) exactly as today -- nothing about a
--     candidate's own experience changes, and nothing already captured is
--     ever discarded. The lock only decides whether the EMPLOYER sees the
--     real card or a sealed placeholder ("N more waiting") until they pay.
--     This is what "applicants are never lost or rejected by the lock" means
--     in code: check-applicant-limit never refuses a submission for billing
--     reasons, ever.
--   - Voice interviews are billed separately and for real (they cost real
--     OpenAI Realtime minutes): 10 interviews included PER UNLOCK, exactly
--     like the applicant allowance's +25-per-unlock -- a HIGH-WATER MARK
--     that accumulates with every unlock this job has ever completed
--     (job_voice_included_total(job) = 10 * job_unlock_count(job)) and never
--     shrinks when a 30-day window lapses. A job re-unlocked for a fresh $49
--     after its window lapses gets another 10 included interviews on top of
--     whatever it already used, same as it gets another 25 applicants --
--     this was an explicit, confirmed decision (2026-09-16) after a review
--     flagged the earlier "flat 10 forever, never scaling with unlock
--     count" implementation as contradicting the "PER UNLOCKED JOB" pricing
--     text; that flat reading is REJECTED. A job that has never been
--     unlocked runs voice interviews unmetered (nothing to charge yet,
--     nothing charged), counted cumulatively once unlocked
--     (job_unlock_count(job) > 0), then $2 each via an off-session charge
--     against the card saved during that unlock's Checkout Session. If an
--     overage charge fails (no saved card, declined, etc.) the interview
--     still proceeds -- a live candidate interview is never blocked by a
--     billing hiccup; the failed charge is left for the employer to see and
--     resolve.
--   - Ava Boost is a separate, per-job, per-purchase flat fee ($79/$149/
--     $299) with its own authorize-then-capture lifecycle; unrelated to the
--     unlock/pack allowance above.
--
-- Everything here is inert until app_settings.billing_enabled is flipped to
-- true by the owner: check-applicant-limit, get-subscription and
-- ava-voice-session do not consult any of these tables/functions while it is
-- false (proved in scripts/job_billing_schema.pglite.test.mjs and
-- scripts/job_billing_entitlements.test.mjs). Idempotent throughout --
-- CREATE ... IF NOT EXISTS, CREATE OR REPLACE FUNCTION, DROP POLICY IF
-- EXISTS + CREATE POLICY, ADD COLUMN IF NOT EXISTS -- safe to run once
-- against the live database as it stands today, and safe to re-run.

-- ---------------------------------------------------------------------
-- 0) app_settings: the one switch, plus boost_enabled. This branch and
--    fix/w1-coaching-report both landed a same-day migration named
--    20260916160000 that wants a generic `app_settings` table; that one
--    (20260916160000_blueprint_entitlement_and_purchase_integrity.sql) got
--    the 160000 slot, seeds key='blueprint_paid', and shapes the table as a
--    generic key/value store: `key text primary key, value jsonb not null,
--    updated_at timestamptz`, RLS on with a public SELECT policy (the flags
--    are non-sensitive config the client needs for honest pricing copy) and
--    no client write policy (service_role only). This migration was
--    renamed to 20260916170000 so it runs AFTER that one and reuses the
--    exact same shape instead of colliding with it -- CREATE TABLE IF NOT
--    EXISTS below is a no-op when 160000 already ran first, and creates the
--    identical shape itself when this branch is deployed alone (coaching
--    branch not yet merged). Either order converges on the same table.
--    billing_enabled/boost_enabled live as two more keys/rows, exactly like
--    'blueprint_paid' -- not new columns, since the table both branches
--    share is key/value, not fixed-column.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text NOT NULL PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings readable by anyone" ON public.app_settings;
CREATE POLICY "app_settings readable by anyone"
  ON public.app_settings
  FOR SELECT
  USING (true);

-- No insert/update/delete policy for anon or authenticated: with RLS on and
-- no matching write policy, every client write is denied. Only the
-- service-role key (or the owner, directly in the dashboard's table editor)
-- can flip a flag -- it bypasses RLS entirely, same as every other
-- server-only table in this project.
REVOKE INSERT, UPDATE, DELETE ON public.app_settings FROM anon, authenticated;
GRANT SELECT ON public.app_settings TO anon, authenticated;

INSERT INTO public.app_settings (key, value)
VALUES ('billing_enabled', 'false'::jsonb), ('boost_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_billing_flags()
RETURNS TABLE(billing_enabled boolean, boost_enabled boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    coalesce((SELECT (s.value #>> '{}')::boolean FROM public.app_settings s WHERE s.key = 'billing_enabled'), false),
    coalesce((SELECT (s.value #>> '{}')::boolean FROM public.app_settings s WHERE s.key = 'boost_enabled'), false);
$function$;

-- Safe to expose broadly: two booleans, no secrets, no other user's data.
REVOKE ALL ON FUNCTION public.get_billing_flags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_billing_flags() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1) job_unlocks / applicant_packs / voice_interview_charges / boost_orders
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.job_unlocks (
  id                          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id                      uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id                 uuid NOT NULL,
  status                      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'canceled')),
  stripe_checkout_session_id  text UNIQUE,
  stripe_payment_intent_id    text,
  amount_cents                integer NOT NULL DEFAULT 4900 CHECK (amount_cents >= 0),
  included_applicants         integer NOT NULL DEFAULT 25 CHECK (included_applicants >= 0),
  included_voice_interviews   integer NOT NULL DEFAULT 10 CHECK (included_voice_interviews >= 0),
  unlocked_at                 timestamptz,
  expires_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_unlocks_job_id_idx ON public.job_unlocks (job_id);
CREATE INDEX IF NOT EXISTS job_unlocks_employer_id_idx ON public.job_unlocks (employer_id);

CREATE TABLE IF NOT EXISTS public.applicant_packs (
  id                          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id                      uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id                 uuid NOT NULL,
  job_unlock_id               uuid REFERENCES public.job_unlocks(id) ON DELETE SET NULL,
  status                      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'canceled')),
  stripe_checkout_session_id  text UNIQUE,
  stripe_payment_intent_id    text,
  amount_cents                integer NOT NULL DEFAULT 2500 CHECK (amount_cents >= 0),
  included_applicants         integer NOT NULL DEFAULT 25 CHECK (included_applicants >= 0),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS applicant_packs_job_id_idx ON public.applicant_packs (job_id);
CREATE INDEX IF NOT EXISTS applicant_packs_employer_id_idx ON public.applicant_packs (employer_id);

-- One row per interview attributed to a job -- the ledger
-- job_processed_allowance's voice twin reads to decide included vs billable.
-- Written once by ava-voice-session at mint time (status 'included' or
-- 'pending'/'charged'/'failed' after an off-session charge attempt); never
-- updated by deduct-voice-minutes, which settles voice_session_log instead.
CREATE TABLE IF NOT EXISTS public.voice_interview_charges (
  id                     uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id                 uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id            uuid NOT NULL,
  application_id         uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  voice_session_log_id   uuid REFERENCES public.voice_session_log(id) ON DELETE SET NULL,
  ordinal                integer NOT NULL CHECK (ordinal > 0),
  billable               boolean NOT NULL DEFAULT false,
  amount_cents           integer NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  status                 text NOT NULL DEFAULT 'included' CHECK (status IN ('included', 'pending', 'charged', 'failed')),
  stripe_payment_intent_id text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_interview_charges_job_id_idx ON public.voice_interview_charges (job_id);
CREATE INDEX IF NOT EXISTS voice_interview_charges_employer_id_idx ON public.voice_interview_charges (employer_id);

CREATE TABLE IF NOT EXISTS public.boost_orders (
  id                      uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id                  uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id             uuid NOT NULL,
  tier_cents              integer NOT NULL CHECK (tier_cents IN (7900, 14900, 29900)),
  status                  text NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
                             'pending_payment',      -- checkout created, not yet paid
                             'authorized',            -- card authorized (manual capture hold); campaign not yet created
                             'submitted_for_review',  -- campaign/ad created via Meta, awaiting or mid review
                             'captured',              -- ad approved & live; hold captured
                             'released',              -- hold released (not live within 24h, or rejected twice)
                             'canceled'
                           )),
  radius_miles            integer NOT NULL DEFAULT 15 CHECK (radius_miles >= 15),
  reach_estimate_low      integer,
  reach_estimate_high     integer,
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text,
  meta_campaign_id        text,
  meta_ad_set_id           text,
  meta_ad_id               text,
  meta_creative_id         text,
  meta_review_status       text,
  meta_rejection_reason    text,
  retry_count              integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  authorized_at            timestamptz,
  hold_expires_at          timestamptz,
  captured_at              timestamptz,
  released_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS boost_orders_job_id_idx ON public.boost_orders (job_id);
CREATE INDEX IF NOT EXISTS boost_orders_employer_id_idx ON public.boost_orders (employer_id);
CREATE INDEX IF NOT EXISTS boost_orders_status_idx ON public.boost_orders (status);

-- `updated_at` housekeeping via the same trigger function every other table
-- in this project already uses (20251214183024).
DROP TRIGGER IF EXISTS update_job_unlocks_updated_at ON public.job_unlocks;
CREATE TRIGGER update_job_unlocks_updated_at BEFORE UPDATE ON public.job_unlocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_applicant_packs_updated_at ON public.applicant_packs;
CREATE TRIGGER update_applicant_packs_updated_at BEFORE UPDATE ON public.applicant_packs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_voice_interview_charges_updated_at ON public.voice_interview_charges;
CREATE TRIGGER update_voice_interview_charges_updated_at BEFORE UPDATE ON public.voice_interview_charges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_boost_orders_updated_at ON public.boost_orders;
CREATE TRIGGER update_boost_orders_updated_at BEFORE UPDATE ON public.boost_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- 2) RLS: employer (job owner) or active team member for the job can read
--    their own rows; nobody else can read anything; nobody but service_role
--    (which bypasses RLS entirely, same as every other server-only table in
--    this project) can write.
-- ---------------------------------------------------------------------

ALTER TABLE public.job_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applicant_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_interview_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boost_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Job owners and team can view job unlocks" ON public.job_unlocks;
CREATE POLICY "Job owners and team can view job unlocks"
ON public.job_unlocks FOR SELECT
USING (public.is_job_owner(job_id, auth.uid()) OR public.is_active_team_member_for_job(job_id, auth.uid()));

DROP POLICY IF EXISTS "Job owners and team can view applicant packs" ON public.applicant_packs;
CREATE POLICY "Job owners and team can view applicant packs"
ON public.applicant_packs FOR SELECT
USING (public.is_job_owner(job_id, auth.uid()) OR public.is_active_team_member_for_job(job_id, auth.uid()));

DROP POLICY IF EXISTS "Job owners and team can view voice interview charges" ON public.voice_interview_charges;
CREATE POLICY "Job owners and team can view voice interview charges"
ON public.voice_interview_charges FOR SELECT
USING (public.is_job_owner(job_id, auth.uid()) OR public.is_active_team_member_for_job(job_id, auth.uid()));

DROP POLICY IF EXISTS "Job owners and team can view boost orders" ON public.boost_orders;
CREATE POLICY "Job owners and team can view boost orders"
ON public.boost_orders FOR SELECT
USING (public.is_job_owner(job_id, auth.uid()) OR public.is_active_team_member_for_job(job_id, auth.uid()));

-- ---------------------------------------------------------------------
-- 3) Entitlement functions -- internal building blocks. Not exposed to
--    anon/authenticated directly (revoked below): a stranger asking
--    job_processed_allowance(<competitor's job>) would learn how many
--    applicants that job has, which is exactly the information-disclosure
--    shape 20260915141000_job_owner_rpc_caller_checks.sql exists to close.
--    The one caller-checked, client-facing entry point is
--    get_job_billing_status() in part 4.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.job_unlock_count(p_job_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  -- High-water mark: every unlock this job has ever completed counts, even
  -- if its 30-day window has since lapsed (see header comment).
  SELECT count(*)::int FROM public.job_unlocks
  WHERE job_id = p_job_id AND status = 'active';
$function$;

CREATE OR REPLACE FUNCTION public.job_active_pack_count(p_job_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT count(*)::int FROM public.applicant_packs
  WHERE job_id = p_job_id AND status = 'active';
$function$;

CREATE OR REPLACE FUNCTION public.job_processed_allowance(p_job_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT 3 + 25 * public.job_unlock_count(p_job_id) + 25 * public.job_active_pack_count(p_job_id);
$function$;

CREATE OR REPLACE FUNCTION public.job_has_active_unlock(p_job_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.job_unlocks
    WHERE job_id = p_job_id AND status = 'active' AND expires_at > now()
  );
$function$;

CREATE OR REPLACE FUNCTION public.job_applicant_count(p_job_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT count(*)::int FROM public.applications WHERE job_id = p_job_id;
$function$;

CREATE OR REPLACE FUNCTION public.job_sealed_count(p_job_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT greatest(0, public.job_applicant_count(p_job_id) - public.job_processed_allowance(p_job_id));
$function$;

CREATE OR REPLACE FUNCTION public.job_is_locked(p_job_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.job_sealed_count(p_job_id) > 0;
$function$;

-- Voice: interviews counted cumulatively once the job has ever been
-- unlocked; unmetered (unlimited, always "included") before that. How many
-- of these are included vs billable is job_voice_included_total() below.
CREATE OR REPLACE FUNCTION public.job_voice_interviews_used(p_job_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT count(*)::int FROM public.voice_interview_charges
  WHERE job_id = p_job_id AND status IN ('included', 'charged', 'pending');
$function$;

-- 10 voice interviews included PER UNLOCKED JOB, per unlock -- a high-water
-- mark exactly like job_processed_allowance's +25-per-unlock applicants: it
-- never shrinks when a 30-day window lapses, and a second (re-)unlock adds
-- another 10 on top of whatever was already used/included, mirroring the
-- applicant allowance's own +25-per-completed-unlock pattern. See the
-- migration header and jobBillingPricing.ts's computeVoiceIncludedTotal,
-- which this must always agree with.
CREATE OR REPLACE FUNCTION public.job_voice_included_total(p_job_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT 10 * public.job_unlock_count(p_job_id);
$function$;

CREATE OR REPLACE FUNCTION public.job_voice_interview_is_billable(p_job_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Unmetered until the job has ever been unlocked; included for the first
  -- job_voice_included_total() interviews after that (10 per completed
  -- unlock); billable ($2) once voice_used reaches that total.
  SELECT public.job_unlock_count(p_job_id) > 0
     AND public.job_voice_interviews_used(p_job_id) >= public.job_voice_included_total(p_job_id);
$function$;

REVOKE ALL ON FUNCTION public.job_unlock_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_active_pack_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_processed_allowance(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_has_active_unlock(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_applicant_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_sealed_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_is_locked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_voice_interviews_used(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_voice_included_total(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_voice_interview_is_billable(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_unlock_count(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.job_active_pack_count(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.job_processed_allowance(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.job_has_active_unlock(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.job_applicant_count(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.job_sealed_count(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.job_is_locked(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.job_voice_interviews_used(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.job_voice_included_total(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.job_voice_interview_is_billable(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 4) get_job_billing_status(p_job_id): the one client-facing entry point.
--    Caller-checked exactly like is_job_owner/is_active_team_member_for_job
--    themselves (service_role, or the job's own owner/active team member) --
--    everyone else gets a raised exception, never the real numbers.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_job_billing_status(p_job_id uuid)
RETURNS TABLE(
  billing_enabled boolean,
  applicant_count integer,
  processed_allowance integer,
  sealed_count integer,
  is_locked boolean,
  unlock_count integer,
  has_active_unlock boolean,
  active_unlock_expires_at timestamptz,
  pack_count integer,
  voice_included_total integer,
  voice_used integer,
  voice_next_is_billable boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_job_owner(p_job_id, auth.uid())
    OR public.is_active_team_member_for_job(p_job_id, auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized to read this job''s billing status';
  END IF;

  RETURN QUERY
  SELECT
    coalesce((SELECT (s.value #>> '{}')::boolean FROM public.app_settings s WHERE s.key = 'billing_enabled'), false),
    public.job_applicant_count(p_job_id),
    public.job_processed_allowance(p_job_id),
    public.job_sealed_count(p_job_id),
    public.job_is_locked(p_job_id),
    public.job_unlock_count(p_job_id),
    public.job_has_active_unlock(p_job_id),
    (SELECT max(ju.expires_at) FROM public.job_unlocks ju WHERE ju.job_id = p_job_id AND ju.status = 'active'),
    public.job_active_pack_count(p_job_id),
    -- 10 per completed unlock -- a high-water mark, same shape as
    -- job_processed_allowance's +25-per-unlock. Must always match the
    -- threshold job_voice_interview_is_billable() actually enforces (both
    -- call job_voice_included_total()), or this column lies to the employer
    -- about how many free interviews remain. See the header comment above.
    public.job_voice_included_total(p_job_id),
    public.job_voice_interviews_used(p_job_id),
    public.job_voice_interview_is_billable(p_job_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_job_billing_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_job_billing_status(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4b) get_employer_sealed_application_ids(): the single, authoritative
--     source of which application ids are currently sealed for the caller,
--     across every job they own or actively team-member on. No p_job_id --
--     it derives the caller's own scope from auth.uid(), exactly like
--     get_billing_flags(), so it's safe to GRANT directly to `authenticated`
--     and call straight from the client via supabase.rpc(), no edge function
--     needed (the same pattern useBillingFlags.ts already uses).
--
--     Why this exists: a prior review found the employer applicant LIST
--     (Applicants.tsx) filtering sealed cards out of one component's props,
--     while the actual data underneath -- useEmployerApplications()'s full
--     `select("*, jobs!inner(*)")`, the activity feed's own separate
--     candidate-name query, and the /applicants/:id detail route -- stayed
--     completely unfiltered: every sealed applicant's real name, AI score,
--     Ava's analysis, and resume were already in the client's network
--     response and query cache regardless of which page rendered them, and
--     several pages (Dashboard's activity feed, Messages, Interviews,
--     AIShortlistDialog) link straight to /applicants/:id with zero billing
--     check of their own. Filtering a rendered array can never close that --
--     only redacting the DATA before it leaves the server can. This
--     function is the one place that decides "sealed or not", computed the
--     same way the migration's other entitlement functions already do
--     (earliest arrivals by created_at fill the allowance first); every
--     hook that fetches raw application rows (useEmployerApplications,
--     useActivityFeed) calls it once and redacts by id before returning,
--     so every consumer of their data -- list, detail route, activity feed,
--     messages, dashboards -- inherits the same gate for free instead of
--     needing its own.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_employer_sealed_application_ids()
RETURNS TABLE(application_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH my_jobs AS (
    SELECT j.id AS job_id, public.job_processed_allowance(j.id) AS allowance
    FROM public.jobs j
    WHERE public.is_job_owner(j.id, auth.uid()) OR public.is_active_team_member_for_job(j.id, auth.uid())
  ),
  ranked AS (
    -- Earliest arrivals fill the allowance first -- ties on created_at
    -- broken by id so this is a deterministic total order, matching
    -- src/lib/billingVisibility.ts's computeBillingVisibleIds on the client.
    SELECT a.id, a.job_id,
           row_number() OVER (PARTITION BY a.job_id ORDER BY a.created_at ASC, a.id ASC) AS rn
    FROM public.applications a
    JOIN my_jobs mj ON mj.job_id = a.job_id
  )
  SELECT r.id
  FROM ranked r
  JOIN my_jobs mj ON mj.job_id = r.job_id
  WHERE coalesce((SELECT (s.value #>> '{}')::boolean FROM public.app_settings s WHERE s.key = 'billing_enabled'), false)
    AND r.rn > mj.allowance;
$function$;

REVOKE ALL ON FUNCTION public.get_employer_sealed_application_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_employer_sealed_application_ids() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5) A Stripe customer's saved payment method, for the $2 voice overage
--    off-session charge (Checkout's setup_future_usage: 'off_session' on
--    the unlock session saves it; the webhook records it here).
-- ---------------------------------------------------------------------

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_default_payment_method_id text;
