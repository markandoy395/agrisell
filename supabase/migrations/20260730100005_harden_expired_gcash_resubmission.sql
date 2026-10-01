begin;
create or replace function private.resubmit_current_order_gcash_reference(
  target_client_order_id text,
  replacement_reference text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  target_buyer_id bigint := private.current_buyer_user_id();
  clean_reference text := nullif(btrim(replacement_reference), '');
begin
  if target_buyer_id is null then
    raise exception 'An authenticated buyer account is required'
      using errcode = '42501';
  end if;
  if clean_reference is null or length(clean_reference) not between 6 and 40
     or clean_reference !~ '^[A-Za-z0-9 _-]+$' then
    raise exception 'Enter a valid GCash reference number'
      using errcode = '22023';
  end if;

  perform private.process_order_acceptance_deadlines();
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_buyer_id::text || ':' || target_client_order_id, 0
    )
  );
  perform 1 from public.orders as order_record
  join public.cart_items as cart_item
    on cart_item.cart_item_id = order_record.cart_item_id
  join public.carts as cart on cart.cart_id = cart_item.cart_id
  where order_record.client_order_id = target_client_order_id
    and cart.buyer_user_id = target_buyer_id
  order by order_record.order_id for update of order_record;

  if not exists (
    select 1 from public.orders as order_record
    join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    where order_record.client_order_id = target_client_order_id
      and cart.buyer_user_id = target_buyer_id
      and order_record.order_status = 'toShip'
      and order_record.acceptance_expires_at > now()
      and order_record.payment_method = 'gcash'
      and order_record.payment_status = 'rejected'
  ) then
    raise exception 'This order can no longer accept a new GCash reference'
      using errcode = '22023';
  end if;

  update public.orders as order_record
  set payment_status = 'submitted_for_verification', updated_at = now()
  from public.cart_items as cart_item
  join public.carts as cart on cart.cart_id = cart_item.cart_id
  where order_record.cart_item_id = cart_item.cart_item_id
    and order_record.client_order_id = target_client_order_id
    and cart.buyer_user_id = target_buyer_id
    and order_record.order_status = 'toShip'
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
    and cart.buyer_user_id = target_buyer_id
    and order_record.order_status = 'toShip'
    and order_record.payment_status = 'submitted_for_verification';
end;
$$;
revoke all on function private.resubmit_current_order_gcash_reference(text, text)
  from public, anon;
grant execute on function private.resubmit_current_order_gcash_reference(text, text)
  to authenticated;
commit;
