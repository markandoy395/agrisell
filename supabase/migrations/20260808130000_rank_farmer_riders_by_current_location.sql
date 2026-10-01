begin;
drop function if exists private.rider_distance_from_current_location_km(
  double precision,
  double precision,
  uuid,
  interval,
  double precision
);
drop function if exists private.rider_current_location_is_fresh(
  uuid,
  interval,
  double precision
);
-- Keep registered address/service-area data separate from live Rider GPS.
-- Registered fields classify eligibility; public.rider_locations is the
-- authoritative source for current matching distance and freshness.
create or replace function private.rider_current_location_is_fresh(
  target_rider_id uuid
) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  has_fresh_location boolean;
begin
  if pg_catalog.to_regclass('public.rider_locations') is null then
    return false;
  end if;

  select exists (
    select 1
    from public.rider_locations as current_location
    where current_location.rider_id = target_rider_id
      and current_location.latitude between -90 and 90
      and current_location.longitude between -180 and 180
      and current_location.location_updated_at >= now() - interval '2 minutes'
      and (
        current_location.accuracy_meters is null
        or current_location.accuracy_meters <= 100
      )
  ) into has_fresh_location;

  return coalesce(has_fresh_location, false);
end
$$;
create or replace function private.rider_distance_from_current_location_km(
  target_latitude double precision,
  target_longitude double precision,
  target_rider_id uuid
) returns double precision language plpgsql stable security definer set search_path = '' as $$
declare
  distance_km double precision;
begin
  if target_latitude is null
      or target_longitude is null
      or not private.rider_current_location_is_fresh(target_rider_id) then
    return null;
  end if;

  select 6371 * acos(least(1, greatest(-1,
    sin(radians(target_latitude)) * sin(radians(current_location.latitude))
    + cos(radians(target_latitude)) * cos(radians(current_location.latitude))
    * cos(radians(current_location.longitude) - radians(target_longitude))
  )))
  into distance_km
  from public.rider_locations as current_location
  where current_location.rider_id = target_rider_id;

  return distance_km;
end
$$;
create or replace function private.rider_active_delivery_count(
  target_rider_id uuid
) returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from private.rider_delivery_assignments as assignment
  join public.deliveries as active_delivery
    on active_delivery.delivery_id = assignment.delivery_id
  where assignment.rider_id = target_rider_id
    and active_delivery.delivery_status not in (
      'completed', 'delivered', 'cancelled', 'failed', 'returned'
    )
$$;
create or replace function private.rider_is_eligible_for_delivery(
  target_delivery_id bigint,
  target_rider_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.riders as rider
    where rider.rider_id = target_rider_id
      and rider.availability_status = 'online'
      and private.rider_current_location_is_fresh(rider.rider_id)
      and private.rider_is_visible_for_delivery(target_delivery_id, rider.rider_id)
  )
