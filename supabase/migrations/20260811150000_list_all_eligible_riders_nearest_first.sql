begin;
-- Return every Rider who can currently receive this delivery. Distance is an
-- ordering value only; there is no directory cutoff or result limit here.
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
        'destination_supported', candidate.destination_supported,
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
      ) order by candidate.distance_km asc nulls last,
        candidate.active_delivery_count asc,
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
          private.rider_registered_location_is_available(rider.rider_id)
            as location_is_fresh,
          private.rider_registered_location_updated_at(rider.rider_id)
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
          private.rider_distance_from_registered_location_km(
            target.pickup_lat::double precision,
            target.pickup_long::double precision,
            rider.rider_id
          ) as distance_km,
          private.rider_active_delivery_count(rider.rider_id)
            as active_delivery_count,
          private.rider_registered_service_area_contains(
            target.pickup_lat::double precision,
            target.pickup_long::double precision,
            rider.rider_id
          ) and private.rider_registered_service_area_contains(
            target.dropoff_lat::double precision,
            target.dropoff_long::double precision,
            rider.rider_id
          ) as destination_supported,
          coalesce(rider.rating, 0) as rating,
          coalesce(rider.total_deliveries, 0) as total_deliveries
        from public.riders as rider
        where rider.employment_status = 'active'
          and rider.availability_status in ('online', 'busy')
          and private.rider_is_visible_for_delivery(
            target.delivery_id, rider.rider_id
          )
      ) as candidate
      where candidate.is_requestable
        and candidate.destination_supported
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.eligible_riders_for_current_farmer_order(text)
  from public, anon;
grant execute on function public.eligible_riders_for_current_farmer_order(text)
  to authenticated;
notify pgrst, 'reload schema';
commit;
