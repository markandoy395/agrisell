begin;
create or replace function private.current_rider_deliveries(
  include_available boolean default true
) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
    to_jsonb(delivery) || jsonb_build_object(
      'assigned_to_current_rider', assignment.rider_id is not null,
      'payment_method', payment_summary.payment_method,
      'payment_status', payment_summary.payment_status,
      'amount_to_collect', case
        when payment_summary.payment_method = 'cash_on_delivery'
          then payment_summary.order_total
        else null
      end,
      'locations', case when fulfillment.delivery_id is null then '[]'::jsonb
        else jsonb_build_array(
          jsonb_build_object(
            'location_id', 'pickup-' || delivery.delivery_id,
            'delivery_id', delivery.delivery_id,
            'location_type', 'pickup', 'address', delivery.pickup_location,
            'latitude', fulfillment.pickup_lat,
            'longitude', fulfillment.pickup_long,
            'contact_number', fulfillment.pickup_contact,
            'sequence_number', 1, 'created_at', fulfillment.ready_at,
            'updated_at', fulfillment.ready_at
          ),
          jsonb_build_object(
            'location_id', 'dropoff-' || delivery.delivery_id,
            'delivery_id', delivery.delivery_id,
            'location_type', 'dropoff', 'address', delivery.dropoff_location,
            'latitude', fulfillment.dropoff_lat,
            'longitude', fulfillment.dropoff_long,
            'contact_number', fulfillment.dropoff_contact,
            'sequence_number', 1, 'created_at', fulfillment.ready_at,
            'updated_at', fulfillment.ready_at
          )
        ) end,
      'requirement', case when fulfillment.delivery_id is null then null
        else jsonb_build_object(
          'requirement_id', 'requirement-' || delivery.delivery_id,
          'delivery_id', delivery.delivery_id,
          'required_vehicle_type', fulfillment.required_vehicle_type,
          'minimum_capacity_kg', fulfillment.total_weight_kg,
          'requires_cooling', coalesce(delivery.cold_chain_available, false),
          'requires_fragile_handling', true,
          'requires_waterproof_cover', true,
          'requires_special_handling', true,
          'handling_notes', fulfillment.handling_notes,
          'cancellation_conditions', 'Cancellation closes once a rider is assigned.',
          'created_at', fulfillment.ready_at,
          'updated_at', fulfillment.ready_at
        ) end,
      'history', coalesce((
        select jsonb_agg(
          to_jsonb(event) || jsonb_build_object(
            'status_history_id', event.idempotency_key,
            'created_at', event.changed_at
          ) order by event.changed_at
        )
        from private.delivery_status_events as event
        where event.delivery_id = delivery.delivery_id
      ), '[]'::jsonb)
    ) order by delivery.created_at desc
  ), '[]'::jsonb)
  from public.deliveries as delivery
  left join private.rider_delivery_assignments as assignment
    on assignment.delivery_id = delivery.delivery_id
      and assignment.rider_id = private.current_rider_id()
  left join private.order_delivery_fulfillments as fulfillment
    on fulfillment.delivery_id = delivery.delivery_id
  left join lateral (
    select
      (array_agg(order_record.payment_method order by order_record.order_id))[1]
        as payment_method,
      (array_agg(order_record.payment_status order by order_record.order_id))[1]
        as payment_status,
      sum(order_record.total_amount) as order_total
    from public.orders as order_record
    join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    where order_record.client_order_id = fulfillment.seller_order_id
      and cart.buyer_user_id = fulfillment.buyer_user_id
  ) as payment_summary on true
  where assignment.rider_id is not null or (
    include_available and delivery.delivery_status = 'available'
    and fulfillment.delivery_id is not null
    and not exists (
      select 1 from private.rider_delivery_assignments as claimed
      where claimed.delivery_id = delivery.delivery_id
    )
  )
$$;
create or replace function private.accept_delivery(
  p_delivery_id bigint, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_rider uuid := private.current_rider_id();
  target public.deliveries%rowtype;
  previous_status text;
begin
  if current_rider is null then
    raise exception 'Rider identity required' using errcode = '42501';
  end if;
  select * into target from public.deliveries
  where delivery_id = p_delivery_id for update;
  if not found then raise exception 'Delivery not found' using errcode = '22023'; end if;

  if exists (
    select 1 from private.rider_delivery_assignments
    where delivery_id = p_delivery_id and rider_id <> current_rider
  ) then
    raise exception 'Delivery is no longer available' using errcode = '40001';
  end if;
  if exists (
    select 1 from private.delivery_status_events
    where delivery_id = p_delivery_id
      and idempotency_key = p_idempotency_key::text
      and new_status = 'accepted'
  ) then
    return to_jsonb(target) || jsonb_build_object(
      'assigned_to_current_rider', true,
      'idempotency_key', p_idempotency_key
    );
  end if;
  if target.delivery_status <> 'available' then
    raise exception 'Delivery is no longer available' using errcode = '40001';
  end if;
  if not exists (
    select 1 from public.riders where rider_id = current_rider
      and employment_status = 'active' and availability_status = 'online'
  ) then
    raise exception 'Rider is not eligible and available' using errcode = '22023';
  end if;

  previous_status := target.delivery_status;
  insert into private.rider_delivery_assignments (
    delivery_id, rider_id, assigned_at
  ) values (p_delivery_id, current_rider, now());
  update public.deliveries set delivery_status = 'accepted'
  where delivery_id = p_delivery_id returning * into target;
  insert into private.delivery_status_events (
    delivery_id, idempotency_key, previous_status, new_status
  ) values (
    p_delivery_id, p_idempotency_key::text, previous_status, 'accepted'
  );
  update public.riders set availability_status = 'busy'
  where rider_id = current_rider;
  return to_jsonb(target) || jsonb_build_object(
    'assigned_to_current_rider', true,
    'idempotency_key', p_idempotency_key
  );
end;
$$;
revoke all on function private.current_rider_deliveries(boolean)
  from public, anon;
revoke all on function private.accept_delivery(bigint, uuid)
  from public, anon;
grant execute on function private.current_rider_deliveries(boolean)
  to authenticated;
grant execute on function private.accept_delivery(bigint, uuid)
  to authenticated;
notify pgrst, 'reload schema';
commit;
