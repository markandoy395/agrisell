begin;

-- Expand event_type check constraint to permit manual_order_created
alter table private.admin_order_events drop constraint if exists admin_order_events_event_type_check;
alter table private.admin_order_events add constraint admin_order_events_event_type_check
  check (event_type in ('status_changed','cancellation_reviewed','refund_completed','exception_resolved','manual_order_created'));

create or replace function public.admin_create_manual_order(
  p_input jsonb,
  p_actor text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target_buyer_id bigint := nullif(btrim(coalesce(p_input->>'buyer_user_id', '')),'') ::bigint;
  customer_name text := nullif(btrim(coalesce(p_input->>'customer_name', '')),'');
  customer_email text := nullif(btrim(coalesce(p_input->>'customer_email', '')),'');
  contact_num text := nullif(btrim(coalesce(p_input->>'contact_number', '')),'');
  deliv_address text := nullif(btrim(coalesce(p_input->>'delivery_address', '')),'');
  deliv_lat double precision := coalesce(nullif(btrim(coalesce(p_input->>'delivery_latitude', '')),'') ::double precision, 14.5995);
  deliv_lng double precision := coalesce(nullif(btrim(coalesce(p_input->>'delivery_longitude', '')),'') ::double precision, 120.9842);
  pay_method text := lower(coalesce(nullif(btrim(coalesce(p_input->>'payment_method', '')),''), 'cash_on_delivery'));
  pay_ref text := nullif(btrim(coalesce(p_input->>'payment_reference', '')),'');
  pay_verified boolean := coalesce((p_input->>'payment_verified')::boolean, false);
  cmd_key text := nullif(btrim(coalesce(p_input->>'command_id', '')),'');
  notes text := nullif(btrim(coalesce(p_input->>'notes', '')),'');
  order_reason text := coalesce(nullif(btrim(coalesce(p_input->>'reason', '')),''), 'Admin manual/phone order creation');

  target_user_id bigint;
  target_cart_id bigint;
  target_cart_item_id bigint;
  target_order_id bigint;
  checkout_ref text;
  seller_order_id text;
  total_order_amount numeric(14,2) := 0;
  comm_record public.commodities%rowtype;
  item_record jsonb;
  item_comm_id bigint;
  item_qty numeric(14,3);
  first_farm_id bigint := null;
  resolved_payment_status text;
  resolved_buyer_name text;
begin
  if cmd_key is null or nullif(btrim(p_actor),'') is null then
    raise exception 'Command ID and authenticated actor are required' using errcode='22023';
  end if;

  if exists(select 1 from private.admin_order_events where command_id=cmd_key) then
    return public.admin_order_detail((select order_id from private.admin_order_events where command_id=cmd_key));
  end if;

  -- Validate payment method
  if pay_method not in ('cash_on_delivery', 'gcash') then
    raise exception 'Choose a supported payment method (cash_on_delivery or gcash)' using errcode='22023';
  end if;

  if pay_method = 'gcash' then
    if pay_verified then
      resolved_payment_status := 'verified';
    else
      resolved_payment_status := 'submitted_for_verification';
    end if;
  else
    resolved_payment_status := 'pending_collection';
  end if;

  -- Validate items array
  if jsonb_typeof(p_input->'items') <> 'array' or jsonb_array_length(p_input->'items') = 0 then
    raise exception 'An order must contain at least one item' using errcode='22023';
  end if;

  -- Resolve or create buyer
  if target_buyer_id is not null then
    select coalesce(nullif(btrim(u.first_name || ' ' || coalesce(u.last_name, '')), ''), 'Buyer ' || b.buyer_user_id),
           coalesce(deliv_address, b.shipping_address),
           coalesce(contact_num, u.contact_number)
    into resolved_buyer_name, deliv_address, contact_num
    from public.buyers b
    join public.users u on u.user_id = b.user_id
    where b.buyer_user_id = target_buyer_id;

    if not found then
      raise exception 'The selected buyer was not found' using errcode='22023';
    end if;
  else
    if customer_name is null then
      raise exception 'Customer name is required for manual customer orders' using errcode='22023';
    end if;
    if contact_num is null then
      raise exception 'Contact number is required' using errcode='22023';
    end if;

    -- Check if user already exists
    select b.buyer_user_id, coalesce(nullif(btrim(u.first_name || ' ' || coalesce(u.last_name, '')), ''), customer_name)
    into target_buyer_id, resolved_buyer_name
    from public.buyers b
    join public.users u on u.user_id = b.user_id
    where (customer_email is not null and lower(u.email) = lower(customer_email))
       or (u.contact_number = contact_num)
    limit 1;

    if target_buyer_id is null then
      insert into public.users (first_name, contact_number, email, account_status)
      values (
        customer_name,
        contact_num,
        coalesce(customer_email, 'phone_' || replace(replace(contact_num, '+', ''), ' ', '') || '@agrisell.local'),
        'active'
      ) returning user_id into target_user_id;

      insert into public.buyers (user_id, shipping_address, user_type)
      values (target_user_id, deliv_address, 'Buyer')
      returning buyer_user_id into target_buyer_id;

      resolved_buyer_name := customer_name;
    end if;
  end if;

  if deliv_address is null or length(btrim(deliv_address)) = 0 then
    raise exception 'A delivery address is required' using errcode='22023';
  end if;
  if contact_num is null or length(btrim(contact_num)) = 0 then
    raise exception 'A contact phone number is required' using errcode='22023';
  end if;

  -- Validate each item and check stock & single farm consistency
  for item_record in select * from jsonb_array_elements(p_input->'items')
  loop
    item_comm_id := nullif(btrim(coalesce(item_record->>'commodity_id', '')),'') ::bigint;
    item_qty := nullif(btrim(coalesce(item_record->>'quantity', '')),'') ::numeric;

    if item_comm_id is null or item_qty is null or item_qty <= 0 then
      raise exception 'Every item must have a valid commodity ID and quantity greater than zero' using errcode='22023';
    end if;

    select * into comm_record from public.commodities where commodity_id = item_comm_id for update;
    if not found then
      raise exception 'Product % is not available', item_comm_id using errcode='22023';
    end if;

    if lower(coalesce(comm_record.commodity_status, 'available')) <> 'available'
       or comm_record.availability_status = 'not_accepting_orders'
       or coalesce(comm_record.available_quantity, 0) <= 0 then
      raise exception '% is currently unavailable for order', comm_record.commodity_name using errcode='22023';
    end if;

    if item_qty > comm_record.available_quantity then
      raise exception 'Only % % of % is available in stock',
        comm_record.available_quantity, coalesce(comm_record.unit_type, 'unit'), comm_record.commodity_name
        using errcode='22023';
    end if;

    if comm_record.minimum_order_quantity is not null and item_qty < comm_record.minimum_order_quantity then
      raise exception 'The minimum order quantity for % is % %',
        comm_record.commodity_name, comm_record.minimum_order_quantity, coalesce(comm_record.unit_type, 'unit')
        using errcode='22023';
    end if;

    if first_farm_id is null then
      first_farm_id := comm_record.farm_id;
    elsif first_farm_id <> comm_record.farm_id then
      raise exception 'All items in an order must come from the same farm/farmer' using errcode='22023';
    end if;

    total_order_amount := total_order_amount + (comm_record.price_per_unit * item_qty);
  end loop;

  -- Create Cart
  insert into public.carts (buyer_user_id, cart_status)
  values (target_buyer_id, 'ordered')
  returning cart_id into target_cart_id;

  checkout_ref := 'MANUAL-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  seller_order_id := checkout_ref || '-F' || first_farm_id;

  insert into private.seller_order_registry (seller_order_id, buyer_user_id, seller_farm_id, checkout_reference)
  values (seller_order_id, target_buyer_id, first_farm_id, checkout_ref)
  on conflict do nothing;

  -- Insert cart items, deduct stock, and collect first cart_item_id
  for item_record in select * from jsonb_array_elements(p_input->'items')
  loop
    item_comm_id := (item_record->>'commodity_id')::bigint;
    item_qty := (item_record->>'quantity')::numeric;

    select * into comm_record from public.commodities where commodity_id = item_comm_id;

    insert into public.cart_items (cart_id, commodity_id, quantity, price_at_time)
    values (target_cart_id, item_comm_id, item_qty, comm_record.price_per_unit)
    returning cart_item_id into target_cart_item_id;

    update public.commodities
    set available_quantity = available_quantity - item_qty
    where commodity_id = item_comm_id;
  end loop;

  -- Insert into public.orders
  insert into public.orders (
    cart_item_id, client_order_id, checkout_reference, seller_farm_id,
    order_date, order_status, total_amount, payment_status,
    delivery_address, delivery_latitude, delivery_longitude,
    payment_method, contact_number, buyer_name_snapshot, stock_reserved_at
  ) values (
    target_cart_item_id, seller_order_id, checkout_ref, first_farm_id,
    now(), 'toShip', total_order_amount, resolved_payment_status,
    deliv_address, deliv_lat, deliv_lng,
    pay_method, contact_num, resolved_buyer_name, now()
  ) returning order_id into target_order_id;

  -- Insert order items
  for item_record in select * from jsonb_array_elements(p_input->'items')
  loop
    item_comm_id := (item_record->>'commodity_id')::bigint;
    item_qty := (item_record->>'quantity')::numeric;
    select * into comm_record from public.commodities where commodity_id = item_comm_id;

    insert into public.order_items (order_id, quantity, unit_price, total_price)
    values (target_order_id, item_qty, comm_record.price_per_unit, comm_record.price_per_unit * item_qty);
  end loop;

  -- Insert payment
  insert into public.payments (
    order_id, amount, payment_method, transaction_reference, payment_status
  ) values (
    target_order_id, total_order_amount, pay_method, pay_ref, resolved_payment_status
  );

  -- Record in private.admin_order_events
  insert into private.admin_order_events(
    order_id, command_id, actor, event_type, previous_status, new_status,
    previous_payment_status, new_payment_status, reason, metadata
  ) values (
    target_order_id, cmd_key, p_actor, 'manual_order_created', null, 'toShip',
    null, resolved_payment_status, order_reason,
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'admin_manual_order',
      'notes', notes,
      'buyer_user_id', target_buyer_id,
      'customer_name', resolved_buyer_name
    ))
  );

  return public.admin_order_detail(target_order_id);
end;
$$;

revoke all on function public.admin_create_manual_order(jsonb, text) from public, anon, authenticated;
grant execute on function public.admin_create_manual_order(jsonb, text) to service_role;
notify pgrst, 'reload schema';
commit;
