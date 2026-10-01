begin;
alter table public.orders
  add column if not exists buyer_name_snapshot text;
comment on column public.orders.buyer_name_snapshot is
  'Buyer display name captured when the order is created for historical seller records.';
create or replace function private.capture_order_buyer_name_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_name text;
begin
  select coalesce(
    nullif(btrim(concat_ws(
      ' ',
      nullif(account.first_name, ''),
      nullif(account.middle_name, ''),
      nullif(account.last_name, ''),
      nullif(account.extension_name, '')
    )), ''),
    nullif(btrim(account.email), '')
  )
  into resolved_name
  from public.cart_items as cart_item
  join public.carts as cart on cart.cart_id = cart_item.cart_id
  join public.buyers as buyer
    on buyer.buyer_user_id = cart.buyer_user_id
  join public.users as account on account.user_id = buyer.user_id
  where cart_item.cart_item_id = new.cart_item_id;

  new.buyer_name_snapshot := resolved_name;
  return new;
end;
$$;
drop trigger if exists capture_order_buyer_name_snapshot on public.orders;
create trigger capture_order_buyer_name_snapshot
before insert on public.orders
for each row execute function private.capture_order_buyer_name_snapshot();
update public.orders as order_record
set buyer_name_snapshot = identity.buyer_name
from (
  select
    cart_item.cart_item_id,
    coalesce(
      nullif(btrim(concat_ws(
        ' ',
        nullif(account.first_name, ''),
        nullif(account.middle_name, ''),
        nullif(account.last_name, ''),
        nullif(account.extension_name, '')
      )), ''),
      nullif(btrim(account.email), '')
    ) as buyer_name
  from public.cart_items as cart_item
  join public.carts as cart on cart.cart_id = cart_item.cart_id
  join public.buyers as buyer
    on buyer.buyer_user_id = cart.buyer_user_id
  join public.users as account on account.user_id = buyer.user_id
) as identity
where identity.cart_item_id = order_record.cart_item_id
  and nullif(btrim(order_record.buyer_name_snapshot), '') is null;
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
      min(cart.buyer_user_id)::text as buyer_id,
      (array_agg(
        coalesce(
          nullif(btrim(order_record.buyer_name_snapshot), ''),
          nullif(btrim(concat_ws(
            ' ',
            nullif(buyer_account.first_name, ''),
            nullif(buyer_account.middle_name, ''),
            nullif(buyer_account.last_name, ''),
            nullif(buyer_account.extension_name, '')
          )), ''),
          nullif(btrim(buyer_account.email), ''),
          'Buyer'
        )
        order by order_record.order_id
      ))[1] as buyer_name,
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
    join public.buyers as buyer
      on buyer.buyer_user_id = cart.buyer_user_id
    join public.users as buyer_account on buyer_account.user_id = buyer.user_id
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
        'buyerId', buyer_id,
        'buyerName', buyer_name,
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
revoke all on function private.capture_order_buyer_name_snapshot()
  from public, anon, authenticated;
revoke all on function private.current_farmer_orders() from public, anon;
grant execute on function private.current_farmer_orders() to authenticated;
notify pgrst, 'reload schema';
commit;
