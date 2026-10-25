-- Admin → Growth: "google" is Google search only (the sixth growth review,
-- 2026-10-25). The body is growth_source_name from
-- 20261025480000_growth_app_sources.sql with two changes:
--   1. Its google line matched every com.google.* package and every
--      <name>.google.<tld> host but five, so Gmail Go, Google Messages (texts),
--      Drive, Chat, Meet, Photos, Calendar, Classroom, YouTube Music,
--      sites.google.com (a doctor's office's own website), calendar.google.com
--      and news.google.com all read as search. Now "google" is the search app
--      (and Google Go, its Lite version on Android Go phones) and the
--      www.google.<tld> / google.<tld> hosts; Gmail Go is "gmail"; every other
--      Google app or site is its own channel, its package or host, like any
--      other app.
--   2. The Lite apps common in the Philippines are named as their channel
--      (they showed as raw package names): Viber, Instagram Lite, TikTok Lite,
--      LinkedIn Lite.

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
    when s in ('gmail', 'com.google.android.gm', 'com.google.android.gm.lite') or s ~ '(^|\.)mail\.google\.com$' then 'gmail'
    when s in ('youtube', 'yt', 'com.google.android.youtube') or s ~ '(^|\.)(youtube\.com|youtu\.be)$' then 'youtube'
    when s in ('facebook', 'fb') or s like 'com.facebook.%' or s ~ '(^|\.)(facebook\.com|fb\.com|fb\.me|fb\.watch|messenger\.com)$' then 'facebook'
    when s in ('instagram', 'ig', 'com.instagram.android', 'com.instagram.lite') or s ~ '(^|\.)instagram\.com$' then 'instagram'
    when s in ('linkedin', 'com.linkedin.android', 'com.linkedin.android.lite') or s ~ '(^|\.)(linkedin\.com|lnkd\.in)$' then 'linkedin'
    when s in ('x', 'twitter', 'com.twitter.android') or s ~ '(^|\.)(twitter\.com|x\.com|t\.co)$' then 'x'
    when s in ('tiktok', 'com.zhiliaoapp.musically', 'com.ss.android.ugc.trill', 'com.zhiliaoapp.musically.go', 'com.ss.android.ugc.tiktok.lite') or s ~ '(^|\.)tiktok\.com$' then 'tiktok'
    when s in ('whatsapp', 'com.whatsapp', 'com.whatsapp.w4b') or s ~ '(^|\.)(whatsapp\.com|wa\.me)$' then 'whatsapp'
    when s in ('telegram', 'org.telegram.messenger') or s ~ '(^|\.)(t\.me|telegram\.org)$' then 'telegram'
    when s in ('viber', 'com.viber.voip') or s ~ '(^|\.)viber\.com$' then 'viber'
    -- Search only (the sixth growth review): the Google app, Google Go, and
    -- google.<tld> with or without www. (google.com, www.google.com.ph).
    when s in ('google', 'com.google.android.googlequicksearchbox', 'com.google.android.apps.searchlite') or s ~ '^(www\.)?google(\.[a-z]{2,3}){1,2}$' then 'google'
    when s = 'bing' or s ~ '(^|\.)bing\.com$' then 'bing'
    when s = 'quora' or s ~ '(^|\.)quora\.com$' then 'quora'
    when s = 'reddit' or s ~ '(^|\.)reddit\.com$' then 'reddit'
    else regexp_replace(s, '^(www|m|l|lm|mobile|web)\.', '')
  end
  from (select lower(trim(p_source)) as s) x
$$;

grant execute on function public.growth_source_name(text) to authenticated, service_role;
