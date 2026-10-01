begin;
create or replace function private.current_buyer_orders()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with buyer_identity as (
    select identity.buyer_user_id
    from private.auth_identities as identity
    where identity.auth_user_id = (select auth.uid())
  ),
  grouped_orders as (
    select
      coalesce(order_record.client_order_id, 'DB-' || order_record.order_id)
        as client_order_id,
      min(coalesce(order_record.order_date, order_record.created_at))
        as placed_at,
      (array_agg(
        case lower(coalesce(order_record.order_status, 'toship'))
          when 'to_pay' then 'toPay'
          when 'topay' then 'toPay'
          when 'pending' then 'toShip'
          when 'placed' then 'toShip'
          when 'to_ship' then 'toShip'
          when 'toship' then 'toShip'
          when 'preparing' then 'preparing'
          when 'ready_for_pickup' then 'readyForPickup'
          when 'readyforpickup' then 'readyForPickup'
          when 'shipping' then 'shipping'
          when 'in_transit' then 'shipping'
          when 'delivered' then 'delivered'
          when 'completed' then 'delivered'
          when 'cancelled' then 'cancelled'
          when 'canceled' then 'cancelled'
          else 'toShip'
        end
        order by order_record.order_id
      ))[1] as order_status,
      (array_agg(
        coalesce(order_record.delivery_address, '')
        order by order_record.order_id
      ))[1] as delivery_address,
      (array_agg(
        coalesce(order_record.contact_number, '')
        order by order_record.order_id
      ))[1] as contact_number,
      bool_or(order_record.is_rated) as is_rated,
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'productId', commodity.commodity_id::text,
            'productName', coalesce(commodity.commodity_name, 'Product'),
            'image', 'assets/images/vege.jpeg',
            'imageUrl', nullif(btrim(coalesce(commodity.image_url, '')), ''),
            'sellerName', coalesce(
              nullif(btrim(concat_ws(
                ' ',
                nullif(farmer.first_name, ''),
                nullif(farmer.middle_name, ''),
                nullif(farmer.last_name, ''),
                nullif(farmer.suffix, '')
              )), ''),
              nullif(farm.farm_name, ''),
              'Farmer'
            ),
            'pricePerKg', coalesce(
              cart_item.price_at_time,
              commodity.price_per_unit,
              0
            ),
            'unit', coalesce(commodity.unit_type, 'kg'),
            'quantity', cart_item.quantity
          )
        )
        order by order_record.order_id
      ) as items
    from public.orders as order_record
    join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    join buyer_identity as identity
      on identity.buyer_user_id = cart.buyer_user_id
    join public.commodities as commodity
      on commodity.commodity_id = cart_item.commodity_id
    join public.farms as farm on farm.farm_id = commodity.farm_id
    join public.farmers as farmer
      on farmer.farmer_user_id = farm.farmer_user_id
    group by coalesce(
      order_record.client_order_id,
      'DB-' || order_record.order_id
    )
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', client_order_id,
        'status', order_status,
        'placedAt', placed_at,
        'deliveryAddress', delivery_address,
        'phoneNumber', contact_number,
        'isRated', is_rated,
        'items', items
      )
      order by placed_at desc
    ),
    '[]'::jsonb
  )
  from grouped_orders
$$;
create or replace function private.current_farmer_orders()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with farmer_identity as (
    select identity.farmer_user_id
    from private.auth_identities as identity
    where identity.auth_user_id = (select auth.uid())
  ),
  grouped_orders as (
    select
      coalesce(order_record.client_order_id, 'DB-' || order_record.order_id)
        as client_order_id,
      min(coalesce(order_record.order_date, order_record.created_at))
        as placed_at,
      (array_agg(
        case lower(coalesce(order_record.order_status, 'toship'))
          when 'to_pay' then 'toPay'
          when 'topay' then 'toPay'
          when 'pending' then 'toShip'
          when 'placed' then 'toShip'
          when 'to_ship' then 'toShip'
          when 'toship' then 'toShip'
          when 'preparing' then 'preparing'
          when 'ready_for_pickup' then 'readyForPickup'
          when 'readyforpickup' then 'readyForPickup'
          when 'shipping' then 'shipping'
          when 'in_transit' then 'shipping'
          when 'delivered' then 'delivered'
          when 'completed' then 'delivered'
          when 'cancelled' then 'cancelled'
          when 'canceled' then 'cancelled'
          else 'toShip'
        end
        order by order_record.order_id
      ))[1] as order_status,
      (array_agg(
        coalesce(order_record.delivery_address, '')
        order by order_record.order_id
      ))[1] as delivery_address,
      (array_agg(
        coalesce(order_record.contact_number, '')
        order by order_record.order_id
      ))[1] as contact_number,
      bool_or(order_record.is_rated) as is_rated,
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'productId', commodity.commodity_id::text,
            'productName', coalesce(commodity.commodity_name, 'Product'),
            'image', 'assets/images/vege.jpeg',
            'imageUrl', nullif(btrim(coalesce(commodity.image_url, '')), ''),
            'sellerName', coalesce(
              nullif(farm.farm_name, ''),
              'Your farm'
            ),
            'pricePerKg', coalesce(
              cart_item.price_at_time,
              commodity.price_per_unit,
              0
            ),
            'unit', coalesce(commodity.unit_type, 'kg'),
            'quantity', cart_item.quantity
          )
        )
        order by order_record.order_id
      ) as items
    from public.orders as order_record
    join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    join public.commodities as commodity
      on commodity.commodity_id = cart_item.commodity_id
    join public.farms as farm on farm.farm_id = commodity.farm_id
    join farmer_identity as identity
      on identity.farmer_user_id = farm.farmer_user_id
    group by coalesce(
      order_record.client_order_id,
      'DB-' || order_record.order_id
    )
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', client_order_id,
        'status', order_status,
        'placedAt', placed_at,
        'deliveryAddress', delivery_address,
        'phoneNumber', contact_number,
        'isRated', is_rated,
        'items', items
      )
      order by placed_at desc
    ),
    '[]'::jsonb
  )
  from grouped_orders
$$;
revoke all on function private.current_buyer_orders() from public, anon;
revoke all on function private.current_farmer_orders() from public, anon;
grant execute on function private.current_buyer_orders() to authenticated;
grant execute on function private.current_farmer_orders() to authenticated;
notify pgrst, 'reload schema';
commit;
