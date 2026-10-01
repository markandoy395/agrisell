begin;
create table if not exists private.delivery_cash_collections (
  delivery_id bigint primary key references public.deliveries (delivery_id)
    on delete cascade,
  rider_id uuid not null references public.riders (rider_id) on delete restrict,
  amount_expected numeric(14,2) not null check (amount_expected >= 0),
  amount_received numeric(14,2) not null check (amount_received >= 0),
  collection_confirmed boolean not null,
  issue text,
  notes text,
  recorded_at timestamptz not null default now()
);
alter table private.delivery_cash_collections enable row level security;
revoke all on private.delivery_cash_collections
  from public, anon, authenticated;
create or replace function private.complete_delivery(
  p_delivery_id bigint,
  p_previous_status text,
  p_idempotency_key text,
  p_remarks text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_cash_amount numeric default null,
  p_cash_confirmed boolean default false,
  p_cash_issue text default null,
  p_cash_notes text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_rider uuid := private.current_rider_id();
  payment_method text;
  payment_status text;
  expected_amount numeric;
  existing_collection private.delivery_cash_collections%rowtype;
begin
  if current_rider is null or not exists (
    select 1 from private.rider_delivery_assignments
    where delivery_id = p_delivery_id and rider_id = current_rider
  ) then
    raise exception 'Only the assigned rider can complete this delivery'
      using errcode = '42501';
  end if;
  perform 1 from public.deliveries
  where delivery_id = p_delivery_id for update;
  if not found then raise exception 'Delivery not found' using errcode = '22023'; end if;

  select
    (array_agg(order_record.payment_method order by order_record.order_id))[1],
    (array_agg(order_record.payment_status order by order_record.order_id))[1],
    sum(order_record.total_amount)
  into payment_method, payment_status, expected_amount
  from private.order_delivery_fulfillments as fulfillment
  join public.orders as order_record
    on order_record.client_order_id = fulfillment.seller_order_id
  join public.cart_items as cart_item
    on cart_item.cart_item_id = order_record.cart_item_id
  join public.carts as cart
    on cart.cart_id = cart_item.cart_id
    and cart.buyer_user_id = fulfillment.buyer_user_id
  where fulfillment.delivery_id = p_delivery_id;

  if payment_method = 'cash_on_delivery' then
    if not coalesce(p_cash_confirmed, false)
       or p_cash_amount is null
       or abs(p_cash_amount - coalesce(expected_amount, 0)) > 0.01
       or nullif(btrim(p_cash_issue), '') is not null then
      raise exception 'Confirm the exact cash amount before completing delivery'
        using errcode = '22023';
    end if;
    select * into existing_collection
    from private.delivery_cash_collections
    where delivery_id = p_delivery_id;
    if found and (
      existing_collection.rider_id <> current_rider
      or abs(existing_collection.amount_received - p_cash_amount) > 0.01
    ) then
      raise exception 'The cash collection was already recorded differently'
        using errcode = '40001';
    end if;
    insert into private.delivery_cash_collections (
      delivery_id, rider_id, amount_expected, amount_received,
      collection_confirmed, issue, notes
    ) values (
      p_delivery_id, current_rider, expected_amount, p_cash_amount,
      true, null, nullif(btrim(p_cash_notes), '')
    ) on conflict (delivery_id) do nothing;

    update public.orders as order_record
    set payment_status = 'verified', updated_at = now()
    from public.cart_items as cart_item
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    join private.order_delivery_fulfillments as fulfillment
      on fulfillment.buyer_user_id = cart.buyer_user_id
    where order_record.cart_item_id = cart_item.cart_item_id
      and fulfillment.delivery_id = p_delivery_id
      and order_record.client_order_id = fulfillment.seller_order_id;
    update public.payments as payment
    set payment_status = 'paid', payment_date = now(), updated_at = now()
    from public.orders as order_record
    join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    join private.order_delivery_fulfillments as fulfillment
      on fulfillment.seller_order_id = order_record.client_order_id
      and fulfillment.buyer_user_id = cart.buyer_user_id
    where payment.order_id = order_record.order_id
      and fulfillment.delivery_id = p_delivery_id;
  elsif payment_method = 'gcash'
        and payment_status is distinct from 'verified' then
    raise exception 'GCash must be verified before delivery completion'
      using errcode = '42501';
  end if;

  return private.update_delivery_status(
    p_delivery_id, p_previous_status, 'completed', p_idempotency_key,
    p_remarks, p_latitude, p_longitude
  );
end;
$$;
create or replace function public.complete_delivery(
  p_delivery_id bigint,
  p_previous_status text,
  p_idempotency_key text,
  p_remarks text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_cash_amount numeric default null,
  p_cash_confirmed boolean default false,
  p_cash_issue text default null,
  p_cash_notes text default null
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.complete_delivery(
    p_delivery_id, p_previous_status, p_idempotency_key, p_remarks,
    p_latitude, p_longitude, p_cash_amount, p_cash_confirmed,
    p_cash_issue, p_cash_notes
  )
$$;
revoke all on function private.complete_delivery(
  bigint, text, text, text, double precision, double precision,
  numeric, boolean, text, text
) from public, anon;
grant execute on function private.complete_delivery(
  bigint, text, text, text, double precision, double precision,
  numeric, boolean, text, text
) to authenticated;
revoke all on function public.complete_delivery(
  bigint, text, text, text, double precision, double precision,
  numeric, boolean, text, text
) from public, anon;
grant execute on function public.complete_delivery(
  bigint, text, text, text, double precision, double precision,
  numeric, boolean, text, text
) to authenticated;
notify pgrst, 'reload schema';
commit;
