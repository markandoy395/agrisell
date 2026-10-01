-- Farmer Reviews & Ratings Hub RPC
-- Exposes aggregated rating summaries, star distribution counts, and review
-- records with product details, buyer names, and admin moderation notes/responses.
begin;

create or replace function public.current_farmer_reviews()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select coalesce(
      private.current_farmer_user_id(),
      private.current_authenticated_farmer_user_id()
    ) as farmer_id
  ), farmer_reviews as (
    select
      review.review_id,
      review.order_id,
      coalesce(order_record.client_order_id, 'AG-' || review.order_id::text) as client_order_id,
      review.commodity_id,
      coalesce(commodity.commodity_name, 'Agricultural Product') as commodity_name,
      commodity.image_url as commodity_image_url,
      review.rating,
      coalesce(review.comment, '') as comment,
      review.created_at,
      coalesce(
        nullif(btrim(concat_ws(' ', buyer_user.first_name,
          left(coalesce(buyer_user.last_name, ''), 1) ||
          case when buyer_user.last_name is null then '' else '.' end)), ''),
        'Verified Buyer'
      ) as buyer_name,
      moderation.visibility_status,
      moderation.report_status,
      moderation.abuse_flags,
      moderation.last_note as admin_moderation_note,
      public_response.message as admin_response,
      public_response.response_mode as admin_response_mode,
      public_response.created_at as admin_responded_at
    from public.reviews as review
    join actor on review.farmer_user_id = actor.farmer_id
    left join public.orders as order_record on order_record.order_id = review.order_id
    left join public.commodities as commodity on commodity.commodity_id = review.commodity_id
    left join public.buyers as buyer on buyer.buyer_user_id = review.buyer_user_id
    left join public.users as buyer_user on buyer_user.user_id = buyer.user_id
    left join public.admin_review_moderation as moderation
      on moderation.review_type = 'farmer'
     and moderation.review_id = review.review_id::text
    left join lateral (
      select response.message, response.response_mode, response.created_at
      from public.admin_review_responses as response
      where response.review_type = 'farmer'
        and response.review_id = review.review_id::text
      order by response.created_at desc, response.response_id desc
      limit 1
    ) as public_response on true
  ), stats as (
    select
      count(*) as total_reviews,
      coalesce(round(avg(rating), 2), 0.0) as average_rating,
      count(*) filter (where rating >= 4.5) as five_star_count,
      count(*) filter (where rating >= 3.5 and rating < 4.5) as four_star_count,
      count(*) filter (where rating >= 2.5 and rating < 3.5) as three_star_count,
      count(*) filter (where rating >= 1.5 and rating < 2.5) as two_star_count,
      count(*) filter (where rating < 1.5) as one_star_count,
      count(*) filter (where admin_moderation_note is not null) as moderated_count
    from farmer_reviews
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'average_rating', stats.average_rating,
      'total_reviews', stats.total_reviews,
      'five_star_count', stats.five_star_count,
      'four_star_count', stats.four_star_count,
      'three_star_count', stats.three_star_count,
      'two_star_count', stats.two_star_count,
      'one_star_count', stats.one_star_count,
      'moderated_count', stats.moderated_count
    ),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'review_id', r.review_id::text,
        'order_id', r.order_id,
        'client_order_id', r.client_order_id,
        'commodity_id', r.commodity_id,
        'commodity_name', r.commodity_name,
        'commodity_image_url', r.commodity_image_url,
        'rating', r.rating,
        'comment', r.comment,
        'created_at', r.created_at,
        'buyer_name', r.buyer_name,
        'visibility_status', coalesce(r.visibility_status, 'published'),
        'report_status', coalesce(r.report_status, 'none'),
        'abuse_flags', coalesce(r.abuse_flags, '{}'::text[]),
        'admin_moderation_note', r.admin_moderation_note,
        'admin_response', r.admin_response,
        'admin_response_mode', r.admin_response_mode,
        'admin_responded_at', r.admin_responded_at
      ) order by r.created_at desc)
      from farmer_reviews r
    ), '[]'::jsonb)
  )
  from stats;
$$;

revoke all on function public.current_farmer_reviews() from public, anon;
grant execute on function public.current_farmer_reviews() to authenticated;

notify pgrst, 'reload schema';

commit;
