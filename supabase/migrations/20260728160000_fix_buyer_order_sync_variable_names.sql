begin;
create or replace function private.sync_current_buyer_orders(
  order_payload jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_buyer_id bigint;
  target_cart_id bigint;
  target_cart_item_id bigint;
  target_order_id bigint;
  requested_client_order_id text;
  requested_status text;
  requested_delivery_address text;
  requested_contact_number text;
  order_record jsonb;
  item_record jsonb;
  commodity_record public.commodities%rowtype;
  requested_commodity_id bigint;
  item_quantity numeric;
  item_count integer;
begin
  if jsonb_typeof(order_payload) <> 'array' then
    raise exception 'Order payload must be an array';
  end if;

  select identity.buyer_user_id into target_buyer_id
  from private.auth_identities as identity
  where identity.auth_user_id = (select auth.uid());

  if target_buyer_id is null then
    raise exception 'An authenticated buyer account is required';
  end if;

  for order_record in
    select value from jsonb_array_elements(order_payload)
  loop
    requested_client_order_id := nullif(btrim(order_record ->> 'id'), '');
    requested_status := nullif(btrim(order_record ->> 'status'), '');
    requested_delivery_address := nullif(
      btrim(order_record ->> 'deliveryAddress'),
      ''
    );
    requested_contact_number := nullif(
      btrim(order_record ->> 'phoneNumber'),
      ''
    );

    if requested_client_order_id is null or requested_status is null then
      raise exception 'Every order requires an ID and status';
    end if;

    if requested_status not in (
      'toPay', 'toShip', 'preparing', 'readyForPickup',
      'shipping', 'delivered', 'cancelled'
    ) then
      raise exception 'Unsupported order status: %', requested_status;
    end if;

    if exists (
      select 1
      from public.orders as existing_order
      join public.cart_items as cart_item
        on cart_item.cart_item_id = existing_order.cart_item_id
      join public.carts as cart on cart.cart_id = cart_item.cart_id
      where existing_order.client_order_id = requested_client_order_id
        and cart.buyer_user_id = target_buyer_id
    ) then
      update public.orders as existing_order
      set
        order_status = case
          when existing_order.order_status = requested_status
            then requested_status
          when requested_status = 'cancelled'
            and existing_order.order_status in (
              'toPay', 'toShip', 'preparing', 'readyForPickup'
            ) then 'cancelled'
          when requested_status = 'delivered'
            and existing_order.order_status = 'shipping' then 'delivered'
          else existing_order.order_status
        end,
        delivery_address = coalesce(
          requested_delivery_address,
          existing_order.delivery_address
        ),
        contact_number = coalesce(
          requested_contact_number,
          existing_order.contact_number
        ),
        is_rated = existing_order.is_rated
          or (
            coalesce((order_record ->> 'isRated')::boolean, false)
            and existing_order.order_status = 'delivered'
          ),
        updated_at = now()
      from public.cart_items as cart_item
      join public.carts as cart on cart.cart_id = cart_item.cart_id
      where existing_order.cart_item_id = cart_item.cart_item_id
        and existing_order.client_order_id = requested_client_order_id
        and cart.buyer_user_id = target_buyer_id;
      continue;
    end if;

    if requested_status <> 'toShip' then
      raise exception 'A new order must start in To Ship';
    end if;
    if jsonb_typeof(order_record -> 'items') <> 'array' then
      raise exception 'Every order requires an items array';
    end if;

    insert into public.carts (buyer_user_id, cart_status)
    values (target_buyer_id, 'ordered')
    returning cart_id into target_cart_id;

    item_count := 0;
    for item_record in
      select value from jsonb_array_elements(order_record -> 'items')
    loop
      if coalesce(item_record ->> 'productId', '') !~ '^[0-9]+$' then
        raise exception 'Order item has an invalid commodity ID';
      end if;
      requested_commodity_id := (item_record ->> 'productId')::bigint;
      item_quantity := coalesce((item_record ->> 'quantity')::numeric, 0);
      if item_quantity <= 0 then
        raise exception 'Order item quantity must be greater than zero';
      end if;

      select commodity.* into commodity_record
      from public.commodities as commodity
      where commodity.commodity_id = requested_commodity_id;
      if not found then
        raise exception 'Commodity % is unavailable', requested_commodity_id;
      end if;

      insert into public.cart_items (
        cart_id,
        commodity_id,
        quantity,
        price_at_time
      ) values (
        target_cart_id,
        requested_commodity_id,
        item_quantity,
        commodity_record.price_per_unit
      ) returning cart_item_id into target_cart_item_id;

      insert into public.orders (
        cart_item_id,
        client_order_id,
        order_date,
        order_status,
        total_amount,
        payment_status,
        delivery_address,
        payment_method,
        contact_number
      ) values (
        target_cart_item_id,
        requested_client_order_id,
        now(),
        'toShip',
        commodity_record.price_per_unit * item_quantity,
        'pending',
        requested_delivery_address,
        'cash_on_delivery',
        requested_contact_number
      ) returning order_id into target_order_id;

      insert into public.order_items (
        order_id,
        quantity,
        unit_price,
        total_price
      ) values (
        target_order_id,
        item_quantity,
        commodity_record.price_per_unit,
        commodity_record.price_per_unit * item_quantity
      );
      item_count := item_count + 1;
    end loop;

    if item_count = 0 then
      raise exception 'An order must contain at least one item';
    end if;
  end loop;
end;
$$;
notify pgrst, 'reload schema';
commit;
