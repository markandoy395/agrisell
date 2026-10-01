begin;
alter table public.commodities
  add column if not exists rating numeric(3,2) not null default 0;
alter table public.payments
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists refund_reference text,
  add column if not exists refunded_at timestamptz;
with ranked_payments as (
  select payment_id, row_number() over (
    partition by order_id
    order by coalesce(payment_date, created_at) desc, payment_id desc
  ) as row_rank
  from public.payments
)
delete from public.payments as payment
using ranked_payments as ranked
where payment.payment_id = ranked.payment_id and ranked.row_rank > 1;
with ranked_reviews as (
  select review_id, row_number() over (
    partition by order_id order by created_at desc, review_id desc
  ) as row_rank
  from public.reviews
)
delete from public.reviews as review
using ranked_reviews as ranked
where review.review_id = ranked.review_id and ranked.row_rank > 1;
create unique index if not exists payments_order_id_key
  on public.payments (order_id);
create unique index if not exists reviews_order_id_key
  on public.reviews (order_id);
create table if not exists private.gcash_verified_reference_claims (
  farmer_user_id bigint not null references public.farmers (farmer_user_id),
  normalized_reference text not null,
  buyer_user_id bigint not null references public.buyers (buyer_user_id),
  seller_order_id text not null references private.seller_order_registry (
    seller_order_id
  ),
  verified_at timestamptz not null default now(),
  primary key (farmer_user_id, normalized_reference),
  unique (seller_order_id)
);
alter table private.gcash_verified_reference_claims enable row level security;
revoke all on private.gcash_verified_reference_claims
  from public, anon, authenticated;
revoke insert, update, delete on public.reviews from authenticated;
revoke update (rating, comment) on public.reviews from authenticated;
revoke update (bank_details) on public.farmers from authenticated;
update public.orders set
  payment_method = case when lower(coalesce(payment_method, '')) = 'gcash'
    then 'gcash' else 'cash_on_delivery' end,
  payment_status = case
    when lower(coalesce(order_status, '')) in ('cancelled', 'canceled')
      and lower(coalesce(payment_status, '')) in ('verified', 'paid')
      then 'refund_required'
    when lower(coalesce(order_status, '')) in ('cancelled', 'canceled')
      then 'cancelled'
    when lower(coalesce(payment_status, '')) in ('verified', 'paid')
      then 'verified'
    when lower(coalesce(payment_method, '')) = 'gcash'
      then 'rejected'
    else 'pending_collection'
  end;
insert into public.payments (
  order_id, amount, payment_method, transaction_reference, payment_status
)
select order_id, total_amount, payment_method, null, payment_status
from public.orders
on conflict (order_id) do nothing;
update public.payments as payment
set amount = coalesce(payment.amount, order_record.total_amount),
  payment_method = order_record.payment_method,
  payment_status = order_record.payment_status,
  updated_at = now()
from public.orders as order_record
where payment.order_id = order_record.order_id;
insert into private.gcash_verified_reference_claims (
  farmer_user_id, normalized_reference, buyer_user_id, seller_order_id,
  verified_at
)
select distinct on (
  farm.farmer_user_id,
  regexp_replace(upper(btrim(payment.transaction_reference)), '[ _-]', '', 'g')
)
  farm.farmer_user_id,
  regexp_replace(upper(btrim(payment.transaction_reference)), '[ _-]', '', 'g'),
  cart.buyer_user_id,
  order_record.client_order_id,
  coalesce(payment.payment_date, payment.updated_at, payment.created_at)
from public.payments as payment
join public.orders as order_record on order_record.order_id = payment.order_id
join public.cart_items as cart_item
  on cart_item.cart_item_id = order_record.cart_item_id
join public.carts as cart on cart.cart_id = cart_item.cart_id
join public.farms as farm on farm.farm_id = order_record.seller_farm_id
where order_record.payment_method = 'gcash'
  and order_record.payment_status = 'verified'
  and nullif(btrim(payment.transaction_reference), '') is not null
order by farm.farmer_user_id,
  regexp_replace(upper(btrim(payment.transaction_reference)), '[ _-]', '', 'g'),
  order_record.order_id
