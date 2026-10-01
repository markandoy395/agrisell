begin;

create or replace function private.mark_farmer_order_ready(
  target_farmer_id bigint,
  target_seller_order_id text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  order_details record;
  target_delivery_id bigint;
  target_buyer_id bigint;
  target_farm_id bigint;
  required_vehicle text;
begin
  select registry.buyer_user_id, registry.seller_farm_id
  into target_buyer_id, target_farm_id
  from private.seller_order_registry as registry
  join public.farms as farm on farm.farm_id = registry.seller_farm_id
  where registry.seller_order_id = target_seller_order_id
    and farm.farmer_user_id = target_farmer_id;
  if target_buyer_id is null then
    raise exception 'The farmer order was not found' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_buyer_id::text || ':' || target_seller_order_id, 0
    )
  );

  perform 1
  from public.orders as order_record
  join public.cart_items as cart_item
    on cart_item.cart_item_id = order_record.cart_item_id
  join public.carts as cart on cart.cart_id = cart_item.cart_id
  where order_record.client_order_id = target_seller_order_id
    and order_record.seller_farm_id = target_farm_id
    and cart.buyer_user_id = target_buyer_id
  order by order_record.order_id
  for update of order_record;
  if not found then raise exception 'The farmer order was not found'; end if;

  if exists (
    select 1 from public.orders as order_record
    join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    where order_record.client_order_id = target_seller_order_id
      and order_record.seller_farm_id = target_farm_id
      and cart.buyer_user_id = target_buyer_id
      and order_record.order_status not in ('preparing', 'readyForPickup')
  ) then
    raise exception 'Only a preparing order can be marked ready'
      using errcode = '22023';
  end if;

  select
    min(order_record.order_id) as representative_order_id,
    min(cart.buyer_user_id) as buyer_user_id,
    min(coalesce(nullif(farm.farm_location, ''), '')) as pickup_address,
    min(farm.gps_lat)::double precision as pickup_lat,
    min(farm.gps_long)::double precision as pickup_long,
    min(coalesce(nullif(order_record.delivery_address, ''), '')) as dropoff_address,
    min(order_record.delivery_latitude)::double precision as dropoff_lat,
    min(order_record.delivery_longitude)::double precision as dropoff_long,
    min(nullif(farmer.phone_number, '')) as pickup_contact,
    min(nullif(order_record.contact_number, '')) as dropoff_contact,
    sum(cart_item.quantity) as total_weight
  into order_details
  from public.orders as order_record
  join public.cart_items as cart_item
    on cart_item.cart_item_id = order_record.cart_item_id
  join public.carts as cart on cart.cart_id = cart_item.cart_id
  join public.commodities as commodity
    on commodity.commodity_id = cart_item.commodity_id
  join public.farms as farm on farm.farm_id = commodity.farm_id
  join public.farmers as farmer
    on farmer.farmer_user_id = farm.farmer_user_id
  where order_record.client_order_id = target_seller_order_id
    and order_record.seller_farm_id = target_farm_id
    and cart.buyer_user_id = target_buyer_id
    and farm.farmer_user_id = target_farmer_id;

  if order_details.pickup_address = ''
     or order_details.pickup_lat is null or order_details.pickup_long is null then
    raise exception 'Confirm the farm pickup address and map location first'
      using errcode = '22023';
  end if;
  if order_details.dropoff_address = ''
     or order_details.dropoff_lat is null or order_details.dropoff_long is null then
    raise exception 'The buyer must confirm a delivery map location first'
      using errcode = '22023';
  end if;

  select fulfillment.delivery_id into target_delivery_id
  from private.order_delivery_fulfillments as fulfillment
  where fulfillment.buyer_user_id = order_details.buyer_user_id
    and fulfillment.seller_order_id = target_seller_order_id;

  if target_delivery_id is null then
    required_vehicle := case
      when order_details.total_weight <= 30 then 'motorcycle'
      when order_details.total_weight <= 100 then 'tricycle'
      else 'van'
    end;
    insert into public.deliveries (
      order_id, delivery_status, estimated_delivery_time,
      vehicle_types, cold_chain_available, pickup_location, dropoff_location
    ) values (
      order_details.representative_order_id, 'available', now() + interval '1 day',
      required_vehicle, false, order_details.pickup_address,
      order_details.dropoff_address
    ) returning delivery_id into target_delivery_id;

    insert into private.order_delivery_fulfillments (
      buyer_user_id, seller_order_id, representative_order_id, delivery_id,
      pickup_lat, pickup_long, dropoff_lat, dropoff_long,
      pickup_contact, dropoff_contact, total_weight_kg,
      required_vehicle_type, handling_notes
    ) values (
      order_details.buyer_user_id, target_seller_order_id,
      order_details.representative_order_id, target_delivery_id,
      order_details.pickup_lat, order_details.pickup_long,
      order_details.dropoff_lat, order_details.dropoff_long,
      order_details.pickup_contact, order_details.dropoff_contact,
      order_details.total_weight, required_vehicle,
      'Protect produce from heat, rain, and crushing.'
    );
  end if;

  update public.orders as order_record
  set order_status = 'readyForPickup', updated_at = now()
  from public.cart_items as cart_item
  join public.commodities as commodity
    on commodity.commodity_id = cart_item.commodity_id
  join public.farms as farm on farm.farm_id = commodity.farm_id
  where order_record.cart_item_id = cart_item.cart_item_id
    and order_record.client_order_id = target_seller_order_id
    and order_record.seller_farm_id = target_farm_id
    and farm.farmer_user_id = target_farmer_id;
end;
$$;

revoke all on function private.mark_farmer_order_ready(bigint, text)
  from public, anon, authenticated;
commit;
