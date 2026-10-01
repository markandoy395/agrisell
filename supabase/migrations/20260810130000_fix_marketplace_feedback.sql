begin;
alter table public.reviews
  add column if not exists buyer_user_id bigint references public.buyers(buyer_user_id),
  add column if not exists commodity_id bigint references public.commodities(commodity_id),
  add column if not exists farmer_user_id bigint references public.farmers(farmer_user_id),
  add column if not exists order_item_id bigint references public.order_items(order_item_id);
update public.reviews as review
set buyer_user_id = linked.buyer_user_id,
    commodity_id = linked.commodity_id,
    farmer_user_id = linked.farmer_user_id,
    order_item_id = linked.order_item_id
from (
  select order_record.order_id, cart.buyer_user_id, cart_item.commodity_id,
    farm.farmer_user_id,
    (array_agg(order_item.order_item_id order by order_item.order_item_id))[1]
      as order_item_id
  from public.orders as order_record
  join public.cart_items as cart_item
    on cart_item.cart_item_id = order_record.cart_item_id
  join public.carts as cart on cart.cart_id = cart_item.cart_id
  join public.commodities as commodity
    on commodity.commodity_id = cart_item.commodity_id
  join public.farms as farm on farm.farm_id = commodity.farm_id
  join public.order_items as order_item on order_item.order_id = order_record.order_id
  group by order_record.order_id, cart.buyer_user_id, cart_item.commodity_id,
    farm.farmer_user_id
) as linked
where linked.order_id = review.order_id;
alter table public.reviews
  alter column buyer_user_id set not null,
  alter column commodity_id set not null,
  alter column farmer_user_id set not null,
  alter column order_item_id set not null;
create unique index if not exists reviews_order_item_id_key
  on public.reviews(order_item_id);