on conflict do nothing;
create or replace function private.gcash_account_name(details jsonb)
returns text language sql immutable set search_path = '' as $$
  select coalesce(
    nullif(btrim(details #>> '{gcash,account_name}'), ''),
    nullif(btrim(details ->> 'gcash_account_name'), '')
  )
$$;
create or replace function private.gcash_account_number(details jsonb)
returns text language sql immutable set search_path = '' as $$
  select coalesce(
    nullif(btrim(details #>> '{gcash,account_number}'), ''),
    nullif(btrim(details #>> '{gcash,mobile_number}'), ''),
    nullif(btrim(details ->> 'gcash_account_number'), ''),
    nullif(btrim(details ->> 'gcash_mobile_number'), '')
  )
$$;
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
  payment_record jsonb := coalesce(order_record -> 'payment', '{}'::jsonb);
  requested_payment_method text := lower(coalesce(
    nullif(btrim(order_record #>> '{payment,method}'), ''), 'cash_on_delivery'
  ));
  payment_reference text := nullif(btrim(
    order_record #>> '{payment,transactionReference}'
  ), '');
  requested_payment_status text;
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
  if jsonb_typeof(payment_record) <> 'object'
     or requested_payment_method not in ('cash_on_delivery', 'gcash') then
    raise exception 'Choose a supported payment method' using errcode = '22023';
  end if;
  if requested_payment_method = 'gcash'
     and (payment_reference is null or length(payment_reference) not between 6 and 40
       or payment_reference !~ '^[A-Za-z0-9 _-]+$') then
    raise exception 'Enter a valid GCash reference number' using errcode = '22023';
  end if;
  requested_payment_status := case when requested_payment_method = 'gcash'
    then 'submitted_for_verification' else 'pending_collection' end;
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
    where commodity.commodity_id = item_group.commodity_id for update;
    if not found then
      raise exception 'A selected product is no longer available'
        using errcode = '22023';
    end if;
    if lower(coalesce(commodity_record.commodity_status, 'available')) <> 'available'
       or commodity_record.availability_status = 'not_accepting_orders'
       or coalesce(commodity_record.available_quantity, 0) <= 0 then
      raise exception '% is not accepting orders', commodity_record.commodity_name
        using errcode = '22023';
    end if;
    if item_group.quantity > commodity_record.available_quantity then
      raise exception 'Only % % of % remains', commodity_record.available_quantity,
        coalesce(commodity_record.unit_type, 'unit'), commodity_record.commodity_name
        using errcode = '22023';
    end if;
    if commodity_record.minimum_order_quantity is not null
       and item_group.quantity < commodity_record.minimum_order_quantity then
      raise exception 'The minimum order for % is % %',
        commodity_record.commodity_name, commodity_record.minimum_order_quantity,
        coalesce(commodity_record.unit_type, 'unit') using errcode = '22023';
    end if;
    if commodity_record.price_per_unit is null
       or commodity_record.price_per_unit < 0 then
      raise exception '% does not have a valid price', commodity_record.commodity_name
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(order_record -> 'items') as item
      where (item ->> 'productId')::bigint = item_group.commodity_id
        and (coalesce(item ->> 'pricePerKg', '') !~ '^[0-9]+([.][0-9]+)?$'
          or round((item ->> 'pricePerKg')::numeric, 2)
            <> round(commodity_record.price_per_unit, 2))
    ) then
      raise exception 'The price of % changed. Refresh your basket before paying',
        commodity_record.commodity_name using errcode = '22023';
    end if;
    if requested_payment_method = 'gcash' and not exists (
      select 1 from public.farms as farm
      join public.farmers as farmer
        on farmer.farmer_user_id = farm.farmer_user_id
      where farm.farm_id = commodity_record.farm_id
        and private.gcash_account_name(farmer.bank_details) is not null
        and private.gcash_account_number(farmer.bank_details) is not null
    ) then
      raise exception 'This farmer has not shared complete GCash details'
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
      commodity_record.farm_id,
      now(), 'toShip', commodity_record.price_per_unit * item_group.quantity,
      requested_payment_status, delivery_address, delivery_latitude,
      delivery_longitude, requested_payment_method, contact_number, now()
    ) returning order_id into target_order_id;
    insert into public.order_items (order_id, quantity, unit_price, total_price)
    values (target_order_id, item_group.quantity, commodity_record.price_per_unit,
      commodity_record.price_per_unit * item_group.quantity);
    insert into public.payments (
      order_id, amount, payment_method, transaction_reference, payment_status
    ) values (
      target_order_id, commodity_record.price_per_unit * item_group.quantity,
      requested_payment_method, payment_reference, requested_payment_status
    ) on conflict (order_id) do nothing;
    update public.commodities
    set available_quantity = available_quantity - item_group.quantity
    where commodity_id = item_group.commodity_id;
  end loop;
end;
$$;
create or replace function private.enforce_gcash_before_preparing()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.order_status = 'preparing' and old.order_status is distinct from 'preparing'
     and new.payment_method = 'gcash'
     and new.payment_status is distinct from 'verified' then
    raise exception 'Verify the buyer GCash reference before accepting this order'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists orders_require_verified_gcash on public.orders;
create trigger orders_require_verified_gcash before update of order_status
on public.orders for each row execute function private.enforce_gcash_before_preparing();
create or replace function private.sync_payment_on_order_cancellation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cancellation_status text;
begin
  if new.order_status <> 'cancelled' or old.order_status = 'cancelled' then
    return new;
  end if;
  cancellation_status := case when old.payment_status = 'verified'
    then 'refund_required' else 'cancelled' end;
  new.payment_status := cancellation_status;
  update public.payments as payment
  set payment_status = cancellation_status, updated_at = now()
  where payment.order_id = new.order_id;
  return new;
end;
$$;
drop trigger if exists orders_sync_cancelled_payment on public.orders;
create trigger orders_sync_cancelled_payment before update of order_status
on public.orders for each row
execute function private.sync_payment_on_order_cancellation();
create or replace function private.review_current_order_gcash_payment(
  target_client_order_id text,
  approved boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare target_farmer_id bigint;
declare decision text := case when approved then 'verified' else 'rejected' end;
declare target_buyer_id bigint;
declare normalized_reference text;
declare reference_count integer;
begin
  select identity.farmer_user_id into target_farmer_id
  from private.auth_identities as identity
  where identity.auth_user_id = (select auth.uid());
  if target_farmer_id is null then
    raise exception 'An authenticated farmer account is required'
      using errcode = '42501';
  end if;
  perform 1 from public.orders as order_record
  join public.farms as farm on farm.farm_id = order_record.seller_farm_id
  where order_record.client_order_id = target_client_order_id
    and farm.farmer_user_id = target_farmer_id
  order by order_record.order_id
  for update of order_record;
  if not exists (
    select 1 from public.orders as order_record
    join public.farms as farm on farm.farm_id = order_record.seller_farm_id
    join private.seller_order_registry as registry
      on registry.seller_order_id = order_record.client_order_id
      and registry.seller_farm_id = order_record.seller_farm_id
    where order_record.client_order_id = target_client_order_id
      and farm.farmer_user_id = target_farmer_id
      and order_record.payment_method = 'gcash'
      and order_record.payment_status = 'submitted_for_verification'
  ) then
    raise exception 'No submitted GCash reference is awaiting review'
      using errcode = '22023';
  end if;
  if approved then
    select min(cart.buyer_user_id),
      min(regexp_replace(upper(btrim(payment.transaction_reference)),
        '[ _-]', '', 'g')),
      count(distinct regexp_replace(upper(btrim(payment.transaction_reference)),
        '[ _-]', '', 'g'))
    into target_buyer_id, normalized_reference, reference_count
    from public.orders as order_record
    join public.payments as payment on payment.order_id = order_record.order_id
    join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    join public.farms as farm on farm.farm_id = order_record.seller_farm_id
    where order_record.client_order_id = target_client_order_id
      and farm.farmer_user_id = target_farmer_id
      and order_record.payment_method = 'gcash';
    if target_buyer_id is null or normalized_reference is null
       or normalized_reference = '' or reference_count <> 1 then
      raise exception 'The submitted GCash reference is inconsistent'
        using errcode = '22023';
    end if;
    insert into private.gcash_verified_reference_claims (
      farmer_user_id, normalized_reference, buyer_user_id, seller_order_id
    ) values (
      target_farmer_id, normalized_reference, target_buyer_id,
      target_client_order_id
    ) on conflict do nothing;
    if not exists (
      select 1 from private.gcash_verified_reference_claims as claim
      where claim.farmer_user_id = target_farmer_id
        and claim.normalized_reference = normalized_reference
        and claim.buyer_user_id = target_buyer_id
        and claim.seller_order_id = target_client_order_id
    ) then
      raise exception 'This GCash reference was already used for another order'
        using errcode = '22023';
    end if;
  end if;
  update public.orders as order_record set payment_status = decision, updated_at = now()
  from public.farms as farm
  where farm.farm_id = order_record.seller_farm_id
    and order_record.client_order_id = target_client_order_id
    and farm.farmer_user_id = target_farmer_id
    and order_record.payment_method = 'gcash'
    and order_record.payment_status = 'submitted_for_verification';
  update public.payments as payment set payment_status = decision,
    payment_date = case when approved then now() else null end,
    updated_at = now()
  from public.orders as order_record
  join public.farms as farm on farm.farm_id = order_record.seller_farm_id
  where payment.order_id = order_record.order_id
    and order_record.client_order_id = target_client_order_id
    and farm.farmer_user_id = target_farmer_id;
end;
$$;
create or replace function public.review_current_order_gcash_payment(
  client_order_id text, approved boolean
) returns void language sql security invoker set search_path = '' as $$
  select private.review_current_order_gcash_payment(client_order_id, approved)
$$;
create or replace function private.record_current_order_gcash_refund(
  target_client_order_id text,
  refund_transaction_reference text
) returns void language plpgsql security definer set search_path = '' as $$
declare target_farmer_id bigint := private.current_farmer_user_id();
declare clean_reference text := nullif(btrim(refund_transaction_reference), '');
begin
  if target_farmer_id is null then
    raise exception 'An authenticated farmer account is required'
      using errcode = '42501';
  end if;
  if clean_reference is null or length(clean_reference) not between 6 and 40
     or clean_reference !~ '^[A-Za-z0-9 _-]+$' then
    raise exception 'Enter a valid refund reference number'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.orders as order_record
    join public.farms as farm on farm.farm_id = order_record.seller_farm_id
    join private.seller_order_registry as registry
      on registry.seller_order_id = order_record.client_order_id
      and registry.seller_farm_id = order_record.seller_farm_id
    where order_record.client_order_id = target_client_order_id
      and farm.farmer_user_id = target_farmer_id
      and order_record.order_status = 'cancelled'
      and order_record.payment_method = 'gcash'
      and order_record.payment_status = 'refund_required'
  ) then
    raise exception 'No GCash refund is awaiting confirmation'
      using errcode = '22023';
  end if;
  update public.orders as order_record
  set payment_status = 'refunded', updated_at = now()
  from public.farms as farm
  where farm.farm_id = order_record.seller_farm_id
    and order_record.client_order_id = target_client_order_id
    and farm.farmer_user_id = target_farmer_id
    and order_record.order_status = 'cancelled'
    and order_record.payment_status = 'refund_required';
  update public.payments as payment
  set payment_status = 'refunded', refund_reference = clean_reference,
    refunded_at = now(), updated_at = now()
  from public.orders as order_record
  join public.farms as farm on farm.farm_id = order_record.seller_farm_id
  where payment.order_id = order_record.order_id
    and order_record.client_order_id = target_client_order_id
    and farm.farmer_user_id = target_farmer_id;
end;
$$;
create or replace function public.record_current_order_gcash_refund(
  client_order_id text, refund_reference text
) returns void language sql security invoker set search_path = '' as $$
  select private.record_current_order_gcash_refund(
    client_order_id, refund_reference
  )
$$;
create or replace function private.resubmit_current_order_gcash_reference(
  target_client_order_id text, replacement_reference text
) returns void language plpgsql security definer set search_path = '' as $$
declare target_buyer_id bigint := private.current_buyer_user_id();
declare clean_reference text := nullif(btrim(replacement_reference), '');
begin
  if target_buyer_id is null then
    raise exception 'An authenticated buyer account is required'
      using errcode = '42501';
  end if;
  if clean_reference is null or length(clean_reference) not between 6 and 40
     or clean_reference !~ '^[A-Za-z0-9 _-]+$' then
    raise exception 'Enter a valid GCash reference number' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.orders as order_record
    join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    where order_record.client_order_id = target_client_order_id
      and cart.buyer_user_id = target_buyer_id
      and order_record.payment_method = 'gcash'
      and order_record.payment_status = 'rejected'
  ) then
    raise exception 'No rejected GCash payment needs a new reference'
      using errcode = '22023';
  end if;
  update public.orders as order_record
  set payment_status = 'submitted_for_verification', updated_at = now()
  from public.cart_items as cart_item
  join public.carts as cart on cart.cart_id = cart_item.cart_id
  where order_record.cart_item_id = cart_item.cart_item_id
    and order_record.client_order_id = target_client_order_id
    and cart.buyer_user_id = target_buyer_id
    and order_record.payment_method = 'gcash'
    and order_record.payment_status = 'rejected';
  update public.payments as payment
  set transaction_reference = clean_reference,
    payment_status = 'submitted_for_verification', payment_date = null,
    updated_at = now()
  from public.orders as order_record
  join public.cart_items as cart_item
    on cart_item.cart_item_id = order_record.cart_item_id
  join public.carts as cart on cart.cart_id = cart_item.cart_id
  where payment.order_id = order_record.order_id
    and order_record.client_order_id = target_client_order_id
    and cart.buyer_user_id = target_buyer_id;
end;
$$;
create or replace function public.resubmit_current_order_gcash_reference(
  client_order_id text, transaction_reference text
) returns void language sql security invoker set search_path = '' as $$
  select private.resubmit_current_order_gcash_reference(
    client_order_id, transaction_reference
  )
$$;
create or replace function private.current_account_payment_snapshots()
returns jsonb language sql stable security definer set search_path = '' as $$
  with snapshots as (
    select order_record.client_order_id,
      (array_agg(order_record.payment_method order by order_record.order_id))[1] as method,
      (array_agg(order_record.payment_status order by order_record.order_id))[1] as status,
      (array_agg(coalesce(payment.transaction_reference, '')
        order by order_record.order_id))[1] as reference,
      (array_agg(coalesce(payment.refund_reference, '')
        order by order_record.order_id))[1] as refund_reference
    from public.orders as order_record
    left join public.payments as payment on payment.order_id = order_record.order_id
    where private.owns_order(order_record.order_id)
    group by order_record.client_order_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'orderId', client_order_id, 'method', method, 'status', status,
    'transactionReference', reference, 'refundReference', refund_reference
  )), '[]'::jsonb) from snapshots
$$;
create or replace function public.current_account_payment_snapshots()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.current_account_payment_snapshots()
$$;
create or replace function public.checkout_gcash_details(farm_ids bigint[])
returns table (
  farm_id bigint, farmer_name text, account_name text, account_number text
) language sql stable security definer set search_path = '' as $$
  select farm.farm_id,
    coalesce(nullif(btrim(concat_ws(' ', farmer.first_name, farmer.last_name)), ''),
      nullif(btrim(farm.farm_name), ''), 'Farmer'),
    private.gcash_account_name(farmer.bank_details),
    private.gcash_account_number(farmer.bank_details)
  from public.farms as farm
  join public.farmers as farmer on farmer.farmer_user_id = farm.farmer_user_id
  where farm.farm_id = any(farm_ids) and (select auth.uid()) is not null
    and lower(coalesce(farmer.verification_status, 'pending')) = 'verified'
    and lower(coalesce(farmer.account_status, 'active')) = 'active'
    and private.gcash_account_name(farmer.bank_details) is not null
    and private.gcash_account_number(farmer.bank_details) is not null
$$;
create or replace function private.current_farmer_gcash_details()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object(
      'farm_id', min(farm.farm_id),
      'farmer_name', coalesce(nullif(btrim(concat_ws(' ', farmer.first_name,
        farmer.last_name)), ''), 'Farmer'),
      'account_name', private.gcash_account_name(farmer.bank_details),
      'account_number', private.gcash_account_number(farmer.bank_details)
    )
    from public.farmers as farmer
    left join public.farms as farm on farm.farmer_user_id = farmer.farmer_user_id
    where farmer.farmer_user_id = private.current_farmer_user_id()
    group by farmer.farmer_user_id
  ), '{}'::jsonb)
$$;
create or replace function public.current_farmer_gcash_details()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.current_farmer_gcash_details()
$$;
create or replace function private.save_current_farmer_gcash_details(
  account_name text, account_number text
) returns void language plpgsql security definer set search_path = '' as $$
declare target_farmer_id bigint := private.current_farmer_user_id();
declare clean_name text := nullif(btrim(account_name), '');
declare clean_number text := nullif(btrim(account_number), '');
declare normalized_number text;
begin
  if target_farmer_id is null then
    raise exception 'An authenticated farmer account is required'
      using errcode = '42501';
  end if;
  normalized_number := regexp_replace(coalesce(clean_number, ''), '[ -]', '', 'g');
  if normalized_number ~ '^639[0-9]{9}$' then
    normalized_number := '+' || normalized_number;
  end if;
  if clean_name is null or length(clean_name) not between 2 and 80
     or normalized_number !~ '^(09[0-9]{9}|[+]639[0-9]{9})$' then
    raise exception 'Enter a valid GCash account name and mobile number'
      using errcode = '22023';
  end if;
  update public.farmers as farmer set bank_details = jsonb_set(
    coalesce(farmer.bank_details, '{}'::jsonb), '{gcash}',
    coalesce(farmer.bank_details -> 'gcash', '{}'::jsonb) ||
      jsonb_build_object('account_name', clean_name,
        'account_number', normalized_number),
    true
  ) where farmer.farmer_user_id = target_farmer_id;
end;
$$;
create or replace function public.save_current_farmer_gcash_details(
  account_name text, account_number text
) returns void language sql security invoker set search_path = '' as $$
  select private.save_current_farmer_gcash_details(account_name, account_number)
$$;
create or replace function private.refresh_order_commodity_rating()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_order_id bigint := coalesce(new.order_id, old.order_id);
declare target_commodity_id bigint;
begin
  select cart_item.commodity_id into target_commodity_id
  from public.orders as order_record
  join public.cart_items as cart_item
    on cart_item.cart_item_id = order_record.cart_item_id
  where order_record.order_id = target_order_id;
  update public.commodities as commodity set rating = coalesce((
    select round(avg(review.rating), 2)
    from public.reviews as review
    join public.orders as reviewed_order on reviewed_order.order_id = review.order_id
    join public.cart_items as reviewed_item
      on reviewed_item.cart_item_id = reviewed_order.cart_item_id
    where reviewed_item.commodity_id = target_commodity_id
  ), 0) where commodity.commodity_id = target_commodity_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists reviews_refresh_commodity_rating on public.reviews;
create trigger reviews_refresh_commodity_rating
after insert or update or delete on public.reviews for each row
execute function private.refresh_order_commodity_rating();
create or replace function private.sync_current_buyer_review_snapshots(
  order_payload jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare target_buyer_id bigint;
declare order_record jsonb;
declare feedback jsonb;
declare requested_order_id text;
declare requested_rating integer;
declare requested_comment text;
begin
  select identity.buyer_user_id into target_buyer_id
  from private.auth_identities as identity
  where identity.auth_user_id = (select auth.uid());
  if target_buyer_id is null then return; end if;
  if jsonb_typeof(order_payload) <> 'array' then
    raise exception 'Order payload must be an array' using errcode = '22023';
  end if;
  for order_record in select value from jsonb_array_elements(order_payload) loop
    feedback := order_record -> 'feedback';
    if feedback is null or jsonb_typeof(feedback) <> 'object' then continue; end if;
    requested_order_id := nullif(btrim(order_record ->> 'id'), '');
    requested_rating := coalesce((feedback ->> 'rating')::integer, 0);
    requested_comment := btrim(coalesce(feedback ->> 'comment', ''));
    if requested_order_id is null or requested_rating not between 1 and 5
       or length(requested_comment) > 500 then
      raise exception 'Feedback must use 1 to 5 stars and at most 500 characters'
        using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.orders as owned_order
      join public.cart_items as cart_item
        on cart_item.cart_item_id = owned_order.cart_item_id
      join public.carts as cart on cart.cart_id = cart_item.cart_id
      where owned_order.client_order_id = requested_order_id
        and cart.buyer_user_id = target_buyer_id
    ) or exists (
      select 1 from public.orders as incomplete_order
      join public.cart_items as cart_item
        on cart_item.cart_item_id = incomplete_order.cart_item_id
      join public.carts as cart on cart.cart_id = cart_item.cart_id
      where incomplete_order.client_order_id = requested_order_id
        and cart.buyer_user_id = target_buyer_id
        and incomplete_order.order_status <> 'delivered'
    ) then
      raise exception 'Only a delivered order can be reviewed' using errcode = '42501';
    end if;
    insert into public.reviews (order_id, rating, comment)
    select owned_order.order_id, requested_rating, nullif(requested_comment, '')
    from public.orders as owned_order
    join public.cart_items as cart_item
      on cart_item.cart_item_id = owned_order.cart_item_id
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    where owned_order.client_order_id = requested_order_id
      and cart.buyer_user_id = target_buyer_id
    on conflict (order_id) do nothing;
    update public.orders as owned_order set is_rated = true, updated_at = now()
    from public.cart_items as cart_item
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    where owned_order.cart_item_id = cart_item.cart_item_id
      and owned_order.client_order_id = requested_order_id
      and cart.buyer_user_id = target_buyer_id;
  end loop;
end;
$$;
create or replace function public.sync_current_buyer_review_snapshots(
  order_payload jsonb
) returns void language sql security invoker set search_path = '' as $$
  select private.sync_current_buyer_review_snapshots(order_payload)
$$;
create or replace function private.current_account_review_snapshots()
returns jsonb language sql stable security definer set search_path = '' as $$
  with snapshots as (
    select order_record.client_order_id,
      (array_agg(review.rating order by review.review_id))[1] as rating,
      (array_agg(coalesce(review.comment, '') order by review.review_id))[1] as comment,
      min(review.created_at) as submitted_at
    from public.orders as order_record
    join public.reviews as review on review.order_id = order_record.order_id
    where private.owns_order(order_record.order_id)
    group by order_record.client_order_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'orderId', client_order_id, 'rating', rating, 'comment', comment,
    'submittedAt', submitted_at
  )), '[]'::jsonb) from snapshots
