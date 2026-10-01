begin;
-- The rider chooser is a directory. Show every Rider who is registered in or
-- serves the pickup municipality/province; eligibility only controls whether
-- the Rider can receive a request from the Select button.
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
        'distance_km', candidate.distance_km,
        'rating', candidate.rating,
        'completed_deliveries', candidate.total_deliveries,
        'proposed_delivery_fee', target.proposed_fee
      ) order by candidate.same_municipality desc,
        candidate.same_barangay desc,
        candidate.is_requestable desc,
        candidate.distance_km asc nulls last,
        candidate.rating desc, candidate.total_deliveries desc,
        candidate.rider_name)
      from (
        select rider.rider_id,
          coalesce(nullif(btrim(rider.full_name), ''),
            concat_ws(' ', rider.first_name, rider.last_name), 'Rider') as rider_name,
          rider.profile_photo_url,
          coalesce(rider.availability_status, 'offline') as availability_status,
          private.rider_is_eligible_for_delivery(
            target.delivery_id, rider.rider_id
          ) as is_requestable,
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
          case when rider.gps_lat is not null and rider.gps_long is not null then
            6371 * acos(least(1, greatest(-1,
              sin(radians(target.pickup_lat)) *
                sin(radians(rider.gps_lat::double precision))
              + cos(radians(target.pickup_lat)) *
                cos(radians(rider.gps_lat::double precision))
              * cos(radians(rider.gps_long::double precision) -
                radians(target.pickup_long))
            )))
          end as distance_km,
          coalesce(rider.rating, 0) as rating,
          coalesce(rider.total_deliveries, 0) as total_deliveries
        from public.riders as rider
        left join public.logistics_companies as company
          on company.logistics_company_id = rider.logistics_company_id
        where (
          lower(btrim(coalesce(rider.city_municipality, '')))
            = lower(btrim(target.pickup_municipality))
          or strpos(
            lower(coalesce(rider.location_label, '')),
            lower(btrim(target.pickup_municipality))
          ) > 0
          or strpos(
            lower(coalesce(array_to_string(company.service_areas, ','), '')),
            lower(btrim(target.pickup_municipality))
          ) > 0
          or (
            nullif(btrim(target.pickup_province), '') is not null
            and lower(btrim(coalesce(rider.province, '')))
              = lower(btrim(target.pickup_province))
          )
          or (
            nullif(btrim(target.pickup_province), '') is not null
            and strpos(
              lower(coalesce(rider.location_label, '')),
              lower(btrim(target.pickup_province))
            ) > 0
          )
          or (
            nullif(btrim(target.pickup_province), '') is not null
            and strpos(
              lower(coalesce(array_to_string(company.service_areas, ','), '')),
              lower(btrim(target.pickup_province))
            ) > 0
          )
        )
      ) as candidate
    ), '[]'::jsonb)
  );
end;
$$;
grant execute on function public.eligible_riders_for_current_farmer_order(text)
  to authenticated;
commit;
