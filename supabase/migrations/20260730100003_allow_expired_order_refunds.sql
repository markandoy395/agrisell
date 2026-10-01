begin;
create or replace function private.record_current_order_gcash_refund(
  target_client_order_id text,
  refund_transaction_reference text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  target_farmer_id bigint := private.current_farmer_user_id();
  clean_reference text := nullif(btrim(refund_transaction_reference), '');
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
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'refund:' || target_client_order_id, 0
    )
  );
  perform 1 from public.orders as order_record
  where order_record.client_order_id = target_client_order_id
  order by order_record.order_id for update;
  if not exists (
    select 1 from public.orders as order_record
    join public.farms as farm on farm.farm_id = order_record.seller_farm_id
    join private.seller_order_registry as registry
      on registry.seller_order_id = order_record.client_order_id
      and registry.seller_farm_id = order_record.seller_farm_id
    where order_record.client_order_id = target_client_order_id
      and farm.farmer_user_id = target_farmer_id
      and order_record.order_status in ('cancelled', 'expired')
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
    and order_record.payment_status = 'refund_required';
  update public.payments as payment
  set payment_status = 'refunded', refund_reference = clean_reference,
    refunded_at = now(), updated_at = now()
  from public.orders as order_record
  join public.farms as farm on farm.farm_id = order_record.seller_farm_id
  where payment.order_id = order_record.order_id
    and order_record.client_order_id = target_client_order_id
    and farm.farmer_user_id = target_farmer_id;
  insert into private.order_acceptance_events (
    seller_order_id, event_type, metadata
  ) values (
    target_client_order_id, 'refunded',
    jsonb_build_object('refund_reference', clean_reference)
  ) on conflict do nothing;
  insert into public.notifications (
    recipient_auth_user_id, title, description, notification_type,
    category, destination, order_id, metadata
  )
  select identity.auth_user_id, 'GCash refund completed',
    'The farmer recorded the refund for your cancelled or expired order.',
    'payment_update', 'orders', 'orders', min(order_record.order_id),
    jsonb_build_object('client_order_id', target_client_order_id,
      'payment_status', 'refunded')
  from public.orders as order_record
  join public.cart_items as cart_item
    on cart_item.cart_item_id = order_record.cart_item_id
  join public.carts as cart on cart.cart_id = cart_item.cart_id
  join private.auth_identities as identity
    on identity.buyer_user_id = cart.buyer_user_id
  where order_record.client_order_id = target_client_order_id
  group by identity.auth_user_id;
end;
$$;
revoke all on function private.record_current_order_gcash_refund(text, text)
  from public, anon;
grant execute on function private.record_current_order_gcash_refund(text, text)
  to authenticated;
commit;
