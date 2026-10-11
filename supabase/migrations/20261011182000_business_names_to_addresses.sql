-- A business's careers address from its name, readably (2026-10-11).
--
-- slugify_business() turned every accented letter and apostrophe into a dash:
-- "Maria's Café" became "maria-s-caf", "Ünïcödé Jöb" became "n-c-d-j-b".
-- Accented letters now keep their base letter and apostrophes go:
-- "marias-cafe", "unicode-job". Only new addresses use it; an address
-- already made never changes (shared links keep working). The sign-up
-- screen's preview makes the same (src/components/business/CareersPageCard.tsx,
-- cleanAddress). No unaccent extension here, so a fixed translate() table.

CREATE OR REPLACE FUNCTION public.slugify_business(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT left(btrim(regexp_replace(
    translate(replace(replace(lower(coalesce(p_name, '')), '''', ''), U&'\2019', ''),
      'àáâãäåāăąçćčĉċďđèéêëēĕėęěĝğġģĥħìíîïĩīĭįıĵķĺļľŀłñńņňŉòóôõöøōŏőŕŗřśŝşšßţťŧùúûüũūŭůűųŵýÿŷźżž',
      'aaaaaaaaacccccddeeeeeeeeegggghhiiiiiiiiijklllllnnnnnooooooooorrrssssstttuuuuuuuuuuwyyyzzz'),
    '[^a-z0-9]+', '-', 'g'), '-'), 50);
$$;
