-- Rate limiting for edge functions that must stay publicly reachable (accountless
-- candidates, guest job creator) but spend real money per call on AI providers.
create table if not exists private_rate_limit (
  bucket       text        not null,
  identifier   text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket, identifier, window_start)
);
comment on table private_rate_limit is
  'Fixed-window rate limiting for public edge functions. Rows expire via prune_rate_limits().';
alter table private_rate_limit enable row level security;
-- No policies: service role only.

create or replace function public.check_rate_limit(
  p_bucket text, p_identifier text, p_limit integer, p_window_secs integer
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_window timestamptz; v_hits integer;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_secs) * p_window_secs);
  insert into private_rate_limit (bucket, identifier, window_start, hits)
  values (p_bucket, p_identifier, v_window, 1)
  on conflict (bucket, identifier, window_start)
    do update set hits = private_rate_limit.hits + 1
  returning hits into v_hits;
  return jsonb_build_object(
    'allowed', v_hits <= p_limit, 'hits', v_hits, 'limit', p_limit,
    'retryAfter', greatest(1, p_window_secs - (floor(extract(epoch from now()))::bigint % p_window_secs)));
end; $$;
revoke all on function public.check_rate_limit(text, text, integer, integer) from public, anon, authenticated;

create or replace function public.prune_rate_limits() returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from private_rate_limit where window_start < now() - interval '2 hours';
$$;
revoke all on function public.prune_rate_limits() from public, anon, authenticated;
