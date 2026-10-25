-- Admin → Growth names each channel once, apps included (the fifth growth
-- review, 2026-10-25). growth_source_name (20261025440000) folded every
-- com.google.android.* package into "google": 47 of the 48 visits it called
-- Google were Gmail, and the YouTube app read as Google too, while Facebook's,
-- Instagram's, LinkedIn's, TikTok's and WhatsApp's apps showed as raw package
-- names. Each app is now its channel; Gmail is "gmail".

create or replace function public.growth_source_name(p_source text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when s is null or s = '' then null
    -- Apps on Android send their package name; each is its channel (the fifth
    -- growth review: Gmail and the YouTube app read as "google").
    when s in ('gmail', 'com.google.android.gm') or s ~ '(^|\.)mail\.google\.com$' then 'gmail'
    when s in ('youtube', 'yt', 'com.google.android.youtube') or s ~ '(^|\.)(youtube\.com|youtu\.be)$' then 'youtube'
    when s in ('facebook', 'fb') or s like 'com.facebook.%' or s ~ '(^|\.)(facebook\.com|fb\.com|fb\.me|fb\.watch|messenger\.com)$' then 'facebook'
    when s in ('instagram', 'ig', 'com.instagram.android') or s ~ '(^|\.)instagram\.com$' then 'instagram'
    when s in ('linkedin', 'com.linkedin.android') or s ~ '(^|\.)(linkedin\.com|lnkd\.in)$' then 'linkedin'
    when s in ('x', 'twitter', 'com.twitter.android') or s ~ '(^|\.)(twitter\.com|x\.com|t\.co)$' then 'x'
    when s in ('tiktok', 'com.zhiliaoapp.musically', 'com.ss.android.ugc.trill') or s ~ '(^|\.)tiktok\.com$' then 'tiktok'
    when s in ('whatsapp', 'com.whatsapp', 'com.whatsapp.w4b') or s ~ '(^|\.)(whatsapp\.com|wa\.me)$' then 'whatsapp'
    when s in ('telegram', 'org.telegram.messenger') or s ~ '(^|\.)(t\.me|telegram\.org)$' then 'telegram'
    when s in ('google', 'com.google.android.googlequicksearchbox') or s ~ '(^|\.)google\.[a-z.]+$' and s !~ '(^|\.)(mail|docs|drive|meet|chat)\.google\.' then 'google'
    when s = 'bing' or s ~ '(^|\.)bing\.com$' then 'bing'
    when s = 'quora' or s ~ '(^|\.)quora\.com$' then 'quora'
    when s = 'reddit' or s ~ '(^|\.)reddit\.com$' then 'reddit'
    else regexp_replace(s, '^(www|m|l|lm|mobile|web)\.', '')
  end
  from (select lower(trim(p_source)) as s) x
$$;

grant execute on function public.growth_source_name(text) to authenticated, service_role;
