begin;
alter table public.orders
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_by_role text,
  add column if not exists cancelled_by_auth_user_id uuid,
  add column if not exists cancelled_at timestamptz;
alter table public.orders
  drop constraint if exists orders_cancelled_by_role_check;
alter table public.orders
  add constraint orders_cancelled_by_role_check check (
    cancelled_by_role is null or cancelled_by_role in ('buyer', 'farmer', 'admin')
  );
alter table private.order_acceptance_events
  drop constraint if exists order_acceptance_events_event_type_check;
alter table private.order_acceptance_events
  add constraint order_acceptance_events_event_type_check check (event_type in (
    'halfway_reminder', 'deadline_reminder', 'expired',
    'expired_payment_reviewed', 'refunded', 'farmer_cancelled'
  ));
create or replace function private.cancel_current_farmer_order(
  target_seller_order_id text,
  cancellation_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_farmer bigint := private.current_farmer_user_id();
  current_auth_user uuid := (select auth.uid());
  clean_order_id text := nullif(btrim(target_seller_order_id), '');
  clean_reason text := nullif(btrim(cancellation_reason), '');
  target_buyer bigint;
  target_farm bigint;
  target_delivery_id bigint;
  target_delivery_status text;
  assigned_rider uuid;
  buyer_auth_user uuid;
  representative_order_id bigint;
  cancelled_time timestamptz := now();
  released record;
begin
  if current_farmer is null then
    raise exception 'An authenticated farmer account is required'
      using errcode = '42501';
  end if;
  if clean_order_id is null then
    raise exception 'The order identifier is required' using errcode = '22023';
  end if;
  if clean_reason is null or clean_reason not in (
    'Out of stock', 'Product unavailable', 'Unable to fulfill on time',
    'Farm emergency', 'Other operational issue'
  ) then
    raise exception 'Select a valid cancellation reason' using errcode = '22023';
  end if;

  select registry.buyer_user_id, registry.seller_farm_id
  into target_buyer, target_farm
  from private.seller_order_registry as registry
  join public.farms as farm on farm.farm_id = registry.seller_farm_id
  where registry.seller_order_id = clean_order_id
    and farm.farmer_user_id = current_farmer;
  if target_buyer is null then
    raise exception 'The farmer order was not found' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_buyer::text || ':' || clean_order_id, 0)
  );

  perform 1
  from public.orders as order_record
  where order_record.client_order_id = clean_order_id
    and order_record.seller_farm_id = target_farm
  order by order_record.order_id
  for update;
  if not found then
    raise exception 'The farmer order was not found' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.orders as order_record
    where order_record.client_order_id = clean_order_id
      and order_record.seller_farm_id = target_farm
      and order_record.order_status in ('delivered', 'completed', 'cancelled')
  ) then
    raise exception 'Completed or cancelled orders cannot be cancelled'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from public.orders as order_record
    where order_record.client_order_id = clean_order_id
      and order_record.seller_farm_id = target_farm
      and order_record.order_status not in (
        'toPay', 'toShip', 'pending', 'placed', 'reserved',
        'preparing', 'readyForPickup'
      )
  ) then
    raise exception 'This order has entered delivery and cannot be cancelled here'
      using errcode = '22023';
  end if;

  select fulfillment.delivery_id into target_delivery_id
  from private.order_delivery_fulfillments as fulfillment
  where fulfillment.buyer_user_id = target_buyer
    and fulfillment.seller_order_id = clean_order_id;
  if target_delivery_id is not null then
    select delivery.delivery_status into target_delivery_status
    from public.deliveries as delivery
    where delivery.delivery_id = target_delivery_id
    for update;
    if target_delivery_status not in (
      'pending', 'available', 'accepted', 'going_to_pickup',
      'arrived_at_pickup'
    ) then
      raise exception 'This delivery has already been picked up and cannot be cancelled here'
        using errcode = '22023';
    end if;
    select assignment.rider_id into assigned_rider
    from private.rider_delivery_assignments as assignment
    where assignment.delivery_id = target_delivery_id;
  end if;

  for released in
    select cart_item.commodity_id, sum(cart_item.quantity) as quantity
    from public.orders as order_record
    join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    where order_record.client_order_id = clean_order_id
      and order_record.seller_farm_id = target_farm
      and order_record.stock_reserved_at is not null
      and order_record.stock_released_at is null
    group by cart_item.commodity_id
    order by cart_item.commodity_id
  loop
    update public.commodities
    set available_quantity = available_quantity + released.quantity
    where commodity_id = released.commodity_id;
  end loop;

  update public.orders as order_record
  set order_status = 'cancelled',
      cancellation_reason = clean_reason,
      cancelled_by_role = 'farmer',
      cancelled_by_auth_user_id = current_auth_user,
      cancelled_at = cancelled_time,
      stock_released_at = case when stock_reserved_at is not null
        then coalesce(stock_released_at, cancelled_time)
        else stock_released_at end,
      updated_at = cancelled_time
  where order_record.client_order_id = clean_order_id
    and order_record.seller_farm_id = target_farm;

  select min(order_record.order_id) into representative_order_id
  from public.orders as order_record
  where order_record.client_order_id = clean_order_id
    and order_record.seller_farm_id = target_farm;

  if target_delivery_id is not null then
    perform set_config('app.delivery_remarks', clean_reason, true);
    update public.deliveries
    set delivery_status = 'cancelled'
    where delivery_id = target_delivery_id;

    insert into private.delivery_status_events (
      delivery_id, idempotency_key, previous_status, new_status,
      remarks, changed_at
    ) values (
      target_delivery_id, 'farmer-cancel:' || clean_order_id,
      target_delivery_status, 'cancelled', clean_reason, cancelled_time
    ) on conflict do nothing;

    update public.rider_assignment_requests
    set status = 'cancelled', responded_at = coalesce(responded_at, cancelled_time),
      failure_reason = 'Order cancelled by farmer: ' || clean_reason
    where delivery_id = target_delivery_id
      and status in ('pending', 'accepted');

    delete from private.rider_delivery_assignments
    where delivery_id = target_delivery_id;

    update public.delivery_payments
    set earning_status = 'cancelled', updated_at = cancelled_time
    where delivery_id = target_delivery_id and payout_status <> 'paid';
  end if;

  if assigned_rider is not null then
    update public.riders as rider
    set availability_status = case when exists (
      select 1
      from private.rider_delivery_assignments as assignment
      join public.deliveries as delivery
        on delivery.delivery_id = assignment.delivery_id
      where assignment.rider_id = assigned_rider
        and delivery.delivery_status in (
          'accepted', 'going_to_pickup', 'arrived_at_pickup', 'picked_up',
          'going_to_delivery', 'arrived_at_delivery'
        )
    ) then 'busy' else 'online' end
    where rider.rider_id = assigned_rider;
  end if;

  insert into private.order_acceptance_events (
    seller_order_id, event_type, occurred_at, metadata
  ) values (
    clean_order_id, 'farmer_cancelled', cancelled_time,
    jsonb_build_object(
      'cancellation_reason', clean_reason,
      'cancelled_by', 'farmer',
      'cancelled_by_auth_user_id', current_auth_user,
      'cancelled_at', cancelled_time,
      'delivery_id', target_delivery_id,
      'rider_id', assigned_rider
    )
  );

  select identity.auth_user_id into buyer_auth_user
  from private.auth_identities as identity
  where identity.buyer_user_id = target_buyer;
  if buyer_auth_user is not null then
    insert into public.notifications (
      recipient_auth_user_id, title, description, notification_type,
      category, destination, order_id, metadata
    ) values (
      buyer_auth_user, 'Order cancelled by farmer',
      'The farmer cancelled your order. Reason: ' || clean_reason,
      'order_cancelled', 'orders', 'orders', representative_order_id,
      jsonb_build_object(
        'event_id', clean_order_id || ':farmer_cancelled',
        'client_order_id', clean_order_id,
        'cancellation_reason', clean_reason,
        'cancelled_by', 'farmer',
        'cancelled_at', cancelled_time
      )
    );
  end if;

  return jsonb_build_object(
    'order_id', clean_order_id,
    'status', 'cancelled',
    'cancellation_reason', clean_reason,
    'cancelled_by', 'farmer',
    'cancelled_at', cancelled_time,
    'released_rider_id', assigned_rider
  );
