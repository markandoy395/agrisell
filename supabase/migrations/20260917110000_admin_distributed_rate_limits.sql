create table if not exists private.admin_rate_limit_buckets (
  scope text not null,
  key_hash text not null check (char_length(key_hash) = 64),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (scope, key_hash)
);

create index if not exists admin_rate_limit_buckets_updated_idx
  on private.admin_rate_limit_buckets (updated_at);

revoke all on private.admin_rate_limit_buckets from public, anon, authenticated;
grant select, insert, update, delete on private.admin_rate_limit_buckets to service_role;

create or replace function public.admin_consume_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_bucket private.admin_rate_limit_buckets%rowtype;
begin
  if p_scope is null or char_length(p_scope) not between 1 and 80
    or p_key_hash !~ '^[0-9a-f]{64}$'
    or p_limit not between 1 and 100000
    or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate-limit policy.' using errcode = '22023';
  end if;

  insert into private.admin_rate_limit_buckets as buckets (
    scope, key_hash, window_started_at, request_count, updated_at
  ) values (
    p_scope, p_key_hash, v_now, 1, v_now
  )
  on conflict (scope, key_hash) do update
  set window_started_at = case
        when buckets.window_started_at + make_interval(secs => p_window_seconds) <= v_now
          then v_now
        else buckets.window_started_at
      end,
      request_count = case
        when buckets.window_started_at + make_interval(secs => p_window_seconds) <= v_now
          then 1
        else least(buckets.request_count + 1, p_limit + 1)
      end,
      updated_at = v_now
  returning buckets.* into v_bucket;

  allowed := v_bucket.request_count <= p_limit;
  remaining := greatest(0, p_limit - v_bucket.request_count);
  reset_at := v_bucket.window_started_at + make_interval(secs => p_window_seconds);
  retry_after_seconds := case when allowed then 0 else
    greatest(1, ceil(extract(epoch from reset_at - v_now))::integer)
  end;
  return next;
end;
$$;

revoke all on function public.admin_consume_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.admin_consume_rate_limit(text, text, integer, integer)
  to service_role;

comment on function public.admin_consume_rate_limit(text, text, integer, integer) is
  'Atomically consumes a distributed admin API rate-limit allowance. Keys must be SHA-256 hashes.';
