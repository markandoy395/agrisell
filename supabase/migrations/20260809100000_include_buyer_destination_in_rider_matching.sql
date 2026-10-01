begin;
create or replace function private.geo_distance_km(
  from_latitude double precision,
  from_longitude double precision,
  to_latitude double precision,
  to_longitude double precision
) returns double precision language sql immutable set search_path = '' as $$
  select case
    when from_latitude is null or from_longitude is null
      or to_latitude is null or to_longitude is null
      or from_latitude not between -90 and 90
      or to_latitude not between -90 and 90
      or from_longitude not between -180 and 180
      or to_longitude not between -180 and 180 then null
    else 6371 * acos(least(1, greatest(-1,
      sin(radians(from_latitude)) * sin(radians(to_latitude))
      + cos(radians(from_latitude)) * cos(radians(to_latitude))
      * cos(radians(to_longitude) - radians(from_longitude))
    )))
  end
$$;
create or replace function private.seller_order_current_delivery_location(
  target_seller_order_id text
) returns table (
  destination text,
  latitude double precision,
  longitude double precision
) language sql stable security definer set search_path = '' as $$
  select
    (array_agg(
      nullif(btrim(order_record.delivery_address), '')
      order by order_record.updated_at desc nulls last,
        order_record.order_id desc
    ))[1] as destination,
    (array_agg(
      order_record.delivery_latitude
      order by order_record.updated_at desc nulls last,
        order_record.order_id desc
    ))[1]::double precision as latitude,
    (array_agg(
      order_record.delivery_longitude
      order by order_record.updated_at desc nulls last,
        order_record.order_id desc
    ))[1]::double precision as longitude
  from public.orders as order_record
  where order_record.client_order_id = btrim(target_seller_order_id)
