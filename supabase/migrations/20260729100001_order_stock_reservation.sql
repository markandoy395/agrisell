begin;
create or replace function private.checkout_reference(order_id text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(order_id, '-F[0-9]+$', '')
$$;
create or replace function private.cancel_buyer_seller_order(
  target_buyer_id bigint,
  target_seller_order_id text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  released record;
  target_delivery_id bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_buyer_id::text || ':' || target_seller_order_id, 0
    )
  );
  select fulfillment.delivery_id into target_delivery_id
  from private.order_delivery_fulfillments as fulfillment
  where fulfillment.buyer_user_id = target_buyer_id
    and fulfillment.seller_order_id = target_seller_order_id;
  if target_delivery_id is not null then
    perform 1 from public.deliveries
    where delivery_id = target_delivery_id for update;
    if exists (
      select 1 from private.rider_delivery_assignments as assignment
      where assignment.delivery_id = target_delivery_id
    ) then
      raise exception 'A rider is already assigned to this order'
        using errcode = '22023';
    end if;
  end if;

  perform 1
  from public.orders as order_record
  join public.cart_items as cart_item
    on cart_item.cart_item_id = order_record.cart_item_id
  join public.carts as cart on cart.cart_id = cart_item.cart_id
  where cart.buyer_user_id = target_buyer_id
    and order_record.client_order_id = target_seller_order_id
  order by order_record.order_id
  for update of order_record;

  if not found then raise exception 'Order not found' using errcode = '22023'; end if;
  if exists (
    select 1 from public.orders as order_record
    join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    where cart.buyer_user_id = target_buyer_id
      and order_record.client_order_id = target_seller_order_id
      and order_record.order_status not in (
        'toPay', 'toShip', 'preparing', 'readyForPickup', 'cancelled'
      )
  ) then
    raise exception 'This order can no longer be cancelled' using errcode = '22023';
  end if;

  for released in
    select cart_item.commodity_id, sum(cart_item.quantity) as quantity
    from public.orders as order_record
    join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    where cart.buyer_user_id = target_buyer_id
      and order_record.client_order_id = target_seller_order_id
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
      stock_released_at = case
        when stock_reserved_at is not null then coalesce(stock_released_at, now())
        else stock_released_at
      end,
      updated_at = now()
  from public.cart_items as cart_item
  join public.carts as cart on cart.cart_id = cart_item.cart_id
  where order_record.cart_item_id = cart_item.cart_item_id
    and cart.buyer_user_id = target_buyer_id
    and order_record.client_order_id = target_seller_order_id;

  update public.deliveries
  set delivery_status = 'cancelled'
  where delivery_id = target_delivery_id
    and delivery_status in ('pending', 'available');
end;
$$;
revoke all on function private.checkout_reference(text)
  from public, anon, authenticated;
revoke all on function private.cancel_buyer_seller_order(bigint, text)
  from public, anon, authenticated;
commit;
