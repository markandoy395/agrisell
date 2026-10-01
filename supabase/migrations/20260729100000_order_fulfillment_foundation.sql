begin;
alter table public.orders
  add column if not exists checkout_reference text,
  add column if not exists seller_farm_id bigint,
  add column if not exists delivery_latitude double precision,
  add column if not exists delivery_longitude double precision,
  add column if not exists stock_reserved_at timestamptz,
  add column if not exists stock_released_at timestamptz;
update public.orders as order_record
set
  checkout_reference = coalesce(
    order_record.checkout_reference,
    order_record.client_order_id,
    'DB-' || order_record.order_id
  ),
  seller_farm_id = commodity.farm_id
from public.cart_items as cart_item
join public.commodities as commodity
  on commodity.commodity_id = cart_item.commodity_id
where order_record.cart_item_id = cart_item.cart_item_id;
update public.orders
set client_order_id = checkout_reference || '-F' || seller_farm_id
where checkout_reference is not null
  and seller_farm_id is not null
  and client_order_id is distinct from
    checkout_reference || '-F' || seller_farm_id;
with order_owners as (
  select order_record.client_order_id, cart.buyer_user_id,
    order_record.seller_farm_id, min(order_record.order_id) as first_order_id
  from public.orders as order_record
  join public.cart_items as cart_item
    on cart_item.cart_item_id = order_record.cart_item_id
  join public.carts as cart on cart.cart_id = cart_item.cart_id
  group by order_record.client_order_id, cart.buyer_user_id,
    order_record.seller_farm_id
), colliding_ids as (
  select client_order_id from order_owners
  group by client_order_id having count(*) > 1
), collision_map as (
  select owner.client_order_id, owner.buyer_user_id, owner.seller_farm_id,
    owner.client_order_id || '-B' || owner.buyer_user_id ||
      '-O' || owner.first_order_id as safe_order_id
  from order_owners as owner
  join colliding_ids as collision using (client_order_id)
)
update public.orders as order_record
set client_order_id = mapping.safe_order_id
from public.cart_items as cart_item
join public.carts as cart on cart.cart_id = cart_item.cart_id
join collision_map as mapping
  on mapping.buyer_user_id = cart.buyer_user_id
where order_record.cart_item_id = cart_item.cart_item_id
  and order_record.client_order_id = mapping.client_order_id
  and order_record.seller_farm_id = mapping.seller_farm_id;
alter table public.orders
  alter column checkout_reference set not null,
  alter column seller_farm_id set not null;
alter table public.orders
  drop constraint if exists orders_delivery_latitude_check,
  drop constraint if exists orders_delivery_longitude_check;
alter table public.orders
  add constraint orders_delivery_latitude_check check (
    delivery_latitude is null or delivery_latitude between -90 and 90
  ),
  add constraint orders_delivery_longitude_check check (
    delivery_longitude is null or delivery_longitude between -180 and 180
  );
alter table public.orders
  drop constraint if exists orders_seller_farm_fk;
alter table public.orders
  add constraint orders_seller_farm_fk foreign key (seller_farm_id)
  references public.farms (farm_id) on update restrict on delete restrict;
create index if not exists orders_checkout_reference_idx
  on public.orders (checkout_reference);
create index if not exists orders_seller_order_idx
  on public.orders (seller_farm_id, client_order_id);
create table if not exists private.seller_order_registry (
  seller_order_id text primary key,
  buyer_user_id bigint not null references public.buyers (buyer_user_id),
  seller_farm_id bigint not null references public.farms (farm_id),
  checkout_reference text not null,
  created_at timestamptz not null default now()
);
insert into private.seller_order_registry (
  seller_order_id, buyer_user_id, seller_farm_id, checkout_reference
)
select distinct order_record.client_order_id, cart.buyer_user_id,
  order_record.seller_farm_id, order_record.checkout_reference
from public.orders as order_record
join public.cart_items as cart_item
  on cart_item.cart_item_id = order_record.cart_item_id
join public.carts as cart on cart.cart_id = cart_item.cart_id
on conflict do nothing;
do $$
begin
  if exists (
    select 1 from public.orders as order_record
    join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    left join private.seller_order_registry as registry
      on registry.seller_order_id = order_record.client_order_id
      and registry.buyer_user_id = cart.buyer_user_id
      and registry.seller_farm_id = order_record.seller_farm_id
      and registry.checkout_reference = order_record.checkout_reference
    where registry.seller_order_id is null
  ) then
    raise exception 'Existing seller order identifiers could not be owned safely';
  end if;
end;
$$;
create table if not exists private.order_checkout_keys (
  buyer_user_id bigint not null references public.buyers (buyer_user_id),
  request_id text not null,
  created_at timestamptz not null default now(),
  primary key (buyer_user_id, request_id)
);
insert into private.order_checkout_keys (buyer_user_id, request_id)
select distinct cart.buyer_user_id, order_record.checkout_reference
from public.orders as order_record
join public.cart_items as cart_item
  on cart_item.cart_item_id = order_record.cart_item_id
join public.carts as cart on cart.cart_id = cart_item.cart_id
on conflict do nothing;
create table if not exists private.order_delivery_fulfillments (
  fulfillment_id bigint generated by default as identity primary key,
  buyer_user_id bigint not null references public.buyers (buyer_user_id),
  seller_order_id text not null,
  representative_order_id bigint not null unique
    references public.orders (order_id) on delete cascade,
  delivery_id bigint not null unique
    references public.deliveries (delivery_id) on delete cascade,
  pickup_lat double precision not null check (pickup_lat between -90 and 90),
  pickup_long double precision not null check (pickup_long between -180 and 180),
  dropoff_lat double precision not null check (dropoff_lat between -90 and 90),
  dropoff_long double precision not null check (dropoff_long between -180 and 180),
  pickup_contact text,
  dropoff_contact text,
  total_weight_kg numeric not null check (total_weight_kg > 0),
  required_vehicle_type text not null,
  handling_notes text,
  ready_at timestamptz not null default now(),
  unique (buyer_user_id, seller_order_id)
);
create table if not exists private.delivery_status_events (
  delivery_id bigint not null references public.deliveries (delivery_id)
    on delete cascade,
  idempotency_key text not null,
  previous_status text,
  new_status text not null,
  remarks text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  changed_at timestamptz not null default now(),
  primary key (delivery_id, idempotency_key)
);
alter table private.order_checkout_keys enable row level security;
alter table private.seller_order_registry enable row level security;
alter table private.order_delivery_fulfillments enable row level security;
alter table private.delivery_status_events enable row level security;
revoke all on private.order_checkout_keys from public, anon, authenticated;
revoke all on private.seller_order_registry from public, anon, authenticated;
revoke all on private.order_delivery_fulfillments from public, anon, authenticated;
revoke all on private.delivery_status_events from public, anon, authenticated;
commit;