$$;
create or replace function public.current_account_review_snapshots()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.current_account_review_snapshots()
$$;
create or replace function public.marketplace_product_reviews(
  target_commodity_id bigint
) returns jsonb language sql stable security definer set search_path = '' as $$
  with visible_reviews as (
    select review.review_id, review.rating, coalesce(review.comment, '') as comment,
      review.created_at, coalesce(
        nullif(btrim(concat_ws(' ', app_user.first_name,
          left(coalesce(app_user.last_name, ''), 1) ||
          case when app_user.last_name is null then '' else '.' end)), ''),
        'Verified buyer'
      ) as reviewer_name
    from public.reviews as review
    join public.orders as order_record on order_record.order_id = review.order_id
    join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    join public.buyers as buyer on buyer.buyer_user_id = cart.buyer_user_id
    join public.users as app_user on app_user.user_id = buyer.user_id
    where cart_item.commodity_id = target_commodity_id
      and order_record.order_status = 'delivered'
      and (select auth.uid()) is not null
  )
  select jsonb_build_object(
    'averageRating', coalesce(round(avg(rating), 2), 0),
    'reviewCount', count(*),
    'reviews', coalesce(jsonb_agg(jsonb_build_object(
      'reviewerName', reviewer_name, 'rating', rating, 'comment', comment,
      'submittedAt', created_at
    ) order by created_at desc), '[]'::jsonb)
  ) from visible_reviews