$$;
create or replace function private.rider_registered_service_area_contains(
  target_latitude double precision,
  target_longitude double precision,
  target_rider_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  -- The final Rider schema has no configurable radius. Keep this aligned with
  -- the mobile matching fallback used when serviceRadiusKm is unavailable.
  select exists (
    select 1
    from public.riders as rider
    where rider.rider_id = target_rider_id
      and target_latitude between -90 and 90
      and target_longitude between -180 and 180
      and rider.gps_lat between -90 and 90
      and rider.gps_long between -180 and 180
      and private.geo_distance_km(
        rider.gps_lat::double precision,
        rider.gps_long::double precision,
        target_latitude,
        target_longitude
      ) <= 15::double precision
  )
$$;
create or replace function private.refresh_delivery_destination_from_current_order(
  target_delivery_id bigint
) returns void language plpgsql security definer set search_path = '' as $$
declare
  current_destination record;
begin
  select latest.destination, latest.latitude, latest.longitude
  into current_destination
  from private.order_delivery_fulfillments as fulfillment
  cross join lateral private.seller_order_current_delivery_location(
    fulfillment.seller_order_id
  ) as latest
  where fulfillment.delivery_id = target_delivery_id;

  if current_destination.destination is null
      or current_destination.latitude is null
      or current_destination.latitude not between -90 and 90
      or current_destination.longitude is null
      or current_destination.longitude not between -180 and 180 then
    raise exception
      'The buyer''s delivery location needs to be confirmed before selecting a rider.'
      using errcode = '22023';
  end if;

  update private.order_delivery_fulfillments as fulfillment
  set dropoff_lat = current_destination.latitude,
      dropoff_long = current_destination.longitude
  where fulfillment.delivery_id = target_delivery_id;

  update public.deliveries as delivery
  set dropoff_location = current_destination.destination
  where delivery.delivery_id = target_delivery_id;
end
$$;
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
      and private.rider_current_location_is_fresh(rider.rider_id)
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
    fulfillment.pickup_long,
    latest_destination.latitude as dropoff_lat,
    latest_destination.longitude as dropoff_long,
    fulfillment.total_weight_kg,
    fulfillment.required_vehicle_type, fulfillment.ready_at,
    farm.farm_location as pickup_address, farm.barangay as pickup_barangay,
    farm.city_municipality as pickup_municipality,
    farm.province as pickup_province,
    latest_destination.destination as destination,
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
  cross join lateral private.seller_order_current_delivery_location(
    fulfillment.seller_order_id
  ) as latest_destination
  where fulfillment.seller_order_id = btrim(p_seller_order_id)
    and farm.farmer_user_id = current_farmer;
  if target.delivery_id is null then
    raise exception 'The ready delivery was not found' using errcode = '22023';
  end if;
  if target.destination is null
      or target.dropoff_lat is null
      or target.dropoff_lat not between -90 and 90
      or target.dropoff_long is null
      or target.dropoff_long not between -180 and 180 then
    raise exception
      'The buyer''s delivery location needs to be confirmed before selecting a rider.'
      using errcode = '22023';
  end if;
  perform private.refresh_delivery_destination_from_current_order(
    target.delivery_id
  );

  return jsonb_build_object(
    'order', jsonb_build_object(
      'seller_order_id', btrim(p_seller_order_id),
      'delivery_id', target.delivery_id,
      'pickup_address', target.pickup_address,
      'pickup_barangay', target.pickup_barangay,
      'pickup_municipality', target.pickup_municipality,
      'pickup_province', target.pickup_province,
      'destination', target.destination,
      'destination_latitude', target.dropoff_lat,
      'destination_longitude', target.dropoff_long,
      'route_distance_km', private.geo_distance_km(
        target.pickup_lat::double precision,
        target.pickup_long::double precision,
        target.dropoff_lat::double precision,
        target.dropoff_long::double precision
      ),
      'estimated_delivery_minutes', case
        when private.geo_distance_km(
          target.pickup_lat::double precision,
          target.pickup_long::double precision,
          target.dropoff_lat::double precision,
          target.dropoff_long::double precision
        ) is null then null
        else greatest(1, ceil(private.geo_distance_km(
          target.pickup_lat::double precision,
          target.pickup_long::double precision,
          target.dropoff_lat::double precision,
          target.dropoff_long::double precision
        ) * 4))::integer
      end,
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
        'destination_supported', true,
        'location_is_fresh', candidate.location_is_fresh,
        'current_location_updated_at', candidate.current_location_updated_at,
        'distance_km', candidate.distance_km,
        'estimated_arrival_minutes', case
          when candidate.distance_km is null then null
          else greatest(1, ceil(candidate.distance_km * 4))::integer
        end,
        'delivery_distance_km', private.geo_distance_km(
          target.pickup_lat::double precision,
          target.pickup_long::double precision,
          target.dropoff_lat::double precision,
          target.dropoff_long::double precision
        ),
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
          private.rider_current_location_updated_at(rider.rider_id)
            as current_location_updated_at,
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
        where private.rider_is_visible_for_delivery(
            target.delivery_id, rider.rider_id
          )
          and private.rider_registered_service_area_contains(
            target.pickup_lat::double precision,
            target.pickup_long::double precision,
            rider.rider_id
          )
          and private.rider_registered_service_area_contains(
            target.dropoff_lat::double precision,
            target.dropoff_long::double precision,
            rider.rider_id
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
    'if target.delivery_id is null then
    raise exception ''The ready delivery was not found'' using errcode = ''22023'';
  end if;',
    'if target.delivery_id is null then
    raise exception ''The ready delivery was not found'' using errcode = ''22023'';
  end if;
  perform private.refresh_delivery_destination_from_current_order(target.delivery_id);
  select delivery.dropoff_location into target.destination
  from public.deliveries as delivery
  where delivery.delivery_id = target.delivery_id;'
  );
  if request_definition not like
      '%refresh_delivery_destination_from_current_order%' then
    raise exception 'Rider request function was not patched for buyer destination refresh';
  end if;
  execute request_definition;
end
$$;
revoke all on function private.geo_distance_km(
  double precision, double precision, double precision, double precision
) from public, anon, authenticated;
revoke all on function private.seller_order_current_delivery_location(text)
  from public, anon, authenticated;
revoke all on function private.rider_registered_service_area_contains(
  double precision, double precision, uuid
) from public, anon, authenticated;
revoke all on function private.refresh_delivery_destination_from_current_order(
  bigint
) from public, anon, authenticated;
revoke all on function private.rider_is_eligible_for_delivery(bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.eligible_riders_for_current_farmer_order(text),
  public.request_current_farmer_rider(text, uuid, timestamptz, numeric)
  to authenticated;
notify pgrst, 'reload schema';
commit;
