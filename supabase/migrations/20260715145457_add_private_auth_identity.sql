begin;
create schema private;
revoke all on schema private from public;
create table private.auth_identities (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  user_id bigint not null unique references public.users (user_id) on delete restrict,
  buyer_user_id bigint unique references public.buyers (buyer_user_id) on delete restrict,
  farmer_user_id bigint unique references public.farmers (farmer_user_id) on delete restrict,
  rider_id bigint unique references public.riders (rider_id) on delete restrict,
  created_at timestamptz not null default now()
);
create table private.rider_delivery_assignments (
  delivery_id bigint primary key references public.deliveries (delivery_id) on delete restrict,
  rider_id bigint not null references public.riders (rider_id) on delete restrict,
  assigned_at timestamptz not null default now()
);
create index auth_identities_buyer_user_id_idx on private.auth_identities (buyer_user_id);
create index auth_identities_farmer_user_id_idx on private.auth_identities (farmer_user_id);
create index auth_identities_rider_id_idx on private.auth_identities (rider_id);
create index rider_delivery_assignments_rider_id_idx on private.rider_delivery_assignments (rider_id);
create index carts_buyer_user_id_idx on public.carts (buyer_user_id);
create index cart_items_cart_id_idx on public.cart_items (cart_id);
create index cart_items_commodity_id_idx on public.cart_items (commodity_id);
create index orders_cart_item_id_idx on public.orders (cart_item_id);
create index order_items_order_id_idx on public.order_items (order_id);
create index payments_order_id_idx on public.payments (order_id);
create index deliveries_order_id_idx on public.deliveries (order_id);
create index commodities_category_farm_id_idx on public.commodities (category_id, farm_id);
create index farms_farmer_user_id_idx on public.farms (farmer_user_id);
alter table private.auth_identities enable row level security;
alter table private.rider_delivery_assignments enable row level security;
revoke all on all tables in schema private from public;
create function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare new_user_id bigint;
begin
  insert into public.users (first_name, last_name, email, account_status)
  values (
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', ''), new.email, 'active'
  ) returning user_id into new_user_id;
  insert into private.auth_identities (auth_user_id, user_id)
  values (new.id, new_user_id);
  return new;
end;
$$;
create trigger on_auth_user_created
after insert on auth.users for each row execute function private.handle_new_auth_user();
create function private.current_user_id()
returns bigint language sql stable security definer set search_path = '' as $$
  select identity.user_id from private.auth_identities as identity
  where identity.auth_user_id = (select auth.uid())
$$;
create function private.current_buyer_user_id()
returns bigint language sql stable security definer set search_path = '' as $$
  select identity.buyer_user_id from private.auth_identities as identity
  where identity.auth_user_id = (select auth.uid())
$$;
create function private.current_farmer_user_id()
returns bigint language sql stable security definer set search_path = '' as $$
  select identity.farmer_user_id from private.auth_identities as identity
  where identity.auth_user_id = (select auth.uid())
$$;
create function private.current_rider_id()
returns bigint language sql stable security definer set search_path = '' as $$
  select identity.rider_id from private.auth_identities as identity
  where identity.auth_user_id = (select auth.uid())
$$;
create function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.auth_identities as identity
    join public.admins as admin on admin.user_id = identity.user_id
    where identity.auth_user_id = (select auth.uid())
  )
$$;
create function private.owns_farm(target_farm_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.farms as farm
    where farm.farm_id = target_farm_id
      and farm.farmer_user_id = private.current_farmer_user_id()
  )
$$;
create function private.owns_category(target_category_id bigint, target_farm_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.categories as category
    where category.category_id = target_category_id
      and category.farm_id = target_farm_id
      and private.owns_farm(category.farm_id)
  )
$$;
create function private.owns_cart(target_cart_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.carts as cart
    where cart.cart_id = target_cart_id
      and cart.buyer_user_id = private.current_buyer_user_id()
  )
$$;
create function private.owns_order(target_order_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders as order_record
    join public.cart_items as cart_item on cart_item.cart_item_id = order_record.cart_item_id
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    join public.commodities as commodity on commodity.commodity_id = cart_item.commodity_id
    join public.farms as farm on farm.farm_id = commodity.farm_id
    where order_record.order_id = target_order_id
      and (
        cart.buyer_user_id = private.current_buyer_user_id()
        or farm.farmer_user_id = private.current_farmer_user_id()
      )
  )
$$;
create function private.can_access_delivery(target_delivery_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.deliveries as delivery
    where delivery.delivery_id = target_delivery_id
      and private.owns_order(delivery.order_id)
  ) or exists (
    select 1 from private.rider_delivery_assignments as assignment
    where assignment.delivery_id = target_delivery_id
      and assignment.rider_id = private.current_rider_id()
  )
$$;
create function private.can_access_payment(target_payment_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.payments as payment
    where payment.payment_id = target_payment_id
      and private.owns_order(payment.order_id)
  ) or exists (
    select 1 from public.payments as payment
    join public.deliveries as delivery on delivery.order_id = payment.order_id
    join private.rider_delivery_assignments as assignment
      on assignment.delivery_id = delivery.delivery_id
    where payment.payment_id = target_payment_id
      and assignment.rider_id = private.current_rider_id()
  )
$$;
revoke all on all functions in schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.current_user_id() to authenticated;
grant execute on function private.current_buyer_user_id() to authenticated;
grant execute on function private.current_farmer_user_id() to authenticated;
grant execute on function private.current_rider_id() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.owns_farm(bigint) to authenticated;
grant execute on function private.owns_category(bigint, bigint) to authenticated;
grant execute on function private.owns_cart(bigint) to authenticated;
grant execute on function private.owns_order(bigint) to authenticated;
grant execute on function private.can_access_delivery(bigint) to authenticated;
grant execute on function private.can_access_payment(bigint) to authenticated;
commit;
