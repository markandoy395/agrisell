begin;
create extension if not exists pg_cron;
create or replace function private.process_order_acceptance_deadlines()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  candidate record;
  released record;
  deadline timestamptz;
  first_order_id bigint;
  expiry_payment_status text;
  buyer_auth_id uuid;
  farmer_auth_id uuid;
  expired_count integer := 0;
begin
  for candidate in
    select registry.seller_order_id, registry.buyer_user_id,
      registry.seller_farm_id
    from private.seller_order_registry as registry
    where exists (
      select 1 from public.orders as pending_order
      where pending_order.client_order_id = registry.seller_order_id
        and pending_order.order_status = 'toShip'
        and pending_order.acceptance_expires_at <= now()
    )
    order by registry.seller_order_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        candidate.buyer_user_id::text || ':' || candidate.seller_order_id, 0
      )
    );
    perform 1 from public.orders as locked_order
    where locked_order.client_order_id = candidate.seller_order_id
    order by locked_order.order_id for update;

    if not found or exists (
      select 1 from public.orders as changed_order
      where changed_order.client_order_id = candidate.seller_order_id
        and changed_order.order_status <> 'toShip'
    ) then
      continue;
    end if;

    select min(order_record.acceptance_expires_at),
      min(order_record.order_id),
      case
        when bool_or(
          order_record.payment_method = 'gcash'
          and order_record.payment_status = 'verified'
        ) then 'refund_required'
        when bool_or(
          order_record.payment_method = 'gcash'
          and order_record.payment_status = 'submitted_for_verification'
        ) then 'payment_review_required'
        else 'cancelled'
      end
    into deadline, first_order_id, expiry_payment_status
    from public.orders as order_record
    where order_record.client_order_id = candidate.seller_order_id;

    select buyer_identity.auth_user_id, farmer.auth_user_id
    into buyer_auth_id, farmer_auth_id
    from private.seller_order_registry as registry
    join private.auth_identities as buyer_identity
      on buyer_identity.buyer_user_id = registry.buyer_user_id
    join public.farms as farm on farm.farm_id = registry.seller_farm_id
    join public.farmers as farmer
      on farmer.farmer_user_id = farm.farmer_user_id
    where registry.seller_order_id = candidate.seller_order_id;

    for released in
      select cart_item.commodity_id, sum(cart_item.quantity) as quantity
      from public.orders as order_record
      join public.cart_items as cart_item
        on cart_item.cart_item_id = order_record.cart_item_id
      where order_record.client_order_id = candidate.seller_order_id
        and order_record.stock_reserved_at is not null
        and order_record.stock_released_at is null
      group by cart_item.commodity_id order by cart_item.commodity_id
    loop
      update public.commodities
      set available_quantity = available_quantity + released.quantity
      where commodity_id = released.commodity_id;
    end loop;

    update public.orders set order_status = 'expired',
      payment_status = expiry_payment_status,
      stock_released_at = case when stock_reserved_at is not null
        then coalesce(stock_released_at, now()) else stock_released_at end,
      acceptance_expired_at = coalesce(acceptance_expired_at, now()),
      updated_at = now()
    where client_order_id = candidate.seller_order_id
      and order_status = 'toShip';

    update public.payments as payment
    set payment_status = expiry_payment_status, updated_at = now()
    from public.orders as order_record
    where payment.order_id = order_record.order_id
      and order_record.client_order_id = candidate.seller_order_id;

    insert into private.order_acceptance_events (
      seller_order_id, event_type, metadata
    ) values (
      candidate.seller_order_id, 'expired',
      jsonb_build_object('acceptance_expires_at', deadline,
        'payment_status', expiry_payment_status)
    ) on conflict do nothing;

    if buyer_auth_id is not null then
      insert into public.notifications (
        recipient_auth_user_id, title, description, notification_type,
        category, destination, order_id, metadata
      ) values (
        buyer_auth_id, 'Order expired',
        'The farmer did not accept in time. Reserved stock was released.',
        'order_expired', 'orders', 'orders', first_order_id,
        jsonb_build_object('client_order_id', candidate.seller_order_id,
          'payment_status', expiry_payment_status)
      );
    end if;
    if farmer_auth_id is not null then
      insert into public.notifications (
        recipient_auth_user_id, title, description, notification_type,
        category, destination, order_id, metadata
      ) values (
        farmer_auth_id, 'Order expired',
        'The acceptance deadline passed and reserved stock was released.',
        'order_expired', 'orders', 'orders', first_order_id,
        jsonb_build_object('client_order_id', candidate.seller_order_id,
          'payment_status', expiry_payment_status)
      );
    end if;
    expired_count := expired_count + 1;
  end loop;
  return jsonb_build_object('expired', expired_count);
end;
$$;
revoke all on function private.process_order_acceptance_deadlines()
  from public, anon, authenticated;
select cron.schedule(
  'agrisell-order-acceptance-expiration',
  '*/5 * * * *',
  'select private.process_order_acceptance_deadlines()'
);
commit;
