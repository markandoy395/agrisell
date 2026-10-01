begin;

-- requested_schedule and estimated_delivery_time are planning timestamps, not
-- acceptance deadlines. A Rider may accept while the assignment request is
-- pending; only its expires_at value or an explicit delivery_deadline closes
-- that window.
create or replace function private.validate_delivery_batch_acceptance(
  p_delivery_id bigint,
  p_rider_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  rider_record public.riders%rowtype;
  target_delivery public.deliveries%rowtype;
  target_fulfillment private.order_delivery_fulfillments%rowtype;
  target_request public.rider_assignment_requests%rowtype;
  active_count integer;
  active_weight numeric;
  active_minutes integer;
  target_payment_method text;
begin
  select * into rider_record from public.riders
  where rider_id = p_rider_id for update;
  if not found then
    raise exception 'Rider profile not found' using errcode = '22023';
  end if;

  select * into target_delivery from public.deliveries
  where delivery_id = p_delivery_id for update;
  if not found then
    raise exception 'Delivery not found' using errcode = '22023';
  end if;

  if exists (
    select 1 from private.rider_delivery_assignments
    where delivery_id = p_delivery_id and rider_id = p_rider_id
  ) then
    return;
  end if;

  select * into target_fulfillment
  from private.order_delivery_fulfillments
  where delivery_id = p_delivery_id;

  select * into target_request
  from public.rider_assignment_requests
  where delivery_id = p_delivery_id and rider_id = p_rider_id
    and status in ('pending', 'accepted')
  order by requested_at desc limit 1;

  if target_request.request_id is null then
    raise exception 'delivery_request_missing' using errcode = '22023';
  end if;

  select count(*), coalesce(sum(fulfillment.total_weight_kg), 0),
    coalesce(ceil(sum(greatest(
      coalesce(delivery.distance_km, 0) / 25 * 60, 0
    )))::integer, 0)
  into active_count, active_weight, active_minutes
  from private.rider_delivery_assignments as assignment
  join public.deliveries as delivery
    on delivery.delivery_id = assignment.delivery_id
  left join private.order_delivery_fulfillments as fulfillment
    on fulfillment.delivery_id = delivery.delivery_id
  where assignment.rider_id = p_rider_id
    and delivery.delivery_status in (
      'accepted', 'going_to_pickup', 'arrived_at_pickup', 'picked_up',
      'going_to_delivery', 'arrived_at_delivery'
    );

  if active_count >= greatest(rider_record.maximum_active_deliveries, 1) then
    raise exception 'active_delivery_limit_reached' using errcode = '22023';
  end if;
  if active_count > 0 and (
    rider_record.capacity_kg is null
    or active_weight + target_fulfillment.total_weight_kg
      > rider_record.capacity_kg
  ) then
    raise exception 'capacity_conflict' using errcode = '22023';
  end if;
  if target_fulfillment.required_vehicle_type is not null
      and lower(replace(target_fulfillment.required_vehicle_type, '-', ''))
        <> lower(replace(rider_record.vehicle_type, '-', '')) then
    raise exception 'vehicle_type_conflict' using errcode = '22023';
  end if;

  if target_request.expires_at <= now() then
    raise exception 'delivery_request_expired' using errcode = '22023';
  end if;
  if target_delivery.delivery_deadline is not null
      and target_delivery.delivery_deadline <= now() then
    raise exception 'deadline_conflict' using errcode = '22023';
  end if;
  if active_count > 0
      and target_delivery.delivery_deadline is not null
      and now() + make_interval(mins => active_minutes + 10)
        > target_delivery.delivery_deadline then
    raise exception 'route_incompatible' using errcode = '22023';
  end if;
  if active_count > 0 and coalesce(target_delivery.cold_chain_available, false)
      and not ('temperatureSensitive' = any(
        rider_record.handling_capability_keys
      )) then
    raise exception 'product_handling_conflict' using errcode = '22023';
  end if;

  select order_record.payment_method into target_payment_method
  from public.orders as order_record
  where order_record.client_order_id = target_fulfillment.seller_order_id
  order by order_record.order_id limit 1;
  if lower(coalesce(target_payment_method, '')) in (
      'cod', 'cash on delivery', 'cash_on_delivery'
    ) and not exists (
      select 1 from public.logistics_companies as company
      where company.logistics_company_id = rider_record.logistics_company_id
        and coalesce(company.cod_available, false)
    ) then
    raise exception 'cod_responsibility_unavailable' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.validate_delivery_batch_acceptance(bigint, uuid)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
