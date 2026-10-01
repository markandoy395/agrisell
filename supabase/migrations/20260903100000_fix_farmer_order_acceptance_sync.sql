begin;
create or replace function private.sync_current_farmer_orders(order_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_farmer_id bigint;
  order_record jsonb;
  requested_order_id text;
  requested_status text;
begin
  if jsonb_typeof(order_payload) <> 'array' then
    raise exception 'Order payload must be an array' using errcode = '22023';
  end if;

  select identity.farmer_user_id into target_farmer_id
  from private.auth_identities as identity
  where identity.auth_user_id = (select auth.uid());

  if target_farmer_id is null then
    raise exception 'An authenticated farmer account is required'
      using errcode = '42501';
  end if;

  for order_record in select value from jsonb_array_elements(order_payload)
  loop
    requested_order_id := nullif(btrim(order_record ->> 'id'), '');
    requested_status := nullif(btrim(order_record ->> 'status'), '');

    if requested_order_id is null or requested_status is null then
      raise exception 'Every order requires an ID and status'
        using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.orders as existing_order
      join public.cart_items as cart_item
        on cart_item.cart_item_id = existing_order.cart_item_id
      join public.commodities as commodity
        on commodity.commodity_id = cart_item.commodity_id
      join public.farms as farm on farm.farm_id = commodity.farm_id
      where existing_order.client_order_id = requested_order_id
        and farm.farmer_user_id = target_farmer_id
    ) then
      raise exception 'The farmer order was not found' using errcode = '22023';
    end if;

    -- Account snapshots normalize legacy database statuses. Treat those aliases
    -- as unchanged so saving one accepted order does not try to mutate every
    -- other order in the farmer's snapshot.
    if not exists (
      select 1
      from public.orders as existing_order
      join public.cart_items as cart_item
        on cart_item.cart_item_id = existing_order.cart_item_id
      join public.commodities as commodity
        on commodity.commodity_id = cart_item.commodity_id
      join public.farms as farm on farm.farm_id = commodity.farm_id
      where existing_order.client_order_id = requested_order_id
        and farm.farmer_user_id = target_farmer_id
        and case lower(coalesce(existing_order.order_status, 'toship'))
          when 'pending' then 'toShip'
          when 'placed' then 'toShip'
          when 'to_ship' then 'toShip'
          when 'toship' then 'toShip'
          when 'ready_for_pickup' then 'readyForPickup'
          when 'readyforpickup' then 'readyForPickup'
          when 'in_transit' then 'shipping'
          when 'completed' then 'delivered'
          when 'canceled' then 'cancelled'
          else existing_order.order_status
        end <> requested_status
    ) then
      continue;
    end if;

    if requested_status = 'preparing' then
      if exists (
        select 1
        from public.orders as existing_order
        join public.cart_items as cart_item
          on cart_item.cart_item_id = existing_order.cart_item_id
        join public.commodities as commodity
          on commodity.commodity_id = cart_item.commodity_id
        join public.farms as farm on farm.farm_id = commodity.farm_id
        where existing_order.client_order_id = requested_order_id
          and farm.farmer_user_id = target_farmer_id
          and lower(existing_order.order_status) not in (
            'pending', 'placed', 'to_ship', 'toship', 'preparing'
          )
      ) then
        raise exception 'Only an awaiting order can be accepted'
          using errcode = '22023';
      end if;

      -- Normalize legacy awaiting states first. This also lets the acceptance
      -- deadline trigger establish a deadline before entering preparation.
      update public.orders as existing_order
      set order_status = 'toShip', updated_at = now()
      from public.cart_items as cart_item
      join public.commodities as commodity
        on commodity.commodity_id = cart_item.commodity_id
      join public.farms as farm on farm.farm_id = commodity.farm_id
      where existing_order.cart_item_id = cart_item.cart_item_id
        and existing_order.client_order_id = requested_order_id
        and farm.farmer_user_id = target_farmer_id
        and lower(existing_order.order_status) in ('pending', 'placed');

      update public.orders as existing_order
      set order_status = 'preparing', updated_at = now()
      from public.cart_items as cart_item
      join public.commodities as commodity
        on commodity.commodity_id = cart_item.commodity_id
      join public.farms as farm on farm.farm_id = commodity.farm_id
      where existing_order.cart_item_id = cart_item.cart_item_id
        and existing_order.client_order_id = requested_order_id
        and farm.farmer_user_id = target_farmer_id
        and lower(existing_order.order_status) in ('to_ship', 'toship');
    elsif requested_status = 'readyForPickup' then
      perform private.mark_farmer_order_ready(
        target_farmer_id, requested_order_id
      );
    else
      raise exception
        'Farmers can only accept orders or mark them ready for pickup'
        using errcode = '42501';
    end if;
  end loop;
end;
$$;
revoke all on function private.sync_current_farmer_orders(jsonb)
  from public, anon;
grant execute on function private.sync_current_farmer_orders(jsonb)
  to authenticated;
notify pgrst, 'reload schema';
commit;