$$;
create or replace function public.marketplace_farmer_directory()
returns table (
  farm_id bigint, farmer_name text, farm_location text,
  profile_image_url text, cover_image_url text, rating numeric, products jsonb
) language sql stable security definer set search_path = '' as $$
  select farm.farm_id,
    coalesce(nullif(btrim(concat_ws(' ', farmer.first_name, farmer.middle_name,
      farmer.last_name, farmer.suffix)), ''), nullif(farm.farm_name, ''), 'Farmer'),
    coalesce(nullif(farm.farm_location, ''), 'Location unavailable'),
    farmer.profile_image_url, farm.farm_images[1],
    coalesce((select round(avg(review.rating), 2)
      from public.reviews as review
      join public.orders as rated_order on rated_order.order_id = review.order_id
      join public.cart_items as rated_item
        on rated_item.cart_item_id = rated_order.cart_item_id
      join public.commodities as rated_commodity
        on rated_commodity.commodity_id = rated_item.commodity_id
      where rated_commodity.farm_id = farm.farm_id
        and rated_order.order_status = 'delivered'), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'name', commodity.commodity_name,
      'is_available', coalesce(commodity.commodity_status, 'available') <> 'sold'
        and coalesce(commodity.available_quantity, 0) > 0
    ) order by commodity.created_at desc)
      filter (where commodity.commodity_id is not null), '[]'::jsonb)
  from public.farms as farm
  join public.farmers as farmer on farmer.farmer_user_id = farm.farmer_user_id
  left join public.commodities as commodity on commodity.farm_id = farm.farm_id
  where (select auth.uid()) is not null
    and lower(coalesce(farmer.verification_status, 'pending')) = 'verified'
    and lower(coalesce(farmer.account_status, 'active')) = 'active'
  group by farm.farm_id, farmer.farmer_user_id
