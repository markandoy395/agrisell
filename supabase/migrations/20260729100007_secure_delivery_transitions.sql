begin;
create or replace function private.update_delivery_status(
  p_delivery_id bigint,
  p_previous_status text,
  p_new_status text,
  p_idempotency_key text,
  p_remarks text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target public.deliveries%rowtype;
  event_record private.delivery_status_events%rowtype;
  changed_at timestamptz := now();
begin
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'An idempotency key is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from private.rider_delivery_assignments
    where delivery_id = p_delivery_id
      and rider_id = private.current_rider_id()
  ) then
    raise exception 'Only the assigned rider can update this delivery'
      using errcode = '42501';
  end if;
  select * into event_record
  from private.delivery_status_events
  where delivery_id = p_delivery_id
    and idempotency_key = p_idempotency_key;
  if found then
    if event_record.previous_status is distinct from p_previous_status
       or event_record.new_status is distinct from p_new_status then
      raise exception 'The idempotency key was already used'
        using errcode = '22023';
    end if;
    select * into target from public.deliveries
    where delivery_id = p_delivery_id;
    return jsonb_build_object(
      'delivery', to_jsonb(target),
      'history', to_jsonb(event_record) || jsonb_build_object(
        'status_history_id', event_record.idempotency_key,
        'created_at', event_record.changed_at
      )
    );
  end if;

  select * into target from public.deliveries
  where delivery_id = p_delivery_id for update;
  if not found then raise exception 'Delivery not found' using errcode = '22023'; end if;
  if target.delivery_status <> p_previous_status then
    raise exception 'Delivery status changed' using errcode = '40001';
  end if;
  if not (
    (p_previous_status = 'accepted' and p_new_status = 'going_to_pickup')
    or (p_previous_status = 'going_to_pickup' and p_new_status = 'arrived_at_pickup')
    or (p_previous_status = 'arrived_at_pickup' and p_new_status = 'picked_up')
    or (p_previous_status = 'picked_up' and p_new_status = 'going_to_delivery')
    or (p_previous_status = 'going_to_delivery' and p_new_status = 'arrived_at_delivery')
    or (p_previous_status = 'arrived_at_delivery' and p_new_status = 'completed')
    or (p_new_status in ('cancelled', 'failed')
      and p_previous_status not in ('completed', 'cancelled', 'failed'))
  ) then
    raise exception 'The requested delivery transition is not allowed'
      using errcode = '22023';
  end if;
  if p_new_status = 'completed' and exists (
    select 1 from private.order_delivery_fulfillments as fulfillment
    join public.orders as order_record
      on order_record.client_order_id = fulfillment.seller_order_id
    join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    join public.carts as cart
      on cart.cart_id = cart_item.cart_id
      and cart.buyer_user_id = fulfillment.buyer_user_id
    where fulfillment.delivery_id = p_delivery_id
      and order_record.payment_method = 'cash_on_delivery'
      and order_record.payment_status is distinct from 'verified'
  ) then
    raise exception 'Confirm and collect the cash payment before completion'
      using errcode = '22023';
  end if;

  update public.deliveries set
    delivery_status = p_new_status,
    actual_delivery_time = case
      when p_new_status = 'completed' then changed_at
      else actual_delivery_time
    end
  where delivery_id = p_delivery_id returning * into target;
  insert into private.delivery_status_events (
    delivery_id, idempotency_key, previous_status, new_status,
    remarks, latitude, longitude, changed_at
  ) values (
    p_delivery_id, p_idempotency_key, p_previous_status, p_new_status,
    p_remarks, p_latitude, p_longitude, changed_at
  ) returning * into event_record;

  if p_new_status in ('picked_up', 'completed') then
    update public.orders as order_record
    set order_status = case
          when p_new_status = 'picked_up' then 'shipping' else 'delivered'
        end,
        delivery_date = case
          when p_new_status = 'completed' then changed_at::date
          else delivery_date
        end,
        updated_at = changed_at
    from public.cart_items as cart_item
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    join private.order_delivery_fulfillments as fulfillment
      on fulfillment.buyer_user_id = cart.buyer_user_id
    where order_record.cart_item_id = cart_item.cart_item_id
      and fulfillment.delivery_id = p_delivery_id
      and order_record.client_order_id = fulfillment.seller_order_id
      and order_record.order_status = case
        when p_new_status = 'picked_up' then 'readyForPickup' else 'shipping'
      end;
  end if;
  if p_new_status in ('completed', 'cancelled', 'failed') then
    update public.riders set
      availability_status = 'online',
      total_deliveries = case when p_new_status = 'completed'
        then coalesce(total_deliveries, 0) + 1 else total_deliveries end
    where rider_id = private.current_rider_id();
  end if;
  return jsonb_build_object(
    'delivery', to_jsonb(target),
    'history', to_jsonb(event_record) || jsonb_build_object(
      'status_history_id', event_record.idempotency_key,
      'created_at', event_record.changed_at
    )
  );
end;
$$;
revoke all on function private.update_delivery_status(
  bigint, text, text, text, text, double precision, double precision
) from public, anon;
grant execute on function private.update_delivery_status(
  bigint, text, text, text, text, double precision, double precision
) to authenticated;
notify pgrst, 'reload schema';
commit;
