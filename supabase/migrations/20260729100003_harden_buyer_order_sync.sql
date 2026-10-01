begin;
create or replace function private.sync_current_buyer_orders(order_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_buyer_id bigint;
  order_record jsonb;
  seller_record record;
  requested_order_id text;
  requested_status text;
begin
  if jsonb_typeof(order_payload) <> 'array' then
    raise exception 'Order payload must be an array' using errcode = '22023';
  end if;
  select identity.buyer_user_id into target_buyer_id
  from private.auth_identities as identity
  where identity.auth_user_id = (select auth.uid());
  if target_buyer_id is null then
    raise exception 'An authenticated buyer account is required'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(order_payload) as submitted_order
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(submitted_order -> 'items') = 'array'
        then submitted_order -> 'items' else '[]'::jsonb end
    ) as item
    where coalesce(item ->> 'productId', '') !~ '^[0-9]+$'
  ) then
    raise exception 'An order contains an invalid product ID'
      using errcode = '22023';
  end if;

  perform 1
  from public.commodities as commodity
  where commodity.commodity_id in (
    select distinct (item ->> 'productId')::bigint
    from jsonb_array_elements(order_payload) as submitted_order
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(submitted_order -> 'items') = 'array'
        then submitted_order -> 'items' else '[]'::jsonb end
    ) as item
  )
  order by commodity.commodity_id
  for update;

  for order_record in select value from jsonb_array_elements(order_payload)
  loop
    requested_order_id := nullif(btrim(order_record ->> 'id'), '');
    requested_status := nullif(btrim(order_record ->> 'status'), '');
    if requested_order_id is null or requested_status is null then
      raise exception 'Every order requires an ID and status'
        using errcode = '22023';
    end if;
    if requested_status not in (
      'toPay', 'toShip', 'preparing', 'readyForPickup',
      'shipping', 'delivered', 'cancelled'
    ) then
      raise exception 'Unsupported order status: %', requested_status
        using errcode = '22023';
    end if;

    if exists (
      select 1 from public.orders as existing_order
      join public.cart_items as cart_item
        on cart_item.cart_item_id = existing_order.cart_item_id
      join public.carts as cart on cart.cart_id = cart_item.cart_id
      where existing_order.client_order_id = requested_order_id
        and cart.buyer_user_id = target_buyer_id
    ) then
      if requested_status = 'cancelled' then
        perform private.cancel_buyer_seller_order(
          target_buyer_id, requested_order_id
        );
      elsif exists (
        select 1 from public.orders as existing_order
        join public.cart_items as cart_item
          on cart_item.cart_item_id = existing_order.cart_item_id
        join public.carts as cart on cart.cart_id = cart_item.cart_id
        where existing_order.client_order_id = requested_order_id
          and cart.buyer_user_id = target_buyer_id
          and existing_order.order_status <> requested_status
      ) then
        raise exception 'Only the assigned fulfillment workflow can change this order status'
          using errcode = '42501';
      end if;
    elsif requested_order_id = private.checkout_reference(requested_order_id)
      and exists (
        select 1 from public.orders as existing_order
        join public.cart_items as cart_item
          on cart_item.cart_item_id = existing_order.cart_item_id
        join public.carts as cart on cart.cart_id = cart_item.cart_id
        where existing_order.checkout_reference = requested_order_id
          and cart.buyer_user_id = target_buyer_id
      ) then
      if requested_status = 'cancelled' then
        for seller_record in
          select distinct existing_order.client_order_id
          from public.orders as existing_order
          join public.cart_items as cart_item
            on cart_item.cart_item_id = existing_order.cart_item_id
          join public.carts as cart on cart.cart_id = cart_item.cart_id
          where existing_order.checkout_reference = requested_order_id
            and cart.buyer_user_id = target_buyer_id
          order by existing_order.client_order_id
        loop
          perform private.cancel_buyer_seller_order(
            target_buyer_id, seller_record.client_order_id
          );
        end loop;
      elsif exists (
        select 1 from public.orders as existing_order
        join public.cart_items as cart_item
          on cart_item.cart_item_id = existing_order.cart_item_id
        join public.carts as cart on cart.cart_id = cart_item.cart_id
        where existing_order.checkout_reference = requested_order_id
          and cart.buyer_user_id = target_buyer_id
          and existing_order.order_status <> requested_status
      ) then
        raise exception 'Reload this checkout to see its seller orders'
          using errcode = '40001';
      end if;
    else
      perform private.create_buyer_checkout(
        target_buyer_id, requested_order_id, order_record
      );
    end if;
  end loop;
end;
$$;
revoke all on function private.sync_current_buyer_orders(jsonb)
  from public, anon;
grant execute on function private.sync_current_buyer_orders(jsonb)
  to authenticated;
notify pgrst, 'reload schema';
commit;