end
$$;
create or replace function public.cancel_current_farmer_order(
  p_seller_order_id text,
  p_cancellation_reason text
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.cancel_current_farmer_order(
    p_seller_order_id, p_cancellation_reason
  )
$$;
create or replace function private.current_account_cancellation_snapshots()
returns jsonb language sql stable security definer set search_path = '' as $$
  with actor as (
    select private.current_buyer_user_id() as buyer_user_id,
      private.current_farmer_user_id() as farmer_user_id
  ), visible as (
    select distinct on (order_record.client_order_id)
      order_record.client_order_id,
      order_record.cancellation_reason,
      order_record.cancelled_by_role as cancelled_by,
      order_record.cancelled_at
    from public.orders as order_record
    join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    join public.farms as farm on farm.farm_id = order_record.seller_farm_id
    cross join actor
    where order_record.cancelled_at is not null
      and ((actor.buyer_user_id is not null
          and cart.buyer_user_id = actor.buyer_user_id)
        or (actor.farmer_user_id is not null
          and farm.farmer_user_id = actor.farmer_user_id))
    order by order_record.client_order_id,
      order_record.cancelled_at desc,
      order_record.order_id desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'orderId', client_order_id,
    'cancellationReason', cancellation_reason,
    'cancelledBy', cancelled_by,
    'cancelledAt', cancelled_at
  ) order by cancelled_at desc), '[]'::jsonb)
  from visible
$$;
create or replace function public.current_account_cancellation_snapshots()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.current_account_cancellation_snapshots()
$$;
revoke all on function private.cancel_current_farmer_order(text, text),
  private.current_account_cancellation_snapshots()
  from public, anon, authenticated;
revoke all on function public.cancel_current_farmer_order(text, text),
  public.current_account_cancellation_snapshots()
  from public, anon;
grant execute on function public.cancel_current_farmer_order(text, text),
  public.current_account_cancellation_snapshots()
  to authenticated;
notify pgrst, 'reload schema';
commit;
