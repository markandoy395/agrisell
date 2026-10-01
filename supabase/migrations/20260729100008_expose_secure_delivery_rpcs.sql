begin;
create or replace function public.current_rider_deliveries(
  include_available boolean default true
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.current_rider_deliveries(include_available)
$$;
create or replace function public.accept_delivery(
  p_delivery_id bigint,
  p_idempotency_key uuid
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.accept_delivery(p_delivery_id, p_idempotency_key)
$$;
create or replace function public.update_delivery_status(
  p_delivery_id bigint,
  p_previous_status text,
  p_new_status text,
  p_idempotency_key text,
  p_remarks text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.update_delivery_status(
    p_delivery_id, p_previous_status, p_new_status, p_idempotency_key,
    p_remarks, p_latitude, p_longitude
  )
$$;
revoke all on function public.current_rider_deliveries(boolean)
  from public, anon;
revoke all on function public.accept_delivery(bigint, uuid)
  from public, anon;
revoke all on function public.update_delivery_status(
  bigint, text, text, text, text, double precision, double precision
) from public, anon;
grant execute on function public.current_rider_deliveries(boolean)
  to authenticated;
grant execute on function public.accept_delivery(bigint, uuid)
  to authenticated;
grant execute on function public.update_delivery_status(
  bigint, text, text, text, text, double precision, double precision
) to authenticated;
notify pgrst, 'reload schema';
commit;
