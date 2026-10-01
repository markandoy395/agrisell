begin;
-- Farmer Rider discovery intentionally uses the Rider's registered signup
-- coordinates. Live GPS remains operational data for availability expiry and
-- assigned-delivery tracking; it must not change directory distance/ranking.
create or replace function private.rider_registered_location_is_available(
  target_rider_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.riders as rider
    where rider.rider_id = target_rider_id
      and rider.gps_lat between -90 and 90
      and rider.gps_long between -180 and 180
  )
$$;
create or replace function private.rider_distance_from_registered_location_km(
  target_latitude double precision,
  target_longitude double precision,
  target_rider_id uuid
) returns double precision language sql stable security definer set search_path = '' as $$
  select private.geo_distance_km(
    rider.gps_lat::double precision,
    rider.gps_long::double precision,
    target_latitude,
    target_longitude
  )
  from public.riders as rider
  where rider.rider_id = target_rider_id
    and rider.gps_lat between -90 and 90
    and rider.gps_long between -180 and 180
$$;
create or replace function private.rider_registered_location_updated_at(
  target_rider_id uuid
) returns timestamptz language sql stable security definer set search_path = '' as $$
  select rider.location_captured_at
  from public.riders as rider
  where rider.rider_id = target_rider_id
$$;
-- Online status still controls whether a Rider can receive a request. The
-- five-minute heartbeat expiry owns that status, so requestability no longer
-- requires a separate fresh-live-location check.
create or replace function private.rider_is_eligible_for_delivery(
  target_delivery_id bigint,
  target_rider_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.riders as rider
    join private.order_delivery_fulfillments as fulfillment
      on fulfillment.delivery_id = target_delivery_id
    cross join lateral private.seller_order_current_delivery_location(
      fulfillment.seller_order_id
    ) as destination
    where rider.rider_id = target_rider_id
      and rider.availability_status = 'online'
      and private.rider_registered_location_is_available(rider.rider_id)
      and private.rider_is_visible_for_delivery(target_delivery_id, rider.rider_id)
      and private.rider_registered_service_area_contains(
        fulfillment.pickup_lat::double precision,
        fulfillment.pickup_long::double precision,
        rider.rider_id
      )
      and private.rider_registered_service_area_contains(
        destination.latitude::double precision,
        destination.longitude::double precision,
        rider.rider_id
      )
  )
$$;
do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.eligible_riders_for_current_farmer_order(text)'::regprocedure
  ) into function_definition;
  if function_definition is null then
    raise exception 'Farmer Rider directory function is missing';
  end if;

  function_definition := replace(
    function_definition,
    'private.rider_distance_from_current_location_km(',
    'private.rider_distance_from_registered_location_km('
  );
  function_definition := replace(
    function_definition,
    'private.rider_current_location_is_fresh(rider.rider_id)',
    'private.rider_registered_location_is_available(rider.rider_id)'
  );
  function_definition := replace(
    function_definition,
    'private.rider_current_location_updated_at(rider.rider_id)',
    'private.rider_registered_location_updated_at(rider.rider_id)'
  );

  if function_definition like '%rider_distance_from_current_location_km%'
      or function_definition like '%rider_current_location_is_fresh%'
      or function_definition like '%rider_current_location_updated_at%' then
    raise exception 'Farmer Rider directory still depends on live GPS';
  end if;
  if function_definition not like
      '%private.rider_distance_from_registered_location_km(%' then
    raise exception 'Farmer Rider directory registered distance was not installed';
  end if;

  execute function_definition;
end
$$;
revoke all on function private.rider_registered_location_is_available(uuid),
  private.rider_distance_from_registered_location_km(
    double precision, double precision, uuid
  ),
  private.rider_registered_location_updated_at(uuid)
  from public, anon, authenticated;
grant execute on function public.eligible_riders_for_current_farmer_order(text)
  to authenticated;
notify pgrst, 'reload schema';
commit;