$$;
revoke all on function private.create_buyer_checkout(bigint, text, jsonb)
  from public, anon, authenticated;
revoke all on function private.review_current_order_gcash_payment(text, boolean)
  from public, anon;
revoke all on function private.record_current_order_gcash_refund(text, text)
  from public, anon;
revoke all on function private.resubmit_current_order_gcash_reference(text, text)
  from public, anon;
revoke all on function private.current_account_payment_snapshots()
  from public, anon;
revoke all on function private.sync_current_buyer_review_snapshots(jsonb)
  from public, anon;
revoke all on function private.current_account_review_snapshots()
  from public, anon;
revoke all on function private.current_farmer_gcash_details(),
  private.save_current_farmer_gcash_details(text, text) from public, anon;
grant execute on function private.review_current_order_gcash_payment(text, boolean),
  private.record_current_order_gcash_refund(text, text),
  private.resubmit_current_order_gcash_reference(text, text),
  private.current_account_payment_snapshots(),
  private.sync_current_buyer_review_snapshots(jsonb),
  private.current_account_review_snapshots(),
  private.current_farmer_gcash_details(),
  private.save_current_farmer_gcash_details(text, text) to authenticated;
revoke all on function public.review_current_order_gcash_payment(text, boolean),
  public.record_current_order_gcash_refund(text, text),
  public.resubmit_current_order_gcash_reference(text, text),
  public.current_account_payment_snapshots(),
  public.checkout_gcash_details(bigint[]),
  public.current_farmer_gcash_details(),
  public.save_current_farmer_gcash_details(text, text),
  public.sync_current_buyer_review_snapshots(jsonb),
  public.current_account_review_snapshots(),
  public.marketplace_product_reviews(bigint) from public, anon;
grant execute on function public.review_current_order_gcash_payment(text, boolean),
  public.record_current_order_gcash_refund(text, text),
  public.resubmit_current_order_gcash_reference(text, text),
  public.current_account_payment_snapshots(),
  public.checkout_gcash_details(bigint[]),
  public.current_farmer_gcash_details(),
  public.save_current_farmer_gcash_details(text, text),
  public.sync_current_buyer_review_snapshots(jsonb),
  public.current_account_review_snapshots(),
  public.marketplace_product_reviews(bigint) to authenticated;
notify pgrst, 'reload schema';
commit;
