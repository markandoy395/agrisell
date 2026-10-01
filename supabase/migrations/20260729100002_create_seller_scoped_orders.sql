begin;
create or replace function private.create_buyer_checkout(
  target_buyer_id bigint,
  requested_order_id text,
  order_record jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  checkout_id text := private.checkout_reference(requested_order_id);
  delivery_address text := nullif(btrim(order_record ->> 'deliveryAddress'), '');
  delivery_latitude double precision :=
    nullif(btrim(order_record ->> 'deliveryLatitude'), '')::double precision;
  delivery_longitude double precision :=
    nullif(btrim(order_record ->> 'deliveryLongitude'), '')::double precision;
  contact_number text := nullif(btrim(order_record ->> 'phoneNumber'), '');
  target_cart_id bigint;
  target_cart_item_id bigint;
  target_order_id bigint;
  target_seller_order_id text;
  resolved_seller_order_id text;
  commodity_record public.commodities%rowtype;
  item_group record;
  key_created boolean := false;
begin
  if requested_order_id is null
     or length(requested_order_id) not between 8 and 120
     or requested_order_id !~ '^[A-Za-z0-9-]+$' then
    raise exception 'The checkout identifier is invalid' using errcode = '22023';
  end if;
  if coalesce(order_record ->> 'status', '') <> 'toShip' then
    raise exception 'A new order must start in To Ship' using errcode = '22023';
  end if;
  if delivery_address is null then
    raise exception 'A delivery address is required' using errcode = '22023';
  end if;
  if delivery_latitude is null or delivery_latitude not between -90 and 90
     or delivery_longitude is null
     or delivery_longitude not between -180 and 180 then
    raise exception 'Confirm an exact delivery map location'
      using errcode = '22023';
  end if;
  if jsonb_typeof(order_record -> 'items') <> 'array'
     or jsonb_array_length(order_record -> 'items') = 0 then
    raise exception 'An order must contain at least one item' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(order_record -> 'items') as item
    where coalesce(item ->> 'productId', '') !~ '^[0-9]+$'
      or coalesce(item ->> 'quantity', '') !~ '^[0-9]+([.][0-9]+)?$'
      or (item ->> 'quantity')::numeric <= 0
  ) then
    raise exception 'Every order item needs a valid product and quantity'
      using errcode = '22023';
  end if;

  insert into private.order_checkout_keys (buyer_user_id, request_id)
  values (target_buyer_id, requested_order_id)
  on conflict do nothing returning true into key_created;
  if not coalesce(key_created, false) then return; end if;

  insert into public.carts (buyer_user_id, cart_status)
  values (target_buyer_id, 'ordered') returning cart_id into target_cart_id;

  for item_group in
    select (item ->> 'productId')::bigint as commodity_id,
           sum((item ->> 'quantity')::numeric) as quantity
    from jsonb_array_elements(order_record -> 'items') as item
    group by (item ->> 'productId')::bigint
    order by (item ->> 'productId')::bigint
  loop
    select commodity.* into commodity_record
    from public.commodities as commodity
    where commodity.commodity_id = item_group.commodity_id
    for update;
    if not found then
      raise exception 'A selected product is no longer available'
        using errcode = '22023';
    end if;
    if lower(coalesce(commodity_record.commodity_status, 'available'))
         <> 'available'
       or commodity_record.availability_status = 'not_accepting_orders'
       or coalesce(commodity_record.available_quantity, 0) <= 0 then
      raise exception '% is not accepting orders', commodity_record.commodity_name
        using errcode = '22023';
    end if;
    if item_group.quantity > commodity_record.available_quantity then
      raise exception 'Only % % of % remains',
        commodity_record.available_quantity,
        coalesce(commodity_record.unit_type, 'unit'),
        commodity_record.commodity_name using errcode = '22023';
    end if;
    if commodity_record.minimum_order_quantity is not null
       and item_group.quantity < commodity_record.minimum_order_quantity then
      raise exception 'The minimum order for % is % %',
        commodity_record.commodity_name,
        commodity_record.minimum_order_quantity,
        coalesce(commodity_record.unit_type, 'unit') using errcode = '22023';
    end if;
    if commodity_record.price_per_unit is null
       or commodity_record.price_per_unit < 0 then
      raise exception '% does not have a valid price', commodity_record.commodity_name
        using errcode = '22023';
    end if;

    target_seller_order_id := checkout_id || '-F' || commodity_record.farm_id;
    if resolved_seller_order_id is not null
       and resolved_seller_order_id <> target_seller_order_id then
      raise exception 'Each submitted order must contain products from one farmer'
        using errcode = '22023';
    end if;
    resolved_seller_order_id := target_seller_order_id;
    if requested_order_id ~ '-F[0-9]+$'
       and requested_order_id <> target_seller_order_id then
      raise exception 'Each submitted order must contain products from one farmer'
        using errcode = '22023';
    end if;

    insert into private.seller_order_registry (
      seller_order_id, buyer_user_id, seller_farm_id, checkout_reference
    ) values (
      target_seller_order_id, target_buyer_id, commodity_record.farm_id,
      checkout_id
    ) on conflict do nothing;
    if not exists (
      select 1 from private.seller_order_registry as registry
      where registry.seller_order_id = target_seller_order_id
        and registry.buyer_user_id = target_buyer_id
        and registry.seller_farm_id = commodity_record.farm_id
        and registry.checkout_reference = checkout_id
    ) then
      raise exception 'Seller order identifier collision; retry checkout'
        using errcode = '40001';
    end if;

    insert into public.cart_items (
      cart_id, commodity_id, quantity, price_at_time
    ) values (
      target_cart_id, item_group.commodity_id, item_group.quantity,
      commodity_record.price_per_unit
    ) returning cart_item_id into target_cart_item_id;

    insert into public.orders (
      cart_item_id, client_order_id, checkout_reference, seller_farm_id,
      order_date, order_status, total_amount, payment_status,
      delivery_address, delivery_latitude, delivery_longitude,
      payment_method, contact_number, stock_reserved_at
    ) values (
      target_cart_item_id, target_seller_order_id, checkout_id,
      commodity_record.farm_id, now(), 'toShip',
      commodity_record.price_per_unit * item_group.quantity,
      'pending', delivery_address, delivery_latitude, delivery_longitude,
      'cash_on_delivery', contact_number, now()
    ) returning order_id into target_order_id;

    insert into public.order_items (order_id, quantity, unit_price, total_price)
    values (
      target_order_id, item_group.quantity, commodity_record.price_per_unit,
      commodity_record.price_per_unit * item_group.quantity
    );
    update public.commodities
    set available_quantity = available_quantity - item_group.quantity
    where commodity_id = item_group.commodity_id;
  end loop;
end;
$$;
revoke all on function private.create_buyer_checkout(bigint, text, jsonb)
  from public, anon, authenticated;
commit;
