begin;
create or replace function private.sync_current_farmer_orders(
  order_payload jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_farmer_id bigint;
  order_record jsonb;
  client_order_id text;
  requested_status text;
  affected_count integer;
begin
  if jsonb_typeof(order_payload) <> 'array' then
    raise exception 'Order payload must be an array';
  end if;

  select identity.farmer_user_id into target_farmer_id
  from private.auth_identities as identity
  where identity.auth_user_id = (select auth.uid());
  if target_farmer_id is null then
    raise exception 'An authenticated farmer account is required';
  end if;

  for order_record in
    select value from jsonb_array_elements(order_payload)
  loop
    client_order_id := nullif(btrim(order_record ->> 'id'), '');
    requested_status := nullif(btrim(order_record ->> 'status'), '');
    if client_order_id is null or requested_status is null then
      raise exception 'Every order requires an ID and status';
    end if;

    if exists (
      select 1
      from public.orders as existing_order
      join public.cart_items as cart_item
        on cart_item.cart_item_id = existing_order.cart_item_id
      join public.commodities as commodity
        on commodity.commodity_id = cart_item.commodity_id
      join public.farms as farm on farm.farm_id = commodity.farm_id
      where existing_order.client_order_id = client_order_id
        and farm.farmer_user_id = target_farmer_id
        and not (
          existing_order.order_status = requested_status
          or (
            existing_order.order_status in ('pending', 'placed', 'toShip')
            and requested_status = 'preparing'
          )
          or (
            existing_order.order_status = 'preparing'
            and requested_status = 'readyForPickup'
          )
          or (
            existing_order.order_status = 'readyForPickup'
            and requested_status = 'shipping'
          )
        )
    ) then
      raise exception 'The requested farmer order transition is not allowed';
    end if;

    update public.orders as existing_order
    set
      order_status = requested_status,
      updated_at = now()
    from public.cart_items as cart_item
    join public.commodities as commodity
      on commodity.commodity_id = cart_item.commodity_id
    join public.farms as farm on farm.farm_id = commodity.farm_id
    where existing_order.cart_item_id = cart_item.cart_item_id
      and existing_order.client_order_id = client_order_id
      and farm.farmer_user_id = target_farmer_id;

    get diagnostics affected_count = row_count;
    if affected_count = 0 then
      raise exception 'The farmer order was not found';
    end if;
  end loop;
end;
$$;
create or replace function private.sync_current_account_orders(
  order_payload jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.current_buyer_user_id() is not null then
    perform private.sync_current_buyer_orders(order_payload);
    return;
  end if;
  if private.current_farmer_user_id() is not null then
    perform private.sync_current_farmer_orders(order_payload);
    return;
  end if;
  raise exception 'An authenticated buyer or farmer account is required';
end;
$$;
create or replace function public.sync_current_account_orders(
  order_payload jsonb
) returns void
language sql
security invoker
set search_path = ''
as $$
  select private.sync_current_account_orders(order_payload)
$$;
revoke all on function private.sync_current_farmer_orders(jsonb)
  from public, anon;
revoke all on function private.sync_current_account_orders(jsonb)
  from public, anon;
grant execute on function private.sync_current_farmer_orders(jsonb)
  to authenticated;
grant execute on function private.sync_current_account_orders(jsonb)
  to authenticated;
revoke all on function public.sync_current_account_orders(jsonb)
  from public, anon;
grant execute on function public.sync_current_account_orders(jsonb)
  to authenticated;
notify pgrst, 'reload schema';
commit;