$$;
create or replace function public.eligible_riders_for_current_farmer_order(
  p_seller_order_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_farmer bigint := private.current_farmer_user_id();
  target record;
begin
  if current_farmer is null then
    raise exception 'Only a farmer can choose a rider' using errcode = '42501';
  end if;
  perform private.process_rider_assignment_expirations();

  select fulfillment.delivery_id, fulfillment.pickup_lat,
    fulfillment.pickup_long, fulfillment.dropoff_lat,
    fulfillment.dropoff_long, fulfillment.total_weight_kg,
    fulfillment.required_vehicle_type, fulfillment.ready_at,
    farm.farm_location as pickup_address, farm.barangay as pickup_barangay,
    farm.city_municipality as pickup_municipality,
    farm.province as pickup_province,
    delivery.dropoff_location as destination,
    delivery.estimated_delivery_time as requested_schedule,
    null::numeric as proposed_fee,
    delivery.order_id
  into target
  from private.order_delivery_fulfillments as fulfillment
  join private.seller_order_registry as registry
    on registry.seller_order_id = fulfillment.seller_order_id
  join public.farms as farm on farm.farm_id = registry.seller_farm_id
  join public.deliveries as delivery
    on delivery.delivery_id = fulfillment.delivery_id
  where fulfillment.seller_order_id = btrim(p_seller_order_id)
    and farm.farmer_user_id = current_farmer;
  if target.delivery_id is null then
    raise exception 'The ready delivery was not found' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'order', jsonb_build_object(
      'seller_order_id', btrim(p_seller_order_id),
      'delivery_id', target.delivery_id,
      'pickup_address', target.pickup_address,
      'pickup_barangay', target.pickup_barangay,
      'pickup_municipality', target.pickup_municipality,
      'pickup_province', target.pickup_province,
      'destination', target.destination,
      'requested_schedule', coalesce(target.requested_schedule, target.ready_at),
      'proposed_delivery_fee', target.proposed_fee,
      'goods_summary', coalesce((
        select string_agg(
          format('%s %s %s', cart_item.quantity,
            coalesce(commodity.unit_type, 'unit'), commodity.commodity_name),
          ', ' order by commodity.commodity_name
        )
        from public.orders as order_record
        join public.cart_items as cart_item
          on cart_item.cart_item_id = order_record.cart_item_id
        join public.commodities as commodity
          on commodity.commodity_id = cart_item.commodity_id
        where order_record.client_order_id = btrim(p_seller_order_id)
      ), 'Farm produce')
    ),
    'riders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rider_id', candidate.rider_id,
        'name', candidate.rider_name,
        'profile_photo_path', candidate.profile_photo_url,
        'barangay', candidate.barangay,
        'municipality', candidate.city_municipality,
        'same_barangay', candidate.same_barangay,
        'same_municipality', candidate.same_municipality,
        'availability_status', candidate.availability_status,
        'is_requestable', candidate.is_requestable,
        'location_is_fresh', candidate.location_is_fresh,
        'current_location_updated_at', candidate.current_location_updated_at,
        'distance_km', candidate.distance_km,
        'estimated_arrival_minutes', case
          when candidate.distance_km is null then null
          else greatest(1, ceil(candidate.distance_km * 4))::integer
        end,
        'active_delivery_count', candidate.active_delivery_count,
        'rating', candidate.rating,
        'completed_deliveries', candidate.total_deliveries,
        'proposed_delivery_fee', target.proposed_fee
      ) order by candidate.is_requestable desc,
        candidate.distance_km asc nulls last,
        candidate.active_delivery_count asc,
        candidate.same_municipality desc,
        candidate.same_barangay desc,
        candidate.rating desc,
        candidate.total_deliveries desc,
        candidate.rider_name)
      from (
        select rider.rider_id,
          coalesce(nullif(btrim(rider.full_name), ''),
            concat_ws(' ', rider.first_name, rider.last_name), 'Rider'
          ) as rider_name,
          rider.profile_photo_url,
          coalesce(rider.availability_status, 'offline') as availability_status,
          private.rider_is_eligible_for_delivery(
            target.delivery_id, rider.rider_id
          ) as is_requestable,
          private.rider_current_location_is_fresh(rider.rider_id)
            as location_is_fresh,
          current_location.location_updated_at as current_location_updated_at,
          coalesce(nullif(btrim(rider.barangay), ''),
            nullif(btrim(split_part(coalesce(rider.location_label, ''), ',', 1)), '')
          ) as barangay,
          coalesce(nullif(btrim(rider.city_municipality), ''),
            case when strpos(lower(coalesce(rider.location_label, '')),
                lower(btrim(target.pickup_municipality))) > 0
              then target.pickup_municipality
            else null end
          ) as city_municipality,
          (
            lower(btrim(coalesce(rider.city_municipality, '')))
              = lower(btrim(target.pickup_municipality))
            or strpos(lower(coalesce(rider.location_label, '')),
              lower(btrim(target.pickup_municipality))) > 0
          ) as same_municipality,
          nullif(btrim(target.pickup_barangay), '') is not null
            and (
              lower(btrim(coalesce(rider.barangay, '')))
                = lower(btrim(target.pickup_barangay))
              or strpos(lower(coalesce(rider.location_label, '')),
                lower(btrim(target.pickup_barangay))) > 0
            ) as same_barangay,
          private.rider_distance_from_current_location_km(
            target.pickup_lat::double precision,
            target.pickup_long::double precision,
            rider.rider_id
          ) as distance_km,
          private.rider_active_delivery_count(rider.rider_id)
            as active_delivery_count,
          coalesce(rider.rating, 0) as rating,
          coalesce(rider.total_deliveries, 0) as total_deliveries
        from public.riders as rider
        left join public.rider_locations as current_location
          on current_location.rider_id = rider.rider_id
        where private.rider_is_visible_for_delivery(
          target.delivery_id, rider.rider_id
        )
      ) as candidate
    ), '[]'::jsonb)
  );
end;
$$;
do $$
declare
  request_definition text;
begin
  select pg_get_functiondef(
    'public.request_current_farmer_rider(text,uuid,timestamp with time zone,numeric)'::regprocedure
  ) into request_definition;
  if request_definition is null then
    raise exception 'Rider request function is missing';
  end if;
  request_definition := replace(
    request_definition,
    'private.rider_can_receive_assignment_request(',
    'private.rider_is_eligible_for_delivery('
  );
  request_definition := replace(
    request_definition,
    'private.rider_is_visible_for_delivery(',
    'private.rider_is_eligible_for_delivery('
  );
  request_definition := replace(
    request_definition,
    'The selected rider can no longer receive delivery requests',
    'This rider is no longer available. Please choose another rider.'
  );
  request_definition := replace(
    request_definition,
    'The selected rider is no longer eligible or available',
    'This rider is no longer available. Please choose another rider.'
  );
  execute request_definition;
end
$$;
revoke all on function private.rider_current_location_is_fresh(uuid),
  private.rider_distance_from_current_location_km(double precision, double precision, uuid),
  private.rider_active_delivery_count(uuid)
  from public, anon, authenticated;
grant execute on function public.eligible_riders_for_current_farmer_order(text),
  public.request_current_farmer_rider(text, uuid, timestamptz, numeric)
  to authenticated;
notify pgrst, 'reload schema';
commit;
