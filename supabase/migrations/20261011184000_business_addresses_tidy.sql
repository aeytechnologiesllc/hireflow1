-- Careers addresses that always work (2026-10-11, the review of the day's work).
--
-- 1. slugify_business() trimmed dashes and then cut the name to 50
--    characters, so the cut could leave one at the end:
--    "Bright Horizons Online Customer Support and Sales Team Inc" became
--    "bright-horizons-online-customer-support-and-sales-". The site's own
--    address check refuses that, so the business's /c/<address> and every
--    job link under it said "not found". It now trims after the cut too.
-- 2. business_page_for() added "-2" to a taken address after cutting it to
--    46, which could make "...sales--2". The cut is trimmed first.
-- 3. The addresses kept for HireFlow (business_pages_address_rules) were
--    only refused when an address was changed, not when it was first made:
--    a business named "Admin" got /c/admin. A kept word now gets "-jobs"
--    ("admin-jobs"), and "hireflow" gets the plain "business".
--
-- No live address is affected (the only one today is zulu-support-team).

CREATE OR REPLACE FUNCTION public.slugify_business(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT btrim(left(btrim(regexp_replace(
    translate(replace(replace(lower(coalesce(p_name, '')), '''', ''), U&'\2019', ''),
      'àáâãäåāăąçćčĉċďđèéêëēĕėęěĝğġģĥħìíîïĩīĭįıĵķĺļľŀłñńņňŉòóôõöøōŏőŕŗřśŝşšßţťŧùúûüũūŭůűųŵýÿŷźżž',
      'aaaaaaaaacccccddeeeeeeeeegggghhiiiiiiiiijklllllnnnnnooooooooorrrssssstttuuuuuuuuuuwyyyzzz'),
    '[^a-z0-9]+', '-', 'g'), '-'), 50), '-');
$$;

CREATE OR REPLACE FUNCTION public.business_page_for(p_employer uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing text;
  base text;
  candidate text;
  n int := 1;
BEGIN
  IF p_employer IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT slug INTO existing FROM public.business_pages WHERE employer_id = p_employer;
  IF existing IS NOT NULL THEN
    RETURN existing;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_employer) THEN
    RETURN NULL;
  END IF;
  SELECT public.slugify_business(coalesce(nullif(btrim(p.company_name), ''), nullif(btrim(p.full_name), ''), 'business'))
    INTO base FROM public.profiles p WHERE p.user_id = p_employer;
  base := coalesce(nullif(base, ''), 'business');
  -- The addresses kept for HireFlow (the same list as business_pages_address_rules).
  IF base = 'hireflow' THEN
    base := 'business';
  ELSIF base IN ('admin', 'help', 'support', 'staff', 'official', 'careers', 'jobs', 'team', 'api', 'www') THEN
    base := base || '-jobs';
  END IF;
  IF char_length(base) < 2 THEN
    base := base || '-jobs';
  END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.business_pages WHERE slug = candidate) LOOP
    n := n + 1;
    candidate := rtrim(left(base, 46), '-') || '-' || n;
  END LOOP;
  INSERT INTO public.business_pages (employer_id, slug) VALUES (p_employer, candidate)
  ON CONFLICT (employer_id) DO NOTHING;
  RETURN (SELECT slug FROM public.business_pages WHERE employer_id = p_employer);
END;
$$;

REVOKE ALL ON FUNCTION public.business_page_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_page_for(uuid) TO service_role;
