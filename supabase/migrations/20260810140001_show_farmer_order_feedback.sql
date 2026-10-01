begin;
-- Product feedback belongs to both sides of the marketplace transaction. The
-- previous snapshot function scoped every call through current_buyer_user_id,
-- which made the same RPC return no rows for authenticated farmers.
create or replace function private.current_account_review_snapshots()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select private.current_buyer_user_id() as buyer_user_id,
      private.current_farmer_user_id() as farmer_user_id,
      (select auth.uid()) as auth_id
  ), owned_orders as (
    select order_record.client_order_id, order_record.order_id,
      cart_item.commodity_id, fulfillment.delivery_id
    from public.orders as order_record
    join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    join public.commodities as commodity
      on commodity.commodity_id = cart_item.commodity_id
    join public.farms as farm on farm.farm_id = commodity.farm_id
    cross join actor
    left join private.order_delivery_fulfillments as fulfillment
      on fulfillment.buyer_user_id = cart.buyer_user_id
      and fulfillment.seller_order_id = order_record.client_order_id
    where (actor.buyer_user_id is not null
        and cart.buyer_user_id = actor.buyer_user_id)
      or (actor.farmer_user_id is not null
        and farm.farmer_user_id = actor.farmer_user_id)
  ), snapshots as (
    select owned.client_order_id,
      max(owned.delivery_id) as delivery_id,
      coalesce(jsonb_agg(jsonb_build_object(
        'productId', owned.commodity_id::text,
        'rating', review.rating,
        'comment', coalesce(review.comment, ''),
        'submittedAt', review.created_at
      )) filter (where review.review_id is not null), '[]'::jsonb)
        as item_reviews
    from owned_orders as owned
    left join public.reviews as review on review.order_id = owned.order_id
    group by owned.client_order_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'orderId', snapshot.client_order_id,
    'deliveryId', snapshot.delivery_id,
    'riderRated', exists (
      select 1 from public.rider_ratings as rating, actor
      where rating.delivery_id = snapshot.delivery_id
        and rating.reviewer_auth_id = actor.auth_id
    ),
    'itemReviews', snapshot.item_reviews
  )), '[]'::jsonb)
  from snapshots as snapshot
$$;
create or replace function public.current_account_review_snapshots()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.current_account_review_snapshots()
$$;
revoke all on function private.current_account_review_snapshots()
  from public, anon;
grant execute on function private.current_account_review_snapshots()
  to authenticated;
revoke all on function public.current_account_review_snapshots()
  from public, anon;
grant execute on function public.current_account_review_snapshots()
  to authenticated;
notify pgrst, 'reload schema';
commit;
