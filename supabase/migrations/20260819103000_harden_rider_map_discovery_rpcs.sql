begin;
grant usage on schema private to authenticated, service_role;
-- Keep the client-facing RPC signatures stable, but move their privileged
-- implementations outside the Data API's exposed public schema.
alter function public.current_rider_nearby_deliveries(
  double precision, double precision, double precision, integer
) rename to api_impl_current_rider_nearby_deliveries;
alter function public.api_impl_current_rider_nearby_deliveries(
  double precision, double precision, double precision, integer
) set schema private;
create function public.current_rider_nearby_deliveries(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_km double precision default 15,
  p_limit integer default 50
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.api_impl_current_rider_nearby_deliveries($1, $2, $3, $4)
$$;
alter function public.current_rider_nearby_farms(
  double precision, double precision, double precision, integer
) rename to api_impl_current_rider_nearby_farms;
alter function public.api_impl_current_rider_nearby_farms(
  double precision, double precision, double precision, integer
) set schema private;
create function public.current_rider_nearby_farms(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_km double precision default 15,
  p_limit integer default 50
) returns table (
  farm_id bigint,
  farm_name text,
  farm_location text,
  latitude double precision,
  longitude double precision,
  main_crops text[],
  distance_km double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from private.api_impl_current_rider_nearby_farms($1, $2, $3, $4)
$$;
revoke all on function private.api_impl_current_rider_nearby_deliveries(
  double precision, double precision, double precision, integer
) from public, anon, authenticated, service_role;
grant execute on function private.api_impl_current_rider_nearby_deliveries(
  double precision, double precision, double precision, integer
) to authenticated, service_role;
revoke all on function private.api_impl_current_rider_nearby_farms(
  double precision, double precision, double precision, integer
) from public, anon, authenticated, service_role;
grant execute on function private.api_impl_current_rider_nearby_farms(
  double precision, double precision, double precision, integer
) to authenticated, service_role;
revoke all on function public.current_rider_nearby_deliveries(
  double precision, double precision, double precision, integer
) from public, anon, authenticated, service_role;
grant execute on function public.current_rider_nearby_deliveries(
  double precision, double precision, double precision, integer
) to authenticated, service_role;
revoke all on function public.current_rider_nearby_farms(
  double precision, double precision, double precision, integer
) from public, anon, authenticated, service_role;
grant execute on function public.current_rider_nearby_farms(
  double precision, double precision, double precision, integer
) to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
