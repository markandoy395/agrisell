begin;
alter table public.notifications
  add column if not exists notification_type text not null
    default 'verification_update',
  add column if not exists category text not null default 'system',
  add column if not exists destination text not null default 'products',
  add column if not exists order_id bigint references public.orders(order_id),
  add column if not exists metadata jsonb not null default '{}'::jsonb;
create index if not exists notifications_order_id_idx
  on public.notifications (order_id)
  where order_id is not null;
create or replace function private.notify_farmer_new_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
  product_name text;
  product_quantity numeric;
begin
  select
    farmer.auth_user_id,
    coalesce(commodity.commodity_name, 'product'),
    cart_item.quantity
  into recipient_id, product_name, product_quantity
  from public.cart_items as cart_item
  join public.commodities as commodity
    on commodity.commodity_id = cart_item.commodity_id
  join public.farms as farm on farm.farm_id = commodity.farm_id
  join public.farmers as farmer
    on farmer.farmer_user_id = farm.farmer_user_id
  where cart_item.cart_item_id = new.cart_item_id;

  if recipient_id is null then
    return new;
  end if;

  insert into public.notifications (
    recipient_auth_user_id,
    title,
    description,
    notification_type,
    category,
    destination,
    order_id,
    metadata
  ) values (
    recipient_id,
    'New order received',
    format(
      'A buyer ordered %s of %s. Review and accept the order.',
      product_quantity,
      product_name
    ),
    'new_order',
    'orders',
    'orders',
    new.order_id,
    jsonb_build_object(
      'client_order_id', new.client_order_id,
      'order_status', new.order_status
    )
  );
  return new;
end;
$$;
drop trigger if exists orders_notify_farmer_after_insert on public.orders;
create trigger orders_notify_farmer_after_insert
after insert on public.orders
for each row execute function private.notify_farmer_new_order();
create or replace function private.notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
  notification_title text;
  notification_description text;
  notification_kind text;
begin
  if new.order_status is not distinct from old.order_status then
    return new;
  end if;

  if new.order_status in ('cancelled', 'delivered') then
    select farmer.auth_user_id into recipient_id
    from public.cart_items as cart_item
    join public.commodities as commodity
      on commodity.commodity_id = cart_item.commodity_id
    join public.farms as farm on farm.farm_id = commodity.farm_id
    join public.farmers as farmer
      on farmer.farmer_user_id = farm.farmer_user_id
    where cart_item.cart_item_id = new.cart_item_id;
  else
    select identity.auth_user_id into recipient_id
    from public.cart_items as cart_item
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    join private.auth_identities as identity
      on identity.buyer_user_id = cart.buyer_user_id
    where cart_item.cart_item_id = new.cart_item_id;
  end if;

  if recipient_id is null then
    return new;
  end if;

  select
    case new.order_status
      when 'preparing' then 'Order accepted'
      when 'readyForPickup' then 'Order ready for pickup'
      when 'shipping' then 'Order is with the rider'
      when 'delivered' then 'Order delivered'
      when 'cancelled' then 'Order cancelled'
      else 'Order updated'
    end,
    case new.order_status
      when 'preparing' then 'The farmer accepted your order and is preparing it.'
      when 'readyForPickup' then 'The farmer finished preparing your order.'
      when 'shipping' then 'The rider picked up your order.'
      when 'delivered' then 'The buyer confirmed that the order was delivered.'
      when 'cancelled' then 'The buyer cancelled this order.'
      else format('The order status changed to %s.', new.order_status)
    end,
    case new.order_status
      when 'preparing' then 'order_accepted'
      when 'readyForPickup' then 'order_ready'
      when 'shipping' then 'order_shipping'
      when 'delivered' then 'order_delivered'
      when 'cancelled' then 'order_cancelled'
      else 'order_updated'
    end
  into notification_title, notification_description, notification_kind;

  insert into public.notifications (
    recipient_auth_user_id,
    title,
    description,
    notification_type,
    category,
    destination,
    order_id,
    metadata
  ) values (
    recipient_id,
    notification_title,
    notification_description,
    notification_kind,
    'orders',
    'orders',
    new.order_id,
    jsonb_build_object(
      'client_order_id', new.client_order_id,
      'previous_status', old.order_status,
      'order_status', new.order_status
    )
  );
  return new;
end;
$$;
drop trigger if exists orders_notify_status_after_update on public.orders;
create trigger orders_notify_status_after_update
after update of order_status on public.orders
for each row execute function private.notify_order_status_change();
revoke all on function private.notify_farmer_new_order() from public, anon;
revoke all on function private.notify_order_status_change() from public, anon;
notify pgrst, 'reload schema';
commit;
