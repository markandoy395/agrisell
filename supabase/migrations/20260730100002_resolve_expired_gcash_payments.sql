begin;
create or replace function private.review_current_order_gcash_payment(
  target_client_order_id text,
  approved boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare
  target_farmer_id bigint := private.current_farmer_user_id();
  target_buyer_id bigint;
  normalized_reference text;
  reference_count integer;
  current_payment_status text;
  expired_order boolean;
  decision text;
begin
  if target_farmer_id is null then
    raise exception 'An authenticated farmer account is required'
      using errcode = '42501';
  end if;
  if approved is null then
    raise exception 'Choose whether the GCash payment was received'
      using errcode = '22023';
  end if;

  perform private.process_order_acceptance_deadlines();
  perform 1 from public.orders as order_record
  join public.farms as farm on farm.farm_id = order_record.seller_farm_id
  where order_record.client_order_id = target_client_order_id
    and farm.farmer_user_id = target_farmer_id
  order by order_record.order_id for update of order_record;

  select bool_and(order_record.order_status = 'expired'),
    min(order_record.payment_status)
  into expired_order, current_payment_status
  from public.orders as order_record
  join public.farms as farm on farm.farm_id = order_record.seller_farm_id
  join private.seller_order_registry as registry
    on registry.seller_order_id = order_record.client_order_id
    and registry.seller_farm_id = order_record.seller_farm_id
  where order_record.client_order_id = target_client_order_id
    and farm.farmer_user_id = target_farmer_id
    and order_record.payment_method = 'gcash';

  if current_payment_status is null or not (
    (not expired_order
      and current_payment_status = 'submitted_for_verification')
    or (expired_order
      and current_payment_status = 'payment_review_required')
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
      and farm.farmer_user_id = target_farmer_id;
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

  decision := case
    when expired_order and approved then 'refund_required'
    when expired_order then 'cancelled'
    when approved then 'verified'
    else 'rejected'
  end;
  update public.orders as order_record
  set payment_status = decision, updated_at = now()
  from public.farms as farm
  where farm.farm_id = order_record.seller_farm_id
    and order_record.client_order_id = target_client_order_id
    and farm.farmer_user_id = target_farmer_id
    and order_record.payment_status = current_payment_status;
  update public.payments as payment
  set payment_status = decision,
    payment_date = case when approved then now() else null end,
    updated_at = now()
  from public.orders as order_record
  join public.farms as farm on farm.farm_id = order_record.seller_farm_id
  where payment.order_id = order_record.order_id
    and order_record.client_order_id = target_client_order_id
    and farm.farmer_user_id = target_farmer_id;

  if expired_order then
    insert into private.order_acceptance_events (
      seller_order_id, event_type, metadata
    ) values (
      target_client_order_id, 'expired_payment_reviewed',
      jsonb_build_object('payment_received', approved, 'decision', decision)
    ) on conflict do nothing;
    insert into public.notifications (
      recipient_auth_user_id, title, description, notification_type,
      category, destination, order_id, metadata
    )
    select identity.auth_user_id, 'Expired payment reviewed',
      case when approved
        then 'Your GCash payment was confirmed and now requires a refund.'
        else 'The farmer did not find the submitted payment.' end,
      'payment_update', 'orders', 'orders', min(order_record.order_id),
      jsonb_build_object('client_order_id', target_client_order_id,
        'payment_status', decision)
    from public.orders as order_record
    join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    join private.auth_identities as identity
      on identity.buyer_user_id = cart.buyer_user_id
    where order_record.client_order_id = target_client_order_id
    group by identity.auth_user_id;
  end if;
end;
$$;
revoke all on function private.review_current_order_gcash_payment(text, boolean)
  from public, anon;
grant execute on function private.review_current_order_gcash_payment(text, boolean)
  to authenticated;
commit;
