begin;

create or replace function public.admin_complete_delivery(p_input jsonb, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  result jsonb;
  delivery_key bigint;
  completed_at timestamptz := now();
begin
  perform set_config('app.admin_delivery_completion_override','on',true);
  result := public.admin_complete_delivery_guarded(p_input,p_actor);
  delivery_key := (result->>'delivery_id')::bigint;

  update public.orders as order_record
  set order_status='delivered',
      delivery_date=coalesce(order_record.delivery_date,completed_at::date),
      updated_at=completed_at
  from public.deliveries as delivery
  where delivery.delivery_id=delivery_key
    and delivery.delivery_status in ('completed','delivered')
    and order_record.order_status not in ('cancelled','refunded')
    and (
      order_record.order_id=delivery.order_id
      or exists (
        select 1
        from private.order_delivery_fulfillments fulfillment
        join public.cart_items cart_item on true
        join public.carts cart on cart.cart_id=cart_item.cart_id
        where fulfillment.delivery_id=delivery.delivery_id
          and fulfillment.seller_order_id=order_record.client_order_id
          and fulfillment.buyer_user_id=cart.buyer_user_id
          and order_record.cart_item_id=cart_item.cart_item_id
      )
    );
  return result;
end;
$$;
revoke all on function public.admin_complete_delivery(jsonb,text) from public,anon,authenticated;
grant execute on function public.admin_complete_delivery(jsonb,text) to service_role;

-- Repair orders left in an active state by admin completions made before this fix.
update public.orders as order_record
set order_status='delivered',
    delivery_date=coalesce(order_record.delivery_date,delivery.actual_delivery_time::date,current_date),
    updated_at=now()
from public.deliveries as delivery
where delivery.delivery_status in ('completed','delivered')
  and order_record.order_status not in ('delivered','completed','cancelled','refunded')
  and (
    order_record.order_id=delivery.order_id
    or exists (
      select 1
      from private.order_delivery_fulfillments fulfillment
      join public.cart_items cart_item on true
      join public.carts cart on cart.cart_id=cart_item.cart_id
      where fulfillment.delivery_id=delivery.delivery_id
        and fulfillment.seller_order_id=order_record.client_order_id
        and fulfillment.buyer_user_id=cart.buyer_user_id
        and order_record.cart_item_id=cart_item.cart_item_id
    )
  );

notify pgrst, 'reload schema';
commit;