-- Reviews are no longer inferred from mutable client order snapshots. All new
-- submissions go through the relationship-checked transaction below.
create or replace function private.sync_current_buyer_review_snapshots(
  order_payload jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.current_buyer_user_id() is null then
    raise exception 'Only buyers can submit product feedback'
      using errcode = '42501';
  end if;
end;
$$;
create or replace function public.submit_current_buyer_feedback(
  p_client_order_id text,
  p_commodity_id bigint,
  p_product_rating integer default null,
  p_product_comment text default null,
  p_rider_rating integer default null,
  p_rider_comment text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_buyer_id bigint := private.current_buyer_user_id();
  purchased_order_id bigint;
  purchased_order_item_id bigint;
  seller_farmer_id bigint;
  target_delivery_id bigint;
  target_rider_id uuid;
  saved_product_review_id bigint;
  saved_rider_rating_id uuid;
begin
  if actor_buyer_id is null then
    raise exception 'Only the buyer who placed the order can submit feedback'
      using errcode = '42501';
  end if;
  if p_product_rating is null and p_rider_rating is null then
    raise exception 'Choose a product or rider rating' using errcode = '22023';
  end if;
  if p_product_rating is not null and p_product_rating not between 1 and 5 then
    raise exception 'Product rating must be between 1 and 5' using errcode = '22023';
  end if;
  if p_rider_rating is not null and p_rider_rating not between 1 and 5 then
    raise exception 'Rider rating must be between 1 and 5' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_product_comment, ''))) > 500
     or length(btrim(coalesce(p_rider_comment, ''))) > 500 then
    raise exception 'Review comments must be at most 500 characters'
      using errcode = '22023';
  end if;

  select order_record.order_id, order_item.order_item_id, farm.farmer_user_id
  into purchased_order_id, purchased_order_item_id, seller_farmer_id
  from public.orders as order_record
  join public.cart_items as cart_item
    on cart_item.cart_item_id = order_record.cart_item_id
  join public.carts as cart on cart.cart_id = cart_item.cart_id
  join public.commodities as commodity
    on commodity.commodity_id = cart_item.commodity_id
  join public.farms as farm on farm.farm_id = commodity.farm_id
  join public.order_items as order_item on order_item.order_id = order_record.order_id
  where order_record.client_order_id = btrim(p_client_order_id)
    and cart_item.commodity_id = p_commodity_id
    and cart.buyer_user_id = actor_buyer_id
    and lower(order_record.order_status) in ('delivered', 'completed')
  order by order_item.order_item_id
  limit 1;

  if purchased_order_id is null then
    raise exception 'Only a delivered product you purchased can be reviewed'
      using errcode = '42501';
  end if;

  select fulfillment.delivery_id, assignment.rider_id
  into target_delivery_id, target_rider_id
  from private.order_delivery_fulfillments as fulfillment
  join public.deliveries as delivery on delivery.delivery_id = fulfillment.delivery_id
  join private.rider_delivery_assignments as assignment
    on assignment.delivery_id = fulfillment.delivery_id
  where fulfillment.buyer_user_id = actor_buyer_id
    and fulfillment.seller_order_id = btrim(p_client_order_id)
    and delivery.delivery_status in ('completed', 'delivered')
  limit 1;

  if target_delivery_id is null then
    raise exception 'Feedback requires a completed delivery' using errcode = '42501';
  end if;

  if p_product_rating is not null then
    if exists (
      select 1 from public.reviews as existing
      where existing.order_item_id = purchased_order_item_id
         or existing.order_id = purchased_order_id
    ) then
      raise exception 'This purchased item has already been reviewed'
        using errcode = '23505';
    end if;
    insert into public.reviews(
      order_id, order_item_id, buyer_user_id, commodity_id, farmer_user_id,
      rating, comment
    ) values (
      purchased_order_id, purchased_order_item_id, actor_buyer_id,
      p_commodity_id, seller_farmer_id, p_product_rating,
      nullif(btrim(coalesce(p_product_comment, '')), '')
    ) returning review_id into saved_product_review_id;
    update public.orders set is_rated = true, updated_at = now()
    where order_id = purchased_order_id;
  end if;

  if p_rider_rating is not null then
    if exists (
      select 1 from public.rider_ratings
      where delivery_id = target_delivery_id
        and reviewer_auth_id = (select auth.uid())
    ) then
      raise exception 'You have already rated this delivery'
        using errcode = '23505';
    end if;
    insert into public.rider_ratings(
      delivery_id, rider_id, reviewer_auth_id, reviewer_role, rating, comment
    ) values (
      target_delivery_id, target_rider_id, (select auth.uid()), 'buyer',
      p_rider_rating, nullif(btrim(coalesce(p_rider_comment, '')), '')
    ) returning rating_id into saved_rider_rating_id;
    update public.riders set rating = (
      select round(avg(rating), 2) from public.rider_ratings
      where rider_id = target_rider_id
    ) where rider_id = target_rider_id;
  end if;

  return jsonb_build_object(
    'productReviewId', saved_product_review_id,
    'riderRatingId', saved_rider_rating_id,
    'deliveryId', target_delivery_id
  );
end;
$$;
create or replace function private.current_account_review_snapshots()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select private.current_buyer_user_id() as buyer_user_id,
      (select auth.uid()) as auth_id
  ), owned_orders as (
    select order_record.client_order_id, order_record.order_id,
      cart_item.commodity_id, fulfillment.delivery_id
    from public.orders as order_record
    join public.cart_items as cart_item
      on cart_item.cart_item_id = order_record.cart_item_id
    join public.carts as cart on cart.cart_id = cart_item.cart_id
    join actor on actor.buyer_user_id = cart.buyer_user_id
    left join private.order_delivery_fulfillments as fulfillment
      on fulfillment.buyer_user_id = cart.buyer_user_id
      and fulfillment.seller_order_id = order_record.client_order_id
  ), snapshots as (
    select owned.client_order_id,
      max(owned.delivery_id) as delivery_id,
      coalesce(jsonb_agg(jsonb_build_object(
        'productId', owned.commodity_id::text,
        'rating', review.rating,
        'comment', coalesce(review.comment, ''),
        'submittedAt', review.created_at
      )) filter (where review.review_id is not null), '[]'::jsonb) as item_reviews
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
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.current_account_review_snapshots()
$$;
revoke all on function public.submit_current_buyer_feedback(
  text, bigint, integer, text, integer, text
) from public, anon;
grant execute on function public.submit_current_buyer_feedback(
  text, bigint, integer, text, integer, text
) to authenticated;
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
